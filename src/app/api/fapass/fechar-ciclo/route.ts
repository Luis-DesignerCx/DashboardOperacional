import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { competenciaId } = await req.json();
  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

  const competencia = await prisma.competencia.findUnique({ where: { id: competenciaId } });
  if (!competencia) return NextResponse.json({ erro: "Competência não encontrada" }, { status: 404 });
  if (competencia.fechada) return NextResponse.json({ erro: "Competência já fechada" }, { status: 400 });

  const totalInad = await prisma.faPassInadimplencia.aggregate({
    where: { competenciaId },
    _sum: { valor: true },
    _count: true,
  });

  const totalBaixas = await prisma.faPassBaixa.aggregate({
    where: { competenciaId },
    _sum: { valor: true },
    _count: true,
  });

  await prisma.competencia.update({
    where: { id: competenciaId },
    data: { fechada: true, fechadaEm: new Date() },
  });

  return NextResponse.json({
    ok: true,
    competencia: competencia.descricao,
    totalInadimplencia: Number(totalInad._sum.valor ?? 0),
    totalContratos: totalInad._count,
    totalBaixado: Number(totalBaixas._sum.valor ?? 0),
  });
}
