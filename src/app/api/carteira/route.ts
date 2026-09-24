import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEquipesGerenciadas } from "@/lib/frentes";

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
  // Filtros multi-seleção -- chegam como lista separada por vírgula (ex:
  // "RECUPERACAO_PARCIAL,INADIMPLENTE"); array vazio = sem filtro (mostra tudo).
  const statusRecuperacao = (searchParams.get("statusRecuperacao") || "").split(",").filter(Boolean);
  const situacao = (searchParams.get("situacao") || "").split(",").filter(Boolean);
  const baseVencimentoParam = (searchParams.get("baseVencimento") || "").split(",").filter(Boolean);
  const skip = (page - 1) * PAGE_SIZE;

  // Quando qualquer filtro de status está ativo, retorna tudo sem paginação
  const temFiltroAtivo = statusRecuperacao.length > 0 || situacao.length > 0 || baseVencimentoParam.length > 0;

  const where: any = { competenciaId, ativo: true };
  if (session.user.perfil === "CONSULTOR") where.consultorId = session.user.id;
  // GESTOR só vê carteira de consultor de uma frente que ele gerencia --
  // sem isso, essa tela (pensada pro consultor, mas alcançável por
  // qualquer perfil autenticado) devolvia a carteira da empresa inteira
  // pra um gestor (achado real da auditoria de segurança, 2026-09-15).
  if (session.user.perfil === "GESTOR") {
    const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
    where.consultor = { equipeId: { in: equipesGerenciadas } };
  }
  if (baseVencimentoParam.length > 0) where.baseVencimento = { in: baseVencimentoParam.map((v) => parseInt(v)) };

  where.contrato = { inadimplenciaEquivocada: false };
  if (busca) {
    where.contrato.OR = [
      { cliente: { nome: { contains: busca, mode: "insensitive" } } },
      { numero: { contains: busca, mode: "insensitive" } },
    ];
  }
  if (statusRecuperacao.length > 0) {
    where.contrato.statusRecuperacao = { in: statusRecuperacao };
  }
  // "Situação" filtra por StatusContato (enum do modelo Contato, via
  // contratoId) -- NÃO pelo enum SituacaoContrato do próprio Contrato (bug
  // pré-existente: comparar direto contra where.contrato.situacao usando
  // valores de StatusContato como "LINK_ENVIADO"/"AGUARDANDO_RETORNO"/
  // "LIGAR_DEPOIS" fazia o Prisma rejeitar por enum inválido -- só
  // "PROMESSA_PAGAMENTO" funcionava, por coincidência, por ser válido nos
  // dois enums). Aqui, contratos com AO MENOS UM contato registrado com
  // esse status.
  if (situacao.length > 0) {
    where.contrato.contatos = { some: { status: { in: situacao } } };
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

  const [total, contratos, carteiraTotalAgg] = await Promise.all([
    prisma.carteiraParcela.count({ where }),
    prisma.carteiraParcela.findMany({
      where,
      ...(temFiltroAtivo ? {} : { skip, take: PAGE_SIZE }),
      select: {
        id: true,
        tipoEquipe: true,
        baseVencimento: true,
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
            // Só o último contato DESTA competência -- um contato de uma
            // competência fechada (ex: "Recebido" registrado em agosto)
            // não pode aparecer como selo de status em setembro, se o
            // contrato voltou com dívida nova e ainda não teve contato
            // nenhum neste mês (achado real: cliente Wallysson Alves
            // Pereira, contrato pago em agosto, novo débito Flash em
            // setembro, selo "Recebido" vazando do mês fechado).
            contatos: {
              where: { criadoEm: { gte: iniComp, lte: fimComp } },
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
              select: { id: true, numero: true, valorTotalAberto: true, diasAtraso: true, dataVencimento: true, remanejada: true, equivocada: true },
              orderBy: { numero: "asc" },
            },
          },
        },
        consultor: { select: { id: true, nome: true } },
      },
      orderBy,
    }),
    // Carteira Total: soma o valorTotalAberto do CONTRATO (fixo), não a soma
    // ao vivo das parcelas em aberto -- mesma correção do dashboard (21/09).
    // Antes usava prisma.parcela.aggregate(paga:false), que caía a cada
    // pagamento parcial e fazia o total do topo de "Minha Carteira" divergir
    // do total do dashboard pro mesmo consultor/competência (achado real:
    // Leticia Cristina da Silva Sergio, 2026-09-22).
    prisma.carteiraParcela.findMany({
      where,
      select: { contrato: { select: { valorTotalAberto: true } } },
    }),
  ]);

  const valorTotal = carteiraTotalAgg.reduce((s, c) => s + Number(c.contrato.valorTotalAberto ?? 0), 0);

  return NextResponse.json({
    contratos,
    total,
    valorTotal,
    page,
    pageSize: PAGE_SIZE,
    temMais: temFiltroAtivo ? false : skip + contratos.length < total,
  });
}
