"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  FolderOpen, Search, Plus, X, AlertCircle,
  ChevronRight, UserPlus, Building2, Loader2, CheckCircle2, DollarSign, ArrowLeftRight, User,
  Phone, History, Calendar, ArrowUpDown, Clock, Pencil, Trash2, RefreshCw,
} from "lucide-react";
import { formatarMoeda } from "@/lib/utils";
import Link from "next/link";

interface Contrato {
  id: string;
  numero: string;
  maiorDiasAtraso: number | null;
  valorTotalAberto: number | null;
  statusContrato: string | null;
  statusRecuperacao: string | null;
  situacao: string;
  cliente: { id: string; nome: string; telefones: string | null; emails: string | null };
  empresa: { nome: string };
  contatos: { tipo: string; status: string; criadoEm: string }[];
  promessas: { id: string; valorPrometido: number; dataPrometida: string }[];
  recebimentos: { id: string; valor: number; valorAParte: number | null; dataRecebimento: string; formaPagamento: string }[];
  parcelas: { id: string; numero: number; diasAtraso: number; valorTotalAberto: number; dataVencimento: string; remanejada: boolean }[];
}

interface ItemCarteira {
  id: string;
  contrato: Contrato;
  consultor: { nome: string };
}

interface ContratoBusca {
  id: string;
  numero: string;
  maiorDiasAtraso: number | null;
  valorTotalAberto: number | null;
  cliente: { nome: string; telefones: string | null };
  empresa: { nome: string };
}

const STATUS_COR: Record<string, string> = {
  ACIONADO: "text-sky-400",
  EM_NEGOCIACAO: "text-amber-400",
  PROMESSA_PAGAMENTO: "text-purple-400",
  LINK_ENVIADO: "text-purple-300",
  RECEBIDO: "text-emerald-400",
  RECEBIDO_PARCIAL: "text-emerald-300",
  REGULARIZADO: "text-emerald-400",
  NAO_ATENDE: "text-slate-500",
  SEM_RESPOSTA: "text-slate-500",
  VISUALIZOU_SEM_RESPOSTA: "text-slate-400",
  NAO_RESPONDE_MENSAGENS: "text-slate-400",
  PROMESSA_QUEBRADA: "text-red-400",
  AGUARDANDO_RETORNO: "text-amber-300",
  LIGAR_DEPOIS: "text-amber-300",
  CONTATO_INEXISTENTE: "text-slate-400",
  INADIMPLENCIA_EQUIVOCADA: "text-orange-400",
  SOLICITOU_CANCELAMENTO: "text-red-300",
  NAO_QUER_CONTATO: "text-slate-500",
  OUTROS: "text-slate-400",
};

const STATUS_LABEL: Record<string, string> = {
  ACIONADO: "Acionado",
  EM_NEGOCIACAO: "Em negociação",
  PROMESSA_PAGAMENTO: "Promessa de pagamento",
  LINK_ENVIADO: "Link enviado",
  RECEBIDO: "Recebido",
  RECEBIDO_PARCIAL: "Recebido parcial",
  REGULARIZADO: "Regularizado",
  NAO_ATENDE: "Não atende",
  SEM_RESPOSTA: "Sem resposta",
  VISUALIZOU_SEM_RESPOSTA: "Visualizou, não respondeu",
  NAO_RESPONDE_MENSAGENS: "Não responde mensagens",
  PROMESSA_QUEBRADA: "Promessa quebrada",
  AGUARDANDO_RETORNO: "Aguardando retorno",
  LIGAR_DEPOIS: "Ligar depois",
  CONTATO_INEXISTENTE: "Contato inexistente",
  INADIMPLENCIA_EQUIVOCADA: "Inadimplência equivocada",
  SOLICITOU_CANCELAMENTO: "Solicitou cancelamento",
  ENCAMINHADO_RETENCAO: "Encaminhado jurídico",
  NAO_QUER_CONTATO: "Não quer contato",
  OUTROS: "Outros",
};

// Status que exigem campo de agendamento (follow-up date)
const STATUS_COM_AGENDA = ["LIGAR_DEPOIS", "AGUARDANDO_RETORNO", "LINK_ENVIADO"];
// Status que exigem observação obrigatória
const STATUS_OBS_OBRIG = ["OUTROS"];

// Situações selecionáveis manualmente pelo consultor no popover do card
const SITUACAO_COR: Record<string, string> = {
  INADIMPLENTE: "",
  EM_NEGOCIACAO: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  PROMESSA_PAGAMENTO: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

const SITUACAO_LABEL: Record<string, string> = {
  INADIMPLENTE: "Inadimplente",
  EM_NEGOCIACAO: "Em negociação",
  PROMESSA_PAGAMENTO: "Promessa de pgto.",
};

// Badges somente de leitura (definidos por fluxos automáticos, não pelo popover)
const SITUACAO_COR_EXTRA: Record<string, string> = {
  INADIMPLENCIA_EQUIVOCADA: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

const SITUACAO_LABEL_EXTRA: Record<string, string> = {
  INADIMPLENCIA_EQUIVOCADA: "Inad. equivocada",
};

function getFaixa(dias: number | null): { label: string; cor: string } {
  if (!dias || dias <= 0) return { label: "FLASH", cor: "text-sky-400" };
  if (dias <= 30) return { label: "CRA — 1 a 30 dias", cor: "text-sky-400" };
  if (dias <= 60) return { label: "CR — 31 a 60 dias", cor: "text-amber-400" };
  if (dias <= 90) return { label: "CR — 61 a 90 dias", cor: "text-amber-400" };
  if (dias <= 120) return { label: "CR PDD — 91 a 120 dias", cor: "text-orange-400" };
  if (dias <= 150) return { label: "CR PDD — 121 a 150 dias", cor: "text-orange-400" };
  if (dias <= 180) return { label: "CR PDD — 151 a 180 dias", cor: "text-red-400" };
  return { label: "CR PDD — 181+ dias", cor: "text-red-400" };
}

function diasAtrasoColor(dias: number | null) {
  if (!dias) return "text-slate-400";
  if (dias <= 30) return "text-sky-400";
  if (dias <= 90) return "text-amber-400";
  return "text-red-400";
}

const inputCls = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500 placeholder:text-slate-500";

export default function CarteiraPage() {
  const { data: session } = useSession();
  const perfil = (session?.user as any)?.perfil as string | undefined;
  const isGestorOuAdmin = perfil === "GESTOR" || perfil === "ADMINISTRADOR";

  const [carteira, setCarteira] = useState<ItemCarteira[]>([]);
  const [totalContratos, setTotalContratos] = useState(0);
  const [valorTotal, setValorTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [competenciaId, setCompetenciaId] = useState("");
  const [competencias, setCompetencias] = useState<any[]>([]);
  const [busca, setBusca] = useState("");
  const [sort, setSort] = useState("diasAtraso");
  const [empresaFiltro, setEmpresaFiltro] = useState<string | null>(null);
  const [statusRecupFiltro, setStatusRecupFiltro] = useState<string | null>(null);
  const [situacaoFiltro, setSituacaoFiltro] = useState<string | null>(null);
  const [situacaoPopover, setSituacaoPopover] = useState<string | null>(null);
  const [salvandoSituacao, setSalvandoSituacao] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState<"buscar" | "novo" | "recebimento" | "externo" | null>(null);
  // Modal atendimento (histórico + novo contato)
  const [modalAtend, setModalAtend] = useState<Contrato | null>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [carregandoHist, setCarregandoHist] = useState(false);
  const [atendForm, setAtendForm] = useState({ tipo: "LIGACAO", status: "ACIONADO", observacao: "", agendadoPara: "" });
  const [salvandoAtend, setSalvandoAtend] = useState(false);
  const [erroAtend, setErroAtend] = useState("");
  // Modal promessa rápida
  const [modalPromRap, setModalPromRap] = useState<Contrato | null>(null);
  const [promRapForm, setPromRapForm] = useState({ valor: "", data: new Date().toISOString().slice(0, 10), formaPagamento: "PIX", observacao: "", parcelasIds: [] as string[] });
  const [salvandoPromRap, setSalvandoPromRap] = useState(false);
  const [erroPromRap, setErroPromRap] = useState("");
  const [promRapModo, setPromRapModo] = useState<"PROMESSA" | "LINK">("PROMESSA");
  const [contratoRecebimento, setContratoRecebimento] = useState<Contrato | null>(null);
  const [recebForm, setRecebForm] = useState({ valor: "", valorManual: false, valorAParte: "", formaPagamento: "PIX", observacao: "", data: new Date().toISOString().slice(0, 10), parcelasIds: [] as string[], parcelasRemanejadas: [] as string[] });
  const [salvandoReceb, setSalvandoReceb] = useState(false);
  const [erroReceb, setErroReceb] = useState("");
  const [modalAParte, setModalAParte] = useState<Contrato | null>(null);
  const [editandoAParte, setEditandoAParte] = useState<{ id: string; valor: string; formaPagamento: string } | null>(null);
  const [salvandoEditAParte, setSalvandoEditAParte] = useState(false);


  // Estado modal recebimento externo (outra carteira)
  const [externoQuery, setExternoQuery] = useState("");
  const [externoResultados, setExternoResultados] = useState<any[]>([]);
  const [externoBuscando, setExternoBuscando] = useState(false);
  const [externoContrato, setExternoContrato] = useState<any>(null);
  const [externoForm, setExternoForm] = useState({ valor: "", data: new Date().toISOString().slice(0, 10), formaPagamento: "PIX", observacao: "" });
  const [externoSalvando, setExternoSalvando] = useState(false);
  const [externoErro, setExternoErro] = useState("");
  const [externoSucesso, setExternoSucesso] = useState(false);
  const externoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estado modal novo cliente
  const [novoForm, setNovoForm] = useState({
    nomeCliente: "", telefones: "", emails: "",
    numeroContrato: "",
    tipo: "inadimplencia" as "inadimplencia" | "a_parte",
    formaPagamento: "PIX",
    dataRecebimento: new Date().toISOString().slice(0, 10),
    parcelas: [{ dataVencimento: "", valor: "" }],
  });
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [erroNovo, setErroNovo] = useState("");
  const [novoBuscandoContrato, setNovoBuscandoContrato] = useState(false);
  const [novoClienteEncontrado, setNovoClienteEncontrado] = useState(false);
  const novoContratoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/competencias").then((r) => r.json()).then((cs) => {
      setCompetencias(cs);
      if (cs[0]) setCompetenciaId(cs[0].id);
    });
  }, []);

  const buscaMainTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function carregarPagina(cId: string, pg: number, append = false, buscaParam?: string, sortParam?: string, statusRecupParam?: string | null, situacaoParam?: string | null) {
    if (!append) setCarregando(true); else setCarregandoMais(true);
    const b = buscaParam ?? busca;
    const s = sortParam ?? sort;
    const sr = statusRecupParam !== undefined ? statusRecupParam : statusRecupFiltro;
    const sit = situacaoParam !== undefined ? situacaoParam : situacaoFiltro;
    const params = new URLSearchParams({ competenciaId: cId, page: String(pg), sort: s });
    if (b) params.set("busca", b);
    if (sr) params.set("statusRecuperacao", sr);
    if (sit) params.set("situacao", sit);
    const data = await fetch(`/api/carteira?${params}`).then((r) => r.json()).catch(() => ({}));
    const contratos: ItemCarteira[] = Array.isArray(data.contratos) ? data.contratos : [];
    if (append) setCarteira((prev) => [...prev, ...contratos]);
    else { setCarteira(contratos); setTotalContratos(data.total ?? 0); setValorTotal(data.valorTotal ?? 0); }
    setPagina(pg);
    setTemMais(data.temMais ?? false);
    setCarregando(false);
    setCarregandoMais(false);
  }

  useEffect(() => {
    if (!competenciaId) return;
    setPagina(1);
    setTemMais(false);
    carregarPagina(competenciaId, 1, false, busca, sort);
  }, [competenciaId]);

  // Debounce busca — chama API server-side
  useEffect(() => {
    if (!competenciaId) return;
    if (buscaMainTimer.current) clearTimeout(buscaMainTimer.current);
    buscaMainTimer.current = setTimeout(() => {
      setPagina(1);
      carregarPagina(competenciaId, 1, false, busca, sort);
    }, 350);
  }, [busca]);

  // Reload quando sort muda
  useEffect(() => {
    if (!competenciaId) return;
    setPagina(1);
    carregarPagina(competenciaId, 1, false, busca, sort);
  }, [sort]);

  // Reload quando filtros de status mudam (server-side, sem paginação)
  useEffect(() => {
    if (!competenciaId) return;
    setPagina(1);
    carregarPagina(competenciaId, 1, false, busca, sort, statusRecupFiltro, situacaoFiltro);
  }, [statusRecupFiltro, situacaoFiltro]);

  // Lookup automático de contrato no modal a_parte
  useEffect(() => {
    if (novoForm.tipo !== "a_parte") { setNovoClienteEncontrado(false); return; }
    if (!novoForm.numeroContrato || novoForm.numeroContrato.length < 3) {
      setNovoClienteEncontrado(false);
      return;
    }
    if (novoContratoTimer.current) clearTimeout(novoContratoTimer.current);
    novoContratoTimer.current = setTimeout(async () => {
      setNovoBuscandoContrato(true);
      const data = await fetch(`/api/consulta?q=${encodeURIComponent(novoForm.numeroContrato)}`).then((r) => r.json()).catch(() => []);
      setNovoBuscandoContrato(false);
      if (Array.isArray(data) && data.length > 0) {
        const exact = data.find((c: any) => c.numero.toUpperCase() === novoForm.numeroContrato.trim().toUpperCase());
        const found = exact || null;
        if (found) {
          setNovoClienteEncontrado(true);
          setNovoForm((f) => ({
            ...f,
            nomeCliente: found.cliente.nome || f.nomeCliente,
            telefones: found.cliente.telefones || f.telefones,
            emails: found.cliente.emails || f.emails,
          }));
        } else {
          setNovoClienteEncontrado(false);
        }
      } else {
        setNovoClienteEncontrado(false);
      }
    }, 400);
  }, [novoForm.numeroContrato, novoForm.tipo]);

  // Busca externo com debounce
  useEffect(() => {
    if (!externoQuery || externoQuery.length < 2) { setExternoResultados([]); return; }
    if (externoTimer.current) clearTimeout(externoTimer.current);
    externoTimer.current = setTimeout(async () => {
      setExternoBuscando(true);
      const data = await fetch(`/api/consulta?q=${encodeURIComponent(externoQuery)}`).then((r) => r.json()).catch(() => []);
      setExternoResultados(Array.isArray(data) ? data : []);
      setExternoBuscando(false);
    }, 350);
  }, [externoQuery]);

  async function salvarExternoRecebimento() {
    setExternoErro("");
    if (!externoContrato) return;
    if (!externoForm.observacao.trim()) { setExternoErro("Informe o motivo da solicitação de transferência"); return; }
    setExternoSalvando(true);
    const resSolic = await fetch("/api/solicitacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: "TRANSFERENCIA_CONTRATO",
        contratoId: externoContrato.id,
        motivo: `${externoForm.observacao.trim()} — ${externoContrato.cliente.nome} (${externoContrato.numero})`,
      }),
    });
    setExternoSalvando(false);
    if (!resSolic.ok) {
      const d = await resSolic.json();
      setExternoErro(d.erro || "Erro ao enviar solicitação");
      return;
    }
    setExternoSucesso(true);
  }

  // Intercepta seleção no popover: promessa → abre modal de promessa rápida
  function handleSituacao(c: Contrato, val: string) {
    setSituacaoPopover(null);
    if (val === "PROMESSA_PAGAMENTO") {
      abrirPromessaRapida(c, "PROMESSA");
    } else {
      atualizarSituacao(c.id, val);
    }
  }

  async function atualizarSituacao(contratoId: string, situacao: string) {
    setSalvandoSituacao(contratoId);
    await fetch(`/api/contratos/${contratoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ situacao }),
    });
    setSalvandoSituacao(null);
    setSituacaoPopover(null);
    // Atualiza local sem reload completo
    setCarteira((prev) =>
      prev.map((item) =>
        item.contrato.id === contratoId
          ? { ...item, contrato: { ...item.contrato, situacao } }
          : item
      )
    );
  }

  function abrirExterno() {
    setModal("externo");
    setExternoQuery("");
    setExternoResultados([]);
    setExternoContrato(null);
    setExternoForm({ valor: "", data: new Date().toISOString().slice(0, 10), formaPagamento: "PIX", observacao: "" });
    setExternoErro("");
    setExternoSucesso(false);
  }



  function abrirRecebimento(c: Contrato) {
    setContratoRecebimento(c);
    setRecebForm({
      valor: "",
      valorManual: false,
      valorAParte: "",
      formaPagamento: "PIX",
      observacao: "",
      data: new Date().toISOString().slice(0, 10),
      parcelasIds: [],
      // Pré-marca parcelas já remanejadas no DB
      parcelasRemanejadas: c.parcelas.filter((p) => p.remanejada).map((p) => p.id),
    });
    setErroReceb("");
    setModal("recebimento");
  }

  function toggleParcela(parcela: { id: string; valorTotalAberto: number }) {
    setRecebForm((f) => {
      const jaSelected = f.parcelasIds.includes(parcela.id);
      const novosIds = jaSelected
        ? f.parcelasIds.filter((id) => id !== parcela.id)
        : [...f.parcelasIds, parcela.id];
      // Remove de remanejadas se estiver sendo marcada como recebida
      const novasRem = f.parcelasRemanejadas.filter((id) => id !== parcela.id);
      const totalSelecionado = contratoRecebimento?.parcelas
        .filter((p) => novosIds.includes(p.id))
        .reduce((s, p) => s + Number(p.valorTotalAberto ?? 0), 0) ?? 0;
      const novoValor = f.valorManual ? f.valor : (novosIds.length > 0 ? totalSelecionado.toFixed(2).replace(".", ",") : f.valor);
      return { ...f, parcelasIds: novosIds, parcelasRemanejadas: novasRem, valor: novoValor };
    });
  }

  function toggleParcelaRemanejada(parcelaId: string) {
    setRecebForm((f) => {
      const jaRem = f.parcelasRemanejadas.includes(parcelaId);
      const novasRem = jaRem
        ? f.parcelasRemanejadas.filter((id) => id !== parcelaId)
        : [...f.parcelasRemanejadas, parcelaId];
      // Remove de recebidas se estiver sendo marcada como remanejada
      const novosIds = f.parcelasIds.filter((id) => id !== parcelaId);
      const totalSelecionado = contratoRecebimento?.parcelas
        .filter((p) => novosIds.includes(p.id))
        .reduce((s, p) => s + Number(p.valorTotalAberto ?? 0), 0) ?? 0;
      const novoValor = f.valorManual ? f.valor : (novosIds.length > 0 ? totalSelecionado.toFixed(2).replace(".", ",") : f.valor);
      return { ...f, parcelasRemanejadas: novasRem, parcelasIds: novosIds, valor: novoValor };
    });
  }

  function recalcularValorParcelas() {
    const total = contratoRecebimento?.parcelas
      .filter((p) => recebForm.parcelasIds.includes(p.id))
      .reduce((s, p) => s + Number(p.valorTotalAberto ?? 0), 0) ?? 0;
    setRecebForm((f) => ({ ...f, valor: total.toFixed(2).replace(".", ","), valorManual: false }));
  }

  async function salvarRecebimento() {
    if (!contratoRecebimento) return;
    setErroReceb("");
    const valor = parseFloat(recebForm.valor.replace(",", "."));
    if (!valor || valor <= 0) { setErroReceb("Informe um valor válido"); return; }
    setSalvandoReceb(true);
    const res = await fetch("/api/recebimentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contratoId: contratoRecebimento.id,
        valor,
        valorAParte: recebForm.valorAParte ? parseFloat(recebForm.valorAParte.replace(",", ".")) : null,
        dataRecebimento: recebForm.data,
        formaPagamento: recebForm.formaPagamento,
        observacao: recebForm.observacao,
        parcelasIds: recebForm.parcelasIds,
        parcelasRemanejadas: recebForm.parcelasRemanejadas,
      }),
    });
    const data = await res.json();
    setSalvandoReceb(false);
    if (!res.ok) { setErroReceb(data.erro || "Erro ao registrar"); return; }
    setModal(null);
    carregarPagina(competenciaId, 1);
  }

  async function abrirAtendimento(c: Contrato) {
    setModalAtend(c);
    setAtendForm({ tipo: "LIGACAO", status: "ACIONADO", observacao: "", agendadoPara: "" });
    setErroAtend("");
    setHistorico([]);
    setCarregandoHist(true);
    const data = await fetch(`/api/contatos?contratoId=${c.id}`).then((r) => r.json()).catch(() => []);
    setHistorico(Array.isArray(data) ? data : []);
    setCarregandoHist(false);
  }

  async function salvarAtendimento() {
    if (!modalAtend) return;
    setErroAtend("");

    if (atendForm.status === "OUTROS" && !atendForm.observacao.trim()) {
      setErroAtend("Observação obrigatória para status 'Outros'"); return;
    }
    if (STATUS_COM_AGENDA.includes(atendForm.status) && !atendForm.agendadoPara) {
      setErroAtend("Informe a data/hora para agendamento"); return;
    }
    setSalvandoAtend(true);
    const res = await fetch("/api/contatos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contratoId: modalAtend.id,
        tipo: atendForm.tipo,
        status: atendForm.status,
        observacao: atendForm.observacao || null,
        agendadoPara: atendForm.agendadoPara || null,
      }),
    });
    const data = await res.json();
    setSalvandoAtend(false);
    if (!res.ok) { setErroAtend(data.erro || "Erro ao registrar"); return; }
    setModalAtend(null);
    setAtendForm({ tipo: "LIGACAO", status: "ACIONADO", observacao: "", agendadoPara: "" });
    carregarPagina(competenciaId, 1, false, busca, sort);
  }

  function abrirPromessaRapida(c: Contrato, modo: "PROMESSA" | "LINK" = "PROMESSA") {
    setModalPromRap(c);
    setPromRapModo(modo);
    setPromRapForm({ valor: "", data: new Date().toISOString().slice(0, 10), formaPagamento: modo === "LINK" ? "LINK_PAGAMENTO" : "PIX", observacao: "", parcelasIds: [] });
    setErroPromRap("");
  }

  function toggleParcelaPromRap(parcela: { id: string; valorTotalAberto: number }) {
    setPromRapForm((f) => {
      const jaSelected = f.parcelasIds.includes(parcela.id);
      const novosIds = jaSelected ? f.parcelasIds.filter((id) => id !== parcela.id) : [...f.parcelasIds, parcela.id];
      const total = modalPromRap?.parcelas.filter((p) => novosIds.includes(p.id)).reduce((s, p) => s + Number(p.valorTotalAberto ?? 0), 0) ?? 0;
      return { ...f, parcelasIds: novosIds, valor: novosIds.length > 0 ? total.toFixed(2).replace(".", ",") : f.valor };
    });
  }

  async function salvarPromessaRapida() {
    if (!modalPromRap) return;
    setErroPromRap("");
    const valor = parseFloat(promRapForm.valor.replace(",", "."));
    if (!valor || valor <= 0) { setErroPromRap("Informe um valor válido"); return; }
    if (!promRapForm.data) { setErroPromRap("Informe a data da promessa"); return; }
    setSalvandoPromRap(true);
    const res = await fetch("/api/promessas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contratoId: modalPromRap.id,
        valorPrometido: valor,
        dataPrometida: promRapForm.data,
        formaPagamento: promRapForm.formaPagamento,
        observacao: promRapForm.observacao || null,
        parcelasIds: promRapForm.parcelasIds,
        tipoContato: promRapModo === "LINK" ? "LINK_ENVIADO" : undefined,
      }),
    });
    const data = await res.json();
    setSalvandoPromRap(false);
    if (!res.ok) { setErroPromRap(data.erro || "Erro ao registrar"); return; }
    // Atualiza situação do contrato para refletir o modo no card sem reload
    if (promRapModo === "PROMESSA") {
      await fetch(`/api/contratos/${modalPromRap.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situacao: "PROMESSA_PAGAMENTO" }),
      });
      setCarteira((prev) => prev.map((item) =>
        item.contrato.id === modalPromRap.id
          ? { ...item, contrato: { ...item.contrato, situacao: "PROMESSA_PAGAMENTO" } }
          : item
      ));
    }
    setModalPromRap(null);
    carregarPagina(competenciaId, 1, false, busca, sort);
  }

  async function salvarEdicaoAParte() {
    if (!editandoAParte) return;
    setSalvandoEditAParte(true);
    const res = await fetch("/api/recebimentos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editandoAParte.id,
        valorAParte: parseFloat(editandoAParte.valor.replace(",", ".")) || 0,
        formaPagamento: editandoAParte.formaPagamento,
      }),
    });
    setSalvandoEditAParte(false);
    if (!res.ok) return;
    const updated = await res.json();
    setModalAParte((prev) => prev ? {
      ...prev,
      recebimentos: prev.recebimentos.map((r) =>
        r.id === updated.id ? { ...r, valorAParte: Number(updated.valorAParte), formaPagamento: updated.formaPagamento } : r
      ),
    } : null);
    setEditandoAParte(null);
    carregarPagina(competenciaId, 1);
  }

  async function excluirAParte(id: string) {
    if (!confirm("Excluir este lançamento a parte?")) return;
    const res = await fetch(`/api/recebimentos?id=${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setModalAParte((prev) => prev ? {
      ...prev,
      recebimentos: prev.recebimentos.filter((r) => r.id !== id),
    } : null);
    carregarPagina(competenciaId, 1);
  }

  const NOVO_FORM_VAZIO = {
    nomeCliente: "", telefones: "", emails: "",
    numeroContrato: "",
    tipo: "inadimplencia" as "inadimplencia" | "a_parte",
    formaPagamento: "PIX",
    dataRecebimento: new Date().toISOString().slice(0, 10),
    parcelas: [{ dataVencimento: "", valor: "" }],
  };

  async function salvarNovoCliente() {
    setErroNovo("");
    if (!novoForm.nomeCliente || !novoForm.numeroContrato) {
      setErroNovo("Nome do cliente e número do contrato são obrigatórios"); return;
    }
    const parcelasValidas = novoForm.parcelas.filter((p) => p.dataVencimento && p.valor);
    if (parcelasValidas.length === 0) {
      setErroNovo("Informe ao menos uma parcela com data de vencimento e valor"); return;
    }
    if (novoForm.tipo === "a_parte") {
      if (!novoForm.formaPagamento) { setErroNovo("Selecione a forma de pagamento"); return; }
      if (!novoForm.dataRecebimento) { setErroNovo("Informe a data do recebimento"); return; }
    }
    setSalvandoNovo(true);
    const payload = novoForm.tipo === "inadimplencia"
      ? { nomeCliente: novoForm.nomeCliente, telefones: novoForm.telefones, emails: novoForm.emails, numeroContrato: novoForm.numeroContrato, tipo: novoForm.tipo, competenciaId, parcelas: parcelasValidas }
      : { nomeCliente: novoForm.nomeCliente, telefones: novoForm.telefones, emails: novoForm.emails, numeroContrato: novoForm.numeroContrato, tipo: novoForm.tipo, formaPagamento: novoForm.formaPagamento, dataRecebimento: novoForm.dataRecebimento, competenciaId, parcelas: parcelasValidas };
    const res = await fetch("/api/carteira/novo-cliente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSalvandoNovo(false);
    if (!res.ok) { setErroNovo(data.erro || "Erro ao cadastrar"); return; }
    setModal(null);
    setNovoForm(NOVO_FORM_VAZIO);
    setNovoClienteEncontrado(false);
    carregarPagina(competenciaId, 1);
  }

  const empresas = Array.from(new Set(carteira.map((i) => i.contrato.empresa.nome))).sort();

  // Apenas empresa permanece client-side (status/situação são server-side)
  const filtrados = carteira.filter((item) =>
    !empresaFiltro || item.contrato.empresa.nome === empresaFiltro
  );

  // Agrupar por faixa de inadimplência
  const porFaixa = filtrados.reduce<Record<string, ItemCarteira[]>>((acc, item) => {
    const faixaLabel = getFaixa(item.contrato.maiorDiasAtraso).label;
    if (!acc[faixaLabel]) acc[faixaLabel] = [];
    acc[faixaLabel].push(item);
    return acc;
  }, {});
  const ordemFaixas = ["FLASH", "CRA — 1 a 30 dias", "CR — 31 a 60 dias", "CR — 61 a 90 dias", "CR PDD — 91 a 120 dias", "CR PDD — 121 a 150 dias", "CR PDD — 151 a 180 dias", "CR PDD — 181+ dias"];
  const faixasPresentes = ordemFaixas.filter((f) => porFaixa[f]?.length > 0);

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <FolderOpen size={22} className="text-slate-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Minha Carteira</h1>
            <p className="text-slate-400 text-sm">
              {totalContratos} contrato{totalContratos !== 1 ? "s" : ""} · {formatarMoeda(valorTotal)} em aberto
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={abrirExterno}
            className="flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-sm font-medium px-3 py-2 rounded-xl transition-colors"
          >
            <ArrowLeftRight size={15} /> Outra carteira
          </button>
          <button
            onClick={() => { setNovoForm(NOVO_FORM_VAZIO); setErroNovo(""); setNovoClienteEncontrado(false); setModal("novo"); }}
            className="flex items-center gap-2 bg-gr-500 hover:bg-gr-400 text-white text-sm font-medium px-3 py-2 rounded-xl transition-colors"
          >
            <Plus size={15} /> Novo cadastro
          </button>
          <select
            value={competenciaId}
            onChange={(e) => setCompetenciaId(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
          >
            {competencias.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
          </select>
        </div>
      </div>

      {/* Busca + Ordenação */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por cliente ou contrato (busca em toda a carteira)..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gr-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 flex-shrink-0 whitespace-nowrap">Ordenar por</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
          >
            <option value="diasAtraso">Dias em atraso</option>
            <option value="parcelasAtraso">Parcelas em atraso</option>
            <option value="parcelasAberto">Valor em aberto</option>
          </select>
        </div>
      </div>

      {/* Filtros organizados em grupos */}
      <div className="space-y-2">
        {/* Recuperação */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 w-24 flex-shrink-0">Recuperação</span>
          {[
            { label: "Todas", value: null },
            { label: "Recebido", value: "RECUPERADO_INTEGRALMENTE" },
            { label: "Rec. Parcial", value: "RECUPERACAO_PARCIAL" },
            { label: "Inadimplente", value: "INADIMPLENTE_TODOS" },
          ].map(({ label, value }) => (
            <button
              key={label}
              onClick={() => setStatusRecupFiltro(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusRecupFiltro === value
                  ? "bg-gr-500 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Situação do contato */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 w-24 flex-shrink-0">Situação</span>
          {[
            { label: "Todas", value: null },
            { label: "Promessa de pagamento", value: "PROMESSA_PAGAMENTO" },
            { label: "Link enviado", value: "LINK_ENVIADO" },
            { label: "Aguardando retorno", value: "AGUARDANDO_RETORNO" },
            { label: "Ligar depois", value: "LIGAR_DEPOIS" },
          ].map(({ label, value }) => (
            <button
              key={label}
              onClick={() => setSituacaoFiltro(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                situacaoFiltro === value
                  ? "bg-sky-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Empreendimento */}
        {empresas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 w-24 flex-shrink-0">Empreendimento</span>
            <button
              onClick={() => setEmpresaFiltro(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                !empresaFiltro ? "bg-gr-500 text-white" : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
              }`}
            >
              Todas
            </button>
            {empresas.map((emp) => (
              <button
                key={emp}
                onClick={() => setEmpresaFiltro(emp === empresaFiltro ? null : emp)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  empresaFiltro === emp ? "bg-gr-500 text-white" : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
                }`}
              >
                {emp}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lista por faixa */}
      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <AlertCircle size={32} className="mx-auto mb-3 text-slate-400" />
          <p className="text-slate-500 text-sm">{busca ? "Nenhum resultado para a busca" : "Nenhum contrato na carteira"}</p>
          <p className="text-slate-400 text-xs mt-1">Use os botões acima para adicionar clientes manualmente</p>
        </div>
      ) : (
        <div className="space-y-6">
          {faixasPresentes.map((faixaLabel) => {
            const faixaInfo = getFaixa(porFaixa[faixaLabel][0].contrato.maiorDiasAtraso);
            return (
              <div key={faixaLabel}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${faixaInfo.cor}`}>{faixaLabel}</span>
                  <span className="text-xs text-slate-400">· {porFaixa[faixaLabel].length} contrato{porFaixa[faixaLabel].length !== 1 ? "s" : ""}</span>
                  <div className="flex-1 h-px bg-slate-800 ml-1" />
                </div>
                <div className="space-y-2">
                  {porFaixa[faixaLabel].map((item) => {
                    const c = item.contrato;
                    const ultimoContato = c.contatos[0];
                    const temPromessa = c.promessas.length > 0;
                    const totalRecebido = c.recebimentos.reduce((s, r) => s + Number(r.valor), 0);
                    const totalAParte = c.recebimentos.reduce((s, r) => s + Number(r.valorAParte ?? 0), 0);
                    // Saldo real = soma das parcelas ainda não pagas (API já filtra paga:false)
                    const saldoAberto = c.parcelas.reduce((s, p) => s + Number(p.valorTotalAberto ?? 0), 0);
                    const temRemanejada = c.parcelas.some((p) => p.remanejada);

                    return (
                      <div key={item.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-colors group">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-white font-semibold text-sm">{c.cliente.nome}</p>
                              {/* Adimplente substitui Recuperado — aparece só quando totalmente recuperado */}
                              {c.statusRecuperacao === "RECUPERADO_INTEGRALMENTE" && (
                                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                  <CheckCircle2 size={9} /> Adimplente
                                </span>
                              )}
                              {/* Rec. Parcial */}
                              {c.statusRecuperacao === "RECUPERACAO_PARCIAL" && (
                                <span className="text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/20 px-1.5 py-0.5 rounded font-medium">
                                  Rec. Parcial
                                </span>
                              )}
                              {/* Badge Remanejada */}
                              {temRemanejada && c.statusRecuperacao !== "RECUPERADO_INTEGRALMENTE" && (
                                <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                  <RefreshCw size={8} /> Remanejada
                                </span>
                              )}
                              {/* Badge de situação — somente leitura */}
                              {c.situacao !== "INADIMPLENTE" && SITUACAO_COR[c.situacao] && c.statusRecuperacao !== "RECUPERADO_INTEGRALMENTE" && (
                                <span className={`text-[10px] border px-1.5 py-0.5 rounded font-medium ${SITUACAO_COR[c.situacao]}`}>
                                  {SITUACAO_LABEL[c.situacao] ?? c.situacao}
                                </span>
                              )}
                              {SITUACAO_COR_EXTRA[c.situacao] && c.statusRecuperacao !== "RECUPERADO_INTEGRALMENTE" && (
                                <span className={`text-[10px] border px-1.5 py-0.5 rounded font-medium ${SITUACAO_COR_EXTRA[c.situacao]}`}>
                                  {SITUACAO_LABEL_EXTRA[c.situacao]}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="text-xs text-slate-500 font-mono">{c.numero}</span>
                              <span className="text-xs text-slate-400">·</span>
                              <span className="text-xs text-slate-500 flex items-center gap-1">
                                <Building2 size={11} /> {c.empresa.nome}
                              </span>
                            </div>
                            {(c.cliente.telefones || c.cliente.emails) && (
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                {c.cliente.telefones && (
                                  <span className="text-xs text-slate-400 flex items-center gap-1">
                                    <Phone size={10} className="text-slate-500" /> {c.cliente.telefones.split(",")[0].trim()}
                                  </span>
                                )}
                                {c.cliente.emails && (
                                  <span className="text-xs text-slate-400 truncate max-w-[200px]">
                                    {c.cliente.emails.split(",")[0].trim()}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {/* LADO DIREITO — largura fixa, sempre alinhado */}
                          <div className="flex items-center gap-4 flex-shrink-0">

                            {/* Bloco de valores — largura fixa 148px, sempre no mesmo eixo */}
                            <div className="flex flex-col items-end w-[160px] gap-0.5">
                              <span className="text-white font-bold text-base tabular-nums">
                                {formatarMoeda(c.valorTotalAberto ?? 0)}
                              </span>
                              {totalRecebido > 0 && (
                                <span className="text-xs font-medium tabular-nums text-emerald-400">
                                  ↳ {formatarMoeda(totalRecebido)}{c.statusRecuperacao === "RECUPERACAO_PARCIAL" ? " parcial" : ""}
                                </span>
                              )}
                              {totalAParte > 0 && (
                                <button
                                  onClick={() => setModalAParte(c)}
                                  title="Ver detalhes A Parte"
                                  className="text-xs font-medium tabular-nums text-sky-400 hover:text-sky-300 transition-colors text-right"
                                >
                                  ↳ {formatarMoeda(totalAParte)} a parte
                                </button>
                              )}
                            </div>

                            {/* Botões — 5 slots fixos, invisible preserva espaço */}
                            <div className="flex items-center gap-0.5">

                              {/* Slot 1: Atendimento */}
                              <button
                                onClick={() => abrirAtendimento(c)}
                                title="Registrar atendimento"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
                              >
                                <Phone size={14} />
                              </button>

                              {/* Slot 3: Promessa */}
                              <button
                                onClick={() => abrirPromessaRapida(c)}
                                title="Registrar promessa"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
                              >
                                <Calendar size={14} />
                              </button>

                              {/* Slot 4: Recebimento — invisible quando adimplente */}
                              <button
                                onClick={() => abrirRecebimento(c)}
                                title="Registrar recebimento"
                                className={`p-1.5 rounded-lg transition-colors ${
                                  c.statusRecuperacao !== "RECUPERADO_INTEGRALMENTE"
                                    ? "text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                                    : "invisible pointer-events-none"
                                }`}
                              >
                                <DollarSign size={14} />
                              </button>

                              {/* Slot 5: Ficha do cliente */}
                              <Link
                                href={`/clientes/${c.cliente.id}`}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"
                                title="Ver ficha do cliente"
                              >
                                <ChevronRight size={14} />
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Carregar mais */}
      {!carregando && temMais && !empresaFiltro && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => carregarPagina(competenciaId, pagina + 1, true, busca, sort)}
            disabled={carregandoMais}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-sm font-medium px-6 py-2.5 rounded-xl transition-colors"
          >
            {carregandoMais
              ? <><Loader2 size={14} className="animate-spin" /> Carregando...</>
              : <>Carregar mais · {carteira.length}/{totalContratos}</>
            }
          </button>
        </div>
      )}

      {/* Modal: Receber de outra carteira */}
      {modal === "externo" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h2 className="text-white font-semibold">Receber de outra carteira</h2>
                <p className="text-slate-500 text-xs mt-0.5">O cliente será transferido para você após aprovação do gestor</p>
              </div>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>

            {externoSucesso ? (
              <div className="p-8 text-center space-y-3">
                <CheckCircle2 size={40} className="mx-auto text-emerald-400" />
                <p className="text-white font-semibold">Solicitação enviada!</p>
                <p className="text-slate-400 text-sm">O gestor receberá a solicitação de transferência. Após aprovação, o cliente entrará na sua carteira.</p>
                <button
                  onClick={() => setModal(null)}
                  className="mt-2 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {!externoContrato ? (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-400">Busque o cliente pelo nome, CPF ou número do contrato</p>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        autoFocus
                        value={externoQuery}
                        onChange={(e) => setExternoQuery(e.target.value)}
                        placeholder="Nome, CPF ou nº do contrato..."
                        className={inputCls + " pl-9"}
                      />
                    </div>
                    {externoBuscando && (
                      <div className="flex justify-center py-3">
                        <Loader2 size={18} className="animate-spin text-slate-500" />
                      </div>
                    )}
                    {!externoBuscando && externoResultados.length === 0 && externoQuery.length >= 2 && (
                      <p className="text-slate-500 text-sm text-center py-3">Nenhum cliente encontrado</p>
                    )}
                    {externoResultados.length > 0 && (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {externoResultados.map((ct) => {
                          const cart = ct.carteiras?.[0];
                          return (
                            <button
                              key={ct.id}
                              onClick={() => setExternoContrato(ct)}
                              className="w-full bg-slate-800 hover:bg-slate-700 rounded-xl px-4 py-3 text-left transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-white text-sm font-medium">{ct.cliente.nome}</p>
                                  <p className="text-slate-500 text-xs font-mono">{ct.numero} · {ct.empresa.nome}</p>
                                  {cart && (
                                    <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                                      <User size={10} /> {cart.consultor.nome}
                                    </p>
                                  )}
                                </div>
                                <p className="text-white text-xs font-semibold tabular-nums flex-shrink-0">
                                  {formatarMoeda(Number(ct.valorTotalAberto ?? 0))}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Contrato selecionado */}
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-white text-sm font-medium">{externoContrato.cliente.nome}</p>
                          <p className="text-slate-400 text-xs">{externoContrato.numero} · {externoContrato.empresa.nome}</p>
                          {externoContrato.carteiras?.[0] && (
                            <p className="text-amber-400/70 text-xs mt-0.5 flex items-center gap-1">
                              <User size={10} /> Carteira de: {externoContrato.carteiras[0].consultor.nome}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => setExternoContrato(null)}
                          className="text-slate-400 hover:text-white p-1 rounded transition-colors flex-shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Motivo da transferência */}
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Motivo da solicitação *</label>
                      <textarea
                        rows={3}
                        autoFocus
                        className={inputCls + " resize-none"}
                        placeholder="Explique ao gestor o motivo da transferência de carteira..."
                        value={externoForm.observacao}
                        onChange={(e) => setExternoForm((f) => ({ ...f, observacao: e.target.value }))}
                      />
                    </div>

                    <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
                      <p className="text-amber-400/80 text-xs">Após aprovação do gestor, o cliente entrará na sua carteira. O recebimento deve ser registrado depois, com o cliente já vinculado.</p>
                    </div>
                  </div>
                )}

                {externoErro && (
                  <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{externoErro}</p>
                )}

                {externoContrato && !externoSucesso && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => setModal(null)}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={salvarExternoRecebimento}
                      disabled={externoSalvando}
                      className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/30 text-white text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      {externoSalvando
                        ? <><Loader2 size={14} className="animate-spin" /> Enviando...</>
                        : <><ArrowLeftRight size={14} /> Solicitar transferência</>
                      }
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}


      {/* Modal: Detalhes A Parte */}
      {modalAParte && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h2 className="text-white font-semibold">Recebimentos A Parte</h2>
                <p className="text-slate-500 text-xs mt-0.5 truncate max-w-[240px]">{modalAParte.cliente.nome}</p>
              </div>
              <button onClick={() => setModalAParte(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-500">Valores recebidos fora da inadimplência — não contabilizados na recuperação.</p>
              <div className="space-y-2">
                {modalAParte.recebimentos
                  .filter((r) => Number(r.valorAParte ?? 0) > 0)
                  .map((r) => (
                    <div key={r.id} className="bg-slate-800 rounded-xl px-4 py-3">
                      {editandoAParte?.id === r.id ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-slate-400 mb-1 block">Valor (R$)</label>
                              <input
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                                value={editandoAParte.valor}
                                onChange={(e) => setEditandoAParte((p) => p ? { ...p, valor: e.target.value } : null)}
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-400 mb-1 block">Forma</label>
                              <select
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                                value={editandoAParte.formaPagamento}
                                onChange={(e) => setEditandoAParte((p) => p ? { ...p, formaPagamento: e.target.value } : null)}
                              >
                                <option value="PIX">PIX</option>
                                <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                                <option value="BOLETO">Boleto</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={salvarEdicaoAParte} disabled={salvandoEditAParte}
                              className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium py-1.5 rounded-lg border border-emerald-500/20 transition-colors flex items-center justify-center gap-1">
                              {salvandoEditAParte ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Salvar
                            </button>
                            <button onClick={() => setEditandoAParte(null)}
                              className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium py-1.5 rounded-lg transition-colors">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-white text-sm font-semibold">{formatarMoeda(Number(r.valorAParte))}</p>
                            <p className="text-slate-500 text-xs mt-0.5">
                              {new Date(r.dataRecebimento).toLocaleDateString("pt-BR", { timeZone: "UTC" })} · {r.formaPagamento}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-1 rounded-lg">A Parte</span>
                            {isGestorOuAdmin && (
                              <>
                                <button
                                  onClick={() => setEditandoAParte({ id: r.id, valor: String(Number(r.valorAParte)).replace(".", ","), formaPagamento: r.formaPagamento })}
                                  className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg transition-colors ml-1"
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  onClick={() => excluirAParte(r.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                }
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <span className="text-sm text-slate-400">Total a parte</span>
                <span className="text-sm font-bold text-sky-400">
                  {formatarMoeda(modalAParte.recebimentos.reduce((s, r) => s + Number(r.valorAParte ?? 0), 0))}
                </span>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button onClick={() => { setModalAParte(null); setEditandoAParte(null); }} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar recebimento */}
      {modal === "recebimento" && contratoRecebimento && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h2 className="text-white font-semibold">Registrar recebimento</h2>
                <p className="text-slate-500 text-xs mt-0.5 truncate max-w-[280px]">{contratoRecebimento.cliente.nome} · {contratoRecebimento.numero}</p>
              </div>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Seleção de parcelas */}
              {contratoRecebimento.parcelas.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-400">Selecione o status de cada parcela</p>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> Recebida</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500 inline-block" /> Remanejada</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {[...contratoRecebimento.parcelas].sort((a, b) => new Date(a.dataVencimento).getTime() - new Date(b.dataVencimento).getTime()).map((p) => {
                      const recebida = recebForm.parcelasIds.includes(p.id);
                      const remanejada = recebForm.parcelasRemanejadas.includes(p.id);
                      const venc = new Date(p.dataVencimento);
                      const vencLabel = `${String(venc.getUTCDate()).padStart(2,"0")}/${String(venc.getUTCMonth()+1).padStart(2,"0")}/${venc.getUTCFullYear()}`;
                      return (
                        <div
                          key={p.id}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                            recebida
                              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                              : remanejada
                              ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
                              : "bg-slate-800 border-slate-700 text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <span>{vencLabel}</span>
                            <span className={`text-xs ${p.diasAtraso > 90 ? "text-red-400" : p.diasAtraso > 30 ? "text-amber-400" : "text-sky-400"}`}>
                              {p.diasAtraso}d atraso
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold tabular-nums text-xs">{formatarMoeda(Number(p.valorTotalAberto ?? 0))}</span>
                            {/* Botão Recebida */}
                            <button
                              type="button"
                              onClick={() => toggleParcela(p)}
                              title="Recebida"
                              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors flex-shrink-0 ${
                                recebida ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-400 hover:bg-emerald-500/30 hover:text-emerald-300"
                              }`}
                            >
                              <CheckCircle2 size={13} />
                            </button>
                            {/* Botão Remanejada */}
                            <button
                              type="button"
                              onClick={() => toggleParcelaRemanejada(p.id)}
                              title="Remanejada"
                              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors flex-shrink-0 ${
                                remanejada ? "bg-amber-500 text-white" : "bg-slate-700 text-slate-400 hover:bg-amber-500/30 hover:text-amber-300"
                              }`}
                            >
                              <RefreshCw size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {contratoRecebimento.parcelas.length === 0 && (
                <p className="text-xs text-slate-500 bg-slate-800 rounded-lg px-3 py-2">Nenhuma parcela em aberto encontrada — informe o valor manualmente.</p>
              )}

              {/* Campos do formulário */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-slate-400">Valor recebido (R$) *</label>
                    {recebForm.valorManual && recebForm.parcelasIds.length > 0 && (
                      <button type="button" onClick={recalcularValorParcelas} className="text-[10px] text-sky-400 hover:text-sky-300 transition-colors">
                        ↺ Recalcular parcelas
                      </button>
                    )}
                  </div>
                  <input
                    className={inputCls}
                    placeholder="0,00"
                    value={recebForm.valor}
                    onChange={(e) => setRecebForm((f) => ({ ...f, valor: e.target.value, valorManual: true }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Data do recebimento *</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={recebForm.data}
                    onChange={(e) => setRecebForm((f) => ({ ...f, data: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5">Forma de pagamento *</label>
                  <select
                    className={inputCls}
                    value={recebForm.formaPagamento}
                    onChange={(e) => setRecebForm((f) => ({ ...f, formaPagamento: e.target.value }))}
                  >
                    <option value="PIX">PIX</option>
                    <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                    <option value="BOLETO">Boleto</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5">Observação</label>
                  <textarea
                    rows={2}
                    className={inputCls + " resize-none"}
                    placeholder="Opcional — ex: cliente pagou 2 de 5 parcelas"
                    value={recebForm.observacao}
                    onChange={(e) => setRecebForm((f) => ({ ...f, observacao: e.target.value }))}
                  />
                </div>
              </div>

              {erroReceb && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erroReceb}</p>
              )}
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={() => setModal(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={salvarRecebimento}
                disabled={salvandoReceb}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/30 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {salvandoReceb
                  ? <><Loader2 size={14} className="animate-spin" /> Salvando...</>
                  : <><CheckCircle2 size={14} /> Confirmar recebimento</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Atendimento (histórico + novo contato) */}
      {modalAtend && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
              <div>
                <h2 className="text-white font-semibold flex items-center gap-2"><History size={16} className="text-sky-400" /> Atendimento</h2>
                <p className="text-slate-500 text-xs mt-0.5 truncate max-w-[320px]">{modalAtend.cliente.nome} · {modalAtend.numero}</p>
              </div>
              <button onClick={() => setModalAtend(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              {/* Histórico */}
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Histórico de contatos</p>
                {carregandoHist ? (
                  <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-slate-500" /></div>
                ) : historico.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-3">Nenhum contato registrado</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {historico.map((h: any) => (
                      <div key={h.id} className="flex items-start gap-3 bg-slate-800 rounded-xl px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${STATUS_COR[h.status] ?? "text-slate-400"}`}>{STATUS_LABEL[h.status] ?? h.status}</span>
                            <span className="text-slate-400 text-xs">·</span>
                            <span className="text-slate-500 text-xs">{h.tipo === "LIGACAO" ? "Ligação" : h.tipo === "WHATSAPP" ? "WhatsApp" : "E-mail"}</span>
                          </div>
                          {h.observacao && <p className="text-slate-400 text-xs mt-0.5 truncate">{h.observacao}</p>}
                          {h.agendadoPara && <p className="text-amber-400 text-xs mt-0.5 flex items-center gap-1"><Clock size={10} /> Agendado: {new Date(h.agendadoPara).toLocaleString("pt-BR")}</p>}
                        </div>
                        <span className="text-slate-400 text-xs flex-shrink-0">{new Date(h.criadoEm).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Novo contato */}
              <div className="border-t border-slate-800 pt-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Novo registro</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Canal *</label>
                      <select className={inputCls} value={atendForm.tipo} onChange={(e) => setAtendForm((f) => ({ ...f, tipo: e.target.value }))}>
                        <option value="LIGACAO">Ligação</option>
                        <option value="WHATSAPP">WhatsApp</option>
                        <option value="EMAIL">E-mail</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Status *</label>
                      <select className={inputCls} value={atendForm.status} onChange={(e) => setAtendForm((f) => ({ ...f, status: e.target.value }))}>
                        <option value="ACIONADO">Acionado</option>
                        <option value="NAO_ATENDE">Não atende</option>
                        <option value="SEM_RESPOSTA">Sem resposta</option>
                        <option value="VISUALIZOU_SEM_RESPOSTA">Visualizou, não respondeu</option>
                        <option value="NAO_RESPONDE_MENSAGENS">Não responde mensagens</option>
                        <option value="CONTATO_INEXISTENTE">Contato inexistente</option>
                        <option value="NAO_QUER_CONTATO">Não quer contato</option>
                        <option value="AGUARDANDO_RETORNO">Aguardando retorno</option>
                        <option value="LIGAR_DEPOIS">Ligar depois</option>
                        <option value="LINK_ENVIADO">Link enviado</option>
                        <option value="OUTROS">Outros</option>
                      </select>
                    </div>
                  </div>
                  {STATUS_COM_AGENDA.includes(atendForm.status) && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">
                        {atendForm.status === "LIGAR_DEPOIS" ? "Data/hora para ligar" : atendForm.status === "LINK_ENVIADO" ? "Data/hora para verificar pagamento" : "Data/hora para retorno"} *
                      </label>
                      <input type="datetime-local" className={inputCls} value={atendForm.agendadoPara}
                        onChange={(e) => setAtendForm((f) => ({ ...f, agendadoPara: e.target.value }))} />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">
                      Observação {STATUS_OBS_OBRIG.includes(atendForm.status) ? "*" : ""}
                    </label>
                    <textarea rows={2} className={inputCls + " resize-none"} placeholder="Descreva o atendimento..."
                      value={atendForm.observacao} onChange={(e) => setAtendForm((f) => ({ ...f, observacao: e.target.value }))} />
                  </div>
                </div>
              </div>

              {erroAtend && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erroAtend}</p>
              )}
            </div>

            <div className="flex gap-3 p-5 border-t border-slate-800 flex-shrink-0">
              <button onClick={() => setModalAtend(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors">
                Fechar
              </button>
              <button onClick={salvarAtendimento} disabled={salvandoAtend}
                className="flex-1 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-600/30 text-white text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                {salvandoAtend ? <><Loader2 size={14} className="animate-spin" /> Registrando...</> : <><Phone size={14} /> Registrar contato</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Promessa rápida */}
      {modalPromRap && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h2 className="text-white font-semibold flex items-center gap-2"><Calendar size={16} className="text-purple-400" /> {promRapModo === "LINK" ? "Link de Pagamento Enviado" : "Promessa de Pagamento"}</h2>
                <p className="text-slate-500 text-xs mt-0.5 truncate max-w-[280px]">{modalPromRap.cliente.nome} · {modalPromRap.numero}</p>
              </div>
              <button onClick={() => setModalPromRap(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Parcelas */}
              {modalPromRap.parcelas.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-2">Parcelas incluídas na promessa <span className="text-slate-400">(valor preenchido automaticamente)</span></p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {[...modalPromRap.parcelas].sort((a, b) => new Date(a.dataVencimento).getTime() - new Date(b.dataVencimento).getTime()).map((p) => {
                      const checked = promRapForm.parcelasIds.includes(p.id);
                      const venc = new Date(p.dataVencimento);
                      const vencLabel = `${String(venc.getUTCDate()).padStart(2,"0")}/${String(venc.getUTCMonth()+1).padStart(2,"0")}/${venc.getUTCFullYear()}`;
                      return (
                        <button key={p.id} type="button" onClick={() => toggleParcelaPromRap(p)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors ${checked ? "bg-purple-500/10 border-purple-500/40 text-purple-300" : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600"}`}>
                          <div className="flex items-center gap-2.5">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? "bg-purple-500 border-purple-500" : "border-slate-600"}`}>
                              {checked && <CheckCircle2 size={10} className="text-white" />}
                            </div>
                            <span>{vencLabel}</span>
                            <span className={`text-xs ${p.diasAtraso > 90 ? "text-red-400" : p.diasAtraso > 30 ? "text-amber-400" : "text-sky-400"}`}>{p.diasAtraso}d</span>
                          </div>
                          <span className="font-semibold tabular-nums">{formatarMoeda(Number(p.valorTotalAberto ?? 0))}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Valor prometido (R$) *</label>
                  <input className={inputCls} placeholder="0,00" value={promRapForm.valor}
                    onChange={(e) => setPromRapForm((f) => ({ ...f, valor: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">{promRapModo === "LINK" ? "Data (hoje)" : "Data combinada *"}</label>
                  <input type="date" className={inputCls + (promRapModo === "LINK" ? " opacity-60 cursor-not-allowed" : "")} value={promRapForm.data}
                    readOnly={promRapModo === "LINK"}
                    onChange={promRapModo === "LINK" ? undefined : (e) => setPromRapForm((f) => ({ ...f, data: e.target.value }))} />
                </div>
                {promRapModo !== "LINK" && (
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-400 mb-1.5">Forma de pagamento *</label>
                    <select className={inputCls} value={promRapForm.formaPagamento}
                      onChange={(e) => setPromRapForm((f) => ({ ...f, formaPagamento: e.target.value }))}>
                      <option value="PIX">PIX</option>
                      <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                      <option value="BOLETO">Boleto</option>
                    </select>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5">Observação</label>
                  <textarea rows={2} className={inputCls + " resize-none"} placeholder="Opcional"
                    value={promRapForm.observacao} onChange={(e) => setPromRapForm((f) => ({ ...f, observacao: e.target.value }))} />
                </div>
              </div>
              {erroPromRap && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erroPromRap}</p>
              )}
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setModalPromRap(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={salvarPromessaRapida} disabled={salvandoPromRap}
                className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/30 text-white text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                {salvandoPromRap ? <><Loader2 size={14} className="animate-spin" /> Registrando...</> : <><Calendar size={14} /> {promRapModo === "LINK" ? "Salvar link enviado" : "Registrar promessa"}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Novo cadastro */}
      {modal === "novo" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h2 className="text-white font-semibold">Cadastrar novo cliente</h2>
                <p className="text-slate-500 text-xs mt-0.5">Cliente que não está na base importada</p>
              </div>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">

              {/* Tipo do lançamento */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Tipo do lançamento *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNovoForm((f) => ({ ...f, tipo: "inadimplencia" }))}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      novoForm.tipo === "inadimplencia"
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    Inadimplência
                  </button>
                  <button
                    type="button"
                    onClick={() => setNovoForm((f) => ({ ...f, tipo: "a_parte" }))}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                      novoForm.tipo === "a_parte"
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    Recebimento a Parte
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  {novoForm.tipo === "inadimplencia"
                    ? "O valor será adicionado à dívida total da carteira e entrará em Recebido quando pago."
                    : "O valor já foi recebido fora do fluxo normal. Será lançado diretamente como a parte."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5">Número do contrato *</label>
                  <div className="relative">
                    <input
                      className={inputCls + (novoForm.tipo === "a_parte" && novoClienteEncontrado ? " border-emerald-500/50" : "")}
                      placeholder="Ex: GR-001234"
                      value={novoForm.numeroContrato}
                      onChange={(e) => {
                        setNovoClienteEncontrado(false);
                        setNovoForm((f) => ({ ...f, numeroContrato: e.target.value }));
                      }}
                    />
                    {novoForm.tipo === "a_parte" && novoBuscandoContrato && (
                      <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
                    )}
                  </div>
                  {novoForm.tipo === "a_parte" && novoClienteEncontrado && (
                    <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                      <CheckCircle2 size={11} /> Cliente encontrado — dados preenchidos automaticamente
                    </p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Nome do cliente *
                    {novoForm.tipo === "a_parte" && novoClienteEncontrado && (
                      <span className="ml-1.5 text-emerald-400/70 font-normal">preenchido</span>
                    )}
                  </label>
                  <input className={inputCls} placeholder="Nome completo" value={novoForm.nomeCliente}
                    onChange={(e) => setNovoForm((f) => ({ ...f, nomeCliente: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Telefone
                    {novoForm.tipo === "a_parte" && novoClienteEncontrado && novoForm.telefones && (
                      <span className="ml-1.5 text-emerald-400/70 font-normal">preenchido</span>
                    )}
                  </label>
                  <input className={inputCls} placeholder="(11) 99999-9999" value={novoForm.telefones}
                    onChange={(e) => setNovoForm((f) => ({ ...f, telefones: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">
                    E-mail
                    {novoForm.tipo === "a_parte" && novoClienteEncontrado && novoForm.emails && (
                      <span className="ml-1.5 text-emerald-400/70 font-normal">preenchido</span>
                    )}
                  </label>
                  <input className={inputCls} placeholder="cliente@email.com" value={novoForm.emails}
                    onChange={(e) => setNovoForm((f) => ({ ...f, emails: e.target.value }))} />
                </div>

                {novoForm.tipo === "inadimplencia" && (
                  <div className="col-span-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-slate-400">Parcelas em atraso *</label>
                      <button
                        type="button"
                        onClick={() => setNovoForm((f) => ({ ...f, parcelas: [...f.parcelas, { dataVencimento: "", valor: "" }] }))}
                        className="text-xs text-gr-400 hover:text-gr-300 flex items-center gap-1 transition-colors"
                      >
                        <Plus size={12} /> Adicionar parcela
                      </button>
                    </div>
                    <div className="space-y-2">
                      {novoForm.parcelas.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="date"
                            className={inputCls + " flex-1"}
                            value={p.dataVencimento}
                            onChange={(e) => setNovoForm((f) => {
                              const parcelas = [...f.parcelas];
                              parcelas[i] = { ...parcelas[i], dataVencimento: e.target.value };
                              return { ...f, parcelas };
                            })}
                          />
                          <input
                            className={inputCls + " flex-1"}
                            placeholder="R$ 0,00"
                            value={p.valor}
                            onChange={(e) => setNovoForm((f) => {
                              const parcelas = [...f.parcelas];
                              parcelas[i] = { ...parcelas[i], valor: e.target.value };
                              return { ...f, parcelas };
                            })}
                          />
                          {novoForm.parcelas.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setNovoForm((f) => ({ ...f, parcelas: f.parcelas.filter((_, j) => j !== i) }))}
                              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5">Os dias em atraso serão calculados automaticamente com base no 1º dia útil da competência.</p>
                  </div>
                )}

                {novoForm.tipo === "a_parte" && (
                  <>
                    <div className="col-span-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs text-slate-400">Parcelas recebidas a parte *</label>
                        <button
                          type="button"
                          onClick={() => setNovoForm((f) => ({ ...f, parcelas: [...f.parcelas, { dataVencimento: "", valor: "" }] }))}
                          className="text-xs text-gr-400 hover:text-gr-300 flex items-center gap-1 transition-colors"
                        >
                          <Plus size={12} /> Adicionar parcela
                        </button>
                      </div>
                      <div className="space-y-2">
                        {novoForm.parcelas.map((p, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="date"
                              className={inputCls + " flex-1"}
                              value={p.dataVencimento}
                              onChange={(e) => setNovoForm((f) => {
                                const parcelas = [...f.parcelas];
                                parcelas[i] = { ...parcelas[i], dataVencimento: e.target.value };
                                return { ...f, parcelas };
                              })}
                            />
                            <input
                              className={inputCls + " flex-1"}
                              placeholder="R$ 0,00"
                              value={p.valor}
                              onChange={(e) => setNovoForm((f) => {
                                const parcelas = [...f.parcelas];
                                parcelas[i] = { ...parcelas[i], valor: e.target.value };
                                return { ...f, parcelas };
                              })}
                            />
                            {novoForm.parcelas.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setNovoForm((f) => ({ ...f, parcelas: f.parcelas.filter((_, j) => j !== i) }))}
                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Data do recebimento *</label>
                      <input
                        type="date"
                        className={inputCls}
                        value={novoForm.dataRecebimento}
                        onChange={(e) => setNovoForm((f) => ({ ...f, dataRecebimento: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Forma de pagamento *</label>
                      <select className={inputCls} value={novoForm.formaPagamento}
                        onChange={(e) => setNovoForm((f) => ({ ...f, formaPagamento: e.target.value }))}>
                        <option value="PIX">PIX</option>
                        <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                        <option value="BOLETO">Boleto</option>
                      </select>
                    </div>
                  </>
                )}
              </div>

              {erroNovo && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erroNovo}</p>
              )}
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => { setModal(null); setNovoForm(NOVO_FORM_VAZIO); setNovoClienteEncontrado(false); }}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={salvarNovoCliente} disabled={salvandoNovo}
                className="flex-1 bg-gr-500 hover:bg-gr-400 disabled:bg-gr-500/30 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                {salvandoNovo ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : <><UserPlus size={14} /> Cadastrar e adicionar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
