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
  const equipeId = searchParams.get("equipeId");

  const where: any = {};
  if (competenciaId) where.competenciaId = competenciaId;
  if (equipeId) where.equipeId = equipeId;
  if (session.user.perfil === "GESTOR" && session.user.equipeId && !equipeId) {
    where.equipeId = session.user.equipeId;
  }

  const metas = await prisma.meta.findMany({
    where,
    include: {
      equipe: { select: { nome: true, tipo: true } },
      competencia: { select: { descricao: true } },
    },
    orderBy: { criadoEm: "desc" },
  });

  return NextResponse.json(metas);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { equipeId, competenciaId, valorAlvo, nome, tipo } = await req.json();
  if (!equipeId || !competenciaId || !valorAlvo) {
    return NextResponse.json({ erro: "equipeId, competenciaId e valorAlvo são obrigatórios" }, { status: 400 });
  }

  // Gestor só pode criar meta para frentes que gerencia (principal + adicionais)
  if (session.user.perfil === "GESTOR") {
    const gerenciadas = await getEquipesGerenciadas(session.user.id);
    if (!gerenciadas.includes(equipeId)) {
      return NextResponse.json({ erro: "Sem permissão para esta equipe" }, { status: 403 });
    }
  }

  // Upsert: se já existe meta para equipe+competência, atualiza
  const existing = await prisma.meta.findFirst({ where: { equipeId, competenciaId } });

  if (existing) {
    const meta = await prisma.meta.update({
      where: { id: existing.id },
      data: { valorAlvo, nome: nome || existing.nome },
    });
    return NextResponse.json(meta);
  }

  const meta = await prisma.meta.create({
    data: {
      equipeId,
      competenciaId,
      valorAlvo,
      nome: nome || "Meta Financeira",
      tipo: tipo || "FINANCEIRA",
      peso: 1,
    },
  });

  return NextResponse.json(meta, { status: 201 });
}
