"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]         = useState("");
  const [senha, setSenha]         = useState("");
  const [mostrar, setMostrar]     = useState(false);
  const [erro, setErro]           = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    const res = await signIn("credentials", { email, password: senha, redirect: false });
    setCarregando(false);
    if (res?.error) setErro("Email ou senha incorretos.");
    else { router.push("/dashboard"); router.refresh(); }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row overflow-hidden bg-[#070b14]">

      {/* ── Painel esquerdo — Brand ────────────────────────────────── */}
      <div className="relative hidden lg:flex lg:w-[56%] flex-col items-center justify-center p-16 overflow-hidden bg-[#06080e]">

        {/* Ambient gradients */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full opacity-30"
            style={{ background: "radial-gradient(circle, rgba(100,96,228,0.35) 0%, transparent 65%)", transform: "translate(-30%, -30%)" }} />
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, rgba(56,189,248,0.3) 0%, transparent 65%)", transform: "translate(30%, 30%)" }} />
          <div className="absolute top-1/2 right-0 w-[400px] h-[400px] rounded-full opacity-15"
            style={{ background: "radial-gradient(circle, rgba(155,77,184,0.35) 0%, transparent 65%)", transform: "translate(20%, -50%)" }} />
        </div>

        {/* Grid sutil */}
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

        {/* Conteúdo */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-md">
          <div className="bg-white rounded-3xl p-5 shadow-2xl shadow-black/50 mb-10 inline-block">
            <Image src="/logo-gr.png" alt="GR Group" width={240} height={70} className="block" priority />
          </div>

          <h1 className="text-4xl font-bold text-white leading-tight tracking-tight mb-4">
            Gestão de Cobrança<br />
            <span className="bg-gradient-to-r from-gr-400 via-gr-300 to-sky-300 bg-clip-text text-transparent">
              em tempo real
            </span>
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
            Carteira inteligente, distribuição automática e performance da sua equipe num único lugar.
          </p>

          {/* Stats */}
          <div className="mt-10 flex items-center gap-8">
            {[
              { valor: "100%", label: "Rastreável" },
              { valor: "7×",   label: "Empresas"  },
              { valor: "0",    label: "Planilhas"  },
            ].map(({ valor, label }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <span className="text-2xl font-bold text-white tabular-nums">{valor}</span>
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Watermark */}
        <div className="absolute bottom-[-30px] left-[-30px] opacity-[0.04] pointer-events-none">
          <Image src="/logo-gr-icon-branco.png" alt="" width={280} height={280} />
        </div>
      </div>

      {/* ── Painel direito — Formulário ────────────────────────────── */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-8 bg-[#070b14] border-l border-white/[0.05]">

        {/* Subtle top glow */}
        <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-gr-500/[0.04] to-transparent pointer-events-none" />

        {/* Logo mobile */}
        <div className="lg:hidden mb-8">
          <div className="bg-white rounded-2xl p-4 inline-block shadow-xl">
            <Image src="/logo-gr.png" alt="GR Group" width={180} height={52} />
          </div>
        </div>

        <div className="relative z-10 w-full max-w-sm">
          {/* Ícone + título */}
          <div className="flex items-center gap-3 mb-8">
            <div className="relative w-10 h-10 rounded-xl overflow-hidden ring-1 ring-gr-500/25 flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-br from-gr-500/20 to-gr-900/40" />
              <Image src="/logo-gr-icon.png" alt="" width={40} height={40} className="relative z-10 w-full h-full object-contain" />
            </div>
            <div>
              <p className="text-white font-bold text-base leading-none tracking-tight">DASH CR</p>
              <p className="text-slate-500 text-[10px] mt-0.5 tracking-widest uppercase font-medium">Plataforma GR Group</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white tracking-tight mb-1">Bem-vindo</h2>
          <p className="text-slate-500 text-sm mb-8">Entre com suas credenciais para continuar.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="seu@grgroup.org"
                className="w-full bg-[#0b0f1c] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-gr-500/50 focus:border-gr-500/40 transition-all"
              />
            </div>

            {/* Senha */}
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
                Senha
              </label>
              <div className="relative">
                <input
                  type={mostrar ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full bg-[#0b0f1c] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-gr-500/50 focus:border-gr-500/40 transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setMostrar((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {mostrar ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {erro && (
              <div className="text-red-400 text-xs bg-red-500/[0.08] border border-red-500/20 rounded-xl px-4 py-3">
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="w-full bg-gradient-to-r from-gr-600 to-gr-500 hover:from-gr-500 hover:to-gr-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all text-sm shadow-glow-gr-sm mt-2 active:scale-[0.99]"
            >
              {carregando ? "Entrando..." : "Entrar na plataforma"}
            </button>
          </form>

          <p className="text-center text-slate-700 text-[10px] mt-10 tracking-wide">
            © {new Date().getFullYear()} GR Group · Todos os direitos reservados
          </p>
        </div>

        {/* Watermark */}
        <div className="absolute bottom-0 right-0 opacity-[0.04] pointer-events-none overflow-hidden">
          <Image src="/logo-gr-icon-branco.png" alt="" width={240} height={240} />
        </div>
      </div>
    </div>
  );
}
