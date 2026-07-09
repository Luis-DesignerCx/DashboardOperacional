import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const competenciaId = searchParams.get("competenciaId");
  const equipeId = searchParams.get("equipeId");
  const consultorId = searchParams.get("consultorId");

  const where: any = {};
  if (competenciaId) where.competenciaId = competenciaId;
  if (equipeId) where.equipeId = equipeId;
  if (consultorId) where.consultorId = consultorId;
  if (session.user.perfil === "GESTOR" && session.user.equipeId && !equipeId) {
    where.equipeId = session.user.equipeId;
  }

  const metas = await prisma.meta.findMany({
    where,
    include: {
      equipe: { select: { nome: true, tipo: true } },
      competencia: { select: { descricao: true } },
      consultor: { select: { nome: true } },
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

  const body = await req.json();
  const { equipeId, competenciaId, consultorId, nome, tipo, percentualAlvo, quantidadeAlvo, peso } = body;

  if (!equipeId) return NextResponse.json({ erro: "equipeId obrigatório" }, { status: 400 });
  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });
  if (!tipo) return NextResponse.json({ erro: "tipo obrigatório" }, { status: 400 });

  if ((tipo === "FINANCEIRA" || tipo === "MONITORIA") && (!percentualAlvo || Number(percentualAlvo) <= 0)) {
    return NextResponse.json({ erro: "Informe o percentual alvo" }, { status: 400 });
  }
  if (tipo === "QUANTIDADE" && (!quantidadeAlvo || Number(quantidadeAlvo) <= 0)) {
    return NextResponse.json({ erro: "Informe a quantidade alvo" }, { status: 400 });
  }

  const meta = await prisma.meta.create({
    data: {
      equipeId,
      competenciaId,
      consultorId: consultorId || null,
      nome: nome || (tipo === "FINANCEIRA" ? "Meta Financeira" : tipo === "QUANTIDADE" ? "Meta Quantidade" : "Meta Monitoria"),
      tipo,
      peso: peso ? new Decimal(String(peso)) : new Decimal("1"),
      percentualAlvo: percentualAlvo ? new Decimal(String(percentualAlvo)) : null,
      quantidadeAlvo: quantidadeAlvo ? Number(quantidadeAlvo) : null,
    },
  });

  return NextResponse.json(meta, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { id, nome, percentualAlvo, quantidadeAlvo, peso } = body;
  if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

  const meta = await prisma.meta.update({
    where: { id },
    data: {
      ...(nome !== undefined && { nome }),
      ...(percentualAlvo !== undefined && { percentualAlvo: percentualAlvo ? new Decimal(String(percentualAlvo)) : null }),
      ...(quantidadeAlvo !== undefined && { quantidadeAlvo: quantidadeAlvo ? Number(quantidadeAlvo) : null }),
      ...(peso !== undefined && { peso: new Decimal(String(peso)) }),
    },
  });

  return NextResponse.json(meta);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

  await prisma.meta.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
