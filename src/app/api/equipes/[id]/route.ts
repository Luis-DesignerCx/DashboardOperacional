import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const equipe = await prisma.equipe.findUnique({
    where: { id: params.id },
    select: { id: true, nome: true, comissaoBase: true },
  });
  if (!equipe) return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
  return NextResponse.json(equipe);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { comissaoBase } = body;

  const data: any = {};
  if (comissaoBase !== undefined) {
    data.comissaoBase = comissaoBase != null ? new Decimal(String(comissaoBase)) : null;
  }

  const equipe = await prisma.equipe.update({
    where: { id: params.id },
    data,
    select: { id: true, nome: true, comissaoBase: true },
  });

  return NextResponse.json(equipe);
}
