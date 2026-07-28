export const maxDuration = 120;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

// ─── Índices de coluna (0-based) ─────────────────────────────────────────────
const C = {
  contrato:       2,
  cliente:        3,
  dataLiquidacao: 4,
  origem:         5,
  meioPagamento:  6,
  valorAReceber:  16,
} as const;

const ORIGENS_VALIDAS = new Set([
  "SALDO", "SALDO ALOCADO", "ENTRADA", "ENTRADA ALOCADA", "ENTRADA EFETIVA",
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

  const iniComp = new Date(Date.UTC(competencia.ano, competencia.mes - 1, 1));
  const fimComp = new Date(Date.UTC(competencia.ano, competencia.mes, 1));

  // ── 1. Parse planilha → mapa por número de contrato ──────────────────────────
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  const linhas = (rows as unknown[][]).slice(1).filter((r) => r && r.length > C.valorAReceber);

  const planilhaMap = new Map<string, { cliente: string; valor: number; dataLiquidacao: Date }>();

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
    const entry = planilhaMap.get(contrato);
    if (entry) {
      entry.valor += valor;
      if (dataLiq > entry.dataLiquidacao) entry.dataLiquidacao = dataLiq;
    } else {
      planilhaMap.set(contrato, { cliente, valor, dataLiquidacao: dataLiq });
    }
  }

  // ── 2. Todos os contratos ativos na carteira desta competência ───────────────
  const carteiras = await prisma.carteiraParcela.findMany({
    where: { competenciaId, ativo: true },
    select: {
      contratoId: true,
      contrato: {
        select: { id: true, numero: true, clienteId: true, cliente: { select: { nome: true } } },
      },
    },
  });

  // Desduplicar por contratoId (pode haver múltiplas parcelas por contrato)
  const contratosPorId = new Map<string, { id: string; numero: string; clienteId: string; cliente: { nome: string } }>();
  for (const k of carteiras) contratosPorId.set(k.contrato.id, k.contrato);
  const todosContratos = [...contratosPorId.values()];
  const todosIds = todosContratos.map((c) => c.id);

  // ── 3. Recebimentos de todos os contratos da carteira no mês ─────────────────
  const recebimentosDB = await prisma.recebimento.findMany({
    where: { contratoId: { in: todosIds }, dataRecebimento: { gte: iniComp, lt: fimComp } },
    select: { id: true, contratoId: true, valor: true, dataRecebimento: true, parcelasIds: true },
  });

  // Busca os valores das parcelas flagadas (para comparação precisa por parcela)
  const todosParcIds = [...new Set(recebimentosDB.flatMap((r) => r.parcelasIds))];
  const parcelasValores = todosParcIds.length > 0
    ? await prisma.parcela.findMany({
        where: { id: { in: todosParcIds } },
        select: { id: true, valorTotalAberto: true },
      })
    : [];
  const parcelaValorMap = new Map(parcelasValores.map((p) => [p.id, Number(p.valorTotalAberto)]));

  // Agrupa recebimentos por contratoId; computa valorFlagado = soma das parcelas cobertas
  const recMap = new Map<string, { ids: string[]; valorTotal: number; valorFlagado: number }>();
  for (const r of recebimentosDB) {
    const valorFlagado = r.parcelasIds.length > 0
      ? r.parcelasIds.reduce((s, pid) => s + (parcelaValorMap.get(pid) ?? 0), 0)
      : Number(r.valor);
    const e = recMap.get(r.contratoId);
    if (e) { e.ids.push(r.id); e.valorTotal += Number(r.valor); e.valorFlagado += valorFlagado; }
    else recMap.set(r.contratoId, { ids: [r.id], valorTotal: Number(r.valor), valorFlagado });
  }

  // ── 4. Cruzamento: base = todos os contratos da carteira ─────────────────────
  const TOLERANCIA = 0.02;

  type ItemBase = { contrato: string; cliente: string };
  const confirmados:    (ItemBase & { valorPlanilha: number; valorSistema: number })[] = [];
  const divergencias:   (ItemBase & { valorPlanilha: number; valorSistema: number; diff: number })[] = [];
  const naoLancados:    (ItemBase & { valorPlanilha: number; dataLiquidacao: string })[] = [];
  const semMovimentoItens: ItemBase[] = [];
  const naoConfirmados: (ItemBase & { valorSistema: number; dataRecebimento: string })[] = [];

  const recIdsConfirmados: string[] = [];
  const recIdsDivergentes: string[] = [];
  const recIdsNaoConfirmados: string[] = [];

  for (const contrato of todosContratos) {
    const naPlanilha = planilhaMap.get(contrato.numero);
    const rec = recMap.get(contrato.id);

    if (naPlanilha && rec) {
      // Compara planilha contra valorFlagado (parcelas que o consultor marcou como pagas).
      // Se não há parcelasIds (recebimentos antigos), cai de volta para valorTotal.
      const valorComparar = rec.valorFlagado > 0 ? rec.valorFlagado : rec.valorTotal;
      const diff = Math.abs(valorComparar - naPlanilha.valor);
      if (diff <= TOLERANCIA) {
        confirmados.push({ contrato: contrato.numero, cliente: contrato.cliente.nome, valorPlanilha: naPlanilha.valor, valorSistema: rec.valorTotal });
        recIdsConfirmados.push(...rec.ids);
      } else {
        divergencias.push({ contrato: contrato.numero, cliente: contrato.cliente.nome, valorPlanilha: naPlanilha.valor, valorSistema: rec.valorTotal, diff });
        recIdsDivergentes.push(...rec.ids);
      }
    } else if (naPlanilha && !rec) {
      // Baixado na planilha mas consultor não registrou
      naoLancados.push({ contrato: contrato.numero, cliente: contrato.cliente.nome, valorPlanilha: naPlanilha.valor, dataLiquidacao: naPlanilha.dataLiquidacao.toISOString().split("T")[0] });
    } else if (!naPlanilha && rec) {
      // Consultor registrou recebimento mas planilha não confirma
      naoConfirmados.push({ contrato: contrato.numero, cliente: contrato.cliente.nome, valorSistema: rec.valorTotal, dataRecebimento: rec.ids[0] ? recebimentosDB.find(r => r.id === rec.ids[0])?.dataRecebimento.toISOString().split("T")[0] ?? "" : "" });
      recIdsNaoConfirmados.push(...rec.ids);
    } else {
      // Sem planilha, sem recebimento — inadimplente sem movimento
      semMovimentoItens.push({ contrato: contrato.numero, cliente: contrato.cliente.nome });
    }
  }

  const semMovimento = semMovimentoItens.length;

  // Contratos da planilha que NÃO estão na carteira desta competência (informativo)
  const contratoNumerosCarteira = new Set(todosContratos.map((c) => c.numero));
  const foraCarteira = [...planilhaMap.keys()].filter((n) => !contratoNumerosCarteira.has(n)).length;

  // ── 5. Atualiza recebimentos no banco ─────────────────────────────────────────
  const atualizacoes: Promise<unknown>[] = [];

  if (recIdsConfirmados.length > 0) {
    atualizacoes.push(prisma.recebimento.updateMany({ where: { id: { in: recIdsConfirmados } }, data: { baixaOficial: true, divergencia: false } }));
    for (const id of recIdsConfirmados) {
      const r = recebimentosDB.find((x) => x.id === id);
      const dado = r ? planilhaMap.get(todosContratos.find((c) => c.id === r.contratoId)?.numero ?? "") : null;
      if (dado) atualizacoes.push(prisma.recebimento.update({ where: { id }, data: { valorBaixado: dado.valor } }));
    }
  }
  if (recIdsDivergentes.length > 0) {
    atualizacoes.push(prisma.recebimento.updateMany({ where: { id: { in: recIdsDivergentes } }, data: { baixaOficial: true, divergencia: true } }));
    for (const id of recIdsDivergentes) {
      const r = recebimentosDB.find((x) => x.id === id);
      const dado = r ? planilhaMap.get(todosContratos.find((c) => c.id === r.contratoId)?.numero ?? "") : null;
      if (dado) atualizacoes.push(prisma.recebimento.update({ where: { id }, data: { valorBaixado: dado.valor } }));
    }
  }
  if (recIdsNaoConfirmados.length > 0) {
    atualizacoes.push(prisma.recebimento.updateMany({ where: { id: { in: recIdsNaoConfirmados } }, data: { baixaOficial: false, divergencia: true } }));
  }

  await Promise.all(atualizacoes);

  return NextResponse.json({
    totalCarteira: todosContratos.length,
    confirmados: confirmados.length,
    divergencias: divergencias.length,
    naoLancados: naoLancados.length,
    naoConfirmados: naoConfirmados.length,
    semMovimento,
    foraCarteira,
    detalhes: {
      divergencias: divergencias.slice(0, 50),
      // naoLancados (baixou na planilha, sem lançamento) + semMovimento (zero atividade) juntos
      naoLancados: [...naoLancados, ...semMovimentoItens].slice(0, 50),
      naoConfirmados: naoConfirmados.slice(0, 50),
    },
  });
}
