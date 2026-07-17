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

  const recebWhere = {
    consultorId,
    contrato: { inadimplenciaEquivocada: false, carteiras: { some: { consultorId, competenciaId, ativo: true } } },
    dataRecebimento: { gte: iniComp, lte: fimComp },
  };

  const [
    carteira,
    recebimentosDetalhados,
    promessasHojeAgg,
    promessasVencidasAgg,
    promessasAbertasAgg,
    agendadosHoje,
    metasResult,
    saldoParcelasAgg,
    qtdRecuperados,
    parcelasRemanejadasAgg,
  ] = await Promise.all([
    prisma.carteiraParcela.findMany({
      where: { consultorId, competenciaId, ativo: true, contrato: { inadimplenciaEquivocada: false } },
      select: {
        contrato: {
          select: {
            clienteId: true,
            empresa: { select: { nome: true } },
            promessas: { where: { status: "ABERTA" }, select: { id: true } },
            // Todas as parcelas em aberto (inclui remanejadas — ainda são dívidas ativas)
            parcelas: {
              where: { paga: false, equivocada: false },
              select: { valorTotalAberto: true },
            },
          },
        },
      },
    }),
    // Recebimentos detalhados: cobre valor total, valorAParte, forma pagamento, empresa e cliente
    prisma.recebimento.findMany({
      where: recebWhere,
      select: {
        valor: true,
        valorAParte: true,
        formaPagamento: true,
        contrato: { select: { clienteId: true, empresa: { select: { nome: true } } } },
      },
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
      select: { valorAlvo: true, percentualAlvo: true, quantidadeAlvo: true, consultorId: true, tipo: true },
    }),
    // Base para meta financeira: paga:false, equivocada:false (inclui remanejadas, igual à comissão)
    prisma.parcela.aggregate({
      where: {
        paga: false,
        equivocada: false,
        contrato: {
          inadimplenciaEquivocada: false,
          carteiras: { some: { consultorId, competenciaId, ativo: true } },
        },
      },
      _sum: { valorTotalAberto: true },
    }),
    // Contratos recuperados integralmente (para meta QUANTIDADE)
    prisma.contrato.count({
      where: {
        statusRecuperacao: "RECUPERADO_INTEGRALMENTE",
        carteiras: { some: { consultorId, competenciaId, ativo: true } },
      },
    }),
    // Parcelas remanejadas ainda não pagas
    prisma.parcela.aggregate({
      where: {
        remanejada: true,
        paga: false,
        contrato: {
          inadimplenciaEquivocada: false,
          carteiras: { some: { consultorId, competenciaId, ativo: true } },
        },
      },
      _sum: { valorTotalAberto: true },
    }),
  ]);

  // Para a barra de progresso usa a meta FINANCEIRA (individual tem prioridade no mesmo tipo):
  const metaFinancEsp = metasResult.find((m) => m.consultorId === consultorId && m.tipo === "FINANCEIRA") ?? null;
  const metaFinancGlobal = metasResult.find((m) => m.consultorId === null && m.tipo === "FINANCEIRA") ?? null;
  const meta = metaFinancEsp ?? metaFinancGlobal;

  // Meta QUANTIDADE (individual tem prioridade)
  const metaQtdEsp = metasResult.find((m) => m.consultorId === consultorId && m.tipo === "QUANTIDADE") ?? null;
  const metaQtdGlobal = metasResult.find((m) => m.consultorId === null && m.tipo === "QUANTIDADE") ?? null;
  const metaQtd = metaQtdEsp ?? metaQtdGlobal;

  // Derivar totais dos recebimentos detalhados
  const valorRecebido = recebimentosDetalhados.reduce((s, r) => s + Number(r.valor ?? 0), 0);
  const valorAParte = recebimentosDetalhados.reduce((s, r) => s + Number(r.valorAParte ?? 0), 0);

  // Valor remanejado: só parcelas remanejadas ainda não pagas
  const valorRemanejado = Number(parcelasRemanejadasAgg._sum.valorTotalAberto ?? 0);

  // Agrupamento por forma de pagamento
  const FORMAS_AGRUPADAS: Record<string, string> = {
    PIX: "pix_boleto",
    BOLETO: "pix_boleto",
    CARTAO_CREDITO: "cartao_credito",
    LINK_PAGAMENTO: "cartao_credito",
  };
  const recebidoPorFormaPagamento: Record<string, number> = { pix_boleto: 0, cartao_credito: 0 };
  for (const r of recebimentosDetalhados) {
    const forma = r.formaPagamento as string | null;
    const grupo = forma ? (FORMAS_AGRUPADAS[forma] ?? "pix_boleto") : "pix_boleto";
    recebidoPorFormaPagamento[grupo] += Number(r.valor ?? 0) + Number(r.valorAParte ?? 0);
  }

  // Clientes distintos que fizeram pelo menos um pagamento na competência
  const clientesPagaramTotal = new Set(
    recebimentosDetalhados.map((r) => r.contrato?.clienteId).filter(Boolean)
  ).size;

  // Agrupamento por empreendimento usando parcelas vivas (mesma base do valorCarteira)
  const empresaMap = new Map<string, { contratos: number; recebido: number; saldo: number; clientesPagaram: Set<string> }>();
  for (const cp of carteira) {
    const nome = cp.contrato.empresa?.nome ?? "Sem empresa";
    const saldoContrato = (cp.contrato.parcelas as { valorTotalAberto: any }[])
      .reduce((s, p) => s + Number(p.valorTotalAberto ?? 0), 0);
    if (!empresaMap.has(nome)) empresaMap.set(nome, { contratos: 0, recebido: 0, saldo: saldoContrato, clientesPagaram: new Set() });
    else empresaMap.get(nome)!.saldo += saldoContrato;
    empresaMap.get(nome)!.contratos += 1;
  }
  for (const r of recebimentosDetalhados) {
    const nome = r.contrato?.empresa?.nome ?? "Sem empresa";
    if (!empresaMap.has(nome)) empresaMap.set(nome, { contratos: 0, recebido: 0, saldo: 0, clientesPagaram: new Set() });
    const entry = empresaMap.get(nome)!;
    entry.recebido += Number(r.valor ?? 0) + Number(r.valorAParte ?? 0);
    if (r.contrato?.clienteId) entry.clientesPagaram.add(r.contrato.clienteId);
  }
  const porEmpresa = Array.from(empresaMap.entries())
    .map(([nome, d]) => ({
      nome,
      contratos: d.contratos,
      recebido: d.recebido,
      inadimplencia: d.saldo,
      clientesPagaram: d.clientesPagaram.size,
      eficiencia: (d.recebido + d.saldo) > 0 ? Math.round((d.recebido / (d.recebido + d.saldo)) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.recebido - a.recebido);

  // valorCarteira = saldo devedor total (paga:false, equivocada:false, inclui remanejadas — ainda são dívidas ativas)
  const valorCarteira = Number(saldoParcelasAgg._sum.valorTotalAberto ?? 0);
  const totalClientes = new Set(carteira.map((c) => c.contrato.clienteId)).size;
  const promessasAbertas = promessasAbertasAgg._count;

  // Usa a mesma base de cálculo da comissão: soma de parcelas não pagas/não equivocadas
  const saldoConsultor = Number(saldoParcelasAgg._sum.valorTotalAberto ?? 0);

  const metaAlvo = meta
    ? meta.percentualAlvo && saldoConsultor > 0
      ? (Number(meta.percentualAlvo) / 100) * saldoConsultor
      : meta.valorAlvo ? Number(meta.valorAlvo) : null
    : null;

  return {
    valorCarteira,
    valorRecebido,
    valorAParte,
    valorRemanejado,
    totalClientes,
    clientesPagaram: clientesPagaramTotal,
    promessasAbertas,
    valorPromessasAbertas: Number(promessasAbertasAgg._sum.valorPrometido ?? 0),
    promessasHoje: promessasHojeAgg._count,
    valorPromessasHoje: Number(promessasHojeAgg._sum.valorPrometido ?? 0),
    promessasVencidas: promessasVencidasAgg._count,
    valorPromessasVencidas: Number(promessasVencidasAgg._sum.valorPrometido ?? 0),
    agendadosHoje,
    percentualMeta: (metaAlvo && metaAlvo > 0) ? Math.round(((valorRecebido + valorAParte) / metaAlvo) * 10000) / 100 : 0,
    metaAlvo,
    metaQuantidade: metaQtd?.quantidadeAlvo ? { alvo: Number(metaQtd.quantidadeAlvo), realizado: qtdRecuperados } : null,
    recebidoPorFormaPagamento,
    porEmpresa,
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
