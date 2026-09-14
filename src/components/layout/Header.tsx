"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Perfil } from "@prisma/client";
import { LogOut, Sun, Moon, ChevronDown, Mail, Layers } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

interface HeaderProps {
  user: { name?: string | null; email?: string | null; perfil: Perfil };
  frentes?: string[];
}

const PERFIL_LABEL: Record<Perfil, string> = {
  ADMINISTRADOR: "Administrador",
  GESTOR: "Gestor",
  CONSULTOR: "Consultor",
};

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

export function Header({ user, frentes = [] }: HeaderProps) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [perfilAberto, setPerfilAberto] = useState(false);

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
        <div className="relative">
          <button
            type="button"
            onClick={() => setPerfilAberto((v) => !v)}
            className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-white/[0.05] transition-colors"
          >
            {/* Avatar */}
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gr-500/60 to-gr-700/80 flex items-center justify-center ring-1 ring-gr-500/30 flex-shrink-0">
              <span className="text-[10px] font-bold text-white leading-none">{initials}</span>
            </div>

            <div className="hidden sm:flex items-center gap-1 min-w-0">
              <p className="text-xs font-semibold text-slate-200 leading-tight truncate max-w-[140px]">{user.name}</p>
              <ChevronDown size={12} className={cn("text-slate-500 flex-shrink-0 transition-transform", perfilAberto && "rotate-180")} />
            </div>
          </button>

          {perfilAberto && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPerfilAberto(false)} />
              <div className="absolute right-0 top-full mt-2 w-64 bg-surface-2 border border-white/[0.08] rounded-xl shadow-card-lg p-4 z-50 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-white">{user.name}</p>
                  <span className="inline-block mt-1 text-[10px] font-medium text-gr-300 bg-gr-500/15 border border-gr-500/25 px-1.5 py-0.5 rounded">
                    {PERFIL_LABEL[user.perfil]}
                  </span>
                </div>

                <div className="flex items-start gap-2 text-xs text-slate-400">
                  <Mail size={13} className="text-slate-500 flex-shrink-0 mt-0.5" />
                  <span className="break-all">{user.email}</span>
                </div>

                {frentes.length > 0 && (
                  <div className="flex items-start gap-2 text-xs text-slate-400 pt-2 border-t border-white/[0.06]">
                    <Layers size={13} className="text-slate-500 flex-shrink-0 mt-0.5" />
                    <div className="flex flex-wrap gap-1">
                      {frentes.map((f) => (
                        <span key={f} className="text-[10px] font-medium text-slate-300 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="w-px h-5 bg-white/[0.07]" />

        <button
          onClick={toggle}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] transition-all"
          aria-label={theme === "dark" ? "Mudar para modo claro" : "Mudar para modo escuro"}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>

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
