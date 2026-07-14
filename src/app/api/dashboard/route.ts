import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const competenciaId = searchParams.get("competenciaId");
  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

  // Gestor/Admin pode filtrar por uma ou mais frentes via query param (vírgula-separado)
  const equipeIdsParam = searchParams.get("equipeIds");
  const equipeIdParam  = searchParams.get("equipeId"); // compat legado
  const equipeIdsRaw   = equipeIdsParam ?? (equipeIdParam ?? "");
  const equipeIds      = equipeIdsRaw ? equipeIdsRaw.split(",").filter(Boolean) : [];

  try {
    if (session.user.perfil === "CONSULTOR") {
      return NextResponse.json(await dashboardConsultor(session.user.id, competenciaId));
    }
    if (session.user.perfil === "GESTOR") {
      const ids = equipeIds.length > 0 ? equipeIds : (session.user.equipeId ? [session.user.equipeId] : []);
      return NextResponse.json(await dashboardGestor(ids, competenciaId));
    }
    if (session.user.perfil === "ADMINISTRADOR" && equipeIds.length > 0) {
      return NextResponse.json(await dashboardGestor(equipeIds, competenciaId));
    }
    return NextResponse.json(await dashboardExecutivo(competenciaId));
  } catch (err: any) {
    console.error("[dashboard]", err);
    return NextResponse.json({ erro: err.message || "Erro interno" }, { status: 500 });
  }
}

async function dashboardConsultor(consultorId: string, competenciaId: string) {
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);

  const competencia = await prisma.competencia.findUnique({
    where: { id: competenciaId },
    select: { mes: true, ano: true },
  });
  const iniComp = competencia ? new Date(competencia.ano, competencia.mes - 1, 1) : new Date(0);
  const fimComp = competencia ? new Date(competencia.ano, competencia.mes, 0, 23, 59, 59, 999) : new Date();

  const [
    carteira,
    recebimentoAgg,
    recebimentosAParte,
    promessasHojeAgg,
    promessasVencidasAgg,
    promessasAbertasAgg,
    agendadosHoje,
    metasResult,
  ] = await Promise.all([
    prisma.carteiraParcela.findMany({
      where: { consultorId, competenciaId, ativo: true, contrato: { inadimplenciaEquivocada: false } },
      select: {
        contrato: {
          select: {
            clienteId: true,
            valorTotalAberto: true,
            promessas: { where: { status: "ABERTA" }, select: { id: true } },
          },
        },
      },
    }),
    prisma.recebimento.aggregate({
      where: {
        consultorId,
        contrato: { inadimplenciaEquivocada: false, carteiras: { some: { consultorId, competenciaId, ativo: true } } },
        dataRecebimento: { gte: iniComp, lte: fimComp },
      },
      _sum: { valor: true },
    }),
    prisma.recebimento.findMany({
      where: {
        consultorId,
        contrato: { inadimplenciaEquivocada: false, carteiras: { some: { consultorId, competenciaId, ativo: true } } },
        dataRecebimento: { gte: iniComp, lte: fimComp },
      },
      select: { valorAParte: true },
    }),
    prisma.promessa.aggregate({
      where: { consultorId, status: "ABERTA", dataPrometida: { gte: inicioHoje, lte: fimHoje } },
      _count: true,
      _sum: { valorPrometido: true },
    }),
    prisma.promessa.aggregate({
      where: { consultorId, status: "ABERTA", dataPrometida: { lt: inicioHoje } },
      _count: true,
      _sum: { valorPrometido: true },
    }),
    prisma.promessa.aggregate({
      where: { consultorId, status: "ABERTA" },
      _count: true,
      _sum: { valorPrometido: true },
    }),
    prisma.contato.count({
      where: {
        consultorId,
        status: { in: ["LIGAR_DEPOIS", "AGUARDANDO_RETORNO"] },
        agendadoPara: { gte: inicioHoje, lte: fimHoje },
      },
    }),
    prisma.meta.findMany({
      where: {
        equipe: { usuarios: { some: { id: consultorId } } },
        competenciaId,
        OR: [{ consultorId: null }, { consultorId }],
      },
      select: { valorAlvo: true, percentualAlvo: true, consultorId: true },
    }),
  ]);

  // Prefere meta específica do consultor; se não houver, usa meta da equipe (consultorId null)
  const metaEspecifica = metasResult.find((m) => m.consultorId === consultorId) ?? null;
  const metaGlobal = metasResult.find((m) => m.consultorId === null) ?? null;
  const meta = metaEspecifica ?? metaGlobal;

  const valorCarteira = carteira.reduce((s, c) => s + Number(c.contrato.valorTotalAberto ?? 0), 0);
  const totalClientes = new Set(carteira.map((c) => c.contrato.clienteId)).size;
  const promessasAbertas = promessasAbertasAgg._count;
  const valorRecebido = Number(recebimentoAgg._sum.valor ?? 0);
  const valorAParte = recebimentosAParte.reduce((s: number, r: any) => s + Number(r.valorAParte ?? 0), 0);

  // Se a meta usa percentualAlvo, calcula o alvo sobre a carteira individual do consultor
  const metaAlvo = meta
    ? meta.percentualAlvo && valorCarteira > 0
      ? (Number(meta.percentualAlvo) / 100) * valorCarteira
      : meta.valorAlvo ? Number(meta.valorAlvo) : null
    : null;

  return {
    valorCarteira,
    valorRecebido,
    valorAParte,
    totalClientes,
    promessasAbertas,
    valorPromessasAbertas: Number(promessasAbertasAgg._sum.valorPrometido ?? 0),
    promessasHoje: promessasHojeAgg._count,
    valorPromessasHoje: Number(promessasHojeAgg._sum.valorPrometido ?? 0),
    promessasVencidas: promessasVencidasAgg._count,
    valorPromessasVencidas: Number(promessasVencidasAgg._sum.valorPrometido ?? 0),
    agendadosHoje,
    percentualMeta: (metaAlvo && metaAlvo > 0) ? Math.round(((valorRecebido + valorAParte) / metaAlvo) * 10000) / 100 : 0,
    metaAlvo,
  };
}

async function dashboardGestor(equipeIds: string[], competenciaId: string) {
  // Escopo de datas da competência (evita recebimentos de outros meses)
  const competencia = await prisma.competencia.findUnique({
    where: { id: competenciaId },
    select: { mes: true, ano: true },
  });
  const iniComp = competencia ? new Date(competencia.ano, competencia.mes - 1, 1) : new Date(0);
  const fimComp = competencia ? new Date(competencia.ano, competencia.mes, 0, 23, 59, 59, 999) : new Date();

  // Sem filtro = todas as frentes
  const semFiltro = equipeIds.length === 0;

  // Filtro de consultor: frente principal OU frente adicional (EquipeConsultor)
  const filtroConsultor = semFiltro
    ? { ativo: true, perfil: "CONSULTOR" as const }
    : {
        ativo: true,
        perfil: "CONSULTOR" as const,
        OR: equipeIds.flatMap((eqId) => [
          { equipeId: eqId },
          { frentesAdicionais: { some: { equipeId: eqId } } },
        ]),
      };

  const consultores = await prisma.usuario.findMany({
    where: filtroConsultor,
    select: { id: true, nome: true },
  });

  const consultorIds = consultores.map((c) => c.id);

  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);

  const [
    carteiras,
    recebidoAgg,
    baixadoAgg,
    rankingAgg,
    meta,
    aprovacoesPendentes,
    promessasHojeAgg,
    promessasVencidasAgg,
    clientesRegularizados,
    recebidoHojeAgg,
  ] = await Promise.all([
    prisma.carteiraParcela.findMany({
      where: { consultorId: { in: consultorIds }, competenciaId, ativo: true, contrato: { inadimplenciaEquivocada: false } },
      select: { contrato: { select: { valorTotalAberto: true } } },
    }),
    prisma.recebimento.aggregate({
      where: {
        consultorId: { in: consultorIds },
        contrato: { inadimplenciaEquivocada: false, carteiras: { some: { consultorId: { in: consultorIds }, competenciaId, ativo: true } } },
        baixaOficial: false,
        dataRecebimento: { gte: iniComp, lte: fimComp },
      },
      _sum: { valor: true },
    }),
    prisma.recebimento.aggregate({
      where: {
        consultorId: { in: consultorIds },
        contrato: { inadimplenciaEquivocada: false, carteiras: { some: { consultorId: { in: consultorIds }, competenciaId, ativo: true } } },
        baixaOficial: true,
        dataRecebimento: { gte: iniComp, lte: fimComp },
      },
      _sum: { valorBaixado: true },
    }),
    prisma.recebimento.groupBy({
      by: ["consultorId"],
      where: {
        consultorId: { in: consultorIds },
        contrato: { inadimplenciaEquivocada: false, carteiras: { some: { consultorId: { in: consultorIds }, competenciaId, ativo: true } } },
        dataRecebimento: { gte: iniComp, lte: fimComp },
      },
      _sum: { valor: true },
    }),
    equipeIds.length === 1
      ? prisma.meta.findFirst({ where: { equipeId: equipeIds[0], competenciaId }, select: { valorAlvo: true } })
      : semFiltro
        ? prisma.meta.findFirst({ where: { competenciaId }, select: { valorAlvo: true } })
        : prisma.meta.findFirst({ where: { equipeId: { in: equipeIds }, competenciaId }, select: { valorAlvo: true } }),
    prisma.solicitacao.count({ where: { status: "PENDENTE" } }),
    // Promessas do dia
    prisma.promessa.aggregate({
      where: { consultorId: { in: consultorIds }, status: "ABERTA", dataPrometida: { gte: inicioHoje, lte: fimHoje } },
      _count: true,
      _sum: { valorPrometido: true },
    }),
    // Promessas vencidas
    prisma.promessa.aggregate({
      where: { consultorId: { in: consultorIds }, status: "ABERTA", dataPrometida: { lt: inicioHoje } },
      _count: true,
      _sum: { valorPrometido: true },
    }),
    // Clientes regularizados (statusRecuperacao = RECUPERADO_INTEGRALMENTE na carteira)
    prisma.carteiraParcela.count({
      where: {
        consultorId: { in: consultorIds },
        competenciaId,
        ativo: true,
        contrato: { statusRecuperacao: "RECUPERADO_INTEGRALMENTE" },
      },
    }),
    // Recebido hoje para calcular eficiência
    prisma.recebimento.aggregate({
      where: {
        consultorId: { in: consultorIds },
        contrato: { inadimplenciaEquivocada: false, carteiras: { some: { consultorId: { in: consultorIds }, competenciaId, ativo: true } } },
        dataRecebimento: { gte: inicioHoje, lte: fimHoje },
      },
      _sum: { valor: true },
    }),
  ]);

  const inadimplenciaInicial = carteiras.reduce((s, c) => s + Number(c.contrato.valorTotalAberto ?? 0), 0);
  const recebido = Number(recebidoAgg._sum.valor ?? 0);
  const baixado = Number(baixadoAgg._sum.valorBaixado ?? 0);
  const valorAgendadoHoje = Number(promessasHojeAgg._sum.valorPrometido ?? 0);
  const recebidoHoje = Number(recebidoHojeAgg._sum.valor ?? 0);
  const eficienciaHoje = valorAgendadoHoje > 0 ? Math.round((recebidoHoje / valorAgendadoHoje) * 10000) / 100 : 0;

  const recebidoMap = new Map(rankingAgg.map((r) => [r.consultorId, Number(r._sum.valor ?? 0)]));
  const rankingConsultores = consultores
    .map((c) => ({ id: c.id, nome: c.nome, recebido: recebidoMap.get(c.id) ?? 0 }))
    .sort((a, b) => b.recebido - a.recebido);

  return {
    inadimplenciaInicial,
    recebido,
    baixado,
    percentualMeta: (meta && meta.valorAlvo && Number(meta.valorAlvo) > 0) ? Math.round((baixado / Number(meta.valorAlvo)) * 10000) / 100 : 0,
    metaAlvo: (meta && meta.valorAlvo) ? Number(meta.valorAlvo) : null,
    aprovacoesPendentes,
    totalConsultores: consultores.length,
    rankingConsultores,
    clientesRegularizados,
    promessasHoje: promessasHojeAgg._count,
    valorAgendadoHoje,
    promessasVencidas: promessasVencidasAgg._count,
    valorPromessasVencidas: Number(promessasVencidasAgg._sum.valorPrometido ?? 0),
    eficienciaHoje,
  };
}

async function dashboardExecutivo(competenciaId: string) {
  const [carteiras, recebimentosPorContrato, parcelasCount, empresas] = await Promise.all([
    // Seleção mínima — sem recebimentos
    prisma.carteiraParcela.findMany({
      where: { competenciaId, ativo: true, contrato: { inadimplenciaEquivocada: false } },
      select: {
        contratoId: true,
        contrato: {
          select: {
            clienteId: true,
            empresaId: true,
            valorTotalAberto: true,
            statusRecuperacao: true,
          },
        },
      },
    }),
    // GroupBy contrato — SUM no banco em vez de carregar todos os registros
    prisma.recebimento.groupBy({
      by: ["contratoId"],
      where: { contrato: { carteiras: { some: { competenciaId, ativo: true } } } },
      _sum: { valor: true },
    }),
    prisma.parcela.count({
      where: { contrato: { carteiras: { some: { competenciaId } } } },
    }),
    prisma.empresa.findMany({ select: { id: true, nome: true } }),
  ]);

  const recebMap = new Map(recebimentosPorContrato.map((r) => [r.contratoId, Number(r._sum.valor ?? 0)]));
  const empresaMap = new Map(empresas.map((e) => [e.id, e.nome]));

  const inadimplenciaTotal = carteiras.reduce((s, c) => s + Number(c.contrato.valorTotalAberto ?? 0), 0);
  const recuperacaoTotal = carteiras.reduce((s, c) => s + (recebMap.get(c.contratoId) ?? 0), 0);
  const totalClientes = new Set(carteiras.map((c) => c.contrato.clienteId)).size;
  const totalContratos = new Set(carteiras.map((c) => c.contratoId)).size;
  const contratosRecuperados = carteiras.filter((c) => (recebMap.get(c.contratoId) ?? 0) > 0).length;

  const porEmpresa = new Map<string, { nome: string; inadimplencia: number; recuperado: number; clientes: Set<string>; contratos: Set<string> }>();
  for (const c of carteiras) {
    const empId = c.contrato.empresaId;
    if (!porEmpresa.has(empId)) {
      porEmpresa.set(empId, { nome: empresaMap.get(empId) ?? empId, inadimplencia: 0, recuperado: 0, clientes: new Set(), contratos: new Set() });
    }
    const reg = porEmpresa.get(empId)!;
    reg.inadimplencia += Number(c.contrato.valorTotalAberto ?? 0);
    reg.recuperado += recebMap.get(c.contratoId) ?? 0;
    reg.clientes.add(c.contrato.clienteId);
    reg.contratos.add(c.contratoId);
  }

  const rankingEmpresas = Array.from(porEmpresa.values())
    .map((e) => ({
      nome: e.nome,
      inadimplencia: e.inadimplencia,
      recuperado: e.recuperado,
      clientes: e.clientes.size,
      contratos: e.contratos.size,
      percentual: e.inadimplencia ? Math.min((e.recuperado / e.inadimplencia) * 100, 100) : 0,
    }))
    .sort((a, b) => b.percentual - a.percentual);

  return {
    inadimplenciaTotal,
    recuperacaoTotal,
    percentualGeral: inadimplenciaTotal ? Math.min((recuperacaoTotal / inadimplenciaTotal) * 100, 100) : 0,
    totalClientes,
    totalContratos,
    totalParcelas: parcelasCount,
    contratosRecuperados,
    rankingEmpresas,
  };
}
