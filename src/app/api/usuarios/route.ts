import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { Perfil } from "@prisma/client";

const SENHA_PADRAO = "mudar123";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  if (!["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  // Gestor vê apenas consultores da própria equipe
  const where: any = { deletadoEm: null };
  if (session.user.perfil === "GESTOR") {
    where.perfil = "CONSULTOR";
    if (session.user.equipeId) where.equipeId = session.user.equipeId;
  }

  const usuarios = await prisma.usuario.findMany({
    where,
    select: {
      id: true,
      nome: true,
      email: true,
      perfil: true,
      ativo: true,
      emFerias: true,
      deveAlterarSenha: true,
      criadoEm: true,
      equipe: { select: { id: true, nome: true, tipo: true } },
      frentesAdicionais: { select: { equipe: { select: { id: true, nome: true, tipo: true } } } },
    },
    orderBy: [{ perfil: "asc" }, { nome: "asc" }],
  });

  return NextResponse.json(usuarios);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const perfil = session.user.perfil;
  if (!["ADMINISTRADOR", "GESTOR"].includes(perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { nome, email, equipeId, perfilCriado: perfilBody } = body;

  // Admin cria qualquer perfil; Gestor cria somente Consultores
  const perfisValidos: Perfil[] = ["ADMINISTRADOR", "GESTOR", "CONSULTOR"];
  let perfilCriado: Perfil;
  if (perfil === "ADMINISTRADOR") {
    perfilCriado = perfisValidos.includes(perfilBody) ? perfilBody as Perfil : "CONSULTOR";
  } else {
    perfilCriado = "CONSULTOR";
  }

  if (!nome || !email) {
    return NextResponse.json({ erro: "Nome e e-mail são obrigatórios" }, { status: 400 });
  }

  const existe = await prisma.usuario.findUnique({ where: { email } });
  if (existe) return NextResponse.json({ erro: "E-mail já cadastrado" }, { status: 409 });

  const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);

  // Gestor sempre atribui à própria equipe
  const equipeIdFinal = perfil === "GESTOR" ? (session.user.equipeId ?? null) : (equipeId || null);

  const usuario = await prisma.usuario.create({
    data: {
      nome,
      email,
      senhaHash,
      perfil: perfilCriado,
      equipeId: equipeIdFinal,
      deveAlterarSenha: true,
    },
    select: {
      id: true, nome: true, email: true, perfil: true,
      ativo: true, emFerias: true, deveAlterarSenha: true, criadoEm: true,
      equipe: { select: { id: true, nome: true, tipo: true } },
    },
  });

  return NextResponse.json(usuario, { status: 201 });
}
