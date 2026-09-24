"use client";

import { useEffect, useState, useRef } from "react";
import * as XLSX from "xlsx";
import { formatarDataHora } from "@/lib/utils";
import { ClipboardList, CheckCircle, XCircle, Clock, ArrowLeftRight, X, Search, Loader2, Download, Check, ArrowRight } from "lucide-react";
import { useSession } from "next-auth/react";
import { usePersistedState } from "@/hooks/usePersistedState";

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
  destinoConsultorNome?: string | null;
}

function fluxoOrigemDestino(s: Solicitacao): { origem: string; origemFrente?: string; destino: string; destinoFrente?: string; frenteDiferente: boolean } | null {
  if (s.tipo !== "TRANSFERENCIA_CONTRATO" || !s.contrato) return null;
  const donoAtual = s.contrato.carteiras?.[0]?.consultor;
  // "Enviar": o próprio dono (solicitante) pediu pra mandar pra um colega --
  // origem é o solicitante, destino é quem foi escolhido.
  if (s.destinoConsultorNome) {
    return { origem: s.solicitante.nome, origemFrente: s.solicitante.equipe ? (FRENTE_LABEL[s.solicitante.equipe.tipo] ?? s.solicitante.equipe.nome) : undefined, destino: s.destinoConsultorNome, frenteDiferente: false };
  }
  if (!donoAtual) return null;
  const frenteSolicitante = s.solicitante.equipe?.tipo;
  const frenteDono = donoAtual.equipe?.tipo;
  const frenteDiferente = !!(frenteSolicitante && frenteDono && frenteSolicitante !== frenteDono);
  return {
    origem: donoAtual.nome,
    origemFrente: donoAtual.equipe ? (FRENTE_LABEL[donoAtual.equipe.tipo] ?? donoAtual.equipe.nome) : undefined,
    destino: s.solicitante.nome,
    destinoFrente: s.solicitante.equipe ? (FRENTE_LABEL[s.solicitante.equipe.tipo] ?? s.solicitante.equipe.nome) : undefined,
    frenteDiferente,
  };
}

function exportarRelatorio(lista: Solicitacao[]) {
  const linhas = lista.map((s) => {
    const donoAtual = s.contrato?.carteiras?.[0]?.consultor;
    return {
      Status: LABEL_STATUS[s.status]?.label ?? s.status,
      Tipo: LABEL_TIPO[s.tipo] ?? s.tipo,
      Cliente: s.contrato?.cliente.nome ?? "",
      Contrato: s.contrato?.numero ?? "",
      Empreendimento: s.contrato?.empresa?.nome ?? "",
      Solicitante: s.solicitante.nome,
      "Frente Solicitante": s.solicitante.equipe ? (FRENTE_LABEL[s.solicitante.equipe.tipo] ?? s.solicitante.equipe.nome) : "",
      "Dono Atual": donoAtual?.nome ?? s.destinoConsultorNome ?? "",
      Motivo: s.motivo,
      Resposta: s.resposta ?? "",
      "Data/Hora": formatarDataHora(s.criadoEm),
    };
  });
  const ws = XLSX.utils.json_to_sheet(linhas);
  ws["!cols"] = [{ wch: 12 }, { wch: 26 }, { wch: 30 }, { wch: 16 }, { wch: 22 }, { wch: 26 }, { wch: 16 }, { wch: 26 }, { wch: 40 }, { wch: 40 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Solicitações");
  XLSX.writeFile(wb, `solicitacoes_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function SolicitacoesPage() {
  const { data: session } = useSession();
  const isGestorOuAdmin = ["ADMINISTRADOR", "GESTOR"].includes((session?.user as any)?.perfil ?? "");

  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [filtroStatus, setFiltroStatus] = usePersistedState<string[]>("filtroStatus", []);
  const [filtroTipo, setFiltroTipo] = usePersistedState<string[]>("filtroTipoSolicitacao", []);
  const [carregando, setCarregando] = useState(true);
  const [modalTransf, setModalTransf] = useState(false);
  const [rejeitandoId, setRejeitandoId] = useState<string | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [enviandoId, setEnviandoId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/solicitacoes").then((r) => r.json()).then((d) => { setSolicitacoes(d); setCarregando(false); });
  }, []);

  const porTipo = filtroTipo.length === 0 ? solicitacoes : solicitacoes.filter((s) => filtroTipo.includes(s.tipo));
  const filtradas = filtroStatus.length === 0 ? porTipo : porTipo.filter((s) => filtroStatus.includes(s.status));

  // Contagem de pendentes acompanha o filtro de Tipo (pra saber "quantas
  // pendentes existem desse tipo"), mas não o filtro de Status -- é a
  // contagem que justifica o badge no próprio pill "Pendentes".
  const totalPendentes = porTipo.filter((s) => s.status === "PENDENTE").length;

  async function decidir(id: string, status: "APROVADA" | "REJEITADA", resposta?: string) {
    setEnviandoId(id);
    const res = await fetch(`/api/solicitacoes/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, resposta: resposta || undefined }),
      headers: { "Content-Type": "application/json" },
    });
    setEnviandoId(null);
    if (res.ok) {
      setSolicitacoes((prev) => prev.map((x) => x.id === id ? { ...x, status, resposta: resposta || x.resposta } : x));
      setRejeitandoId(null);
      setMotivoRejeicao("");
    } else if (status === "APROVADA") {
      alert("Erro ao aprovar. Verifique o console.");
    } else {
      alert("Erro ao rejeitar. Verifique o console.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Solicitações</h1>
          <p className="text-slate-400 text-sm mt-1">
            {totalPendentes > 0 ? <span className="text-amber-400">{totalPendentes} pendente(s) aguardando aprovação</span> : "Nenhuma pendência"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportarRelatorio(filtradas)}
            disabled={filtradas.length === 0}
            className="flex items-center gap-2 bg-surface-2 hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed border border-white/[0.08] text-slate-300 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            <Download size={15} />
            Exportar Relatório
          </button>
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
      </div>

      {modalTransf && (
        <TransferenciaModal onClose={() => setModalTransf(false)} />
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        {["TODOS", "PENDENTE", "APROVADA", "REJEITADA"].map((s) => {
          const ativo = s === "TODOS" ? filtroStatus.length === 0 : filtroStatus.includes(s);
          return (
            <button
              key={s}
              onClick={() => {
                if (s === "TODOS") { setFiltroStatus([]); return; }
                setFiltroStatus((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                ativo ? "bg-sky-500 text-white" : "bg-white/[0.07] text-slate-400 hover:text-white"
              }`}
            >
              {s === "TODOS" ? "Todos" : LABEL_STATUS[s]?.label}
              {s === "PENDENTE" && totalPendentes > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${ativo ? "bg-white/25 text-white" : "bg-amber-500/20 text-amber-400"}`}>
                  {totalPendentes}
                </span>
              )}
            </button>
          );
        })}
        <div className="w-px h-6 bg-white/[0.08] mx-1" />
        {["TODOS", ...Object.keys(LABEL_TIPO)].map((t) => {
          const ativo = t === "TODOS" ? filtroTipo.length === 0 : filtroTipo.includes(t);
          return (
            <button
              key={t}
              onClick={() => {
                if (t === "TODOS") { setFiltroTipo([]); return; }
                setFiltroTipo((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
              }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                ativo ? "bg-sky-500 text-white" : "bg-white/[0.07] text-slate-400 hover:text-white"
              }`}
            >
              {t === "TODOS" ? "Todos os Tipos" : LABEL_TIPO[t]}
            </button>
          );
        })}
      </div>

      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-12 text-center">
          <ClipboardList size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400">Nenhuma solicitação encontrada para os filtros selecionados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map((s) => {
            const st = LABEL_STATUS[s.status];
            const Icon = st.icon;
            const fluxo = fluxoOrigemDestino(s);
            const rejeitando = rejeitandoId === s.id;
            return (
              <div key={s.id} className="bg-surface-2 border border-white/[0.06] rounded-2xl p-5">
                {/* Cabeçalho do card */}
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium flex items-center gap-1.5 ${st.cor}`}>
                      <Icon size={12} /> {st.label}
                    </span>
                    <span className="text-xs text-slate-500 bg-surface-1 px-2 py-1 rounded-full">
                      {LABEL_TIPO[s.tipo]}
                    </span>
                  </div>
                  <p className="text-slate-500 text-xs flex-shrink-0">{formatarDataHora(s.criadoEm)}</p>
                </div>

                {/* Corpo: grid de 3 colunas */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Coluna 1: Cliente */}
                  <div className="min-w-0">
                    {s.contrato ? (
                      <>
                        <p className="text-white font-bold truncate">{s.contrato.cliente.nome}</p>
                        <p className="text-slate-400 text-xs mt-0.5">{s.contrato.numero}</p>
                        {s.contrato.empresa?.nome && (
                          <p className="text-slate-500 text-xs mt-0.5">{s.contrato.empresa.nome}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-white font-bold truncate">{s.solicitante.nome}</p>
                    )}
                  </div>

                  {/* Coluna 2: Atores / Fluxo */}
                  <div className="min-w-0">
                    {fluxo ? (
                      <div className={`rounded-lg px-3 py-2 border text-xs ${fluxo.frenteDiferente ? "bg-amber-500/10 border-amber-500/30" : "bg-surface-1 border-white/[0.08]"}`}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-300 font-medium">{fluxo.origem}</span>
                          {fluxo.origemFrente && <span className="text-slate-500">({fluxo.origemFrente})</span>}
                          <ArrowRight size={12} className="text-slate-500 flex-shrink-0" />
                          <span className="text-slate-300 font-medium">{fluxo.destino}</span>
                          {fluxo.destinoFrente && <span className="text-slate-500">({fluxo.destinoFrente})</span>}
                        </div>
                        {fluxo.frenteDiferente && (
                          <p className="text-[11px] text-amber-400 font-medium mt-1">⚠ Transferência entre frentes diferentes</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-500 text-xs">
                        Solicitante: <span className="text-slate-400">{s.solicitante.nome}</span>
                        {s.solicitante.equipe && (
                          <span className="text-slate-500"> · Frente: <span className="text-slate-400">{FRENTE_LABEL[s.solicitante.equipe.tipo] ?? s.solicitante.equipe.nome}</span></span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Coluna 3: Motivo */}
                  <div className="min-w-0">
                    <div className="bg-surface-1 border border-white/[0.08] rounded-lg px-3 py-2 h-full">
                      <p className="text-slate-400 text-xs">{s.motivo}</p>
                      {s.resposta && (
                        <p className="text-slate-500 text-xs mt-1.5 pt-1.5 border-t border-white/[0.06] italic">Resposta: {s.resposta}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ações para pendentes */}
                {s.status === "PENDENTE" && (
                  <div className="mt-4 pt-4 border-t border-white/[0.05]">
                    {rejeitando ? (
                      <div className="space-y-2">
                        <textarea
                          autoFocus
                          value={motivoRejeicao}
                          onChange={(e) => setMotivoRejeicao(e.target.value)}
                          placeholder="Motivo da recusa (opcional)..."
                          rows={2}
                          className="w-full bg-surface-1 border border-white/[0.08] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-rose-500 placeholder:text-slate-500"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => { setRejeitandoId(null); setMotivoRejeicao(""); }}
                            className="px-3 py-1.5 text-xs rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => decidir(s.id, "REJEITADA", motivoRejeicao)}
                            disabled={enviandoId === s.id}
                            className="px-3 py-1.5 text-xs rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/25 hover:bg-rose-500/25 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                          >
                            {enviandoId === s.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                            Confirmar rejeição
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setRejeitandoId(s.id)}
                          className="px-4 py-2 text-xs font-medium rounded-lg text-rose-400 border border-rose-500/25 hover:bg-rose-500/10 transition-colors"
                        >
                          Rejeitar
                        </button>
                        <button
                          onClick={() => decidir(s.id, "APROVADA")}
                          disabled={enviandoId === s.id}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white transition-colors"
                        >
                          {enviandoId === s.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Aprovar
                        </button>
                      </div>
                    )}
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
      <div className="bg-surface-2 border border-white/[0.08] rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={16} className="text-sky-400" />
            <h2 className="text-white font-semibold">Transferência Direta</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.03] transition-colors">
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
                      className="w-full bg-surface-1 border border-white/[0.08] rounded-xl pl-9 pr-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-500"
                      placeholder="Nome do cliente ou número do contrato..."
                      value={busca}
                      onChange={(e) => { setBusca(e.target.value); setSelecionado(null); }}
                    />
                    {buscando && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 animate-spin" />}
                  </div>
                </div>

                {resultados.length > 0 && (
                  <div className="border border-white/[0.08] rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                    {resultados.map((r) => (
                      <button
                        key={r.contratoId}
                        onClick={() => { setSelecionado(r); setBusca(""); setResultados([]); setConsultorDestinoId(""); }}
                        className="w-full flex items-start justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors border-b border-white/[0.08]/50 last:border-0 text-left"
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
                <div className="bg-surface-1 border border-white/[0.08] rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-white font-semibold">{selecionado.cliente}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{selecionado.numero} · {selecionado.empresa}</p>
                      <p className="text-slate-500 text-xs mt-1">Carteira atual: <span className="text-slate-300">{selecionado.consultorAtual}</span></p>
                    </div>
                    <button
                      onClick={() => setSelecionado(null)}
                      className="text-slate-500 hover:text-white p-1 rounded-lg hover:bg-white/[0.04] transition-colors"
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
                    className="w-full bg-surface-1 border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
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
                    className="flex-1 bg-surface-1 hover:bg-white/[0.04] text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors"
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
