/**
 * Importação em bulk da planilha de inadimplência usando createMany.
 * Muito mais rápido que upserts individuais.
 * Uso: npx tsx prisma/seed-planilha.ts
 */
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();
const CHUNK = 3000; // registros por batch

// ─── Índices de coluna (0-based) ─────────────────────────────────────────────
const C = {
  statusContrato:        1,
  origem:                2,
  meioPagamento:         3,
  contrato:              4,
  nome:                  6,
  dataVencimento:        10,
  diasAtraso:            12,
  telefones:             14,
  emails:                16,
  totalParcelasVencidas: 17,
  valorContrato:         18,
  valorAReceber:         19,
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDateExcel(val: any): Date {
  if (val) {
    const serial = Number(val);
    if (!isNaN(serial) && serial > 40000) {
      return new Date((serial - 25569) * 86400 * 1000);
    }
    const str = String(val).trim();
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(`${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`);
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function parseDecimal(val: any): number {
  if (!val && val !== 0) return 0;
  const str = String(val).replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function normalizarTelefones(raw: string): string | null {
  if (!raw) return null;
  const norm = raw.split(/[,;|\/]/).map((s) => s.trim()).filter(Boolean).map((tel) => {
    const d = tel.replace(/\D/g, "");
    if (!d) return null;
    const s = d.startsWith("0") ? d.slice(1) : d;
    if (s.length === 10 || s.length === 11) return `55${s}`;
    if (s.length >= 12) return s;
    return null;
  }).filter((x): x is string => x !== null);
  if (!norm.length) return null;
  return [...new Set(norm)].join(",");
}

function identificarEmpresaId(
  num: string,
  empresas: Array<{ id: string; prefixos: string[]; nome: string }>
): string | null {
  const upper = num.toUpperCase();
  const sorted = [...empresas].sort(
    (a, b) => Math.max(...b.prefixos.map((p) => p.length), 0) - Math.max(...a.prefixos.map((p) => p.length), 0)
  );
  for (const e of sorted) {
    if (e.prefixos.some((p) => upper.startsWith(p.toUpperCase()))) return e.id;
  }
  return empresas.find((e) => e.nome === "Mydest")?.id ?? null;
}

async function insertChunks<T extends object>(
  label: string,
  items: T[],
  inserter: (chunk: T[]) => Promise<any>
) {
  let done = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    await inserter(chunk);
    done += chunk.length;
    process.stdout.write(`\r  ↳ ${label}: ${done}/${items.length}`);
  }
  console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dir = path.join(__dirname, "..", "planilhas");
  const arquivos = fs.readdirSync(dir).filter((f) => /\.(xlsx|xls)$/i.test(f));
  if (!arquivos.length) { console.error("Nenhuma planilha em /planilhas"); process.exit(1); }

  const arquivo = arquivos[0];
  console.log(`📂 Lendo: ${arquivo}`);

  const buffer = fs.readFileSync(path.join(dir, arquivo));
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const todasLinhas: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const linhas = todasLinhas.slice(1).filter((r) => String(r[C.contrato] ?? "").trim() !== "");
  console.log(`📊 ${linhas.length.toLocaleString("pt-BR")} linhas · agrupando por contrato...`);

  const competencia = await prisma.competencia.findFirst({ orderBy: [{ ano: "desc" }, { mes: "desc" }] });
  if (!competencia) throw new Error("Rode o seed principal primeiro.");
  console.log(`📅 ${competencia.descricao}`);

  const empresas = await prisma.empresa.findMany();
  const adminUser = await prisma.usuario.findFirst({ where: { perfil: "ADMINISTRADOR" } });

  // ── Limpa dados anteriores da competência (reimportação) ───────────────────
  console.log("🗑️  Limpando dados anteriores...");
  await prisma.carteiraParcela.deleteMany({ where: { competenciaId: competencia.id } });
  await prisma.parcela.deleteMany({});
  await prisma.contrato.deleteMany({});
  await prisma.cliente.deleteMany({});

  // ── Agrupa por contrato ────────────────────────────────────────────────────
  const grupos = new Map<string, any[][]>();
  for (const row of linhas) {
    const num = String(row[C.contrato] ?? "").trim();
    if (!num) continue;
    if (!grupos.has(num)) grupos.set(num, []);
    grupos.get(num)!.push(row);
  }
  console.log(`🔢 ${grupos.size.toLocaleString("pt-BR")} contratos únicos\n`);

  // ── Constrói todos os objetos em memória ───────────────────────────────────
  const clientesInsert: any[] = [];
  const contratosInsert: any[] = [];
  const parcelasInsert: any[] = [];
  const carteiraInsert: any[] = [];

  let erros = 0;
  const now = new Date();

  for (const [numeroContrato, rows] of Array.from(grupos)) {
    try {
      const r0 = rows[0];
      const nomeCliente = String(r0[C.nome] ?? "").trim();
      if (!nomeCliente) { erros++; continue; }

      const empresaId = identificarEmpresaId(numeroContrato, empresas);
      if (!empresaId) { erros++; continue; }

      const clienteId = randomUUID();
      const contratoId = randomUUID();

      let maiorDiasAtraso = 0;
      let valorTotalAberto = 0;

      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        const diasAtraso = parseInt(String(row[C.diasAtraso] ?? "0")) || 0;
        const valorAReceber = parseDecimal(row[C.valorAReceber]);
        if (diasAtraso > maiorDiasAtraso) maiorDiasAtraso = diasAtraso;
        valorTotalAberto += valorAReceber;

        parcelasInsert.push({
          id: randomUUID(),
          contratoId,
          numero: idx + 1,
          dataVencimento: parseDateExcel(row[C.dataVencimento]),
          diasAtraso,
          origem: String(row[C.origem] ?? "").trim() || null,
          meioPagamento: String(row[C.meioPagamento] ?? "").trim() || null,
          valorParcela: parseDecimal(row[C.valorAReceber]),
          valorTotalAberto: valorAReceber,
          paga: false,
          criadoEm: now,
          atualizadoEm: now,
        });
      }

      clientesInsert.push({
        id: clienteId,
        nome: nomeCliente,
        telefones: normalizarTelefones(String(r0[C.telefones] ?? "").trim()),
        emails: String(r0[C.emails] ?? "").trim() || null,
        criadoEm: now,
        atualizadoEm: now,
      });

      contratosInsert.push({
        id: contratoId,
        numero: numeroContrato,
        clienteId,
        empresaId,
        statusContrato: String(r0[C.statusContrato] ?? "").trim() || null,
        totalParcelasVencidas: parseInt(String(r0[C.totalParcelasVencidas] ?? "")) || null,
        maiorDiasAtraso,
        valorTotalAberto: parseFloat(valorTotalAberto.toFixed(2)),
        valorContrato: parseDecimal(r0[C.valorContrato]) || null,
        statusRecuperacao: "INADIMPLENTE",
        ativo: true,
        criadoEm: now,
        atualizadoEm: now,
      });
    } catch (err) {
      erros++;
    }
  }

  const totalContratos = contratosInsert.length;
  console.log(`📦 Inserindo ${totalContratos.toLocaleString("pt-BR")} clientes + contratos + ${parcelasInsert.length.toLocaleString("pt-BR")} parcelas...`);

  // ── Insert em bulk ─────────────────────────────────────────────────────────
  await insertChunks("Clientes", clientesInsert, (c) =>
    prisma.cliente.createMany({ data: c, skipDuplicates: true })
  );

  await insertChunks("Contratos", contratosInsert, (c) =>
    prisma.contrato.createMany({ data: c, skipDuplicates: true })
  );

  await insertChunks("Parcelas", parcelasInsert, (c) =>
    prisma.parcela.createMany({ data: c, skipDuplicates: true })
  );

  // ── Distribuição de carteira ───────────────────────────────────────────────
  console.log("\n🔀 Distribuindo carteira...");

  const obterEquipe = (d: number) => {
    if (d <= 0) return "FLASH";
    if (d <= 30) return "CRA_1_30";
    if (d <= 90) return "CR_31_90";
    return "CR_PDD_91";
  };

  const porEquipe = new Map<string, typeof contratosInsert>();
  for (const c of contratosInsert) {
    const t = obterEquipe(c.maiorDiasAtraso ?? 0);
    if (!porEquipe.has(t)) porEquipe.set(t, []);
    porEquipe.get(t)!.push(c);
  }

  for (const [tipo, contratos] of Array.from(porEquipe)) {
    const equipe = await prisma.equipe.findFirst({
      where: { tipo: tipo as any, ativa: true },
      include: { usuarios: { where: { ativo: true, perfil: "CONSULTOR" } } },
    });

    if (!equipe || !equipe.usuarios.length) {
      console.log(`  ⚠️  ${tipo}: sem consultores — ${contratos.length} contratos sem carteira`);
      continue;
    }

    const consultorIds = equipe.usuarios.map((u) => u.id);
    const n = consultorIds.length;
    const carga = new Array(n).fill(0);
    const ordenados = [...contratos].sort((a, b) => (b.valorTotalAberto ?? 0) - (a.valorTotalAberto ?? 0));

    for (const c of ordenados) {
      const idx = carga.indexOf(Math.min(...carga));
      carga[idx] += c.valorTotalAberto ?? 0;
      carteiraInsert.push({
        id: randomUUID(),
        contratoId: c.id,
        consultorId: consultorIds[idx],
        competenciaId: competencia.id,
        ativo: true,
        atribuidoEm: now,
      });
    }

    console.log(`  ✅ ${tipo}: ${contratos.length} contratos → ${n} consultor(es)`);
  }

  await insertChunks("Carteira", carteiraInsert, (c) =>
    prisma.carteiraParcela.createMany({ data: c, skipDuplicates: true })
  );

  // ── Registro de importação ─────────────────────────────────────────────────
  await prisma.importacao.create({
    data: {
      competenciaId: competencia.id,
      usuarioId: adminUser!.id,
      nomeArquivo: arquivo,
      totalLinhas: linhas.length,
      totalContratos,
      processadas: totalContratos,
      erros,
      status: "CONCLUIDO",
      concluidoEm: now,
    },
  });

  console.log(`\n🎉 Concluído!`);
  console.log(`   Contratos:  ${totalContratos.toLocaleString("pt-BR")}`);
  console.log(`   Parcelas:   ${parcelasInsert.length.toLocaleString("pt-BR")}`);
  console.log(`   Carteiras:  ${carteiraInsert.length.toLocaleString("pt-BR")}`);
  console.log(`   Erros:      ${erros}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
