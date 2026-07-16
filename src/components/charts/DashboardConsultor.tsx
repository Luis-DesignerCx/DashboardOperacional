"use client";

import { useEffect, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import {
  TrendingUp, DollarSign, AlertCircle, Clock, CheckCircle2,
  Layers, Calendar, AlertTriangle, Phone, Building2, CreditCard, ArrowRightLeft
} from "lucide-react";
import Link from "next/link";

interface PorEmpresa {
  nome: string;
  contratos: number;
  recebido: number;
  eficiencia: number;
}

interface DadosConsultor {
  valorCarteira: number;
  valorRecebido: number;
  valorAParte: number;
  valorRemanejado: number;
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
  recebidoPorFormaPagamento: { pix_boleto: number; cartao_credito: number };
  porEmpresa: PorEmpresa[];
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

function BarraProgresso({ label, valor, maximo, cor, extra }: {
  label: string; valor: number; maximo: number; cor: string; extra?: string;
}) {
  const pct = maximo > 0 ? Math.min((valor / maximo) * 100, 100) : 0;
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm text-white">{label}</span>
        <span className="text-sm font-bold text-slate-300">{extra ?? `${pct.toFixed(1)}%`}</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${cor}`} style={{ width: `${pct}%` }} />
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

  const totalRecebido = dados.valorRecebido + dados.valorAParte;
  const pixBoleto = dados.recebidoPorFormaPagamento?.pix_boleto ?? 0;
  const cartaoCredito = dados.recebidoPorFormaPagamento?.cartao_credito ?? 0;
  const totalPagamentos = pixBoleto + cartaoCredito;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <CardMetrica
          titulo="Carteira Total"
          valor={formatarMoeda(dados.valorCarteira)}
          sub={`${dados.totalClientes} clientes`}
          icon={DollarSign}
          cor="bg-slate-700"
        />
        <CardMetrica
          titulo="Total Recebido"
          valor={formatarMoeda(totalRecebido)}
          sub={dados.metaAlvo ? `Meta: ${formatarMoeda(dados.metaAlvo)}` : "Inadimplência + À parte"}
          icon={TrendingUp}
          cor="bg-gr-500"
        />
        <CardMetrica
          titulo="À Parte"
          valor={formatarMoeda(dados.valorAParte)}
          sub="Fora da inadimplência"
          icon={Layers}
          cor="bg-sky-600"
        />
        <CardMetrica
          titulo="Remanejado"
          valor={formatarMoeda(dados.valorRemanejado)}
          sub="Parcelas remanejadas"
          icon={ArrowRightLeft}
          cor="bg-violet-600"
        />
      </div>

      {/* Metas */}
      {(dados.metaAlvo || dados.metaQuantidade) && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
          <h2 className="text-sm font-semibold text-white">Progresso das Metas</h2>

          {dados.metaAlvo && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm text-white">Meta Financeira</p>
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
                <span>{formatarMoeda(totalRecebido)} recebido</span>
                <span>{formatarMoeda(dados.metaAlvo)} meta</span>
              </div>
            </div>
          )}

          {dados.metaQuantidade && (() => {
            const { alvo, realizado } = dados.metaQuantidade!;
            const pct = alvo > 0 ? Math.min((realizado / alvo) * 100, 100) : 0;
            return (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm text-white">Contratos Recuperados</p>
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
              </div>
            );
          })()}
        </div>
      )}

      {/* Meios de pagamento */}
      {totalPagamentos > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Recebimentos por Meio de Pagamento</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Pix / Boleto / TED / Outros */}
            <div className="bg-slate-800/60 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign size={15} className="text-emerald-400" />
                <p className="text-xs text-slate-400 uppercase tracking-wide">Pix · Boleto · Link de Pagamento</p>
              </div>
              <p className="text-2xl font-bold text-white">{formatarMoeda(pixBoleto)}</p>
              <p className="text-xs text-slate-500 mt-1">
                {totalPagamentos > 0 ? ((pixBoleto / totalPagamentos) * 100).toFixed(1) : "0.0"}% do total
              </p>
              <div className="h-1.5 bg-slate-700 rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${totalPagamentos > 0 ? (pixBoleto / totalPagamentos) * 100 : 0}%` }} />
              </div>
            </div>

            {/* Cartão de crédito / débito */}
            <div className="bg-slate-800/60 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard size={15} className="text-violet-400" />
                <p className="text-xs text-slate-400 uppercase tracking-wide">Cartão de Crédito · Débito</p>
              </div>
              <p className="text-2xl font-bold text-white">{formatarMoeda(cartaoCredito)}</p>
              <p className="text-xs text-slate-500 mt-1">
                {totalPagamentos > 0 ? ((cartaoCredito / totalPagamentos) * 100).toFixed(1) : "0.0"}% do total
              </p>
              <div className="h-1.5 bg-slate-700 rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${totalPagamentos > 0 ? (cartaoCredito / totalPagamentos) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Por empreendimento */}
      {dados.porEmpresa && dados.porEmpresa.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={16} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-white">Por Empreendimento</h2>
          </div>
          <div className="space-y-3">
            {/* Cabeçalho da tabela */}
            <div className="grid grid-cols-4 gap-2 text-xs text-slate-500 uppercase tracking-wide px-1 pb-1 border-b border-slate-800">
              <span>Empreendimento</span>
              <span className="text-right">Contratos</span>
              <span className="text-right">Recebido</span>
              <span className="text-right">Eficiência</span>
            </div>
            {dados.porEmpresa.map((e) => (
              <div key={e.nome} className="grid grid-cols-4 gap-2 items-center px-1 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors">
                <span className="text-sm text-white truncate">{e.nome}</span>
                <span className="text-sm text-slate-300 text-right">{e.contratos}</span>
                <span className="text-sm text-slate-300 text-right">{formatarMoeda(e.recebido)}</span>
                <span className={`text-sm font-semibold text-right ${e.eficiencia >= 80 ? "text-emerald-400" : e.eficiencia >= 50 ? "text-amber-400" : "text-slate-400"}`}>
                  {e.eficiencia.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tarefas Diárias */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Minhas Tarefas Diárias</h2>
        <div className="space-y-3">
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
