import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH /api/historico/cancelar?importacaoId=xxx
// Cancela uma importação travada em PROCESSANDO
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  if (!["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const importacaoId = searchParams.get("importacaoId");
  if (!importacaoId) return NextResponse.json({ erro: "importacaoId obrigatório" }, { status: 400 });

  const importacao = await prisma.importacao.findUnique({ where: { id: importacaoId } });
  if (!importacao) return NextResponse.json({ erro: "Não encontrada" }, { status: 404 });
  if (importacao.status !== "PROCESSANDO") {
    return NextResponse.json({ erro: "Apenas importações PROCESSANDO podem ser canceladas" }, { status: 400 });
  }

  await prisma.importacao.update({
    where: { id: importacaoId },
    data:  { status: "ERRO", concluidoEm: new Date() },
  });

  return NextResponse.json({ ok: true });
}
