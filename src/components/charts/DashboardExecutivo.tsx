"use client";

import { useEffect, useState } from "react";
import { formatarMoeda } from "@/lib/utils";

interface DadosExecutivo {
  inadimplenciaTotal: number;
  recuperacaoTotal: number;
  percentualGeral: number;
  totalClientes: number;
  totalContratos: number;
  totalParcelas: number;
  contratosRecuperados: number;
  rankingEmpresas: Array<{ nome: string; inadimplencia: number; recuperado: number; clientes: number; contratos: number; percentual: number }>;
}

export function DashboardExecutivo() {
  const [dados, setDados] = useState<DadosExecutivo | null>(null);
  const [erro, setErro] = useState("");
  const [competenciaId, setCompetenciaId] = useState("");
  const [competencias, setCompetencias] = useState<any[]>([]);

  async function carregarDashboard(id: string) {
    setDados(null);
    setErro("");
    const r = await fetch(`/api/dashboard?competenciaId=${id}`).catch(() => null);
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
        if (cs.length === 0) { setErro("VAZIO"); return; }
        setCompetencias(cs);
        setCompetenciaId(cs[0].id);
        carregarDashboard(cs[0].id);
      })
      .catch(() => setErro("Erro de conexão ao carregar competências."));
  }, []);

  if (erro === "VAZIO") return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="text-center">
        <p className="text-white font-semibold text-lg">Nenhuma competência cadastrada</p>
        <p className="text-slate-400 text-sm mt-2">
          Acesse <strong>Importação</strong> para subir a planilha de inadimplência e iniciar o sistema.
        </p>
      </div>
    </div>
  );

  if (erro) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-red-400 font-medium">Erro ao carregar dashboard</p>
        <p className="text-slate-500 text-sm mt-1">{erro}</p>
      </div>
    </div>
  );

  if (!dados) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard Executivo</h1>
          <p className="text-slate-300 text-sm">Visão consolidada de todas as empresas</p>
        </div>
        <select
          value={competenciaId}
          onChange={(e) => { setCompetenciaId(e.target.value); carregarDashboard(e.target.value); }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
        >
          {competencias.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
        </select>
      </div>

      {/* KPIs globais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-slate-300 text-sm font-medium">Inadimplência Total</p>
          <p className="text-3xl font-bold text-white mt-2">{formatarMoeda(dados.inadimplenciaTotal)}</p>
          <div className="mt-3 pt-3 border-t border-slate-800">
            <span className="text-xs text-slate-300">
              <span className="text-white font-semibold">{dados.contratosRecuperados}</span> contratos recuperados
            </span>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-slate-300 text-sm font-medium">Recuperação Total</p>
          <p className="text-3xl font-bold text-emerald-400 mt-2">{formatarMoeda(dados.recuperacaoTotal)}</p>
          <div className="mt-3 pt-3 border-t border-slate-800">
            <span className="text-xs text-slate-300">
              <span className="text-white font-semibold">{dados.contratosRecuperados}</span> contratos recuperados
            </span>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-slate-300 text-sm font-medium">% Recuperação Geral</p>
          <p className={`text-3xl font-bold mt-2 ${dados.percentualGeral >= 80 ? "text-emerald-400" : dados.percentualGeral >= 50 ? "text-gr-400" : "text-amber-400"}`}>
            {dados.percentualGeral.toFixed(1)}%
          </p>
          <div className="mt-3 pt-3 border-t border-slate-800">
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${dados.percentualGeral >= 80 ? "bg-emerald-500" : dados.percentualGeral >= 50 ? "bg-gr-500" : "bg-amber-500"}`}
                style={{ width: `${Math.min(dados.percentualGeral, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Ranking empresas */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-white mb-5">Ranking por Empresa</h2>
        <div className="space-y-4">
          {dados.rankingEmpresas.map((empresa) => (
            <div key={empresa.nome}>
              <div className="flex justify-between items-center mb-1.5">
                <div>
                  <span className="text-sm font-medium text-white">{empresa.nome}</span>
                  <span className="ml-2 text-xs text-slate-300">
                    {empresa.clientes ?? 0} cliente{(empresa.clientes ?? 0) !== 1 ? "s" : ""} · {empresa.contratos ?? 0} contrato{(empresa.contratos ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right tabular-nums text-xs">
                    <span className="text-white font-medium">{formatarMoeda(empresa.inadimplencia)}</span>
                    <span className="text-slate-500 mx-1">/</span>
                    <span className="text-emerald-400">{formatarMoeda(empresa.recuperado)}</span>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums w-14 text-right ${empresa.percentual >= 80 ? "text-emerald-400" : empresa.percentual >= 50 ? "text-gr-400" : "text-amber-400"}`}>
                    {empresa.percentual.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${empresa.percentual >= 80 ? "bg-emerald-500" : empresa.percentual >= 50 ? "bg-gr-500" : "bg-amber-500"}`}
                  style={{ width: `${Math.min(empresa.percentual, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
