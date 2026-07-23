import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/competencias/ativa — retorna a competência mais recente não fechada
// Aceita autenticação via x-api-key (CRON_SECRET) para uso em scripts automatizados
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.CRON_SECRET) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const competencia = await prisma.competencia.findFirst({
    where: { fechada: false },
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
  });

  if (!competencia) {
    return NextResponse.json({ erro: "Nenhuma competência ativa" }, { status: 404 });
  }

  return NextResponse.json(competencia);
}
