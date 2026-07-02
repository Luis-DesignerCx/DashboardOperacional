import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const equipes = await prisma.equipe.findMany({
    include: {
      usuarios: { where: { ativo: true }, select: { id: true, nome: true, perfil: true, emFerias: true } },
    },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json(equipes);
}
