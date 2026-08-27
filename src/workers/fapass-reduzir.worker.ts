// Web Worker: reduz a planilha bruta do Fã Pass no navegador, mantendo só as
// linhas com Documento prefixado FP/PON (as únicas que a importação usa) —
// preserva TODAS as colunas na posição original (não remapeia), pra não
// quebrar o mapeamento fixo usado no backend. Roda em background pra não
// travar a aba enquanto processa arquivos grandes (ex: 56MB).
const PREFIXOS = ["FP", "PON"];

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

self.onmessage = async (e: MessageEvent<{ buffer: ArrayBuffer }>) => {
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(new Uint8Array(e.data.buffer), { type: "array" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const todasLinhas: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    if (todasLinhas.length === 0) {
      self.postMessage({ ok: false, erro: "Planilha vazia" });
      return;
    }

    const cabecalho = todasLinhas[0] as any[];
    let idxDoc = cabecalho.findIndex((h) => normalizar(String(h ?? "")) === "documento");
    if (idxDoc < 0) idxDoc = 1; // fallback: índice conhecido do layout "Base CAR Passaporte"

    const linhasReduzidas: any[][] = [cabecalho];
    let total = 0;
    for (let i = 1; i < todasLinhas.length; i++) {
      const row = todasLinhas[i];
      total++;
      const doc = String(row[idxDoc] ?? "").trim().toUpperCase();
      if (PREFIXOS.some((p) => doc.startsWith(p))) linhasReduzidas.push(row);
    }
    const mantidas = linhasReduzidas.length - 1;

    const novaWs = XLSX.utils.aoa_to_sheet(linhasReduzidas);
    const novoWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(novoWb, novaWs, sheetName);
    const outBuffer = XLSX.write(novoWb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    self.postMessage({ ok: true, buffer: outBuffer, total, mantidas }, { transfer: [outBuffer] });
  } catch (err: any) {
    self.postMessage({ ok: false, erro: err?.message || "Erro ao reduzir arquivo" });
  }
};
