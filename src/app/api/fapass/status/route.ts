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

  const [ultimaSync, numerosInad, totalBaixas, totalDiverg] = await Promise.all([
    prisma.faPassSync.findFirst({
      where: { competenciaId },
      orderBy: { criadoEm: "desc" },
    }),
    prisma.faPassInadimplencia.findMany({
      where: { competenciaId },
      select: { contratoNumero: true },
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

  // Contratos que o consultor marcou como "cancelamento"/inadimplência equivocada
  // saem do total geral -- mesma regra já aplicada em todo o resto do sistema
  // (ver contrato.inadimplenciaEquivocada em carteira/dashboard/comissão), só
  // que nunca tinha sido aplicada aqui no Fã Pass.
  const numerosDistintos = [...new Set(numerosInad.map((r) => r.contratoNumero))];
  const equivocados = numerosDistintos.length
    ? await prisma.contrato.findMany({
        where: { numero: { in: numerosDistintos }, inadimplenciaEquivocada: true },
        select: { numero: true },
      })
    : [];
  const numerosEquivocados = equivocados.map((c) => c.numero);

  const totalInad = await prisma.faPassInadimplencia.aggregate({
    where: { competenciaId, contratoNumero: { notIn: numerosEquivocados } },
    _sum: { valor: true },
    _count: true,
  });

  return NextResponse.json({
    ultimaSync,
    totalInadimplencia: Number(totalInad._sum.valor ?? 0),
    totalContratos: totalInad._count,
    totalBaixado: Number(totalBaixas._sum.valor ?? 0),
    divergenciasPendentes: totalDiverg,
  });
}
