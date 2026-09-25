import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormaPagamento } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { parsearValorMonetario, parseDataLocalBrasil, erroSeDataFutura } from "@/lib/utils";
import { getEquipesGerenciadas } from "@/lib/frentes";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const isGestorAdmin = ["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil);

  const body = await req.json();
  const { id, valor, valorAParte, formaPagamento, dataRecebimento } = body;
  if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

  const recAtual = await prisma.recebimento.findUnique({
    where: { id },
    include: {
      consultor: { select: { equipeId: true } },
      contrato: {
        select: {
          id: true,
          valorTotalAberto: true,
          recebimentos: { select: { id: true, valor: true } },
        },
      },
    },
  });
  if (!recAtual) return NextResponse.json({ erro: "Recebimento não encontrado" }, { status: 404 });

  const isDono = recAtual.consultorId === session.user.id;
  if (!isGestorAdmin) {
    if (!isDono) {
      return NextResponse.json({ erro: "Sem permissão para editar este recebimento" }, { status: 403 });
    }
    if (valor === undefined && formaPagamento === undefined && dataRecebimento === undefined) {
      return NextResponse.json({ erro: "Informe ao menos um campo para corrigir" }, { status: 400 });
    }

    // Recebimento "Parcela Mês" puro (valor sempre 0 na criação, dinheiro
    // inteiro em valorAParte) não pode ganhar um valor de inadimplência
    // recuperado por edição do consultor -- foi exatamente isso que dobrou o
    // Total Recebido da Estela Reginato (contrato T-My Explorer-000064,
    // 25/09/2026): consultora foi corrigir a data e preencheu também o campo
    // de valor, que devia ter ficado 0.
    if (valor !== undefined && Number(recAtual.valor) === 0 && Number(recAtual.valorAParte ?? 0) > 0) {
      return NextResponse.json(
        { erro: "Este recebimento é só Parcela Mês -- não é possível adicionar valor de inadimplência recuperado aqui." },
        { status: 400 }
      );
    }

    // Consultor não edita recebimento de competência já fechada -- o ciclo
    // fechado pelo gestor é pra travar lançamento/edição, mas essa tela
    // nunca tinha essa checagem (achado real, 2026-09-25: Luis confirmou que
    // a intenção sempre existiu, só nunca foi implementada aqui).
    const competenciaDoRecebimento = await prisma.competencia.findFirst({
      where: {
        mes: recAtual.dataRecebimento.getUTCMonth() + 1,
        ano: recAtual.dataRecebimento.getUTCFullYear(),
      },
      select: { fechada: true },
    });
    if (competenciaDoRecebimento?.fechada) {
      return NextResponse.json(
        { erro: "Competência já fechada -- só gestor/admin pode editar este recebimento." },
        { status: 403 }
      );
    }
  }

  // GESTOR só edita recebimento de consultor de uma frente que ele
  // gerencia -- o DELETE já tinha essa checagem, o PATCH tinha ficado de
  // fora (achado real da revisão de segurança, 2026-09-16).
  if (session.user.perfil === "GESTOR") {
    const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
    if (!recAtual.consultor.equipeId || !equipesGerenciadas.includes(recAtual.consultor.equipeId)) {
      return NextResponse.json({ erro: "Sem permissão para editar este recebimento" }, { status: 403 });
    }
  }

  const data: any = {};
  if (valor !== undefined) {
    data.valor = new Decimal(parsearValorMonetario(valor));
  }
  // Meio e data de pagamento: dono do recebimento ou gestor/admin editam --
  // valorAParte (recebimento fora da inadimplência) continua só gestor/admin.
  if (isGestorAdmin || isDono) {
    if (formaPagamento) data.formaPagamento = formaPagamento as FormaPagamento;
    if (dataRecebimento) {
      const dataParsed = parseDataLocalBrasil(dataRecebimento);
      const erroData = erroSeDataFutura(dataParsed);
      if (erroData) return NextResponse.json({ erro: erroData }, { status: 400 });
      data.dataRecebimento = dataParsed;
    }
  }
  if (isGestorAdmin) {
    if (valorAParte !== undefined) {
      data.valorAParte = valorAParte != null && Number(valorAParte) > 0
        ? new Decimal(parsearValorMonetario(valorAParte))
        : null;
    }
  }

  const rec = await prisma.recebimento.update({ where: { id }, data });

  // Auditoria da edição -- registra de fato o campo mudado (antes só
  // gravava valor, mesmo quando quem mudava era forma/data/valorAParte).
  const camposAuditoria: string[] = [];
  const antesAuditoria: string[] = [];
  const depoisAuditoria: string[] = [];
  if (data.valor !== undefined) {
    camposAuditoria.push("valor");
    antesAuditoria.push(String(recAtual.valor ?? ""));
    depoisAuditoria.push(String(data.valor));
  }
  if (data.formaPagamento !== undefined) {
    camposAuditoria.push("formaPagamento");
    antesAuditoria.push(String(recAtual.formaPagamento ?? ""));
    depoisAuditoria.push(String(data.formaPagamento));
  }
  if (data.dataRecebimento !== undefined) {
    camposAuditoria.push("dataRecebimento");
    antesAuditoria.push(recAtual.dataRecebimento.toISOString());
    depoisAuditoria.push(data.dataRecebimento.toISOString());
  }
  if (data.valorAParte !== undefined) {
    camposAuditoria.push("valorAParte");
    antesAuditoria.push(String(recAtual.valorAParte ?? ""));
    depoisAuditoria.push(String(data.valorAParte ?? ""));
  }
  prisma.auditoria.create({
    data: {
      usuarioId: session.user.id,
      tabela: "recebimentos",
      registroId: id,
      campo: camposAuditoria.join(","),
      valorAnterior: antesAuditoria.join(" | "),
      valorNovo: depoisAuditoria.join(" | "),
      acao: "UPDATE",
    },
  }).catch(() => {});

  if (valor !== undefined) {
    const novoValor = parsearValorMonetario(valor);
    const contrato = recAtual.contrato;
    const totalRecebido = contrato.recebimentos.reduce((s, r) => {
      return s + (r.id === id ? novoValor : Number(r.valor));
    }, 0);
    const valorAberto = Number(contrato.valorTotalAberto ?? 0);
    const statusRecuperacao =
      totalRecebido >= valorAberto
        ? "RECUPERADO_INTEGRALMENTE"
        : totalRecebido > 0
        ? "RECUPERACAO_PARCIAL"
        : "INADIMPLENTE";
    await prisma.contrato.update({ where: { id: contrato.id }, data: { statusRecuperacao } });
  }

  return NextResponse.json(rec);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

  const rec = await prisma.recebimento.findUnique({
    where: { id },
    select: {
      contratoId: true,
      valor: true,
      consultorId: true,
      parcelasIds: true,
      consultor: { select: { equipeId: true } },
      contrato: {
        select: {
          valorTotalAberto: true,
          recebimentos: { select: { id: true, valor: true, parcelasIds: true } },
          parcelas: { select: { id: true, paga: true } },
        },
      },
    },
  });
  if (!rec) return NextResponse.json({ erro: "Não encontrado" }, { status: 404 });

  // GESTOR só apaga recebimento de consultor de uma frente que ele gerencia
  // -- sem isso, qualquer gestor apagava recebimento de qualquer frente
  // (achado real da auditoria de segurança, 2026-09-15).
  if (session.user.perfil === "GESTOR") {
    const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
    if (!rec.consultor.equipeId || !equipesGerenciadas.includes(rec.consultor.equipeId)) {
      return NextResponse.json({ erro: "Sem permissão para excluir este recebimento" }, { status: 403 });
    }
  }

  await prisma.recebimento.delete({ where: { id } });

  // Recalcula statusRecuperacao excluindo o recebimento removido
  const recebimentosRestantes = rec.contrato.recebimentos.filter((r) => r.id !== id);
  const totalRecebido = recebimentosRestantes.reduce((s, r) => s + Number(r.valor), 0);
  const valorAberto = Number(rec.contrato.valorTotalAberto ?? 0);
  const statusRecuperacao =
    totalRecebido >= valorAberto && valorAberto > 0
      ? "RECUPERADO_INTEGRALMENTE"
      : totalRecebido > 0
      ? "RECUPERACAO_PARCIAL"
      : "INADIMPLENTE";

  // Reverte pra não-paga só as parcelas que ESTE recebimento marcou -- e só as
  // que nenhum OUTRO recebimento restante ainda cobre. Antes revertia TODAS
  // as parcelas pagas do contrato (comentário dizia "sem FK não sabemos qual
  // foi marcada", mas o vínculo existe em Recebimento.parcelasIds) -- isso
  // desfazia pagamento de recebimentos que sobraram intactos (ex: duas
  // parcelas duplicadas, apaga uma, a outra cobria a mesma parcela e ficava
  // revertida à toa).
  const parcelasAindaCobertas = new Set(recebimentosRestantes.flatMap((r) => r.parcelasIds));
  const parcelasParaReverter = rec.parcelasIds.filter((pid) => !parcelasAindaCobertas.has(pid));
  if (parcelasParaReverter.length > 0) {
    await prisma.parcela.updateMany({
      where: { id: { in: parcelasParaReverter } },
      data: { paga: false },
    });
  }

  await prisma.contrato.update({
    where: { id: rec.contratoId },
    data: { statusRecuperacao },
  });

  // Registra auditoria no histórico de contatos
  const nomeUsuario = (session.user as any).name ?? (session.user as any).nome ?? "Usuário";
  await prisma.contato.create({
    data: {
      contratoId: rec.contratoId,
      consultorId: session.user.id,
      tipo: "LIGACAO",
      status: "OUTROS",
      observacao: `Recebimento de ${formatarMoeda(Number(rec.valor))} excluído por ${nomeUsuario}`,
    },
  });

  return NextResponse.json({ ok: true, statusRecuperacao });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  try {
    return await processarRecebimento(req, session);
  } catch (err) {
    console.error("[recebimentos] Erro inesperado:", err);
    return NextResponse.json({ erro: "Erro ao processar solicitação. Tente novamente." }, { status: 500 });
  }
}

async function processarRecebimento(req: NextRequest, session: any) {
  const body = await req.json();
  const { contratoId, valor, dataRecebimento, formaPagamento, observacao, parcelasIds, parcelasRemanejadas, valorAParte } = body;

  if (!contratoId || !valor || !dataRecebimento || !formaPagamento) {
    return NextResponse.json({ erro: "Campos obrigatórios: contratoId, valor, data, forma de pagamento" }, { status: 400 });
  }

  const dataRecebimentoParsed = parseDataLocalBrasil(dataRecebimento);
  const erroDataFutura = erroSeDataFutura(dataRecebimentoParsed);
  if (erroDataFutura) {
    return NextResponse.json({ erro: erroDataFutura }, { status: 400 });
  }

  // Pelo menos 1 parcela precisa ser marcada (recebida ou remanejada) --
  // sem isso, o valor entrava como recebido mas nenhuma Parcela virava
  // paga:true, então o contrato ficava preso em "Recuperação Parcial" (ou
  // até "Inadimplente") pra sempre, mesmo já tendo recebido mais que o
  // valor total em aberto. Achado real: RP001054, REI DAS BOMBAS TUDO PARA
  // POSTO LTDA, consultora registrou 2 recebimentos (R$860,56 + R$843,59,
  // cobrindo agosto e setembro) sem marcar nenhuma parcela -- contrato
  // continuava mostrando "Recuperação Parcial" com só R$838,48 em aberto.
  const totalParcelasMarcadas =
    (Array.isArray(parcelasIds) ? parcelasIds.length : 0) +
    (Array.isArray(parcelasRemanejadas) ? parcelasRemanejadas.length : 0);
  if (totalParcelasMarcadas === 0) {
    return NextResponse.json({
      erro: "Selecione ao menos uma parcela (recebida ou remanejada) para registrar o recebimento.",
    }, { status: 400 });
  }

  const contrato = await prisma.contrato.findUnique({
    where: { id: contratoId },
    select: { id: true, valorTotalAberto: true, recebimentos: { select: { valor: true } } },
  });
  if (!contrato) return NextResponse.json({ erro: "Contrato não encontrado" }, { status: 404 });

  // Consultor só pode registrar recebimento de contrato na PRÓPRIA carteira
  // -- sem isso, qualquer consultor autenticado conseguia marcar parcela de
  // outro consultor como paga e fechar promessas alheias só mandando o
  // contratoId de um contrato que não é seu (achado real da auditoria de
  // segurança, 2026-09-15). Mesma checagem já usada em
  // src/app/api/contratos/[id]/route.ts pro PATCH de situação.
  if (session.user.perfil === "CONSULTOR") {
    const naCarteira = await prisma.carteiraParcela.findFirst({
      where: { contratoId, consultorId: session.user.id, ativo: true },
    });
    if (!naCarteira) {
      return NextResponse.json({ erro: "Contrato não está na sua carteira" }, { status: 403 });
    }
  }

  const valorNumerico = parsearValorMonetario(valor);

  // Teto de multa/juros: o consultor só pode registrar um valor acima do
  // valor original da parcela em até 2% de multa (uma vez, se está
  // atrasada) + 1% de juros ao mês pro-rata (do vencimento até hoje) + uma
  // margem fixa de R$50 (o cálculo percentual sozinho travava por diferenças
  // de poucos centavos/reais entre sistemas, e nem o gestor conseguia dizer
  // com certeza qual devia ser o valor exato; R$50 dá folga real sem abrir
  // mão do teto -- decisão de 2026-09-16).
  // GESTOR/ADMINISTRADOR podem sobrescrever (ex: acordo renegociado).
  //
  // Dias usados no cálculo = dias corridos real + 1 (o sistema financeiro da
  // empresa sempre calcula um dia a mais que a contagem corrida simples --
  // ajustado aqui pra bater com ele) + 3 de brecha (folga proposital que a
  // empresa decidiu dar ao consultor, pra não travar por pequena diferença
  // de data entre sistemas).
  const DIAS_AJUSTE_SISTEMA_FINANCEIRO = 1;
  const DIAS_BRECHA_CONSULTOR = 3;
  const MARGEM_FIXA_REAIS = 50;
  if (session.user.perfil === "CONSULTOR" && Array.isArray(parcelasIds) && parcelasIds.length > 0) {
    const parcelasSelecionadas = await prisma.parcela.findMany({
      where: { id: { in: parcelasIds } },
      select: { valorParcela: true, dataVencimento: true },
    });
    const hoje = new Date();
    let valorMaximoTotal = 0;
    for (const p of parcelasSelecionadas) {
      const diasCorridos = Math.max(0, Math.floor((hoje.getTime() - new Date(p.dataVencimento).getTime()) / 86400000));
      const diasParaCalculo = diasCorridos > 0 ? diasCorridos + DIAS_AJUSTE_SISTEMA_FINANCEIRO + DIAS_BRECHA_CONSULTOR : 0;
      const multa = diasParaCalculo > 0 ? 0.02 : 0;
      const juros = 0.01 * (diasParaCalculo / 30);
      valorMaximoTotal += Number(p.valorParcela ?? 0) * (1 + multa + juros);
    }
    if (valorNumerico > valorMaximoTotal + MARGEM_FIXA_REAIS) {
      return NextResponse.json({
        erro: `Valor informado (${formatarMoeda(valorNumerico)}) excede o máximo permitido para as parcelas selecionadas: ${formatarMoeda(valorMaximoTotal + MARGEM_FIXA_REAIS)} (valor original + até 2% de multa + 1% de juros ao mês pro-rata + R$50 de margem).`,
      }, { status: 400 });
    }
  }

  const valorDecimal = new Decimal(valorNumerico);
  const valorAParteDecimal = valorAParte && Number(valorAParte) > 0
    ? new Decimal(parsearValorMonetario(valorAParte))
    : null;

  const recebimento = await prisma.recebimento.create({
    data: {
      contratoId,
      consultorId: session.user.id,
      valor: valorDecimal,
      valorAParte: valorAParteDecimal,
      dataRecebimento: dataRecebimentoParsed,
      formaPagamento: formaPagamento as FormaPagamento,
      justificativa: observacao || "Recebimento registrado pelo consultor",
      parcelasIds: Array.isArray(parcelasIds) ? parcelasIds : [],
      aprovado: true,
    },
  });

  const totalRecebidoAntes = contrato.recebimentos.reduce((s, r) => s + Number(r.valor), 0);
  const totalRecebido = totalRecebidoAntes + Number(valorDecimal);

  // Marca parcelas ANTES de calcular status para refletir estado final
  if (Array.isArray(parcelasIds) && parcelasIds.length > 0) {
    await prisma.parcela.updateMany({
      where: { id: { in: parcelasIds } },
      data: { paga: true },
    });
  }

  // Marca parcelas remanejadas (não entram no valor recebido, histórico preservado)
  if (Array.isArray(parcelasRemanejadas) && parcelasRemanejadas.length > 0) {
    await prisma.parcela.updateMany({
      where: { id: { in: parcelasRemanejadas } },
      data: { remanejada: true },
    });
  }

  // Conta parcelas ainda pendentes (nem pagas nem remanejadas)
  const parcelasPendentes = await prisma.parcela.count({
    where: { contratoId, paga: false, remanejada: false, equivocada: false },
  });

  // Contrato adimplente se não restar nenhuma parcela pendente
  const statusRecuperacao =
    parcelasPendentes === 0
      ? "RECUPERADO_INTEGRALMENTE"
      : totalRecebido > 0
      ? "RECUPERACAO_PARCIAL"
      : "INADIMPLENTE";

  await prisma.contrato.update({
    where: { id: contratoId },
    data: { statusRecuperacao, situacao: "INADIMPLENTE" },
  });

  // Se quitado integralmente, fecha todas as promessas abertas do contrato
  if (statusRecuperacao === "RECUPERADO_INTEGRALMENTE") {
    await prisma.promessa.updateMany({
      where: { contratoId, status: "ABERTA" },
      data: { status: "PAGA" },
    });
  }

  // Monta observação com parcelas pagas e remanejadas
  let observacaoContato = observacao || `Recebimento de ${formatarMoeda(Number(valorDecimal))} informado`;
  const todasIds = [
    ...(Array.isArray(parcelasIds) ? parcelasIds : []),
    ...(Array.isArray(parcelasRemanejadas) ? parcelasRemanejadas : []),
  ];
  if (todasIds.length > 0) {
    const todasParcelas = await prisma.parcela.findMany({
      where: { id: { in: todasIds } },
      select: { id: true, numero: true, dataVencimento: true, remanejada: true },
      orderBy: { numero: "asc" },
    });
    if (todasParcelas.length > 0) {
      const info = todasParcelas
        .map((p) => {
          const venc = new Date(p.dataVencimento).toLocaleDateString("pt-BR", { timeZone: "UTC" });
          const tag = p.remanejada ? " [remanejada]" : "";
          return `Parcela ${p.numero} (venc. ${venc})${tag}`;
        })
        .join(", ");
      observacaoContato += ` — ${info}`;
    }
  }

  // Registra contato automático
  await prisma.contato.create({
    data: {
      contratoId,
      consultorId: session.user.id,
      tipo: "LIGACAO",
      status: "RECEBIDO",
      observacao: observacaoContato,
    },
  });

  return NextResponse.json({ ok: true, recebimentoId: recebimento.id, statusRecuperacao }, { status: 201 });
}

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
