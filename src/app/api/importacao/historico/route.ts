import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Log unificado de cargas recentes -- só cobre o que já fica gravado no banco
// hoje: importações de Base/Flash (tabela Importacao) e syncs do Fã Pass
// (tabela FaPassSync). "Baixas Confirmadas" não grava histórico nenhum (é um
// cruzamento na hora, sem persistência) -- não aparece aqui até isso mudar.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const competenciaId = searchParams.get("competenciaId");
  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

  const [importacoes, faPassSyncs, competencia] = await Promise.all([
    prisma.importacao.findMany({ where: { competenciaId }, orderBy: { criadoEm: "desc" }, take: 15 }),
    prisma.faPassSync.findMany({ where: { competenciaId }, orderBy: { criadoEm: "desc" }, take: 15 }),
    prisma.competencia.findUnique({ where: { id: competenciaId }, select: { descricao: true } }),
  ]);

  // Importacao.usuarioId não tem relation declarada no schema -- busca à parte.
  const usuarioIds = [...new Set(importacoes.map((i) => i.usuarioId))];
  const usuarios = usuarioIds.length
    ? await prisma.usuario.findMany({ where: { id: { in: usuarioIds } }, select: { id: true, nome: true } })
    : [];
  const usuarioMap = new Map(usuarios.map((u) => [u.id, u.nome]));

  const itensImportacao = importacoes.map((i) => ({
    id: i.id,
    tipo: "Base de Inadimplência",
    dataHora: i.criadoEm,
    arquivo: i.nomeArquivo,
    linhas: i.processadas,
    erros: i.erros,
    usuario: usuarioMap.get(i.usuarioId) ?? "—",
    status: i.status,
  }));

  // FaPassSync não grava nome de arquivo nem usuário -- mostra "—" em vez de
  // inventar dado que não existe.
  const itensFaPass = faPassSyncs.map((s) => ({
    id: s.id,
    tipo: "Fã Pass",
    dataHora: s.criadoEm,
    arquivo: "—",
    linhas: s.totalContratos,
    erros: s.totalDivergencias,
    usuario: "—",
    status: s.status,
  }));

  const itens = [...itensImportacao, ...itensFaPass]
    .sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime())
    .slice(0, 20);

  return NextResponse.json({ competencia: competencia?.descricao ?? null, itens });
}
