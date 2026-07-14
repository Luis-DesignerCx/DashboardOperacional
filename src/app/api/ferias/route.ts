import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const competenciaId = searchParams.get("competenciaId");
  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

  const ferias = await prisma.feriasConsultor.findMany({
    where: { competenciaId },
    include: { consultor: { select: { id: true, nome: true } } },
    orderBy: { consultor: { nome: "asc" } },
  });

  return NextResponse.json(ferias);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { consultorId, competenciaId, dataInicio, dataFim } = await req.json();
  if (!consultorId || !competenciaId || !dataInicio || !dataFim) {
    return NextResponse.json({ erro: "Campos obrigatórios ausentes" }, { status: 400 });
  }

  const ferias = await prisma.feriasConsultor.upsert({
    where: { consultorId_competenciaId: { consultorId, competenciaId } },
    create: { consultorId, competenciaId, dataInicio: new Date(dataInicio), dataFim: new Date(dataFim) },
    update: { dataInicio: new Date(dataInicio), dataFim: new Date(dataFim) },
    include: { consultor: { select: { id: true, nome: true } } },
  });

  return NextResponse.json(ferias, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

  await prisma.feriasConsultor.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
