import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Retorna o total de inadimplência de uma equipe (ou consultor) numa competência.
// Usado para calcular a prévia do valor alvo quando a meta é definida em %.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const equipeId = searchParams.get("equipeId");
  const competenciaId = searchParams.get("competenciaId");
  const consultorId = searchParams.get("consultorId");

  if (!equipeId || !competenciaId) {
    return NextResponse.json({ erro: "equipeId e competenciaId obrigatórios" }, { status: 400 });
  }

  let consultorIds: string[];

  if (consultorId) {
    consultorIds = [consultorId];
  } else {
    const equipe = await prisma.equipe.findUnique({
      where: { id: equipeId },
      select: {
        usuarios: { where: { ativo: true, perfil: "CONSULTOR" }, select: { id: true } },
        consultoresAdicionais: { where: { ativo: true, perfil: "CONSULTOR" }, select: { id: true } },
      },
    });
    if (!equipe) return NextResponse.json({ totalInadimplencia: 0 });
    consultorIds = [
      ...equipe.usuarios.map((u) => u.id),
      ...equipe.consultoresAdicionais.map((u) => u.id),
    ];
  }

  // Mesma base do dashboard e da comissão: parcelas paga:false, equivocada:false
  const agg = await prisma.parcela.aggregate({
    where: {
      paga: false,
      equivocada: false,
      contrato: {
        inadimplenciaEquivocada: false,
        carteiras: { some: { consultorId: { in: consultorIds }, competenciaId, ativo: true } },
      },
    },
    _sum: { valorTotalAberto: true },
  });

  return NextResponse.json({ totalInadimplencia: Number(agg._sum.valorTotalAberto ?? 0) });
}
