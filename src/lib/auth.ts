import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { Perfil } from "@prisma/client";
import { cache } from "react";

// Em deploys na Vercel, VERCEL_URL é definido automaticamente.
// Se NEXTAUTH_URL não foi configurado manualmente, usa VERCEL_URL como fallback.
if (process.env.VERCEL_URL && !process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const usuario = await prisma.usuario.findUnique({
          where: { email: credentials.email },
          select: {
            id: true, email: true, nome: true, perfil: true,
            senhaHash: true, ativo: true, empresaId: true,
            equipeId: true, deveAlterarSenha: true,
            equipe: { select: { id: true, nome: true, tipo: true } },
          },
        });

        if (!usuario || !usuario.ativo) return null;

        const senhaCorreta = await bcrypt.compare(credentials.password, usuario.senhaHash);
        if (!senhaCorreta) return null;

        // Auditoria de login — fire-and-forget para não bloquear o login
        prisma.auditoria.create({
          data: { usuarioId: usuario.id, tabela: "usuarios", registroId: usuario.id, acao: "LOGIN" },
        }).catch(() => {});

        return {
          id: usuario.id,
          email: usuario.email,
          name: usuario.nome,
          perfil: usuario.perfil,
          empresaId: usuario.empresaId,
          equipeId: usuario.equipeId,
          deveAlterarSenha: usuario.deveAlterarSenha,
          equipe: usuario.equipe
            ? { id: usuario.equipe.id, nome: usuario.equipe.nome, tipo: usuario.equipe.tipo }
            : null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.perfil = (user as any).perfil;
        token.empresaId = (user as any).empresaId;
        token.equipeId = (user as any).equipeId;
        token.equipe = (user as any).equipe;
        token.deveAlterarSenha = (user as any).deveAlterarSenha ?? false;
      }
      // Refresh deveAlterarSenha após troca de senha
      if (trigger === "update") {
        const u = await prisma.usuario.findUnique({ where: { id: token.sub! }, select: { deveAlterarSenha: true } });
        token.deveAlterarSenha = u?.deveAlterarSenha ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).perfil = token.perfil;
        (session.user as any).empresaId = token.empresaId;
        (session.user as any).equipeId = token.equipeId;
        (session.user as any).equipe = token.equipe;
        (session.user as any).deveAlterarSenha = token.deveAlterarSenha ?? false;
      }
      return session;
    },
  },
};

// ─── Helpers de autorização ───────────────────────────────────────────────────

export function isAdmin(perfil: Perfil) {
  return perfil === Perfil.ADMINISTRADOR;
}

export function isGestor(perfil: Perfil) {
  return perfil === Perfil.GESTOR || perfil === Perfil.ADMINISTRADOR;
}

export function isConsultor(perfil: Perfil) {
  return perfil === Perfil.CONSULTOR;
}
