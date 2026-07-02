import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  if (!["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const equipe = await prisma.equipe.findUnique({ where: { id: params.id } });
  if (!equipe) return NextResponse.json({ erro: "Frente não encontrada" }, { status: 404 });

  const body = await req.json();
  const { nome, email, senha, perfil = "CONSULTOR" } = body as {
    nome: string; email: string; senha: string; perfil?: "CONSULTOR" | "GESTOR";
  };

  if (!nome?.trim() || !email?.trim() || !senha?.trim()) {
    return NextResponse.json({ erro: "Nome, email e senha são obrigatórios" }, { status: 400 });
  }

  const emailExiste = await prisma.usuario.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (emailExiste) return NextResponse.json({ erro: "E-mail já cadastrado" }, { status: 409 });

  const senhaHash = await bcrypt.hash(senha, 10);

  const usuario = await prisma.usuario.create({
    data: {
      nome:     nome.trim(),
      email:    email.trim().toLowerCase(),
      senhaHash,
      perfil:   perfil as any,
      equipeId: params.id,
      ativo:    true,
    },
    select: { id: true, nome: true, email: true, perfil: true },
  });

  return NextResponse.json(usuario, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  if (!["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { usuarioId, emFerias } = await req.json();
  if (!usuarioId) return NextResponse.json({ erro: "usuarioId obrigatório" }, { status: 400 });

  await prisma.usuario.update({
    where: { id: usuarioId },
    data:  { emFerias: Boolean(emFerias) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  if (!["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { usuarioId } = await req.json();
  if (!usuarioId) return NextResponse.json({ erro: "usuarioId obrigatório" }, { status: 400 });

  await prisma.usuario.update({
    where: { id: usuarioId },
    data:  { ativo: false },
  });

  return NextResponse.json({ ok: true });
}
