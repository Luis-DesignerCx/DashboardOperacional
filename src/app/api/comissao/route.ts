import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEquipesGerenciadas } from "@/lib/frentes";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const competenciaId = searchParams.get("competenciaId");

  const where: any = {};
  if (session.user.perfil === "CONSULTOR") where.usuarioId = session.user.id;
  if (session.user.perfil === "GESTOR") {
    // Usa TODAS as frentes gerenciadas (principal + adicionais) -- a
    // versão antiga usava só session.user.equipeId, e se um gestor não
    // tivesse frente primária (só adicionais), a condição inteira era
    // pulada e ele via a comissão de TODOS os consultores da empresa
    // (achado real da revisão de segurança, 2026-09-16).
    const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
    where.equipeId = { in: equipesGerenciadas };
  }
  if (competenciaId) where.competenciaId = competenciaId;

  const comissoes = await prisma.comissao.findMany({
    where,
    include: {
      equipe: { select: { nome: true } },
      // usuario não tem relation no schema, buscamos depois
    },
    orderBy: { calculadoEm: "desc" },
    take: 50,
  });

  // Enriquece com nome do usuario
  const ids = [...new Set(comissoes.map((c) => c.usuarioId))];
  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: ids } },
    select: { id: true, nome: true },
  });
  const userMap = new Map(usuarios.map((u) => [u.id, u.nome]));

  const resultado = comissoes.map((c) => ({
    ...c,
    usuario: { nome: userMap.get(c.usuarioId) ?? "—" },
  }));

  return NextResponse.json(resultado);
}
