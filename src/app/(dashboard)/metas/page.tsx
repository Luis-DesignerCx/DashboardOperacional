"use client";

import { useEffect, useState } from "react";
import { Target, Plus, X, CheckCircle2, Loader2, Trash2, TrendingUp, Users, ClipboardCheck } from "lucide-react";

interface Meta {
  id: string;
  nome: string;
  tipo: string;
  percentualAlvo: number | null;
  quantidadeAlvo: number | null;
  valorAlvo: number | null;
  peso: number;
  equipe: { nome: string; tipo: string };
  competencia: { descricao: string };
  consultor: { nome: string } | null;
}

const inputCls = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500 placeholder:text-slate-500";

const TIPO_CONFIG = {
  FINANCEIRA: {
    label: "Financeira",
    icon: TrendingUp,
    cor: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    desc: "% da carteira de inadimplência que o consultor deve receber",
  },
  QUANTIDADE: {
    label: "Quantidade",
    icon: Users,
    cor: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    desc: "Número de clientes que o consultor deve receber no mês",
  },
  MONITORIA: {
    label: "Monitoria",
    icon: ClipboardCheck,
    cor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    desc: "Percentual de qualidade na monitoria (independente da carteira)",
  },
};

const TIPO_EQUIPE_LABEL: Record<string, string> = {
  FLASH: "Flash", CRA_1_30: "1-30 dias", CR_31_90: "31-90 dias",
  CR_PDD_91_180: "PDD 91+", CR_PDD_181: "181+ dias",
};

const FORM_VAZIO = {
  equipeId: "", competenciaId: "", consultorId: "",
  nome: "", tipo: "FINANCEIRA" as "FINANCEIRA" | "QUANTIDADE" | "MONITORIA",
  percentualAlvo: "", quantidadeAlvo: "", peso: "1",
};

export default function MetasPage() {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [competencias, setCompetencias] = useState<any[]>([]);
  const [consultoresDaEquipe, setConsultoresDaEquipe] = useState<any[]>([]);

  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState({ ...FORM_VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  function recarregar() {
    setCarregando(true);
    fetch("/api/metas").then((r) => r.json()).then((d) => { setMetas(Array.isArray(d) ? d : []); setCarregando(false); });
  }

  useEffect(() => {
    recarregar();
    fetch("/api/equipes").then((r) => r.json()).then((d) => {
      const lista = Array.isArray(d) ? d : [];
      setEquipes(lista);
      if (lista.length > 0) setForm((f) => ({ ...f, equipeId: lista[0].id }));
    });
    fetch("/api/competencias").then((r) => r.json()).then((d) => {
      setCompetencias(Array.isArray(d) ? d : []);
      if (Array.isArray(d) && d.length > 0) setForm((f) => ({ ...f, competenciaId: d[0].id }));
    });
  }, []);

  // Carrega consultores quando equipe muda no form
  useEffect(() => {
    if (!form.equipeId) { setConsultoresDaEquipe([]); return; }
    const eq = equipes.find((e) => e.id === form.equipeId);
    if (eq) {
      const consultores = (eq.usuarios ?? []).filter((u: any) => u.perfil === "CONSULTOR");
      setConsultoresDaEquipe(consultores);
    }
  }, [form.equipeId, equipes]);

  function abrirModal() {
    setModalAberto(true);
    setForm((f) => ({ ...FORM_VAZIO, equipeId: equipes[0]?.id ?? "", competenciaId: competencias[0]?.id ?? "" }));
    setErro("");
  }

  async function salvarMeta() {
    setErro("");
    if (!form.equipeId) { setErro("Selecione a equipe"); return; }
    if (!form.competenciaId) { setErro("Selecione a competência"); return; }

    const payload: any = {
      equipeId: form.equipeId,
      competenciaId: form.competenciaId,
      consultorId: form.consultorId || null,
      nome: form.nome,
      tipo: form.tipo,
      peso: parseFloat(form.peso) || 1,
    };

    if (form.tipo === "FINANCEIRA" || form.tipo === "MONITORIA") {
      const pct = parseFloat(form.percentualAlvo.replace(",", "."));
      if (!pct || pct <= 0 || pct > 100) { setErro("Informe um percentual entre 0 e 100"); return; }
      payload.percentualAlvo = pct;
    }
    if (form.tipo === "QUANTIDADE") {
      const qtd = parseInt(form.quantidadeAlvo, 10);
      if (!qtd || qtd <= 0) { setErro("Informe uma quantidade válida"); return; }
      payload.quantidadeAlvo = qtd;
    }

    setSalvando(true);
    const res = await fetch("/api/metas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSalvando(false);
    if (!res.ok) { setErro(data.erro || "Erro ao salvar"); return; }
    setModalAberto(false);
    recarregar();
  }

  async function excluirMeta(id: string) {
    if (!confirm("Excluir esta meta?")) return;
    setExcluindo(id);
    await fetch(`/api/metas?id=${id}`, { method: "DELETE" });
    setExcluindo(null);
    recarregar();
  }

  function renderAlvo(m: Meta) {
    if (m.tipo === "FINANCEIRA") return `${Number(m.percentualAlvo ?? 0).toFixed(1)}% da carteira`;
    if (m.tipo === "QUANTIDADE") return `${m.quantidadeAlvo ?? 0} clientes`;
    if (m.tipo === "MONITORIA") return `${Number(m.percentualAlvo ?? 0).toFixed(1)}%`;
    return "—";
  }

  const tipoCfg = (tipo: string) => TIPO_CONFIG[tipo as keyof typeof TIPO_CONFIG] ?? TIPO_CONFIG.FINANCEIRA;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Metas</h1>
          <p className="text-slate-400 text-sm mt-1">Metas individuais por consultor e competência</p>
        </div>
        <button
          onClick={abrirModal}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={16} /> Nova Meta
        </button>
      </div>

      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : metas.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <Target size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400 font-medium">Nenhuma meta configurada</p>
          <p className="text-slate-600 text-sm mt-1">Crie metas financeiras, de quantidade ou de monitoria por consultor.</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Meta</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Consultor</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Equipe</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Competência</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Alvo</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Peso</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {metas.map((m) => {
                const cfg = tipoCfg(m.tipo);
                const Icon = cfg.icon;
                return (
                  <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{m.nome || "—"}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {m.consultor ? m.consultor.nome : <span className="text-slate-600 text-xs">Equipe toda</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{m.equipe.nome}</td>
                    <td className="px-4 py-3 text-slate-400">{m.competencia.descricao}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${cfg.cor}`}>
                        <Icon size={10} /> {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-white font-semibold tabular-nums">{renderAlvo(m)}</td>
                    <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{Number(m.peso).toFixed(1)}x</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => excluirMeta(m.id)}
                        disabled={excluindo === m.id}
                        className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-40"
                      >
                        {excluindo === m.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal nova meta */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h2 className="text-white font-semibold">Nova Meta</h2>
                <p className="text-slate-500 text-xs mt-0.5">Defina a meta para um consultor nesta competência</p>
              </div>
              <button onClick={() => setModalAberto(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Tipo da meta */}
              <div>
                <label className="block text-xs text-slate-400 mb-2">Tipo de meta *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(TIPO_CONFIG) as Array<keyof typeof TIPO_CONFIG>).map((t) => {
                    const cfg = TIPO_CONFIG[t];
                    const Icon = cfg.icon;
                    const ativo = form.tipo === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, tipo: t, percentualAlvo: "", quantidadeAlvo: "" }))}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all ${
                          ativo ? cfg.cor + " font-medium" : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-400"
                        }`}
                      >
                        <Icon size={16} />
                        <span className="text-xs">{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">{TIPO_CONFIG[form.tipo].desc}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Equipe *</label>
                  <select className={inputCls} value={form.equipeId} onChange={(e) => setForm((f) => ({ ...f, equipeId: e.target.value, consultorId: "" }))}>
                    <option value="">Selecione...</option>
                    {equipes.map((e: any) => (
                      <option key={e.id} value={e.id}>{e.nome} ({TIPO_EQUIPE_LABEL[e.tipo] ?? e.tipo})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Competência *</label>
                  <select className={inputCls} value={form.competenciaId} onChange={(e) => setForm((f) => ({ ...f, competenciaId: e.target.value }))}>
                    {competencias.map((c: any) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Consultor (opcional — deixe em branco para meta da equipe)</label>
                <select className={inputCls} value={form.consultorId} onChange={(e) => setForm((f) => ({ ...f, consultorId: e.target.value }))}>
                  <option value="">Equipe toda</option>
                  {consultoresDaEquipe.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Nome da meta</label>
                <input
                  className={inputCls}
                  placeholder={form.tipo === "FINANCEIRA" ? "Ex: Recebimento julho" : form.tipo === "QUANTIDADE" ? "Ex: Clientes contatados" : "Ex: Monitoria mensal"}
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Alvo — campo varia pelo tipo */}
                <div>
                  {form.tipo === "QUANTIDADE" ? (
                    <>
                      <label className="block text-xs text-slate-400 mb-1.5">Qtd. clientes alvo *</label>
                      <input
                        className={inputCls}
                        type="number"
                        min="1"
                        placeholder="Ex: 15"
                        value={form.quantidadeAlvo}
                        onChange={(e) => setForm((f) => ({ ...f, quantidadeAlvo: e.target.value }))}
                      />
                    </>
                  ) : (
                    <>
                      <label className="block text-xs text-slate-400 mb-1.5">
                        {form.tipo === "FINANCEIRA" ? "% da carteira alvo *" : "% de qualidade alvo *"}
                      </label>
                      <div className="relative">
                        <input
                          className={inputCls + " pr-8"}
                          type="number"
                          min="1"
                          max="100"
                          step="0.1"
                          placeholder="Ex: 25"
                          value={form.percentualAlvo}
                          onChange={(e) => setForm((f) => ({ ...f, percentualAlvo: e.target.value }))}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Peso na comissão *</label>
                  <div className="relative">
                    <input
                      className={inputCls + " pr-8"}
                      type="number"
                      min="0.1"
                      max="10"
                      step="0.1"
                      placeholder="Ex: 1"
                      value={form.peso}
                      onChange={(e) => setForm((f) => ({ ...f, peso: e.target.value }))}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">x</span>
                  </div>
                </div>
              </div>

              {erro && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>}
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={() => setModalAberto(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={salvarMeta}
                disabled={salvando}
                className="flex-1 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 text-white text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {salvando ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : <><CheckCircle2 size={14} /> Criar meta</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
