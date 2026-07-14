import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { SituacaoContrato } from "@prisma/client";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const isGestorAdmin = ["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil);
  const body = await req.json();
  const { maiorDiasAtraso, valorTotalAberto, statusContrato, situacao, justificativa, parcelasIds, todasParcelas } = body;

  // Consultores só podem atualizar situacao (e apenas de contratos na sua carteira)
  if (!isGestorAdmin) {
    if (!situacao) return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
    const naCarteira = await prisma.carteiraParcela.findFirst({
      where: { contratoId: params.id, consultorId: session.user.id, ativo: true },
    });
    if (!naCarteira) return NextResponse.json({ erro: "Contrato não está na sua carteira" }, { status: 403 });
  }

  // Bloqueia mudança de situação para contratos já recuperados integralmente
  if (situacao) {
    const atual = await prisma.contrato.findUnique({
      where: { id: params.id },
      select: { statusRecuperacao: true },
    });
    if (atual?.statusRecuperacao === "RECUPERADO_INTEGRALMENTE") {
      return NextResponse.json({ erro: "Contrato já adimplente — situação não pode ser alterada" }, { status: 422 });
    }
  }

  const data: any = {};

  if (situacao !== undefined) {
    data.situacao = situacao as SituacaoContrato;
  }

  if (isGestorAdmin) {
    if (maiorDiasAtraso !== undefined && maiorDiasAtraso !== "") {
      data.maiorDiasAtraso = parseInt(String(maiorDiasAtraso));
    }
    if (valorTotalAberto !== undefined && valorTotalAberto !== "") {
      data.valorTotalAberto = new Decimal(String(valorTotalAberto).replace(",", "."));
    }
    if (statusContrato !== undefined && statusContrato !== "") {
      data.statusContrato = statusContrato;
    }
    if (valorTotalAberto !== undefined && valorTotalAberto !== "") {
      const contratoAtual = await prisma.contrato.findUnique({
        where: { id: params.id },
        select: { recebimentos: { select: { valor: true } } },
      });
      if (contratoAtual) {
        const totalRecebido = contratoAtual.recebimentos.reduce((s, r) => s + Number(r.valor), 0);
        const novoAberto = parseFloat(String(valorTotalAberto).replace(",", "."));
        const novoStatus =
          totalRecebido >= novoAberto
            ? "RECUPERADO_INTEGRALMENTE"
            : totalRecebido > 0
            ? "RECUPERACAO_PARCIAL"
            : "INADIMPLENTE";
        data.statusRecuperacao = novoStatus;
        // Zera situação ao recuperar integralmente
        if (novoStatus === "RECUPERADO_INTEGRALMENTE") {
          data.situacao = "INADIMPLENTE" as SituacaoContrato;
        }
      }
    }
  }

  const contrato = await prisma.contrato.update({ where: { id: params.id }, data });

  // Quando situação é INADIMPLENCIA_EQUIVOCADA, cria Solicitação para o gestor (se não houver pendente)
  if (situacao === "INADIMPLENCIA_EQUIVOCADA") {
    const jaExiste = await prisma.solicitacao.findFirst({
      where: { contratoId: params.id, tipo: "INADIMPLENCIA_EQUIVOCADA", status: "PENDENTE" },
    });
    if (!jaExiste) {
      await prisma.solicitacao.create({
        data: {
          tipo: "INADIMPLENCIA_EQUIVOCADA",
          contratoId: params.id,
          solicitanteId: session.user.id,
          motivo: justificativa || "Consultor contestou a inadimplência via carteira",
          dados: Array.isArray(parcelasIds) && parcelasIds.length > 0
            ? { parcelasIds, todasParcelas: !!todasParcelas }
            : undefined,
        },
      });
    }
  }

  // Quando consultor muda de INADIMPLENCIA_EQUIVOCADA para outra situação, cancela solicitação pendente
  if (situacao && situacao !== "INADIMPLENCIA_EQUIVOCADA") {
    await prisma.solicitacao.updateMany({
      where: { contratoId: params.id, tipo: "INADIMPLENCIA_EQUIVOCADA", status: "PENDENTE" },
      data: { status: "REJEITADA", resposta: "Cancelada pelo consultor" },
    });
  }

  return NextResponse.json(contrato);
}
