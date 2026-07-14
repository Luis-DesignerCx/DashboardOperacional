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

  const where: any = { deletadoEm: null };

  if (session.user.perfil === "GESTOR") {
    where.perfil = "CONSULTOR";
    // Coleta todas as frentes do gestor (primária + adicionais via EquipeConsultor)
    const adicionais = await prisma.equipeConsultor.findMany({
      where: { consultorId: session.user.id },
      select: { equipeId: true },
    });
    const equipeIds = [
      ...(session.user.equipeId ? [session.user.equipeId] : []),
      ...adicionais.map((f) => f.equipeId),
    ].filter((v, i, a) => a.indexOf(v) === i);
    if (equipeIds.length > 0) where.equipeId = { in: equipeIds };
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
  const { nome, email, frentesIds, perfilCriado: perfilBody } = body;

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

  // Gestor sempre usa suas próprias frentes como ponto de partida; Admin usa o que foi enviado
  let equipeIdFinal: string | null;
  let frentesAdicionaisIds: string[];
  if (perfil === "GESTOR") {
    equipeIdFinal = session.user.equipeId ?? null;
    frentesAdicionaisIds = [];
  } else {
    const ids: string[] = Array.isArray(frentesIds) ? frentesIds : [];
    equipeIdFinal = ids[0] ?? null;
    frentesAdicionaisIds = ids.slice(1);
  }

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

  if (frentesAdicionaisIds.length > 0) {
    await prisma.equipeConsultor.createMany({
      data: frentesAdicionaisIds.map((equipeId) => ({ equipeId, consultorId: usuario.id })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json(usuario, { status: 201 });
}
