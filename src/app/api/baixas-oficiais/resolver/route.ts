import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user?.perfil ?? "")) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { recebimentoIds, motivo } = await req.json();

  if (!Array.isArray(recebimentoIds) || recebimentoIds.length === 0) {
    return NextResponse.json({ erro: "recebimentoIds obrigatório" }, { status: 400 });
  }
  if (!motivo || typeof motivo !== "string") {
    return NextResponse.json({ erro: "motivo obrigatório" }, { status: 400 });
  }

  await prisma.recebimento.updateMany({
    where: { id: { in: recebimentoIds } },
    data: {
      divergencia: false,
      baixaOficial: true,
      resolvidoManualmente: true,
      resolucaoMotivo: motivo,
    },
  });

  return NextResponse.json({ ok: true });
}
