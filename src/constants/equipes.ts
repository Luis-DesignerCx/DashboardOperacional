import { TipoEquipe } from "@prisma/client";

export const CONFIG_EQUIPES: Record<
  TipoEquipe,
  { label: string; diasAtraso: [number, number]; diasSemContato: number; metaTipo: string }
> = {
  FLASH: {
    label: "CRA - Flash",
    diasAtraso: [0, 0],
    diasSemContato: 2,
    metaTipo: "FINANCEIRA",
  },
  CRA_1_30: {
    label: "CRA - 1 a 30",
    diasAtraso: [1, 30],
    diasSemContato: 3,
    metaTipo: "FINANCEIRA",
  },
  CR_31_90: {
    label: "CR - 31 a 90",
    diasAtraso: [31, 90],
    diasSemContato: 5,
    metaTipo: "FINANCEIRA",
  },
  CR_PDD_91_180: {
    label: "CR PDD - 91+",
    diasAtraso: [91, 9999],
    diasSemContato: 7,
    metaTipo: "QUANTIDADE_CLIENTES",
  },
};

export function obterEquipePorDiasAtraso(diasAtraso: number): TipoEquipe {
  if (diasAtraso <= 0)  return "FLASH";
  if (diasAtraso <= 30) return "CRA_1_30";
  if (diasAtraso <= 90) return "CR_31_90";
  return "CR_PDD_91_180"; // 91+ engloba tudo acima de 90
}
