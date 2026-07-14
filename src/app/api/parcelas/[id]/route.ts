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
  const { valorParcela, valorTotalAberto, diasAtraso, dataVencimento, paga } = body;

  const data: any = {};
  if (valorParcela !== undefined && valorParcela !== "") data.valorParcela = new Decimal(String(valorParcela).replace(",", "."));
  if (valorTotalAberto !== undefined && valorTotalAberto !== "") data.valorTotalAberto = new Decimal(String(valorTotalAberto).replace(",", "."));
  if (diasAtraso !== undefined && diasAtraso !== "") data.diasAtraso = parseInt(String(diasAtraso));
  if (dataVencimento) data.dataVencimento = new Date(dataVencimento + "T00:00:00.000Z");
  if (paga !== undefined) data.paga = Boolean(paga);

  const parcela = await prisma.parcela.update({ where: { id: params.id }, data });

  // Recalcula maiorDiasAtraso do contrato se diasAtraso foi alterado
  if (diasAtraso !== undefined && diasAtraso !== "") {
    const todasParcelas = await prisma.parcela.findMany({
      where: { contratoId: parcela.contratoId },
      select: { diasAtraso: true },
    });
    const maior = Math.max(...todasParcelas.map((p) => p.diasAtraso ?? 0));
    await prisma.contrato.update({ where: { id: parcela.contratoId }, data: { maiorDiasAtraso: maior } });
  }

  return NextResponse.json(parcela);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const parcela = await prisma.parcela.findUnique({
    where: { id: params.id },
    select: { id: true, contratoId: true, valorTotalAberto: true },
  });
  if (!parcela) return NextResponse.json({ erro: "Parcela não encontrada" }, { status: 404 });

  await prisma.parcela.delete({ where: { id: params.id } });

  // Recalcula valorTotalAberto e maiorDiasAtraso do contrato
  const restantes = await prisma.parcela.findMany({
    where: { contratoId: parcela.contratoId },
    select: { valorTotalAberto: true, diasAtraso: true },
  });

  const novoValorAberto = restantes.reduce((s, p) => s + Number(p.valorTotalAberto ?? 0), 0);
  const novoMaiorDias = restantes.length > 0 ? Math.max(...restantes.map((p) => p.diasAtraso ?? 0)) : 0;

  await prisma.contrato.update({
    where: { id: parcela.contratoId },
    data: {
      valorTotalAberto: new Decimal(novoValorAberto.toFixed(2)),
      maiorDiasAtraso: novoMaiorDias,
    },
  });

  return NextResponse.json({ ok: true });
}
