"use client";

import { useMemo, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { BarChart3 } from "lucide-react";

interface ConsultorDist {
  consultorId: string; nome: string; saldoAberto: number;
  recebidoInadimplente: number; parcelaMes: number;
  contratos: number; contratosRecebidos: number; metaAlvo: number | null;
}
interface FrenteDist {
  equipeId: string; label: string; consultores: ConsultorDist[];
  total: { saldoAberto: number; recebidoInadimplente: number; parcelaMes: number; contratos: number; contratosRecebidos: number; metaAlvo: number };
}

interface Props {
  frentes: FrenteDist[];
}

function mesclarGeral(frentes: FrenteDist[]): FrenteDist {
  const mapa = new Map<string, ConsultorDist>();
  for (const f of frentes) {
    for (const c of f.consultores) {
      const acc = mapa.get(c.consultorId) ?? {
        consultorId: c.consultorId, nome: c.nome,
        saldoAberto: 0, recebidoInadimplente: 0, parcelaMes: 0, contratos: 0, contratosRecebidos: 0, metaAlvo: 0,
      };
      acc.saldoAberto += c.saldoAberto;
      acc.recebidoInadimplente += c.recebidoInadimplente;
      acc.parcelaMes += c.parcelaMes;
      acc.contratos += c.contratos;
      acc.contratosRecebidos += c.contratosRecebidos;
      acc.metaAlvo = (acc.metaAlvo ?? 0) + (c.metaAlvo ?? 0);
      mapa.set(c.consultorId, acc);
    }
  }
  const consultores = [...mapa.values()].sort((a, b) => (b.recebidoInadimplente + b.parcelaMes) - (a.recebidoInadimplente + a.parcelaMes));
  const total = consultores.reduce(
    (acc, c) => ({
      saldoAberto: acc.saldoAberto + c.saldoAberto,
      recebidoInadimplente: acc.recebidoInadimplente + c.recebidoInadimplente,
      parcelaMes: acc.parcelaMes + c.parcelaMes,
      contratos: acc.contratos + c.contratos,
      contratosRecebidos: acc.contratosRecebidos + c.contratosRecebidos,
      metaAlvo: acc.metaAlvo + (c.metaAlvo ?? 0),
    }),
    { saldoAberto: 0, recebidoInadimplente: 0, parcelaMes: 0, contratos: 0, contratosRecebidos: 0, metaAlvo: 0 }
  );
  return { equipeId: "geral", label: "Geral", consultores, total };
}

function pctRecuperado(saldoAberto: number, recebidoInadimplente: number): number {
  if (saldoAberto <= 0) return recebidoInadimplente > 0 ? 100 : 0;
  return Math.min((recebidoInadimplente / saldoAberto) * 100, 100);
}

function pctMeta(metaAlvo: number | null, recebidoInadimplente: number, parcelaMes: number): number | null {
  if (!metaAlvo || metaAlvo <= 0) return null;
  return ((recebidoInadimplente + parcelaMes) / metaAlvo) * 100;
}

function corBadgeMeta(pct: number | null): string {
  if (pct === null) return "bg-white/[0.04] text-slate-500";
  if (pct >= 100) return "bg-emerald-500/10 text-emerald-400";
  if (pct >= 80) return "bg-sky-500/10 text-sky-400";
  if (pct >= 50) return "bg-amber-500/10 text-amber-400";
  return "bg-rose-500/10 text-rose-400";
}

function corBadgeRecuperado(pct: number): string {
  return pct >= 20 ? "bg-emerald-500/10 text-emerald-400" : pct >= 8 ? "bg-amber-500/10 text-amber-400" : "bg-white/[0.04] text-slate-500";
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

const RANK_STYLE = [
  "bg-amber-500/15 text-amber-400",
  "bg-white/[0.08] text-slate-300",
  "bg-orange-700/15 text-orange-400",
];

export function MatrizPerformance({ frentes }: Props) {
  const frentesComDados = useMemo(() => frentes.filter((f) => f.consultores.length > 0), [frentes]);
  const abas = useMemo(() => {
    const geral = mesclarGeral(frentesComDados);
    return geral.consultores.length > 0 ? [geral, ...frentesComDados] : frentesComDados;
  }, [frentesComDados]);

  const [abaAtiva, setAbaAtiva] = useState(0);
  const aba = abas[Math.min(abaAtiva, abas.length - 1)];

  if (abas.length === 0) {
    return (
      <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 size={14} className="text-slate-500" />
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Matriz de Performance da Equipe</h2>
        </div>
        <p className="text-slate-600 text-xs text-center py-8">Nenhum dado para exibir.</p>
      </div>
    );
  }

  const consultoresOrdenados = [...aba.consultores].sort((a, b) => (b.recebidoInadimplente + b.parcelaMes) - (a.recebidoInadimplente + a.parcelaMes));
  const pctMetaTotal = pctMeta(aba.total.metaAlvo, aba.total.recebidoInadimplente, aba.total.parcelaMes);

  return (
    <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-slate-500" />
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Matriz de Performance da Equipe</h2>
        </div>
        <div className="flex bg-white/[0.04] rounded-xl p-0.5 border border-white/[0.06] overflow-x-auto ml-auto">
          {abas.map((f, i) => (
            <button
              key={f.equipeId}
              onClick={() => setAbaAtiva(i)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                i === abaAtiva ? "bg-gr-500/20 text-gr-300" : "text-slate-500 hover:text-slate-300"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-slate-600 uppercase tracking-wider border-b border-white/[0.05]">
              <th className="text-center pb-2.5 font-semibold w-8">#</th>
              <th className="text-left pb-2.5 font-semibold">Consultor</th>
              <th className="text-right pb-2.5 font-semibold">Recebido Inadimplente</th>
              <th className="text-right pb-2.5 font-semibold">Parcela Mês</th>
              <th className="text-right pb-2.5 font-semibold">% da Meta</th>
              <th className="text-center pb-2.5 font-semibold">Contr. Recebidos</th>
              <th className="text-right pb-2.5 font-semibold">Saldo sob Gestão</th>
              <th className="text-right pb-2.5 font-semibold">% Recuperado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {consultoresOrdenados.map((c, i) => {
              const pctRec = pctRecuperado(c.saldoAberto, c.recebidoInadimplente);
              const pctM = pctMeta(c.metaAlvo, c.recebidoInadimplente, c.parcelaMes);
              return (
                <tr key={c.consultorId} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 text-center">
                    <span className={cn(
                      "inline-flex w-5 h-5 rounded-full items-center justify-center text-[10px] font-bold",
                      RANK_STYLE[i] ?? "bg-white/[0.04] text-slate-500"
                    )}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-2.5 text-left">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-white/[0.06] text-slate-400 flex items-center justify-center text-[9px] font-semibold flex-shrink-0">
                        {iniciais(c.nome)}
                      </span>
                      <span className="text-slate-200 font-medium truncate max-w-[140px]">{c.nome}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right text-slate-200 font-semibold tabular-nums">{formatarMoeda(c.recebidoInadimplente)}</td>
                  <td className="py-2.5 text-right text-slate-400 tabular-nums">{formatarMoeda(c.parcelaMes)}</td>
                  <td className="py-2.5 text-right">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums", corBadgeMeta(pctM))}>
                      {pctM === null ? "—" : `${pctM.toFixed(1)}%`}
                    </span>
                  </td>
                  <td className="py-2.5 text-center text-slate-500 tabular-nums">{c.contratosRecebidos}</td>
                  <td className="py-2.5 text-right text-slate-400 tabular-nums">{formatarMoeda(c.saldoAberto)}</td>
                  <td className="py-2.5 text-right">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums", corBadgeRecuperado(pctRec))}>
                      {pctRec.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/[0.07]">
              <td className="pt-3 pb-0.5" />
              <td className="pt-3 pb-0.5 text-white font-semibold">Total</td>
              <td className="pt-3 pb-0.5 text-right text-white font-semibold tabular-nums">{formatarMoeda(aba.total.recebidoInadimplente)}</td>
              <td className="pt-3 pb-0.5 text-right text-white font-semibold tabular-nums">{formatarMoeda(aba.total.parcelaMes)}</td>
              <td className="pt-3 pb-0.5 text-right text-slate-400 text-[10px] tabular-nums">
                {pctMetaTotal === null ? "—" : `${pctMetaTotal.toFixed(1)}%`}
              </td>
              <td className="pt-3 pb-0.5 text-center text-slate-400 font-semibold tabular-nums">{aba.total.contratosRecebidos}</td>
              <td className="pt-3 pb-0.5 text-right text-white font-semibold tabular-nums">{formatarMoeda(aba.total.saldoAberto)}</td>
              <td className="pt-3 pb-0.5 text-right text-slate-500 text-[10px] tabular-nums">
                {pctRecuperado(aba.total.saldoAberto, aba.total.recebidoInadimplente).toFixed(1)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
