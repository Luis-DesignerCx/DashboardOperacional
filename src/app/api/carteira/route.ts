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

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const busca = searchParams.get("busca")?.trim() || "";
  const sort = searchParams.get("sort") ?? "diasAtraso"; // diasAtraso | parcelasAtraso | parcelasAberto
  const skip = (page - 1) * PAGE_SIZE;

  const where: any = { competenciaId, ativo: true };
  if (session.user.perfil === "CONSULTOR") where.consultorId = session.user.id;

  where.contrato = { inadimplenciaEquivocada: false };
  if (busca) {
    where.contrato.OR = [
      { cliente: { nome: { contains: busca, mode: "insensitive" } } },
      { numero: { contains: busca, mode: "insensitive" } },
    ];
  }

  // Ordenação
  let orderBy: any;
  if (sort === "parcelasAtraso") {
    orderBy = { contrato: { totalParcelasVencidas: "desc" } };
  } else if (sort === "parcelasAberto") {
    orderBy = { contrato: { valorTotalAberto: "desc" } };
  } else {
    orderBy = { contrato: { maiorDiasAtraso: "desc" } };
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
      skip,
      take: PAGE_SIZE,
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
    temMais: skip + contratos.length < total,
  });
}
