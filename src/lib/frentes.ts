import { prisma } from "@/lib/prisma";

const TIPO_ORDEM: Record<string, number> = {
  FLASH: 1, CRA_1_30: 2, CR_31_90: 3, CR_PDD_91_180: 4,
};

/**
 * Retorna todos os equipeIds que o usuário gerencia:
 * frente principal + frentes adicionais (EquipeConsultor).
 * Ordenado pela ordem canônica das frentes.
 */
export async function getEquipesGerenciadas(userId: string): Promise<string[]> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: userId },
    select: {
      equipe: { select: { id: true, tipo: true } },
      frentesAdicionais: { select: { equipe: { select: { id: true, tipo: true } } } },
    },
  });
  if (!usuario) return [];

  const map = new Map<string, string>(); // id → tipo
  if (usuario.equipe) map.set(usuario.equipe.id, usuario.equipe.tipo);
  for (const fa of usuario.frentesAdicionais) map.set(fa.equipe.id, fa.equipe.tipo);

  return [...map.entries()]
    .sort(([, tA], [, tB]) => (TIPO_ORDEM[tA] ?? 9) - (TIPO_ORDEM[tB] ?? 9))
    .map(([id]) => id);
}

export async function frenteLabel(equipeId: string): Promise<string> {
  const e = await prisma.equipe.findUnique({ where: { id: equipeId }, select: { nome: true } });
  return e?.nome ?? equipeId;
}
