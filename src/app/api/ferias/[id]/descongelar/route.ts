import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const ferias = await prisma.feriasConsultor.findUnique({ where: { id: params.id } });
  if (!ferias) return NextResponse.json({ erro: "Férias não encontradas" }, { status: 404 });

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
