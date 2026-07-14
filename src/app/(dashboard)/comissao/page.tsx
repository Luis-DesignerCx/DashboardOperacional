"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { formatarMoeda } from "@/lib/utils";
import {
  DollarSign, TrendingUp, Calculator, Pencil, Check, X,
  AlertCircle, ChevronDown, ChevronUp, Loader2, Save,
} from "lucide-react";

// ─── tipos ─────────────────────────────────────────────────
interface MetaItem {
  id: string;
  nome: string;
  tipo: string;
  peso: number;
  valorAlvo: number | null;
  thresholdsMonitoria: Record<string, number> | null;
}

interface MetaBreakdown {
  metaId: string;
  nome: string;
  tipo: string;
  peso: number;
  valorBase: number;
  atingimento: number;
  multiplicador: number;
  contribuicao: number;
  realizado: number | null;
  alvo: number | null;
}

interface ConsultorResult {
  id: string;
  nome: string;
  totalRecebido: number;
  totalComissao: number;
  comissaoBase: number;
  breakdown: MetaBreakdown[];
  recebido: number;
  percentualMeta: number;
  faixaAplicada: number;
  valorFinal: number;
}

// ─── helpers visuais ───────────────────────────────────────
function faixaCor(pct: number) {
  if (pct < 70) return "text-slate-500";
  if (pct < 80) return "text-orange-400";
  if (pct < 90) return "text-amber-400";
  if (pct < 100) return "text-yellow-400";
  return "text-emerald-400";
}
function faixaBarCor(pct: number) {
  if (pct < 70) return "bg-slate-600";
  if (pct < 80) return "bg-orange-500";
  if (pct < 90) return "bg-amber-500";
  if (pct < 100) return "bg-yellow-500";
  return "bg-emerald-500";
}

const inputCls = "bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500 placeholder:text-slate-500";

// ─────────────────────────────────────────────────────────
// GESTOR VIEW
// ─────────────────────────────────────────────────────────
function GestorComissao({ equipeId }: { equipeId: string }) {
  const [competencias, setCompetencias] = useState<any[]>([]);
  const [competenciaId, setCompetenciaId] = useState("");

  const [comissaoBase, setComissaoBase] = useState<number>(0);
  const [editandoBase, setEditandoBase] = useState(false);
  const [novoBase, setNovoBase] = useState("");
  const [salvandoBase, setSalvandoBase] = useState(false);

  const [metas, setMetas] = useState<MetaItem[]>([]);
  const [consultores, setConsultores] = useState<ConsultorResult[]>([]);
  const [notasMonitoria, setNotasMonitoria] = useState<Record<string, Record<string, string>>>({}); // metaId -> consultorId -> nota
  const [salvandoNotas, setSalvandoNotas] = useState(false);

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [erroCalc, setErroCalc] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    fetch("/api/competencias").then((r) => r.json()).then((cs) => {
      if (Array.isArray(cs)) {
        setCompetencias(cs);
        if (cs[0]) setCompetenciaId(cs[0].id);
      }
    });
  }, []);

  const carregarDados = useCallback(async (cId: string) => {
    if (!cId || !equipeId) return;
    setCarregando(true);
    setErroCalc("");
    setSucesso("");

    const [equipeRes, metasRes, prevRes] = await Promise.all([
      fetch(`/api/equipes/${equipeId}`).then((r) => r.json()),
      fetch(`/api/metas?competenciaId=${cId}&equipeId=${equipeId}`).then((r) => r.json()),
      fetch(`/api/comissao/preview?competenciaId=${cId}&equipeId=${equipeId}`).then((r) => r.json()),
    ]);

    const base = Number(equipeRes?.comissaoBase ?? 0);
    setComissaoBase(base);

    const metaLista: MetaItem[] = Array.isArray(metasRes) ? metasRes.map((m: any) => ({
      id: m.id,
      nome: m.nome,
      tipo: m.tipo,
      peso: Number(m.peso),
      valorAlvo: m.valorAlvo ? Number(m.valorAlvo) : null,
      thresholdsMonitoria: m.thresholdsMonitoria ?? null,
    })) : [];
    setMetas(metaLista);

    const cons: ConsultorResult[] = Array.isArray(prevRes) ? prevRes : [];
    setConsultores(cons);

    // Inicializa notas de monitoria a partir do breakdown
    const notas: Record<string, Record<string, string>> = {};
    for (const meta of metaLista) {
      if (meta.tipo !== "MONITORIA") continue;
      notas[meta.id] = {};
      for (const c of cons) {
        const bd = c.breakdown?.find((b) => b.metaId === meta.id);
        notas[meta.id][c.id] = bd?.realizado != null ? String(bd.realizado) : "";
      }
    }
    setNotasMonitoria(notas);

    // Expande todos os consultores por padrão
    setExpandidos(new Set(cons.map((c) => c.id)));
    setCarregando(false);
  }, [equipeId]);

  useEffect(() => {
    if (competenciaId) carregarDados(competenciaId);
  }, [competenciaId, carregarDados]);

  async function salvarBase() {
    const v = parseFloat(novoBase.replace(",", ".") || "0");
    if (!v || v <= 0) return;
    setSalvandoBase(true);
    const res = await fetch(`/api/equipes/${equipeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comissaoBase: v }),
    });
    setSalvandoBase(false);
    if (res.ok) {
      setEditandoBase(false);
      setComissaoBase(v);
    }
  }

  async function salvarNotas() {
    const metasMonitoria = metas.filter((m) => m.tipo === "MONITORIA");
    if (metasMonitoria.length === 0) return;
    setSalvandoNotas(true);
    setErroCalc("");
    setSucesso("");

    for (const meta of metasMonitoria) {
      const notas = notasMonitoria[meta.id] ?? {};
      const resultadosConsultores: Record<string, number> = {};
      for (const [cId, nota] of Object.entries(notas)) {
        const n = parseFloat(nota);
        if (!isNaN(n)) resultadosConsultores[cId] = n;
      }
      await fetch("/api/metas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: meta.id, resultadosConsultores }),
      });
    }

    setSalvandoNotas(false);
    setSucesso("Notas salvas!");
    carregarDados(competenciaId);
  }

  async function calcular() {
    setCalculando(true);
    setErroCalc("");
    setSucesso("");
    const res = await fetch("/api/comissao/calcular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipeId, competenciaId }),
    });
    setCalculando(false);
    if (res.ok) {
      setSucesso("Comissões registradas com sucesso!");
      carregarDados(competenciaId);
    } else {
      const d = await res.json();
      setErroCalc(d.erro || "Erro ao calcular");
    }
  }

  function toggleExpand(id: string) {
    setExpandidos((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const temMonitoria = metas.some((m) => m.tipo === "MONITORIA");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Comissão</h1>
          <p className="text-slate-400 text-sm mt-1">Gerencie metas e comissões da sua equipe</p>
        </div>
        <select
          value={competenciaId}
          onChange={(e) => setCompetenciaId(e.target.value)}
          className={inputCls}
        >
          {competencias.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
        </select>
      </div>

      {/* Configuração: base + metas */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">Configuração da Comissão</h2>

        {/* Valor base */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-[10px] text-slate-500 mb-1">Valor Base (100%)</p>
            {editandoBase ? (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                  <input
                    type="number"
                    value={novoBase}
                    onChange={(e) => setNovoBase(e.target.value)}
                    placeholder="1580"
                    className="bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500 w-40"
                    autoFocus
                  />
                </div>
                <button
                  onClick={salvarBase}
                  disabled={salvandoBase}
                  className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/20 transition-colors"
                >
                  {salvandoBase ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                </button>
                <button onClick={() => setEditandoBase(false)} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {comissaoBase > 0 ? (
                  <p className="text-xl font-bold text-white tabular-nums">{formatarMoeda(comissaoBase)}</p>
                ) : (
                  <div className="flex items-center gap-1.5 text-amber-400 text-sm">
                    <AlertCircle size={14} /> Não configurado
                  </div>
                )}
                <button
                  onClick={() => { setEditandoBase(true); setNovoBase(comissaoBase > 0 ? String(comissaoBase) : ""); }}
                  className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <Pencil size={12} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabela de metas */}
        {metas.length > 0 && (
          <div className="border border-slate-700 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800/60 border-b border-slate-700">
                  <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Indicador</th>
                  <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Tipo</th>
                  <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Peso</th>
                  <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Bônus 100%</th>
                  <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Alvo</th>
                </tr>
              </thead>
              <tbody>
                {metas.map((m) => {
                  const valorBase = comissaoBase * m.peso;
                  return (
                    <tr key={m.id} className="border-b border-slate-700/50 last:border-0">
                      <td className="px-3 py-2.5 text-white font-medium">{m.nome}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          m.tipo === "FINANCEIRA" ? "bg-sky-500/15 text-sky-300" :
                          m.tipo === "MONITORIA" ? "bg-emerald-500/15 text-emerald-300" :
                          "bg-purple-500/15 text-purple-300"
                        }`}>
                          {m.tipo === "FINANCEIRA" ? "Financeira" : m.tipo === "MONITORIA" ? "Monitoria" : "Quantidade"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-300 tabular-nums">{Math.round(m.peso * 100)}%</td>
                      <td className="px-3 py-2.5 text-right text-emerald-400 font-semibold tabular-nums">{formatarMoeda(valorBase)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-400 tabular-nums">
                        {m.tipo === "FINANCEIRA" && m.valorAlvo ? formatarMoeda(m.valorAlvo) :
                         m.tipo === "MONITORIA" && m.thresholdsMonitoria ? `Nota ≥ ${m.thresholdsMonitoria["100"] ?? "?"} → 100%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {metas.length === 0 && !carregando && (
          <p className="text-slate-500 text-xs">Nenhuma meta configurada para esta competência. Acesse a página de Metas para criar.</p>
        )}
      </div>

      {/* Consultores */}
      {carregando ? (
        <div className="flex justify-center py-10">
          <div className="w-7 h-7 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : consultores.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-white">Consultores</h2>
          {consultores.map((c) => {
            const exp = expandidos.has(c.id);
            return (
              <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                {/* Row header */}
                <button
                  onClick={() => toggleExpand(c.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {exp ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                    <p className="text-white font-medium text-sm">{c.nome}</p>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-[10px] text-slate-500">Recebido</p>
                      <p className="text-white text-sm font-semibold tabular-nums">{formatarMoeda(c.totalRecebido)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Comissão Est.</p>
                      <p className="text-emerald-400 text-sm font-bold tabular-nums">{formatarMoeda(c.totalComissao)}</p>
                    </div>
                  </div>
                </button>

                {/* Breakdown expandido */}
                {exp && (
                  <div className="border-t border-slate-800">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-800/40 border-b border-slate-800">
                          <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Indicador</th>
                          <th className="text-right px-4 py-2.5 text-slate-400 font-medium">Peso</th>
                          <th className="text-right px-4 py-2.5 text-slate-400 font-medium">Base</th>
                          <th className="text-right px-4 py-2.5 text-slate-400 font-medium">Realizado</th>
                          <th className="text-right px-4 py-2.5 text-slate-400 font-medium">Atingimento</th>
                          <th className="text-right px-4 py-2.5 text-slate-400 font-medium">Faixa</th>
                          <th className="text-right px-4 py-2.5 text-slate-400 font-medium">Comissão</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(c.breakdown ?? []).map((bd) => (
                          <tr key={bd.metaId} className="border-b border-slate-800/50 last:border-0">
                            <td className="px-4 py-3 text-white font-medium">{bd.nome}</td>
                            <td className="px-4 py-3 text-right text-slate-400 tabular-nums">{Math.round(bd.peso * 100)}%</td>
                            <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{formatarMoeda(bd.valorBase)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {bd.tipo === "MONITORIA" ? (
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.1"
                                  value={notasMonitoria[bd.metaId]?.[c.id] ?? ""}
                                  onChange={(e) =>
                                    setNotasMonitoria((prev) => ({
                                      ...prev,
                                      [bd.metaId]: { ...(prev[bd.metaId] ?? {}), [c.id]: e.target.value },
                                    }))
                                  }
                                  className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-right focus:outline-none focus:ring-1 focus:ring-sky-500"
                                  placeholder="nota"
                                />
                              ) : (
                                <span className="text-slate-300">
                                  {bd.realizado != null ? formatarMoeda(bd.realizado) : "—"}
                                </span>
                              )}
                            </td>
                            <td className={`px-4 py-3 text-right font-semibold tabular-nums ${faixaCor(bd.atingimento)}`}>
                              {bd.atingimento > 0 ? `${bd.atingimento.toFixed(1)}%` : "—"}
                            </td>
                            <td className={`px-4 py-3 text-right font-semibold tabular-nums ${faixaCor(bd.atingimento)}`}>
                              {bd.multiplicador}%
                            </td>
                            <td className="px-4 py-3 text-right text-emerald-400 font-bold tabular-nums">
                              {formatarMoeda(bd.contribuicao)}
                            </td>
                          </tr>
                        ))}
                        {/* Total */}
                        <tr className="bg-slate-800/30">
                          <td colSpan={6} className="px-4 py-3 text-right text-slate-400 font-medium">Total</td>
                          <td className="px-4 py-3 text-right text-emerald-400 font-bold tabular-nums">{formatarMoeda(c.totalComissao)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        !carregando && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
            <p className="text-slate-500 text-sm">Nenhum consultor ativo nesta equipe</p>
          </div>
        )
      )}

      {/* Ações */}
      <div className="flex items-center gap-3 flex-wrap">
        {temMonitoria && (
          <button
            onClick={salvarNotas}
            disabled={salvandoNotas}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700/40 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            {salvandoNotas ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar Notas de Monitoria
          </button>
        )}
        <button
          onClick={calcular}
          disabled={calculando || comissaoBase <= 0 || metas.length === 0}
          className="flex items-center gap-2 bg-gr-500 hover:bg-gr-400 disabled:bg-gr-500/30 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
        >
          <Calculator size={14} />
          {calculando ? "Calculando..." : "Calcular e Registrar Comissões"}
        </button>
        {comissaoBase <= 0 && <p className="text-amber-400 text-xs">Configure o valor base antes de calcular</p>}
        {erroCalc && <p className="text-red-400 text-xs">{erroCalc}</p>}
        {sucesso && <p className="text-emerald-400 text-xs">{sucesso}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// CONSULTOR VIEW
// ─────────────────────────────────────────────────────────
function ConsultorComissao({ consultorId }: { consultorId: string }) {
  const [competencias, setCompetencias] = useState<any[]>([]);
  const [competenciaId, setCompetenciaId] = useState("");
  const [preview, setPreview] = useState<ConsultorResult | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    fetch("/api/competencias").then((r) => r.json()).then((cs) => {
      if (Array.isArray(cs)) {
        setCompetencias(cs);
        if (cs[0]) setCompetenciaId(cs[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (!competenciaId) return;
    setCarregando(true);
    fetch(`/api/comissao/preview?competenciaId=${competenciaId}`)
      .then((r) => r.json())
      .then((d) => {
        const item = Array.isArray(d) ? d.find((x: any) => x.id === consultorId) : null;
        setPreview(item ?? null);
        setCarregando(false);
      })
      .catch(() => setCarregando(false));
  }, [competenciaId, consultorId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Minha Comissão</h1>
          <p className="text-slate-400 text-sm mt-1">Acompanhe sua performance e estimativa de comissão</p>
        </div>
        <select
          value={competenciaId}
          onChange={(e) => setCompetenciaId(e.target.value)}
          className={inputCls}
        >
          {competencias.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
        </select>
      </div>

      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !preview ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <DollarSign size={36} className="mx-auto mb-3 text-slate-400" />
          <p className="text-slate-400">Nenhuma meta configurada para esta competência</p>
          <p className="text-slate-400 text-sm mt-1">Aguarde seu gestor configurar as metas da equipe.</p>
        </div>
      ) : (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">Total Recebido</p>
              <p className="text-white text-xl font-bold tabular-nums">{formatarMoeda(preview.totalRecebido)}</p>
              <p className="text-slate-500 text-[10px] mt-1">inclui valores a parte</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">Base (100%)</p>
              <p className="text-white text-xl font-bold tabular-nums">{formatarMoeda(preview.comissaoBase)}</p>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
              <p className="text-emerald-400/70 text-xs mb-1">Comissão Estimada</p>
              <p className="text-emerald-400 text-xl font-bold tabular-nums">{formatarMoeda(preview.totalComissao)}</p>
            </div>
          </div>

          {/* Barra de progresso financeiro */}
          {preview.percentualMeta > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-400">Atingimento financeiro</p>
                <p className={`text-sm font-bold tabular-nums ${faixaCor(preview.percentualMeta)}`}>{preview.percentualMeta.toFixed(1)}%</p>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${faixaBarCor(preview.percentualMeta)}`}
                  style={{ width: `${Math.min(preview.percentualMeta, 160) / 160 * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Breakdown por meta */}
          {preview.breakdown && preview.breakdown.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-gr-400" />
                  <h2 className="text-sm font-semibold text-white">Detalhamento por Indicador</h2>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-800/40">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium text-xs">Indicador</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Peso</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Bônus 100%</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Realizado</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Atingimento</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Faixa</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium text-xs">Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.breakdown.map((bd) => (
                    <tr key={bd.metaId} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                      <td className="px-4 py-3 text-white font-medium">{bd.nome}</td>
                      <td className="px-4 py-3 text-right text-slate-400 tabular-nums text-xs">{Math.round(bd.peso * 100)}%</td>
                      <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{formatarMoeda(bd.valorBase)}</td>
                      <td className="px-4 py-3 text-right text-slate-300 tabular-nums">
                        {bd.tipo === "FINANCEIRA"
                          ? (bd.realizado != null ? formatarMoeda(bd.realizado) : "—")
                          : (bd.realizado != null ? `${bd.realizado}` : "—")}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${faixaCor(bd.atingimento)}`}>
                        {bd.atingimento > 0 ? `${bd.atingimento.toFixed(1)}%` : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${faixaCor(bd.atingimento)}`}>
                        {bd.multiplicador}%
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-bold tabular-nums">
                        {formatarMoeda(bd.contribuicao)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-800/30">
                    <td colSpan={6} className="px-4 py-3 text-right text-slate-400 text-sm font-medium">Total</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-bold tabular-nums">{formatarMoeda(preview.totalComissao)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────
interface FrenteOpcao { equipeId: string; label: string }

const FRENTE_CHIP_STYLE: Record<string, string> = {
  "eq-flash":   "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "eq-1-30":    "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "eq-31-90":   "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "eq-91-180":  "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "eq-181plus": "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export default function ComissaoPage() {
  const { data: session } = useSession();
  const [frentesGerenciadas, setFrentesGerenciadas] = useState<FrenteOpcao[]>([]);
  const [frenteSelecionada, setFrenteSelecionada] = useState<string>("");

  const perfil = (session?.user as any)?.perfil as string | undefined;
  const userId = (session?.user as any)?.id as string | undefined;

  useEffect(() => {
    if (!perfil || perfil === "CONSULTOR") return;
    fetch("/api/usuarios/frentes")
      .then((r) => r.json())
      .then((data: FrenteOpcao[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setFrentesGerenciadas(data);
          setFrenteSelecionada(data[0].equipeId);
        }
      })
      .catch(() => {});
  }, [perfil]);

  if (!perfil) return null;

  if (perfil === "CONSULTOR") {
    return <ConsultorComissao consultorId={userId ?? ""} />;
  }

  if (perfil === "GESTOR" || perfil === "ADMINISTRADOR") {
    return (
      <div className="space-y-6">
        {frentesGerenciadas.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 font-medium mr-1">Frente:</span>
            {frentesGerenciadas.map((f) => {
              const ativo = frenteSelecionada === f.equipeId;
              const style = FRENTE_CHIP_STYLE[f.equipeId] ?? "bg-slate-700 text-slate-300 border-slate-600";
              return (
                <button
                  key={f.equipeId}
                  onClick={() => setFrenteSelecionada(f.equipeId)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    ativo ? style : "bg-slate-800/50 text-slate-500 border-slate-700 hover:text-slate-300"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        )}

        {frenteSelecionada ? (
          <GestorComissao key={frenteSelecionada} equipeId={frenteSelecionada} />
        ) : (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    );
  }

  return null;
}
