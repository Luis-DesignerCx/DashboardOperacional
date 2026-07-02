import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const competenciaId = searchParams.get("competenciaId") ?? "";

  if (!competenciaId || q.length < 2) return NextResponse.json([]);

  // Contratos que NÃO têm carteira nessa competência
  const jaAtribuidos = await prisma.carteiraParcela.findMany({
    where: { competenciaId },
    select: { contratoId: true },
  });
  const excluir = jaAtribuidos.map((c) => c.contratoId);

  const contratos = await prisma.contrato.findMany({
    where: {
      ativo: true,
      id: { notIn: excluir.length ? excluir : ["__none__"] },
      OR: [
        { numero: { contains: q, mode: "insensitive" } },
        { cliente: { nome: { contains: q, mode: "insensitive" } } },
      ],
    },
    include: {
      cliente: { select: { nome: true, telefones: true } },
      empresa: { select: { nome: true } },
    },
    take: 20,
    orderBy: { maiorDiasAtraso: "desc" },
  });

  return NextResponse.json(contratos);
}
