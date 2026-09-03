/**
 * Importa dados FP/PON do JSON gerado pelo fapass-extrair.py para o banco.
 * Uso: node scripts/fapass-importar.mjs
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function obterEquipe(dias) {
  if (dias <= 0)  return "FLASH";
  if (dias <= 30) return "CRA_1_30";
  if (dias <= 90) return "CR_31_90";
  return "CR_PDD_91_180";
}
function isInadimplencia(tipo) {
  const t = String(tipo ?? "").trim();
  if (/^cart[aã]o/i.test(t)) return false;
  return /boleto/i.test(t) || /\brec\b|\brec\./i.test(t);
}
function isBaixaNormal(tipo) { return /boleto|pix|dinheiro|dep[oó]sito|transfer[eê]ncia|ted/i.test(String(tipo ?? "")); }
function isBaixaCartao(tipo) { return /^cart[aã]o/i.test(String(tipo ?? "").trim()); }
function calcDiasAtraso(venc, hoje) { return Math.max(0, Math.floor((hoje - new Date(venc)) / 86400000)); }

async function main() {
  const dadosPath = "scripts/fapass-dados.json";
  const linhasFP = JSON.parse(readFileSync(dadosPath, "utf-8"));
  console.log(`\nRegistros carregados: ${linhasFP.length}`);

  // Suporte a FAPASS_COMPETENCIA_ID passado pelo GitHub Actions
  const competenciaIdEnv = process.env.FAPASS_COMPETENCIA_ID;
  const syncIdEnv        = process.env.FAPASS_SYNC_ID;

  const competencia = competenciaIdEnv
    ? await prisma.competencia.findUnique({ where: { id: competenciaIdEnv } })
    : await prisma.competencia.findFirst({ where: { fechada: false }, orderBy: [{ ano: "desc" }, { mes: "desc" }] });

  if (!competencia) { console.error("Nenhuma competência ativa."); process.exit(1); }
  console.log(`Competência: ${competencia.descricao}`);

  const empresaFaPass = await prisma.empresa.findFirst({ where: { prefixos: { has: "FP" } } });
  if (!empresaFaPass) { console.error("Empresa Fã Pass não encontrada."); process.exit(1); }

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const ontem = new Date(hoje.getTime() - 86400000);
  const iniComp = new Date(Date.UTC(competencia.ano, competencia.mes - 1, 1, 3, 0, 0, 0));
  const fimComp = new Date(Date.UTC(competencia.ano, competencia.mes, 1, 2, 59, 59, 999));

  // Se Actions passou um syncId existente, reutiliza; senão cria novo
  const sync = syncIdEnv
    ? await prisma.faPassSync.update({ where: { id: syncIdEnv }, data: { status: "PROCESSANDO" } }).then(() => ({ id: syncIdEnv }))
    : await prisma.faPassSync.create({ data: { competenciaId: competencia.id, origem: "LOCAL", status: "PROCESSANDO" } });

  try {
    const snapExistente = await prisma.faPassInadimplencia.count({ where: { competenciaId: competencia.id } });
    const primeiraSync = snapExistente === 0;
    console.log(`Primeira sync: ${primeiraSync}`);

    const docsExistentes = new Set(
      (await prisma.faPassInadimplencia.findMany({ where: { competenciaId: competencia.id }, select: { contratoNumero: true } }))
        .map((r) => r.contratoNumero)
    );

    // ── Agrupa por contrato (inadimplência) ───────────────────────────────────
    const gruposInad = new Map();
    for (const row of linhasFP) {
      if (row.status !== "P") continue;
      if (!isInadimplencia(row.tipo)) continue;
      if (/cancelamento/i.test(row.tiposBaixa)) continue;
      if (!row.vencimento) continue;

      const venc = new Date(row.vencimento);
      const isFlashRow = venc >= iniComp && venc <= ontem;
      const isInadRow  = venc <= ontem;
      if (!isInadRow && !isFlashRow) continue;

      const doc = row.documento;
      if (!gruposInad.has(doc)) gruposInad.set(doc, { documento: doc, fornecedor: row.fornecedor, linhas: [] });
      gruposInad.get(doc).linhas.push(row);
    }
    console.log(`Contratos inadimplentes/flash: ${gruposInad.size}`);

    // ── Busca contratos existentes em lote ────────────────────────────────────
    const todosDocumentos = [...gruposInad.keys()];
    const contratosExistentes = await prisma.contrato.findMany({
      where: { numero: { in: todosDocumentos } },
      select: { id: true, numero: true, clienteId: true },
    });
    const contratoMap = new Map(contratosExistentes.map((c) => [c.numero, c]));

    // Primeiro passo: só cálculo em memória, sem ida ao banco -- pra depois
    // gravar tudo em lote (criar/atualizar um contrato por vez, sequencial,
    // é o que fazia uma competência com muitos contratos novos levar ~20min).
    const paraProcessar = [];
    for (const [doc, grupo] of gruposInad) {
      if (!primeiraSync && docsExistentes.has(doc)) continue;

      let vencMaisAntigo = null;
      let valorTotal = 0;
      let isFlash = true;

      for (const row of grupo.linhas) {
        const v = new Date(row.vencimento);
        valorTotal += row.valor;
        if (!vencMaisAntigo || v < vencMaisAntigo) vencMaisAntigo = v;
        if (v < iniComp) isFlash = false;
      }
      if (!vencMaisAntigo || valorTotal === 0) continue;

      const diasAtraso = calcDiasAtraso(vencMaisAntigo, hoje);
      paraProcessar.push({ doc, fornecedor: grupo.fornecedor, vencMaisAntigo, valorTotal, isFlash, diasAtraso, existente: contratoMap.get(doc) ?? null });
    }

    const paraCriar = paraProcessar.filter((p) => !p.existente);
    const paraAtualizar = paraProcessar.filter((p) => p.existente);

    // Cria em lote os clientes e contratos novos. skipDuplicates cobre a corrida
    // entre tentativas de importação concorrentes (ex: clique duplo) -- se outro
    // processo já criou o contrato entre a busca em lote e aqui, essa linha é só
    // ignorada, sem derrubar a importação inteira.
    const novosIds = new Map(paraCriar.map((p) => [p.doc, { clienteId: randomUUID(), contratoId: randomUUID() }]));
    if (paraCriar.length > 0) {
      const clientesNovos = paraCriar.map((p) => ({ id: novosIds.get(p.doc).clienteId, nome: p.fornecedor || p.doc }));
      for (const ck of chunks(clientesNovos, 1000)) await prisma.cliente.createMany({ data: ck, skipDuplicates: true });

      const contratosNovos = paraCriar.map((p) => ({
        id: novosIds.get(p.doc).contratoId, numero: p.doc, clienteId: novosIds.get(p.doc).clienteId,
        empresaId: empresaFaPass.id, maiorDiasAtraso: p.diasAtraso, valorTotalAberto: p.valorTotal,
      }));
      for (const ck of chunks(contratosNovos, 1000)) await prisma.contrato.createMany({ data: ck, skipDuplicates: true });

      // Re-busca pra pegar o id/clienteId CANÔNICO -- se algum foi ignorado pelo
      // skipDuplicates (corrida com outra importação), o id gerado aqui não é o
      // que ficou gravado.
      const canonicos = await prisma.contrato.findMany({
        where: { numero: { in: paraCriar.map((p) => p.doc) } },
        select: { id: true, numero: true, clienteId: true },
      });
      for (const c of canonicos) contratoMap.set(c.numero, c);
    }

    // Atualiza em lote os contratos já existentes (paralelo, com limite de
    // concorrência pra não estourar o pool de conexões do banco).
    const CONCORRENCIA = 15;
    for (let i = 0; i < paraAtualizar.length; i += CONCORRENCIA) {
      const lote = paraAtualizar.slice(i, i + CONCORRENCIA);
      await Promise.all(lote.map((p) =>
        prisma.contrato.update({ where: { id: p.existente.id }, data: { maiorDiasAtraso: p.diasAtraso, valorTotalAberto: p.valorTotal } })
      ));
      process.stdout.write(`\r  Contratos atualizados: ${Math.min(i + CONCORRENCIA, paraAtualizar.length)}/${paraAtualizar.length}`);
    }
    if (paraAtualizar.length > 0) console.log("");
    console.log(`  Criados: ${paraCriar.length} | Atualizados: ${paraAtualizar.length}`);

    const novosSnap = [];
    const novosParaDistribuir = [];
    for (const p of paraProcessar) {
      const resolvido = p.existente ?? contratoMap.get(p.doc);
      if (!resolvido) continue; // não deveria acontecer, mas evita quebrar a importação por 1 linha
      novosSnap.push({ id: randomUUID(), competenciaId: competencia.id, contratoNumero: p.doc, valor: p.valorTotal, vencimentoMaisAntigo: p.vencMaisAntigo, faixa: p.isFlash ? "FLASH" : obterEquipe(p.diasAtraso), isFlash: p.isFlash, syncId: sync.id });
      novosParaDistribuir.push({ contratoId: resolvido.id, clienteId: resolvido.clienteId, valorTotalAberto: p.valorTotal, maiorDiasAtraso: p.diasAtraso, isFlash: p.isFlash });
    }

    if (novosSnap.length > 0) {
      for (const ck of chunks(novosSnap, 1000)) await prisma.faPassInadimplencia.createMany({ data: ck, skipDuplicates: true });
      console.log(`  Snapshots gravados: ${novosSnap.length}`);
    }

    // ── Distribui carteiras ───────────────────────────────────────────────────
    if (novosParaDistribuir.length > 0) {
      const jaDistribuidos = new Set(
        (await prisma.carteiraParcela.findMany({ where: { competenciaId: competencia.id, contratoId: { in: novosParaDistribuir.map((c) => c.contratoId) } }, select: { contratoId: true } }))
          .map((c) => c.contratoId)
      );
      const semCarteira = novosParaDistribuir.filter((c) => !jaDistribuidos.has(c.contratoId));

      if (semCarteira.length > 0) {
        const todasEquipes = await prisma.equipe.findMany({
          where: { ativa: true },
          include: { usuarios: { where: { ativo: true, perfil: "CONSULTOR", emFerias: false }, select: { id: true } } },
        });
        const equipeMap = new Map(todasEquipes.map((e) => [e.tipo, e]));
        const porEquipe = new Map();
        for (const c of semCarteira) {
          const tipo = c.isFlash ? "FLASH" : obterEquipe(c.maiorDiasAtraso);
          if (!porEquipe.has(tipo)) porEquipe.set(tipo, []);
          porEquipe.get(tipo).push(c);
        }
        const novasAtribuicoes = [];
        for (const [tipo, lista] of porEquipe) {
          const equipe = equipeMap.get(tipo);
          if (!equipe?.usuarios.length) { console.log(`  Sem consultores para equipe ${tipo}, pulando ${lista.length} contratos`); continue; }
          const consultores = equipe.usuarios.map((u) => u.id);
          let idx = 0;
          for (let i = 0; i < lista.length; i++) {
            novasAtribuicoes.push({ id: randomUUID(), contratoId: lista[i].contratoId, consultorId: consultores[idx % consultores.length], competenciaId: competencia.id });
            idx++;
          }
        }
        for (const ck of chunks(novasAtribuicoes, 1000)) await prisma.carteiraParcela.createMany({ data: ck, skipDuplicates: true });
        console.log(`  Carteiras distribuídas: ${novasAtribuicoes.length}`);
      }
    }

    // ── Processa baixas ───────────────────────────────────────────────────────
    await prisma.faPassBaixa.deleteMany({ where: { competenciaId: competencia.id } });
    const baixas = [];
    const baixasPorContrato = new Map();
    for (const row of linhasFP) {
      const dataBaixa = row.dataBaixa ? new Date(row.dataBaixa) : null;
      let tipoPagamento = null;
      if (row.status === "B" && isBaixaNormal(row.tipo) && dataBaixa && dataBaixa >= iniComp && dataBaixa <= fimComp) tipoPagamento = "BOLETO_PIX";
      if (isBaixaCartao(row.tipo) && dataBaixa && dataBaixa >= iniComp && dataBaixa <= fimComp) tipoPagamento = "CARTAO";
      if (!tipoPagamento || row.valor === 0) continue;
      baixas.push({ id: randomUUID(), competenciaId: competencia.id, contratoNumero: row.documento, valor: row.valor, tipoPagamento, dataBaixa, syncId: sync.id });
      baixasPorContrato.set(row.documento, (baixasPorContrato.get(row.documento) ?? 0) + row.valor);
    }
    for (const ck of chunks(baixas, 1000)) await prisma.faPassBaixa.createMany({ data: ck });
    console.log(`  Baixas: ${baixas.length}`);

    // ── Finaliza ──────────────────────────────────────────────────────────────
    await prisma.faPassSync.update({
      where: { id: sync.id },
      data: { primeiraSync, totalRegistros: linhasFP.length, totalContratos: gruposInad.size, totalFlash: novosSnap.filter((s) => s.isFlash).length, totalBaixas: baixas.length, totalDivergencias: 0, status: "CONCLUIDO", concluidoEm: new Date() },
    });

    console.log("\n✅ Concluído!");
    console.log(`   FP/PON lidos       : ${linhasFP.length}`);
    console.log(`   Inadimplentes novos: ${novosSnap.filter((s) => !s.isFlash).length}`);
    console.log(`   Flash novos        : ${novosSnap.filter((s) => s.isFlash).length}`);
    console.log(`   Baixas             : ${baixas.length}`);
  } catch (err) {
    console.error("\n❌ Erro:", err.message);
    await prisma.faPassSync.update({ where: { id: sync.id }, data: { status: "ERRO", erro: err.message } });
    process.exit(1);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
