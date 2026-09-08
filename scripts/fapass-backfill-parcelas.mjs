// Backfill: cria as Parcela que faltam para contratos Fã Pass já importados
// ANTES da correção que passou a gerar parcela por linha da planilha.
//
// Só ADICIONA Parcela (uma por linha da planilha, mesma lógica de
// /api/fapass/importar-lote). NÃO toca em Contrato.valorTotalAberto,
// CarteiraParcela, FaPassInadimplencia nem Recebimento -- não recalcula
// distribuição, não mexe em nada já fechado da competência.
//
// Uso:
//   node scripts/fapass-backfill-parcelas.mjs "planilhas/INAD PASS SETEMBRO.xlsx" --dry-run
//   node scripts/fapass-backfill-parcelas.mjs "planilhas/INAD PASS SETEMBRO.xlsx" --write
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import xlsxPkg from "xlsx";
import { randomUUID } from "crypto";
import fs from "fs";

const XLSX = xlsxPkg;

const prisma = new PrismaClient();

const TERMOS_COLUNA = {
  documento: ["passaporte", "documento"],
  fornecedor: ["fornecedor", "nome", "cliente"],
  tipo: ["tipo"],
  valor: ["valor"],
  status: ["status"],
  vencimento: ["vencimento"],
  tiposBaixa: ["tiposbaixa", "tipos de baixa", "tipo de baixa"],
};

function normalizar(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function detectarColunas(header) {
  const normalizados = header.map((h) => normalizar(String(h ?? "")));
  const colunas = {};
  for (const [chave, termos] of Object.entries(TERMOS_COLUNA)) {
    const idx = normalizados.findIndex((h) => termos.some((t) => h === t || h.includes(t)));
    if (idx >= 0) colunas[chave] = idx;
  }
  return colunas;
}

function parsearValor(val) {
  if (val == null) return 0;
  if (typeof val === "number") return Math.abs(val);
  const s = String(val).trim().replace(/R\$\s*/g, "").replace(/\s/g, "");
  const limpo = s.includes(",") && s.includes(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : Math.abs(n);
}

function parsearData(val) {
  if (val == null || val === "") return null;
  if (val instanceof Date) return val;
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (!d) return null;
    return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  const s = String(val).trim();
  const dmY = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmY) return new Date(Date.UTC(+dmY[3], +dmY[2] - 1, +dmY[1]));
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

function isInadimplencia(tipo) {
  const t = String(tipo ?? "").trim();
  if (/^cart[aã]o/i.test(t)) return false;
  return /boleto/i.test(t) || /\brec\b|\brec\./i.test(t);
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const arquivo = process.argv[2];
  const escrever = process.argv.includes("--write");
  if (!arquivo || !fs.existsSync(arquivo)) {
    console.error("Uso: node scripts/fapass-backfill-parcelas.mjs <planilha.xlsx> [--write]");
    process.exit(1);
  }

  const wb = XLSX.readFile(arquivo);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const todasLinhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const header = todasLinhas[0];
  const C = detectarColunas(header);
  console.log("Colunas detectadas:", C);
  if (C.documento == null || C.valor == null || C.vencimento == null || C.status == null) {
    console.error("Não achei as colunas esperadas no cabeçalho:", header);
    process.exit(1);
  }
  const linhas = todasLinhas.slice(1).filter((r) => r && r.length > 0);

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ontem = new Date(hoje.getTime() - 86400000);

  // Mesmo agrupamento/filtro do import -- reconstrói exatamente o que já
  // formou o valorTotalAberto atual de cada contrato.
  const gruposInad = new Map();
  for (const row of linhas) {
    const doc = String(row[C.documento] ?? "").trim();
    if (!doc) continue;
    const docUpper = doc.toUpperCase();
    if (!(docUpper.startsWith("FP") || docUpper.startsWith("PON"))) continue;

    const status = String(row[C.status] ?? "").trim().toUpperCase();
    if (status !== "P") continue;

    if (C.tipo != null && !isInadimplencia(String(row[C.tipo] ?? ""))) continue;
    if (C.tiposBaixa != null && /cancelamento/i.test(String(row[C.tiposBaixa] ?? ""))) continue;

    const vencimento = parsearData(row[C.vencimento]);
    if (!vencimento) continue;
    if (vencimento > ontem) continue; // fora do que o import trataria como inadimplência já vencida

    if (!gruposInad.has(doc)) gruposInad.set(doc, []);
    gruposInad.get(doc).push({ valor: parsearValor(row[C.valor]), vencimento });
  }

  console.log(`Documentos únicos na planilha (FP/PON, filtrados): ${gruposInad.size}`);

  const docs = [...gruposInad.keys()];
  const contratos = await prisma.contrato.findMany({
    where: { numero: { in: docs } },
    select: { id: true, numero: true, valorTotalAberto: true, _count: { select: { parcelas: true } } },
  });
  const contratoMap = new Map(contratos.map((c) => [c.numero, c]));

  let semContrato = 0, jaTemParcela = 0, backfillar = 0, divergentes = 0;
  const paraGravar = [];
  const relatorioDivergencia = [];

  for (const [doc, linhasGrupo] of gruposInad) {
    const contrato = contratoMap.get(doc);
    if (!contrato) { semContrato++; continue; }
    if (contrato._count.parcelas > 0) { jaTemParcela++; continue; }

    const valorTotalPlanilha = linhasGrupo.reduce((s, l) => s + l.valor, 0);
    const valorAtualDB = Number(contrato.valorTotalAberto ?? 0);
    const diff = Math.abs(valorTotalPlanilha - valorAtualDB);

    if (diff > 0.05) {
      divergentes++;
      relatorioDivergencia.push({ doc, valorTotalPlanilha: valorTotalPlanilha.toFixed(2), valorAtualDB: valorAtualDB.toFixed(2), diff: diff.toFixed(2) });
      continue; // não grava parcela pra contrato divergente -- fica pra revisão manual
    }

    backfillar++;
    let numero = 1;
    for (const l of linhasGrupo) {
      paraGravar.push({
        id: randomUUID(),
        contratoId: contrato.id,
        numero: numero++,
        dataVencimento: l.vencimento,
        diasAtraso: Math.max(0, Math.floor((hoje.getTime() - l.vencimento.getTime()) / 86400000)),
        valorParcela: l.valor,
        valorTotalAberto: l.valor,
      });
    }
  }

  console.log("\n── Resumo ──────────────────────────────────");
  console.log(`Contratos sem match no banco:       ${semContrato}`);
  console.log(`Contratos que já têm parcela:        ${jaTemParcela}`);
  console.log(`Contratos com valor divergente:      ${divergentes} (não serão tocados)`);
  console.log(`Contratos a receber backfill:         ${backfillar}`);
  console.log(`Parcelas a criar:                     ${paraGravar.length}`);
  console.log(`Soma das parcelas a criar:            R$ ${paraGravar.reduce((s, p) => s + p.valorTotalAberto, 0).toFixed(2)}`);

  if (relatorioDivergencia.length > 0) {
    console.log("\n── Divergências (planilha x banco) — revisar manualmente ──");
    for (const d of relatorioDivergencia.slice(0, 20)) {
      console.log(`  ${d.doc}: planilha R$${d.valorTotalPlanilha} vs banco R$${d.valorAtualDB} (dif R$${d.diff})`);
    }
    if (relatorioDivergencia.length > 20) console.log(`  ... e mais ${relatorioDivergencia.length - 20}`);
  }

  if (!escrever) {
    console.log("\n[DRY RUN] Nenhuma escrita feita. Rode com --write para gravar de fato.");
    await prisma.$disconnect();
    return;
  }

  console.log("\nGravando parcelas...");
  for (const ck of chunks(paraGravar, 500)) {
    await prisma.parcela.createMany({ data: ck });
  }
  console.log(`OK — ${paraGravar.length} parcelas criadas para ${backfillar} contratos.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
