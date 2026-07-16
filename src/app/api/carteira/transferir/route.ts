import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const competencia = await prisma.competencia.findFirst({
    where: { fechada: false },
    orderBy: { criadoEm: "desc" },
    select: { id: true },
  });
  if (!competencia) return NextResponse.json([]);

  const carteiras = await prisma.carteiraParcela.findMany({
    where: {
      competenciaId: competencia.id,
      ativo: true,
      contrato: {
        OR: [
          { numero: { contains: q, mode: "insensitive" } },
          { cliente: { nome: { contains: q, mode: "insensitive" } } },
        ],
      },
    },
    select: {
      contratoId: true,
      consultorId: true,
      consultor: { select: { nome: true } },
      contrato: {
        select: {
          numero: true,
          cliente: { select: { nome: true } },
          empresa: { select: { nome: true } },
          statusRecuperacao: true,
        },
      },
    },
    take: 20,
  });

  return NextResponse.json(
    carteiras.map((c) => ({
      contratoId: c.contratoId,
      numero: c.contrato.numero,
      cliente: c.contrato.cliente.nome,
      empresa: c.contrato.empresa.nome,
      statusRecuperacao: c.contrato.statusRecuperacao,
      consultorAtualId: c.consultorId,
      consultorAtual: c.consultor.nome,
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { contratoId, consultorDestinoId } = await req.json();
  if (!contratoId || !consultorDestinoId) {
    return NextResponse.json({ erro: "contratoId e consultorDestinoId são obrigatórios" }, { status: 400 });
  }

  const competencia = await prisma.competencia.findFirst({
    where: { fechada: false },
    orderBy: { criadoEm: "desc" },
    select: { id: true },
  });
  if (!competencia) {
    return NextResponse.json({ erro: "Nenhuma competência ativa encontrada" }, { status: 400 });
  }

  const consultor = await prisma.usuario.findUnique({
    where: { id: consultorDestinoId },
    select: { nome: true },
  });
  if (!consultor) {
    return NextResponse.json({ erro: "Consultor destino não encontrado" }, { status: 404 });
  }

  await prisma.carteiraParcela.upsert({
    where: {
      contratoId_competenciaId: {
        contratoId,
        competenciaId: competencia.id,
      },
    },
    update: { consultorId: consultorDestinoId, ativo: true },
    create: {
      contratoId,
      consultorId: consultorDestinoId,
      competenciaId: competencia.id,
      ativo: true,
    },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: session.user.id,
      tabela: "carteira_parcelas",
      registroId: contratoId,
      campo: "consultorId",
      valorAnterior: "—",
      valorNovo: consultorDestinoId,
      acao: "UPDATE",
    },
  });

  return NextResponse.json({ ok: true });
}
