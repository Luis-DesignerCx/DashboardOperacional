"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useSession } from "next-auth/react";

export function AlterarSenhaModal() {
  const { update } = useSession();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    setErro("");
    if (novaSenha.length < 6)    { setErro("A senha deve ter pelo menos 6 caracteres"); return; }
    if (novaSenha !== confirmar)  { setErro("As senhas não coincidem"); return; }
    if (novaSenha === "mudar123") { setErro("Escolha uma senha diferente da senha padrão"); return; }

    setSalvando(true);
    const res  = await fetch("/api/usuarios/alterar-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ novaSenha }),
    });
    const data = await res.json();
    setSalvando(false);

    if (!res.ok) { setErro(data.erro || "Erro ao salvar senha"); return; }
    await update();
  }

  return (
    <div className="fixed inset-0 bg-surface-0/90 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-surface-2 border border-white/[0.08] rounded-2xl w-full max-w-md shadow-card-lg animate-fade-in-up">
        {/* Header */}
        <div className="p-6 border-b border-white/[0.06] text-center">
          <div className="w-12 h-12 bg-gr-500/10 border border-gr-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock size={20} className="text-gr-400" />
          </div>
          <h2 className="text-white text-lg font-bold tracking-tight">Crie sua senha</h2>
          <p className="text-slate-500 text-sm mt-1.5">
            Por segurança, defina uma senha pessoal antes de continuar.
          </p>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
              Nova senha
            </label>
            <div className="relative">
              <input
                type={mostrar ? "text" : "password"}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-surface-1 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm pr-10 focus:outline-none focus:ring-1 focus:ring-gr-500/50 focus:border-gr-500/40 transition-all placeholder:text-slate-600"
              />
              <button
                type="button"
                onClick={() => setMostrar((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors"
              >
                {mostrar ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
              Confirmar senha
            </label>
            <input
              type={mostrar ? "text" : "password"}
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              placeholder="Repita a senha"
              className="w-full bg-surface-1 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gr-500/50 focus:border-gr-500/40 transition-all placeholder:text-slate-600"
            />
          </div>

          {erro && (
            <p className="text-red-400 text-sm bg-red-500/[0.08] border border-red-500/20 rounded-xl px-3 py-2.5">
              {erro}
            </p>
          )}

          <button
            onClick={salvar}
            disabled={salvando || !novaSenha || !confirmar}
            className="w-full bg-gradient-to-r from-gr-600 to-gr-500 hover:from-gr-500 hover:to-gr-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all text-sm shadow-glow-gr-sm"
          >
            {salvando ? "Salvando..." : "Salvar e entrar no sistema"}
          </button>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center justify-center gap-2 text-slate-600 hover:text-slate-300 text-xs py-2 transition-colors"
          >
            <LogOut size={12} /> Sair e entrar com outra conta
          </button>
        </div>
      </div>
    </div>
  );
}
