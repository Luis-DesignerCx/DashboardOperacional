/**
 * Distribuição greedy de contratos entre consultores.
 * Critérios (pesos): 60% valor financeiro, 25% clientes distintos, 15% contratos.
 */

export interface ContratoDistribuicao {
  contratoId: string;
  clienteId: string;
  valorTotalAberto: number;
}

export interface AtribuicaoConsultor {
  consultorId: string;
  contratoIds: string[];
  valorTotal: number;
  totalClientes: number;
  totalContratos: number;
}

// fatores: mapa consultorId → fator de capacidade (0–1). Consultor com fator 0.5
// recebe proporcionalmente metade dos contratos em relação a um consultor pleno.
export function distribuirCarteira(
  contratos: ContratoDistribuicao[],
  consultorIds: string[],
  fatores?: Map<string, number>
): AtribuicaoConsultor[] {
  if (!consultorIds.length || !contratos.length) return [];

  const atribuicoes: AtribuicaoConsultor[] = consultorIds.map((id) => ({
    consultorId: id,
    contratoIds: [],
    valorTotal: 0,
    totalClientes: 0,
    totalContratos: 0,
  }));

  const clientesPorConsultor = new Map<string, Set<string>>(
    consultorIds.map((id) => [id, new Set()])
  );

  const ordenados = [...contratos].sort((a, b) => b.valorTotalAberto - a.valorTotalAberto);

  for (const contrato of ordenados) {
    const alvo = atribuicoes.reduce((menor, atual) => {
      const fatorAtual = Math.max(0.01, fatores?.get(atual.consultorId) ?? 1);
      const fatorMenor = Math.max(0.01, fatores?.get(menor.consultorId) ?? 1);
      const scoreAtual = score(atual, clientesPorConsultor) / fatorAtual;
      const scoreMenor = score(menor, clientesPorConsultor) / fatorMenor;
      return scoreAtual < scoreMenor ? atual : menor;
    });

    alvo.contratoIds.push(contrato.contratoId);
    alvo.valorTotal += contrato.valorTotalAberto;
    clientesPorConsultor.get(alvo.consultorId)!.add(contrato.clienteId);
    alvo.totalClientes = clientesPorConsultor.get(alvo.consultorId)!.size;
    alvo.totalContratos += 1;
  }

  return atribuicoes;
}

function score(a: AtribuicaoConsultor, clientesMap: Map<string, Set<string>>): number {
  return 0.6 * a.valorTotal + 0.25 * a.totalClientes + 0.15 * a.totalContratos;
}

export function calcularEquilibrio(atribuicoes: AtribuicaoConsultor[]) {
  return {
    coeficienteVariacaoValor: cv(atribuicoes.map((a) => a.valorTotal)),
    coeficienteVariacaoClientes: cv(atribuicoes.map((a) => a.totalClientes)),
    coeficienteVariacaoContratos: cv(atribuicoes.map((a) => a.totalContratos)),
  };
}

function cv(vals: number[]): number {
  if (!vals.length) return 0;
  const media = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (!media) return 0;
  const variancia = vals.reduce((s, v) => s + (v - media) ** 2, 0) / vals.length;
  return (Math.sqrt(variancia) / media) * 100;
}
