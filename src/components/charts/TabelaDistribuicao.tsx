"use client";

import { useEffect, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { Building2, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const FRENTE_STYLE: Record<string, { dot: string; bar: string; badge: string }> = {
  "eq-flash":   { dot: "bg-sky-400",     bar: "bg-sky-500",     badge: "bg-sky-500/15 text-sky-300 border border-sky-500/25" },
  "eq-1-30":    { dot: "bg-emerald-400", bar: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25" },
  "eq-31-90":   { dot: "bg-amber-400",   bar: "bg-amber-500",   badge: "bg-amber-500/15 text-amber-300 border border-amber-500/25" },
  "eq-91-180":  { dot: "bg-orange-400",  bar: "bg-orange-500",  badge: "bg-orange-500/15 text-orange-300 border border-orange-500/25" },
  "eq-181plus": { dot: "bg-rose-400",    bar: "bg-rose-500",    badge: "bg-rose-500/15 text-rose-300 border border-rose-500/25" },
};

interface ConsultorDist {
  consultorId: string;
  nome: string;
  saldoAberto: number;
  recebido: number;
  contratos: number;
}

interface FrenteDist {
  equipeId: string;
  label: string;
  consultores: ConsultorDist[];
  total: { saldoAberto: number; recebido: number; contratos: number };
}

interface EmpresaDist {
  empresaId: string;
  nome: string;
  saldoAberto: number;
  recebido: number;
  contratos: number;
  percentual: number;
}

interface Props {
  competenciaId: string;
  equipeIds: string[];
}

export function TabelaDistribuicao({ competenciaId, equipeIds }: Props) {
  const [frentes, setFrente] = useState<FrenteDist[]>([]);
  const [porEmpresa, setPorEmpresa] = useState<EmpresaDist[]>([]);
  const [modo, setModo] = useState<"saldo" | "recebido">("saldo");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!competenciaId) return;
    setLoading(true);
    const params = new URLSearchParams({ competenciaId });
    if (equipeIds.length > 0) params.set("equipeIds", equipeIds.join(","));
    fetch(`/api/dashboard/distribuicao?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.frentes) setFrente(d.frentes);
        if (d.porEmpresa) setPorEmpresa(d.porEmpresa);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competenciaId, equipeIds.join(",")]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-24">
        <div className="w-5 h-5 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const frentesComDados = frentes.filter((f) => f.consultores.length > 0);

  const totalEmpresa = porEmpresa.reduce(
    (acc, e) => ({ saldoAberto: acc.saldoAberto + e.saldoAberto, recebido: acc.recebido + e.recebido, contratos: acc.contratos + e.contratos }),
    { saldoAberto: 0, recebido: 0, contratos: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho com toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-slate-400" />
          <h2 className="text-sm font-semibold text-white">Distribuição por Frente e Consultor</h2>
        </div>
        <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
          <button
            onClick={() => setModo("saldo")}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              modo === "saldo" ? "bg-gr-500/20 text-gr-300" : "text-slate-400 hover:text-white"
            )}
          >
            Saldo em aberto
          </button>
          <button
            onClick={() => setModo("recebido")}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              modo === "recebido" ? "bg-emerald-500/20 text-emerald-300" : "text-slate-400 hover:text-white"
            )}
          >
            Recebido no mês
          </button>
        </div>
      </div>

      {/* Cards por frente */}
      {frentesComDados.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-8">Nenhum dado para exibir.</p>
      ) : (
        <div
          className={cn(
            "grid gap-4",
            frentesComDados.length === 1 ? "grid-cols-1" :
            frentesComDados.length === 2 ? "grid-cols-1 lg:grid-cols-2" :
            frentesComDados.length <= 4  ? "grid-cols-1 lg:grid-cols-2" :
            "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"
          )}
        >
          {frentesComDados.map((frente) => {
            const style = FRENTE_STYLE[frente.equipeId] ?? {
              dot: "bg-slate-400", bar: "bg-slate-500",
              badge: "bg-slate-700 text-slate-300 border border-slate-600",
            };
            const valorTotal = modo === "saldo" ? frente.total.saldoAberto : frente.total.recebido;
            const consultoresOrdenados = [...frente.consultores].sort((a, b) => {
              const va = modo === "saldo" ? a.saldoAberto : a.recebido;
              const vb = modo === "saldo" ? b.saldoAberto : b.recebido;
              return vb - va;
            });

            return (
              <div key={frente.equipeId} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2 h-2 rounded-full flex-shrink-0", style.dot)} />
                    <span className={cn("text-xs font-semibold px-2.5 py-0.5 rounded-full", style.badge)}>
                      {frente.label}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums">{frente.total.contratos} contratos</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
                        <th className="text-left pb-2.5 font-medium">Consultor</th>
                        <th className="text-right pb-2.5 font-medium">Valor</th>
                        <th className="text-right pb-2.5 font-medium">Contr.</th>
                        <th className="text-right pb-2.5 font-medium w-20">Part. %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {consultoresOrdenados.map((c) => {
                        const valor = modo === "saldo" ? c.saldoAberto : c.recebido;
                        const pct = valorTotal > 0 ? (valor / valorTotal) * 100 : 0;
                        const primeiroNome = c.nome.split(" ").slice(0, 2).join(" ");
                        return (
                          <tr key={c.consultorId} className="group hover:bg-slate-800/40 transition-colors">
                            <td className="py-2.5 text-slate-200 font-medium truncate max-w-[110px] pr-2">
                              {primeiroNome}
                            </td>
                            <td className="py-2.5 text-right text-slate-300 tabular-nums">
                              {formatarMoeda(valor)}
                            </td>
                            <td className="py-2.5 text-right text-slate-500 tabular-nums">
                              {c.contratos}
                            </td>
                            <td className="py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={cn("h-full rounded-full transition-all", style.bar)}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                  />
                                </div>
                                <span className="text-slate-500 w-7 text-right tabular-nums">
                                  {pct.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-700">
                        <td className="pt-3 pb-0.5 text-white font-semibold">Total</td>
                        <td className="pt-3 pb-0.5 text-right text-white font-semibold tabular-nums">
                          {formatarMoeda(valorTotal)}
                        </td>
                        <td className="pt-3 pb-0.5 text-right text-white font-semibold tabular-nums">
                          {frente.total.contratos}
                        </td>
                        <td className="pt-3 pb-0.5 text-right text-slate-600 text-[10px]">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabela por empresa */}
      {porEmpresa.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={16} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-white">Distribuição por Empresa</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="text-left pb-2.5 font-medium">Empresa</th>
                  <th className="text-right pb-2.5 font-medium">Saldo Aberto</th>
                  <th className="text-right pb-2.5 font-medium">Recebido</th>
                  <th className="text-right pb-2.5 font-medium">Contratos</th>
                  <th className="text-right pb-2.5 font-medium">% Recup.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {porEmpresa.map((e) => (
                  <tr key={e.empresaId} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 text-slate-200 font-medium">{e.nome}</td>
                    <td className="py-2.5 text-right text-slate-300 tabular-nums">{formatarMoeda(e.saldoAberto)}</td>
                    <td className="py-2.5 text-right text-emerald-400 tabular-nums">{formatarMoeda(e.recebido)}</td>
                    <td className="py-2.5 text-right text-slate-400 tabular-nums">{e.contratos}</td>
                    <td className="py-2.5 text-right">
                      <span
                        className={cn(
                          "font-semibold",
                          e.percentual >= 10 ? "text-emerald-400" :
                          e.percentual >= 5  ? "text-amber-400"   : "text-slate-400"
                        )}
                      >
                        {e.percentual.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-700">
                  <td className="pt-3 pb-0.5 text-white font-semibold">Total</td>
                  <td className="pt-3 pb-0.5 text-right text-white font-semibold tabular-nums">{formatarMoeda(totalEmpresa.saldoAberto)}</td>
                  <td className="pt-3 pb-0.5 text-right text-emerald-400 font-semibold tabular-nums">{formatarMoeda(totalEmpresa.recebido)}</td>
                  <td className="pt-3 pb-0.5 text-right text-white font-semibold tabular-nums">{totalEmpresa.contratos}</td>
                  <td className="pt-3 pb-0.5 text-right text-slate-400 tabular-nums">
                    {totalEmpresa.saldoAberto > 0
                      ? ((totalEmpresa.recebido / totalEmpresa.saldoAberto) * 100).toFixed(1) + "%"
                      : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
