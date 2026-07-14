import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const ORDEM: Record<string, number> = { FLASH: 1, CRA_1_30: 2, CR_31_90: 3, CR_PDD_91_180: 4 };

  const equipes = await prisma.equipe.findMany({
    include: {
      usuarios: { where: { ativo: true }, select: { id: true, nome: true, perfil: true, emFerias: true } },
    },
  });

  equipes.sort((a, b) => (ORDEM[a.tipo] ?? 9) - (ORDEM[b.tipo] ?? 9));

  return NextResponse.json(equipes);
}
