"use client";

import { useMemo, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { BarChart3 } from "lucide-react";

interface ConsultorDist {
  consultorId: string; nome: string; saldoAberto: number; recebido: number;
  contratos: number; contratosRecebidos: number;
}
interface FrenteDist {
  equipeId: string; label: string; consultores: ConsultorDist[];
  total: { saldoAberto: number; recebido: number; contratos: number; contratosRecebidos: number };
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
        saldoAberto: 0, recebido: 0, contratos: 0, contratosRecebidos: 0,
      };
      acc.saldoAberto += c.saldoAberto;
      acc.recebido += c.recebido;
      acc.contratos += c.contratos;
      acc.contratosRecebidos += c.contratosRecebidos;
      mapa.set(c.consultorId, acc);
    }
  }
  const consultores = [...mapa.values()].sort((a, b) => b.recebido - a.recebido);
  const total = consultores.reduce(
    (acc, c) => ({
      saldoAberto: acc.saldoAberto + c.saldoAberto,
      recebido: acc.recebido + c.recebido,
      contratos: acc.contratos + c.contratos,
      contratosRecebidos: acc.contratosRecebidos + c.contratosRecebidos,
    }),
    { saldoAberto: 0, recebido: 0, contratos: 0, contratosRecebidos: 0 }
  );
  return { equipeId: "geral", label: "Geral", consultores, total };
}

function pctRecuperado(saldoAberto: number, recebido: number): number {
  if (saldoAberto <= 0) return recebido > 0 ? 100 : 0;
  return Math.min((recebido / saldoAberto) * 100, 100);
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

  const consultoresOrdenados = [...aba.consultores].sort((a, b) => b.recebido - a.recebido);

  return (
    <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-slate-500" />
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Matriz de Performance da Equipe</h2>
        </div>
        <div className="flex bg-white/[0.04] rounded-xl p-0.5 border border-white/[0.06] overflow-x-auto">
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
              <th className="text-left pb-2.5 font-semibold w-8">#</th>
              <th className="text-left pb-2.5 font-semibold">Consultor</th>
              <th className="text-right pb-2.5 font-semibold">Recebido no Mês</th>
              <th className="text-right pb-2.5 font-semibold">Contr. Recebidos</th>
              <th className="text-right pb-2.5 font-semibold">Saldo sob Gestão</th>
              <th className="text-right pb-2.5 font-semibold">% Recuperado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {consultoresOrdenados.map((c, i) => {
              const pct = pctRecuperado(c.saldoAberto, c.recebido);
              return (
                <tr key={c.consultorId} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5">
                    <span className={cn(
                      "w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold",
                      RANK_STYLE[i] ?? "bg-white/[0.04] text-slate-500"
                    )}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-2.5 text-slate-200 font-medium truncate max-w-[160px]">{c.nome}</td>
                  <td className="py-2.5 text-right text-slate-100 font-semibold tabular-nums">{formatarMoeda(c.recebido)}</td>
                  <td className="py-2.5 text-right text-slate-500 tabular-nums">{c.contratosRecebidos}</td>
                  <td className="py-2.5 text-right text-slate-400 tabular-nums">{formatarMoeda(c.saldoAberto)}</td>
                  <td className="py-2.5 text-right">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums",
                      pct >= 20 ? "bg-emerald-500/10 text-emerald-400" : pct >= 8 ? "bg-amber-500/10 text-amber-400" : "bg-white/[0.04] text-slate-500"
                    )}>
                      {pct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/[0.07]">
              <td colSpan={2} className="pt-3 pb-0.5 text-white font-semibold">Total</td>
              <td className="pt-3 pb-0.5 text-right text-white font-semibold tabular-nums">{formatarMoeda(aba.total.recebido)}</td>
              <td className="pt-3 pb-0.5 text-right text-slate-400 font-semibold tabular-nums">{aba.total.contratosRecebidos}</td>
              <td className="pt-3 pb-0.5 text-right text-white font-semibold tabular-nums">{formatarMoeda(aba.total.saldoAberto)}</td>
              <td className="pt-3 pb-0.5 text-right text-slate-500 text-[10px] tabular-nums">
                {pctRecuperado(aba.total.saldoAberto, aba.total.recebido).toFixed(1)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
