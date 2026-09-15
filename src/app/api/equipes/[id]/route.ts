import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { getEquipesGerenciadas } from "@/lib/frentes";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  // Consultor só vê a própria frente (usa esse endpoint na tela de
  // Comissão, pra saber a própria comissaoBase); Gestor só vê frente que
  // gerencia; Administrador vê qualquer uma. Antes, qualquer perfil lia
  // comissaoBase de qualquer frente do sistema (achado real da auditoria
  // de segurança, 2026-09-15).
  if (session.user.perfil === "CONSULTOR" && (session.user as any).equipeId !== params.id) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }
  if (session.user.perfil === "GESTOR") {
    const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
    if (!equipesGerenciadas.includes(params.id)) {
      return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
    }
  }

  const equipe = await prisma.equipe.findUnique({
    where: { id: params.id },
    select: { id: true, nome: true, comissaoBase: true },
  });
  if (!equipe) return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });
  return NextResponse.json(equipe);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  // GESTOR só altera comissaoBase de uma frente que ele gerencia (achado
  // real da auditoria de segurança, 2026-09-15).
  if (session.user.perfil === "GESTOR") {
    const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
    if (!equipesGerenciadas.includes(params.id)) {
      return NextResponse.json({ erro: "Sem permissão para esta frente" }, { status: 403 });
    }
  }

  const body = await req.json();
  const { comissaoBase } = body;

  const data: any = {};
  if (comissaoBase !== undefined) {
    data.comissaoBase = comissaoBase != null ? new Decimal(String(comissaoBase)) : null;
  }

  const equipe = await prisma.equipe.update({
    where: { id: params.id },
    data,
    select: { id: true, nome: true, comissaoBase: true },
  });

  return NextResponse.json(equipe);
}
