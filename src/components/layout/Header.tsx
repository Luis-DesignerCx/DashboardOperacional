"use client";

import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Perfil } from "@prisma/client";
import { LogOut } from "lucide-react";

interface HeaderProps {
  user: { name?: string | null; email?: string | null; perfil: Perfil };
}

const PAGE_TITLES: Record<string, string> = {
  "/dashboard":    "Dashboard",
  "/consulta":     "Consulta Rápida",
  "/carteira":     "Minha Carteira",
  "/clientes":     "Clientes",
  "/pendencias":   "Minhas Tarefas",
  "/importacao":   "Importação",
  "/historico":    "Histórico",
  "/usuarios":     "Usuários",
  "/gestao":       "Gestão de Carteiras",
  "/equipes":      "Frentes",
  "/metas":        "Metas",
  "/comissao":     "Comissão",
  "/relatorios":   "Relatórios",
  "/solicitacoes": "Solicitações",
  "/auditoria":    "Auditoria",
  "/configuracoes":"Configurações",
};

export function Header({ user }: HeaderProps) {
  const pathname = usePathname();

  const pageTitle = Object.entries(PAGE_TITLES).find(
    ([key]) => pathname === key || pathname.startsWith(key + "/")
  )?.[1] ?? "";

  const initials = user.name
    ?.split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("") ?? "U";

  return (
    <header className="h-14 flex-shrink-0 flex items-center justify-between px-5 border-b border-white/[0.05] bg-[#07090f]/80 backdrop-blur-xl">
      {/* Left — page title */}
      <div className="flex items-center gap-2 min-w-0">
        {pageTitle && (
          <h1 className="text-sm font-semibold text-slate-200 truncate">{pageTitle}</h1>
        )}
      </div>

      {/* Right — user + logout */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Avatar */}
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gr-500/60 to-gr-700/80 flex items-center justify-center ring-1 ring-gr-500/30 flex-shrink-0">
            <span className="text-[10px] font-bold text-white leading-none">{initials}</span>
          </div>

          <div className="hidden sm:block min-w-0">
            <p className="text-xs font-semibold text-slate-200 leading-tight truncate max-w-[140px]">{user.name}</p>
            <p className="text-[10px] text-slate-500 leading-tight truncate max-w-[140px]">{user.email}</p>
          </div>
        </div>

        <div className="w-px h-5 bg-white/[0.07]" />

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] transition-all text-xs font-medium"
        >
          <LogOut size={13} />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}
