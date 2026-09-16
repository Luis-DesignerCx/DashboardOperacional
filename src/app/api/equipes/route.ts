import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEquipesGerenciadas } from "@/lib/frentes";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const ORDEM: Record<string, number> = { FLASH: 1, CRA_1_30: 2, CR_31_90: 3, CR_PDD_91_180: 4 };

  const equipes = await prisma.equipe.findMany({
    include: {
      usuarios: { where: { ativo: true }, select: { id: true, nome: true, perfil: true, emFerias: true } },
    },
  });

  equipes.sort((a, b) => (ORDEM[a.tipo] ?? 9) - (ORDEM[b.tipo] ?? 9));

  // comissaoBase só aparece pra ADMINISTRADOR, pro GESTOR de uma frente que
  // ele gerencia, ou pro CONSULTOR pra própria frente -- antes, qualquer
  // perfil autenticado lia a comissaoBase de TODAS as frentes por esta
  // listagem (achado real da revisão de segurança, 2026-09-16; o mesmo já
  // tinha sido corrigido na rota de detalhe por id, mas não aqui).
  const perfil = session.user.perfil;
  const equipesGerenciadas = perfil === "GESTOR" ? await getEquipesGerenciadas(session.user.id) : [];
  const minhaEquipeId = (session.user as any).equipeId;

  const resultado = equipes.map((eq) => {
    const podeVerComissao =
      perfil === "ADMINISTRADOR" ||
      (perfil === "GESTOR" && equipesGerenciadas.includes(eq.id)) ||
      (perfil === "CONSULTOR" && eq.id === minhaEquipeId);
    return { ...eq, comissaoBase: podeVerComissao ? eq.comissaoBase : null };
  });

  return NextResponse.json(resultado);
}
