export const maxDuration = 120;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { randomUUID } from "crypto";

// ─── Índices de coluna (0-based) ─────────────────────────────────────────────
// Passaporte | Fornecedor | Id | Vencimento | Tipo | Valor | Status | TiposBaixa
// | Dias Venc. Ant. | Status Lote | Consultor | Meta | Faixa | StatusAc.
// | Data Rec. | Valor Rec. | MeioPag. | Valor EmDia | Observação
const C = {
  documento:  0,
  fornecedor: 1,
  vencimento: 3,
  tipo:       4,
  valor:      5,
  status:     6,
  tiposBaixa: 7,
  dataBaixa:  14,
  valorRec:   15,
  meioPag:    16,
} as const;

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
  // DD/MM/YYYY ou YYYY-MM-DD
  const dmY = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmY) return new Date(Date.UTC(+dmY[3], +dmY[2] - 1, +dmY[1]));
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

function isInadimplencia(tipo: string): boolean {
  const t = String(tipo ?? "").trim();
  if (/^cart[aã]o/i.test(t)) return false;
  return /boleto/i.test(t) || /\brec\b|\brec\./i.test(t);
}
// Determina tipo de baixa pelo MeioPag (col 16), com fallback no Tipo (col 4)
// Para cartão: status P/B é irrelevante — depende apenas do MeioPag e DataRec
function detectarTipoBaixa(meioPag: string, tipo: string): "CARTAO" | "BOLETO_PIX" | null {
  const m = String(meioPag ?? "").trim();
  if (/cart[aã]o/i.test(m)) return "CARTAO";
  if (/boleto|pix|dinheiro|dep[oó]sito|transfer[eê]ncia|ted/i.test(m)) return "BOLETO_PIX";
  // MeioPag vazio: fallback pelo Tipo da dívida
  const t = String(tipo ?? "").trim();
  if (/^rec\.\s*(master|visa|elo|amex|hipercard)/i.test(t)) return "CARTAO";
  if (/boleto/i.test(t)) return "BOLETO_PIX";
  return null;
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

  // Lê e parseia o xlsx
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

  // Pula cabeçalho (linha 0)
  const linhas = (rows as unknown[][]).slice(1).filter((r) => r && r.length > C.status);

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

    // ── Agrupa por contrato (inadimplência) ───────────────────────────────────
    const gruposInad = new Map<string, { fornecedor: string; linhas: { valor: number; vencimento: Date }[] }>();

    for (const row of linhas) {
      const status = String(row[C.status] ?? "").trim().toUpperCase();
      if (status !== "P") continue;

      const tipo = String(row[C.tipo] ?? "").trim();
      if (!isInadimplencia(tipo)) continue;

      const tiposBaixa = String(row[C.tiposBaixa] ?? "").trim();
      if (/cancelamento de passaporte/i.test(tiposBaixa)) continue;

      const vencimento = parsearData(row[C.vencimento]);
      if (!vencimento) continue;

      const isFlashRow = vencimento >= iniComp && vencimento <= ontem;
      const isInadRow  = vencimento <= ontem;
      if (!isInadRow && !isFlashRow) continue;

      const doc = String(row[C.documento] ?? "").trim();
      if (!doc) continue;

      const fornecedor = String(row[C.fornecedor] ?? "").trim();
      if (!gruposInad.has(doc)) gruposInad.set(doc, { fornecedor, linhas: [] });
      gruposInad.get(doc)!.linhas.push({ valor: parsearValor(row[C.valor]), vencimento });
    }

    // ── Busca contratos existentes em lote ────────────────────────────────────
    const todosDocumentos = [...gruposInad.keys()];
    const contratosExistentes = await prisma.contrato.findMany({
      where: { numero: { in: todosDocumentos }, empresaId: empresaFaPass.id },
      select: { id: true, numero: true, clienteId: true },
    });
    const contratoMap = new Map(contratosExistentes.map((c) => [c.numero, c]));

    const novosSnap: {
      id: string; competenciaId: string; contratoNumero: string;
      valor: number; vencimentoMaisAntigo: Date; faixa: string; isFlash: boolean; syncId: string;
    }[] = [];
    const novosParaDistribuir: { contratoId: string; clienteId: string; valorTotalAberto: number; maiorDiasAtraso: number; isFlash: boolean }[] = [];
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

      novosSnap.push({ id: randomUUID(), competenciaId, contratoNumero: doc, valor: valorTotal, vencimentoMaisAntigo: vencMaisAntigo, faixa: isFlash ? "FLASH" : obterEquipe(diasAtraso), isFlash, syncId: sync.id });
      novosParaDistribuir.push({ contratoId, clienteId, valorTotalAberto: valorTotal, maiorDiasAtraso: diasAtraso, isFlash });
    }

    if (novosSnap.length > 0) {
      for (const ck of chunks(novosSnap, 500)) {
        await prisma.faPassInadimplencia.createMany({ data: ck, skipDuplicates: true });
      }
    }

    // ── Distribui carteiras ───────────────────────────────────────────────────
    if (novosParaDistribuir.length > 0) {
      const jaDistribuidos = new Set(
        (await prisma.carteiraParcela.findMany({
          where: { competenciaId, contratoId: { in: novosParaDistribuir.map((c) => c.contratoId) } },
          select: { contratoId: true },
        })).map((c) => c.contratoId)
      );
      const semCarteira = novosParaDistribuir.filter((c) => !jaDistribuidos.has(c.contratoId));

      if (semCarteira.length > 0) {
        const todasEquipes = await prisma.equipe.findMany({
          where: { ativa: true },
          include: { usuarios: { where: { ativo: true, perfil: "CONSULTOR", emFerias: false }, select: { id: true } } },
        });
        const equipeMap = new Map(todasEquipes.map((e) => [e.tipo, e]));
        const porEquipe = new Map<string, typeof semCarteira>();
        for (const c of semCarteira) {
          const tipo = c.isFlash ? "FLASH" : obterEquipe(c.maiorDiasAtraso);
          if (!porEquipe.has(tipo)) porEquipe.set(tipo, []);
          porEquipe.get(tipo)!.push(c);
        }
        const novasAtribuicoes: { id: string; contratoId: string; consultorId: string; competenciaId: string }[] = [];
        for (const [tipo, lista] of porEquipe) {
          const equipe = equipeMap.get(tipo);
          if (!equipe?.usuarios.length) continue;
          const consultores = equipe.usuarios.map((u) => u.id);
          lista.forEach((c, i) => novasAtribuicoes.push({ id: randomUUID(), contratoId: c.contratoId, consultorId: consultores[i % consultores.length], competenciaId }));
        }
        for (const ck of chunks(novasAtribuicoes, 500)) {
          await prisma.carteiraParcela.createMany({ data: ck, skipDuplicates: true });
        }
      }
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
      totalBaixas: baixas.length,
      totalDivergencias: 0,
      criados,
      atualizados,
    });
  } catch (err: any) {
    await prisma.faPassSync.update({ where: { id: sync.id }, data: { status: "ERRO", erro: err.message } });
    return NextResponse.json({ erro: err.message || "Erro interno" }, { status: 500 });
  }
}
