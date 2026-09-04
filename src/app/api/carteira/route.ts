import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const competenciaId = searchParams.get("competenciaId");
  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

  // Escopo de datas da competência -- os recebimentos exibidos/somados na
  // carteira precisam ser só os DESSE mês. Sem isso, um pagamento de um mês
  // anterior (recebido por OUTRO consultor, antes do cliente cair pra essa
  // carteira) aparecia contado como se fosse recebimento do consultor atual
  // nessa competência -- mesmo bug já corrigido no dashboard/comissão
  // (ver commit c3080b7), faltava aqui.
  const competenciaAtual = await prisma.competencia.findUnique({
    where: { id: competenciaId },
    select: { mes: true, ano: true },
  });
  const iniComp = competenciaAtual ? new Date(Date.UTC(competenciaAtual.ano, competenciaAtual.mes - 1, 1, 3, 0, 0, 0)) : new Date(0);
  const fimComp = competenciaAtual ? new Date(Date.UTC(competenciaAtual.ano, competenciaAtual.mes, 1, 2, 59, 59, 999)) : new Date();

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const busca = searchParams.get("busca")?.trim() || "";
  const sort = searchParams.get("sort") ?? "diasAtraso";
  const statusRecuperacao = searchParams.get("statusRecuperacao") || "";
  const situacao = searchParams.get("situacao") || "";
  const skip = (page - 1) * PAGE_SIZE;

  // Quando qualquer filtro de status está ativo, retorna tudo sem paginação
  const temFiltroAtivo = !!(statusRecuperacao || situacao);

  const where: any = { competenciaId, ativo: true };
  if (session.user.perfil === "CONSULTOR") where.consultorId = session.user.id;

  where.contrato = { inadimplenciaEquivocada: false };
  if (busca) {
    where.contrato.OR = [
      { cliente: { nome: { contains: busca, mode: "insensitive" } } },
      { numero: { contains: busca, mode: "insensitive" } },
    ];
  }
  if (statusRecuperacao === "RECUPERADO_INTEGRALMENTE") {
    where.contrato.statusRecuperacao = "RECUPERADO_INTEGRALMENTE";
  } else if (statusRecuperacao === "RECUPERACAO_PARCIAL") {
    where.contrato.statusRecuperacao = "RECUPERACAO_PARCIAL";
  } else if (statusRecuperacao === "INADIMPLENTE_TODOS") {
    where.contrato.statusRecuperacao = { not: "RECUPERADO_INTEGRALMENTE" };
  }
  if (situacao) {
    where.contrato.situacao = situacao;
  }

  // Ordenação -- sempre com "id" como critério de desempate final. Sem isso,
  // como MUITOS contratos empatam no campo principal (ex: vários com
  // exatamente os mesmos "dias em atraso"), o Postgres não garante a MESMA
  // ordem entre duas consultas separadas -- e como a carteira busca todas as
  // páginas em sequência (uma consulta por página), isso podia fazer a
  // mesma linha aparecer em duas páginas (duplicada) ou sumir entre elas,
  // dependendo de como o banco decidiu ordenar os empates daquela vez.
  let orderBy: any;
  if (sort === "parcelasAtraso") {
    orderBy = [{ contrato: { totalParcelasVencidas: "desc" } }, { id: "asc" }];
  } else if (sort === "parcelasAberto") {
    orderBy = [{ contrato: { valorTotalAberto: "desc" } }, { id: "asc" }];
  } else {
    orderBy = [{ contrato: { maiorDiasAtraso: "desc" } }, { id: "asc" }];
  }

  // Filtro de parcelas vivas com o mesmo escopo da carteira (para totalizar corretamente)
  const whereParcelaTotal: any = {
    paga: false,
    equivocada: false,
    contrato: {
      inadimplenciaEquivocada: false,
      carteiras: { some: where },
    },
  };

  const [total, contratos, parcelasAgg] = await Promise.all([
    prisma.carteiraParcela.count({ where }),
    prisma.carteiraParcela.findMany({
      where,
      ...(temFiltroAtivo ? {} : { skip, take: PAGE_SIZE }),
      select: {
        id: true,
        contrato: {
          select: {
            id: true,
            numero: true,
            maiorDiasAtraso: true,
            valorTotalAberto: true,
            statusContrato: true,
            statusRecuperacao: true,
            situacao: true,
            totalParcelasVencidas: true,
            cliente: { select: { id: true, nome: true, telefones: true, emails: true } },
            empresa: { select: { id: true, nome: true } },
            contatos: {
              orderBy: { criadoEm: "desc" },
              take: 1,
              select: { tipo: true, status: true, criadoEm: true, agendadoPara: true },
            },
            promessas: {
              where: { status: "ABERTA" },
              select: { id: true, valorPrometido: true, dataPrometida: true },
              take: 5,
            },
            recebimentos: {
              where: { dataRecebimento: { gte: iniComp, lte: fimComp } },
              select: { id: true, valor: true, valorAParte: true, dataRecebimento: true, formaPagamento: true },
            },
            parcelas: {
              where: { paga: false },
              select: { id: true, numero: true, valorTotalAberto: true, diasAtraso: true, dataVencimento: true, remanejada: true },
              orderBy: { numero: "asc" },
            },
          },
        },
        consultor: { select: { id: true, nome: true } },
      },
      orderBy,
    }),
    prisma.parcela.aggregate({ where: whereParcelaTotal, _sum: { valorTotalAberto: true } }),
  ]);

  const valorTotal = Number(parcelasAgg._sum.valorTotalAberto ?? 0);

  return NextResponse.json({
    contratos,
    total,
    valorTotal,
    page,
    pageSize: PAGE_SIZE,
    temMais: temFiltroAtivo ? false : skip + contratos.length < total,
  });
}
