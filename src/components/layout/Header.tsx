"use client";

import { signOut } from "next-auth/react";
import { Perfil } from "@prisma/client";
import { LogOut, User } from "lucide-react";

interface HeaderProps {
  user: { name?: string | null; email?: string | null; perfil: Perfil };
}

export function Header({ user }: HeaderProps) {
  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0">
      <div />
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
            <User size={14} className="text-slate-300" />
          </div>
          <div className="hidden sm:block">
            <p className="text-slate-200 font-medium text-sm">{user.name}</p>
            <p className="text-slate-500 text-xs">{user.email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-sm"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}
