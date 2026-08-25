import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.perfil !== "ADMINISTRADOR") {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { senha } = await req.json().catch(() => ({ senha: undefined }));
  if (!senha) {
    return NextResponse.json({ erro: "Senha obrigatória" }, { status: 400 });
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: session.user.id },
    select: { senhaHash: true },
  });
  if (!usuario) return NextResponse.json({ erro: "Usuário não encontrado" }, { status: 404 });

  const senhaCorreta = await bcrypt.compare(senha, usuario.senhaHash);
  if (!senhaCorreta) {
    return NextResponse.json({ erro: "Senha incorreta" }, { status: 401 });
  }

  try {
    // Deleção em ordem respeitando chaves estrangeiras
    await prisma.carteiraParcela.deleteMany({});
    await prisma.parcela.deleteMany({});
    await prisma.recebimento.deleteMany({});
    await prisma.promessa.deleteMany({});
    await prisma.contato.deleteMany({});
    await prisma.comissao.deleteMany({});
    await prisma.meta.deleteMany({});
    await prisma.solicitacao.deleteMany({});
    await prisma.feriasConsultor.deleteMany({});
    await prisma.importacao.deleteMany({});
    await prisma.auditoria.deleteMany({});
    await prisma.contrato.deleteMany({});
    await prisma.cliente.deleteMany({});
    await prisma.competencia.deleteMany({});

    // Registra quem executou o reset — gravado por último, após a limpeza da própria Auditoria
    await prisma.auditoria.create({
      data: {
        usuarioId: session.user.id,
        tabela: "sistema",
        registroId: "reset-total",
        acao: "RESET_BASE",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[admin/reset]", err);
    return NextResponse.json({ erro: err.message || "Erro ao limpar base" }, { status: 500 });
  }
}
