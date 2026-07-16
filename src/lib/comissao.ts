import { calcularMultiplicador, calcularAtingimentoMonitoria } from "@/constants/comissao";

export interface MetaBreakdown {
  metaId: string;
  nome: string;
  tipo: string;
  peso: number;       // decimal, ex: 0.9
  valorBase: number;  // comissaoBase * peso, ex: 1422
  atingimento: number; // % atingida, ex: 83.3
  multiplicador: number; // faixa aplicada, ex: 80
  contribuicao: number; // valorBase * multiplicador/100, ex: 1137.60
  realizado: number | null;
  alvo: number | null;
}

export interface ResultadoComissao {
  totalRecebido: number;
  comissaoBase: number;
  totalComissao: number;
  breakdown: MetaBreakdown[];
}

export function calcularComissaoMetas(
  comissaoBase: number,
  metas: Array<{
    id: string;
    nome: string;
    tipo: string;
    peso: number | string;
    valorAlvo?: number | null;
    thresholdsMonitoria?: Record<string, number> | null;
    notaMonitoria?: number;
  }>,
  totalRecebido: number,
  quantidadeContratos?: number
): ResultadoComissao {
  const breakdown: MetaBreakdown[] = [];
  let totalComissao = 0;

  for (const meta of metas) {
    const peso = Number(meta.peso);
    const valorBase = comissaoBase * peso;

    let atingimento = 0;
    let alvo: number | null = null;
    let realizado: number | null = null;

    if (meta.tipo === "FINANCEIRA") {
      alvo = meta.valorAlvo != null ? Number(meta.valorAlvo) : null;
      realizado = totalRecebido;
      atingimento = alvo && alvo > 0 ? (totalRecebido / alvo) * 100 : 0;
    } else if (meta.tipo === "MONITORIA") {
      const nota = meta.notaMonitoria ?? 0;
      realizado = nota > 0 ? nota : null;
      if (meta.thresholdsMonitoria) {
        alvo = meta.thresholdsMonitoria["100"] ?? null;
        atingimento = nota > 0
          ? calcularAtingimentoMonitoria(nota, meta.thresholdsMonitoria)
          : 0;
      }
    } else if (meta.tipo === "QUANTIDADE") {
      alvo = meta.valorAlvo != null ? Number(meta.valorAlvo) : null;
      realizado = quantidadeContratos != null ? quantidadeContratos : null;
      atingimento = alvo && alvo > 0 && realizado != null ? (realizado / alvo) * 100 : 0;
    }

    const multiplicador = calcularMultiplicador(atingimento);
    const contribuicao = valorBase * (multiplicador / 100);
    totalComissao += contribuicao;

    breakdown.push({
      metaId: meta.id,
      nome: meta.nome,
      tipo: meta.tipo,
      peso,
      valorBase,
      atingimento,
      multiplicador,
      contribuicao,
      realizado,
      alvo,
    });
  }

  return { totalRecebido, comissaoBase, totalComissao, breakdown };
}
