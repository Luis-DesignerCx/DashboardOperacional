"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Download, FileSpreadsheet, CheckCircle, Clock, Lock, AlertCircle, XCircle } from "lucide-react";
import { formatarMoeda } from "@/lib/utils";

interface ImportacaoResumo {
  id: string;
  nomeArquivo: string;
  totalContratos: number;
  totalLinhas: number;
  erros: number;
  status: string;
  criadoEm: string;
  concluidoEm: string | null;
}

interface CompetenciaHistorico {
  id: string;
  descricao: string;
  mes: number;
  ano: number;
  fechada: boolean;
  fechadaEm: string | null;
  totalContratos: number;
  inadimplencia: number;
  ultimaImportacao: ImportacaoResumo | null;
}

export default function HistoricoPage() {
  const { data: session } = useSession();
  const isGestorOuAdmin = ["GESTOR", "ADMINISTRADOR"].includes((session?.user as any)?.perfil ?? "");

  const [dados, setDados] = useState<CompetenciaHistorico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [exportando, setExportando] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const [fechando, setFechando] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/historico")
      .then((r) => r.json())
      .then((d) => { setDados(d); setCarregando(false); })
      .catch(() => setCarregando(false));
  }, []);

  async function cancelarImport(importacaoId: string) {
    setCancelando(importacaoId);
    try {
      await fetch(`/api/historico/cancelar?importacaoId=${importacaoId}`, { method: "PATCH" });
      const res = await fetch("/api/historico");
      setDados(await res.json());
    } finally {
      setCancelando(null);
    }
  }

  async function fecharCompetencia(competenciaId: string, descricao: string) {
    if (!confirm(`Fechar a competência "${descricao}"?\n\nApós fechada, não será possível importar novos dados para ela. Essa ação não pode ser desfeita.`)) return;
    setFechando(competenciaId);
    try {
      const res = await fetch(`/api/competencias/${competenciaId}`, { method: "PATCH" });
      if (!res.ok) { const d = await res.json(); alert(d.erro || "Erro ao fechar competência"); return; }
      const fresh = await fetch("/api/historico");
      setDados(await fresh.json());
    } finally {
      setFechando(null);
    }
  }

  async function exportar(competenciaId: string, descricao: string) {
    setExportando(competenciaId);
    try {
      const res = await fetch(`/api/historico/exportar?competenciaId=${competenciaId}`);
      if (!res.ok) { alert("Erro ao exportar."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inadimplencia_${descricao.replace(/\s+/g, "_")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportando(null);
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Histórico de Inadimplência</h1>
        <p className="text-slate-400 text-sm mt-1">
          Registros mensais de importação. Exporte qualquer competência para XLSX.
        </p>
      </div>

      {dados.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <FileSpreadsheet size={40} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Nenhuma competência encontrada</p>
          <p className="text-slate-400 text-sm mt-1">Importe uma planilha para começar.</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-4">Competência</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-4">Contratos</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-4">Inadimplência</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-4">Última Importação</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-4">Status</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {dados.map((comp) => (
                <tr key={comp.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {comp.fechada ? (
                        <Lock size={14} className="text-slate-500 flex-shrink-0" />
                      ) : (
                        <Clock size={14} className="text-gr-400 flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-white font-medium">{comp.descricao}</p>
                        {comp.fechadaEm && (
                          <p className="text-xs text-slate-400">
                            Fechada em {new Date(comp.fechadaEm).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums text-slate-300">
                    {comp.totalContratos.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums text-slate-300">
                    {formatarMoeda(comp.inadimplencia)}
                  </td>
                  <td className="px-6 py-4">
                    {comp.ultimaImportacao ? (
                      <div>
                        <p className="text-slate-300 text-xs truncate max-w-[200px]">
                          {comp.ultimaImportacao.nomeArquivo}
                        </p>
                        <p className="text-slate-400 text-xs">
                          {new Date(comp.ultimaImportacao.criadoEm).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                          {" · "}{comp.ultimaImportacao.totalContratos} contratos
                          {comp.ultimaImportacao.erros > 0 && (
                            <span className="text-amber-500"> · {comp.ultimaImportacao.erros} erros</span>
                          )}
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">Sem importação</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {comp.ultimaImportacao ? (
                      <ImportacaoStatusBadge status={comp.ultimaImportacao.status} />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {comp.ultimaImportacao?.status === "PROCESSANDO" && (
                        <button
                          onClick={() => cancelarImport(comp.ultimaImportacao!.id)}
                          disabled={cancelando === comp.ultimaImportacao.id}
                          className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                        >
                          <XCircle size={14} />
                          {cancelando === comp.ultimaImportacao.id ? "Cancelando..." : "Cancelar"}
                        </button>
                      )}
                      {isGestorOuAdmin && !comp.fechada && (
                        <button
                          onClick={() => fecharCompetencia(comp.id, comp.descricao)}
                          disabled={fechando === comp.id}
                          className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50 transition-colors"
                        >
                          <Lock size={14} />
                          {fechando === comp.id ? "Fechando..." : "Fechar ciclo"}
                        </button>
                      )}
                      <button
                        onClick={() => exportar(comp.id, comp.descricao)}
                        disabled={exportando === comp.id || !comp.ultimaImportacao}
                        className="flex items-center gap-1.5 text-xs text-gr-400 hover:text-gr-300 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                      >
                        <Download size={14} />
                        {exportando === comp.id ? "Exportando..." : "Exportar XLSX"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ImportacaoStatusBadge({ status }: { status: string }) {
  if (status === "CONCLUIDO") return (
    <span className="flex items-center gap-1 text-xs text-emerald-400">
      <CheckCircle size={12} /> Concluído
    </span>
  );
  if (status === "ERRO") return (
    <span className="flex items-center gap-1 text-xs text-red-400">
      <AlertCircle size={12} /> Erro
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs text-amber-400">
      <Clock size={12} /> {status}
    </span>
  );
}
