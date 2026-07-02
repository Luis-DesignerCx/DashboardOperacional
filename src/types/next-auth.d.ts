import { Perfil, TipoEquipe } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      perfil: Perfil;
      empresaId: string | null;
      equipeId: string | null;
      equipe: { id: string; nome: string; tipo: TipoEquipe } | null;
      deveAlterarSenha: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    perfil: Perfil;
    empresaId: string | null;
    equipeId: string | null;
    equipe: { id: string; nome: string; tipo: TipoEquipe } | null;
    deveAlterarSenha: boolean;
  }
}
