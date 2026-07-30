"use client";

import { useEffect, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { AlertTriangle, Award, CheckCircle2, Clock, Users, TrendingUp } from "lucide-react";
import { useFrente } from "@/contexts/FrenteContext";
import { TabelaDistribuicao } from "@/components/charts/TabelaDistribuicao";
import Link from "next/link";

interface DadosGestor {
  inadimplenciaInicial: number; recebido: number; baixado: number;
  recebimentoAParte: number; percentualMeta: number; metaAlvo: number | null;
  aprovacoesPendentes: number; totalConsultores: number;
  rankingConsultores: Array<{ id: string; nome: string; recebido: number }>;
  clientesRegularizados: number; promessasHoje: number;
  valorAgendadoHoje: number; promessasVencidas: number;
  valorPromessasVencidas: number; eficienciaHoje: number;
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

  useEffect(() => {
    if (competenciaId) carregarDashboard(competenciaId, equipeIds);
  }, [equipeIds]);

  if (!dados) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-gr-500/60 border-t-gr-400 rounded-full animate-spin" />
    </div>
  );

  const pctMeta = dados.percentualMeta ?? 0;

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Dashboard Gestor</h1>
          <p className="text-slate-500 text-xs mt-0.5">{dados.totalConsultores} consultores ativos</p>
        </div>
        <div className="flex items-center gap-2.5">
          {dados.aprovacoesPendentes > 0 && (
            <a
              href="/solicitacoes"
              className="flex items-center gap-1.5 bg-amber-500/[0.08] border border-amber-500/25 text-amber-400 text-xs font-medium px-3 py-2 rounded-xl hover:bg-amber-500/[0.13] transition-all"
            >
              <AlertTriangle size={12} />
              {dados.aprovacoesPendentes} pendente{dados.aprovacoesPendentes !== 1 ? "s" : ""}
            </a>
          )}
          <select
            value={competenciaId}
            onChange={(e) => { setCompetenciaId(e.target.value); carregarDashboard(e.target.value, equipeIds); }}
            className="bg-[#0b0f1c] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gr-500/50 focus:border-gr-500/40 transition-all"
          >
            {competencias.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs financeiros */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Inadimplência Inicial", valor: formatarMoeda(dados.inadimplenciaInicial), cor: "text-white" },
          { label: "Recebido (Informado)",  valor: formatarMoeda(dados.recebido),              cor: "text-gr-400" },
          { label: "Baixado (Oficial)",     valor: formatarMoeda(dados.baixado),               cor: "text-emerald-400" },
          { label: "Rec. a Parte",          valor: formatarMoeda(dados.recebimentoAParte ?? 0), cor: "text-sky-400" },
          { label: "% da Meta",             valor: `${pctMeta.toFixed(1)}%`,                   cor: pctMeta >= 100 ? "text-emerald-400" : pctMeta >= 70 ? "text-gr-400" : "text-slate-400" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-[#0f1525] border border-white/[0.06] rounded-2xl p-4 hover:border-white/[0.09] transition-colors">
            <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide leading-tight">{kpi.label}</p>
            <p className={`text-lg font-bold mt-1.5 tabular-nums leading-none ${kpi.cor}`}>{kpi.valor}</p>
            {kpi.label === "Rec. a Parte" && <p className="text-xs text-slate-600 mt-1">pelo consultor</p>}
            {kpi.label === "% da Meta" && dados.metaAlvo && <p className="text-xs text-slate-600 mt-1">meta {formatarMoeda(dados.metaAlvo)}</p>}
          </div>
        ))}
      </div>

      {/* KPIs operacionais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#0f1525] border border-emerald-500/20 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Regularizados</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1.5 tabular-nums">{dados.clientesRegularizados}</p>
              <p className="text-xs text-slate-600 mt-1">100% quitados</p>
            </div>
            <div className="p-2 rounded-xl bg-emerald-500/10 flex-shrink-0">
              <CheckCircle2 size={15} className="text-emerald-400" />
            </div>
          </div>
        </div>

        <div className="bg-[#0f1525] border border-amber-500/20 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Promessas Hoje</p>
              <p className="text-2xl font-bold text-amber-400 mt-1.5 tabular-nums">{dados.promessasHoje}</p>
              <p className="text-xs text-slate-600 mt-1">{formatarMoeda(dados.valorAgendadoHoje)} agendado</p>
            </div>
            <div className="p-2 rounded-xl bg-amber-500/10 flex-shrink-0">
              <Clock size={15} className="text-amber-400" />
            </div>
          </div>
        </div>

        <div className="bg-[#0f1525] border border-white/[0.06] rounded-2xl p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Valor Agendado</p>
              <p className="text-lg font-bold text-white mt-1.5 tabular-nums leading-tight">{formatarMoeda(dados.valorAgendadoHoje)}</p>
              <p className="text-xs text-slate-600 mt-1">{dados.promessasHoje} promessa(s)</p>
            </div>
            <div className="p-2 rounded-xl bg-white/[0.06] flex-shrink-0">
              <TrendingUp size={15} className="text-slate-400" />
            </div>
          </div>
        </div>

        <div className={`bg-[#0f1525] rounded-2xl p-4 border ${dados.eficienciaHoje >= 80 ? "border-emerald-500/20" : dados.eficienciaHoje >= 50 ? "border-amber-500/20" : "border-white/[0.06]"}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Eficiência do Dia</p>
              <p className={`text-2xl font-bold mt-1.5 tabular-nums ${dados.eficienciaHoje >= 80 ? "text-emerald-400" : dados.eficienciaHoje >= 50 ? "text-amber-400" : "text-slate-500"}`}>
                {dados.eficienciaHoje.toFixed(1)}%
              </p>
              <p className="text-xs text-slate-600 mt-1">Recebido ÷ Agendado</p>
            </div>
            <div className={`p-2 rounded-xl flex-shrink-0 ${dados.eficienciaHoje >= 80 ? "bg-emerald-500/10" : dados.eficienciaHoje >= 50 ? "bg-amber-500/10" : "bg-white/[0.06]"}`}>
              <Users size={15} className={dados.eficienciaHoje >= 80 ? "text-emerald-400" : dados.eficienciaHoje >= 50 ? "text-amber-400" : "text-slate-500"} />
            </div>
          </div>
        </div>
      </div>

      {/* Barra de meta */}
      {dados.metaAlvo && (
        <div className="bg-[#0f1525] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-semibold text-white">Meta da Equipe</p>
            <span className={`text-sm font-bold tabular-nums ${pctMeta >= 100 ? "text-emerald-400" : "text-gr-400"}`}>{pctMeta.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r transition-all ${pctMeta >= 100 ? "from-emerald-600 to-emerald-400" : "from-gr-600 to-gr-400"}`}
              style={{ width: `${Math.min(pctMeta, 160) / 1.6}%` }}
            />
          </div>
        </div>
      )}

      {/* Tarefas diárias */}
      <div className="bg-[#0f1525] border border-white/[0.06] rounded-2xl p-5">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Tarefas Diárias</h2>
        <div className="space-y-2">
          <Link href="/pendencias" className="flex items-center justify-between p-3.5 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl hover:bg-amber-500/[0.11] transition-colors">
            <div className="flex items-center gap-3">
              <Clock size={14} className="text-amber-400 flex-shrink-0" />
              <div>
                <p className="text-white text-xs font-semibold">Promessas vencendo hoje</p>
                <p className="text-slate-500 text-xs mt-0.5">{formatarMoeda(dados.valorAgendadoHoje)} agendado</p>
              </div>
            </div>
            <span className={`text-base font-bold tabular-nums ${dados.promessasHoje > 0 ? "text-amber-400" : "text-slate-500"}`}>{dados.promessasHoje}</span>
          </Link>

          <Link href="/pendencias" className="flex items-center justify-between p-3.5 bg-red-500/[0.07] border border-red-500/20 rounded-xl hover:bg-red-500/[0.11] transition-colors">
            <div className="flex items-center gap-3">
              <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
              <div>
                <p className="text-white text-xs font-semibold">Promessas vencidas</p>
                <p className="text-slate-500 text-xs mt-0.5">{formatarMoeda(dados.valorPromessasVencidas)} não recebido</p>
              </div>
            </div>
            <span className={`text-base font-bold tabular-nums ${dados.promessasVencidas > 0 ? "text-red-400" : "text-slate-500"}`}>{dados.promessasVencidas}</span>
          </Link>

          {dados.promessasHoje === 0 && dados.promessasVencidas === 0 && (
            <div className="flex items-center gap-2.5 p-3.5 bg-emerald-500/[0.07] border border-emerald-500/20 rounded-xl">
              <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
              <p className="text-emerald-300 text-xs font-medium">Nenhuma pendência para hoje!</p>
            </div>
          )}
        </div>
      </div>

      {/* Ranking consultores */}
      <div className="bg-[#0f1525] border border-white/[0.06] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Award size={14} className="text-amber-400" />
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Ranking de Consultores</h2>
        </div>
        <div className="space-y-2.5">
          {dados.rankingConsultores.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3 px-1">
              <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                i === 0 ? "bg-amber-500/20 text-amber-400" :
                i === 1 ? "bg-slate-600/40 text-slate-300" :
                i === 2 ? "bg-orange-700/20 text-orange-400" : "bg-white/[0.04] text-slate-500"
              }`}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-200 truncate font-medium">{c.nome}</p>
              </div>
              <span className="text-xs font-semibold text-emerald-400 tabular-nums">{formatarMoeda(c.recebido)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Distribuição */}
      <TabelaDistribuicao competenciaId={competenciaId} equipeIds={equipeIds} unificar91Plus />
    </div>
  );
}
