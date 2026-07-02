import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusContato, TipoContato } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { contratoId, tipo, status, observacao } = body;

  if (!contratoId || !tipo || !status) {
    return NextResponse.json({ erro: "Campos obrigatórios ausentes" }, { status: 400 });
  }

  if (status === "OUTROS" && !observacao?.trim()) {
    return NextResponse.json({ erro: "Observação obrigatória para status Outros" }, { status: 400 });
  }

  const contato = await prisma.contato.create({
    data: {
      contratoId,
      consultorId: session.user.id,
      tipo: tipo as TipoContato,
      status: status as StatusContato,
      observacao: observacao || null,
    },
  });

  await prisma.auditoria.create({
    data: { usuarioId: session.user.id, tabela: "contatos", registroId: contato.id, acao: "CREATE" },
  });

  return NextResponse.json(contato, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const contratoId = searchParams.get("contratoId");

  const where: any = {};
  if (contratoId) where.contratoId = contratoId;
  if (session.user.perfil === "CONSULTOR") where.consultorId = session.user.id;

  const contatos = await prisma.contato.findMany({
    where,
    include: { consultor: { select: { nome: true } } },
    orderBy: { criadoEm: "desc" },
  });

  return NextResponse.json(contatos);
}
