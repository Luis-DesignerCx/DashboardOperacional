export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { obterEquipePorDiasAtraso } from "@/constants/equipes";
import { distribuirCarteira } from "@/utils/distribuicao-carteira";
import { fatorFerias } from "@/utils/dias-uteis";
import { Decimal } from "@prisma/client/runtime/library";

// Colunas da Base CAR Passaporte BC.xlsx (0-based)
const C = {
  id:           0,  // Id
  documento:    1,  // Documento — número do contrato (FP/PON)
  tipo:         6,  // Tipo — meio de pagamento / identificador
  fornecedor:   7,  // Fornecedor — nome do cliente
  valor:        8,  // Valor
  saldoPendente:14, // SaldoPendente
  status:       16, // Status (B=baixado, P=pendente)
  vencimento:   17, // Vencimento
  dataBaixa:    18, // DataBaixa
  tiposBaixa:   19, // TiposBaixa
} as const;

const PREFIXOS_FAPASS = ["FP", "PON"];

function isFaPass(doc: string): boolean {
  const upper = doc.toUpperCase().trim();
  return PREFIXOS_FAPASS.some((p) => upper.startsWith(p));
}

function parseBRDate(val: any): Date | null {
  if (!val) return null;
  const str = String(val).trim();
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return new Date(`${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}T00:00:00Z`);
  return null;
}

function parseValor(val: any): number {
  if (!val) return 0;
  const str = String(val).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(str);
  return isNaN(n) ? 0 : Math.abs(n);
}

function calcDiasAtraso(vencimento: Date, referencia: Date): number {
  const diff = referencia.getTime() - vencimento.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

// Tipo contém "Boleto" ou "Rec" (case-insensitive) e NÃO começa com "Cartão"
function isInadimplencia(tipo: string): boolean {
  const t = tipo.trim();
  if (/^cart[aã]o/i.test(t)) return false;
  return /boleto/i.test(t) || /\brec\b|\brec\./i.test(t);
}

// Tipos de baixa para Boleto/PIX/Dinheiro/Depósito/Transferência
function isBaixaNormal(tipo: string): boolean {
  return /boleto|pix|dinheiro|dep[oó]sito|transfer[eê]ncia|ted/i.test(tipo);
}

// Cartão: Tipo começa com "Cartão"
function isBaixaCartao(tipo: string): boolean {
  return /^cart[aã]o/i.test(tipo.trim());
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  const isCron = apiKey && apiKey === process.env.CRON_SECRET;
  if (!isCron) {
    const session = await getServerSession(authOptions);
    if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
      return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
    }
  }

  const formData = await req.formData();
  const arquivo = formData.get("arquivo") as File;
  const competenciaId = formData.get("competenciaId") as string;
  const origem = (formData.get("origem") as string) || "MANUAL";

  if (!arquivo || !competenciaId) {
    return NextResponse.json({ erro: "Arquivo e competência são obrigatórios" }, { status: 400 });
  }

  const competencia = await prisma.competencia.findUnique({ where: { id: competenciaId } });
  if (!competencia) return NextResponse.json({ erro: "Competência não encontrada" }, { status: 404 });
  if (competencia.fechada) return NextResponse.json({ erro: "Competência fechada" }, { status: 400 });

  // Cria registro de sync
  const sync = await prisma.faPassSync.create({
    data: { competenciaId, origem, status: "PROCESSANDO" },
  });

  try {
    // ── 1. Parse do arquivo ──────────────────────────────────────────────────
    const XLSX = await import("xlsx");
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const todasLinhas: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const linhas = todasLinhas.slice(1);

    // ── 2. Filtra apenas FP/PON ──────────────────────────────────────────────
    const linhasFP = linhas.filter((row) => isFaPass(String(row[C.documento] ?? "")));

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const ontem = new Date(hoje.getTime() - 86400000);

    const iniComp = new Date(Date.UTC(competencia.ano, competencia.mes - 1, 1));
    const fimComp = new Date(Date.UTC(competencia.ano, competencia.mes, 0, 23, 59, 59, 999));

    // ── 3. Verifica se é primeira sync desta competência ────────────────────
    const snapExistente = await prisma.faPassInadimplencia.count({ where: { competenciaId } });
    const primeiraSync = snapExistente === 0;

    // ── 4. Agrupa por contrato para calcular vencimento mais antigo ─────────
    type GrupoContrato = {
      documento: string;
      fornecedor: string;
      linhasInad: any[][];
    };
    const gruposInad = new Map<string, GrupoContrato>();

    for (const row of linhasFP) {
      const doc = String(row[C.documento] ?? "").trim().toUpperCase();
      const status = String(row[C.status] ?? "").trim().toUpperCase();
      const tipo = String(row[C.tipo] ?? "").trim();
      const tiposBaixa = String(row[C.tiposBaixa] ?? "").trim();
      const venc = parseBRDate(row[C.vencimento]);

      if (status !== "P") continue;
      if (!isInadimplencia(tipo)) continue;
      if (/cancelamento de passaporte/i.test(tiposBaixa)) continue;
      if (!venc) continue;

      // Para inadimplência: vencimento até ontem (D-1)
      // Flash: vencimento dentro do mês vigente
      const isFlashRow = venc >= iniComp && venc <= fimComp;
      const isInadRow = venc <= ontem;

      if (!isInadRow && !isFlashRow) continue;

      if (!gruposInad.has(doc)) {
        gruposInad.set(doc, {
          documento: doc,
          fornecedor: String(row[C.fornecedor] ?? "").trim(),
          linhasInad: [],
        });
      }
      gruposInad.get(doc)!.linhasInad.push(row);
    }

    // ── 5. Determina quais contratos já estão no snapshot ───────────────────
    const docsExistentes = new Set(
      (await prisma.faPassInadimplencia.findMany({
        where: { competenciaId },
        select: { contratoNumero: true },
      })).map((r) => r.contratoNumero)
    );

    // ── 6. Encontra empresa Fã Pass e contratos existentes no DB ────────────
    const empresaFaPass = await prisma.empresa.findFirst({
      where: { prefixos: { has: "FP" } },
    });
    if (!empresaFaPass) {
      throw new Error("Empresa Fã Pass não encontrada no sistema");
    }

    const todosDocumentos = [...gruposInad.keys()];
    const contratosExistentes = await prisma.contrato.findMany({
      where: { numero: { in: todosDocumentos } },
      select: { id: true, numero: true, clienteId: true },
    });
    const contratoMap = new Map(contratosExistentes.map((c) => [c.numero, c]));

    // ── 7. Processa inadimplência (novos no snapshot) ────────────────────────
    const novosParaDistribuir: { contratoId: string; clienteId: string; valorTotalAberto: number; maiorDiasAtraso: number; isFlash: boolean }[] = [];
    const novosSnap: any[] = [];

    for (const [doc, grupo] of gruposInad) {
      if (!primeiraSync && docsExistentes.has(doc)) continue; // já congelado, pula

      // Vencimento mais antigo
      let vencMaisAntigo: Date | null = null;
      let valorTotal = 0;
      let isFlash = true;

      for (const row of grupo.linhasInad) {
        const venc = parseBRDate(row[C.vencimento]);
        const valor = parseValor(row[C.valor]);
        valorTotal += valor;
        if (venc) {
          if (!vencMaisAntigo || venc < vencMaisAntigo) vencMaisAntigo = venc;
          if (venc < iniComp) isFlash = false; // tem vencimento antes do mês = não é flash
        }
      }

      if (!vencMaisAntigo || valorTotal === 0) continue;

      const diasAtraso = calcDiasAtraso(vencMaisAntigo, hoje);

      // Garante que o contrato existe no sistema
      let contratoId: string;
      let clienteId: string;

      const existente = contratoMap.get(doc);
      if (existente) {
        contratoId = existente.id;
        clienteId = existente.clienteId;
        // Atualiza saldo e diasAtraso
        await prisma.contrato.update({
          where: { id: contratoId },
          data: {
            maiorDiasAtraso: diasAtraso,
            valorTotalAberto: new Decimal(valorTotal.toFixed(2)),
          },
        });
      } else {
        // Cria cliente e contrato
        clienteId = randomUUID();
        contratoId = randomUUID();
        await prisma.cliente.create({ data: { id: clienteId, nome: grupo.fornecedor || doc } });
        await prisma.contrato.create({
          data: {
            id: contratoId,
            numero: doc,
            clienteId,
            empresaId: empresaFaPass.id,
            maiorDiasAtraso: diasAtraso,
            valorTotalAberto: new Decimal(valorTotal.toFixed(2)),
          },
        });
        contratoMap.set(doc, { id: contratoId, numero: doc, clienteId });
      }

      novosSnap.push({
        id: randomUUID(),
        competenciaId,
        contratoNumero: doc,
        valor: new Decimal(valorTotal.toFixed(2)),
        vencimentoMaisAntigo: vencMaisAntigo,
        faixa: isFlash ? "FLASH" : obterEquipePorDiasAtraso(diasAtraso),
        isFlash,
        syncId: sync.id,
      });

      novosParaDistribuir.push({ contratoId, clienteId, valorTotalAberto: valorTotal, maiorDiasAtraso: diasAtraso, isFlash });
    }

    // Insere novos snapshots
    if (novosSnap.length > 0) {
      for (const ck of chunks(novosSnap, 1000)) {
        await prisma.faPassInadimplencia.createMany({ data: ck, skipDuplicates: true });
      }
    }

    // ── 8. Distribui novos contratos às carteiras ────────────────────────────
    if (novosParaDistribuir.length > 0) {
      const jaDistribuidos = await prisma.carteiraParcela.findMany({
        where: { competenciaId, contratoId: { in: novosParaDistribuir.map((c) => c.contratoId) } },
        select: { contratoId: true },
      });
      const jaDistSet = new Set(jaDistribuidos.map((c) => c.contratoId));
      const semCarteira = novosParaDistribuir.filter((c) => !jaDistSet.has(c.contratoId));

      if (semCarteira.length > 0) {
        const feriasComp = await prisma.feriasConsultor.findMany({ where: { competenciaId } });
        const fatoresFerias = new Map<string, number>();
        for (const f of feriasComp) {
          fatoresFerias.set(f.consultorId, fatorFerias(competencia.mes, competencia.ano, f.dataInicio, f.dataFim));
        }

        const todasEquipes = await prisma.equipe.findMany({
          where: { ativa: true },
          include: { usuarios: { where: { ativo: true, perfil: "CONSULTOR", emFerias: false }, select: { id: true } } },
        });
        const equipeMap = new Map(todasEquipes.map((e) => [e.tipo as string, e]));

        const porEquipe = new Map<string, typeof semCarteira>();
        for (const c of semCarteira) {
          const tipo = c.isFlash ? "FLASH" : obterEquipePorDiasAtraso(c.maiorDiasAtraso);
          if (!porEquipe.has(tipo)) porEquipe.set(tipo, []);
          porEquipe.get(tipo)!.push(c);
        }

        const novasAtribuicoes: any[] = [];
        for (const [tipo, lista] of porEquipe) {
          const equipe = equipeMap.get(tipo);
          if (!equipe || !equipe.usuarios.length) continue;
          const atribuicoes = distribuirCarteira(
            lista.map((c) => ({ contratoId: c.contratoId, clienteId: c.clienteId, valorTotalAberto: c.valorTotalAberto })),
            equipe.usuarios.map((u) => u.id),
            fatoresFerias
          );
          for (const at of atribuicoes) {
            for (const contratoId of at.contratoIds) {
              novasAtribuicoes.push({ id: randomUUID(), contratoId, consultorId: at.consultorId, competenciaId });
            }
          }
        }

        for (const ck of chunks(novasAtribuicoes, 1000)) {
          await prisma.carteiraParcela.createMany({ data: ck, skipDuplicates: true });
        }
      }
    }

    // ── 9. Processa baixas (substitui todas da competência) ──────────────────
    await prisma.faPassBaixa.deleteMany({ where: { competenciaId } });

    const baixas: any[] = [];
    const baixasPorContrato = new Map<string, number>(); // contratoNumero → valor total baixado

    for (const row of linhasFP) {
      const doc = String(row[C.documento] ?? "").trim().toUpperCase();
      const tipo = String(row[C.tipo] ?? "").trim();
      const status = String(row[C.status] ?? "").trim().toUpperCase();
      const dataBaixaRaw = parseBRDate(row[C.dataBaixa]);
      const valor = parseValor(row[C.valor]);

      let tipoPagamento: string | null = null;

      // Boleto/PIX/etc: Status=B + DataBaixa no mês vigente
      if (status === "B" && isBaixaNormal(tipo) && dataBaixaRaw && dataBaixaRaw >= iniComp && dataBaixaRaw <= fimComp) {
        tipoPagamento = "BOLETO_PIX";
      }

      // Cartão: Tipo começa com "Cartão" (status não muda)
      if (isBaixaCartao(tipo) && dataBaixaRaw && dataBaixaRaw >= iniComp && dataBaixaRaw <= fimComp) {
        tipoPagamento = "CARTAO";
      }

      if (!tipoPagamento || valor === 0) continue;

      baixas.push({
        id: randomUUID(),
        competenciaId,
        contratoNumero: doc,
        valor: new Decimal(valor.toFixed(2)),
        tipoPagamento,
        dataBaixa: dataBaixaRaw,
        syncId: sync.id,
      });

      baixasPorContrato.set(doc, (baixasPorContrato.get(doc) ?? 0) + valor);
    }

    for (const ck of chunks(baixas, 1000)) {
      await prisma.faPassBaixa.createMany({ data: ck });
    }

    // ── 10. Detecta divergências (query vs. recebimentos do sistema) ─────────
    await prisma.faPassDivergencia.deleteMany({ where: { competenciaId } });

    const divergencias: any[] = [];
    const contratosComBaixa = [...baixasPorContrato.keys()];

    if (contratosComBaixa.length > 0) {
      const recebimentosSistema = await prisma.recebimento.groupBy({
        by: ["contratoId"],
        where: {
          contrato: { numero: { in: contratosComBaixa }, carteiras: { some: { competenciaId, ativo: true } } },
          dataRecebimento: { gte: iniComp, lte: fimComp },
        },
        _sum: { valor: true, valorAParte: true },
      });

      const contratosPorId = await prisma.contrato.findMany({
        where: { numero: { in: contratosComBaixa } },
        select: { id: true, numero: true },
      });
      const numParaId = new Map(contratosPorId.map((c) => [c.numero, c.id]));
      const idParaNum = new Map(contratosPorId.map((c) => [c.id, c.numero]));

      const recebMap = new Map(
        recebimentosSistema.map((r) => [
          idParaNum.get(r.contratoId) ?? "",
          Number(r._sum.valor ?? 0) + Number(r._sum.valorAParte ?? 0),
        ])
      );

      for (const [doc, valorQuery] of baixasPorContrato) {
        const valorSistema = recebMap.get(doc) ?? 0;
        const diff = Math.abs(valorQuery - valorSistema);
        if (diff < 0.01) continue; // sem divergência

        const contratoId = numParaId.get(doc) ?? null;
        const carteira = contratoId
          ? await prisma.carteiraParcela.findFirst({
              where: { contratoId, competenciaId, ativo: true },
              select: { consultorId: true, consultor: { select: { equipeId: true } } },
            })
          : null;

        const consultorId = carteira?.consultorId ?? null;
        const gestorId = carteira?.consultor
          ? (await prisma.equipe.findFirst({ where: { id: carteira.consultor.equipeId ?? "" }, select: { gestorId: true } }))?.gestorId ?? null
          : null;

        divergencias.push({
          id: randomUUID(),
          competenciaId,
          contratoNumero: doc,
          contratoId,
          consultorId,
          gestorId,
          valorSistema: new Decimal(valorSistema.toFixed(2)),
          valorQuery: new Decimal(valorQuery.toFixed(2)),
          syncId: sync.id,
        });
      }

      if (divergencias.length > 0) {
        await prisma.faPassDivergencia.createMany({ data: divergencias });
      }
    }

    // ── 11. Finaliza sync ────────────────────────────────────────────────────
    await prisma.faPassSync.update({
      where: { id: sync.id },
      data: {
        primeiraSync,
        totalRegistros: linhasFP.length,
        totalContratos: gruposInad.size,
        totalFlash: novosSnap.filter((s) => s.isFlash).length,
        totalBaixas: baixas.length,
        totalDivergencias: divergencias.length,
        status: "CONCLUIDO",
        concluidoEm: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      primeiraSync,
      totalRegistros: linhasFP.length,
      totalContratos: gruposInad.size,
      novosInadimplentes: novosSnap.filter((s) => !s.isFlash).length,
      novosFlash: novosSnap.filter((s) => s.isFlash).length,
      totalBaixas: baixas.length,
      totalDivergencias: divergencias.length,
    });
  } catch (err: any) {
    console.error("[fapass/sync]", err);
    await prisma.faPassSync.update({
      where: { id: sync.id },
      data: { status: "ERRO", erro: err.message },
    });
    return NextResponse.json({ erro: err.message || "Erro ao processar" }, { status: 500 });
  }
}
