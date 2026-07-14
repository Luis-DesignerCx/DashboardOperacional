// Conta dias úteis (segunda a sexta) dentro de um intervalo [inicio, fim] inclusive
function contarDiasUteis(inicio: Date, fim: Date): number {
  let count = 0;
  const d = new Date(inicio);
  d.setHours(0, 0, 0, 0);
  const f = new Date(fim);
  f.setHours(23, 59, 59, 999);
  while (d <= f) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// Retorna o total de dias úteis de um mês (mes 1-12, ano YYYY)
export function diasUteisNoMes(mes: number, ano: number): number {
  const inicio = new Date(ano, mes - 1, 1);
  const fim = new Date(ano, mes, 0); // último dia do mês
  return contarDiasUteis(inicio, fim);
}

// Retorna o primeiro dia útil (seg-sex) de um mês (mes 1-12, ano YYYY) como Date UTC
export function primeiroDiaUtilDoMes(mes: number, ano: number): Date {
  const d = new Date(Date.UTC(ano, mes - 1, 1));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

// Calcula o fator de férias para um consultor: (diasUteis - diasFeriasNoMes) / diasUteis
// dataInicio e dataFim são as datas das férias (podem se estender além do mês)
export function fatorFerias(mes: number, ano: number, dataInicio: Date, dataFim: Date): number {
  const inicioMes = new Date(ano, mes - 1, 1);
  const fimMes = new Date(ano, mes, 0);

  // Intersecção das férias com o mês
  const inicioIntersec = dataInicio > inicioMes ? dataInicio : inicioMes;
  const fimIntersec = dataFim < fimMes ? dataFim : fimMes;

  if (inicioIntersec > fimIntersec) return 1; // férias fora do mês → fator pleno

  const totalUteis = diasUteisNoMes(mes, ano);
  if (totalUteis === 0) return 1;

  const diasFeriasUteis = contarDiasUteis(inicioIntersec, fimIntersec);
  const diasTrabalhados = Math.max(0, totalUteis - diasFeriasUteis);
  return diasTrabalhados / totalUteis;
}
