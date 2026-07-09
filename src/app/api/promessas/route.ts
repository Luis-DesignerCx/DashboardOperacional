import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FormaPagamento } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { contratoId, valorPrometido, dataPrometida, formaPagamento, observacao, parcelasIds, tipoContato } = await req.json();

  if (!contratoId || !valorPrometido || !dataPrometida || !formaPagamento) {
    return NextResponse.json({ erro: "Campos obrigatórios ausentes" }, { status: 400 });
  }

  const isLink = tipoContato === "LINK_ENVIADO";

  const promessa = await prisma.promessa.create({
    data: {
      contratoId,
      consultorId: session.user.id,
      valorPrometido: new Decimal(valorPrometido),
      dataPrometida: new Date(dataPrometida),
      formaPagamento: formaPagamento as FormaPagamento,
      observacao: observacao || null,
      parcelasIds: Array.isArray(parcelasIds) ? parcelasIds : [],
      status: "ABERTA",
    },
  });

  await prisma.contato.create({
    data: {
      contratoId,
      consultorId: session.user.id,
      tipo: isLink ? "WHATSAPP" : "LIGACAO",
      status: isLink ? "LINK_ENVIADO" : "PROMESSA_PAGAMENTO",
      observacao: isLink
        ? `Link enviado: R$ ${valorPrometido} — parcelas: ${Array.isArray(parcelasIds) && parcelasIds.length > 0 ? parcelasIds.length : "não especificadas"}`
        : `Promessa: R$ ${valorPrometido} para ${new Date(dataPrometida).toLocaleDateString("pt-BR")}`,
    },
  });

  return NextResponse.json(promessa, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { id, valorPrometido, dataPrometida, formaPagamento, observacao, parcelasIds, status } = await req.json();

  if (!id) return NextResponse.json({ erro: "ID obrigatório" }, { status: 400 });

  // Verifica que a promessa pertence ao consultor (ou é gestor/admin)
  const promessa = await prisma.promessa.findUnique({ where: { id }, select: { consultorId: true } });
  if (!promessa) return NextResponse.json({ erro: "Promessa não encontrada" }, { status: 404 });
  if (session.user.perfil === "CONSULTOR" && promessa.consultorId !== session.user.id) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const atualizada = await prisma.promessa.update({
    where: { id },
    data: {
      ...(valorPrometido !== undefined && { valorPrometido: new Decimal(valorPrometido) }),
      ...(dataPrometida !== undefined && { dataPrometida: new Date(dataPrometida) }),
      ...(formaPagamento !== undefined && { formaPagamento: formaPagamento as FormaPagamento }),
      ...(observacao !== undefined && { observacao: observacao || null }),
      ...(parcelasIds !== undefined && { parcelasIds: Array.isArray(parcelasIds) ? parcelasIds : [] }),
      ...(status !== undefined && { status }),
    },
  });

  return NextResponse.json(atualizada);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const contratoId = searchParams.get("contratoId");
  const clienteId = searchParams.get("clienteId");
  const status = searchParams.get("status");
  const hoje = searchParams.get("vencendoHoje") === "true";
  const todas = searchParams.get("todas") === "true";

  const where: any = {};
  if (contratoId) where.contratoId = contratoId;
  if (clienteId) where.contrato = { clienteId };
  if (status) where.status = status;
  if (session.user.perfil === "CONSULTOR" && !todas) where.consultorId = session.user.id;
  if (session.user.perfil === "GESTOR" && !todas) {
    const equipeId = (session.user as any).equipeId;
    const idsPermitidos: string[] = [session.user.id];
    if (equipeId) {
      const consultores = await prisma.usuario.findMany({
        where: { equipeId, ativo: true },
        select: { id: true },
      });
      consultores.forEach((c) => { if (!idsPermitidos.includes(c.id)) idsPermitidos.push(c.id); });
    }
    where.consultorId = { in: idsPermitidos };
  }

  if (hoje) {
    const inicioHoje = new Date(); inicioHoje.setHours(0, 0, 0, 0);
    const fimHoje = new Date(); fimHoje.setHours(23, 59, 59, 999);
    where.dataPrometida = { gte: inicioHoje, lte: fimHoje };
    where.status = "ABERTA";
  }

  const promessas = await prisma.promessa.findMany({
    where,
    include: {
      contrato: { include: { cliente: true, empresa: true } },
      consultor: { select: { nome: true } },
    },
    orderBy: { dataPrometida: "asc" },
  });

  return NextResponse.json(promessas);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "ID obrigatório" }, { status: 400 });

  const promessa = await prisma.promessa.findUnique({ where: { id }, select: { consultorId: true, status: true } });
  if (!promessa) return NextResponse.json({ erro: "Promessa não encontrada" }, { status: 404 });
  if (session.user.perfil === "CONSULTOR" && promessa.consultorId !== session.user.id) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  await prisma.promessa.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
