"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { formatarMoeda } from "@/lib/utils";
import {
  ArrowLeft, Phone, Mail, FileText,
  Calendar, Clock, CheckCircle2, AlertCircle, User, Pencil, Check, X, Trash2, AlertTriangle, Loader2,
} from "lucide-react";

interface Contrato {
  id: string;
  numero: string;
  situacao: string;
  statusContrato: string | null;
  maiorDiasAtraso: number | null;
  valorTotalAberto: number | null;
  valorContrato: number | null;
  totalParcelasVencidas: number | null;
  statusRecuperacao: string;
  empresa: { nome: string };
  parcelas: {
    id: string;
    numero: number;
    dataVencimento: string;
    diasAtraso: number;
    valorParcela: number;
    valorTotalAberto: number;
    origem: string | null;
    meioPagamento: string | null;
    paga: boolean;
  }[];
  recebimentos: {
    id: string;
    valor: number;
    valorAParte: number | null;
    dataRecebimento: string;
    formaPagamento: string;
    consultorId: string;
    parcelasIds: string[];
  }[];
  contatos: { id: string; tipo: string; status: string; observacao: string | null; criadoEm: string }[];
  promessas: { id: string; valorPrometido: number; dataPrometida: string; formaPagamento: string }[];
  carteiras: { consultor: { nome: string }; competencia: { descricao: string } }[];
}

interface Cliente {
  id: string;
  nome: string;
  cpf: string | null;
  telefones: string | null;
  emails: string | null;
  contratos: Contrato[];
}

function badgeDias(dias: number) {
  if (dias <= 0) return "bg-blue-500/15 text-blue-400 border border-blue-500/20";
  if (dias <= 30) return "bg-amber-500/15 text-amber-400 border border-amber-500/20";
  if (dias <= 90) return "bg-orange-500/15 text-orange-400 border border-orange-500/20";
  if (dias <= 180) return "bg-red-500/15 text-red-400 border border-red-500/20";
  return "bg-red-900/30 text-red-300 border border-red-700/30";
}

function labelDias(dias: number) {
  if (dias <= 0) return "Flash";
  if (dias <= 30) return "1–30 dias";
  if (dias <= 90) return "31–90 dias";
  if (dias <= 180) return "91–180 dias";
  return "181+ dias";
}

const INPUT = "w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-gr-500";
const BTN_SAVE = "flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gr-500 text-white text-xs font-medium hover:bg-gr-600 transition-colors disabled:opacity-50";
const BTN_CANCEL = "flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition-colors";

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const perfil = (session?.user as any)?.perfil as string | undefined;
  const isGestorOuAdmin = perfil === "GESTOR" || perfil === "ADMINISTRADOR";
  const meuId = (session?.user as any)?.id as string | undefined;

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [erro, setErro] = useState("");
  const [contratoAberto, setContratoAberto] = useState<string | null>(null);

  const [editandoCliente, setEditandoCliente] = useState(false);
  const [clienteForm, setClienteForm] = useState({ nome: "", telefones: "", emails: "" });
  const [editandoContrato, setEditandoContrato] = useState(false);
  const [contratoForm, setContratoForm] = useState({ maiorDiasAtraso: "", valorTotalAberto: "", statusContrato: "" });
  const [editandoParcela, setEditandoParcela] = useState<string | null>(null);
  const [parcelaForm, setParcelaForm] = useState({ valorParcela: "", valorTotalAberto: "", diasAtraso: "", dataVencimento: "", paga: false });
  const [editandoRecebimento, setEditandoRecebimento] = useState<string | null>(null);
  const [recValor, setRecValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Modal Inadimplência equivocada
  const [inadEquivContratoId, setInadEquivContratoId] = useState<string | null>(null);
  const [inadEquivJustificativa, setInadEquivJustificativa] = useState("");
  const [salvandoInadEquiv, setSalvandoInadEquiv] = useState(false);
  const [erroInadEquiv, setErroInadEquiv] = useState("");

  useEffect(() => {
    fetch(`/api/clientes/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { setErro(d.erro); return; }
        setCliente(d);
        if (d.contratos?.[0]) setContratoAberto(d.contratos[0].id);
      })
      .catch(() => setErro("Erro de conexão"));
  }, [id]);

  async function submeterInadEquivocada() {
    if (!inadEquivContratoId) return;
    if (!inadEquivJustificativa.trim()) { setErroInadEquiv("Informe o motivo da contestação"); return; }
    setSalvandoInadEquiv(true);
    setErroInadEquiv("");
    const res = await fetch(`/api/contratos/${inadEquivContratoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ situacao: "INADIMPLENCIA_EQUIVOCADA", justificativa: inadEquivJustificativa.trim() }),
    });
    setSalvandoInadEquiv(false);
    if (!res.ok) {
      const d = await res.json();
      setErroInadEquiv(d.erro || "Erro ao enviar solicitação");
      return;
    }
    // Atualiza situação localmente
    setCliente((prev) => prev ? {
      ...prev,
      contratos: prev.contratos.map((c) =>
        c.id === inadEquivContratoId ? { ...c, situacao: "INADIMPLENCIA_EQUIVOCADA" } : c
      ),
    } : prev);
    setInadEquivContratoId(null);
    setInadEquivJustificativa("");
  }

  async function salvarCliente() {
    if (!cliente) return;
    setSalvando(true);
    try {
      const res = await fetch(`/api/clientes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clienteForm),
      });
      if (res.ok) {
        setCliente(prev => prev ? {
          ...prev,
          nome: clienteForm.nome.trim() || prev.nome,
          telefones: clienteForm.telefones.trim() || null,
          emails: clienteForm.emails.trim() || null,
        } : null);
        setEditandoCliente(false);
      }
    } finally {
      setSalvando(false);
    }
  }

  async function salvarContrato(contratoId: string) {
    setSalvando(true);
    try {
      const res = await fetch(`/api/contratos/${contratoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contratoForm),
      });
      if (res.ok) {
        setCliente(prev => {
          if (!prev) return null;
          return {
            ...prev,
            contratos: prev.contratos.map(c => c.id !== contratoId ? c : {
              ...c,
              maiorDiasAtraso: contratoForm.maiorDiasAtraso !== "" ? parseInt(contratoForm.maiorDiasAtraso) : c.maiorDiasAtraso,
              valorTotalAberto: contratoForm.valorTotalAberto !== "" ? parseFloat(contratoForm.valorTotalAberto.replace(",", ".")) : c.valorTotalAberto,
              statusContrato: contratoForm.statusContrato || c.statusContrato,
            }),
          };
        });
        setEditandoContrato(false);
      }
    } finally {
      setSalvando(false);
    }
  }

  async function excluirParcela(parcelaId: string) {
    if (!confirm("Excluir esta parcela? O valor será removido do total em aberto do contrato.")) return;
    const res = await fetch(`/api/parcelas/${parcelaId}`, { method: "DELETE" });
    if (!res.ok) return;
    setCliente(prev => {
      if (!prev) return null;
      return {
        ...prev,
        contratos: prev.contratos.map(c => ({
          ...c,
          parcelas: c.parcelas.filter(p => p.id !== parcelaId),
        })),
      };
    });
  }

  async function salvarParcela(parcelaId: string) {
    setSalvando(true);
    try {
      const res = await fetch(`/api/parcelas/${parcelaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parcelaForm),
      });
      if (res.ok) {
        setCliente(prev => {
          if (!prev) return null;
          return {
            ...prev,
            contratos: prev.contratos.map(c => ({
              ...c,
              parcelas: c.parcelas.map(p => p.id !== parcelaId ? p : {
                ...p,
                valorParcela: parcelaForm.valorParcela !== "" ? parseFloat(parcelaForm.valorParcela.replace(",", ".")) : p.valorParcela,
                valorTotalAberto: parcelaForm.valorTotalAberto !== "" ? parseFloat(parcelaForm.valorTotalAberto.replace(",", ".")) : p.valorTotalAberto,
                diasAtraso: parcelaForm.diasAtraso !== "" ? parseInt(parcelaForm.diasAtraso) : p.diasAtraso,
                dataVencimento: parcelaForm.dataVencimento ? parcelaForm.dataVencimento + "T00:00:00.000Z" : p.dataVencimento,
                paga: parcelaForm.paga,
              }),
            })),
          };
        });
        setEditandoParcela(null);
      }
    } finally {
      setSalvando(false);
    }
  }

  async function salvarRecebimento(recId: string) {
    setSalvando(true);
    try {
      const res = await fetch(`/api/recebimentos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recId, valor: recValor }),
      });
      if (res.ok) {
        const valorNum = parseFloat(recValor.replace(",", "."));
        setCliente(prev => {
          if (!prev) return null;
          return {
            ...prev,
            contratos: prev.contratos.map(c => ({
              ...c,
              recebimentos: c.recebimentos.map(r => r.id !== recId ? r : { ...r, valor: valorNum }),
            })),
          };
        });
        setEditandoRecebimento(null);
      }
    } finally {
      setSalvando(false);
    }
  }

  async function excluirRecebimento(recId: string) {
    if (!confirm("Excluir este recebimento? Esta ação não pode ser desfeita.")) return;
    const res = await fetch(`/api/recebimentos?id=${recId}`, { method: "DELETE" });
    if (res.ok) {
      setCliente(prev => {
        if (!prev) return null;
        return {
          ...prev,
          contratos: prev.contratos.map(c => ({
            ...c,
            recebimentos: c.recebimentos.filter(r => r.id !== recId),
          })),
        };
      });
    }
  }

  if (erro) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertCircle size={32} className="text-red-400" />
      <p className="text-red-400">{erro}</p>
      <button onClick={() => router.back()} className="text-slate-400 text-sm hover:text-white">← Voltar</button>
    </div>
  );

  if (!cliente) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const totalAberto = cliente.contratos.reduce((s, c) => s + Number(c.valorTotalAberto ?? 0), 0);
  const totalRecebido = cliente.contratos.reduce(
    (s, c) => s + c.recebimentos.reduce((r, rec) => r + Number(rec.valor), 0), 0
  );
  const telefones = cliente.telefones ? cliente.telefones.split(",") : [];
  const emails = cliente.emails ? cliente.emails.split(",") : [];
  const contrato = cliente.contratos.find((c) => c.id === contratoAberto) ?? cliente.contratos[0];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors mt-0.5"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-white">{cliente.nome}</h1>
            {isGestorOuAdmin && !editandoCliente && (
              <button
                onClick={() => {
                  setClienteForm({
                    nome: cliente.nome,
                    telefones: cliente.telefones ?? "",
                    emails: cliente.emails ?? "",
                  });
                  setEditandoCliente(true);
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
          {!editandoCliente && (
            <div className="flex flex-wrap items-center gap-4 mt-1.5">
              {telefones.length > 0 && (
                <span className="flex items-center gap-1.5 text-slate-400 text-sm">
                  <Phone size={13} />
                  {telefones[0]}
                  {telefones.length > 1 && <span className="text-slate-400">+{telefones.length - 1}</span>}
                </span>
              )}
              {emails.length > 0 && (
                <span className="flex items-center gap-1.5 text-slate-400 text-sm">
                  <Mail size={13} />
                  {emails[0]}
                </span>
              )}
            </div>
          )}
          {editandoCliente && (
            <div className="mt-3 space-y-2 max-w-md">
              <input
                className={INPUT}
                placeholder="Nome do cliente"
                value={clienteForm.nome}
                onChange={e => setClienteForm(f => ({ ...f, nome: e.target.value }))}
              />
              <input
                className={INPUT}
                placeholder="Telefones (separados por vírgula)"
                value={clienteForm.telefones}
                onChange={e => setClienteForm(f => ({ ...f, telefones: e.target.value }))}
              />
              <input
                className={INPUT}
                placeholder="E-mails (separados por vírgula)"
                value={clienteForm.emails}
                onChange={e => setClienteForm(f => ({ ...f, emails: e.target.value }))}
              />
              <div className="flex gap-2">
                <button className={BTN_SAVE} onClick={salvarCliente} disabled={salvando}>
                  <Check size={12} /> Salvar
                </button>
                <button className={BTN_CANCEL} onClick={() => setEditandoCliente(false)}>
                  <X size={12} /> Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Contratos</p>
          <p className="text-2xl font-bold text-white mt-1">{cliente.contratos.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Total em Aberto</p>
          <p className="text-xl font-bold text-red-400 mt-1">{formatarMoeda(totalAberto)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Total Recebido</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{formatarMoeda(totalRecebido)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Maior Atraso</p>
          <p className="text-2xl font-bold text-white mt-1">
            {Math.max(...cliente.contratos.map((c) => c.maiorDiasAtraso ?? 0))}d
          </p>
        </div>
      </div>

      {/* Seletor de contrato */}
      {cliente.contratos.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {cliente.contratos.map((c) => (
            <button
              key={c.id}
              onClick={() => setContratoAberto(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                contratoAberto === c.id
                  ? "bg-gr-500 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {c.numero}
            </button>
          ))}
        </div>
      )}

      {contrato && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Dados do contrato */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileText size={15} className="text-gr-400" />
                Contrato {contrato.numero}
              </h2>
              {isGestorOuAdmin && !editandoContrato && (
                <button
                  onClick={() => {
                    setContratoForm({
                      maiorDiasAtraso: String(contrato.maiorDiasAtraso ?? ""),
                      valorTotalAberto: String(contrato.valorTotalAberto ?? ""),
                      statusContrato: contrato.statusContrato ?? "",
                    });
                    setEditandoContrato(true);
                  }}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>

            {editandoContrato ? (
              <div className="space-y-2">
                <label className="text-slate-500 text-xs block">Maior Dias de Atraso</label>
                <input
                  className={INPUT}
                  type="number"
                  placeholder="Ex: 90"
                  value={contratoForm.maiorDiasAtraso}
                  onChange={e => setContratoForm(f => ({ ...f, maiorDiasAtraso: e.target.value }))}
                />
                <label className="text-slate-500 text-xs block">Valor Total em Aberto (R$)</label>
                <input
                  className={INPUT}
                  placeholder="Ex: 1500.00"
                  value={contratoForm.valorTotalAberto}
                  onChange={e => setContratoForm(f => ({ ...f, valorTotalAberto: e.target.value }))}
                />
                <label className="text-slate-500 text-xs block">Status do Contrato</label>
                <input
                  className={INPUT}
                  placeholder="Ex: ATIVO"
                  value={contratoForm.statusContrato}
                  onChange={e => setContratoForm(f => ({ ...f, statusContrato: e.target.value }))}
                />
                <div className="flex gap-2 pt-1">
                  <button className={BTN_SAVE} onClick={() => salvarContrato(contrato.id)} disabled={salvando}>
                    <Check size={12} /> Salvar
                  </button>
                  <button className={BTN_CANCEL} onClick={() => setEditandoContrato(false)}>
                    <X size={12} /> Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Info label="Empresa" value={contrato.empresa.nome} />
                <Info label="Status" value={contrato.statusContrato ?? "—"} />
                <Info label="Valor Contrato" value={formatarMoeda(Number(contrato.valorContrato ?? 0))} />
                <Info label="Total em Aberto" value={formatarMoeda(Number(contrato.valorTotalAberto ?? 0))} />
                <Info label="Parcelas Vencidas" value={String(contrato.totalParcelasVencidas ?? "—")} />
                <div>
                  <p className="text-slate-500 text-xs mb-1">Faixa de Atraso</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeDias(contrato.maiorDiasAtraso ?? 0)}`}>
                    {contrato.maiorDiasAtraso ?? 0}d — {labelDias(contrato.maiorDiasAtraso ?? 0)}
                  </span>
                </div>
              </div>
            )}

            {contrato.carteiras[0] && (
              <div className="pt-3 border-t border-slate-800">
                <p className="text-slate-500 text-xs mb-1">Consultor responsável</p>
                <div className="flex items-center gap-2">
                  <User size={13} className="text-gr-400" />
                  <span className="text-white text-sm">{contrato.carteiras[0].consultor.nome}</span>
                  <span className="text-slate-400 text-xs">· {contrato.carteiras[0].competencia.descricao}</span>
                </div>
              </div>
            )}
          </div>

          {/* Parcelas */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Calendar size={15} className="text-gr-400" />
                Parcelas ({contrato.parcelas.length})
              </h2>
              {/* Botão Inad. equivocada — só para CONSULTOR, contrato não adimplente e ainda não equivocado */}
              {perfil === "CONSULTOR"
                && contrato.statusRecuperacao !== "RECUPERADO_INTEGRALMENTE"
                && contrato.situacao !== "INADIMPLENCIA_EQUIVOCADA" && (
                <button
                  onClick={() => { setInadEquivContratoId(contrato.id); setInadEquivJustificativa(""); setErroInadEquiv(""); }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-orange-400 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 transition-colors"
                  title="Contestar inadimplência"
                >
                  <AlertTriangle size={11} />
                  Inad. equivocada
                </button>
              )}
              {/* Badge quando já está equivocada (aguardando aprovação) */}
              {contrato.situacao === "INADIMPLENCIA_EQUIVOCADA" && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-orange-400 bg-orange-500/10 border border-orange-500/20">
                  <AlertTriangle size={11} /> Aguardando aprovação
                </span>
              )}
            </div>

            {/* Modal inline de inadimplência equivocada */}
            {inadEquivContratoId === contrato.id && (
              <div className="mb-4 bg-orange-500/5 border border-orange-500/20 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-xs font-medium text-orange-400 mb-1">Contestar inadimplência</p>
                  <p className="text-xs text-slate-400">Explique ao gestor por que esta inadimplência é equivocada. Após aprovação, o contrato sairá da sua carteira e da inadimplência geral.</p>
                </div>
                <textarea
                  rows={3}
                  autoFocus
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-orange-500 placeholder:text-slate-500 resize-none"
                  placeholder="Ex: Cliente realizou o pagamento diretamente na construtora em 10/07/2026..."
                  value={inadEquivJustificativa}
                  onChange={(e) => setInadEquivJustificativa(e.target.value)}
                />
                {erroInadEquiv && (
                  <p className="text-red-400 text-xs">{erroInadEquiv}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setInadEquivContratoId(null)}
                    className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={submeterInadEquivocada}
                    disabled={salvandoInadEquiv}
                    className="flex-1 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                  >
                    {salvandoInadEquiv
                      ? <><Loader2 size={12} className="animate-spin" /> Enviando...</>
                      : <><AlertTriangle size={12} /> Enviar solicitação</>
                    }
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {contrato.parcelas.filter(p => !(p.paga && Number(p.valorTotalAberto) === 0)).map((p) => (
                <div key={p.id}>
                  {editandoParcela === p.id ? (
                    <div className="py-2 border-b border-slate-800/50 space-y-2">
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-slate-500 text-xs block mb-1">Valor parcela</label>
                          <input
                            className={INPUT}
                            placeholder="0.00"
                            value={parcelaForm.valorParcela}
                            onChange={e => setParcelaForm(f => ({ ...f, valorParcela: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 text-xs block mb-1">Valor em aberto</label>
                          <input
                            className={INPUT}
                            placeholder="0.00"
                            value={parcelaForm.valorTotalAberto}
                            onChange={e => setParcelaForm(f => ({ ...f, valorTotalAberto: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 text-xs block mb-1">Dias atraso</label>
                          <input
                            className={INPUT}
                            type="number"
                            placeholder="0"
                            value={parcelaForm.diasAtraso}
                            onChange={e => setParcelaForm(f => ({ ...f, diasAtraso: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-slate-500 text-xs block mb-1">Vencimento</label>
                          <input
                            className={INPUT}
                            type="date"
                            value={parcelaForm.dataVencimento}
                            onChange={e => setParcelaForm(f => ({ ...f, dataVencimento: e.target.value }))}
                          />
                        </div>
                        <div className="col-span-2 flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setParcelaForm(f => ({ ...f, paga: !f.paga }))}
                            className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${parcelaForm.paga ? "bg-emerald-500" : "bg-slate-600"}`}
                          >
                            <span className={`block w-3 h-3 rounded-full bg-white shadow transition-transform mx-0.5 ${parcelaForm.paga ? "translate-x-4" : "translate-x-0"}`} />
                          </button>
                          <span className="text-xs text-slate-400">
                            {parcelaForm.paga ? "Parcela paga — não aparece no recebimento" : "Parcela em aberto — aparece para receber"}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className={BTN_SAVE} onClick={() => salvarParcela(p.id)} disabled={salvando}>
                          <Check size={12} /> Salvar
                        </button>
                        <button className={BTN_CANCEL} onClick={() => setEditandoParcela(null)}>
                          <X size={12} /> Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between py-1.5 border-b border-slate-800/50 last:border-0 group">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-xs w-5 text-right">{p.numero}</span>
                        <span className="text-slate-400 text-xs">
                          {new Date(p.dataVencimento).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                        </span>
                        {p.diasAtraso > 0 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${badgeDias(p.diasAtraso)}`}>
                            {p.diasAtraso}d
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white text-xs font-medium tabular-nums">
                          {formatarMoeda(Number(p.valorTotalAberto))}
                        </span>
                        {isGestorOuAdmin && (
                          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
                            <button
                              onClick={() => {
                                setParcelaForm({
                                  valorParcela: String(p.valorParcela ?? ""),
                                  valorTotalAberto: String(p.valorTotalAberto ?? ""),
                                  diasAtraso: String(p.diasAtraso ?? ""),
                                  dataVencimento: p.dataVencimento ? p.dataVencimento.substring(0, 10) : "",
                                  paga: p.paga,
                                });
                                setEditandoParcela(p.id);
                              }}
                              className="p-1 rounded text-slate-500 hover:text-white transition-colors"
                            >
                              <Pencil size={11} />
                            </button>
                            <button
                              onClick={() => excluirParcela(p.id)}
                              className="p-1 rounded text-slate-500 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recebimentos */}
          {contrato.recebimentos.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-400" />
                Recebimentos ({contrato.recebimentos.length})
              </h2>
              <div className="space-y-1">
                {contrato.recebimentos.map((r) => {
                  const podeEditar = isGestorOuAdmin || r.consultorId === meuId;
                  return (
                    <div key={r.id}>
                      {editandoRecebimento === r.id ? (
                        <div className="py-2 border-b border-slate-800/50 space-y-2">
                          <label className="text-slate-500 text-xs block">Valor recebido (R$)</label>
                          <input
                            className={INPUT}
                            placeholder="Ex: 150,00"
                            value={recValor}
                            onChange={e => setRecValor(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <button className={BTN_SAVE} onClick={() => salvarRecebimento(r.id)} disabled={salvando}>
                              <Check size={12} /> Salvar
                            </button>
                            <button className={BTN_CANCEL} onClick={() => setEditandoRecebimento(null)}>
                              <X size={12} /> Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center py-1.5 border-b border-slate-800/50 last:border-0 group">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-white text-sm font-medium">
                                {Number(r.valorAParte ?? 0) > 0
                                  ? formatarMoeda(Number(r.valorAParte))
                                  : formatarMoeda(Number(r.valor))}
                              </p>
                              {Number(r.valorAParte ?? 0) > 0 && (
                                <span className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded font-medium">A Parte</span>
                              )}
                            </div>
                            <p className="text-slate-500 text-xs">
                              {r.formaPagamento.replace(/_/g, " ")} · {new Date(r.dataRecebimento).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                            </p>
                            {/* Parcelas pagas */}
                            {Array.isArray(r.parcelasIds) && r.parcelasIds.length > 0 && (() => {
                              const pagas = contrato.parcelas.filter((p) => r.parcelasIds.includes(p.id));
                              if (!pagas.length) return null;
                              return (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {pagas.map((p) => (
                                    <span key={p.id} className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/8 text-emerald-400/80 border border-emerald-500/15 px-1.5 py-0.5 rounded">
                                      Parcela {p.numero} · venc. {new Date(p.dataVencimento).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                          {podeEditar && (
                            <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-all">
                              <button
                                onClick={() => {
                                  setRecValor(String(Number(r.valor).toFixed(2)).replace(".", ","));
                                  setEditandoRecebimento(r.id);
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                              >
                                <Pencil size={13} />
                              </button>
                              {isGestorOuAdmin && (
                                <button
                                  onClick={() => excluirRecebimento(r.id)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Últimos contatos */}
          {contrato.contatos.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Clock size={15} className="text-gr-400" />
                Últimos Contatos
              </h2>
              <div className="space-y-2">
                {contrato.contatos.map((c) => (
                  <div key={c.id} className="py-1.5 border-b border-slate-800/50 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{c.tipo}</span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-300">{c.status.replace(/_/g, " ")}</span>
                    </div>
                    {c.observacao && <p className="text-slate-500 text-xs mt-0.5">{c.observacao}</p>}
                    <p className="text-slate-700 text-xs mt-0.5">{new Date(c.criadoEm).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-500 text-xs">{label}</p>
      <p className="text-white text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}
