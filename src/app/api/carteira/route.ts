import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const competenciaId = searchParams.get("competenciaId");
  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const busca = searchParams.get("busca")?.trim();
  const skip = (page - 1) * PAGE_SIZE;

  const where: any = { competenciaId, ativo: true };
  if (session.user.perfil === "CONSULTOR") where.consultorId = session.user.id;
  if (busca) {
    where.contrato = {
      OR: [
        { cliente: { nome: { contains: busca, mode: "insensitive" } } },
        { numero: { contains: busca, mode: "insensitive" } },
      ],
    };
  }

  const [total, contratos] = await Promise.all([
    prisma.carteiraParcela.count({ where }),
    prisma.carteiraParcela.findMany({
      where,
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        contrato: {
          select: {
            id: true,
            numero: true,
            maiorDiasAtraso: true,
            valorTotalAberto: true,
            statusContrato: true,
            statusRecuperacao: true,
            cliente: { select: { id: true, nome: true, telefones: true } },
            empresa: { select: { id: true, nome: true } },
            contatos: {
              orderBy: { criadoEm: "desc" },
              take: 1,
              select: { tipo: true, status: true, criadoEm: true },
            },
            promessas: {
              where: { status: "ABERTA" },
              select: { id: true, valorPrometido: true, dataPrometida: true },
              take: 5,
            },
            recebimentos: {
              select: { id: true, valor: true, valorAParte: true, dataRecebimento: true, formaPagamento: true },
            },
            parcelas: {
              where: { paga: false },
              select: { id: true, numero: true, valorTotalAberto: true, diasAtraso: true },
              orderBy: { numero: "asc" },
            },
          },
        },
        consultor: { select: { id: true, nome: true } },
      },
      orderBy: { contrato: { maiorDiasAtraso: "desc" } },
    }),
  ]);

  // Soma total de valor em aberto dos contratos carregados nesta página
  const valorTotal = contratos.reduce((s, c) => s + Number(c.contrato.valorTotalAberto ?? 0), 0);

  return NextResponse.json({
    contratos,
    total,
    valorTotal,
    page,
    pageSize: PAGE_SIZE,
    temMais: skip + contratos.length < total,
  });
}
