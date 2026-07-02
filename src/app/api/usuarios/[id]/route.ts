import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const perfil = session.user.perfil;
  if (!["ADMINISTRADOR", "GESTOR"].includes(perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  // Gestor só pode editar consultores da própria equipe
  if (perfil === "GESTOR") {
    const alvo = await prisma.usuario.findUnique({ where: { id: params.id }, select: { perfil: true, equipeId: true } });
    if (!alvo || alvo.perfil !== "CONSULTOR" || alvo.equipeId !== session.user.equipeId) {
      return NextResponse.json({ erro: "Sem permissão para editar este usuário" }, { status: 403 });
    }
  }

  const body = await req.json();
  const { nome, email, senha, equipeId, ativo, emFerias } = body;

  const data: Record<string, any> = {};
  if (nome !== undefined) data.nome = nome;
  if (email !== undefined) data.email = email;
  if (equipeId !== undefined) data.equipeId = equipeId || null;
  if (ativo !== undefined) data.ativo = ativo;
  if (emFerias !== undefined) data.emFerias = emFerias;
  if (senha) {
    if (senha.length < 6) return NextResponse.json({ erro: "Senha deve ter pelo menos 6 caracteres" }, { status: 400 });
    data.senhaHash = await bcrypt.hash(senha, 10);
    data.deveAlterarSenha = true; // redefinição pelo admin/gestor → força troca no próximo login
  }

  if (email) {
    const conflito = await prisma.usuario.findFirst({ where: { email, NOT: { id: params.id } } });
    if (conflito) return NextResponse.json({ erro: "E-mail já está em uso" }, { status: 409 });
  }

  const usuario = await prisma.usuario.update({
    where: { id: params.id },
    data,
    select: {
      id: true, nome: true, email: true, perfil: true,
      ativo: true, emFerias: true, deveAlterarSenha: true, criadoEm: true,
      equipe: { select: { id: true, nome: true, tipo: true } },
    },
  });

  return NextResponse.json(usuario);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const perfil = session.user.perfil;
  if (!["ADMINISTRADOR", "GESTOR"].includes(perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }
  if (params.id === session.user.id) {
    return NextResponse.json({ erro: "Você não pode excluir sua própria conta" }, { status: 400 });
  }

  if (perfil === "GESTOR") {
    const alvo = await prisma.usuario.findUnique({ where: { id: params.id }, select: { perfil: true, equipeId: true } });
    if (!alvo || alvo.perfil !== "CONSULTOR" || alvo.equipeId !== session.user.equipeId) {
      return NextResponse.json({ erro: "Sem permissão para excluir este usuário" }, { status: 403 });
    }
  }

  await prisma.usuario.update({
    where: { id: params.id },
    data: { ativo: false, deletadoEm: new Date() },
  });

  return NextResponse.json({ ok: true });
}
