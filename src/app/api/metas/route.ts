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
  const { equipeId, competenciaId, consultorId, nome, tipo, percentualAlvo, quantidadeAlvo, valorAlvo, peso, thresholdsMonitoria } = body;

  if (!equipeId) return NextResponse.json({ erro: "equipeId obrigatório" }, { status: 400 });
  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });
  if (!tipo) return NextResponse.json({ erro: "tipo obrigatório" }, { status: 400 });

  if (tipo === "FINANCEIRA" && (!valorAlvo || Number(valorAlvo) <= 0) && (!percentualAlvo || Number(percentualAlvo) <= 0)) {
    return NextResponse.json({ erro: "Informe o valor alvo em R$ ou o percentual da inadimplência" }, { status: 400 });
  }
  if (tipo === "MONITORIA" && !thresholdsMonitoria) {
    return NextResponse.json({ erro: "Informe os thresholds de monitoria" }, { status: 400 });
  }
  if (tipo === "QUANTIDADE" && (!quantidadeAlvo || Number(quantidadeAlvo) <= 0)) {
    return NextResponse.json({ erro: "Informe a quantidade alvo" }, { status: 400 });
  }

  // peso vem como decimal (0.9 para 90%)
  const pesoDecimal = peso != null ? new Decimal(String(peso)) : new Decimal("1");

  const meta = await prisma.meta.create({
    data: {
      equipeId,
      competenciaId,
      consultorId: consultorId || null,
      nome: nome || (tipo === "FINANCEIRA" ? "Meta Financeira" : tipo === "MONITORIA" ? "Monitoria" : "Meta Quantidade"),
      tipo,
      peso: pesoDecimal,
      valorAlvo: valorAlvo != null ? new Decimal(String(valorAlvo)) : null,
      percentualAlvo: percentualAlvo != null ? new Decimal(String(percentualAlvo)) : null,
      quantidadeAlvo: quantidadeAlvo ? Number(quantidadeAlvo) : null,
      thresholdsMonitoria: thresholdsMonitoria ?? null,
      resultadosConsultores: {},
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
  const { id, nome, percentualAlvo, quantidadeAlvo, valorAlvo, peso, thresholdsMonitoria, resultadosConsultores } = body;
  if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

  // Para resultadosConsultores: merge em vez de substituir
  let resultadosMerge: Record<string, number> | undefined;
  if (resultadosConsultores) {
    const current = await prisma.meta.findUnique({ where: { id }, select: { resultadosConsultores: true } });
    const existing = (current?.resultadosConsultores as Record<string, number>) ?? {};
    resultadosMerge = { ...existing, ...resultadosConsultores };
  }

  const data: any = {};
  if (nome !== undefined) data.nome = nome;
  if (percentualAlvo !== undefined) data.percentualAlvo = percentualAlvo ? new Decimal(String(percentualAlvo)) : null;
  if (quantidadeAlvo !== undefined) data.quantidadeAlvo = quantidadeAlvo ? Number(quantidadeAlvo) : null;
  if (valorAlvo !== undefined) data.valorAlvo = valorAlvo != null ? new Decimal(String(valorAlvo)) : null;
  if (peso !== undefined) data.peso = new Decimal(String(peso));
  if (thresholdsMonitoria !== undefined) data.thresholdsMonitoria = thresholdsMonitoria;
  if (resultadosMerge !== undefined) data.resultadosConsultores = resultadosMerge;

  const meta = await prisma.meta.update({ where: { id }, data });
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
