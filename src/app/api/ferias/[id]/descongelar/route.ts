import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEquipesGerenciadas } from "@/lib/frentes";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const ferias = await prisma.feriasConsultor.findUnique({
    where: { id: params.id },
    include: { consultor: { select: { equipeId: true } } },
  });
  if (!ferias) return NextResponse.json({ erro: "Férias não encontradas" }, { status: 404 });

  // GESTOR só descongela snapshot de consultor de uma frente que ele
  // gerencia (achado real da auditoria de segurança, 2026-09-15).
  if (session.user.perfil === "GESTOR") {
    const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
    if (!ferias.consultor.equipeId || !equipesGerenciadas.includes(ferias.consultor.equipeId)) {
      return NextResponse.json({ erro: "Sem permissão para este consultor" }, { status: 403 });
    }
  }

  await prisma.feriasConsultor.update({
    where: { id: params.id },
    data: {
      congelado: false,
      congeladoEm: null,
      snapshotSaldo: null,
      snapshotRecebido: null,
      snapshotMetaAlvo: null,
    },
  });

  return NextResponse.json({ ok: true });
}
