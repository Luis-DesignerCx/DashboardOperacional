import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.perfil !== "ADMINISTRADOR") {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const registros = await prisma.auditoria.findMany({
    include: { usuario: { select: { nome: true, email: true } } },
    orderBy: { criadoEm: "desc" },
    take: 500,
  });

  return NextResponse.json(registros);
}
