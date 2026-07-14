import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

async function getEquipeIdsGestor(gestorId: string, equipeIdPrimaria: string | null): Promise<string[]> {
  const adicionais = await prisma.equipeConsultor.findMany({
    where: { consultorId: gestorId },
    select: { equipeId: true },
  });
  return [
    ...(equipeIdPrimaria ? [equipeIdPrimaria] : []),
    ...adicionais.map((f) => f.equipeId),
  ].filter((v, i, a) => a.indexOf(v) === i);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const perfil = session.user.perfil;
  if (!["ADMINISTRADOR", "GESTOR"].includes(perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  // Gestor só pode editar consultores de qualquer uma das suas frentes
  if (perfil === "GESTOR") {
    const alvo = await prisma.usuario.findUnique({ where: { id: params.id }, select: { perfil: true, equipeId: true } });
    const minhasFrentes = await getEquipeIdsGestor(session.user.id, session.user.equipeId ?? null);
    if (!alvo || alvo.perfil !== "CONSULTOR" || !minhasFrentes.includes(alvo.equipeId ?? "")) {
      return NextResponse.json({ erro: "Sem permissão para editar este usuário" }, { status: 403 });
    }
  }

  const body = await req.json();
  const { nome, email, senha, frentesIds, ativo, emFerias } = body;

  const data: Record<string, any> = {};
  if (nome !== undefined) data.nome = nome;
  if (email !== undefined) data.email = email;
  if (ativo !== undefined) data.ativo = ativo;
  if (emFerias !== undefined) data.emFerias = emFerias;
  if (senha) {
    if (senha.length < 6) return NextResponse.json({ erro: "Senha deve ter pelo menos 6 caracteres" }, { status: 400 });
    data.senhaHash = await bcrypt.hash(senha, 10);
    data.deveAlterarSenha = true;
  }

  // Atualiza frentes quando enviadas
  if (Array.isArray(frentesIds)) {
    data.equipeId = frentesIds[0] ?? null;
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

  // Sincroniza EquipeConsultor para frentes adicionais (índice 1+)
  if (Array.isArray(frentesIds)) {
    await prisma.equipeConsultor.deleteMany({ where: { consultorId: params.id } });
    const adicionais = frentesIds.slice(1);
    if (adicionais.length > 0) {
      await prisma.equipeConsultor.createMany({
        data: adicionais.map((equipeId) => ({ equipeId, consultorId: params.id })),
        skipDuplicates: true,
      });
    }
  }

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
    const minhasFrentes = await getEquipeIdsGestor(session.user.id, session.user.equipeId ?? null);
    if (!alvo || alvo.perfil !== "CONSULTOR" || !minhasFrentes.includes(alvo.equipeId ?? "")) {
      return NextResponse.json({ erro: "Sem permissão para excluir este usuário" }, { status: 403 });
    }
  }

  await prisma.usuario.update({
    where: { id: params.id },
    data: { ativo: false, deletadoEm: new Date() },
  });

  return NextResponse.json({ ok: true });
}
