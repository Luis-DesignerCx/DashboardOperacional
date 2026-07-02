"use client";

import { useSession } from "next-auth/react";
import { AlterarSenhaModal } from "./AlterarSenhaModal";

export function SessaoGuard() {
  const { data: session } = useSession();
  if (session?.user?.deveAlterarSenha) return <AlterarSenhaModal />;
  return null;
}
