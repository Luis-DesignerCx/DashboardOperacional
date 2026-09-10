"use client";

import { formatarDataHora } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { History, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";

interface ItemHistorico {
  id: string;
  tipo: string;
  dataHora: string;
  arquivo: string;
  linhas: number;
  erros: number;
  usuario: string;
  status: string;
}

interface Props {
  itens: ItemHistorico[];
  carregando: boolean;
}

function badgeStatus(status: string, erros: number) {
  if (status === "ERRO") return { label: "Erro", cls: "bg-red-500/10 text-red-400 border-red-500/20" };
  if (status === "PROCESSANDO" || status === "AGUARDANDO") return { label: "Em andamento", cls: "bg-sky-500/10 text-sky-400 border-sky-500/20" };
  if (erros > 0) return { label: "Concluído com avisos", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
  return { label: "Sucesso", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
}

export function HistoricoImportacoes({ itens, carregando }: Props) {
  const [aberto, setAberto] = useState(true);

  return (
    <div className="bg-surface-2 border border-white/[0.06] rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center justify-between gap-2 p-5 text-left"
      >
        <div className="flex items-center gap-2">
          <History size={14} className="text-slate-500" />
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Histórico de Importações</h2>
        </div>
        <ChevronDown size={14} className={cn("text-slate-600 transition-transform", aberto && "rotate-180")} />
      </button>

      {aberto && (
        <div className="px-5 pb-5">
          {carregando ? (
            <div className="flex justify-center py-6">
              <Loader2 size={18} className="animate-spin text-slate-500" />
            </div>
          ) : itens.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-6">Nenhuma importação registrada nesta competência ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-slate-600 uppercase tracking-wider border-b border-white/[0.05]">
                    <th className="text-left pb-2.5 pr-4 font-semibold">Data/Hora</th>
                    <th className="text-left pb-2.5 pr-4 font-semibold">Tipo</th>
                    <th className="text-left pb-2.5 pr-6 font-semibold">Arquivo</th>
                    <th className="text-right pb-2.5 pr-6 font-semibold">Linhas</th>
                    <th className="text-left pb-2.5 pr-4 font-semibold">Usuário</th>
                    <th className="text-right pb-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {itens.map((item) => {
                    const badge = badgeStatus(item.status, item.erros);
                    return (
                      <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 pr-4 text-slate-400 whitespace-nowrap">{formatarDataHora(item.dataHora)}</td>
                        <td className="py-2.5 pr-4 text-slate-300">{item.tipo}</td>
                        <td className="py-2.5 pr-6 text-slate-400 truncate max-w-[200px]">{item.arquivo}</td>
                        <td className="py-2.5 pr-6 text-right text-slate-300 tabular-nums">{item.linhas}</td>
                        <td className="py-2.5 pr-4 text-slate-400">{item.usuario}</td>
                        <td className="py-2.5 text-right">
                          <span className={cn("inline-block px-2 py-0.5 rounded-full border text-[10px] font-medium", badge.cls)}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
