"use client";

import { useEffect, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { AlertTriangle, Award } from "lucide-react";
import { useFrente } from "@/contexts/FrenteContext";
import { TabelaDistribuicao } from "@/components/charts/TabelaDistribuicao";

interface DadosGestor {
  inadimplenciaInicial: number;
  recebido: number;
  baixado: number;
  percentualMeta: number;
  metaAlvo: number | null;
  aprovacoesPendentes: number;
  totalConsultores: number;
  rankingConsultores: Array<{ id: string; nome: string; recebido: number }>;
}

export function DashboardGestor() {
  const [dados, setDados] = useState<DadosGestor | null>(null);
  const [competenciaId, setCompetenciaId] = useState("");
  const [competencias, setCompetencias] = useState<any[]>([]);
  const { equipeIds } = useFrente();

  async function carregarDashboard(cId: string, eqIds: string[]) {
    setDados(null);
    const params = new URLSearchParams({ competenciaId: cId });
    if (eqIds.length > 0) params.set("equipeIds", eqIds.join(","));
    const d = await fetch(`/api/dashboard?${params}`).then((r) => r.json()).catch(() => null);
    if (d && !d.erro) setDados(d);
  }

  useEffect(() => {
    fetch("/api/competencias")
      .then((r) => r.json())
      .then((cs) => {
        if (!Array.isArray(cs) || cs.length === 0) return;
        setCompetencias(cs);
        setCompetenciaId(cs[0].id);
        carregarDashboard(cs[0].id, equipeIds);
      });
  }, []);

  // Recarrega quando o filtro de frente muda
  useEffect(() => {
    if (competenciaId) carregarDashboard(competenciaId, equipeIds);
  }, [equipeIds]);

  if (!dados) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard Gestor</h1>
          <p className="text-slate-400 text-sm">{dados.totalConsultores} consultores</p>
        </div>
        <div className="flex items-center gap-3">
          {dados.aprovacoesPendentes > 0 && (
            <a href="/solicitacoes" className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm px-3 py-2 rounded-lg hover:bg-amber-500/20 transition">
              <AlertTriangle size={14} />
              {dados.aprovacoesPendentes} pendente(s)
            </a>
          )}
          <select
            value={competenciaId}
            onChange={(e) => { setCompetenciaId(e.target.value); carregarDashboard(e.target.value, equipeIds); }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
          >
            {competencias.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p className="text-slate-400 text-sm">Inadimplência Inicial</p>
          <p className="text-2xl font-bold text-white mt-1">{formatarMoeda(dados.inadimplenciaInicial)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p className="text-slate-400 text-sm">Recebido (Informado)</p>
          <p className="text-2xl font-bold text-gr-400 mt-1">{formatarMoeda(dados.recebido)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p className="text-slate-400 text-sm">Baixado (Oficial)</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{formatarMoeda(dados.baixado)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p className="text-slate-400 text-sm">% da Meta</p>
          <p className={`text-2xl font-bold mt-1 ${dados.percentualMeta >= 100 ? "text-emerald-400" : dados.percentualMeta >= 70 ? "text-gr-400" : "text-slate-400"}`}>
            {dados.percentualMeta.toFixed(1)}%
          </p>
          {dados.metaAlvo && <p className="text-xs text-slate-500 mt-1">Meta: {formatarMoeda(dados.metaAlvo)}</p>}
        </div>
      </div>

      {/* Barra de meta */}
      {dados.metaAlvo && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex justify-between mb-3">
            <p className="text-sm font-medium text-white">Meta da Equipe</p>
            <span className="text-sm font-bold text-gr-400">{dados.percentualMeta.toFixed(1)}%</span>
          </div>
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${dados.percentualMeta >= 100 ? "bg-emerald-500" : "bg-gr-500"}`}
              style={{ width: `${Math.min(dados.percentualMeta, 160) / 1.6}%` }}
            />
          </div>
        </div>
      )}

      {/* Ranking consultores */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Award size={18} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-white">Ranking de Consultores</h2>
        </div>
        <div className="space-y-3">
          {dados.rankingConsultores.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                i === 0 ? "bg-amber-500 text-white" :
                i === 1 ? "bg-slate-500 text-white" :
                i === 2 ? "bg-amber-700 text-white" : "bg-slate-800 text-slate-400"
              }`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{c.nome}</p>
              </div>
              <span className="text-sm font-semibold text-emerald-400 tabular-nums">
                {formatarMoeda(c.recebido)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Distribuição por frente / empresa */}
      <TabelaDistribuicao competenciaId={competenciaId} equipeIds={equipeIds} />
    </div>
  );
}
