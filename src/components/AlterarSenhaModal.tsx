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
    if (novaSenha.length < 6) { setErro("A senha deve ter pelo menos 6 caracteres"); return; }
    if (novaSenha !== confirmar) { setErro("As senhas não coincidem"); return; }
    if (novaSenha === "mudar123") { setErro("Escolha uma senha diferente da senha padrão"); return; }

    setSalvando(true);
    const res = await fetch("/api/usuarios/alterar-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ novaSenha }),
    });
    const data = await res.json();
    setSalvando(false);

    if (!res.ok) { setErro(data.erro || "Erro ao salvar senha"); return; }

    // Atualiza o token para refletir deveAlterarSenha: false
    await update();
  }

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Cabeçalho */}
        <div className="p-6 border-b border-slate-800 text-center">
          <div className="w-14 h-14 bg-gr-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock size={24} className="text-gr-400" />
          </div>
          <h2 className="text-white text-xl font-bold">Crie sua senha</h2>
          <p className="text-slate-400 text-sm mt-1.5">
            Por segurança, defina uma senha pessoal antes de continuar.
          </p>
        </div>

        {/* Formulário */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Nova senha</label>
            <div className="relative">
              <input
                type={mostrar ? "text" : "password"}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-gr-500 placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setMostrar((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {mostrar ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Confirmar nova senha</label>
            <input
              type={mostrar ? "text" : "password"}
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              placeholder="Repita a senha"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500 placeholder:text-slate-500"
            />
          </div>

          {erro && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}

          <button
            onClick={salvar}
            disabled={salvando || !novaSenha || !confirmar}
            className="w-full bg-gr-500 hover:bg-gr-400 disabled:bg-gr-500/30 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            {salvando ? "Salvando..." : "Salvar e entrar no sistema"}
          </button>

          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-slate-300 text-sm py-2 transition-colors"
          >
            <LogOut size={14} /> Sair e entrar com outra conta
          </button>
        </div>
      </div>
    </div>
  );
}
