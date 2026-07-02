import { prisma } from "@/lib/prisma";

const FRENTE_LABEL: Record<string, string> = {
  "eq-flash":   "Flash",
  "eq-1-30":    "1 a 30 dias",
  "eq-31-90":   "31 a 90 dias",
  "eq-91-180":  "91 a 180 dias",
  "eq-181plus": "+ 181 dias",
};

const FRENTE_ORDER = ["eq-flash", "eq-1-30", "eq-31-90", "eq-91-180", "eq-181plus"];

/**
 * Retorna todos os equipeIds que o usuário gerencia:
 * frente principal + frentes adicionais (EquipeConsultor).
 * Ordenado conforme FRENTE_ORDER.
 */
export async function getEquipesGerenciadas(userId: string): Promise<string[]> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: userId },
    select: {
      equipeId: true,
      frentesAdicionais: { select: { equipeId: true } },
    },
  });
  if (!usuario) return [];

  const ids = new Set<string>();
  if (usuario.equipeId) ids.add(usuario.equipeId);
  for (const fa of usuario.frentesAdicionais) ids.add(fa.equipeId);

  return FRENTE_ORDER.filter((id) => ids.has(id));
}

export function frenteLabel(equipeId: string): string {
  return FRENTE_LABEL[equipeId] ?? equipeId;
}
