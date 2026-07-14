"use client";

import { useEffect, useState } from "react";
import { Plus, X, Eye, EyeOff, Trash2, Palmtree, RefreshCw } from "lucide-react";

// ─── Mapeamentos ──────────────────────────────────────────────────────────────

// Nomes exibidos na interface
const NOME_FRENTE: Record<string, string> = {
  FLASH:         "CRA - Flash",
  CRA_1_30:      "CRA - 1 a 30",
  CR_31_90:      "CR - 31 a 90",
  CR_PDD_91_180: "CR PDD - 91+",
};

// Badge de faixa exibido no card
const LABEL_FRENTE: Record<string, string> = {
  FLASH:         "Flash",
  CRA_1_30:      "1 a 30",
  CR_31_90:      "31 a 90",
  CR_PDD_91_180: "91+",
};

const COR_FRENTE: Record<string, string> = {
  FLASH:         "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  CRA_1_30:      "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  CR_31_90:      "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  CR_PDD_91_180: "bg-orange-500/10 text-orange-400 border border-orange-500/20",
};

// Frentes que pertencem a cada departamento
const DEPT: Record<string, string[]> = {
  "CRA - Cobrança": ["FLASH", "CRA_1_30"],
  "CR - Cobrança":  ["CR_31_90", "CR_PDD_91_180"],
};

const COR_DEPT: Record<string, string> = {
  "CRA - Cobrança": "text-sky-300 border-sky-500/20",
  "CR - Cobrança":  "text-amber-300 border-amber-500/20",
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Colaborador {
  id:       string;
  nome:     string;
  perfil:   string;
  emFerias: boolean;
}

interface Frente {
  id:             string;
  nome:           string;
  tipo:           string;
  diasSemContato: number;
  ativa:          boolean;
  usuarios:       Colaborador[];
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function FrentesPage() {
  const [frentes, setFrentes]     = useState<Frente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [competencias, setCompetencias] = useState<{ id: string; descricao: string }[]>([]);
  const [competenciaId, setCompetenciaId] = useState("");
  const [redistribuindo, setRedistribuindo] = useState<string | null>(null);
  const [msgRedistribuir, setMsgRedistribuir] = useState<{ frenteId: string; texto: string } | null>(null);

  // Modal de adicionar colaborador
  const [modal, setModal]       = useState<{ id: string; nome: string } | null>(null);
  const [form, setForm]         = useState({ nome: "", email: "", senha: "", perfil: "CONSULTOR" });
  const [showSenha, setShowSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]         = useState("");

  function carregar() {
    fetch("/api/equipes")
      .then((r) => r.json())
      .then((d) => { setFrentes(Array.isArray(d) ? d : []); setCarregando(false); });
  }

  useEffect(() => {
    carregar();
    fetch("/api/competencias").then((r) => r.json()).then((cs) => {
      if (Array.isArray(cs) && cs[0]) { setCompetencias(cs); setCompetenciaId(cs[0].id); }
    });
  }, []);

  async function redistribuir(frenteId: string) {
    if (!competenciaId) return;
    setRedistribuindo(frenteId);
    setMsgRedistribuir(null);
    const res = await fetch(`/api/equipes/${frenteId}/redistribuir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competenciaId }),
    });
    const data = await res.json();
    setRedistribuindo(null);
    if (res.ok) {
      setMsgRedistribuir({ frenteId, texto: `${data.redistribuidos} contratos redistribuídos entre ${data.consultores} colaboradores` });
      setTimeout(() => setMsgRedistribuir(null), 4000);
    } else {
      setMsgRedistribuir({ frenteId, texto: data.erro ?? "Erro ao redistribuir" });
      setTimeout(() => setMsgRedistribuir(null), 4000);
    }
  }

  function abrirModal(f: Frente) {
    setModal({ id: f.id, nome: f.nome });
    setForm({ nome: "", email: "", senha: "", perfil: "CONSULTOR" });
    setErro("");
    setShowSenha(false);
  }

  async function adicionarColaborador(e: React.FormEvent) {
    e.preventDefault();
    if (!modal) return;
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch(`/api/equipes/${modal.id}/usuarios`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.erro ?? "Erro ao salvar"); return; }
      setModal(null);
      carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function toggleFerias(frenteId: string, usuarioId: string, emFerias: boolean) {
    await fetch(`/api/equipes/${frenteId}/usuarios`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ usuarioId, emFerias: !emFerias }),
    });
    carregar();
  }

  async function removerColaborador(frenteId: string, usuarioId: string) {
    if (!confirm("Remover colaborador desta frente?")) return;
    await fetch(`/api/equipes/${frenteId}/usuarios`, {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ usuarioId }),
    });
    carregar();
  }

  if (carregando) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Frentes de Atendimento</h1>
          <p className="text-slate-400 text-sm mt-1">
            Estrutura de frentes por faixa de inadimplência — CRA e CR
          </p>
        </div>
        {competencias.length > 0 && (
          <select
            value={competenciaId}
            onChange={(e) => setCompetenciaId(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
          >
            {competencias.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
          </select>
        )}
      </div>

      {/* Grupos por departamento */}
      {Object.entries(DEPT).map(([dept, tipos]) => {
        // Mantém a ordem definida no array de tipos (31–90 → 91–180 → 181+)
        const frentesDept = tipos
          .map((tipo) => frentes.find((f) => f.tipo === tipo))
          .filter(Boolean) as Frente[];
        if (!frentesDept.length) return null;

        return (
          <div key={dept} className="space-y-3">
            {/* Cabeçalho do departamento */}
            <div className={`flex items-center gap-3 pb-2 border-b border-slate-800`}>
              <span className={`text-sm font-semibold ${COR_DEPT[dept].split(" ")[0]}`}>
                {dept}
              </span>
              <span className="text-slate-400 text-xs">
                {frentesDept.reduce((s, f) => s + f.usuarios.filter(u => u.perfil === "CONSULTOR").length, 0)} colaboradores
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {frentesDept.map((f) => {
                const consultores = f.usuarios.filter((u) => u.perfil === "CONSULTOR");
                const gestores    = f.usuarios.filter((u) => u.perfil === "GESTOR");

                return (
                  <div
                    key={f.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 flex flex-col"
                  >
                    {/* Cabeçalho da frente */}
                    <div className="flex items-start justify-between">
                      <div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${COR_FRENTE[f.tipo] ?? "bg-slate-700 text-slate-300"}`}>
                          {LABEL_FRENTE[f.tipo] ?? f.tipo}
                        </span>
                        <h2 className="text-white font-semibold mt-2 text-sm">{NOME_FRENTE[f.tipo] ?? f.nome}</h2>
                      </div>
                      <div
                        className={`w-2.5 h-2.5 rounded-full mt-1 ${f.ativa ? "bg-emerald-400" : "bg-slate-600"}`}
                        title={f.ativa ? "Ativa" : "Inativa"}
                      />
                    </div>

                    {/* Métricas */}
                    <div className="flex items-center gap-4 text-sm">
                      <div>
                        <p className="text-slate-500 text-xs">Colaboradores</p>
                        <p className="text-white font-semibold">{consultores.length}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Gestores</p>
                        <p className="text-white font-semibold">{gestores.length}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Alerta sem contato</p>
                        <p className="text-white font-semibold">{f.diasSemContato}d</p>
                      </div>
                    </div>

                    {/* Lista de colaboradores */}
                    <div className="flex-1 space-y-1.5 min-h-[40px]">
                      {consultores.length === 0 && (
                        <p className="text-slate-400 text-xs">Nenhum colaborador cadastrado</p>
                      )}
                      {consultores.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between group py-0.5"
                        >
                          <div className="flex items-center gap-2">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${u.emFerias ? "bg-amber-500/20" : "bg-gr-500/20"}`}>
                              <span className={`text-[10px] font-bold ${u.emFerias ? "text-amber-400" : "text-gr-400"}`}>
                                {u.nome.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className={`text-xs ${u.emFerias ? "text-amber-400/70 line-through" : "text-slate-300"}`}>
                              {u.nome}
                            </span>
                            {u.emFerias && (
                              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                                férias
                              </span>
                            )}
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
                            <button
                              onClick={() => toggleFerias(f.id, u.id, u.emFerias)}
                              title={u.emFerias ? "Retornar de férias" : "Colocar em férias"}
                              className={`p-1 rounded transition-colors ${u.emFerias ? "text-amber-400 hover:text-amber-300" : "text-slate-400 hover:text-amber-400"}`}
                            >
                              <Palmtree size={12} />
                            </button>
                            <button
                              onClick={() => removerColaborador(f.id, u.id)}
                              className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                              title="Remover"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Mensagem redistribuição */}
                    {msgRedistribuir?.frenteId === f.id && (
                      <p className="text-xs text-center text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg py-1.5 px-2">
                        {msgRedistribuir.texto}
                      </p>
                    )}

                    {/* Botões de ação */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => abrirModal(f)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-slate-700 text-slate-500 hover:border-gr-500/40 hover:text-gr-400 transition-all text-xs"
                      >
                        <Plus size={13} />
                        Adicionar
                      </button>
                      <button
                        onClick={() => redistribuir(f.id)}
                        disabled={redistribuindo === f.id || consultores.length === 0}
                        title="Redistribuir carteira entre os colaboradores desta frente"
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-700 text-slate-500 hover:border-amber-500/40 hover:text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-xs"
                      >
                        <RefreshCw size={13} className={redistribuindo === f.id ? "animate-spin" : ""} />
                        {redistribuindo === f.id ? "..." : "Redistribuir"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Modal adicionar colaborador */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            {/* Header modal */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-white font-semibold">Novo colaborador</h2>
                <p className="text-slate-400 text-xs mt-0.5">{modal.nome}</p>
              </div>
              <button
                onClick={() => setModal(null)}
                className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={adicionarColaborador} className="space-y-4">
              {/* Nome */}
              <div>
                <label className="text-slate-400 text-xs mb-1.5 block">Nome completo</label>
                <input
                  type="text"
                  placeholder="Ex: João Silva"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gr-500"
                />
              </div>

              {/* E-mail */}
              <div>
                <label className="text-slate-400 text-xs mb-1.5 block">E-mail</label>
                <input
                  type="email"
                  placeholder="colaborador@empresa.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gr-500"
                />
              </div>

              {/* Senha */}
              <div>
                <label className="text-slate-400 text-xs mb-1.5 block">Senha inicial</label>
                <div className="relative">
                  <input
                    type={showSenha ? "text" : "password"}
                    placeholder="Mínimo 6 caracteres"
                    value={form.senha}
                    onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
                    minLength={6}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 pr-10 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gr-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenha((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showSenha ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Perfil */}
              <div>
                <label className="text-slate-400 text-xs mb-1.5 block">Perfil</label>
                <select
                  value={form.perfil}
                  onChange={(e) => setForm((f) => ({ ...f, perfil: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
                >
                  <option value="CONSULTOR">Colaborador (Consultor)</option>
                  <option value="GESTOR">Gestor</option>
                </select>
              </div>

              {erro && (
                <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {erro}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-400 text-sm hover:text-white hover:border-slate-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 py-2.5 rounded-xl bg-gr-500 text-white text-sm font-medium hover:bg-gr-600 disabled:opacity-50 transition-colors"
                >
                  {salvando ? "Salvando..." : "Adicionar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
