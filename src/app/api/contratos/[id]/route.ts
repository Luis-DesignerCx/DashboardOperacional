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
  const { maiorDiasAtraso, valorTotalAberto, statusContrato, situacao } = body;

  // Consultores só podem atualizar situacao (e apenas de contratos na sua carteira)
  if (!isGestorAdmin) {
    if (!situacao) return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
    const naCarteira = await prisma.carteiraParcela.findFirst({
      where: { contratoId: params.id, consultorId: session.user.id, ativo: true },
    });
    if (!naCarteira) return NextResponse.json({ erro: "Contrato não está na sua carteira" }, { status: 403 });
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
        data.statusRecuperacao =
          totalRecebido >= novoAberto
            ? "RECUPERADO_INTEGRALMENTE"
            : totalRecebido > 0
            ? "RECUPERACAO_PARCIAL"
            : "INADIMPLENTE";
      }
    }
  }

  const contrato = await prisma.contrato.update({ where: { id: params.id }, data });
  return NextResponse.json(contrato);
}
