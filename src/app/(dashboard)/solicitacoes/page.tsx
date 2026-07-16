"use client";

import { useEffect, useState, useRef } from "react";
import { formatarDataHora } from "@/lib/utils";
import { ClipboardList, CheckCircle, XCircle, Clock, ArrowLeftRight, X, Search, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";

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
    empresa: { nome: string };
    carteiras?: { consultor: { nome: string; equipe?: Equipe | null } }[];
  } | null;
}

export default function SolicitacoesPage() {
  const { data: session } = useSession();
  const isGestorOuAdmin = ["ADMINISTRADOR", "GESTOR"].includes((session?.user as any)?.perfil ?? "");

  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [carregando, setCarregando] = useState(true);
  const [modalTransf, setModalTransf] = useState(false);

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
        {isGestorOuAdmin && (
          <button
            onClick={() => setModalTransf(true)}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <ArrowLeftRight size={15} />
            Transferência Direta
          </button>
        )}
      </div>

      {modalTransf && (
        <TransferenciaModal onClose={() => setModalTransf(false)} />
      )}

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
                    {/* Cliente / Contrato / Empresa — aparece para todos os tipos */}
                    {s.contrato ? (
                      <div className="mt-1 mb-2">
                        <p className="text-white font-semibold">{s.contrato.cliente.nome}</p>
                        <p className="text-slate-400 text-xs mt-0.5">
                          {s.contrato.numero}
                          {s.contrato.empresa?.nome && (
                            <span className="text-slate-500"> · {s.contrato.empresa.nome}</span>
                          )}
                        </p>
                      </div>
                    ) : (
                      <p className="text-white font-medium mb-1">{s.solicitante.nome}</p>
                    )}

                    {/* Solicitante / Frente */}
                    <p className="text-slate-500 text-xs">
                      Solicitante: <span className="text-slate-400">{s.solicitante.nome}</span>
                      {s.solicitante.equipe && (
                        <span className="text-slate-500"> · Frente: <span className="text-slate-400">{FRENTE_LABEL[s.solicitante.equipe.tipo] ?? s.solicitante.equipe.nome}</span></span>
                      )}
                    </p>

                    {/* Info extra para transferência */}
                    {s.tipo === "TRANSFERENCIA_CONTRATO" && s.contrato && (() => {
                      const donoAtual = s.contrato.carteiras?.[0]?.consultor;
                      const frenteSolicitante = s.solicitante.equipe?.tipo;
                      const frenteDono = donoAtual?.equipe?.tipo;
                      const frenteDiferente = frenteSolicitante && frenteDono && frenteSolicitante !== frenteDono;
                      return donoAtual ? (
                        <div className={`mt-1.5 rounded-lg px-3 py-2 border text-xs ${frenteDiferente ? "bg-amber-500/10 border-amber-500/30" : "bg-slate-800 border-slate-700"}`}>
                          <p className="text-slate-400">
                            Dono atual: <span className="text-slate-300">{donoAtual.nome}</span>
                            {donoAtual.equipe && <span className={`ml-1 ${frenteDiferente ? "text-amber-400 font-medium" : "text-slate-500"}`}>({FRENTE_LABEL[donoAtual.equipe.tipo] ?? donoAtual.equipe.nome})</span>}
                          </p>
                          {frenteDiferente && (
                            <p className="text-[11px] text-amber-400 font-medium mt-1">⚠ Transferência entre frentes diferentes</p>
                          )}
                        </div>
                      ) : null;
                    })()}

                    <p className="text-slate-400 text-sm mt-1.5">{s.motivo}</p>
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

// ─── Modal de Transferência Direta ────────────────────────────────────────────

interface ResultadoBusca {
  contratoId: string;
  numero: string;
  cliente: string;
  empresa: string;
  statusRecuperacao: string;
  consultorAtualId: string;
  consultorAtual: string;
}

interface Consultor { id: string; nome: string }

function TransferenciaModal({ onClose }: { onClose: () => void }) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [selecionado, setSelecionado] = useState<ResultadoBusca | null>(null);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [consultorDestinoId, setConsultorDestinoId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/usuarios")
      .then((r) => r.json())
      .then((d) => setConsultores(Array.isArray(d) ? d.filter((u: any) => u.perfil === "CONSULTOR" && u.ativo) : []));
  }, []);

  useEffect(() => {
    if (busca.length < 2) { setResultados([]); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setBuscando(true);
      fetch(`/api/carteira/transferir?q=${encodeURIComponent(busca)}`)
        .then((r) => r.json())
        .then((d) => { setResultados(Array.isArray(d) ? d : []); setBuscando(false); })
        .catch(() => setBuscando(false));
    }, 300);
  }, [busca]);

  async function confirmar() {
    if (!selecionado || !consultorDestinoId) return;
    setSalvando(true);
    setErro("");
    const res = await fetch("/api/carteira/transferir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contratoId: selecionado.contratoId, consultorDestinoId }),
    });
    const data = await res.json();
    setSalvando(false);
    if (!res.ok) { setErro(data.erro || "Erro ao transferir"); return; }
    setSucesso(true);
  }

  const STATUS_LABEL: Record<string, string> = {
    INADIMPLENTE: "Inadimplente",
    RECUPERACAO_PARCIAL: "Rec. Parcial",
    RECUPERADO_INTEGRALMENTE: "Adimplente",
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={16} className="text-sky-400" />
            <h2 className="text-white font-semibold">Transferência Direta</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {sucesso ? (
          <div className="p-6 text-center space-y-3">
            <CheckCircle size={36} className="mx-auto text-emerald-400" />
            <p className="text-white font-semibold">Transferência realizada com sucesso</p>
            <p className="text-slate-400 text-sm">
              {selecionado?.cliente} foi transferido para{" "}
              <span className="text-white">{consultores.find((c) => c.id === consultorDestinoId)?.nome}</span>
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium rounded-xl transition-colors"
            >
              Fechar
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Busca de contrato */}
            {!selecionado ? (
              <>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Buscar contrato ou cliente *</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      autoFocus
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-500"
                      placeholder="Nome do cliente ou número do contrato..."
                      value={busca}
                      onChange={(e) => { setBusca(e.target.value); setSelecionado(null); }}
                    />
                    {buscando && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 animate-spin" />}
                  </div>
                </div>

                {resultados.length > 0 && (
                  <div className="border border-slate-700 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                    {resultados.map((r) => (
                      <button
                        key={r.contratoId}
                        onClick={() => { setSelecionado(r); setBusca(""); setResultados([]); setConsultorDestinoId(""); }}
                        className="w-full flex items-start justify-between px-4 py-3 hover:bg-slate-800 transition-colors border-b border-slate-700/50 last:border-0 text-left"
                      >
                        <div>
                          <p className="text-white text-sm font-medium">{r.cliente}</p>
                          <p className="text-slate-400 text-xs mt-0.5">{r.numero} · {r.empresa}</p>
                          <p className="text-slate-500 text-xs mt-0.5">Atual: {r.consultorAtual}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full mt-1 flex-shrink-0 ${
                          r.statusRecuperacao === "RECUPERADO_INTEGRALMENTE" ? "bg-emerald-500/15 text-emerald-400" :
                          r.statusRecuperacao === "RECUPERACAO_PARCIAL" ? "bg-amber-500/15 text-amber-400" :
                          "bg-red-500/15 text-red-400"
                        }`}>
                          {STATUS_LABEL[r.statusRecuperacao] ?? r.statusRecuperacao}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {busca.length >= 2 && !buscando && resultados.length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-2">Nenhum contrato encontrado na carteira ativa</p>
                )}
              </>
            ) : (
              <>
                {/* Contrato selecionado */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-white font-semibold">{selecionado.cliente}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{selecionado.numero} · {selecionado.empresa}</p>
                      <p className="text-slate-500 text-xs mt-1">Carteira atual: <span className="text-slate-300">{selecionado.consultorAtual}</span></p>
                    </div>
                    <button
                      onClick={() => setSelecionado(null)}
                      className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Consultor destino */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Transferir para *</label>
                  <select
                    value={consultorDestinoId}
                    onChange={(e) => setConsultorDestinoId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">Selecione o consultor...</option>
                    {consultores
                      .filter((c) => c.id !== selecionado.consultorAtualId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                  </select>
                </div>

                {erro && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={onClose}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmar}
                    disabled={!consultorDestinoId || salvando}
                    className="flex-1 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {salvando ? <><Loader2 size={14} className="animate-spin" /> Transferindo...</> : "Confirmar Transferência"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
