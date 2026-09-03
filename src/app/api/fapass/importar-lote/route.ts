export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { randomUUID } from "crypto";

// ─── Formato "Lote" ───────────────────────────────────────────────────────────
// Ponte temporária enquanto a query oficial ("Base CAR Passaporte BC", ver
// /api/fapass/importar) está com valor incorreto e o Weriton corrige na fonte.
// Formato diferente: já vem filtrado/curado manualmente, com Faixa e Consultor
// já definidos (ex: planilha "INAD PASS SETEMBRO.xlsx"). Detecção por nome de
// coluna, não por índice fixo, já que não é a mesma query.
//
// Colunas esperadas (cabeçalho): Passaporte, Fornecedor, Vencimento, Tipo,
// Valor, Status, TiposBaixa, Consultor (opcional -- sem ela, distribui
// automaticamente como no fluxo normal), Faixa (informativa -- a faixa real
// usada no sistema é recalculada a partir do vencimento mais antigo, pra ficar
// consistente com o resto do sistema/comissão).
const TERMOS_COLUNA: Record<string, string[]> = {
  documento:  ["passaporte", "documento"],
  fornecedor: ["fornecedor", "nome", "cliente"],
  tipo:       ["tipo"],
  valor:      ["valor"],
  status:     ["status"],
  vencimento: ["vencimento"],
  tiposBaixa: ["tiposbaixa", "tipos de baixa", "tipo de baixa"],
  consultor:  ["consultor"],
};

function normalizar(s: string): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function detectarColunas(header: unknown[]): Record<string, number> {
  const normalizados = header.map((h) => normalizar(String(h ?? "")));
  const colunas: Record<string, number> = {};
  for (const [chave, termos] of Object.entries(TERMOS_COLUNA)) {
    const idx = normalizados.findIndex((h) => termos.some((t) => h === t || h.includes(t)));
    if (idx >= 0) colunas[chave] = idx;
  }
  return colunas;
}

function parsearValor(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === "number") return Math.abs(val);
  const s = String(val).trim().replace(/R\$\s*/g, "").replace(/\s/g, "");
  const limpo = s.includes(",") && s.includes(".")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : Math.abs(n);
}

function parsearData(val: unknown): Date | null {
  if (val == null || val === "") return null;
  if (val instanceof Date) return val;
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (!d) return null;
    return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  const s = String(val).trim();
  const dmY = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmY) return new Date(Date.UTC(+dmY[3], +dmY[2] - 1, +dmY[1]));
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

// Mesma regra já usada na query oficial (ver /api/fapass/importar): cobra
// boleto e "Rec*"; cartão já foi debitado, não entra.
function isInadimplencia(tipo: string): boolean {
  const t = String(tipo ?? "").trim();
  if (/^cart[aã]o/i.test(t)) return false;
  return /boleto/i.test(t) || /\brec\b|\brec\./i.test(t);
}

function obterEquipe(dias: number): string {
  if (dias <= 0)  return "FLASH";
  if (dias <= 30) return "CRA_1_30";
  if (dias <= 90) return "CR_31_90";
  return "CR_PDD_91_180";
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user?.perfil ?? "")) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const form = await req.formData();
  const arquivo = form.get("arquivo") as File | null;
  const competenciaId = form.get("competenciaId") as string | null;
  if (!arquivo || !competenciaId) {
    return NextResponse.json({ erro: "arquivo e competenciaId são obrigatórios" }, { status: 400 });
  }

  const competencia = await prisma.competencia.findUnique({ where: { id: competenciaId } });
  if (!competencia) return NextResponse.json({ erro: "Competência não encontrada" }, { status: 404 });
  if (competencia.fechada) return NextResponse.json({ erro: "Competência fechada" }, { status: 400 });

  const empresaFaPass = await prisma.empresa.findFirst({ where: { prefixos: { has: "FP" } } });
  if (!empresaFaPass) return NextResponse.json({ erro: "Empresa Fã Pass não encontrada. Configure prefixo FP." }, { status: 422 });

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const todasLinhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  if (todasLinhas.length < 2) return NextResponse.json({ erro: "Planilha vazia" }, { status: 400 });

  const header = todasLinhas[0] as unknown[];
  const C = detectarColunas(header);
  if (C.documento == null || C.valor == null || C.vencimento == null || C.status == null) {
    return NextResponse.json({
      erro: "Não achei as colunas esperadas (Passaporte/Documento, Valor, Vencimento, Status) no cabeçalho.",
      cabecalhoLido: header,
    }, { status: 400 });
  }
  const temConsultorNaPlanilha = C.consultor != null;
  const linhas = todasLinhas.slice(1).filter((r) => r && r.length > 0);

  const sync = await prisma.faPassSync.create({
    data: { competenciaId, origem: "MANUAL", status: "PROCESSANDO" },
  });

  try {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const ontem = new Date(hoje.getTime() - 86400000);
    const iniComp = new Date(Date.UTC(competencia.ano, competencia.mes - 1, 1, 3, 0, 0, 0));
    const fimComp = new Date(Date.UTC(competencia.ano, competencia.mes, 1, 2, 59, 59, 999));

    const snapExistente = await prisma.faPassInadimplencia.count({ where: { competenciaId } });
    const primeiraSync = snapExistente === 0;
    const docsExistentes = primeiraSync ? new Set<string>() : new Set(
      (await prisma.faPassInadimplencia.findMany({ where: { competenciaId }, select: { contratoNumero: true } }))
        .map((r) => r.contratoNumero)
    );

    // ── Agrupa por contrato ────────────────────────────────────────────────────
    const gruposInad = new Map<string, { fornecedor: string; consultorNome: string | null; linhas: { valor: number; vencimento: Date }[] }>();

    for (const row of linhas) {
      const doc = String(row[C.documento] ?? "").trim();
      if (!doc) continue;
      const docUpper = doc.toUpperCase();
      if (!(docUpper.startsWith("FP") || docUpper.startsWith("PON"))) continue;

      const status = String(row[C.status] ?? "").trim().toUpperCase();
      if (status !== "P") continue;

      if (C.tipo != null && !isInadimplencia(String(row[C.tipo] ?? ""))) continue;
      if (C.tiposBaixa != null && /cancelamento/i.test(String(row[C.tiposBaixa] ?? ""))) continue;

      const vencimento = parsearData(row[C.vencimento]);
      if (!vencimento) continue;

      const isFlashRow = vencimento >= iniComp && vencimento <= ontem;
      const isInadRow  = vencimento <= ontem;
      if (!isInadRow && !isFlashRow) continue;

      const fornecedor = C.fornecedor != null ? String(row[C.fornecedor] ?? "").trim() : "";
      const consultorNome = temConsultorNaPlanilha ? String(row[C.consultor] ?? "").trim() || null : null;

      if (!gruposInad.has(doc)) gruposInad.set(doc, { fornecedor, consultorNome, linhas: [] });
      gruposInad.get(doc)!.linhas.push({ valor: parsearValor(row[C.valor]), vencimento });
    }

    // ── Resolve consultores citados na planilha (nome -> Usuario) ─────────────
    // Casa pelo primeiro nome, exato -- evita confundir "Gabriel" com "Gabriela".
    const nomesConsultorCitados = [...new Set([...gruposInad.values()].map((g) => g.consultorNome).filter((n): n is string => !!n))];
    const consultoresAtivos = nomesConsultorCitados.length
      ? await prisma.usuario.findMany({ where: { perfil: "CONSULTOR", ativo: true }, select: { id: true, nome: true, emFerias: true } })
      : [];
    const consultorPorPrimeiroNome = new Map<string, { id: string; nome: string; emFerias: boolean }>();
    for (const c of consultoresAtivos) {
      const primeiroNome = normalizar(c.nome.split(" ")[0]);
      if (!consultorPorPrimeiroNome.has(primeiroNome)) consultorPorPrimeiroNome.set(primeiroNome, c);
    }
    const consultoresNaoEncontrados = new Set<string>();

    // ── Busca contratos existentes em lote ────────────────────────────────────
    const todosDocumentos = [...gruposInad.keys()];
    const contratosExistentes = await prisma.contrato.findMany({
      where: { numero: { in: todosDocumentos }, empresaId: empresaFaPass.id },
      select: { id: true, numero: true, clienteId: true },
    });
    const contratoMap = new Map(contratosExistentes.map((c) => [c.numero, c]));

    const novosSnap: { id: string; competenciaId: string; contratoNumero: string; valor: number; vencimentoMaisAntigo: Date; faixa: string; isFlash: boolean; syncId: string }[] = [];
    // consultorId != null quando a planilha já diz quem é o consultor (atribuição direta, sem round-robin)
    const novosParaDistribuir: { contratoId: string; clienteId: string; valorTotalAberto: number; maiorDiasAtraso: number; isFlash: boolean; consultorId: string | null }[] = [];
    let criados = 0, atualizados = 0;

    for (const [doc, grupo] of gruposInad) {
      if (!primeiraSync && docsExistentes.has(doc)) continue;

      let vencMaisAntigo: Date | null = null;
      let valorTotal = 0;
      let isFlash = true;
      for (const l of grupo.linhas) {
        valorTotal += l.valor;
        if (!vencMaisAntigo || l.vencimento < vencMaisAntigo) vencMaisAntigo = l.vencimento;
        if (l.vencimento < iniComp) isFlash = false;
      }
      if (!vencMaisAntigo || valorTotal === 0) continue;

      const diasAtraso = Math.max(0, Math.floor((hoje.getTime() - vencMaisAntigo.getTime()) / 86400000));
      let contratoId: string, clienteId: string;
      const existente = contratoMap.get(doc);

      if (existente) {
        contratoId = existente.id;
        clienteId = existente.clienteId;
        await prisma.contrato.update({ where: { id: contratoId }, data: { maiorDiasAtraso: diasAtraso, valorTotalAberto: valorTotal } });
        atualizados++;
      } else {
        clienteId = randomUUID(); contratoId = randomUUID();
        await prisma.cliente.create({ data: { id: clienteId, nome: grupo.fornecedor || doc } });
        await prisma.contrato.create({ data: { id: contratoId, numero: doc, clienteId, empresaId: empresaFaPass.id, maiorDiasAtraso: diasAtraso, valorTotalAberto: valorTotal } });
        contratoMap.set(doc, { id: contratoId, numero: doc, clienteId });
        criados++;
      }

      let consultorId: string | null = null;
      if (grupo.consultorNome) {
        const encontrado = consultorPorPrimeiroNome.get(normalizar(grupo.consultorNome));
        if (encontrado && !encontrado.emFerias) consultorId = encontrado.id;
        else consultoresNaoEncontrados.add(grupo.consultorNome);
      }

      novosSnap.push({ id: randomUUID(), competenciaId, contratoNumero: doc, valor: valorTotal, vencimentoMaisAntigo: vencMaisAntigo, faixa: isFlash ? "FLASH" : obterEquipe(diasAtraso), isFlash, syncId: sync.id });
      novosParaDistribuir.push({ contratoId, clienteId, valorTotalAberto: valorTotal, maiorDiasAtraso: diasAtraso, isFlash, consultorId });
    }

    if (novosSnap.length > 0) {
      for (const ck of chunks(novosSnap, 500)) await prisma.faPassInadimplencia.createMany({ data: ck, skipDuplicates: true });
    }

    // ── Distribui carteiras: usa o consultor da planilha quando tem; senão round-robin por equipe ──
    let atribuidosDaPlanilha = 0, atribuidosAutomatico = 0;
    if (novosParaDistribuir.length > 0) {
      const jaDistribuidos = new Set(
        (await prisma.carteiraParcela.findMany({
          where: { competenciaId, contratoId: { in: novosParaDistribuir.map((c) => c.contratoId) } },
          select: { contratoId: true },
        })).map((c) => c.contratoId)
      );
      const semCarteira = novosParaDistribuir.filter((c) => !jaDistribuidos.has(c.contratoId));

      const novasAtribuicoes: { id: string; contratoId: string; consultorId: string; competenciaId: string }[] = [];

      const comConsultorDaPlanilha = semCarteira.filter((c) => c.consultorId);
      for (const c of comConsultorDaPlanilha) {
        novasAtribuicoes.push({ id: randomUUID(), contratoId: c.contratoId, consultorId: c.consultorId!, competenciaId });
        atribuidosDaPlanilha++;
      }

      const semConsultor = semCarteira.filter((c) => !c.consultorId);
      if (semConsultor.length > 0) {
        const todasEquipes = await prisma.equipe.findMany({
          where: { ativa: true },
          include: { usuarios: { where: { ativo: true, perfil: "CONSULTOR", emFerias: false }, select: { id: true } } },
        });
        const equipeMap = new Map(todasEquipes.map((e) => [e.tipo, e]));
        const porEquipe = new Map<string, typeof semConsultor>();
        for (const c of semConsultor) {
          const tipo = c.isFlash ? "FLASH" : obterEquipe(c.maiorDiasAtraso);
          if (!porEquipe.has(tipo)) porEquipe.set(tipo, []);
          porEquipe.get(tipo)!.push(c);
        }
        for (const [tipo, lista] of porEquipe) {
          const equipe = equipeMap.get(tipo);
          if (!equipe?.usuarios.length) continue;
          const consultores = equipe.usuarios.map((u) => u.id);
          lista.forEach((c, i) => {
            novasAtribuicoes.push({ id: randomUUID(), contratoId: c.contratoId, consultorId: consultores[i % consultores.length], competenciaId });
            atribuidosAutomatico++;
          });
        }
      }

      for (const ck of chunks(novasAtribuicoes, 500)) await prisma.carteiraParcela.createMany({ data: ck, skipDuplicates: true });
    }

    await prisma.faPassSync.update({
      where: { id: sync.id },
      data: {
        primeiraSync,
        totalRegistros: linhas.length,
        totalContratos: gruposInad.size,
        totalFlash: novosSnap.filter((s) => s.isFlash).length,
        totalBaixas: 0,
        totalDivergencias: 0,
        status: "CONCLUIDO",
        concluidoEm: new Date(),
      },
    });

    return NextResponse.json({
      primeiraSync,
      totalRegistros: linhas.length,
      totalContratos: gruposInad.size,
      novosInadimplentes: novosSnap.filter((s) => !s.isFlash).length,
      novosFlash: novosSnap.filter((s) => s.isFlash).length,
      criados,
      atualizados,
      atribuidosDaPlanilha,
      atribuidosAutomatico,
      consultoresNaoEncontrados: [...consultoresNaoEncontrados],
      colunasResolvidas: C,
    });
  } catch (err: any) {
    await prisma.faPassSync.update({ where: { id: sync.id }, data: { status: "ERRO", erro: err.message } });
    return NextResponse.json({ erro: err.message || "Erro interno" }, { status: 500 });
  }
}
