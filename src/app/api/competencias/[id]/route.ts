import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const competencia = await prisma.competencia.findUnique({ where: { id: params.id } });
  if (!competencia) return NextResponse.json({ erro: "Competência não encontrada" }, { status: 404 });
  if (competencia.fechada) return NextResponse.json({ erro: "Competência já está fechada" }, { status: 400 });

  const updated = await prisma.competencia.update({
    where: { id: params.id },
    data: { fechada: true, fechadaEm: new Date() },
  });

  return NextResponse.json(updated);
}
