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
  const { valorParcela, valorTotalAberto, diasAtraso, dataVencimento } = body;

  const data: any = {};
  if (valorParcela !== undefined && valorParcela !== "") {
    data.valorParcela = new Decimal(String(valorParcela).replace(",", "."));
  }
  if (valorTotalAberto !== undefined && valorTotalAberto !== "") {
    data.valorTotalAberto = new Decimal(String(valorTotalAberto).replace(",", "."));
  }
  if (diasAtraso !== undefined && diasAtraso !== "") {
    data.diasAtraso = parseInt(String(diasAtraso));
  }
  if (dataVencimento) {
    data.dataVencimento = new Date(dataVencimento);
  }

  const parcela = await prisma.parcela.update({ where: { id: params.id }, data });
  return NextResponse.json(parcela);
}
