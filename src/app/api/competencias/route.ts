import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const competencias = await prisma.competencia.findMany({
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
  });

  return NextResponse.json(competencias);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { mes, ano } = await req.json();
  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  const competencia = await prisma.competencia.create({
    data: {
      mes,
      ano,
      descricao: `${meses[mes - 1]}/${ano}`,
    },
  });

  return NextResponse.json(competencia, { status: 201 });
}
