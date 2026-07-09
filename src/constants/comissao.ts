export const FAIXAS_DISPLAY = [
  { meta: "<70%",  multiplicador: 0,   cor: "text-slate-500" },
  { meta: "70%",   multiplicador: 60,  cor: "text-orange-400" },
  { meta: "80%",   multiplicador: 70,  cor: "text-amber-400" },
  { meta: "90%",   multiplicador: 80,  cor: "text-yellow-400" },
  { meta: "100%",  multiplicador: 100, cor: "text-emerald-400" },
  { meta: "110%",  multiplicador: 110, cor: "text-emerald-400" },
  { meta: "120%",  multiplicador: 120, cor: "text-emerald-400" },
  { meta: "130%",  multiplicador: 130, cor: "text-emerald-400" },
  { meta: "140%",  multiplicador: 140, cor: "text-emerald-400" },
  { meta: "150%",  multiplicador: 150, cor: "text-emerald-400" },
  { meta: "160%+", multiplicador: 160, cor: "text-sky-400" },
];

// Abaixo de 100%: deflator -10% (90%→80%, 80%→70%, 70%→60%)
// Igual/acima de 100%: multiplicador = nível de faixa (100%→100%, 110%→110%...)
export function calcularMultiplicador(atingimento: number): number {
  if (atingimento >= 160) return 160;
  if (atingimento >= 150) return 150;
  if (atingimento >= 140) return 140;
  if (atingimento >= 130) return 130;
  if (atingimento >= 120) return 120;
  if (atingimento >= 110) return 110;
  if (atingimento >= 100) return 100;
  if (atingimento >= 90)  return 80;
  if (atingimento >= 80)  return 70;
  if (atingimento >= 70)  return 60;
  return 0;
}

// Para monitoria: dado a nota atual, retorna o nível de faixa atingido
export function calcularAtingimentoMonitoria(nota: number, thresholds: Record<string, number>): number {
  const faixas = [160, 150, 140, 130, 120, 110, 100, 90, 80, 70];
  for (const f of faixas) {
    const t = thresholds[String(f)];
    if (t !== undefined && nota >= t) return f;
  }
  return 0;
}

// Backward compat
export function calcularFaixaComissao(pct: number): number {
  return calcularMultiplicador(pct);
}
export function calcularComissao(valorBase: number, pct: number): { faixa: number; valor: number } {
  const faixa = calcularMultiplicador(pct);
  return { faixa, valor: (valorBase * faixa) / 100 };
}
