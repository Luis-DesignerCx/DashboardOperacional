import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Endpoint one-time: move usuários da equipe CR_PDD_181 para CR_PDD_91_180
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.perfil !== "ADMINISTRADOR") {
    return NextResponse.json({ erro: "Apenas administradores" }, { status: 403 });
  }

  const equipe181 = await prisma.equipe.findFirst({ where: { tipo: "CR_PDD_181" } });
  const equipe91  = await prisma.equipe.findFirst({ where: { tipo: "CR_PDD_91_180" } });

  if (!equipe181 || !equipe91) {
    return NextResponse.json({ erro: "Equipes não encontradas" }, { status: 404 });
  }

  const result = await prisma.usuario.updateMany({
    where: { equipeId: equipe181.id },
    data:  { equipeId: equipe91.id },
  });

  return NextResponse.json({ ok: true, usuariosMovidos: result.count });
}
