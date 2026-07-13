import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormaPagamento } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

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

  if (!isGestorAdmin) {
    if (recAtual.consultorId !== session.user.id) {
      return NextResponse.json({ erro: "Sem permissão para editar este recebimento" }, { status: 403 });
    }
    if (valor === undefined) {
      return NextResponse.json({ erro: "Informe o valor a corrigir" }, { status: 400 });
    }
  }

  const data: any = {};
  if (valor !== undefined) {
    data.valor = new Decimal(String(valor).replace(",", "."));
  }
  if (isGestorAdmin) {
    if (valorAParte !== undefined) {
      data.valorAParte = valorAParte != null && Number(valorAParte) > 0
        ? new Decimal(String(valorAParte).replace(",", "."))
        : null;
    }
    if (formaPagamento) data.formaPagamento = formaPagamento as FormaPagamento;
    if (dataRecebimento) data.dataRecebimento = new Date(dataRecebimento);
  }

  const rec = await prisma.recebimento.update({ where: { id }, data });

  if (valor !== undefined) {
    const novoValor = parseFloat(String(valor).replace(",", "."));
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

  await prisma.recebimento.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { contratoId, valor, dataRecebimento, formaPagamento, observacao, parcelasIds, valorAParte } = body;

  if (!contratoId || !valor || !dataRecebimento || !formaPagamento) {
    return NextResponse.json({ erro: "Campos obrigatórios: contratoId, valor, data, forma de pagamento" }, { status: 400 });
  }

  const contrato = await prisma.contrato.findUnique({
    where: { id: contratoId },
    select: { id: true, valorTotalAberto: true, recebimentos: { select: { valor: true } } },
  });
  if (!contrato) return NextResponse.json({ erro: "Contrato não encontrado" }, { status: 404 });

  const valorDecimal = new Decimal(String(valor).replace(",", "."));
  const valorAParteDecimal = valorAParte && Number(valorAParte) > 0
    ? new Decimal(String(valorAParte).replace(",", "."))
    : null;

  const recebimento = await prisma.recebimento.create({
    data: {
      contratoId,
      consultorId: session.user.id,
      valor: valorDecimal,
      valorAParte: valorAParteDecimal,
      dataRecebimento: new Date(dataRecebimento),
      formaPagamento: formaPagamento as FormaPagamento,
      justificativa: observacao || "Recebimento registrado pelo consultor",
      aprovado: true,
    },
  });

  // Calcula total recebido e atualiza statusRecuperacao
  const totalRecebidoAntes = contrato.recebimentos.reduce((s, r) => s + Number(r.valor), 0);
  const totalRecebido = totalRecebidoAntes + Number(valorDecimal);
  const valorAberto = Number(contrato.valorTotalAberto ?? 0);

  const statusRecuperacao =
    totalRecebido >= valorAberto
      ? "RECUPERADO_INTEGRALMENTE"
      : totalRecebido > 0
      ? "RECUPERACAO_PARCIAL"
      : "INADIMPLENTE";

  await prisma.contrato.update({
    where: { id: contratoId },
    data: { statusRecuperacao },
  });

  // Marca parcelas específicas como pagas
  if (Array.isArray(parcelasIds) && parcelasIds.length > 0) {
    await prisma.parcela.updateMany({
      where: { id: { in: parcelasIds } },
      data: { paga: true },
    });
  }

  // Registra contato automático
  await prisma.contato.create({
    data: {
      contratoId,
      consultorId: session.user.id,
      tipo: "LIGACAO",
      status: "RECEBIDO",
      observacao: observacao || `Recebimento de ${formatarMoeda(Number(valorDecimal))} informado`,
    },
  });

  return NextResponse.json({ ok: true, recebimentoId: recebimento.id, statusRecuperacao }, { status: 201 });
}

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
