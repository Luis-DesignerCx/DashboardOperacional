"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown, Loader2 } from "lucide-react";
import { formatarMoeda } from "@/lib/utils";

interface ItemRecebimento {
  id: string;
  contrato: string;
  cliente: string;
  empresa: string;
  valor: number;
  valorAParte: number;
  formaPagamento: string;
  observacao: string | null;
  hora: string;
}

interface ConsultorDia {
  id: string;
  nome: string;
  totalRecebido: number;
  totalAParte: number;
  itens: ItemRecebimento[];
}

export default function RelatorioDiarioPage() {
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [consultores, setConsultores] = useState<ConsultorDia[]>([]);
  const [totalGeral, setTotalGeral] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [expandido, setExpandido] = useState<string | null>(null);

  async function carregar(d: string) {
    setCarregando(true);
    const res = await fetch(`/api/relatorio-diario?data=${d}`).then((r) => r.json()).catch(() => null);
    setConsultores(res?.consultores ?? []);
    setTotalGeral(res?.totalGeral ?? 0);
    setCarregando(false);
  }

  useEffect(() => { carregar(data); }, [data]);

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <CalendarDays size={22} className="text-slate-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Relatório Diário</h1>
            <p className="text-slate-400 text-sm">Recebimento dos consultores por dia</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={data}
            max={hoje}
            onChange={(e) => setData(e.target.value)}
            className="bg-surface-2 border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gr-500/50 focus:border-gr-500/40"
          />
          {data !== hoje && (
            <button
              onClick={() => setData(hoje)}
              className="text-xs text-gr-400 hover:text-gr-300 px-2 py-1"
            >
              Hoje
            </button>
          )}
        </div>
      </div>

      <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-5">
        <p className="text-slate-400 text-sm">Total recebido no dia (todos abaixo)</p>
        <p className="text-3xl font-bold text-emerald-400 mt-1">{formatarMoeda(totalGeral)}</p>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : consultores.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">Nenhum consultor neste escopo.</div>
      ) : (
        <div className="space-y-2">
          {consultores.map((c) => {
            const total = c.totalRecebido + c.totalAParte;
            const aberto = expandido === c.id;
            return (
              <div key={c.id} className="bg-surface-2 border border-white/[0.06] rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpandido(aberto ? null : c.id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <ChevronDown size={16} className={`text-slate-500 transition-transform ${aberto ? "rotate-180" : ""}`} />
                    <span className="text-white font-medium text-sm">{c.nome}</span>
                    <span className="text-xs text-slate-500">
                      {c.itens.length} recebimento{c.itens.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    {c.totalAParte > 0 && (
                      <span className="text-xs text-sky-400">
                        {formatarMoeda(c.totalAParte)} a parte
                      </span>
                    )}
                    <span className={`text-sm font-bold tabular-nums ${total > 0 ? "text-emerald-400" : "text-slate-500"}`}>
                      {formatarMoeda(total)}
                    </span>
                  </div>
                </button>

                {aberto && c.itens.length > 0 && (
                  <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
                    {c.itens.map((item) => (
                      <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate">{item.cliente}</p>
                          <p className="text-xs text-slate-500">
                            {item.contrato} · {item.empresa} · {item.formaPagamento.replace(/_/g, " ")} ·{" "}
                            {new Date(item.hora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {item.valor > 0 && (
                            <p className="text-sm font-medium text-white tabular-nums">{formatarMoeda(item.valor)}</p>
                          )}
                          {item.valorAParte > 0 && (
                            <p className="text-xs text-sky-400 tabular-nums">{formatarMoeda(item.valorAParte)} a parte</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
