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

  // Monta filtro da carteira
  const where: any = {
    competenciaId,
    ativo: true,
    contrato: { inadimplenciaEquivocada: false },
  };

  if (consultorId) {
    where.consultorId = consultorId;
  } else {
    // Todos os consultores da equipe
    const equipe = await prisma.equipe.findUnique({
      where: { id: equipeId },
      select: { usuarios: { where: { ativo: true, perfil: "CONSULTOR" }, select: { id: true } } },
    });
    if (!equipe) return NextResponse.json({ totalInadimplencia: 0 });
    where.consultorId = { in: equipe.usuarios.map((u) => u.id) };
  }

  const carteiras = await prisma.carteiraParcela.findMany({
    where,
    select: { contrato: { select: { valorTotalAberto: true } } },
  });

  const totalInadimplencia = carteiras.reduce(
    (s, c) => s + Number(c.contrato.valorTotalAberto ?? 0),
    0
  );

  return NextResponse.json({ totalInadimplencia });
}
