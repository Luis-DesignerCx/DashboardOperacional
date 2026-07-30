"use client";

import { useEffect, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import {
  TrendingUp, DollarSign, AlertCircle, Clock, CheckCircle2,
  Layers, Calendar, AlertTriangle, Phone, Building2, CreditCard, ArrowRightLeft
} from "lucide-react";
import Link from "next/link";

interface PorEmpresa {
  nome: string; contratos: number; recebido: number;
  inadimplencia: number; clientesPagaram: number; eficiencia: number;
}

interface DadosConsultor {
  valorCarteira: number; valorRecebido: number; valorAParte: number;
  valorRemanejado: number; totalClientes: number; clientesPagaram: number;
  promessasAbertas: number; valorPromessasAbertas: number;
  promessasHoje: number; valorPromessasHoje: number;
  promessasVencidas: number; valorPromessasVencidas: number;
  agendadosHoje: number; percentualMeta: number; metaAlvo: number | null;
  metaQuantidade?: { alvo: number; realizado: number } | null;
  recebidoPorFormaPagamento: { pix_boleto: number; cartao_credito: number };
  porEmpresa: PorEmpresa[];
}

/* ── Sub-components ───────────────────────────────────────────────────────── */

function KpiCard({ titulo, valor, sub, icon: Icon, iconBg }: {
  titulo: string; valor: string; sub?: string;
  icon: React.ElementType; iconBg: string;
}) {
  return (
    <div className="bg-[#0f1525] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.09] transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{titulo}</p>
          <p className="text-xl font-bold text-white mt-1.5 tabular-nums leading-none">{valor}</p>
          {sub && <p className="text-xs text-slate-500 mt-1.5">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-xl flex-shrink-0 ${iconBg}`}>
          <Icon size={16} className="text-white opacity-90" />
        </div>
      </div>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */

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
      <div className="w-6 h-6 border-2 border-gr-500/60 border-t-gr-400 rounded-full animate-spin" />
    </div>
  );

  const totalRecebido   = dados.valorRecebido + dados.valorAParte;
  const pixBoleto       = dados.recebidoPorFormaPagamento?.pix_boleto    ?? 0;
  const cartaoCredito   = dados.recebidoPorFormaPagamento?.cartao_credito ?? 0;
  const totalPagamentos = pixBoleto + cartaoCredito;

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Meu Dashboard</h1>
          <p className="text-slate-500 text-xs mt-0.5">Acompanhe sua performance</p>
        </div>
        <select
          value={competenciaId}
          onChange={(e) => { setCompetenciaId(e.target.value); carregarDashboard(e.target.value); }}
          className="bg-[#0b0f1c] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gr-500/50 focus:border-gr-500/40 transition-all"
        >
          {competencias.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
        </select>
      </div>

      {/* Alerta */}
      {(dados.promessasHoje > 0 || dados.promessasVencidas > 0) && (
        <div className="bg-amber-500/[0.07] border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-amber-300 font-semibold text-xs uppercase tracking-wide">Atenção às promessas</p>
            <p className="text-slate-400 mt-1 text-xs">
              {dados.promessasHoje > 0 && `${dados.promessasHoje} promessa(s) vencem hoje · ${formatarMoeda(dados.valorPromessasHoje)}`}
              {dados.promessasHoje > 0 && dados.promessasVencidas > 0 && " · "}
              {dados.promessasVencidas > 0 && `${dados.promessasVencidas} vencida(s) · ${formatarMoeda(dados.valorPromessasVencidas)}`}
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard titulo="Carteira Total"   valor={formatarMoeda(dados.valorCarteira)}  sub={`${dados.totalClientes} clientes`}          icon={DollarSign}      iconBg="bg-white/[0.07]" />
        <KpiCard titulo="Total Recebido"   valor={formatarMoeda(totalRecebido)}         sub={`${dados.clientesPagaram ?? 0} pagaram`}    icon={TrendingUp}      iconBg="bg-gr-500/80" />
        <KpiCard titulo="À Parte"          valor={formatarMoeda(dados.valorAParte)}     sub="Fora da inadimplência"                      icon={Layers}          iconBg="bg-sky-600/80" />
        <KpiCard titulo="Remanejado"       valor={formatarMoeda(dados.valorRemanejado)} sub="Parcelas remanejadas"                       icon={ArrowRightLeft}  iconBg="bg-violet-600/80" />
      </div>

      {/* Metas */}
      {(dados.metaAlvo || dados.metaQuantidade) && (
        <div className="bg-[#0f1525] border border-white/[0.06] rounded-2xl p-5 space-y-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Progresso das Metas</h2>

          {dados.metaAlvo && (() => {
            const pct = dados.percentualMeta ?? 0;
            const cor = pct >= 100 ? "from-emerald-500 to-emerald-400" : pct >= 70 ? "from-gr-600 to-gr-400" : "from-slate-600 to-slate-500";
            return (
              <div>
                <div className="flex justify-between items-center mb-2.5">
                  <p className="text-sm text-white font-medium">Meta Financeira</p>
                  <span className={`text-sm font-bold tabular-nums ${pct >= 100 ? "text-emerald-400" : "text-gr-400"}`}>{pct.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full bg-gradient-to-r ${cor} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <div className="flex justify-between mt-2 text-xs text-slate-500">
                  <span>{formatarMoeda(totalRecebido)} recebido</span>
                  <span>{formatarMoeda(dados.metaAlvo)} meta</span>
                </div>
              </div>
            );
          })()}

          {dados.metaQuantidade && (() => {
            const { alvo, realizado } = dados.metaQuantidade!;
            const pct = alvo > 0 ? Math.min((realizado / alvo) * 100, 100) : 0;
            const cor = pct >= 100 ? "from-emerald-500 to-emerald-400" : pct >= 70 ? "from-gr-600 to-gr-400" : "from-slate-600 to-slate-500";
            return (
              <div>
                <div className="flex justify-between items-center mb-2.5">
                  <p className="text-sm text-white font-medium">Contratos Recuperados</p>
                  <span className={`text-sm font-bold tabular-nums ${pct >= 100 ? "text-emerald-400" : "text-gr-400"}`}>{realizado} / {alvo}</span>
                </div>
                <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full bg-gradient-to-r ${cor} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between mt-2 text-xs text-slate-500">
                  <span>{realizado} adimplente{realizado !== 1 ? "s" : ""}</span>
                  <span>meta: {alvo} contratos</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Meios de pagamento */}
      {totalPagamentos > 0 && (
        <div className="bg-[#0f1525] border border-white/[0.06] rounded-2xl p-5">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Recebimentos por Forma de Pagamento</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign size={13} className="text-emerald-400" />
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Pix · Boleto</p>
              </div>
              <p className="text-xl font-bold text-white tabular-nums">{formatarMoeda(pixBoleto)}</p>
              <p className="text-xs text-slate-500 mt-1">
                {totalPagamentos > 0 ? ((pixBoleto / totalPagamentos) * 100).toFixed(1) : "0.0"}% do total
              </p>
              <div className="h-1.5 bg-white/[0.06] rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full" style={{ width: `${totalPagamentos > 0 ? (pixBoleto / totalPagamentos) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard size={13} className="text-violet-400" />
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Cartão de Crédito</p>
              </div>
              <p className="text-xl font-bold text-white tabular-nums">{formatarMoeda(cartaoCredito)}</p>
              <p className="text-xs text-slate-500 mt-1">
                {totalPagamentos > 0 ? ((cartaoCredito / totalPagamentos) * 100).toFixed(1) : "0.0"}% do total
              </p>
              <div className="h-1.5 bg-white/[0.06] rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full" style={{ width: `${totalPagamentos > 0 ? (cartaoCredito / totalPagamentos) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Por empreendimento */}
      {dados.porEmpresa && dados.porEmpresa.length > 0 && (
        <div className="bg-[#0f1525] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={14} className="text-slate-500" />
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Por Empreendimento</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-slate-600 uppercase tracking-wider border-b border-white/[0.06]">
                  <th className="text-left pb-2.5 font-semibold">Empreendimento</th>
                  <th className="text-right pb-2.5 font-semibold">Contratos</th>
                  <th className="text-right pb-2.5 font-semibold">Pagaram</th>
                  <th className="text-right pb-2.5 font-semibold">Inadimplência</th>
                  <th className="text-right pb-2.5 font-semibold">Recebido</th>
                  <th className="text-right pb-2.5 font-semibold">Eficiência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {dados.porEmpresa.map((e) => (
                  <tr key={e.nome} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 text-slate-200 font-medium truncate max-w-[120px]">{e.nome}</td>
                    <td className="py-2.5 text-right text-slate-400 tabular-nums">{e.contratos}</td>
                    <td className="py-2.5 text-right text-emerald-400 font-medium tabular-nums">{e.clientesPagaram ?? 0}</td>
                    <td className="py-2.5 text-right text-slate-400 tabular-nums">{formatarMoeda(e.inadimplencia)}</td>
                    <td className="py-2.5 text-right text-slate-300 tabular-nums">{formatarMoeda(e.recebido)}</td>
                    <td className={`py-2.5 text-right font-semibold tabular-nums ${e.eficiencia >= 80 ? "text-emerald-400" : e.eficiencia >= 50 ? "text-amber-400" : "text-slate-500"}`}>
                      {e.eficiencia.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tarefas Diárias */}
      <div className="bg-[#0f1525] border border-white/[0.06] rounded-2xl p-5">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Minhas Tarefas Diárias</h2>
        <div className="space-y-2">
          <Link href="/pendencias" className="flex items-center justify-between p-3.5 bg-amber-500/[0.07] border border-amber-500/20 rounded-xl hover:bg-amber-500/[0.11] transition-colors group">
            <div className="flex items-center gap-3">
              <Clock size={14} className="text-amber-400 flex-shrink-0" />
              <div>
                <p className="text-white text-xs font-semibold">Promessas vencendo hoje</p>
                <p className="text-slate-500 text-xs mt-0.5">{formatarMoeda(dados.valorPromessasHoje)} agendado</p>
              </div>
            </div>
            <span className={`text-base font-bold tabular-nums ${dados.promessasHoje > 0 ? "text-amber-400" : "text-slate-500"}`}>{dados.promessasHoje}</span>
          </Link>

          <Link href="/pendencias" className="flex items-center justify-between p-3.5 bg-red-500/[0.07] border border-red-500/20 rounded-xl hover:bg-red-500/[0.11] transition-colors group">
            <div className="flex items-center gap-3">
              <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
              <div>
                <p className="text-white text-xs font-semibold">Promessas vencidas</p>
                <p className="text-slate-500 text-xs mt-0.5">{formatarMoeda(dados.valorPromessasVencidas)} não recebido</p>
              </div>
            </div>
            <span className={`text-base font-bold tabular-nums ${dados.promessasVencidas > 0 ? "text-red-400" : "text-slate-500"}`}>{dados.promessasVencidas}</span>
          </Link>

          <Link href="/carteira" className="flex items-center justify-between p-3.5 bg-sky-500/[0.07] border border-sky-500/20 rounded-xl hover:bg-sky-500/[0.11] transition-colors group">
            <div className="flex items-center gap-3">
              <Phone size={14} className="text-sky-400 flex-shrink-0" />
              <div>
                <p className="text-white text-xs font-semibold">Retornos agendados para hoje</p>
                <p className="text-slate-500 text-xs mt-0.5">Ligar depois / Aguardar retorno</p>
              </div>
            </div>
            <span className={`text-base font-bold tabular-nums ${dados.agendadosHoje > 0 ? "text-sky-400" : "text-slate-500"}`}>{dados.agendadosHoje}</span>
          </Link>

          {dados.promessasHoje === 0 && dados.promessasVencidas === 0 && dados.agendadosHoje === 0 && (
            <div className="flex items-center gap-2.5 p-3.5 bg-emerald-500/[0.07] border border-emerald-500/20 rounded-xl">
              <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
              <p className="text-emerald-300 text-xs font-medium">Nenhuma pendência para hoje!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
