import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormaPagamento } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { contratoId, valorPrometido, dataPrometida, formaPagamento, observacao } = await req.json();

  if (!contratoId || !valorPrometido || !dataPrometida || !formaPagamento) {
    return NextResponse.json({ erro: "Campos obrigatórios ausentes" }, { status: 400 });
  }

  const promessa = await prisma.promessa.create({
    data: {
      contratoId,
      consultorId: session.user.id,
      valorPrometido: new Decimal(valorPrometido),
      dataPrometida: new Date(dataPrometida),
      formaPagamento: formaPagamento as FormaPagamento,
      observacao: observacao || null,
      status: "ABERTA",
    },
  });

  await prisma.contato.create({
    data: {
      contratoId,
      consultorId: session.user.id,
      tipo: "LIGACAO",
      status: "PROMESSA_PAGAMENTO",
      observacao: `Promessa: R$ ${valorPrometido} para ${new Date(dataPrometida).toLocaleDateString("pt-BR")}`,
    },
  });

  return NextResponse.json(promessa, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const contratoId = searchParams.get("contratoId");
  const status = searchParams.get("status");
  const hoje = searchParams.get("vencendoHoje") === "true";

  const where: any = {};
  if (contratoId) where.contratoId = contratoId;
  if (status) where.status = status;
  if (session.user.perfil === "CONSULTOR") where.consultorId = session.user.id;
  if (hoje) {
    const inicioHoje = new Date(); inicioHoje.setHours(0, 0, 0, 0);
    const fimHoje = new Date(); fimHoje.setHours(23, 59, 59, 999);
    where.dataPrometida = { gte: inicioHoje, lte: fimHoje };
    where.status = "ABERTA";
  }

  const promessas = await prisma.promessa.findMany({
    where,
    include: {
      contrato: { include: { cliente: true, empresa: true } },
      consultor: { select: { nome: true } },
    },
    orderBy: { dataPrometida: "asc" },
  });

  return NextResponse.json(promessas);
}
