"use client";

import { useEffect, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { AlertTriangle, Award, CheckCircle2, Clock, Users, TrendingUp } from "lucide-react";
import { useFrente } from "@/contexts/FrenteContext";
import { TabelaDistribuicao } from "@/components/charts/TabelaDistribuicao";
import Link from "next/link";

interface DadosGestor {
  inadimplenciaInicial: number;
  recebido: number;
  baixado: number;
  percentualMeta: number;
  metaAlvo: number | null;
  aprovacoesPendentes: number;
  totalConsultores: number;
  rankingConsultores: Array<{ id: string; nome: string; recebido: number }>;
  clientesRegularizados: number;
  promessasHoje: number;
  valorAgendadoHoje: number;
  promessasVencidas: number;
  valorPromessasVencidas: number;
  eficienciaHoje: number;
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

      {/* KPIs principais */}
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

      {/* KPIs operacionais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-emerald-500/20 rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-slate-400 text-sm">Clientes Regularizados</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{dados.clientesRegularizados}</p>
              <p className="text-xs text-slate-500 mt-1">100% quitados</p>
            </div>
            <div className="p-2 rounded-xl bg-emerald-500/10">
              <CheckCircle2 size={18} className="text-emerald-400" />
            </div>
          </div>
        </div>
        <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-slate-400 text-sm">Promessas para Hoje</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">{dados.promessasHoje}</p>
              <p className="text-xs text-slate-500 mt-1">{formatarMoeda(dados.valorAgendadoHoje)} agendado</p>
            </div>
            <div className="p-2 rounded-xl bg-amber-500/10">
              <Clock size={18} className="text-amber-400" />
            </div>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-slate-400 text-sm">Valor Agendado Hoje</p>
              <p className="text-2xl font-bold text-white mt-1">{formatarMoeda(dados.valorAgendadoHoje)}</p>
              <p className="text-xs text-slate-500 mt-1">{dados.promessasHoje} promessa(s)</p>
            </div>
            <div className="p-2 rounded-xl bg-slate-700">
              <TrendingUp size={18} className="text-slate-300" />
            </div>
          </div>
        </div>
        <div className={`bg-slate-900 border rounded-2xl p-5 ${dados.eficienciaHoje >= 80 ? "border-emerald-500/20" : dados.eficienciaHoje >= 50 ? "border-amber-500/20" : "border-slate-800"}`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-slate-400 text-sm">Eficiência do Dia</p>
              <p className={`text-2xl font-bold mt-1 ${dados.eficienciaHoje >= 80 ? "text-emerald-400" : dados.eficienciaHoje >= 50 ? "text-amber-400" : "text-slate-400"}`}>
                {dados.eficienciaHoje.toFixed(1)}%
              </p>
              <p className="text-xs text-slate-500 mt-1">Recebido ÷ Agendado</p>
            </div>
            <div className={`p-2 rounded-xl ${dados.eficienciaHoje >= 80 ? "bg-emerald-500/10" : dados.eficienciaHoje >= 50 ? "bg-amber-500/10" : "bg-slate-700"}`}>
              <Users size={18} className={dados.eficienciaHoje >= 80 ? "text-emerald-400" : dados.eficienciaHoje >= 50 ? "text-amber-400" : "text-slate-400"} />
            </div>
          </div>
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

      {/* Tarefas Diárias */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Tarefas Diárias</h2>
        <div className="space-y-3">
          <Link href="/pendencias" className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl hover:bg-amber-500/15 transition-colors">
            <div className="flex items-center gap-3">
              <Clock size={16} className="text-amber-400" />
              <div>
                <p className="text-white text-sm font-medium">Promessas vencendo hoje</p>
                <p className="text-slate-400 text-xs">{formatarMoeda(dados.valorAgendadoHoje)} agendado</p>
              </div>
            </div>
            <span className={`text-lg font-bold ${dados.promessasHoje > 0 ? "text-amber-400" : "text-slate-600"}`}>{dados.promessasHoje}</span>
          </Link>

          <Link href="/pendencias" className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-500/15 transition-colors">
            <div className="flex items-center gap-3">
              <AlertTriangle size={16} className="text-red-400" />
              <div>
                <p className="text-white text-sm font-medium">Promessas vencidas</p>
                <p className="text-slate-400 text-xs">{formatarMoeda(dados.valorPromessasVencidas)} não recebido</p>
              </div>
            </div>
            <span className={`text-lg font-bold ${dados.promessasVencidas > 0 ? "text-red-400" : "text-slate-600"}`}>{dados.promessasVencidas}</span>
          </Link>

          {dados.promessasHoje === 0 && dados.promessasVencidas === 0 && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <p className="text-emerald-300 text-sm">Nenhuma pendência para hoje!</p>
            </div>
          )}
        </div>
      </div>

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

      {/* Distribuição por frente / empresa — frentes 91-180 e 181+ unificadas como 91+ */}
      <TabelaDistribuicao competenciaId={competenciaId} equipeIds={equipeIds} unificar91Plus />
    </div>
  );
}
