"use client";

import { useEffect, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { useFrente } from "@/contexts/FrenteContext";

interface DadosExecutivo {
  inadimplenciaTotal: number; recuperacaoTotal: number; percentualGeral: number;
  totalClientes: number; totalContratos: number; totalParcelas: number;
  contratosRecuperados: number;
  rankingEmpresas: Array<{ nome: string; inadimplencia: number; recuperado: number; clientes: number; contratos: number; percentual: number }>;
}

export function DashboardExecutivo() {
  const [dados, setDados] = useState<DadosExecutivo | null>(null);
  const [erro, setErro] = useState("");
  const [competenciaId, setCompetenciaId] = useState("");
  const [competencias, setCompetencias] = useState<any[]>([]);
  const { equipeIds } = useFrente();

  async function carregarDashboard(id: string, eqIds: string[] = []) {
    setDados(null); setErro("");
    const params = new URLSearchParams({ competenciaId: id });
    if (eqIds.length > 0) params.set("equipeIds", eqIds.join(","));
    const r = await fetch(`/api/dashboard?${params}`).catch(() => null);
    if (!r) { setErro("Erro de conexão"); return; }
    const data = await r.json();
    if (!r.ok || data.erro) { setErro(data.erro || `Erro ${r.status}`); return; }
    setDados(data);
  }

  useEffect(() => {
    fetch("/api/competencias")
      .then((r) => r.json())
      .then((cs) => {
        if (!Array.isArray(cs)) { setErro("Erro ao carregar competências."); return; }
        if (cs.length === 0)    { setErro("VAZIO"); return; }
        setCompetencias(cs);
        setCompetenciaId(cs[0].id);
        carregarDashboard(cs[0].id, equipeIds);
      })
      .catch(() => setErro("Erro de conexão ao carregar competências."));
  }, []);

  useEffect(() => {
    if (competenciaId) carregarDashboard(competenciaId, equipeIds);
  }, [equipeIds]);

  if (erro === "VAZIO") return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-white font-semibold">Nenhuma competência cadastrada</p>
      <p className="text-slate-500 text-sm text-center">
        Acesse <strong className="text-slate-300">Importação</strong> para subir a planilha de inadimplência.
      </p>
    </div>
  );

  if (erro) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-red-400 font-medium text-sm">Erro ao carregar dashboard</p>
        <p className="text-slate-500 text-xs mt-1">{erro}</p>
      </div>
    </div>
  );

  if (!dados) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-gr-500/60 border-t-gr-400 rounded-full animate-spin" />
    </div>
  );

  const pct = dados.percentualGeral;

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Dashboard Executivo</h1>
          <p className="text-slate-500 text-xs mt-0.5">Visão consolidada de todas as empresas</p>
        </div>
        <select
          value={competenciaId}
          onChange={(e) => { setCompetenciaId(e.target.value); carregarDashboard(e.target.value, equipeIds); }}
          className="bg-[#0b0f1c] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gr-500/50 focus:border-gr-500/40 transition-all"
        >
          {competencias.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#0f1525] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.09] transition-colors">
          <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Inadimplência Total</p>
          <p className="text-2xl font-bold text-white mt-2 tabular-nums leading-none">{formatarMoeda(dados.inadimplenciaTotal)}</p>
          <div className="mt-3 pt-3 border-t border-white/[0.05]">
            <span className="text-xs text-slate-500">
              <span className="text-slate-300 font-semibold">{dados.totalClientes}</span> clientes
            </span>
          </div>
        </div>

        <div className="bg-[#0f1525] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.09] transition-colors">
          <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Recuperação Total</p>
          <p className="text-2xl font-bold text-emerald-400 mt-2 tabular-nums leading-none">{formatarMoeda(dados.recuperacaoTotal)}</p>
          <div className="mt-3 pt-3 border-t border-white/[0.05]">
            <span className="text-xs text-slate-500">
              <span className="text-slate-300 font-semibold">{dados.contratosRecuperados}</span> contratos
            </span>
          </div>
        </div>

        <div className="bg-[#0f1525] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.09] transition-colors">
          <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">% Recuperação</p>
          <p className={`text-2xl font-bold mt-2 tabular-nums leading-none ${pct >= 80 ? "text-emerald-400" : pct >= 50 ? "text-gr-400" : "text-amber-400"}`}>
            {pct.toFixed(1)}%
          </p>
          <div className="mt-3">
            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r transition-all ${pct >= 80 ? "from-emerald-600 to-emerald-400" : pct >= 50 ? "from-gr-600 to-gr-400" : "from-amber-600 to-amber-400"}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="bg-[#0f1525] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.09] transition-colors">
          <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Rec. a Parte</p>
          <p className="text-2xl font-bold text-sky-400 mt-2 tabular-nums leading-none">{formatarMoeda((dados as any).recebimentoAParte ?? 0)}</p>
          <div className="mt-3 pt-3 border-t border-white/[0.05]">
            <span className="text-xs text-slate-600">Registrado pelo consultor</span>
          </div>
        </div>
      </div>

      {/* Ranking por empresa */}
      <div className="bg-[#0f1525] border border-white/[0.06] rounded-2xl p-5">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-5">Ranking por Empresa</h2>
        <div className="space-y-4">
          {dados.rankingEmpresas.map((empresa) => {
            const ep = empresa.percentual;
            const barColor = ep >= 80
              ? "from-emerald-600 to-emerald-400"
              : ep >= 50
              ? "from-gr-600 to-gr-400"
              : "from-amber-600 to-amber-400";
            const textColor = ep >= 80 ? "text-emerald-400" : ep >= 50 ? "text-gr-400" : "text-amber-400";

            return (
              <div key={empresa.nome}>
                <div className="flex justify-between items-center mb-1.5">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-white">{empresa.nome}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {empresa.clientes ?? 0} clientes · {empresa.contratos ?? 0} contratos
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <div className="text-right tabular-nums text-xs hidden sm:block">
                      <span className="text-slate-300">{formatarMoeda(empresa.inadimplencia)}</span>
                      <span className="text-slate-600 mx-1">·</span>
                      <span className="text-emerald-400">{formatarMoeda(empresa.recuperado)}</span>
                    </div>
                    <span className={`text-sm font-bold tabular-nums w-12 text-right ${textColor}`}>
                      {ep.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all`}
                    style={{ width: `${Math.min(ep, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
