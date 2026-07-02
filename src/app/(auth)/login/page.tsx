"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    const res = await signIn("credentials", { email, password: senha, redirect: false });
    setCarregando(false);
    if (res?.error) {
      setErro("Email ou senha incorretos.");
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row overflow-hidden" style={{ background: "#08081a" }}>

      {/* ── PAINEL ESQUERDO — Brand Canvas ── */}
      <div className="relative hidden lg:flex lg:w-[58%] flex-col items-center justify-center p-16 overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0d0d2b 0%, #141432 50%, #0f0f24 100%)" }}
      >
        {/* Gradiente estático — sem animação, sem blur pesado */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 60% 50% at 15% 15%, rgba(155,77,184,0.40) 0%, transparent 70%), radial-gradient(ellipse 55% 45% at 85% 85%, rgba(61,200,160,0.30) 0%, transparent 70%), radial-gradient(ellipse 40% 35% at 75% 25%, rgba(232,64,96,0.20) 0%, transparent 60%), radial-gradient(ellipse 35% 30% at 20% 75%, rgba(74,133,212,0.22) 0%, transparent 60%)"
        }} />

        {/* Grade sutil */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px"
          }}
        />

        {/* Conteúdo */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-md">
          {/* Logo GR Group */}
          <div className="bg-white rounded-3xl p-5 shadow-2xl shadow-black/40 mb-10 inline-block">
            <Image
              src="/logo-gr.png"
              alt="GR Group"
              width={260}
              height={76}
              className="block"
              priority
            />
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-bold text-white leading-tight tracking-tight mb-4">
            Gestão de Cobrança<br />
            <span style={{ background: "linear-gradient(90deg, #9B4DB8, #4A85D4, #3DC8A0)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              em tempo real
            </span>
          </h1>
          <p className="text-slate-400 text-base leading-relaxed max-w-xs">
            Carteira inteligente, distribuição automática e performance da sua equipe num único lugar.
          </p>

          {/* Métricas decorativas */}
          <div className="mt-10 grid grid-cols-3 gap-6 w-full">
            {[
              { valor: "100%", label: "Rastreável" },
              { valor: "7×", label: "Empresas" },
              { valor: "0", label: "Planilhas" },
            ].map(({ valor, label }) => (
              <div key={label} className="flex flex-col items-center">
                <span className="text-2xl font-bold text-white">{valor}</span>
                <span className="text-xs text-slate-500 mt-0.5 font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Espiral branco de fundo no canto */}
        <div className="absolute bottom-[-40px] left-[-40px] opacity-[0.05] pointer-events-none">
          <Image src="/logo-gr-icon-branco.png" alt="" width={300} height={300} />
        </div>
      </div>

      {/* ── PAINEL DIREITO — Formulário ── */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-8"
        style={{ background: "#0b0b1e", borderLeft: "1px solid rgba(100,96,228,0.12)" }}
      >
        {/* Logo mobile */}
        <div className="lg:hidden mb-8">
          <div className="bg-white rounded-2xl p-4 inline-block shadow-xl">
            <Image src="/logo-gr.png" alt="GR Group" width={180} height={52} />
          </div>
        </div>

        <div className="w-full max-w-sm">
          {/* Ícone + título */}
          <div className="flex items-center gap-3 mb-8">
            <Image src="/logo-gr-icon.png" alt="" width={40} height={40} className="rounded-xl" />
            <div>
              <p className="text-white font-bold text-lg leading-none">DASH CR</p>
              <p className="text-slate-500 text-xs mt-0.5">Plataforma GR Group</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">Bem-vindo</h2>
          <p className="text-slate-500 text-sm mb-8">Entre com suas credenciais para continuar.</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="seu@grgroup.org"
                style={{
                  background: "#13132e",
                  border: "1px solid rgba(100,96,228,0.25)",
                  color: "#e2e8f0",
                }}
                className="w-full rounded-xl px-4 py-3 text-sm placeholder-slate-600 focus:outline-none focus:ring-2 transition"
                onFocus={(e) => (e.target.style.borderColor = "#6460e4")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(100,96,228,0.25)")}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Senha
              </label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                style={{
                  background: "#13132e",
                  border: "1px solid rgba(100,96,228,0.25)",
                  color: "#e2e8f0",
                }}
                className="w-full rounded-xl px-4 py-3 text-sm placeholder-slate-600 focus:outline-none focus:ring-2 transition"
                onFocus={(e) => (e.target.style.borderColor = "#6460e4")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(100,96,228,0.25)")}
              />
            </div>

            {erro && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={carregando}
              style={{
                background: carregando
                  ? "#3c3a88"
                  : "linear-gradient(135deg, #6460e4 0%, #9B4DB8 100%)",
              }}
              className="w-full text-white font-semibold py-3 rounded-xl transition-all text-sm shadow-lg shadow-gr-900/40 hover:opacity-90 active:scale-[0.98] mt-2 disabled:cursor-not-allowed"
            >
              {carregando ? "Entrando..." : "Entrar na plataforma"}
            </button>
          </form>

          <p className="text-center text-slate-700 text-xs mt-10">
            © {new Date().getFullYear()} GR Group · Todos os direitos reservados
          </p>
        </div>

        {/* Espiral de fundo no canto direito inferior */}
        <div className="absolute bottom-0 right-0 opacity-[0.04] pointer-events-none overflow-hidden">
          <Image src="/logo-gr-icon-branco.png" alt="" width={260} height={260} />
        </div>
      </div>
    </div>
  );
}
