// Web Worker: parseia xlsx em background para não travar o browser
// Filtra apenas linhas FP/PON e extrai só colunas necessárias antes de enviar
const PREFIXOS_FP = ["FP", "PON"];

self.onmessage = async (e: MessageEvent<{ buffer: ArrayBuffer }>) => {
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(new Uint8Array(e.data.buffer), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const todasLinhas: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    const cabecalho = (todasLinhas[0] ?? []) as any[];
    const dadosOriginais = todasLinhas.slice(1);

    // Tenta identificar coluna do documento varredendo todas as colunas
    const primeiraLinha = dadosOriginais[0] ?? [];
    const colDocumento = primeiraLinha.findIndex((_: any, i: number) =>
      dadosOriginais.slice(0, 20).some((row) =>
        PREFIXOS_FP.some((p) => String(row[i] ?? "").toUpperCase().trim().startsWith(p))
      )
    );

    // Usa coluna detectada ou cai para índice 1 (padrão)
    const idxDoc = colDocumento >= 0 ? colDocumento : 1;

    // Mapa de colunas (índices originais)
    const COLS = {
      documento: idxDoc,
      tipo:       cabecalho.findIndex((h: any) => /^tipo$/i.test(String(h).trim())) >= 0 ? cabecalho.findIndex((h: any) => /^tipo$/i.test(String(h).trim())) : 6,
      fornecedor: cabecalho.findIndex((h: any) => /fornecedor|cliente|nome/i.test(String(h).trim())) >= 0 ? cabecalho.findIndex((h: any) => /fornecedor|cliente|nome/i.test(String(h).trim())) : 7,
      valor:      cabecalho.findIndex((h: any) => /^valor$/i.test(String(h).trim())) >= 0 ? cabecalho.findIndex((h: any) => /^valor$/i.test(String(h).trim())) : 8,
      saldo:      cabecalho.findIndex((h: any) => /saldo/i.test(String(h).trim())) >= 0 ? cabecalho.findIndex((h: any) => /saldo/i.test(String(h).trim())) : 14,
      status:     cabecalho.findIndex((h: any) => /^status$/i.test(String(h).trim())) >= 0 ? cabecalho.findIndex((h: any) => /^status$/i.test(String(h).trim())) : 16,
      vencimento: cabecalho.findIndex((h: any) => /vencimento|venc/i.test(String(h).trim())) >= 0 ? cabecalho.findIndex((h: any) => /vencimento|venc/i.test(String(h).trim())) : 17,
      dataBaixa:  cabecalho.findIndex((h: any) => /data.*baixa|baixa.*data/i.test(String(h).trim())) >= 0 ? cabecalho.findIndex((h: any) => /data.*baixa|baixa.*data/i.test(String(h).trim())) : 18,
      tiposBaixa: cabecalho.findIndex((h: any) => /tipos.*baixa|baixa/i.test(String(h).trim())) >= 0 ? cabecalho.findIndex((h: any) => /tipos.*baixa|baixa/i.test(String(h).trim())) : 19,
    };

    // Filtra FP/PON e remapeia para índices 0-8
    const linhasFP = dadosOriginais
      .filter((row) => PREFIXOS_FP.some((p) => String(row[COLS.documento] ?? "").toUpperCase().trim().startsWith(p)))
      .map((row) => [
        row[COLS.documento], row[COLS.tipo], row[COLS.fornecedor], row[COLS.valor],
        row[COLS.saldo], row[COLS.status], row[COLS.vencimento], row[COLS.dataBaixa], row[COLS.tiposBaixa],
      ]);

    // Debug: primeiras 3 linhas originais + cabeçalho para diagnóstico
    const debugAmostra = dadosOriginais.slice(0, 3).map((row) =>
      cabecalho.map((h: any, i: number) => `[${i}]${h}:${row[i]}`).join(" | ")
    );

    self.postMessage({
      ok: true,
      linhasFP,
      colsDetectadas: COLS,
      cabecalho,
      debugAmostra,
      totalLinhasArquivo: dadosOriginais.length,
    });
  } catch (err: any) {
    self.postMessage({ ok: false, erro: err?.message || "Erro ao parsear arquivo" });
  }
};
