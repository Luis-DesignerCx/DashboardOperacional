import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Dispara o workflow GitHub Actions para processar o arquivo já enviado ao Storage
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user?.perfil ?? "")) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { syncId, filePath, competenciaId } = await req.json();
  if (!syncId || !filePath || !competenciaId) {
    return NextResponse.json({ erro: "syncId, filePath e competenciaId são obrigatórios" }, { status: 400 });
  }

  const ghToken = process.env.GH_PAT_TOKEN;
  const ghOwner = process.env.GITHUB_OWNER;
  const ghRepo  = process.env.GITHUB_REPO;

  if (!ghToken || !ghOwner || !ghRepo) {
    return NextResponse.json({ erro: "GitHub Actions não configurado no servidor." }, { status: 500 });
  }

  // Atualiza sync para PROCESSANDO antes de disparar
  await prisma.faPassSync.update({
    where: { id: syncId },
    data: { status: "PROCESSANDO" },
  });

  const resp = await fetch(`https://api.github.com/repos/${ghOwner}/${ghRepo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `token ${ghToken}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: "fapass-sync",
      client_payload: { competenciaId, syncId, filePath },
    }),
  });

  if (resp.status !== 204) {
    const erro = await resp.text();
    await prisma.faPassSync.update({ where: { id: syncId }, data: { status: "ERRO", erro } });
    return NextResponse.json({ erro: `Erro ao disparar Actions: ${erro}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, syncId });
}
