import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const where: any = {};
  if (session.user.perfil === "CONSULTOR") where.solicitanteId = session.user.id;

  const solicitacoes = await prisma.solicitacao.findMany({
    where,
    include: {
      solicitante: {
        select: {
          nome: true,
          equipe: { select: { nome: true, tipo: true } },
        },
      },
      contrato: {
        select: {
          numero: true,
          cliente: { select: { nome: true } },
          empresa: { select: { nome: true } },
          carteiras: {
            where: { ativo: true },
            select: {
              consultor: {
                select: {
                  nome: true,
                  equipe: { select: { nome: true, tipo: true } },
                },
              },
            },
            orderBy: { atribuidoEm: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { criadoEm: "desc" },
  });

  return NextResponse.json(solicitacoes);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { tipo, motivo, contratoId, dados } = await req.json();

  const solicitacao = await prisma.solicitacao.create({
    data: {
      tipo,
      motivo,
      contratoId: contratoId || null,
      dados: dados || null,
      solicitanteId: session.user.id,
    },
  });

  return NextResponse.json(solicitacao, { status: 201 });
}
