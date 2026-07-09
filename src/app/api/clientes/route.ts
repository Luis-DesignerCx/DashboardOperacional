import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const busca = searchParams.get("q") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const skip = (page - 1) * PAGE_SIZE;

  // CONSULTOR só vê clientes que têm contratos na sua carteira
  let clienteIdsConsultor: string[] | null = null;
  if (session.user.perfil === "CONSULTOR") {
    const carteiras = await prisma.carteiraParcela.findMany({
      where: { consultorId: session.user.id, ativo: true },
      select: { contrato: { select: { clienteId: true } } },
    });
    clienteIdsConsultor = [...new Set(carteiras.map((c) => c.contrato.clienteId))];
  }

  const whereBase: any = busca ? {
    OR: [
      { nome: { contains: busca, mode: "insensitive" } },
      { telefones: { contains: busca } },
      { contratos: { some: { numero: { contains: busca, mode: "insensitive" } } } },
    ],
  } : {};

  if (clienteIdsConsultor !== null) {
    whereBase.id = { in: clienteIdsConsultor };
  }

  const [total, clientes] = await Promise.all([
    prisma.cliente.count({ where: whereBase }),
    prisma.cliente.findMany({
      where: whereBase,
      select: {
        id: true,
        nome: true,
        cpf: true,
        telefones: true,
        emails: true,
        contratos: {
          select: {
            id: true,
            numero: true,
            empresa: { select: { nome: true } },
            valorTotalAberto: true,
            maiorDiasAtraso: true,
            contatos: {
              select: { status: true, criadoEm: true },
              orderBy: { criadoEm: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { nome: "asc" },
      skip,
      take: PAGE_SIZE,
    }),
  ]);

  const clientesComStatus = clientes.map((c) => {
    const ultimoContato = c.contratos
      .flatMap((ct) => ct.contatos)
      .sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime())[0] ?? null;
    return { ...c, ultimoContato };
  });

  return NextResponse.json({
    clientes: clientesComStatus,
    total,
    page,
    pageSize: PAGE_SIZE,
    temMais: skip + clientes.length < total,
  });
}
