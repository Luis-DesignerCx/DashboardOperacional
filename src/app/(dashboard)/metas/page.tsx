"use client";

import { useEffect, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { Target, Plus } from "lucide-react";

interface Meta {
  id: string;
  nome: string;
  tipo: string;
  valorAlvo: number;
  peso: number;
  equipe: { nome: string; tipo: string };
  competencia: { descricao: string };
}

export default function MetasPage() {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch("/api/metas").then((r) => r.json()).then((d) => { setMetas(d); setCarregando(false); });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Metas</h1>
          <p className="text-slate-400 text-sm mt-1">Configuração de metas por equipe e competência</p>
        </div>
        <button className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus size={16} /> Nova Meta
        </button>
      </div>

      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : metas.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <Target size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400 font-medium">Nenhuma meta configurada</p>
          <p className="text-slate-600 text-sm mt-1">Importe a planilha e depois configure as metas por equipe.</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Meta</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Equipe</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Competência</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Valor Alvo</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Peso</th>
              </tr>
            </thead>
            <tbody>
              {metas.map((m) => (
                <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{m.nome}</td>
                  <td className="px-4 py-3 text-slate-400">{m.equipe.nome}</td>
                  <td className="px-4 py-3 text-slate-400">{m.competencia.descricao}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${m.tipo === "FINANCEIRA" ? "bg-sky-500/10 text-sky-400" : "bg-purple-500/10 text-purple-400"}`}>
                      {m.tipo === "FINANCEIRA" ? "Financeira" : "Qtd. Clientes"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-white font-semibold tabular-nums">{formatarMoeda(m.valorAlvo)}</td>
                  <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{m.peso}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
