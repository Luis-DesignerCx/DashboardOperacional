"use client";

import { useEffect, useState } from "react";
import { formatarDataHora } from "@/lib/utils";
import { Shield, Search } from "lucide-react";

const COR_ACAO: Record<string, string> = {
  CREATE: "bg-emerald-500/10 text-emerald-400",
  UPDATE: "bg-sky-500/10 text-sky-400",
  DELETE: "bg-red-500/10 text-red-400",
  LOGIN: "bg-purple-500/10 text-purple-400",
  IMPORT: "bg-amber-500/10 text-amber-400",
};

interface RegistroAuditoria {
  id: string;
  acao: string;
  tabela: string;
  campo?: string;
  valorAnterior?: string;
  valorNovo?: string;
  motivo?: string;
  ip?: string;
  criadoEm: string;
  usuario: { nome: string; email: string };
}

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch("/api/auditoria").then((r) => r.json()).then((d) => { setRegistros(d); setCarregando(false); });
  }, []);

  const filtrados = registros.filter((r) => {
    const q = busca.toLowerCase();
    return r.usuario.nome.toLowerCase().includes(q) || r.tabela.toLowerCase().includes(q) || r.acao.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Shield size={24} className="text-purple-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Auditoria</h1>
          <p className="text-slate-400 text-sm">Registro completo de todas as ações do sistema</p>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Filtrar por usuário, tabela ou ação..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Data/Hora</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Usuário</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Ação</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Tabela</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-3 text-slate-400 text-xs tabular-nums whitespace-nowrap">{formatarDataHora(r.criadoEm)}</td>
                    <td className="px-4 py-3">
                      <p className="text-white text-xs">{r.usuario.nome}</p>
                      <p className="text-slate-500 text-xs">{r.usuario.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${COR_ACAO[r.acao] || "bg-slate-700 text-slate-300"}`}>
                        {r.acao}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">{r.tabela}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">{r.motivo || r.campo || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtrados.length === 0 && (
            <div className="text-center py-10 text-slate-500">
              <p>Nenhum registro encontrado</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
