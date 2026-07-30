"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]           = useState("");
  const [senha, setSenha]           = useState("");
  const [mostrar, setMostrar]       = useState(false);
  const [erro, setErro]             = useState("");
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
      <div className="relative hidden lg:flex lg:w-[56%] flex-col items-center justify-center p-16 overflow-hidden"
        style={{ background: "linear-gradient(145deg, #1a1438 0%, #0f0c24 40%, #16102e 100%)" }}>

        {/* Ambient gradients — usando cores oficiais GR */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Roxo violeta oficial #4c3d8d */}
          <div className="absolute top-0 left-0 w-[600px] h-[600px] rounded-full opacity-40"
            style={{ background: "radial-gradient(circle, rgba(76,61,141,0.5) 0%, transparent 65%)", transform: "translate(-30%, -30%)" }} />
          {/* Laranja oficial #db824e */}
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full opacity-25"
            style={{ background: "radial-gradient(circle, rgba(219,130,78,0.45) 0%, transparent 65%)", transform: "translate(30%, 30%)" }} />
          {/* Rosa oficial #d1517a */}
          <div className="absolute top-1/2 right-0 w-[350px] h-[350px] rounded-full opacity-15"
            style={{ background: "radial-gradient(circle, rgba(209,81,122,0.4) 0%, transparent 65%)", transform: "translate(20%, -50%)" }} />
          {/* Teal oficial #6ab0a0 */}
          <div className="absolute bottom-1/4 left-1/4 w-[300px] h-[300px] rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, rgba(106,176,160,0.4) 0%, transparent 65%)" }} />
        </div>

        {/* Grid sutil */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />

        {/* Conteúdo */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-md">
          {/* Logo em card com leve glassmorphism */}
          <div className="mb-10 px-8 py-5 rounded-3xl inline-block"
            style={{ background: "rgba(255,255,255,0.92)", boxShadow: "0 8px 40px rgba(76,61,141,0.35), 0 2px 8px rgba(0,0,0,0.3)" }}>
            <Image src="/logo-gr.png" alt="GR Group" width={220} height={64} className="block" priority />
          </div>

          <h1 className="text-4xl font-bold text-white leading-tight tracking-tight mb-4">
            Gestão de Cobrança<br />
            <span style={{ background: "linear-gradient(90deg, #db824e, #9f5697, #516cb1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
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

          {/* Linha separadora com cor brand */}
          <div className="mt-8 flex items-center gap-1 opacity-40">
            {["#db824e","#d1517a","#9f5697","#4c3d8d","#516cb1","#6ab0a0"].map((c) => (
              <div key={c} className="h-0.5 w-6 rounded-full" style={{ background: c }} />
            ))}
          </div>
        </div>

        {/* Watermark fingerprint — centrado, cobre todo o painel */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.09]">
          <Image src="/logo-gr-icon-branco.png" alt="" width={720} height={720} className="object-contain" />
        </div>
      </div>

      {/* ── Painel direito — Formulário ────────────────────────────── */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-8 bg-[#070b14]"
        style={{ borderLeft: "1px solid rgba(76,61,141,0.15)" }}>

        {/* Subtle brand glow top */}
        <div className="absolute top-0 left-0 right-0 h-48 pointer-events-none"
          style={{ background: "linear-gradient(180deg, rgba(76,61,141,0.06) 0%, transparent 100%)" }} />

        {/* Logo mobile */}
        <div className="lg:hidden mb-8">
          <div className="bg-white rounded-2xl p-4 inline-block shadow-xl">
            <Image src="/logo-gr.png" alt="GR Group" width={180} height={52} />
          </div>
        </div>

        <div className="relative z-10 w-full max-w-sm">
          {/* Badge */}
          <div className="flex items-center gap-3 mb-8">
            <div className="relative w-10 h-10 rounded-xl overflow-hidden flex-shrink-0"
              style={{ boxShadow: "0 0 0 1px rgba(76,61,141,0.3)" }}>
              <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(76,61,141,0.25), rgba(40,37,82,0.5))" }} />
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
                className="w-full bg-[#0b0f1c] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none transition-all"
                style={{ border: "1px solid rgba(76,61,141,0.2)" }}
                onFocus={(e) => { e.target.style.borderColor = "rgba(76,61,141,0.55)"; e.target.style.boxShadow = "0 0 0 3px rgba(76,61,141,0.08)"; }}
                onBlur={(e) => { e.target.style.borderColor = "rgba(76,61,141,0.2)"; e.target.style.boxShadow = "none"; }}
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
                  className="w-full bg-[#0b0f1c] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none transition-all pr-10"
                  style={{ border: "1px solid rgba(76,61,141,0.2)" }}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(76,61,141,0.55)"; e.target.style.boxShadow = "0 0 0 3px rgba(76,61,141,0.08)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(76,61,141,0.2)"; e.target.style.boxShadow = "none"; }}
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
              <div className="text-red-400 text-xs rounded-xl px-4 py-3"
                style={{ background: "rgba(209,81,122,0.07)", border: "1px solid rgba(209,81,122,0.2)" }}>
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="w-full disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all text-sm mt-2 active:scale-[0.99]"
              style={{ background: "linear-gradient(135deg, #4c3d8d, #6460e4)", boxShadow: "0 4px 20px rgba(76,61,141,0.35)" }}
            >
              {carregando ? "Entrando..." : "Entrar na plataforma"}
            </button>
          </form>

          <p className="text-center text-slate-700 text-[10px] mt-10 tracking-wide">
            © {new Date().getFullYear()} GR Group · Todos os direitos reservados
          </p>
        </div>

        {/* Watermark fingerprint */}
        <div className="absolute bottom-0 right-0 opacity-[0.04] pointer-events-none overflow-hidden">
          <Image src="/logo-gr-icon.png" alt="" width={220} height={220} />
        </div>
      </div>
    </div>
  );
}
