"use client";

import { useEffect, useState } from "react";
import { formatarDataHora } from "@/lib/utils";
import { ClipboardList, CheckCircle, XCircle, Clock } from "lucide-react";

const LABEL_TIPO: Record<string, string> = {
  TRANSFERENCIA_CONTRATO: "Transferência de Contrato",
  INADIMPLENCIA_EQUIVOCADA: "Inadimplência Equivocada",
  DIVERGENCIA_RECEBIMENTO: "Divergência de Recebimento",
};

const LABEL_STATUS: Record<string, { label: string; cor: string; icon: React.ElementType }> = {
  PENDENTE: { label: "Pendente", cor: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: Clock },
  APROVADA: { label: "Aprovada", cor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: CheckCircle },
  REJEITADA: { label: "Rejeitada", cor: "bg-red-500/10 text-red-400 border-red-500/20", icon: XCircle },
};

const FRENTE_LABEL: Record<string, string> = {
  FLASH: "Flash", CRA_1_30: "1 a 30", CR_31_90: "31 a 90",
  CR_PDD_91_180: "CR PDD - 91+",
};

interface Equipe { nome: string; tipo: string }
interface Solicitacao {
  id: string;
  tipo: string;
  status: string;
  motivo: string;
  resposta?: string;
  criadoEm: string;
  solicitante: { nome: string; equipe?: Equipe | null };
  contrato?: {
    numero: string;
    cliente: { nome: string };
    carteiras?: { consultor: { nome: string; equipe?: Equipe | null } }[];
  } | null;
}

export default function SolicitacoesPage() {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch("/api/solicitacoes").then((r) => r.json()).then((d) => { setSolicitacoes(d); setCarregando(false); });
  }, []);

  const filtradas = filtroStatus === "TODOS"
    ? solicitacoes
    : solicitacoes.filter((s) => s.status === filtroStatus);

  const pendentes = solicitacoes.filter((s) => s.status === "PENDENTE").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Solicitações</h1>
          <p className="text-slate-400 text-sm mt-1">
            {pendentes > 0 ? <span className="text-amber-400">{pendentes} pendente(s) aguardando aprovação</span> : "Nenhuma pendência"}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {["TODOS", "PENDENTE", "APROVADA", "REJEITADA"].map((s) => (
          <button
            key={s}
            onClick={() => setFiltroStatus(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filtroStatus === s
                ? "bg-sky-500 text-white"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            {s === "TODOS" ? "Todos" : LABEL_STATUS[s]?.label}
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <ClipboardList size={40} className="mx-auto mb-3 text-slate-400" />
          <p className="text-slate-400">Nenhuma solicitação encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map((s) => {
            const st = LABEL_STATUS[s.status];
            const Icon = st.icon;
            return (
              <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2.5 py-1 rounded-full border font-medium flex items-center gap-1.5 ${st.cor}`}>
                        <Icon size={12} /> {st.label}
                      </span>
                      <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded-full">
                        {LABEL_TIPO[s.tipo]}
                      </span>
                    </div>
                    <p className="text-white font-medium">{s.solicitante.nome}</p>
                    {s.solicitante.equipe && (
                      <p className="text-slate-500 text-xs">
                        Frente: <span className="text-slate-400">{FRENTE_LABEL[s.solicitante.equipe.tipo] ?? s.solicitante.equipe.nome}</span>
                      </p>
                    )}
                    {s.tipo === "TRANSFERENCIA_CONTRATO" && s.contrato && (() => {
                      const donoAtual = s.contrato.carteiras?.[0]?.consultor;
                      const frenteSolicitante = s.solicitante.equipe?.tipo;
                      const frenteDono = donoAtual?.equipe?.tipo;
                      const frenteDiferente = frenteSolicitante && frenteDono && frenteSolicitante !== frenteDono;
                      return (
                        <div className={`mt-1 rounded-lg px-3 py-2 border text-sm ${frenteDiferente ? "bg-amber-500/10 border-amber-500/30" : "bg-slate-800 border-slate-700"}`}>
                          <p className={`font-mono text-xs ${frenteDiferente ? "text-amber-300" : "text-slate-300"}`}>
                            {s.contrato.cliente.nome} · {s.contrato.numero}
                          </p>
                          {donoAtual && (
                            <p className="text-xs mt-0.5 text-slate-400">
                              Dono atual: <span className="text-slate-300">{donoAtual.nome}</span>
                              {donoAtual.equipe && <span className={`ml-1 ${frenteDiferente ? "text-amber-400 font-medium" : "text-slate-500"}`}>({FRENTE_LABEL[donoAtual.equipe.tipo] ?? donoAtual.equipe.nome})</span>}
                            </p>
                          )}
                          {frenteDiferente && (
                            <p className="text-[11px] text-amber-400 font-medium mt-1">⚠ Transferência entre frentes diferentes</p>
                          )}
                        </div>
                      );
                    })()}
                    <p className="text-slate-400 text-sm mt-1">{s.motivo}</p>
                    {s.resposta && (
                      <p className="text-slate-500 text-sm mt-1 italic">Resposta: {s.resposta}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-slate-500 text-xs">{formatarDataHora(s.criadoEm)}</p>
                    {s.status === "PENDENTE" && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={async () => {
                            const res = await fetch(`/api/solicitacoes/${s.id}`, { method: "PATCH", body: JSON.stringify({ status: "REJEITADA" }), headers: { "Content-Type": "application/json" } });
                            if (res.ok) setSolicitacoes((prev) => prev.map((x) => x.id === s.id ? { ...x, status: "REJEITADA" } : x));
                          }}
                          className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                        >
                          Rejeitar
                        </button>
                        <button
                          onClick={async () => {
                            const res = await fetch(`/api/solicitacoes/${s.id}`, { method: "PATCH", body: JSON.stringify({ status: "APROVADA" }), headers: { "Content-Type": "application/json" } });
                            if (res.ok) setSolicitacoes((prev) => prev.map((x) => x.id === s.id ? { ...x, status: "APROVADA" } : x));
                            else alert("Erro ao aprovar. Verifique o console.");
                          }}
                          className="px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                        >
                          Aprovar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
