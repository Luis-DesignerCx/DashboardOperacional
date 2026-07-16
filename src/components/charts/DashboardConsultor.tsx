"use client";

import { useEffect, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { TrendingUp, DollarSign, AlertCircle, Clock, CheckCircle2, Layers, Calendar, AlertTriangle, Phone } from "lucide-react";
import Link from "next/link";

interface DadosConsultor {
  valorCarteira: number;
  valorRecebido: number;
  valorAParte: number;
  totalClientes: number;
  promessasAbertas: number;
  valorPromessasAbertas: number;
  promessasHoje: number;
  valorPromessasHoje: number;
  promessasVencidas: number;
  valorPromessasVencidas: number;
  agendadosHoje: number;
  percentualMeta: number;
  metaAlvo: number | null;
  metaQuantidade?: { alvo: number; realizado: number } | null;
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

      {/* Alertas */}
      {(dados.promessasHoje > 0 || dados.promessasVencidas > 0) && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-amber-300 font-medium">Atenção às promessas</p>
            <p className="text-slate-400 mt-0.5">
              {dados.promessasHoje > 0 && `${dados.promessasHoje} promessa(s) vencem hoje · ${formatarMoeda(dados.valorPromessasHoje)}`}
              {dados.promessasHoje > 0 && dados.promessasVencidas > 0 && " · "}
              {dados.promessasVencidas > 0 && `${dados.promessasVencidas} vencida(s) · ${formatarMoeda(dados.valorPromessasVencidas)}`}
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
          titulo="Total Recebido"
          valor={formatarMoeda(dados.valorRecebido + dados.valorAParte)}
          sub="Inad + A Parte"
          icon={CheckCircle2}
          cor="bg-emerald-600"
        />
        <CardMetrica
          titulo="Promessas Abertas"
          valor={String(dados.promessasAbertas)}
          sub={formatarMoeda(dados.valorPromessasAbertas)}
          icon={Clock}
          cor="bg-amber-500"
        />
      </div>

      {/* Barra de progresso — meta financeira */}
      {dados.metaAlvo && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm font-medium text-white">Progresso da Meta</p>
            <span className={`text-sm font-bold ${dados.percentualMeta >= 100 ? "text-emerald-400" : "text-gr-400"}`}>
              {(dados.percentualMeta ?? 0).toFixed(1)}%
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
            <span>{formatarMoeda(dados.valorRecebido + dados.valorAParte)} recebido</span>
            <span>{formatarMoeda(dados.metaAlvo)} meta</span>
          </div>
        </div>
      )}

      {/* Contratos recuperados — meta quantidade */}
      {dados.metaQuantidade && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          {(() => {
            const { alvo, realizado } = dados.metaQuantidade!;
            const pct = alvo > 0 ? Math.min((realizado / alvo) * 100, 100) : 0;
            return (
              <>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-sm font-medium text-white">Contratos Recuperados</p>
                  <span className={`text-sm font-bold ${pct >= 100 ? "text-emerald-400" : "text-gr-400"}`}>
                    {realizado} / {alvo}
                  </span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : pct >= 70 ? "bg-gr-500" : "bg-slate-600"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-slate-500">
                  <span>{realizado} contrato{realizado !== 1 ? "s" : ""} adimplente{realizado !== 1 ? "s" : ""}</span>
                  <span>meta: {alvo} contratos</span>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Minhas Tarefas Diárias */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Minhas Tarefas Diárias</h2>
        <div className="space-y-3">

          {/* Promessas vencendo hoje */}
          <Link href="/pendencias" className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl hover:bg-amber-500/15 transition-colors">
            <div className="flex items-center gap-3">
              <Clock size={16} className="text-amber-400" />
              <div>
                <p className="text-white text-sm font-medium">Promessas vencendo hoje</p>
                <p className="text-slate-400 text-xs">{formatarMoeda(dados.valorPromessasHoje)} agendado</p>
              </div>
            </div>
            <span className={`text-lg font-bold ${dados.promessasHoje > 0 ? "text-amber-400" : "text-slate-400"}`}>{dados.promessasHoje}</span>
          </Link>

          {/* Promessas vencidas */}
          <Link href="/pendencias" className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-500/15 transition-colors">
            <div className="flex items-center gap-3">
              <AlertTriangle size={16} className="text-red-400" />
              <div>
                <p className="text-white text-sm font-medium">Promessas vencidas</p>
                <p className="text-slate-400 text-xs">{formatarMoeda(dados.valorPromessasVencidas)} não recebido</p>
              </div>
            </div>
            <span className={`text-lg font-bold ${dados.promessasVencidas > 0 ? "text-red-400" : "text-slate-400"}`}>{dados.promessasVencidas}</span>
          </Link>

          {/* Retornos agendados */}
          <Link href="/carteira" className="flex items-center justify-between p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl hover:bg-sky-500/15 transition-colors">
            <div className="flex items-center gap-3">
              <Phone size={16} className="text-sky-400" />
              <div>
                <p className="text-white text-sm font-medium">Retornos agendados para hoje</p>
                <p className="text-slate-400 text-xs">Ligar depois / Aguardar retorno</p>
              </div>
            </div>
            <span className={`text-lg font-bold ${dados.agendadosHoje > 0 ? "text-sky-400" : "text-slate-400"}`}>{dados.agendadosHoje}</span>
          </Link>

          {dados.promessasHoje === 0 && dados.promessasVencidas === 0 && dados.agendadosHoje === 0 && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <p className="text-emerald-300 text-sm">Nenhuma pendência para hoje!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

