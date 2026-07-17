// Mapeamento automático: prefixo do contrato → empresa
export const PREFIXOS_EMPRESA: Record<string, string> = {
  BC: "Barretos A&B",
  BCB: "Barretos A&B",
  BCC: "Barretos C",
  PG: "Pitangui",
  RP: "Royal Prime",
  RS: "Royal Star",
  FP: "Fã Pass",
  PON: "Fã Pass",
};

export const EMPRESAS = [
  { nome: "Barretos A&B", prefixos: ["BC", "BCB"] },
  { nome: "Barretos C", prefixos: ["BCC"] },
  { nome: "Royal Prime", prefixos: ["RP"] },
  { nome: "Royal Star", prefixos: ["RS"] },
  { nome: "Pitangui", prefixos: ["PG"] },
  { nome: "Mydest", prefixos: [] }, // todos os demais contratos
  { nome: "Fã Pass", prefixos: ["FP", "PON"] },
];

// Identifica empresa pelo número do contrato
export function identificarEmpresa(numeroContrato: string): string {
  const upper = numeroContrato.toUpperCase().trim();

  // Testa prefixos do maior para o menor (BCB antes de BC)
  const prefixosOrdenados = Object.keys(PREFIXOS_EMPRESA).sort(
    (a, b) => b.length - a.length
  );

  for (const prefixo of prefixosOrdenados) {
    if (upper.startsWith(prefixo)) {
      return PREFIXOS_EMPRESA[prefixo];
    }
  }

  return "Mydest"; // fallback
}
