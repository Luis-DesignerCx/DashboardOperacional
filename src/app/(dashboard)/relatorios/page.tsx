"use client";

import { useEffect, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { BarChart3, TrendingUp, Users, Building2 } from "lucide-react";

export default function RelatoriosPage() {
  const [competencias, setCompetencias] = useState<any[]>([]);
  const [competenciaId, setCompetenciaId] = useState("");
  const [dados, setDados] = useState<any>(null);

  useEffect(() => {
    fetch("/api/competencias").then((r) => r.json()).then((cs) => {
      setCompetencias(cs);
      if (cs[0]) setCompetenciaId(cs[0].id);
    });
  }, []);

  useEffect(() => {
    if (!competenciaId) return;
    fetch(`/api/dashboard?competenciaId=${competenciaId}`).then((r) => r.json()).then(setDados);
  }, [competenciaId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Relatórios</h1>
          <p className="text-slate-400 text-sm mt-1">Visão analítica da operação</p>
        </div>
        <select
          value={competenciaId}
          onChange={(e) => setCompetenciaId(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          {competencias.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
        </select>
      </div>

      {!dados ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi titulo="Inadimplência Total" valor={formatarMoeda(dados.inadimplenciaTotal ?? 0)} icon={Building2} />
            <Kpi titulo="Recuperação Total" valor={formatarMoeda(dados.recuperacaoTotal ?? 0)} icon={TrendingUp} cor="text-emerald-400" />
            <Kpi titulo="% Recuperação" valor={`${(dados.percentualGeral ?? 0).toFixed(1)}%`} icon={BarChart3} cor="text-sky-400" />
            <Kpi titulo="Consultores" valor={String(dados.totalConsultores ?? dados.rankingEmpresas?.length ?? "—")} icon={Users} />
          </div>

          {/* Ranking empresas */}
          {dados.rankingEmpresas && dados.rankingEmpresas.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-white font-semibold mb-5">Recuperação por Empresa</h2>
              <div className="space-y-4">
                {dados.rankingEmpresas.map((e: any) => (
                  <div key={e.nome}>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-sm text-white">{e.nome}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-500 tabular-nums">
                          {formatarMoeda(e.recuperado)} / {formatarMoeda(e.inadimplencia)}
                        </span>
                        <span className={`text-sm font-bold tabular-nums w-14 text-right ${e.percentual >= 80 ? "text-emerald-400" : e.percentual >= 50 ? "text-sky-400" : "text-amber-400"}`}>
                          {e.percentual.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${e.percentual >= 80 ? "bg-emerald-500" : e.percentual >= 50 ? "bg-sky-500" : "bg-amber-500"}`}
                        style={{ width: `${Math.min(e.percentual, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ranking consultores */}
          {dados.rankingConsultores && dados.rankingConsultores.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-white font-semibold mb-4">Ranking de Consultores</h2>
              <div className="space-y-2">
                {dados.rankingConsultores.map((c: any, i: number) => (
                  <div key={c.id} className="flex items-center gap-3 py-2 border-b border-slate-800/50 last:border-0">
                    <span className={`w-6 text-center text-xs font-bold ${i === 0 ? "text-amber-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-amber-700" : "text-slate-600"}`}>
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm text-white">{c.nome}</span>
                    <span className="text-sm font-semibold text-emerald-400 tabular-nums">{formatarMoeda(c.recebido)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, icon: Icon, cor = "text-white" }: any) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm">{titulo}</p>
          <p className={`text-2xl font-bold mt-1 ${cor}`}>{valor}</p>
        </div>
        <div className="p-2.5 rounded-xl bg-slate-800">
          <Icon size={18} className="text-slate-400" />
        </div>
      </div>
    </div>
  );
}
