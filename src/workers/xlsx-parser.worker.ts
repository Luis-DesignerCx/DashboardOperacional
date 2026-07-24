// Web Worker: parseia xlsx em background para não travar o browser
self.onmessage = async (e: MessageEvent<{ buffer: ArrayBuffer }>) => {
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(new Uint8Array(e.data.buffer), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const linhas: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    self.postMessage({ ok: true, linhas });
  } catch (err: any) {
    self.postMessage({ ok: false, erro: err?.message || "Erro ao parsear arquivo" });
  }
};
