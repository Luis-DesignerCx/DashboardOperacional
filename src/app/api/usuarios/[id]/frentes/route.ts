import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEquipesGerenciadas } from "@/lib/frentes";

// GESTOR só mexe em frente adicional de um consultor de uma frente que ele
// gerencia, e só pode atribuir/remover frentes que ele próprio gerencia --
// sem isso, dava pra dar/tirar de QUALQUER consultor (até de outra gestão)
// uma frente adicional QUALQUER, mudando elegibilidade de carteira/comissão
// sem o gestor daquela frente aprovar nada (achado real da revisão de
// segurança, 2026-09-16).
async function checarPermissao(session: { user: { id: string; perfil: string } }, consultorAlvoId: string, equipeId?: string): Promise<boolean> {
  if (session.user.perfil !== "GESTOR") return true;
  const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
  const alvo = await prisma.usuario.findUnique({ where: { id: consultorAlvoId }, select: { perfil: true, equipeId: true } });
  if (!alvo || alvo.perfil !== "CONSULTOR" || !alvo.equipeId || !equipesGerenciadas.includes(alvo.equipeId)) return false;
  if (equipeId && !equipesGerenciadas.includes(equipeId)) return false;
  return true;
}

// GET /api/usuarios/[id]/frentes — lista frentes adicionais
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }
  if (!(await checarPermissao(session, params.id))) {
    return NextResponse.json({ erro: "Sem permissão para este consultor" }, { status: 403 });
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
  if (!(await checarPermissao(session, params.id, equipeId))) {
    return NextResponse.json({ erro: "Sem permissão para este consultor ou frente" }, { status: 403 });
  }

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
  if (!(await checarPermissao(session, params.id, equipeId))) {
    return NextResponse.json({ erro: "Sem permissão para este consultor ou frente" }, { status: 403 });
  }

  await prisma.equipeConsultor.deleteMany({
    where: { equipeId, consultorId: params.id },
  });
  return NextResponse.json({ ok: true });
}
