"use client";

import { useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { CalendarClock, ArrowUpRight, Users } from "lucide-react";
import Link from "next/link";

interface Bucket { count: number; valor: number; clientes: number }

interface Props {
  hoje: Bucket;
  vencidas: Bucket;
  futuro: Bucket;
}

const ABAS = [
  { key: "hoje" as const,     label: "Hoje" },
  { key: "vencidas" as const, label: "Vencidas" },
  { key: "futuro" as const,   label: "Futuro" },
];

const TOM: Record<string, string> = {
  hoje:     "text-amber-400",
  vencidas: "text-red-400",
  futuro:   "text-sky-400",
};

const LABEL_VAZIO: Record<"hoje" | "vencidas" | "futuro", string> = {
  hoje: "para hoje",
  vencidas: "vencida",
  futuro: "futura",
};

type ChaveAba = "hoje" | "vencidas" | "futuro";

export function PainelAgendamentos({ hoje, vencidas, futuro }: Props) {
  const [abasSelecionadas, setAbasSelecionadas] = useState<Set<ChaveAba>>(() => new Set(["hoje"]));

  function toggleAba(key: ChaveAba) {
    setAbasSelecionadas((prev) => {
      if (prev.has(key) && prev.size === 1) return prev; // nunca deixa zerar
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const buckets: Record<ChaveAba, Bucket> = { hoje, vencidas, futuro };
  const dados = ABAS.reduce(
    (acc, a) => {
      if (!abasSelecionadas.has(a.key)) return acc;
      const b = buckets[a.key];
      return { count: acc.count + b.count, valor: acc.valor + b.valor, clientes: acc.clientes + b.clientes };
    },
    { count: 0, valor: 0, clientes: 0 }
  );
  const [unicaSelecionada] = abasSelecionadas;
  const cor = abasSelecionadas.size === 1 ? TOM[unicaSelecionada] : "text-slate-200";

  return (
    <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock size={14} className="text-slate-500" />
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Agendamentos e Promessas</h2>
        </div>
        <div className="flex bg-white/[0.04] rounded-xl p-0.5 border border-white/[0.06]">
          {ABAS.map((a) => (
            <button
              key={a.key}
              onClick={() => toggleAba(a.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                abasSelecionadas.has(a.key) ? "bg-gr-500/20 text-gr-300" : "text-slate-500 hover:text-slate-300"
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Valor Total Agendado</p>
          <p className={cn("text-2xl font-bold mt-1.5 tabular-nums leading-none", cor)}>{formatarMoeda(dados.valor)}</p>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide flex items-center justify-end gap-1">
              <Users size={10} /> Clientes
            </p>
            <p className="text-lg font-semibold text-slate-200 mt-1 tabular-nums">{dados.clientes}</p>
          </div>
          <div className="text-right">
            <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide">Promessas</p>
            <p className="text-lg font-semibold text-slate-200 mt-1 tabular-nums">{dados.count}</p>
          </div>
        </div>
      </div>

      {dados.count === 0 && (
        <p className="text-xs text-slate-600 mt-3">
          {abasSelecionadas.size > 1
            ? "Nenhuma promessa nas categorias selecionadas."
            : `Nenhuma promessa ${LABEL_VAZIO[unicaSelecionada]}.`}
        </p>
      )}

      <Link href="/pendencias" className="flex items-center gap-1 text-xs text-gr-400 hover:text-gr-300 transition-colors mt-4 w-fit">
        Ver em Pendências <ArrowUpRight size={12} />
      </Link>
    </div>
  );
}
