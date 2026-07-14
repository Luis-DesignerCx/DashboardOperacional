import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  const contratos = await prisma.contrato.findMany({
    where: {
      OR: [
        { cliente: { nome: { contains: q, mode: "insensitive" } } },
        { numero: { contains: q, mode: "insensitive" } },
        { cliente: { cpf: { contains: q, mode: "insensitive" } } },
        { cliente: { telefones: { contains: q, mode: "insensitive" } } },
      ],
    },
    select: {
      id: true,
      numero: true,
      valorTotalAberto: true,
      maiorDiasAtraso: true,
      statusRecuperacao: true,
      cliente: { select: { id: true, nome: true, cpf: true, telefones: true, emails: true } },
      empresa: { select: { nome: true } },
      carteiras: {
        where: { ativo: true },
        select: {
          consultor: {
            select: {
              id: true,
              nome: true,
              equipe: { select: { nome: true } },
            },
          },
          competencia: { select: { descricao: true } },
        },
        orderBy: { atribuidoEm: "desc" },
        take: 1,
      },
    },
    orderBy: { maiorDiasAtraso: "desc" },
    take: 25,
  });

  return NextResponse.json(contratos);
}
