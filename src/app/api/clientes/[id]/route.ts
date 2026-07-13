import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { nome, telefones, emails } = body;

  const data: any = {};
  if (nome) data.nome = nome.trim();
  if (telefones !== undefined) data.telefones = telefones?.trim() || null;
  if (emails !== undefined) data.emails = emails?.trim() || null;

  const cliente = await prisma.cliente.update({ where: { id: params.id }, data });
  return NextResponse.json(cliente);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const cliente = await prisma.cliente.findUnique({
    where: { id: params.id },
    include: {
      contratos: {
        include: {
          empresa: true,
          parcelas: { orderBy: { dataVencimento: "asc" } },
          recebimentos: { orderBy: { dataRecebimento: "desc" } },
          contatos: { orderBy: { criadoEm: "desc" }, take: 5 },
          promessas: { where: { status: "ABERTA" }, orderBy: { dataPrometida: "asc" } },
          carteiras: {
            include: { consultor: { select: { nome: true } }, competencia: true },
            orderBy: { atribuidoEm: "desc" },
            take: 1,
          },
        },
        orderBy: { maiorDiasAtraso: "desc" },
      },
    },
  });

  if (!cliente) return NextResponse.json({ erro: "Cliente não encontrado" }, { status: 404 });

  return NextResponse.json(cliente);
}
