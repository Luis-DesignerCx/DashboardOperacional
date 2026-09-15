import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEquipesGerenciadas } from "@/lib/frentes";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const competenciaId = searchParams.get("competenciaId");
  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

  const where: any = { competenciaId };
  // GESTOR só vê férias de consultor de uma frente que ele gerencia.
  if (session.user.perfil === "GESTOR") {
    const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
    where.consultor = { equipeId: { in: equipesGerenciadas } };
  }

  const ferias = await prisma.feriasConsultor.findMany({
    where,
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

  // GESTOR só marca férias de consultor de uma frente que ele gerencia
  // (achado real da auditoria de segurança, 2026-09-15).
  if (session.user.perfil === "GESTOR") {
    const alvo = await prisma.usuario.findUnique({ where: { id: consultorId }, select: { equipeId: true } });
    const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
    if (!alvo?.equipeId || !equipesGerenciadas.includes(alvo.equipeId)) {
      return NextResponse.json({ erro: "Sem permissão para este consultor" }, { status: 403 });
    }
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

  if (session.user.perfil === "GESTOR") {
    const registro = await prisma.feriasConsultor.findUnique({ where: { id }, select: { consultor: { select: { equipeId: true } } } });
    if (!registro) return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
    const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
    if (!registro.consultor.equipeId || !equipesGerenciadas.includes(registro.consultor.equipeId)) {
      return NextResponse.json({ erro: "Sem permissão para excluir este registro" }, { status: 403 });
    }
  }

  await prisma.feriasConsultor.delete({ where: { id } });

  prisma.auditoria.create({
    data: { usuarioId: session.user.id, tabela: "ferias_consultor", registroId: id, acao: "DELETE" },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
