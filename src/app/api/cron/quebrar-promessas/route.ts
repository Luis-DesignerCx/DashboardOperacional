import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Chamado diariamente pelo Vercel Cron (ver vercel.json)
// Pode também ser chamado manualmente: GET /api/cron/quebrar-promessas?secret=<CRON_SECRET>
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  const querySecret = new URL(req.url).searchParams.get("secret");

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secret !== cronSecret && querySecret !== cronSecret) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const resultado = await prisma.promessa.updateMany({
    where: {
      status: "ABERTA",
      dataPrometida: { lt: hoje },
    },
    data: { status: "QUEBRADA" },
  });

  console.log(`[cron] quebrar-promessas: ${resultado.count} promessa(s) marcadas como QUEBRADA`);

  return NextResponse.json({ atualizadas: resultado.count, executadoEm: new Date().toISOString() });
}
