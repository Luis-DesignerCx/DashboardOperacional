export const maxDuration = 120;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

// ─── Índices de coluna (0-based) ─────────────────────────────────────────────
const C = {
  contrato:        2,
  cliente:         3,
  dataLiquidacao:  4,
  origem:          5,
  meioPagamento:   6,
  valorAReceber:  16,
} as const;

// Origens que representam recebimentos reais
const ORIGENS_VALIDAS = new Set([
  "SALDO",
  "SALDO ALOCADO",
  "ENTRADA",
  "ENTRADA ALOCADA",
  "ENTRADA EFETIVA",
]);

function ehPIXouBoleto(meio: string): boolean {
  const m = String(meio ?? "").trim().toUpperCase();
  return m.startsWith("PIX") || m.includes("BOLETO");
}

function parsearSerial(val: unknown): Date | null {
  if (val == null) return null;
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

function parsearValor(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === "number") return Math.abs(val);
  const s = String(val).replace(/R\$\s*/g, "").replace(/\s/g, "");
  const limpo = s.includes(",") && s.includes(".")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : Math.abs(n);
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

  // Janela da competência (mês inteiro)
  const iniComp = new Date(Date.UTC(competencia.ano, competencia.mes - 1, 1));
  const fimComp = new Date(Date.UTC(competencia.ano, competencia.mes, 1));

  // Parse xlsx
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  const linhas = (rows as unknown[][]).slice(1).filter((r) => r && r.length > C.valorAReceber);

  // ── Agrupa por contrato: soma valores válidos no mês da competência ──────────
  const planiha = new Map<string, { cliente: string; valor: number; dataLiquidacao: Date }>();

  for (const row of linhas) {
    const contrato = String(row[C.contrato] ?? "").trim();
    if (!contrato) continue;

    const origem = String(row[C.origem] ?? "").trim().toUpperCase();
    if (!ORIGENS_VALIDAS.has(origem)) continue;

    const meio = String(row[C.meioPagamento] ?? "").trim();
    if (!ehPIXouBoleto(meio)) continue;

    const dataLiq = parsearSerial(row[C.dataLiquidacao]);
    if (!dataLiq || dataLiq < iniComp || dataLiq >= fimComp) continue;

    const valor = parsearValor(row[C.valorAReceber]);
    if (valor === 0) continue;

    const cliente = String(row[C.cliente] ?? "").trim();
    const entry = planiha.get(contrato);
    if (entry) {
      entry.valor += valor;
      if (dataLiq > entry.dataLiquidacao) entry.dataLiquidacao = dataLiq;
    } else {
      planiha.set(contrato, { cliente, valor, dataLiquidacao: dataLiq });
    }
  }

  const numerosContratos = [...planiha.keys()];

  if (numerosContratos.length === 0) {
    return NextResponse.json({ erro: "Nenhuma baixa válida encontrada para a competência selecionada." }, { status: 422 });
  }

  // ── Busca contratos no banco ──────────────────────────────────────────────────
  const contratosDB = await prisma.contrato.findMany({
    where: { numero: { in: numerosContratos } },
    select: { id: true, numero: true, clienteId: true, cliente: { select: { nome: true } } },
  });
  const contratoMap = new Map(contratosDB.map((c) => [c.numero, c]));

  // ── Busca recebimentos na competência para esses contratos ───────────────────
  const contratoIds = contratosDB.map((c) => c.id);
  const recebimentosDB = await prisma.recebimento.findMany({
    where: {
      contratoId: { in: contratoIds },
      dataRecebimento: { gte: iniComp, lt: fimComp },
    },
    select: { id: true, contratoId: true, valor: true, dataRecebimento: true, formaPagamento: true },
  });

  // Agrupa recebimentos por contratoId (soma)
  const recMap = new Map<string, { ids: string[]; valorTotal: number }>();
  for (const r of recebimentosDB) {
    const e = recMap.get(r.contratoId);
    if (e) { e.ids.push(r.id); e.valorTotal += Number(r.valor); }
    else recMap.set(r.contratoId, { ids: [r.id], valorTotal: Number(r.valor) });
  }

  // ── Cruzamento ────────────────────────────────────────────────────────────────
  const TOLERANCIA = 0.02; // 2 centavos de tolerância para arredondamentos

  const confirmados: { contrato: string; cliente: string; valorPlanilha: number; valorSistema: number }[] = [];
  const divergencias: { contrato: string; cliente: string; valorPlanilha: number; valorSistema: number; diff: number }[] = [];
  const naoLancados: { contrato: string; cliente: string; valorPlanilha: number; dataLiquidacao: string }[] = [];
  const naoEncontrados: { contrato: string; cliente: string; valorPlanilha: number }[] = [];

  const recIdsConfirmados: string[] = [];
  const recIdsDivergentes: string[] = [];

  for (const [numContrato, dado] of planiha) {
    const contratoDB = contratoMap.get(numContrato);

    if (!contratoDB) {
      naoEncontrados.push({ contrato: numContrato, cliente: dado.cliente, valorPlanilha: dado.valor });
      continue;
    }

    const rec = recMap.get(contratoDB.id);
    if (!rec) {
      naoLancados.push({
        contrato: numContrato,
        cliente: contratoDB.cliente.nome || dado.cliente,
        valorPlanilha: dado.valor,
        dataLiquidacao: dado.dataLiquidacao.toISOString().split("T")[0],
      });
      continue;
    }

    const diff = Math.abs(rec.valorTotal - dado.valor);
    if (diff <= TOLERANCIA) {
      confirmados.push({ contrato: numContrato, cliente: contratoDB.cliente.nome, valorPlanilha: dado.valor, valorSistema: rec.valorTotal });
      recIdsConfirmados.push(...rec.ids);
    } else {
      divergencias.push({ contrato: numContrato, cliente: contratoDB.cliente.nome, valorPlanilha: dado.valor, valorSistema: rec.valorTotal, diff });
      recIdsDivergentes.push(...rec.ids);
    }
  }

  // Recebimentos no sistema para contratos NÃO presentes na planilha
  const idsConfirmadosEDivergentes = new Set([...recIdsConfirmados, ...recIdsDivergentes]);
  const naoConfirmados = recebimentosDB
    .filter((r) => !idsConfirmadosEDivergentes.has(r.id))
    .map((r) => {
      const c = contratosDB.find((x) => x.id === r.contratoId);
      return {
        contrato: c?.numero ?? "?",
        cliente: c?.cliente.nome ?? "?",
        valorSistema: Number(r.valor),
        dataRecebimento: r.dataRecebimento.toISOString().split("T")[0],
      };
    });

  // ── Atualiza recebimentos no banco ────────────────────────────────────────────
  if (recIdsConfirmados.length > 0) {
    await prisma.recebimento.updateMany({
      where: { id: { in: recIdsConfirmados } },
      data: { baixaOficial: true, divergencia: false },
    });
    // Atualiza valorBaixado individualmente (valor proporcional ou total)
    for (const id of recIdsConfirmados) {
      const rec = recebimentosDB.find((r) => r.id === id)!;
      const contratoNum = contratosDB.find((c) => c.id === rec.contratoId)?.numero;
      const dado = contratoNum ? planiha.get(contratoNum) : null;
      if (dado) await prisma.recebimento.update({ where: { id }, data: { valorBaixado: dado.valor } });
    }
  }

  if (recIdsDivergentes.length > 0) {
    await prisma.recebimento.updateMany({
      where: { id: { in: recIdsDivergentes } },
      data: { baixaOficial: true, divergencia: true },
    });
    for (const id of recIdsDivergentes) {
      const rec = recebimentosDB.find((r) => r.id === id)!;
      const contratoNum = contratosDB.find((c) => c.id === rec.contratoId)?.numero;
      const dado = contratoNum ? planiha.get(contratoNum) : null;
      if (dado) await prisma.recebimento.update({ where: { id }, data: { valorBaixado: dado.valor } });
    }
  }

  // Reseta baixaOficial para recebimentos que não constam na planilha
  const idsNaoConfirmados = naoConfirmados
    .map((nc) => recebimentosDB.find((r) => contratosDB.find((c) => c.id === r.contratoId)?.numero === nc.contrato)?.id)
    .filter((id): id is string => Boolean(id));

  if (idsNaoConfirmados.length > 0) {
    await prisma.recebimento.updateMany({
      where: { id: { in: idsNaoConfirmados } },
      data: { baixaOficial: false, divergencia: true },
    });
  }

  return NextResponse.json({
    totalPlanilha: planiha.size,
    confirmados: confirmados.length,
    divergencias: divergencias.length,
    naoLancados: naoLancados.length,
    naoEncontrados: naoEncontrados.length,
    naoConfirmados: naoConfirmados.length,
    detalhes: {
      divergencias: divergencias.slice(0, 50),
      naoLancados: naoLancados.slice(0, 50),
      naoConfirmados: naoConfirmados.slice(0, 50),
    },
  });
}
