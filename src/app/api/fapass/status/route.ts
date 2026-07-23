import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const competenciaId = searchParams.get("competenciaId");
  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

  const [ultimaSync, totalInad, totalBaixas, totalDiverg] = await Promise.all([
    prisma.faPassSync.findFirst({
      where: { competenciaId },
      orderBy: { criadoEm: "desc" },
    }),
    prisma.faPassInadimplencia.aggregate({
      where: { competenciaId },
      _sum: { valor: true },
      _count: true,
    }),
    prisma.faPassBaixa.aggregate({
      where: { competenciaId },
      _sum: { valor: true },
      _count: true,
    }),
    prisma.faPassDivergencia.count({
      where: { competenciaId, status: "PENDENTE" },
    }),
  ]);

  return NextResponse.json({
    ultimaSync,
    totalInadimplencia: Number(totalInad._sum.valor ?? 0),
    totalContratos: totalInad._count,
    totalBaixado: Number(totalBaixas._sum.valor ?? 0),
    divergenciasPendentes: totalDiverg,
  });
}
