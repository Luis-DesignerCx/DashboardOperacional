// Web Worker: reduz a planilha bruta do Fã Pass no navegador, mantendo só as
// linhas com Documento prefixado FP/PON (as únicas que a importação usa).
//
// IMPORTANTE: não usa a lib "xlsx" (SheetJS) pra isso — pra arquivos reais
// (ex: 56MB / ~350 mil linhas) a aba principal descomprime pra ~400MB de XML,
// e montar um objeto JS por célula pra isso tudo é lento e pesado demais pra
// rodar num Worker (risco de estourar memória e falhar sem erro claro).
// Em vez disso, mexe direto no XML dentro do .xlsx (que é um .zip): lê o
// sheet1.xml como texto, filtra as linhas por regex mantendo o XML original
// de cada linha (sem reconstruir células), e regrava só esse arquivo dentro
// do zip — as outras partes (estilos, sharedStrings etc.) ficam intactas.
// Validado localmente contra o arquivo real: ~350 mil linhas em ~20s.
import JSZip from "jszip";

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    let text = "";
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(m[1]))) text += tm[1];
    out.push(decodeXmlEntities(text));
  }
  return out;
}

function cellValue(cellXml: string, sharedStrings: string[]): string {
  const typeMatch = /\st="([^"]*)"/.exec(cellXml);
  const type = typeMatch ? typeMatch[1] : null;
  const vMatch = /<v>([\s\S]*?)<\/v>/.exec(cellXml);
  if (!vMatch) return "";
  if (type === "s") return sharedStrings[Number(vMatch[1])] ?? "";
  return decodeXmlEntities(vMatch[1]);
}

self.onmessage = async (e: MessageEvent<{ buffer: ArrayBuffer }>) => {
  try {
    const zip = await JSZip.loadAsync(e.data.buffer);

    const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
    if (!workbookXml) throw new Error("workbook.xml não encontrado no arquivo");
    const sheetMatch = /<sheet[^>]*r:id="(rId\d+)"[^>]*\/?>/.exec(workbookXml);
    const rid = sheetMatch?.[1] ?? "rId1";

    const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
    let sheetPath = "xl/worksheets/sheet1.xml"; // fallback
    if (relsXml) {
      const relRe = new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*Target="([^"]*)"[^>]*/?>`);
      const relMatch = relRe.exec(relsXml);
      if (relMatch) sheetPath = "xl/" + relMatch[1].replace(/^\/?xl\//, "").replace(/^\/?/, "");
    }

    const sharedStringsFile = zip.file("xl/sharedStrings.xml");
    const sharedStrings = sharedStringsFile
      ? parseSharedStrings(await sharedStringsFile.async("string"))
      : [];

    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) throw new Error(`Aba "${sheetPath}" não encontrada no arquivo`);
    const sheetXml = await sheetFile.async("string");

    const sheetDataStart = sheetXml.indexOf("<sheetData");
    if (sheetDataStart < 0) throw new Error("Planilha vazia");
    const sheetDataOpenEnd = sheetXml.indexOf(">", sheetDataStart) + 1;
    const sheetDataCloseStart = sheetXml.indexOf("</sheetData>");
    if (sheetDataCloseStart < 0) throw new Error("Planilha vazia");
    const before = sheetXml.slice(0, sheetDataOpenEnd);
    const after = sheetXml.slice(sheetDataCloseStart);
    const body = sheetXml.slice(sheetDataOpenEnd, sheetDataCloseStart);

    const rowRe = /<row [^>]*r="\d+"[^>]*>[\s\S]*?<\/row>/g;
    const firstRowMatch = rowRe.exec(body);
    if (!firstRowMatch) {
      self.postMessage({ ok: false, erro: "Planilha vazia" });
      return;
    }
    const headerRowXml = firstRowMatch[0];

    const cellRe = /<c r="([A-Z]+)\d+"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g;
    let docCol: string | null = null;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(headerRowXml))) {
      const val = cellValue(cm[0], sharedStrings);
      if (String(val).trim().toLowerCase() === "documento") {
        docCol = cm[1];
        break;
      }
    }
    if (!docCol) docCol = "B"; // fallback: índice conhecido do layout "Base CAR Passaporte"

    const docCellRe = new RegExp(`<c r="${docCol}\\d+"[^>]*(?:/>|>[\\s\\S]*?</c>)`);
    const linhasReduzidas: string[] = [headerRowXml];
    let total = 0;
    let isFirst = true;
    while (true) {
      const m = rowRe.exec(body);
      if (!m) break;
      if (isFirst) {
        isFirst = false;
        continue; // já adicionado como cabeçalho
      }
      total++;
      const dm = docCellRe.exec(m[0]);
      const doc = dm ? String(cellValue(dm[0], sharedStrings)).trim().toUpperCase() : "";
      if (doc.startsWith("FP") || doc.startsWith("PON")) linhasReduzidas.push(m[0]);
    }
    const mantidas = linhasReduzidas.length - 1;

    if (total === 0) {
      self.postMessage({ ok: false, erro: "Planilha vazia" });
      return;
    }

    const newSheetXml = before + linhasReduzidas.join("") + after;
    zip.file(sheetPath, newSheetXml);

    const outBuffer = await zip.generateAsync({
      type: "arraybuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 1 },
    });

    self.postMessage({ ok: true, buffer: outBuffer, total, mantidas }, { transfer: [outBuffer] });
  } catch (err: any) {
    self.postMessage({ ok: false, erro: err?.message || "Erro ao reduzir arquivo" });
  }
};
