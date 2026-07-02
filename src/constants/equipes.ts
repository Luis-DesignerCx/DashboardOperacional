import { TipoEquipe } from "@prisma/client";

export const CONFIG_EQUIPES: Record<
  TipoEquipe,
  { label: string; diasAtraso: [number, number]; diasSemContato: number; metaTipo: string }
> = {
  FLASH: {
    label: "CRA / Apoio – Flash",
    diasAtraso: [0, 0],
    diasSemContato: 2,
    metaTipo: "FINANCEIRA",
  },
  CRA_1_30: {
    label: "CRA / Apoio 1 a 30",
    diasAtraso: [1, 30],
    diasSemContato: 3,
    metaTipo: "FINANCEIRA",
  },
  CR_31_90: {
    label: "CR 31 a 90",
    diasAtraso: [31, 90],
    diasSemContato: 5,
    metaTipo: "FINANCEIRA",
  },
  CR_PDD_91_180: {
    label: "CR PDD 91 a 180",
    diasAtraso: [91, 180],
    diasSemContato: 7,
    metaTipo: "QUANTIDADE_CLIENTES",
  },
  CR_PDD_181: {
    label: "CR PDD 181+",
    diasAtraso: [181, 9999],
    diasSemContato: 10,
    metaTipo: "QUANTIDADE_CLIENTES",
  },
};

export function obterEquipePorDiasAtraso(diasAtraso: number): TipoEquipe {
  if (diasAtraso <= 0)   return "FLASH";
  if (diasAtraso <= 30)  return "CRA_1_30";
  if (diasAtraso <= 90)  return "CR_31_90";
  if (diasAtraso <= 180) return "CR_PDD_91_180";
  return "CR_PDD_181";
}
