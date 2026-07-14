import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { status, resposta } = await req.json();

  const solicitacaoAtual = await prisma.solicitacao.findUnique({
    where: { id: params.id },
    select: { tipo: true, contratoId: true, solicitanteId: true, status: true, dados: true },
  });

  if (!solicitacaoAtual) return NextResponse.json({ erro: "Não encontrada" }, { status: 404 });

  const solicitacao = await prisma.solicitacao.update({
    where: { id: params.id },
    data: {
      status,
      resposta: resposta || null,
      resolvidaEm: new Date(),
      gestorId: session.user.id,
    },
  });

  // Ao aprovar inadimplência equivocada
  if (
    status === "APROVADA" &&
    solicitacaoAtual.tipo === "INADIMPLENCIA_EQUIVOCADA" &&
    solicitacaoAtual.contratoId
  ) {
    const dados = solicitacaoAtual.dados as { parcelasIds?: string[]; todasParcelas?: boolean } | null;
    const parcialIds = dados?.parcelasIds;
    const isTodas = !dados || dados.todasParcelas || !parcialIds?.length;

    if (isTodas) {
      // Remoção total: sai da carteira e da inadimplência geral
      await prisma.contrato.update({
        where: { id: solicitacaoAtual.contratoId },
        data: { inadimplenciaEquivocada: true, situacao: "INADIMPLENTE" },
      });
      await prisma.carteiraParcela.updateMany({
        where: { contratoId: solicitacaoAtual.contratoId, ativo: true },
        data: { ativo: false },
      });
    } else {
      // Remoção parcial: apenas as parcelas selecionadas saem da inadimplência
      const parcelasEquiv = await prisma.parcela.findMany({
        where: { id: { in: parcialIds } },
        select: { valorTotalAberto: true },
      });
      const valorEquivocado = parcelasEquiv.reduce((s, p) => s + Number(p.valorTotalAberto), 0);
      const contratoAtual = await prisma.contrato.findUnique({
        where: { id: solicitacaoAtual.contratoId },
        select: { valorTotalAberto: true },
      });
      const novoValorAberto = Math.max(0, Number(contratoAtual?.valorTotalAberto ?? 0) - valorEquivocado);
      await prisma.parcela.updateMany({
        where: { id: { in: parcialIds } },
        data: { equivocada: true, valorTotalAberto: 0 },
      });
      await prisma.contrato.update({
        where: { id: solicitacaoAtual.contratoId },
        data: { valorTotalAberto: novoValorAberto, situacao: "INADIMPLENTE" },
      });
      // CarteiraParcela permanece ativo — contrato fica na carteira com valor reduzido
    }
  }

  // Ao rejeitar inadimplência equivocada: reseta situação de volta para INADIMPLENTE
  if (
    status === "REJEITADA" &&
    solicitacaoAtual.tipo === "INADIMPLENCIA_EQUIVOCADA" &&
    solicitacaoAtual.contratoId
  ) {
    await prisma.contrato.update({
      where: { id: solicitacaoAtual.contratoId },
      data: { situacao: "INADIMPLENTE" },
    });
  }

  // Ao aprovar transferência: move o contrato para a carteira do solicitante
  if (
    status === "APROVADA" &&
    solicitacaoAtual.tipo === "TRANSFERENCIA_CONTRATO" &&
    solicitacaoAtual.contratoId
  ) {
    // Usa a competência ativa (não fechada mais recente)
    const competencia = await prisma.competencia.findFirst({
      where: { fechada: false },
      orderBy: { criadoEm: "desc" },
      select: { id: true },
    });

    if (competencia) {
      // upsert: se já existe registro na competência atualiza o consultorId, senão cria
      await prisma.carteiraParcela.upsert({
        where: {
          contratoId_competenciaId: {
            contratoId: solicitacaoAtual.contratoId,
            competenciaId: competencia.id,
          },
        },
        update: { consultorId: solicitacaoAtual.solicitanteId, ativo: true },
        create: {
          contratoId: solicitacaoAtual.contratoId,
          consultorId: solicitacaoAtual.solicitanteId,
          competenciaId: competencia.id,
          ativo: true,
        },
      });
      console.log(`[transferencia] contrato=${solicitacaoAtual.contratoId} → consultor=${solicitacaoAtual.solicitanteId} competencia=${competencia.id}`);
    } else {
      console.warn("[transferencia] nenhuma competência ativa encontrada");
    }
  }

  await prisma.auditoria.create({
    data: {
      usuarioId: session.user.id,
      tabela: "solicitacoes",
      registroId: params.id,
      campo: "status",
      valorAnterior: "PENDENTE",
      valorNovo: status,
      acao: "UPDATE",
    },
  });

  return NextResponse.json(solicitacao);
}
