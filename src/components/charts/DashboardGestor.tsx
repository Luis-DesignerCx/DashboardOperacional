"use client";

import { useEffect, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Gauge, Info } from "lucide-react";
import { useFrente } from "@/contexts/FrenteContext";
import { MatrizPerformance } from "@/components/charts/MatrizPerformance";
import { SaudeEmpreendimentos } from "@/components/charts/SaudeEmpreendimentos";
import { PainelAgendamentos } from "@/components/charts/PainelAgendamentos";
import { Select } from "@/components/ui/Select";

interface DadosGestor {
  inadimplenciaInicial: number; totalContratosInicial: number; totalClientesInicial: number;
  recebido: number; baixado: number; contratosRecebidos: number;
  recebimentoAParte: number; percentualMeta: number; metaAlvo: number | null;
  aprovacoesPendentes: number; totalConsultores: number;
  clientesRegularizados: number;
  promessasHoje: number; valorAgendadoHoje: number; clientesAgendadosHoje: number;
  promessasVencidas: number; valorPromessasVencidas: number; clientesPromessasVencidas: number;
  promessasFuturas: number; valorPromessasFuturas: number; clientesPromessasFuturas: number;
  eficienciaHoje: number;
}

interface ConsultorDist {
  consultorId: string; nome: string; saldoAberto: number; recebido: number;
  contratos: number; contratosRecebidos: number;
}
interface FrenteDist {
  equipeId: string; label: string; consultores: ConsultorDist[];
  total: { saldoAberto: number; recebido: number; contratos: number; contratosRecebidos: number };
}
interface EmpresaDist {
  empresaId: string; nome: string; saldoAberto: number; recebido: number;
  contratos: number; percentual: number;
}

export function DashboardGestor() {
  const [dados, setDados] = useState<DadosGestor | null>(null);
  const [frentes, setFrentes] = useState<FrenteDist[]>([]);
  const [porEmpresa, setPorEmpresa] = useState<EmpresaDist[]>([]);
  const [competenciaId, setCompetenciaId] = useState("");
  const [competencias, setCompetencias] = useState<any[]>([]);
  const { equipeIds } = useFrente();

  async function carregarDashboard(cId: string, eqIds: string[]) {
    setDados(null);
    const params = new URLSearchParams({ competenciaId: cId });
    if (eqIds.length > 0) params.set("equipeIds", eqIds.join(","));

    const [d, dist] = await Promise.all([
      fetch(`/api/dashboard?${params}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/dashboard/distribuicao?${params}`).then((r) => r.json()).catch(() => null),
    ]);
    if (d && !d.erro) setDados(d);
    if (dist && !dist.erro) {
      setFrentes(dist.frentes ?? []);
      setPorEmpresa(dist.porEmpresa ?? []);
    }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipeIds.join(",")]);

  if (!dados) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-gr-500/60 border-t-gr-400 rounded-full animate-spin" />
    </div>
  );

  const pctMeta = dados.percentualMeta ?? 0;

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Dashboard Gestor</h1>
          <p className="text-slate-500 text-xs mt-0.5">{dados.totalConsultores} consultores ativos</p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="hidden md:flex items-center gap-3 text-xs text-slate-500 mr-1">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-emerald-500" />
              <span className="text-slate-300 font-medium tabular-nums">{dados.clientesRegularizados}</span> regularizados
            </span>
            <span className="w-1 h-1 rounded-full bg-white/[0.15]" />
            <span className="flex items-center gap-1.5">
              <Gauge size={12} className={dados.eficienciaHoje >= 80 ? "text-emerald-500" : dados.eficienciaHoje >= 50 ? "text-amber-500" : "text-slate-500"} />
              <span className="text-slate-300 font-medium tabular-nums">{dados.eficienciaHoje.toFixed(0)}%</span> eficiência hoje
            </span>
          </div>
          {dados.aprovacoesPendentes > 0 && (
            <a
              href="/solicitacoes"
              className="flex items-center gap-1.5 bg-amber-500/[0.08] border border-amber-500/25 text-amber-400 text-xs font-medium px-3 py-2 rounded-xl hover:bg-amber-500/[0.13] transition-all"
            >
              <AlertTriangle size={12} />
              {dados.aprovacoesPendentes} pendente{dados.aprovacoesPendentes !== 1 ? "s" : ""}
            </a>
          )}
          <Select
            value={competenciaId}
            onValueChange={(v) => { setCompetenciaId(v); carregarDashboard(v, equipeIds); }}
            className="w-44"
            options={competencias.map((c) => ({ value: c.id, label: c.descricao }))}
          />
        </div>
      </div>

      {/* Bloco 1 — KPIs financeiros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-4">
          <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Inadimplência Inicial</p>
          <p className="text-xl font-bold text-white mt-1.5 tabular-nums leading-none">{formatarMoeda(dados.inadimplenciaInicial)}</p>
          <p className="text-xs text-slate-500 mt-1.5">
            {dados.totalContratosInicial} contrato{dados.totalContratosInicial !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-4">
          <div className="flex items-center gap-1.5">
            <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Recuperado no Mês</p>
            <div className="relative group flex items-center">
              <Info size={11} className="text-slate-600 cursor-help" />
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block whitespace-nowrap bg-surface-3 border border-white/[0.08] text-slate-300 text-[10px] px-2 py-1 rounded-lg shadow-card z-10">
                Baixado: {formatarMoeda(dados.baixado)}
              </div>
            </div>
          </div>
          <p className="text-xl font-bold text-white mt-1.5 tabular-nums leading-none">{formatarMoeda(dados.recebido)}</p>
          <p className="text-xs text-slate-500 mt-1.5">
            {dados.contratosRecebidos} contrato{dados.contratosRecebidos !== 1 ? "s" : ""} com recebimento
          </p>
        </div>

        <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-4">
          <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Meta do Mês</p>
          <p className="text-xl font-bold text-white mt-1.5 tabular-nums leading-none">{pctMeta.toFixed(1)}%</p>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden mt-2.5">
            <div
              className={`h-full rounded-full transition-all ${pctMeta >= 100 ? "bg-emerald-500" : "bg-gr-500"}`}
              style={{ width: `${Math.min(pctMeta, 100)}%` }}
            />
          </div>
          {dados.metaAlvo && <p className="text-xs text-slate-500 mt-1.5">meta {formatarMoeda(dados.metaAlvo)}</p>}
        </div>
      </div>

      {/* Bloco 2 — Agendamentos e Promessas */}
      <PainelAgendamentos
        hoje={{ count: dados.promessasHoje, valor: dados.valorAgendadoHoje, clientes: dados.clientesAgendadosHoje }}
        vencidas={{ count: dados.promessasVencidas, valor: dados.valorPromessasVencidas, clientes: dados.clientesPromessasVencidas }}
        futuro={{ count: dados.promessasFuturas, valor: dados.valorPromessasFuturas, clientes: dados.clientesPromessasFuturas }}
      />

      {/* Bloco 3 — Matriz de Performance da Equipe */}
      <MatrizPerformance frentes={frentes} />

      {/* Bloco 4 — Saúde dos Empreendimentos */}
      <SaudeEmpreendimentos porEmpresa={porEmpresa} />
    </div>
  );
}
