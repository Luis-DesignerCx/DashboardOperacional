"use client";

import { useEffect, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { TrendingUp, DollarSign, AlertCircle, Clock, CheckCircle2, Layers } from "lucide-react";

interface DadosConsultor {
  valorCarteira: number;
  valorRecebido: number;
  valorAParte: number;
  totalClientes: number;
  promessasAbertas: number;
  promessasHoje: number;
  promessasVencidas: number;
  percentualMeta: number;
  metaAlvo: number | null;
}

function CardMetrica({ titulo, valor, sub, icon: Icon, cor }: {
  titulo: string; valor: string; sub?: string;
  icon: React.ElementType; cor: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm">{titulo}</p>
          <p className="text-2xl font-bold text-white mt-1">{valor}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-xl ${cor}`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
    </div>
  );
}

export function DashboardConsultor() {
  const [dados, setDados] = useState<DadosConsultor | null>(null);
  const [competenciaId, setCompetenciaId] = useState<string>("");
  const [competencias, setCompetencias] = useState<any[]>([]);

  async function carregarDashboard(id: string) {
    setDados(null);
    const d = await fetch(`/api/dashboard?competenciaId=${id}`).then((r) => r.json()).catch(() => null);
    if (d && !d.erro) setDados(d);
  }

  useEffect(() => {
    fetch("/api/competencias")
      .then((r) => r.json())
      .then((cs) => {
        if (!Array.isArray(cs) || cs.length === 0) return;
        setCompetencias(cs);
        setCompetenciaId(cs[0].id);
        carregarDashboard(cs[0].id);
      });
  }, []);

  if (!dados) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const proximaFaixa = proximaFaixaComissao(dados.percentualMeta);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Meu Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Acompanhe sua performance</p>
        </div>
        <select
          value={competenciaId}
          onChange={(e) => { setCompetenciaId(e.target.value); carregarDashboard(e.target.value); }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
        >
          {competencias.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
        </select>
      </div>

      {/* Alertas de pendências */}
      {(dados.promessasHoje > 0 || dados.promessasVencidas > 0) && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-amber-300 font-medium">Atenção às promessas</p>
            <p className="text-slate-400 mt-0.5">
              {dados.promessasHoje > 0 && `${dados.promessasHoje} promessa(s) vencem hoje`}
              {dados.promessasHoje > 0 && dados.promessasVencidas > 0 && " · "}
              {dados.promessasVencidas > 0 && `${dados.promessasVencidas} promessa(s) vencida(s)`}
            </p>
          </div>
        </div>
      )}

      {/* Métricas principais */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <CardMetrica
          titulo="Carteira Total"
          valor={formatarMoeda(dados.valorCarteira)}
          sub={`${dados.totalClientes} clientes`}
          icon={DollarSign}
          cor="bg-slate-700"
        />
        <CardMetrica
          titulo="Recebimento"
          valor={formatarMoeda(dados.valorRecebido)}
          sub={dados.metaAlvo ? `Meta: ${formatarMoeda(dados.metaAlvo)}` : undefined}
          icon={TrendingUp}
          cor="bg-gr-500"
        />
        <CardMetrica
          titulo="A Parte"
          valor={formatarMoeda(dados.valorAParte)}
          sub="Fora da inadimplência"
          icon={Layers}
          cor="bg-sky-600"
        />
        <CardMetrica
          titulo="% da Meta"
          valor={`${dados.percentualMeta.toFixed(1)}%`}
          sub={proximaFaixa ? `Próxima faixa: ${proximaFaixa}%` : "Meta atingida!"}
          icon={CheckCircle2}
          cor={dados.percentualMeta >= 100 ? "bg-emerald-500" : dados.percentualMeta >= 70 ? "bg-gr-500" : "bg-slate-600"}
        />
        <CardMetrica
          titulo="Promessas Abertas"
          valor={String(dados.promessasAbertas)}
          sub={`${dados.promessasHoje} para hoje`}
          icon={Clock}
          cor="bg-amber-500"
        />
      </div>

      {/* Barra de progresso da meta */}
      {dados.metaAlvo && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-medium text-white">Progresso da Meta</p>
            <span className={`text-sm font-bold ${dados.percentualMeta >= 100 ? "text-emerald-400" : "text-gr-400"}`}>
              {dados.percentualMeta.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                dados.percentualMeta >= 100 ? "bg-emerald-500" : dados.percentualMeta >= 70 ? "bg-gr-500" : "bg-slate-600"
              }`}
              style={{ width: `${Math.min(dados.percentualMeta, 160)}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>{formatarMoeda(dados.valorRecebido)} recebido</span>
            <span>{formatarMoeda(dados.metaAlvo)} meta</span>
          </div>
        </div>
      )}
    </div>
  );
}

function proximaFaixaComissao(percentual: number): number | null {
  const faixas = [70, 80, 90, 100, 110, 120, 130, 140, 150, 160];
  return faixas.find((f) => f > percentual) ?? null;
}
