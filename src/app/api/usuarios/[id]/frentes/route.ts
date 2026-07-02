import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/usuarios/[id]/frentes — lista frentes adicionais
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }
  const frentes = await prisma.equipeConsultor.findMany({
    where: { consultorId: params.id },
    include: { equipe: { select: { id: true, nome: true, tipo: true } } },
  });
  return NextResponse.json(frentes);
}

// POST /api/usuarios/[id]/frentes — adiciona frente adicional
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }
  const { equipeId } = await req.json();
  if (!equipeId) return NextResponse.json({ erro: "equipeId obrigatório" }, { status: 400 });

  const registro = await prisma.equipeConsultor.upsert({
    where: { equipeId_consultorId: { equipeId, consultorId: params.id } },
    update: {},
    create: { equipeId, consultorId: params.id },
    include: { equipe: { select: { id: true, nome: true, tipo: true } } },
  });
  return NextResponse.json(registro, { status: 201 });
}

// DELETE /api/usuarios/[id]/frentes — remove frente adicional
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }
  const { equipeId } = await req.json();
  if (!equipeId) return NextResponse.json({ erro: "equipeId obrigatório" }, { status: 400 });

  await prisma.equipeConsultor.deleteMany({
    where: { equipeId, consultorId: params.id },
  });
  return NextResponse.json({ ok: true });
}
