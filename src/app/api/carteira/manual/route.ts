import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { contratoId, competenciaId } = await req.json();
  if (!contratoId || !competenciaId) {
    return NextResponse.json({ erro: "contratoId e competenciaId são obrigatórios" }, { status: 400 });
  }

  // Verifica se já tem carteira
  const existente = await prisma.carteiraParcela.findUnique({
    where: { contratoId_competenciaId: { contratoId, competenciaId } },
  });
  if (existente) return NextResponse.json({ erro: "Contrato já está em uma carteira nessa competência" }, { status: 409 });

  const carteira = await prisma.carteiraParcela.create({
    data: {
      id: randomUUID(),
      contratoId,
      consultorId: session.user.id,
      competenciaId,
    },
  });

  return NextResponse.json(carteira, { status: 201 });
}
