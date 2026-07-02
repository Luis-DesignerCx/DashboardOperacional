import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { senhaAtual, novaSenha } = await req.json();

  if (!novaSenha || novaSenha.length < 6) {
    return NextResponse.json({ erro: "Nova senha deve ter pelo menos 6 caracteres" }, { status: 400 });
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: session.user.id },
    select: { senhaHash: true, deveAlterarSenha: true },
  });
  if (!usuario) return NextResponse.json({ erro: "Usuário não encontrado" }, { status: 404 });

  // Só valida senha atual se não for troca obrigatória (já que é o primeiro acesso)
  if (!usuario.deveAlterarSenha) {
    if (!senhaAtual) return NextResponse.json({ erro: "Senha atual obrigatória" }, { status: 400 });
    const ok = await bcrypt.compare(senhaAtual, usuario.senhaHash);
    if (!ok) return NextResponse.json({ erro: "Senha atual incorreta" }, { status: 400 });
  }

  const novaSenhaHash = await bcrypt.hash(novaSenha, 10);
  await prisma.usuario.update({
    where: { id: session.user.id },
    data: { senhaHash: novaSenhaHash, deveAlterarSenha: false },
  });

  return NextResponse.json({ ok: true });
}
