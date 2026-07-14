"use client";

import { useEffect, useState } from "react";
import { Target, Plus, X, CheckCircle2, Loader2, Trash2, TrendingUp, Users, ClipboardCheck, Pencil, Percent } from "lucide-react";
import { formatarMoeda } from "@/lib/utils";

interface Meta {
  id: string;
  nome: string;
  tipo: string;
  percentualAlvo: number | null;
  quantidadeAlvo: number | null;
  valorAlvo: number | null;
  peso: number;
  thresholdsMonitoria: Record<string, number> | null;
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
    desc: "Valor em R$ que a equipe deve receber no mês",
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
    desc: "Nota de qualidade — cada faixa tem uma nota mínima configurável",
  },
};

const FAIXAS_THRESH = [70, 80, 90, 100, 110, 120, 130, 140, 150, 160];

const DEFAULT_THRESHOLDS: Record<string, number> = {
  "70": 74, "80": 76, "90": 78, "100": 80,
  "110": 82, "120": 83, "130": 85, "140": 86,
  "150": 88, "160": 89,
};

const TIPO_EQUIPE_LABEL: Record<string, string> = {
  FLASH: "CRA - Flash", CRA_1_30: "CRA - 1 a 30", CR_31_90: "CR - 31 a 90",
  CR_PDD_91_180: "CR PDD - 91+",
};

const FORM_VAZIO = {
  equipeId: "", competenciaId: "", consultorId: "",
  nome: "", tipo: "FINANCEIRA" as "FINANCEIRA" | "QUANTIDADE" | "MONITORIA",
  modoAlvo: "VALOR" as "VALOR" | "PERCENTUAL",
  valorAlvo: "", percentualAlvo: "", quantidadeAlvo: "",
  peso: "100",
};

export default function MetasPage() {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [competencias, setCompetencias] = useState<any[]>([]);
  const [consultoresDaEquipe, setConsultoresDaEquipe] = useState<any[]>([]);

  const [modalAberto, setModalAberto] = useState(false);
  const [editandoMeta, setEditandoMeta] = useState<Meta | null>(null);
  const [form, setForm] = useState({ ...FORM_VAZIO });
  const [thresholds, setThresholds] = useState<Record<string, number>>({ ...DEFAULT_THRESHOLDS });
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [totalInadimplencia, setTotalInadimplencia] = useState<number | null>(null);

  function recarregar() {
    setCarregando(true);
    fetch("/api/metas").then((r) => r.json()).then((d) => { setMetas(Array.isArray(d) ? d : []); setCarregando(false); });
  }

  useEffect(() => {
    recarregar();
    fetch("/api/equipes").then((r) => r.json()).then((d) => {
      setEquipes(Array.isArray(d) ? d : []);
      if (lista.length > 0) setForm((f) => ({ ...f, equipeId: lista[0].id }));
    });
    fetch("/api/competencias").then((r) => r.json()).then((d) => {
      setCompetencias(Array.isArray(d) ? d : []);
      if (Array.isArray(d) && d.length > 0) setForm((f) => ({ ...f, competenciaId: d[0].id }));
    });
  }, []);

  useEffect(() => {
    if (!form.equipeId) { setConsultoresDaEquipe([]); return; }
    const eq = equipes.find((e) => e.id === form.equipeId);
    if (eq) {
      const consultores = (eq.usuarios ?? []).filter((u: any) => u.perfil === "CONSULTOR");
      setConsultoresDaEquipe(consultores);
    }
  }, [form.equipeId, equipes]);

  useEffect(() => {
    if (form.tipo !== "FINANCEIRA" || form.modoAlvo !== "PERCENTUAL") return;
    if (!form.equipeId || !form.competenciaId) { setTotalInadimplencia(null); return; }
    const params = new URLSearchParams({ equipeId: form.equipeId, competenciaId: form.competenciaId });
    if (form.consultorId) params.set("consultorId", form.consultorId);
    fetch(`/api/metas/totais?${params}`)
      .then((r) => r.json())
      .then((d) => setTotalInadimplencia(d.totalInadimplencia ?? null));
  }, [form.equipeId, form.competenciaId, form.consultorId, form.tipo, form.modoAlvo]);

  function abrirModal() {
    setEditandoMeta(null);
    setModalAberto(true);
    setForm({ ...FORM_VAZIO, equipeId: equipes[0]?.id ?? "", competenciaId: competencias[0]?.id ?? "" });
    setThresholds({ ...DEFAULT_THRESHOLDS });
    setTotalInadimplencia(null);
    setErro("");
  }

  function abrirEdicao(m: Meta) {
    setEditandoMeta(m);
    setModalAberto(true);
    const temPercentual = m.percentualAlvo != null;
    setForm({
      equipeId: "", competenciaId: "", consultorId: "",
      nome: m.nome ?? "",
      tipo: m.tipo as "FINANCEIRA" | "QUANTIDADE" | "MONITORIA",
      modoAlvo: temPercentual ? "PERCENTUAL" : "VALOR",
      valorAlvo: m.valorAlvo != null ? String(Number(m.valorAlvo)) : "",
      percentualAlvo: m.percentualAlvo != null ? String(Number(m.percentualAlvo)) : "",
      quantidadeAlvo: m.quantidadeAlvo != null ? String(m.quantidadeAlvo) : "",
      peso: String(Math.round(Number(m.peso ?? 1) * 100)),
    });
    setThresholds(m.thresholdsMonitoria ? { ...m.thresholdsMonitoria } : { ...DEFAULT_THRESHOLDS });
    setTotalInadimplencia(null);
    setErro("");
  }

  async function salvarMeta() {
    setErro("");

    if (!editandoMeta) {
      if (!form.equipeId) { setErro("Selecione a equipe"); return; }
      if (!form.competenciaId) { setErro("Selecione a competência"); return; }
    }

    const pesoDecimal = (parseFloat(form.peso) || 100) / 100;

    const payload: any = {
      nome: form.nome,
      tipo: form.tipo,
      peso: pesoDecimal,
    };

    if (!editandoMeta) {
      payload.equipeId = form.equipeId;
      payload.competenciaId = form.competenciaId;
      payload.consultorId = form.consultorId || null;
    }

    if (form.tipo === "FINANCEIRA") {
      if (form.modoAlvo === "PERCENTUAL") {
        const pct = parseFloat(form.percentualAlvo.replace(",", ".") || "0");
        if (!pct || pct <= 0) { setErro("Informe o percentual alvo"); return; }
        payload.percentualAlvo = pct;
        if (totalInadimplencia != null && totalInadimplencia > 0) {
          payload.valorAlvo = parseFloat(((pct / 100) * totalInadimplencia).toFixed(2));
        }
      } else {
        const v = parseFloat(form.valorAlvo.replace(",", ".") || "0");
        if (!v || v <= 0) { setErro("Informe o valor alvo em R$"); return; }
        payload.valorAlvo = v;
        payload.percentualAlvo = null;
      }
    } else if (form.tipo === "MONITORIA") {
      payload.thresholdsMonitoria = thresholds;
    } else if (form.tipo === "QUANTIDADE") {
      const qtd = parseInt(form.quantidadeAlvo, 10);
      if (!qtd || qtd <= 0) { setErro("Informe uma quantidade válida"); return; }
      payload.quantidadeAlvo = qtd;
    }

    setSalvando(true);
    const res = editandoMeta
      ? await fetch("/api/metas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editandoMeta.id, ...payload }),
        })
      : await fetch("/api/metas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    const data = await res.json();
    setSalvando(false);
    if (!res.ok) { setErro(data.erro || "Erro ao salvar"); return; }
    setModalAberto(false);
    setEditandoMeta(null);
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
    if (m.tipo === "FINANCEIRA") {
      if (m.percentualAlvo != null) {
        return (
          <span className="flex flex-col items-end gap-0.5">
            <span>{Number(m.percentualAlvo).toFixed(1)}% da inadimplência</span>
            {m.valorAlvo && <span className="text-xs text-slate-400 font-normal">{formatarMoeda(Number(m.valorAlvo))}</span>}
          </span>
        );
      }
      return m.valorAlvo ? formatarMoeda(Number(m.valorAlvo)) : "—";
    }
    if (m.tipo === "QUANTIDADE") return `${m.quantidadeAlvo ?? 0} clientes`;
    if (m.tipo === "MONITORIA") {
      const notaBase = m.thresholdsMonitoria?.["100"];
      return notaBase != null ? `Nota ≥ ${notaBase} → 100%` : "Monitoria";
    }
    return "—";
  }

  const tipoCfg = (tipo: string) => TIPO_CONFIG[tipo as keyof typeof TIPO_CONFIG] ?? TIPO_CONFIG.FINANCEIRA;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Metas</h1>
          <p className="text-slate-400 text-sm mt-1">Metas por frente e competência</p>
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
          <Target size={40} className="mx-auto mb-3 text-slate-400" />
          <p className="text-slate-400 font-medium">Nenhuma meta configurada</p>
          <p className="text-slate-400 text-sm mt-1">Crie metas financeiras, de quantidade ou de monitoria.</p>
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
                      {m.consultor ? m.consultor.nome : <span className="text-slate-400 text-xs">Equipe toda</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{m.equipe.nome}</td>
                    <td className="px-4 py-3 text-slate-400">{m.competencia.descricao}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${cfg.cor}`}>
                        <Icon size={10} /> {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-white font-semibold tabular-nums">{renderAlvo(m)}</td>
                    <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                      {Math.round(Number(m.peso) * 100)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => abrirEdicao(m)}
                          className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => excluirMeta(m.id)}
                          disabled={excluindo === m.id}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {excluindo === m.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
              <div>
                <h2 className="text-white font-semibold">{editandoMeta ? "Editar Meta" : "Nova Meta"}</h2>
                <p className="text-slate-500 text-xs mt-0.5">
                  {editandoMeta
                    ? `${editandoMeta.nome || "Meta"} · ${editandoMeta.consultor?.nome ?? "Equipe toda"}`
                    : "Defina a meta para a frente nesta competência"}
                </p>
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
                        onClick={() => {
                          setForm((f) => ({ ...f, tipo: t, valorAlvo: "", quantidadeAlvo: "", modoAlvo: "VALOR", percentualAlvo: "" }));
                          if (t === "MONITORIA" && !editandoMeta) setThresholds({ ...DEFAULT_THRESHOLDS });
                        }}
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

              {/* Equipe / Competência / Consultor — apenas no modo criação */}
              {!editandoMeta && (
                <>
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
                    <label className="block text-xs text-slate-400 mb-1.5">Consultor (opcional)</label>
                    <select className={inputCls} value={form.consultorId} onChange={(e) => setForm((f) => ({ ...f, consultorId: e.target.value }))}>
                      <option value="">Equipe toda</option>
                      {consultoresDaEquipe.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

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
                {/* Alvo */}
                <div>
                  {form.tipo === "FINANCEIRA" && (
                    <>
                      {/* Toggle R$ / % */}
                      <div className="flex gap-1 mb-2">
                        {(["VALOR", "PERCENTUAL"] as const).map((modo) => (
                          <button
                            key={modo}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, modoAlvo: modo }))}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors border ${
                              form.modoAlvo === modo
                                ? "bg-sky-500/20 border-sky-500/40 text-sky-300"
                                : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                            }`}
                          >
                            {modo === "VALOR" ? "R$ fixo" : <><Percent size={10} /> % da inadimplência</>}
                          </button>
                        ))}
                      </div>

                      {form.modoAlvo === "VALOR" ? (
                        <>
                          <label className="block text-xs text-slate-400 mb-1.5">Valor alvo (R$) *</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                            <input
                              className={inputCls + " pl-9"}
                              type="number"
                              min="1"
                              step="0.01"
                              placeholder="0,00"
                              value={form.valorAlvo}
                              onChange={(e) => setForm((f) => ({ ...f, valorAlvo: e.target.value }))}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <label className="block text-xs text-slate-400 mb-1.5">Percentual alvo *</label>
                          <div className="relative">
                            <input
                              className={inputCls + " pr-8"}
                              type="number"
                              min="0.1"
                              max="100"
                              step="0.1"
                              placeholder="Ex: 15"
                              value={form.percentualAlvo}
                              onChange={(e) => setForm((f) => ({ ...f, percentualAlvo: e.target.value }))}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                          </div>
                          {totalInadimplencia != null && (
                            <p className="text-xs text-slate-400 mt-1.5">
                              Base da equipe:{" "}
                              <span className="text-white font-medium">{formatarMoeda(totalInadimplencia)}</span>
                              {form.percentualAlvo && (
                                <span className="text-sky-400 ml-1">
                                  → Alvo: {formatarMoeda((parseFloat(form.percentualAlvo) / 100) * totalInadimplencia)}
                                </span>
                              )}
                            </p>
                          )}
                          {totalInadimplencia == null && form.equipeId && form.competenciaId && (
                            <p className="text-xs text-slate-500 mt-1">Carregando base da equipe...</p>
                          )}
                        </>
                      )}
                    </>
                  )}
                  {form.tipo === "QUANTIDADE" && (
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
                  )}
                  {form.tipo === "MONITORIA" && (
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1.5">Notas mínimas por faixa</label>
                      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-700">
                              <th className="text-left px-3 py-2 text-slate-400">Faixa</th>
                              <th className="text-right px-3 py-2 text-slate-400">Nota mínima</th>
                            </tr>
                          </thead>
                          <tbody>
                            {FAIXAS_THRESH.map((f) => (
                              <tr key={f} className="border-b border-slate-700/50 last:border-0">
                                <td className="px-3 py-1.5 text-slate-300 font-medium">{f}%</td>
                                <td className="px-3 py-1.5 text-right">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={thresholds[String(f)] ?? ""}
                                    onChange={(e) => setThresholds((t) => ({ ...t, [String(f)]: parseFloat(e.target.value) || 0 }))}
                                    className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-right focus:outline-none focus:ring-1 focus:ring-sky-500"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {form.tipo !== "MONITORIA" && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Peso na comissão (%)*</label>
                    <div className="relative">
                      <input
                        className={inputCls + " pr-8"}
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        placeholder="Ex: 90"
                        value={form.peso}
                        onChange={(e) => setForm((f) => ({ ...f, peso: e.target.value }))}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                    </div>
                  </div>
                )}
              </div>

              {form.tipo === "MONITORIA" && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Peso na comissão (%)*</label>
                  <div className="relative">
                    <input
                      className={inputCls + " pr-8"}
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      placeholder="Ex: 10"
                      value={form.peso}
                      onChange={(e) => setForm((f) => ({ ...f, peso: e.target.value }))}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                  </div>
                </div>
              )}

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
                {salvando ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : <><CheckCircle2 size={14} /> {editandoMeta ? "Salvar alterações" : "Criar meta"}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
