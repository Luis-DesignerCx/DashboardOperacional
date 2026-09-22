"use client";

import { formatarMoeda } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Building2 } from "lucide-react";

interface EmpresaDist {
  empresaId: string; nome: string; saldoAberto: number;
  recebidoInadimplente: number; parcelaMes: number;
  contratosRecuperados: number; contratos: number; percentual: number;
}

interface Props {
  porEmpresa: EmpresaDist[];
}

function corBadgeRecuperacao(pct: number): string {
  return pct >= 10 ? "bg-emerald-500/10 text-emerald-400" : pct >= 5 ? "bg-amber-500/10 text-amber-400" : "bg-white/[0.04] text-slate-500";
}

export function SaudeEmpreendimentos({ porEmpresa }: Props) {
  const total = porEmpresa.reduce(
    (acc, e) => ({
      saldoAberto: acc.saldoAberto + e.saldoAberto,
      recebidoInadimplente: acc.recebidoInadimplente + e.recebidoInadimplente,
      parcelaMes: acc.parcelaMes + e.parcelaMes,
      contratosRecuperados: acc.contratosRecuperados + e.contratosRecuperados,
      contratos: acc.contratos + e.contratos,
    }),
    { saldoAberto: 0, recebidoInadimplente: 0, parcelaMes: 0, contratosRecuperados: 0, contratos: 0 }
  );
  const percentualTotal = total.saldoAberto > 0 ? (total.recebidoInadimplente / total.saldoAberto) * 100 : 0;

  return (
    <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Building2 size={14} className="text-slate-500" />
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Performance por Empreendimento</h2>
      </div>

      {porEmpresa.length === 0 ? (
        <p className="text-slate-600 text-xs text-center py-8">Nenhum dado para exibir.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-slate-600 uppercase tracking-wider border-b border-white/[0.05]">
                <th className="text-left pb-2.5 font-semibold">Empreendimento</th>
                <th className="text-right pb-2.5 font-semibold">Recebido Inadimplente</th>
                <th className="text-right pb-2.5 font-semibold">Parcela Mês</th>
                <th className="text-center pb-2.5 font-semibold">Contr. Recuperados</th>
                <th className="text-right pb-2.5 font-semibold">Saldo sob Gestão</th>
                <th className="text-center pb-2.5 font-semibold">Contr. sob Gestão</th>
                <th className="text-right pb-2.5 font-semibold">% Recuperação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {porEmpresa.map((e) => (
                <tr key={e.empresaId} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 text-left text-slate-200 font-bold">{e.nome}</td>
                  <td className="py-2.5 text-right text-slate-200 font-semibold tabular-nums">{formatarMoeda(e.recebidoInadimplente)}</td>
                  <td className="py-2.5 text-right text-slate-400 tabular-nums">{formatarMoeda(e.parcelaMes)}</td>
                  <td className="py-2.5 text-center text-slate-500 tabular-nums">{e.contratosRecuperados}</td>
                  <td className="py-2.5 text-right text-slate-400 tabular-nums">{formatarMoeda(e.saldoAberto)}</td>
                  <td className="py-2.5 text-center text-slate-500 tabular-nums">{e.contratos}</td>
                  <td className="py-2.5 text-right">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums", corBadgeRecuperacao(e.percentual))}>
                      {e.percentual.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/[0.07]">
                <td className="pt-3 pb-0.5 text-white font-semibold">Total</td>
                <td className="pt-3 pb-0.5 text-right text-white font-semibold tabular-nums">{formatarMoeda(total.recebidoInadimplente)}</td>
                <td className="pt-3 pb-0.5 text-right text-white font-semibold tabular-nums">{formatarMoeda(total.parcelaMes)}</td>
                <td className="pt-3 pb-0.5 text-center text-white font-semibold tabular-nums">{total.contratosRecuperados}</td>
                <td className="pt-3 pb-0.5 text-right text-white font-semibold tabular-nums">{formatarMoeda(total.saldoAberto)}</td>
                <td className="pt-3 pb-0.5 text-center text-white font-semibold tabular-nums">{total.contratos}</td>
                <td className="pt-3 pb-0.5 text-right text-slate-500 text-[10px] tabular-nums">
                  {total.saldoAberto > 0 ? `${percentualTotal.toFixed(1)}%` : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
