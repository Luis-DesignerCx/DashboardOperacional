import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  // Só ADMINISTRADOR (mesma regra do PUT logo abaixo, e da própria tela no
  // menu) -- antes qualquer usuário autenticado, inclusive CONSULTOR, lia
  // as configurações do sistema (achado real da revisão de segurança,
  // 2026-09-16).
  if (!session || session.user.perfil !== "ADMINISTRADOR") {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const configs = await prisma.configuracao.findMany({ orderBy: { chave: "asc" } });
  return NextResponse.json(configs);
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.perfil !== "ADMINISTRADOR") {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const dados: Record<string, string> = await req.json();

  for (const [chave, valor] of Object.entries(dados)) {
    await prisma.configuracao.upsert({
      where: { chave },
      update: { valor },
      create: { chave, valor },
    });

    await prisma.auditoria.create({
      data: {
        usuarioId: session.user.id,
        tabela: "configuracoes",
        registroId: chave,
        campo: chave,
        valorNovo: valor,
        acao: "UPDATE",
      },
    });
  }

  return NextResponse.json({ ok: true });
}
