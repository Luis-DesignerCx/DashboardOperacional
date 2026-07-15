import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.perfil !== "ADMINISTRADOR") {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  // Deleção em ordem respeitando chaves estrangeiras
  await prisma.carteiraParcela.deleteMany({});
  await prisma.parcela.deleteMany({});
  await prisma.recebimento.deleteMany({});
  await prisma.promessa.deleteMany({});
  await prisma.contato.deleteMany({});
  await prisma.comissao.deleteMany({});
  await prisma.meta.deleteMany({});
  await prisma.importacao.deleteMany({});
  await prisma.auditoria.deleteMany({});
  await prisma.contrato.deleteMany({});
  await prisma.cliente.deleteMany({});
  await prisma.competencia.deleteMany({});

  return NextResponse.json({ ok: true });
}
