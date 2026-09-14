import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { Perfil } from "@prisma/client";

// Mesma checagem usada em src/app/api/usuarios/[id]/route.ts -- reunida aqui
// pra não duplicar a query em cada handler deste arquivo.
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

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  const perfilSessao = session.user.perfil;
  if (!["ADMINISTRADOR", "GESTOR"].includes(perfilSessao)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const equipe = await prisma.equipe.findUnique({ where: { id: params.id } });
  if (!equipe) return NextResponse.json({ erro: "Frente não encontrada" }, { status: 404 });

  // Gestor só pode criar usuário numa frente que ele próprio gerencia.
  if (perfilSessao === "GESTOR") {
    const minhasFrentes = await getEquipeIdsGestor(session.user.id, session.user.equipeId ?? null);
    if (!minhasFrentes.includes(params.id)) {
      return NextResponse.json({ erro: "Sem permissão para criar usuário nesta frente" }, { status: 403 });
    }
  }

  const body = await req.json();
  const { nome, email, senha, perfil: perfilBody } = body as {
    nome: string; email: string; senha: string; perfil?: string;
  };

  // Perfil nunca vem direto do corpo pra quem não é ADMINISTRADOR -- sem isso,
  // um GESTOR conseguia mandar "perfil": "ADMINISTRADOR" e criar uma conta
  // administradora pra si mesmo (achado real da auditoria de segurança,
  // 2026-09-15 -- ver também src/app/api/usuarios/route.ts, que já fazia
  // essa validação corretamente; esta rota paralela não repetia o cuidado).
  const perfisValidos: Perfil[] = ["ADMINISTRADOR", "GESTOR", "CONSULTOR"];
  const perfil: Perfil =
    perfilSessao === "ADMINISTRADOR" && perfisValidos.includes(perfilBody as Perfil)
      ? (perfilBody as Perfil)
      : "CONSULTOR";

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
      perfil,
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
  const perfilSessao = session.user.perfil;
  if (!["ADMINISTRADOR", "GESTOR"].includes(perfilSessao)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { usuarioId, emFerias } = await req.json();
  if (!usuarioId) return NextResponse.json({ erro: "usuarioId obrigatório" }, { status: 400 });

  // Gestor só pode mexer em consultor de uma das suas próprias frentes --
  // sem isso, dava pra tirar de férias (ou tirar) qualquer usuário do
  // sistema, inclusive outro GESTOR/ADMINISTRADOR, só sabendo o id (achado
  // real da auditoria de segurança, 2026-09-15).
  if (perfilSessao === "GESTOR") {
    const alvo = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { perfil: true, equipeId: true } });
    const minhasFrentes = await getEquipeIdsGestor(session.user.id, session.user.equipeId ?? null);
    if (!alvo || alvo.perfil !== "CONSULTOR" || !minhasFrentes.includes(alvo.equipeId ?? "")) {
      return NextResponse.json({ erro: "Sem permissão para editar este usuário" }, { status: 403 });
    }
  }

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
  const perfilSessao = session.user.perfil;
  if (!["ADMINISTRADOR", "GESTOR"].includes(perfilSessao)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { usuarioId } = await req.json();
  if (!usuarioId) return NextResponse.json({ erro: "usuarioId obrigatório" }, { status: 400 });
  if (usuarioId === session.user.id) {
    return NextResponse.json({ erro: "Você não pode desativar sua própria conta" }, { status: 400 });
  }

  if (perfilSessao === "GESTOR") {
    const alvo = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { perfil: true, equipeId: true } });
    const minhasFrentes = await getEquipeIdsGestor(session.user.id, session.user.equipeId ?? null);
    if (!alvo || alvo.perfil !== "CONSULTOR" || !minhasFrentes.includes(alvo.equipeId ?? "")) {
      return NextResponse.json({ erro: "Sem permissão para excluir este usuário" }, { status: 403 });
    }
  }

  await prisma.usuario.update({
    where: { id: usuarioId },
    data:  { ativo: false },
  });

  return NextResponse.json({ ok: true });
}
