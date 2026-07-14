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
import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";

// ─── Índices de coluna fixos (0-based) ──────────────────────────────────────
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

// Normaliza string para comparação flexível (remove acentos, lower, trim)
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
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

// Mapeia texto da faixa da planilha para TipoEquipe
function faixaParaTipoEquipe(faixa: string): string | null {
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
    const headerRow = todasLinhas[0] ?? [];
    const colunaConsultor = detectarColunaConsultor(headerRow);
    const colunaFaixa = detectarColunaFaixa(headerRow);
    const linhas = todasLinhas.slice(1).filter((row) => String(row[C.contrato] ?? "").trim() !== "");

    // ── 2. Agrupa por contrato ───────────────────────────────────────────────
    const grupos = new Map<string, any[][]>();
    for (const row of linhas) {
      const num = String(row[C.contrato] ?? "").trim();
      if (!num) continue;
      if (!grupos.has(num)) grupos.set(num, []);
      grupos.get(num)!.push(row);
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

    for (const [num, rows] of grupos) {
      try {
        const row0 = rows[0];
        const nome = String(row0[C.nome] ?? "").trim();
        if (!nome) { erros++; continue; }

        const empresaId = resolverEmpresaId(num);
        if (!empresaId) { erros++; continue; }

        const telefones = normalizarTelefones(String(row0[C.telefones] ?? "").trim());
        const emails    = String(row0[C.emails] ?? "").trim() || null;
        const statusContrato       = String(row0[C.statusContrato] ?? "").trim() || null;
        const totalParcelasVencidas = parseInt(String(row0[C.totalParcelasVencidas] ?? "")) || null;
        const valorContrato        = parseDecimal(row0[C.valorContrato]);

        let maiorDiasAtraso  = 0;
        let valorTotalAberto = 0;
        const parcelasTemp: Omit<ParcelaRow, "contratoId">[] = [];

        rows.forEach((row, idx) => {
          const dias  = parseInt(String(row[C.diasAtraso] ?? "0")) || 0;
          const valor = parseDecimal(row[C.valorAReceber]);
          if (dias > maiorDiasAtraso) maiorDiasAtraso = dias;
          valorTotalAberto += valor;
          parcelasTemp.push({
            id:             randomUUID(),
            numero:         idx + 1,
            dataVencimento: parseDateExcel(row[C.dataVencimento]) ?? new Date(),
            diasAtraso:     dias,
            origem:         String(row[C.origem] ?? "").trim() || null,
            meioPagamento:  String(row[C.meioPagamento] ?? "").trim() || null,
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
          Prisma.sql`(${op.clienteId}::uuid, ${op.cliData.nome}::text, ${op.cliData.telefones ?? null}::text, ${op.cliData.emails ?? null}::text)`
        )
      );
      await prisma.$executeRaw`
        UPDATE "Cliente" AS c
        SET nome      = v.nome,
            telefones = COALESCE(v.telefones, c.telefones),
            emails    = COALESCE(v.emails,    c.emails)
        FROM (VALUES ${cliRows}) AS v(id, nome, telefones, emails)
        WHERE c.id = v.id
      `;

      // Contratos
      const ctRows = Prisma.join(
        chunk.map((op) =>
          Prisma.sql`(${op.contratoId}::uuid,
                      ${op.ctData.statusContrato ?? null}::text,
                      ${op.ctData.totalParcelasVencidas ?? null}::int,
                      ${op.ctData.maiorDiasAtraso}::int,
                      ${op.ctData.valorTotalAberto}::numeric,
                      ${op.ctData.empresaId}::text,
                      ${op.ctData.valorContrato ?? null}::numeric)`
        )
      );
      await prisma.$executeRaw`
        UPDATE "Contrato" AS c
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
    const processados = grupos.size - erros;
    await prisma.importacao.update({
      where: { id: importacao.id },
      data: {
        totalLinhas:    linhas.length,
        totalContratos: processados,
        processadas:    processados,
        erros,
        status:     "CONCLUIDO",
        concluidoEm: new Date(),
      },
    });

    // ── 9. Determina tipo e distribui apenas contratos SEM carteira ─────────
    const tipoBase = formData.get("tipoBase") as string | null;
    const isFlash = tipoBase === "FLASH";

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
    });
  } catch (err) {
    await prisma.importacao.update({
      where: { id: importacao.id },
      data: { status: "ERRO" },
    });
    console.error(err);
    return NextResponse.json({ erro: "Erro ao processar arquivo" }, { status: 500 });
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

  // Carrega todos os consultores ativos para match por nome
  const todosConsultores = await prisma.usuario.findMany({
    where: { ativo: true, perfil: "CONSULTOR" },
    select: { id: true, nome: true },
  });
  const consultorPorNomeNorm = new Map(
    todosConsultores.map((u) => [normalizar(u.nome), u.id])
  );

  const novasAtribuicoes: { id: string; contratoId: string; consultorId: string; competenciaId: string }[] = [];
  const semConsultorDefinido: typeof contratos = [];

  // 1ª passagem: atribuições diretas da planilha
  for (const c of contratos) {
    const nomeRaw = nomeConsultorPorContrato.get(c.id);
    if (nomeRaw) {
      const consultorId = consultorPorNomeNorm.get(normalizar(nomeRaw));
      if (consultorId) {
        novasAtribuicoes.push({ id: randomUUID(), contratoId: c.id, consultorId, competenciaId });
        continue;
      }
    }
    semConsultorDefinido.push(c);
  }

  // 2ª passagem: distribui automaticamente os que ficaram sem atribuição
  if (semConsultorDefinido.length > 0) {
    // Carrega TODAS as equipes de uma vez (evita N queries dentro do loop)
    const todasEquipes = await prisma.equipe.findMany({
      where: { ativa: true },
      include: {
        usuarios: {
          where: { ativo: true, perfil: "CONSULTOR", emFerias: false },
          select: { id: true },
        },
      },
    });
    const equipeMap = new Map(todasEquipes.map((e) => [e.tipo as string, e]));

    const porEquipe = new Map<string, typeof contratos>();
    for (const c of semConsultorDefinido) {
      let tipo: string;
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
          novasAtribuicoes.push({ id: randomUUID(), contratoId, consultorId: at.consultorId, competenciaId });
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
