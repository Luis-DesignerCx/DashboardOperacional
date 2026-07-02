// Faixas de comissão conforme regra de negócio
export const FAIXAS_COMISSAO: Array<{ minimo: number; percentual: number }> = [
  { minimo: 160, percentual: 160 },
  { minimo: 150, percentual: 150 },
  { minimo: 140, percentual: 140 },
  { minimo: 130, percentual: 130 },
  { minimo: 120, percentual: 120 },
  { minimo: 110, percentual: 110 },
  { minimo: 100, percentual: 100 },
  { minimo: 90, percentual: 80 },
  { minimo: 80, percentual: 70 },
  { minimo: 70, percentual: 60 },
  { minimo: 0, percentual: 0 },
];

/**
 * Calcula a faixa de comissão aplicável.
 *
 * Regras de arredondamento:
 * - Abaixo de 100%: arredonda PARA BAIXO para a faixa inferior
 *   Ex: 78% → 70%, 89% → 80%, 99% → 90%
 * - Acima de 100%: arredonda para a próxima faixa apenas se faltar até 2%
 *   Ex: 108% → 110%, 118% → 120%, mas 105% → 100%
 */
export function calcularFaixaComissao(percentualMeta: number): number {
  if (percentualMeta < 70) return 0;

  if (percentualMeta < 100) {
    // Arredonda para baixo: encontra a maior faixa que não supera o percentual
    const faixasAbaixo = FAIXAS_COMISSAO.filter(
      (f) => f.minimo <= percentualMeta && f.minimo < 100
    );
    if (!faixasAbaixo.length) return 0;
    return faixasAbaixo[0].percentual;
  }

  // Acima de 100%: arredonda para próxima faixa se faltar até 2%
  for (const faixa of FAIXAS_COMISSAO) {
    if (percentualMeta >= faixa.minimo) return faixa.percentual;
    if (faixa.minimo - percentualMeta <= 2) return faixa.percentual;
  }

  return 100;
}

/**
 * Calcula o valor final da comissão.
 */
export function calcularComissao(
  valorBase: number,
  percentualMeta: number
): { faixa: number; valor: number } {
  const faixa = calcularFaixaComissao(percentualMeta);
  const valor = (valorBase * faixa) / 100;
  return { faixa, valor };
}
