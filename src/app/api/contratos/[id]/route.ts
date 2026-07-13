import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { maiorDiasAtraso, valorTotalAberto, statusContrato } = body;

  const data: any = {};
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

  const contrato = await prisma.contrato.update({ where: { id: params.id }, data });
  return NextResponse.json(contrato);
}
