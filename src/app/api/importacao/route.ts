export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { randomUUID } from "crypto";
import { identificarEmpresa } from "@/constants/empresas";
import { obterEquipePorDiasAtraso } from "@/constants/equipes";
import { distribuirCarteira } from "@/utils/distribuicao-carteira";
import { fatorFerias } from "@/utils/dias-uteis";
import { TipoEquipe } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";

// ─── Índices de coluna fixos (0-based) — fallback quando o cabeçalho não é
// reconhecido (ver detectarColunasPorCabecalho). Cada layout de planilha já
// visto até hoje tem colunas em posições diferentes — por isso a leitura real
// é sempre por NOME da coluna no cabeçalho; estes números são só o último
// recurso caso uma coluna não seja encontrada pelo nome.
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

// Mesmo fallback, mas com os valores confirmados do export "FLASH" (relatório
// "Consulta Inadimplência" do sistema de cobrança), usado quando a
// importação é do tipo FLASH e o cabeçalho não bate com nenhum termo
// conhecido — na prática, quase sempre é sobrescrito pela detecção abaixo.
const C_FLASH = {
  statusContrato:        10, // K — "Status" (ex: VENCIDO)
  origem:                3,  // D — "Origem"
  meioPagamento:         4,  // E — "Meio de pagamento"
  contrato:              5,  // F — "Contrato"
  nome:                  7,  // H — "Nome da pessoa"
  dataVencimento:        11, // L — "Data de vencimento"
  diasAtraso:            13, // N — "Quantidade de dias vencido"
  telefones:             17, // R — "Telefones"
  emails:                19, // T — "E-mails"
  totalParcelasVencidas: 20, // U
  valorContrato:         23, // X — "Valor do contrato"
  valorAReceber:         24, // Y — "Valor a receber"
} as const;

type ColunaKey = keyof typeof C;

// Termos de cabeçalho usados para localizar cada coluna pelo NOME, e não por
// índice fixo — cobre layouts diferentes (ex: BASE "crua" e FLASH, que usam
// nomes de coluna iguais em posições diferentes) sem precisar mapear cada
// planilha na mão. Só sobrescreve o índice fixo quando encontra um termo com
// confiança razoável; senão mantém o fallback (`C`/`C_FLASH`).
const TERMOS_COLUNA: Partial<Record<ColunaKey, string[]>> = {
  nome:                  ["nome da pessoa", "nome do cliente", "nome completo", "nome"],
  statusContrato:        ["status do contrato", "status contrato", "status"],
  origem:                ["origem"],
  meioPagamento:         ["meio de pagamento", "meio pagamento", "forma de pagamento"],
  dataVencimento:        ["data de vencimento"],
  diasAtraso:            ["quantidade de dias vencido", "dias de atraso", "dias atraso", "dias vencido"],
  valorContrato:         ["valor do contrato", "valor contrato"],
  valorAReceber:         ["valor a receber", "valor receber", "saldo devedor"],
  telefones:             ["telefone", "telefones", "celular"],
  emails:                ["e-mail", "email", "emails"],
  totalParcelasVencidas: ["parcelas vencidas"],
};

// Detecta o número do contrato pelo cabeçalho, com cuidado pra não colidir
// com "status do contrato" / "valor do contrato" (que também contêm a
// palavra "contrato").
function detectarColunaContrato(normalizados: string[]): number | null {
  const termosEspecificos = [
    "numero do contrato", "número do contrato", "nº do contrato", "nº contrato",
    "num contrato", "numero contrato", "codigo do contrato", "código do contrato", "cod contrato",
  ];
  for (const termo of termosEspecificos) {
    const i = normalizados.findIndex((c) => c.includes(termo));
    if (i !== -1) return i;
  }
  const i = normalizados.findIndex((c) => c === "contrato");
  return i !== -1 ? i : null;
}

function detectarColunasPorCabecalho(header: any[], fallback: Record<ColunaKey, number>): Record<ColunaKey, number> {
  const normalizados = header.map((h) => normalizar(String(h ?? "")));
  const resolvido: Record<ColunaKey, number> = { ...fallback };

  const idxContrato = detectarColunaContrato(normalizados);
  if (idxContrato !== null) resolvido.contrato = idxContrato;

  for (const campo of Object.keys(TERMOS_COLUNA) as ColunaKey[]) {
    const termos = TERMOS_COLUNA[campo]!;
    for (const termo of termos) {
      const i = normalizados.findIndex((c) => c.includes(termo));
      if (i !== -1) { resolvido[campo] = i; break; }
    }
  }

  return resolvido;
}

// Normaliza string para comparação flexível (remove acentos, lower, trim)
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// ─── Regras de filtro de inadimplência (Regras_de_Filtro.docx) ──────────────
// Aplicadas a BASE e FLASH igualmente. Ver planilhas/Regras_de_Filtro (1).docx.

// 1. Status do contrato — mantém só ATIVO / ATIVOREV (nível do contrato).
const STATUS_PERMITIDOS = new Set(["ativo", "ativorev"]);

// 2. Origem — mantém só estas (nível da parcela).
const ORIGENS_PERMITIDAS = new Set([
  "saldo", "saldo alocado", "entrada", "entrada efetiva", "entrada alocada", "intermediaria",
]);

// 4. Tags — remove a linha se QUALQUER tag da célula bater EXATAMENTE (não
// "contém") com uma destas. Ex: "PRORVENCCONT" não é removida mesmo contendo
// "PRO" como substring — por isso a comparação é por token, não por includes.
const TAGS_PROIBIDAS = new Set([
  "7dias", "jud", "pos7n", "judsemlim", "audtdist", "pro", "proclim", "raq", "expirado", "pdd181+",
]);
function temTagProibida(tagsCell: string): boolean {
  if (!tagsCell) return false;
  return tagsCell
    .split(",")
    .map((t) => normalizar(t).replace(/\s+/g, ""))
    .some((t) => t && TAGS_PROIBIDAS.has(t));
}

// 5. Meio de pagamento — mantém só Boleto/Cartão/Pix, agrupando os valores
// originais da planilha. Qualquer outro valor (ex: REPASSE, Transferência
// Bancária, Depósito em Conta Corrente) é excluído.
const MEIO_PAGAMENTO_CATEGORIA: Record<string, "BOLETO" | "CARTAO" | "PIX"> = {
  "boleto bancario": "BOLETO",
  "cartao de credito": "CARTAO",
  "cartao de credito cob": "CARTAO",
  "link para pagamento": "CARTAO",
  "link para pagamento cob": "CARTAO",
  "cartao recorrente": "CARTAO",
  "cartao recorrente cob": "CARTAO",
  "pix": "PIX",
  "pix cob": "PIX",
};
function categoriaMeioPagamento(valor: string): "BOLETO" | "CARTAO" | "PIX" | null {
  return MEIO_PAGAMENTO_CATEGORIA[normalizar(valor)] ?? null;
}

// Detecta coluna de "Data da venda" pelo cabeçalho (regra 3)
function detectarColunaDataVenda(header: any[]): number | null {
  const termos = ["data da venda", "data venda"];
  for (let i = 0; i < header.length; i++) {
    const cell = normalizar(String(header[i] ?? ""));
    if (termos.some((t) => cell.includes(t))) return i;
  }
  return null;
}

// Detecta coluna de "Tags" pelo cabeçalho (regra 4)
function detectarColunaTags(header: any[]): number | null {
  for (let i = 0; i < header.length; i++) {
    if (normalizar(String(header[i] ?? "")).includes("tags")) return i;
  }
  return null;
}

// Detecta coluna de "Número do documento" pelo cabeçalho (regra 6)
function detectarColunaNumeroDocumento(header: any[]): number | null {
  const termos = ["numero do documento", "número do documento", "nº documento", "num documento", "numero documento"];
  for (let i = 0; i < header.length; i++) {
    const cell = normalizar(String(header[i] ?? ""));
    if (termos.some((t) => cell.includes(normalizar(t)))) return i;
  }
  return null;
}

// Detecta coluna de consultor pelo cabeçalho
function detectarColunaConsultor(header: any[]): number | null {
  const termos = ["consultor", "responsavel", "colaborador", "atendente", "operador"];
  for (let i = 0; i < header.length; i++) {
    const cell = normalizar(String(header[i] ?? ""));
    if (termos.some((t) => cell.includes(t))) return i;
  }
  return null;
}

// Detecta coluna de faixa/lote pelo cabeçalho
function detectarColunaFaixa(header: any[]): number | null {
  const termos = ["faixa", "lote", "dias"];
  for (let i = 0; i < header.length; i++) {
    const cell = normalizar(String(header[i] ?? ""));
    if (termos.some((t) => cell.includes(t))) return i;
  }
  return null;
}

// Localiza a linha real do cabeçalho — alguns exports (ex: "FLASH") têm
// linhas de título do relatório (nome do sistema, "Consulta Inadimplência",
// data de emissão etc.) antes da linha que de fato nomeia as colunas.
function encontrarLinhaCabecalho(todasLinhas: any[][]): number {
  const limite = Math.min(todasLinhas.length, 15);
  for (let i = 0; i < limite; i++) {
    const normalizados = (todasLinhas[i] ?? []).map((c) => normalizar(String(c ?? "")));
    if (normalizados.includes("contrato")) return i;
  }
  return 0; // fallback: assume que a primeira linha já é o cabeçalho
}

// Detecta linha de totais/rodapé da planilha (ex: "TOTAL", "TOTAL GERAL") pra
// não contar como cliente — senão os valores somados no rodapé entram de novo
// no total geral, duplicando o valor de inadimplência.
function ehLinhaDeTotal(row: any[], colunaContrato: number, colunaNome: number): boolean {
  const contratoTxt = normalizar(String(row[colunaContrato] ?? ""));
  const nomeTxt      = normalizar(String(row[colunaNome] ?? ""));
  return contratoTxt.includes("total") || nomeTxt.includes("total");
}

// Limite defensivo: nenhum contrato real deveria ter tantas parcelas assim.
// Se a coluna de número do contrato for lida errado (ex: aponta pra "meio de
// pagamento"), muitas linhas de clientes diferentes colidem no mesmo grupo —
// isso trava a importação desse grupo em vez de criar um contrato monstro
// com valor de inadimplência absurdo.
const LIMITE_PARCELAS_POR_CONTRATO = 300;

// Mapeia texto da faixa da planilha para TipoEquipe
function faixaParaTipoEquipe(faixa: string): TipoEquipe | null {
  const f = normalizar(faixa);
  if (f.includes("1 a 30") || f.includes("1a30"))   return "CRA_1_30";
  if (f.includes("31 a 90") || f.includes("31a90"))  return "CR_31_90";
  if (f.includes("91 a 180") || f.includes("91a180")) return "CR_PDD_91_180";
  if (f.includes("181") || f.includes("91+") || f.includes("pdd")) return "CR_PDD_91_180";
  if (f.includes("flash"))                             return "FLASH";
  return null;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  if (!["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const formData = await req.formData();
  const arquivo  = formData.get("arquivo")      as File;
  const competenciaId = formData.get("competenciaId") as string;
  const isFlash  = (formData.get("tipoBase") as string | null) === "FLASH";

  if (!arquivo || !competenciaId) {
    return NextResponse.json({ erro: "Arquivo e competência são obrigatórios" }, { status: 400 });
  }

  const competencia = await prisma.competencia.findUnique({ where: { id: competenciaId } });
  if (!competencia) return NextResponse.json({ erro: "Competência não encontrada" }, { status: 404 });
  if (competencia.fechada) return NextResponse.json({ erro: "Competência fechada" }, { status: 400 });

  const importacao = await prisma.importacao.create({
    data: { competenciaId, usuarioId: session.user.id, nomeArquivo: arquivo.name, totalLinhas: 0, status: "PROCESSANDO" },
  });

  try {
    // ── 1. Parse XLSX em memória ─────────────────────────────────────────────
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const todasLinhas: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const linhaCabecalho = encontrarLinhaCabecalho(todasLinhas);
    const headerRow = todasLinhas[linhaCabecalho] ?? [];
    const colunas = detectarColunasPorCabecalho(headerRow, isFlash ? C_FLASH : C);
    console.log(`Importação (${isFlash ? "FLASH" : "BASE"}): cabeçalho na linha ${linhaCabecalho + 1}, colunas resolvidas =`, colunas);
    const colunaConsultor = detectarColunaConsultor(headerRow);
    const colunaFaixa = detectarColunaFaixa(headerRow);
    const colunaDataVenda = detectarColunaDataVenda(headerRow);
    const colunaTags = detectarColunaTags(headerRow);
    const colunaNumeroDocumento = detectarColunaNumeroDocumento(headerRow);
    if (colunaDataVenda === null) console.log("Importação: coluna 'Data da venda' não encontrada — regra 3 (mês corrente) não aplicada.");
    if (colunaTags === null) console.log("Importação: coluna 'Tags' não encontrada — regra 4 (tags proibidas) não aplicada.");
    if (colunaNumeroDocumento === null) console.log("Importação: coluna 'Número do documento' não encontrada — regra 6 não aplicada.");
    let linhasDeTotalDescartadas = 0;
    const linhas = todasLinhas.slice(linhaCabecalho + 1).filter((row) => {
      if (String(row[colunas.contrato] ?? "").trim() === "") return false;
      if (ehLinhaDeTotal(row, colunas.contrato, colunas.nome)) { linhasDeTotalDescartadas++; return false; }
      return true;
    });
    if (linhasDeTotalDescartadas > 0) {
      console.log(`Importação: ${linhasDeTotalDescartadas} linha(s) de total/rodapé descartada(s).`);
    }

    // ── 2. Agrupa por contrato ───────────────────────────────────────────────
    const grupos = new Map<string, any[][]>();
    for (const row of linhas) {
      const num = String(row[colunas.contrato] ?? "").trim();
      if (!num) continue;
      if (!grupos.has(num)) grupos.set(num, []);
      grupos.get(num)!.push(row);
    }

    // Descarta grupos anormalmente grandes — provável coluna de contrato mal
    // detectada, unindo linhas de clientes diferentes num único "contrato".
    let errosPorGrupoGigante = 0;
    const detalhesErrosGrupoGigante: { contrato: string; motivo: string }[] = [];
    for (const [num, rows] of [...grupos]) {
      if (rows.length > LIMITE_PARCELAS_POR_CONTRATO) {
        const motivo = `Grupo com ${rows.length} linhas excede o limite de ${LIMITE_PARCELAS_POR_CONTRATO} (provável coluna de contrato incorreta)`;
        console.error(`Importação: grupo "${num}" — ${motivo} — descartado.`);
        grupos.delete(num);
        errosPorGrupoGigante++;
        detalhesErrosGrupoGigante.push({ contrato: num, motivo });
      }
    }

    // Regras 1 e 3 (nível de contrato): status do contrato e data da venda.
    // "Mês corrente" = mês/ano reais no momento da importação.
    const agora = new Date();
    const mesCorrente = agora.getUTCMonth();
    const anoCorrente = agora.getUTCFullYear();
    let filtradosPorStatusOuData = 0;
    for (const [num, rows] of [...grupos]) {
      const row0 = rows[0];
      const statusOk = STATUS_PERMITIDOS.has(normalizar(String(row0[colunas.statusContrato] ?? "")));
      let dataVendaOk = true;
      if (colunaDataVenda !== null) {
        const dataVenda = parseDateExcel(row0[colunaDataVenda]);
        if (dataVenda && dataVenda.getUTCFullYear() === anoCorrente && dataVenda.getUTCMonth() === mesCorrente) {
          dataVendaOk = false;
        }
      }
      if (!statusOk || !dataVendaOk) {
        grupos.delete(num);
        filtradosPorStatusOuData++;
      }
    }
    if (filtradosPorStatusOuData > 0) {
      console.log(`Importação: ${filtradosPorStatusOuData} contrato(s) filtrado(s) por status ou data da venda (regras 1/3).`);
    }

    // ── 3. Carrega empresas e contratos existentes (1 query cada) ────────────
    const empresas = await prisma.empresa.findMany();
    const empresaFallbackId = empresas.find((e) => e.prefixos.length === 0)?.id ?? null;
    const empresaCache = new Map<string, string | null>();
    function resolverEmpresaId(num: string): string | null {
      if (empresaCache.has(num)) return empresaCache.get(num)!;
      const numUp = num.toUpperCase();
      // Prefixo mais longo ganha (BCC antes de BC)
      let melhorMatch: { id: string; prefixLen: number } | null = null;
      for (const e of empresas) {
        for (const p of e.prefixos) {
          if (numUp.startsWith(p.toUpperCase()) && p.length > (melhorMatch?.prefixLen ?? 0)) {
            melhorMatch = { id: e.id, prefixLen: p.length };
          }
        }
      }
      // Fallback: empresa sem prefixos (Mydest) — recebe tudo que não casa com nenhum prefixo
      const resultado = melhorMatch?.id ?? empresaFallbackId;
      empresaCache.set(num, resultado);
      return resultado;
    }

    const allNums = [...grupos.keys()];
    const existingContratos = await prisma.contrato.findMany({
      where: { numero: { in: allNums } },
      select: { id: true, numero: true, clienteId: true },
    });
    const existingMap = new Map(existingContratos.map((c) => [c.numero, c]));

    // Importação FLASH: contratos que já têm carteira nesta competência
    // atribuída a uma equipe que NÃO é Flash (ou seja, já fazem parte da
    // base mensal) são ignorados por completo — não entram, não atualizam
    // dados nem parcelas. Contratos já em Flash (envio incremental semanal)
    // continuam sendo atualizados normalmente.
    let ignoradosPorBaseMensal = 0;
    if (isFlash && existingContratos.length > 0) {
      const carteirasExistentes = await prisma.carteiraParcela.findMany({
        where: { competenciaId, contratoId: { in: existingContratos.map((c) => c.id) } },
        include: { consultor: { include: { equipe: true } } },
      });
      const contratoIdParaTipoEquipe = new Map(
        carteirasExistentes.map((c) => [c.contratoId, c.consultor.equipe?.tipo])
      );
      for (const [num, ec] of [...existingMap]) {
        const tipoEquipe = contratoIdParaTipoEquipe.get(ec.id);
        if (tipoEquipe && tipoEquipe !== "FLASH") {
          grupos.delete(num);
          existingMap.delete(num);
          ignoradosPorBaseMensal++;
        }
      }
      if (ignoradosPorBaseMensal > 0) {
        console.log(`Importação FLASH: ${ignoradosPorBaseMensal} contrato(s) ignorado(s) por já estarem na base mensal desta competência.`);
      }
    }

    // ── 4. Prepara dados em memória ──────────────────────────────────────────
    type ClienteRow  = { id: string; nome: string; telefones: string | null; emails: string | null };
    type ContratoRow = {
      id: string; numero: string; clienteId: string; empresaId: string;
      statusContrato: string | null; totalParcelasVencidas: number | null;
      maiorDiasAtraso: number; valorTotalAberto: Decimal; valorContrato: Decimal | null;
    };
    type ParcelaRow = {
      id: string; contratoId: string; numero: number; dataVencimento: Date;
      diasAtraso: number; origem: string | null; meioPagamento: string | null;
      valorParcela: Decimal; valorTotalAberto: Decimal;
    };
    type UpdateOp = { clienteId: string; cliData: any; contratoId: string; ctData: any };

    const newClientes:  ClienteRow[]  = [];
    const newContratos: ContratoRow[] = [];
    const updateOps:    UpdateOp[]    = [];
    const allParcelas:  ParcelaRow[]  = [];
    let erros = 0;
    const detalhesErros: { contrato: string; motivo: string }[] = [];
    let filtradosVazios = 0;

    for (const [num, rows] of grupos) {
      try {
        const row0 = rows[0];
        const nome = String(row0[colunas.nome] ?? "").trim();
        if (!nome) { erros++; detalhesErros.push({ contrato: num, motivo: "Nome do cliente vazio" }); continue; }

        const empresaId = resolverEmpresaId(num);
        if (!empresaId) { erros++; detalhesErros.push({ contrato: num, motivo: "Não foi possível identificar a empresa pelo número do contrato" }); continue; }

        const telefones = normalizarTelefones(String(row0[colunas.telefones] ?? "").trim());
        const emails    = String(row0[colunas.emails] ?? "").trim() || null;
        const statusContrato       = String(row0[colunas.statusContrato] ?? "").trim() || null;
        const totalParcelasVencidas = parseInt(String(row0[colunas.totalParcelasVencidas] ?? "")) || null;
        const valorContrato        = parseDecimal(row0[colunas.valorContrato]);

        // Regras 2, 4, 5 e 6 (nível de parcela): origem, tags, meio de
        // pagamento e número do documento.
        const rowsFiltradas = rows.filter((row) => {
          const origemRaw = String(row[colunas.origem] ?? "").trim();
          if (!ORIGENS_PERMITIDAS.has(normalizar(origemRaw))) return false;

          if (colunaTags !== null) {
            const tagsRaw = String(row[colunaTags] ?? "").trim();
            if (temTagProibida(tagsRaw)) return false;
          }

          const meioPagRaw = String(row[colunas.meioPagamento] ?? "").trim();
          const categoria = categoriaMeioPagamento(meioPagRaw);
          if (!categoria) return false;

          if (categoria !== "BOLETO" && colunaNumeroDocumento !== null) {
            const numDoc = String(row[colunaNumeroDocumento] ?? "").trim();
            if (numDoc) return false;
          }

          return true;
        });

        if (rowsFiltradas.length === 0) { filtradosVazios++; continue; }

        let maiorDiasAtraso  = 0;
        let valorTotalAberto = 0;
        const parcelasTemp: Omit<ParcelaRow, "contratoId">[] = [];

        rowsFiltradas.forEach((row, idx) => {
          const dias  = parseInt(String(row[colunas.diasAtraso] ?? "0")) || 0;
          const valor = parseDecimal(row[colunas.valorAReceber]);
          if (dias > maiorDiasAtraso) maiorDiasAtraso = dias;
          valorTotalAberto += valor;
          parcelasTemp.push({
            id:             randomUUID(),
            numero:         idx + 1,
            dataVencimento: parseDateExcel(row[colunas.dataVencimento]) ?? new Date(),
            diasAtraso:     dias,
            origem:         String(row[colunas.origem] ?? "").trim() || null,
            meioPagamento:  String(row[colunas.meioPagamento] ?? "").trim() || null,
            valorParcela:   new Decimal(valor.toFixed(2)),
            valorTotalAberto: new Decimal(valor.toFixed(2)),
          });
        });

        const existing = existingMap.get(num);

        if (existing) {
          // ── Contrato já existe: atualiza ─────────────────────────────────
          updateOps.push({
            clienteId: existing.clienteId,
            cliData:   { nome, ...(telefones && { telefones }), ...(emails && { emails }) },
            contratoId: existing.id,
            ctData: {
              statusContrato, totalParcelasVencidas, maiorDiasAtraso, empresaId,
              valorTotalAberto: new Decimal(valorTotalAberto.toFixed(2)),
              ...(valorContrato && { valorContrato: new Decimal(valorContrato.toFixed(2)) }),
            },
          });
          allParcelas.push(...parcelasTemp.map((p) => ({ ...p, contratoId: existing.id })));
        } else {
          // ── Novo contrato ────────────────────────────────────────────────
          const clienteId  = randomUUID();
          const contratoId = randomUUID();
          newClientes.push({ id: clienteId, nome, telefones, emails });
          newContratos.push({
            id: contratoId, numero: num, clienteId, empresaId,
            statusContrato, totalParcelasVencidas, maiorDiasAtraso,
            valorTotalAberto: new Decimal(valorTotalAberto.toFixed(2)),
            valorContrato:    valorContrato ? new Decimal(valorContrato.toFixed(2)) : null,
          });
          allParcelas.push(...parcelasTemp.map((p) => ({ ...p, contratoId })));
        }
      } catch (e) {
        console.error(`Erro no contrato ${num}:`, e);
        erros++;
        detalhesErros.push({ contrato: num, motivo: e instanceof Error ? e.message : "Erro desconhecido ao processar a linha" });
      }
    }

    // ── 5. Insere novos clientes + contratos (createMany) ────────────────────
    for (const ck of chunks(newClientes, 3000)) {
      await prisma.cliente.createMany({ data: ck, skipDuplicates: true });
    }
    for (const ck of chunks(newContratos, 3000)) {
      await prisma.contrato.createMany({ data: ck, skipDuplicates: true });
    }

    // ── 6. Atualiza existentes — bulk SQL UPDATE (1 query por 3000 linhas) ─────
    for (const chunk of chunks(updateOps, 3000)) {
      // Clientes
      const cliRows = Prisma.join(
        chunk.map((op) =>
          Prisma.sql`(${op.clienteId}::text, ${op.cliData.nome}::text, ${op.cliData.telefones ?? null}::text, ${op.cliData.emails ?? null}::text)`
        )
      );
      await prisma.$executeRaw`
        UPDATE "clientes" AS c
        SET nome      = v.nome,
            telefones = COALESCE(v.telefones, c.telefones),
            emails    = COALESCE(v.emails,    c.emails)
        FROM (VALUES ${cliRows}) AS v(id, nome, telefones, emails)
        WHERE c.id = v.id
      `;

      // Contratos
      const ctRows = Prisma.join(
        chunk.map((op) =>
          Prisma.sql`(${op.contratoId}::text,
                      ${op.ctData.statusContrato ?? null}::text,
                      ${op.ctData.totalParcelasVencidas ?? null}::int,
                      ${op.ctData.maiorDiasAtraso}::int,
                      ${op.ctData.valorTotalAberto}::numeric,
                      ${op.ctData.empresaId}::text,
                      ${op.ctData.valorContrato ?? null}::numeric)`
        )
      );
      await prisma.$executeRaw`
        UPDATE "contratos" AS c
        SET "statusContrato"        = v.sc,
            "totalParcelasVencidas" = v.tpv,
            "maiorDiasAtraso"       = v.mda,
            "valorTotalAberto"      = v.vta,
            "empresaId"             = v.eid,
            "valorContrato"         = COALESCE(v.vc, c."valorContrato")
        FROM (VALUES ${ctRows}) AS v(id, sc, tpv, mda, vta, eid, vc)
        WHERE c.id = v.id
      `;
    }

    // ── 7. Substitui parcelas (deleteMany + createMany) ──────────────────────
    const allContratoIds = [
      ...existingContratos.map((c) => c.id),
      ...newContratos.map((c) => c.id),
    ];
    await prisma.parcela.deleteMany({ where: { contratoId: { in: allContratoIds } } });
    for (const ck of chunks(allParcelas, 3000)) {
      await prisma.parcela.createMany({ data: ck });
    }

    // ── 8. Atualiza registro de importação ───────────────────────────────────
    if (filtradosVazios > 0) {
      console.log(`Importação: ${filtradosVazios} contrato(s) sem nenhuma parcela válida após as regras de filtro (origem/tags/meio de pagamento/documento).`);
    }
    const processados = grupos.size - erros - filtradosVazios;
    const detalhesErrosFinal = [...detalhesErrosGrupoGigante, ...detalhesErros];
    await prisma.importacao.update({
      where: { id: importacao.id },
      data: {
        totalLinhas:    linhas.length,
        totalContratos: processados,
        processadas:    processados,
        erros:      erros + errosPorGrupoGigante,
        detalhesErros: detalhesErrosFinal.length > 0 ? detalhesErrosFinal : undefined,
        status:     "CONCLUIDO",
        concluidoEm: new Date(),
      },
    });

    // ── 9. Distribui apenas contratos SEM carteira (tipo já resolvido no topo) ─
    const todosContratoIds = [
      ...newContratos.map((c) => c.id),
      ...updateOps.map((o) => o.contratoId),
    ];

    // Filtra apenas os que ainda não têm carteira nesta competência
    const jaDistribuidos = await prisma.carteiraParcela.findMany({
      where: { competenciaId, contratoId: { in: todosContratoIds } },
      select: { contratoId: true },
    });
    const jaDistribuidosSet = new Set(jaDistribuidos.map((c) => c.contratoId));
    const semCarteira = todosContratoIds.filter((id) => !jaDistribuidosSet.has(id));

    // Carrega férias desta competência para ajustar distribuição proporcional
    const feriasCompetencia = await prisma.feriasConsultor.findMany({
      where: { competenciaId },
    });
    const fatoresFerias = new Map<string, number>();
    for (const f of feriasCompetencia) {
      fatoresFerias.set(f.consultorId, fatorFerias(competencia.mes, competencia.ano, f.dataInicio, f.dataFim));
    }

    if (semCarteira.length > 0) {
      // Monta mapas contratoId → nome do consultor e → faixa lidos da planilha
      const nomeConsultorPorContrato = new Map<string, string>();
      const faixaPorContrato = new Map<string, string>();
      if (colunaConsultor !== null || colunaFaixa !== null) {
        // Reconstrói mapa de número → ids dos contratos processados
        const numParaId = new Map<string, string>();
        for (const c of newContratos)  numParaId.set(c.numero, c.id);
        for (const o of updateOps)    numParaId.set(o.contratoId, o.contratoId); // já é id

        // Para updateOps precisamos do número — usa existingMap invertido
        const idParaNum = new Map<string, string>();
        for (const [num, ec] of existingMap) idParaNum.set(ec.id, num);

        for (const [num, rows] of grupos) {
          const row0 = rows[0];
          const cId = numParaId.get(num) ?? (existingMap.get(num)?.id ?? null);
          if (!cId) continue;

          if (colunaConsultor !== null) {
            const nomeConsultor = String(row0[colunaConsultor] ?? "").trim();
            // Ignora #N/D e vazio
            if (nomeConsultor && nomeConsultor !== "#N/D") {
              nomeConsultorPorContrato.set(cId, nomeConsultor);
            }
          }

          if (colunaFaixa !== null) {
            const faixaTexto = String(row0[colunaFaixa] ?? "").trim();
            if (faixaTexto) faixaPorContrato.set(cId, faixaTexto);
          }
        }
      }

      await distribuirCarteiraAutomatica(
        competenciaId,
        semCarteira,
        isFlash,
        nomeConsultorPorContrato,
        faixaPorContrato,
        fatoresFerias
      );
    }

    await prisma.auditoria.create({
      data: {
        usuarioId: session.user.id,
        tabela:    "importacoes",
        registroId: importacao.id,
        acao:   "IMPORT",
        motivo: `Importação: ${arquivo.name} — ${processados} contratos, ${erros} erros`,
      },
    });

    return NextResponse.json({
      processados,
      erros,
      importacaoId: importacao.id,
      tipoDetectado: isFlash ? "FLASH" : "BASE",
      colunasResolvidas: colunas,
    });
  } catch (err) {
    await prisma.importacao.update({
      where: { id: importacao.id },
      data: { status: "ERRO" },
    });
    console.error(err);
    const detalhe = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ erro: `Erro ao processar arquivo: ${detalhe}` }, { status: 500 });
  }
}

// ─── Distribuição (respeita coluna da planilha quando presente) ──────────────

async function distribuirCarteiraAutomatica(
  competenciaId: string,
  paraDistribuir: string[],
  isFlash = false,
  nomeConsultorPorContrato: Map<string, string> = new Map(),
  faixaPorContrato: Map<string, string> = new Map(),
  fatoresFerias: Map<string, number> = new Map()
) {
  if (!paraDistribuir.length) return;

  const contratos = await prisma.contrato.findMany({
    where: { id: { in: paraDistribuir }, ativo: true },
    select: { id: true, clienteId: true, maiorDiasAtraso: true, valorTotalAberto: true },
  });

  // Carrega TODAS as equipes de uma vez (evita N queries dentro do loop) --
  // usada nas duas passagens, pra sempre gravar junto a equipe do consultor
  // NO MOMENTO da distribuição (CarteiraParcela.tipoEquipe). Sem isso, se o
  // consultor trocar de equipe depois, relatórios de mês fechado mudavam
  // retroativamente (calculavam em cima da equipe atual, não da equipe de
  // quando o dinheiro entrou).
  const todasEquipes = await prisma.equipe.findMany({
    where: { ativa: true },
    include: {
      usuarios: {
        where: { ativo: true, perfil: "CONSULTOR", emFerias: false },
        select: { id: true },
      },
    },
  });
  const equipeMap = new Map(todasEquipes.map((e) => [e.tipo, e]));

  // Carrega todos os consultores ativos para match por nome, com a equipe atual
  const todosConsultores = await prisma.usuario.findMany({
    where: { ativo: true, perfil: "CONSULTOR" },
    select: { id: true, nome: true, equipeId: true },
  });
  const equipeTipoPorId = new Map(todasEquipes.map((e) => [e.id, e.tipo]));
  const consultorPorNomeNorm = new Map(
    todosConsultores.map((u) => [normalizar(u.nome), { id: u.id, tipoEquipe: u.equipeId ? equipeTipoPorId.get(u.equipeId) ?? null : null }])
  );

  const novasAtribuicoes: { id: string; contratoId: string; consultorId: string; competenciaId: string; tipoEquipe: TipoEquipe | null }[] = [];
  const semConsultorDefinido: typeof contratos = [];

  // 1ª passagem: atribuições diretas da planilha
  for (const c of contratos) {
    const nomeRaw = nomeConsultorPorContrato.get(c.id);
    if (nomeRaw) {
      const consultor = consultorPorNomeNorm.get(normalizar(nomeRaw));
      if (consultor) {
        novasAtribuicoes.push({ id: randomUUID(), contratoId: c.id, consultorId: consultor.id, competenciaId, tipoEquipe: consultor.tipoEquipe });
        continue;
      }
    }
    semConsultorDefinido.push(c);
  }

  // 2ª passagem: distribui automaticamente os que ficaram sem atribuição
  if (semConsultorDefinido.length > 0) {

    const porEquipe = new Map<TipoEquipe, typeof contratos>();
    for (const c of semConsultorDefinido) {
      let tipo: TipoEquipe;
      if (isFlash) {
        tipo = "FLASH";
      } else {
        const faixaTexto = faixaPorContrato.get(c.id);
        tipo = (faixaTexto ? faixaParaTipoEquipe(faixaTexto) : null)
          ?? obterEquipePorDiasAtraso(c.maiorDiasAtraso ?? 0);
      }
      if (!porEquipe.has(tipo)) porEquipe.set(tipo, []);
      porEquipe.get(tipo)!.push(c);
    }

    for (const [tipo, lista] of porEquipe) {
      const equipe = equipeMap.get(tipo);
      if (!equipe || !equipe.usuarios.length) continue;

      const atribuicoes = distribuirCarteira(
        lista.map((c) => ({
          contratoId:       c.id,
          clienteId:        c.clienteId,
          valorTotalAberto: Number(c.valorTotalAberto ?? 0),
        })),
        equipe.usuarios.map((u) => u.id),
        fatoresFerias
      );

      for (const at of atribuicoes) {
        for (const contratoId of at.contratoIds) {
          novasAtribuicoes.push({ id: randomUUID(), contratoId, consultorId: at.consultorId, competenciaId, tipoEquipe: tipo });
        }
      }
    }
  }

  // Apenas INSERT — nunca deleta carteiras existentes
  for (const ck of chunks(novasAtribuicoes, 3000)) {
    await prisma.carteiraParcela.createMany({ data: ck, skipDuplicates: true });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDateExcel(val: any): Date | null {
  if (!val) return null;
  const serial = Number(val);
  if (!isNaN(serial) && serial > 40000) {
    return new Date((serial - 25569) * 86400 * 1000);
  }
  const str = String(val).trim();
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return new Date(`${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`);
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function parseDecimal(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  const str = String(val).replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function normalizarTelefones(raw: string): string | null {
  if (!raw) return null;
  const partes = raw.split(/[,;|\/]/).map((s) => s.trim()).filter(Boolean);
  const norm = partes
    .map((tel) => {
      const digits = tel.replace(/\D/g, "");
      if (!digits) return null;
      const sem0 = digits.startsWith("0") ? digits.slice(1) : digits;
      if (sem0.length === 10 || sem0.length === 11) return `55${sem0}`;
      if (sem0.length >= 12) return sem0;
      return null;
    })
    .filter(Boolean);
  if (!norm.length) return null;
  return [...new Set(norm)].join(",");
}
