"use client";

import { useEffect, useState, useRef } from "react";
import {
  FolderOpen, Search, Plus, X, AlertCircle,
  ChevronRight, UserPlus, Building2, Loader2, CheckCircle2, DollarSign, ArrowLeftRight, User,
} from "lucide-react";
import { formatarMoeda } from "@/lib/utils";
import Link from "next/link";

interface Contrato {
  id: string;
  numero: string;
  maiorDiasAtraso: number | null;
  valorTotalAberto: number | null;
  statusContrato: string | null;
  cliente: { id: string; nome: string; telefones: string | null };
  empresa: { nome: string };
  contatos: { tipo: string; status: string; criadoEm: string }[];
  promessas: { id: string; valorPrometido: number; dataPrometida: string }[];
  recebimentos: { id: string; valor: number; valorAParte: number | null; dataRecebimento: string; formaPagamento: string }[];
  parcelas: { id: string; numero: number; diasAtraso: number; valorTotalAberto: number }[];
  statusRecuperacao: string | null;
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
  RECEBIDO: "text-emerald-400",
  NAO_ATENDE: "text-slate-500",
  SEM_RESPOSTA: "text-slate-500",
  PROMESSA_QUEBRADA: "text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  ACIONADO: "Acionado",
  EM_NEGOCIACAO: "Negociando",
  PROMESSA_PAGAMENTO: "Promessa",
  RECEBIDO: "Recebido",
  NAO_ATENDE: "Não atende",
  SEM_RESPOSTA: "Sem resposta",
  PROMESSA_QUEBRADA: "Promessa quebrada",
  AGUARDANDO_RETORNO: "Aguardando retorno",
  LIGAR_DEPOIS: "Ligar depois",
};

function diasAtrasoColor(dias: number | null) {
  if (!dias) return "text-slate-400";
  if (dias <= 30) return "text-sky-400";
  if (dias <= 90) return "text-amber-400";
  return "text-red-400";
}

const inputCls = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500 placeholder:text-slate-500";

export default function CarteiraPage() {
  const [carteira, setCarteira] = useState<ItemCarteira[]>([]);
  const [totalContratos, setTotalContratos] = useState(0);
  const [valorTotal, setValorTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [competenciaId, setCompetenciaId] = useState("");
  const [competencias, setCompetencias] = useState<any[]>([]);
  const [busca, setBusca] = useState("");
  const [empresaFiltro, setEmpresaFiltro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState<"buscar" | "novo" | "recebimento" | "externo" | null>(null);
  const [contratoRecebimento, setContratoRecebimento] = useState<Contrato | null>(null);
  const [recebForm, setRecebForm] = useState({ valor: "", valorAParte: "", formaPagamento: "PIX", observacao: "", data: new Date().toISOString().slice(0, 10), parcelasIds: [] as string[] });
  const [salvandoReceb, setSalvandoReceb] = useState(false);
  const [erroReceb, setErroReceb] = useState("");
  const [modalAParte, setModalAParte] = useState<Contrato | null>(null);

  // Estado modal buscar existente
  const [queryBusca, setQueryBusca] = useState("");
  const [resultados, setResultados] = useState<ContratoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [adicionando, setAdicionando] = useState<string | null>(null);
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    numeroContrato: "", diasAtraso: "", valorAReceber: "",
  });
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [erroNovo, setErroNovo] = useState("");

  useEffect(() => {
    fetch("/api/competencias").then((r) => r.json()).then((cs) => {
      setCompetencias(cs);
      if (cs[0]) setCompetenciaId(cs[0].id);
    });
  }, []);

  async function carregarPagina(cId: string, pg: number, append = false) {
    if (!append) setCarregando(true); else setCarregandoMais(true);
    const data = await fetch(`/api/carteira?competenciaId=${cId}&page=${pg}`).then((r) => r.json()).catch(() => ({}));
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
    carregarPagina(competenciaId, 1);
  }, [competenciaId]);

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
    const valor = parseFloat(externoForm.valor.replace(",", "."));
    if (!valor || valor <= 0) { setExternoErro("Informe um valor válido"); return; }
    setExternoSalvando(true);
    const [resReceb, resSolic] = await Promise.all([
      fetch("/api/recebimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contratoId: externoContrato.id,
          valor,
          dataRecebimento: externoForm.data,
          formaPagamento: externoForm.formaPagamento,
          observacao: externoForm.observacao || "Recebimento de cliente de outra carteira",
          parcelasIds: [],
        }),
      }),
      fetch("/api/solicitacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "TRANSFERENCIA_CONTRATO",
          contratoId: externoContrato.id,
          motivo: `Recebimento de ${externoContrato.cliente.nome} (${externoContrato.numero}) — cliente de outra carteira. Valor: R$ ${valor.toFixed(2).replace(".", ",")}`,
        }),
      }),
    ]);
    setExternoSalvando(false);
    if (!resReceb.ok) {
      const d = await resReceb.json();
      setExternoErro(d.erro || "Erro ao registrar recebimento");
      return;
    }
    setExternoSucesso(true);
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

  // Busca com debounce
  useEffect(() => {
    if (!queryBusca || queryBusca.length < 2) { setResultados([]); return; }
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    buscaTimer.current = setTimeout(async () => {
      setBuscando(true);
      const data = await fetch(`/api/carteira/buscar?q=${encodeURIComponent(queryBusca)}&competenciaId=${competenciaId}`).then((r) => r.json());
      setResultados(Array.isArray(data) ? data : []);
      setBuscando(false);
    }, 350);
  }, [queryBusca, competenciaId]);

  async function adicionarExistente(contratoId: string) {
    setAdicionando(contratoId);
    const res = await fetch("/api/carteira/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contratoId, competenciaId }),
    });
    setAdicionando(null);
    if (res.ok) {
      setModal(null);
      setQueryBusca("");
      setResultados([]);
      carregarPagina(competenciaId, 1);
    }
  }

  function abrirRecebimento(c: Contrato) {
    setContratoRecebimento(c);
    setRecebForm({
      valor: "",
      valorAParte: "",
      formaPagamento: "PIX",
      observacao: "",
      data: new Date().toISOString().slice(0, 10),
      parcelasIds: [],
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
      // Auto-soma as parcelas selecionadas
      const totalSelecionado = contratoRecebimento?.parcelas
        .filter((p) => novosIds.includes(p.id))
        .reduce((s, p) => s + Number(p.valorTotalAberto ?? 0), 0) ?? 0;
      return {
        ...f,
        parcelasIds: novosIds,
        valor: novosIds.length > 0 ? totalSelecionado.toFixed(2).replace(".", ",") : f.valor,
      };
    });
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
      }),
    });
    const data = await res.json();
    setSalvandoReceb(false);
    if (!res.ok) { setErroReceb(data.erro || "Erro ao registrar"); return; }
    setModal(null);
    carregarPagina(competenciaId, 1);
  }

  async function salvarNovoCliente() {
    setErroNovo("");
    if (!novoForm.nomeCliente || !novoForm.numeroContrato) {
      setErroNovo("Nome do cliente e número do contrato são obrigatórios"); return;
    }
    setSalvandoNovo(true);
    const res = await fetch("/api/carteira/novo-cliente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...novoForm, competenciaId }),
    });
    const data = await res.json();
    setSalvandoNovo(false);
    if (!res.ok) { setErroNovo(data.erro || "Erro ao cadastrar"); return; }
    setModal(null);
    setNovoForm({ nomeCliente: "", telefones: "", emails: "", numeroContrato: "", diasAtraso: "", valorAReceber: "" });
    carregarPagina(competenciaId, 1);
  }

  const empresas = Array.from(new Set(carteira.map((i) => i.contrato.empresa.nome))).sort();

  const filtrados = carteira.filter((item) => {
    const q = busca.toLowerCase();
    const passaBusca =
      item.contrato.cliente.nome.toLowerCase().includes(q) ||
      item.contrato.numero.toLowerCase().includes(q) ||
      item.contrato.empresa.nome.toLowerCase().includes(q);
    const passaEmpresa = !empresaFiltro || item.contrato.empresa.nome === empresaFiltro;
    return passaBusca && passaEmpresa;
  });

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
            onClick={() => { setModal("buscar"); setQueryBusca(""); setResultados([]); }}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-medium px-3 py-2 rounded-xl transition-colors"
          >
            <Search size={15} /> Buscar existente
          </button>
          <button
            onClick={() => setModal("novo")}
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

      {/* Busca */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Filtrar por cliente ou contrato..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gr-500"
        />
      </div>

      {/* Filtros por empresa */}
      {empresas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setEmpresaFiltro(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              !empresaFiltro
                ? "bg-gr-500 text-white"
                : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
            }`}
          >
            Todas
          </button>
          {empresas.map((emp) => (
            <button
              key={emp}
              onClick={() => setEmpresaFiltro(emp === empresaFiltro ? null : emp)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                empresaFiltro === emp
                  ? "bg-gr-500 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
              }`}
            >
              {emp}
            </button>
          ))}
        </div>
      )}

      {/* Lista */}
      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <AlertCircle size={32} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-500 text-sm">Nenhum contrato na carteira</p>
          <p className="text-slate-600 text-xs mt-1">Use os botões acima para adicionar clientes manualmente</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map((item) => {
            const c = item.contrato;
            const ultimoContato = c.contatos[0];
            const temPromessa = c.promessas.length > 0;
            const totalRecebido = c.recebimentos.reduce((s, r) => s + Number(r.valor), 0);
            const totalAParte = c.recebimentos.reduce((s, r) => s + Number(r.valorAParte ?? 0), 0);

            return (
              <div key={item.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-colors group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-semibold text-sm">{c.cliente.nome}</p>
                      {c.statusRecuperacao === "RECUPERADO_INTEGRALMENTE" && (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                          <CheckCircle2 size={9} /> Recuperado
                        </span>
                      )}
                      {c.statusRecuperacao === "RECUPERACAO_PARCIAL" && (
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-medium">
                          Rec. parcial · {formatarMoeda(totalRecebido)}
                        </span>
                      )}
                      {totalAParte > 0 && (
                        <button
                          onClick={() => setModalAParte(c)}
                          className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded font-medium hover:bg-sky-500/20 transition-colors"
                        >
                          A Parte · {formatarMoeda(totalAParte)}
                        </button>
                      )}
                      {temPromessa && c.statusRecuperacao === "INADIMPLENTE" && (
                        <span className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded font-medium">promessa aberta</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-slate-500 font-mono">{c.numero}</span>
                      <span className="text-xs text-slate-600">·</span>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Building2 size={11} /> {c.empresa.nome}
                      </span>
                      {ultimoContato && (
                        <>
                          <span className="text-xs text-slate-600">·</span>
                          <span className={`text-xs ${STATUS_COR[ultimoContato.status] ?? "text-slate-400"}`}>
                            {STATUS_LABEL[ultimoContato.status] ?? ultimoContato.status}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-white font-semibold text-sm tabular-nums">
                        {formatarMoeda(Number(c.valorTotalAberto ?? 0))}
                      </p>
                      <p className={`text-xs font-medium tabular-nums ${diasAtrasoColor(c.maiorDiasAtraso)}`}>
                        {c.maiorDiasAtraso ?? 0}d em atraso
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {c.statusRecuperacao !== "RECUPERADO_INTEGRALMENTE" && (
                        <button
                          onClick={() => abrirRecebimento(c)}
                          title="Registrar recebimento"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                        >
                          <DollarSign size={15} />
                        </button>
                      )}
                      <Link
                        href={`/clientes/${c.cliente.id}`}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"
                        title="Ver ficha do cliente"
                      >
                        <ChevronRight size={15} />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Carregar mais */}
      {!carregando && temMais && !busca && !empresaFiltro && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => carregarPagina(competenciaId, pagina + 1, true)}
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
                <p className="text-white font-semibold">Recebimento registrado!</p>
                <p className="text-slate-400 text-sm">Uma solicitação de transferência foi enviada ao gestor para aprovação.</p>
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

                    {/* Formulário de recebimento */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5">Valor recebido (R$) *</label>
                        <input
                          className={inputCls}
                          placeholder="0,00"
                          value={externoForm.valor}
                          onChange={(e) => setExternoForm((f) => ({ ...f, valor: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1.5">Data do recebimento *</label>
                        <input
                          type="date"
                          className={inputCls}
                          value={externoForm.data}
                          onChange={(e) => setExternoForm((f) => ({ ...f, data: e.target.value }))}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-slate-400 mb-1.5">Forma de pagamento *</label>
                        <select
                          className={inputCls}
                          value={externoForm.formaPagamento}
                          onChange={(e) => setExternoForm((f) => ({ ...f, formaPagamento: e.target.value }))}
                        >
                          <option value="PIX">PIX</option>
                          <option value="BOLETO">Boleto</option>
                          <option value="TED">Transferência (TED)</option>
                          <option value="DINHEIRO">Dinheiro</option>
                          <option value="CHEQUE">Cheque</option>
                          <option value="CARTAO_DEBITO">Cartão Débito</option>
                          <option value="CARTAO_CREDITO">Cartão Crédito</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs text-slate-400 mb-1.5">Observação</label>
                        <textarea
                          rows={2}
                          className={inputCls + " resize-none"}
                          placeholder="Opcional"
                          value={externoForm.observacao}
                          onChange={(e) => setExternoForm((f) => ({ ...f, observacao: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
                      <p className="text-amber-400/80 text-xs">Uma solicitação de transferência será enviada ao gestor. Após aprovação, o cliente entrará na sua carteira.</p>
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
                        : <><ArrowLeftRight size={14} /> Registrar e solicitar</>
                      }
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Buscar contrato existente */}
      {modal === "buscar" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h2 className="text-white font-semibold">Adicionar contrato existente</h2>
                <p className="text-slate-500 text-xs mt-0.5">Busque pelo nome do cliente ou número do contrato</p>
              </div>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  autoFocus
                  value={queryBusca}
                  onChange={(e) => setQueryBusca(e.target.value)}
                  placeholder="Nome do cliente ou nº do contrato..."
                  className={inputCls + " pl-9"}
                />
              </div>

              {buscando && (
                <div className="flex justify-center py-4">
                  <Loader2 size={20} className="animate-spin text-slate-500" />
                </div>
              )}

              {!buscando && resultados.length === 0 && queryBusca.length >= 2 && (
                <p className="text-slate-600 text-sm text-center py-4">Nenhum contrato sem carteira encontrado</p>
              )}

              {resultados.length > 0 && (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {resultados.map((ct) => (
                    <div key={ct.id} className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                      <div>
                        <p className="text-white text-sm font-medium">{ct.cliente.nome}</p>
                        <p className="text-slate-500 text-xs font-mono">{ct.numero} · {ct.empresa.nome}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-white text-xs font-semibold">{formatarMoeda(Number(ct.valorTotalAberto ?? 0))}</p>
                          <p className={`text-xs ${diasAtrasoColor(ct.maiorDiasAtraso)}`}>{ct.maiorDiasAtraso ?? 0}d</p>
                        </div>
                        <button
                          onClick={() => adicionarExistente(ct.id)}
                          disabled={adicionando === ct.id}
                          className="flex items-center gap-1.5 bg-gr-500 hover:bg-gr-400 disabled:bg-gr-500/30 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                        >
                          {adicionando === ct.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                          Adicionar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                  .map((r, i) => (
                    <div key={r.id} className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                      <div>
                        <p className="text-white text-sm font-semibold">{formatarMoeda(Number(r.valorAParte))}</p>
                        <p className="text-slate-500 text-xs mt-0.5">
                          {new Date(r.dataRecebimento).toLocaleDateString("pt-BR")} · {r.formaPagamento}
                        </p>
                      </div>
                      <span className="text-xs bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-1 rounded-lg">A Parte</span>
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
              <button onClick={() => setModalAParte(null)} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors">
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
                  <p className="text-xs text-slate-400 mb-2">Selecione as parcelas pagas <span className="text-slate-600">(o valor é preenchido automaticamente)</span></p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {contratoRecebimento.parcelas.map((p) => {
                      const checked = recebForm.parcelasIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleParcela(p)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                            checked
                              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                              : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                              checked ? "bg-emerald-500 border-emerald-500" : "border-slate-600"
                            }`}>
                              {checked && <CheckCircle2 size={10} className="text-white" />}
                            </div>
                            <span>Parcela {p.numero}</span>
                            <span className={`text-xs ${p.diasAtraso > 90 ? "text-red-400" : p.diasAtraso > 30 ? "text-amber-400" : "text-sky-400"}`}>
                              {p.diasAtraso}d atraso
                            </span>
                          </div>
                          <span className="font-semibold tabular-nums">{formatarMoeda(Number(p.valorTotalAberto ?? 0))}</span>
                        </button>
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
                  <label className="block text-xs text-slate-400 mb-1.5">Valor recebido (R$) *</label>
                  <input
                    className={inputCls}
                    placeholder="0,00"
                    value={recebForm.valor}
                    onChange={(e) => setRecebForm((f) => ({ ...f, valor: e.target.value }))}
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
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Valor a parte (R$)
                    <span className="ml-1 text-slate-600 font-normal">— antecipação ou valor fora da inadimplência</span>
                  </label>
                  <input
                    className={inputCls}
                    placeholder="0,00 — opcional"
                    value={recebForm.valorAParte}
                    onChange={(e) => setRecebForm((f) => ({ ...f, valorAParte: e.target.value }))}
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
                    <option value="BOLETO">Boleto</option>
                    <option value="TED">Transferência (TED)</option>
                    <option value="DINHEIRO">Dinheiro</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CARTAO_DEBITO">Cartão Débito</option>
                    <option value="CARTAO_CREDITO">Cartão Crédito</option>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5">Nome do cliente *</label>
                  <input className={inputCls} placeholder="Nome completo" value={novoForm.nomeCliente}
                    onChange={(e) => setNovoForm((f) => ({ ...f, nomeCliente: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Telefone</label>
                  <input className={inputCls} placeholder="(11) 99999-9999" value={novoForm.telefones}
                    onChange={(e) => setNovoForm((f) => ({ ...f, telefones: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">E-mail</label>
                  <input className={inputCls} placeholder="cliente@email.com" value={novoForm.emails}
                    onChange={(e) => setNovoForm((f) => ({ ...f, emails: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5">Número do contrato *</label>
                  <input className={inputCls} placeholder="Ex: GR-001234" value={novoForm.numeroContrato}
                    onChange={(e) => setNovoForm((f) => ({ ...f, numeroContrato: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Dias em atraso</label>
                  <input type="number" className={inputCls} placeholder="0" value={novoForm.diasAtraso}
                    onChange={(e) => setNovoForm((f) => ({ ...f, diasAtraso: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Valor inadimplente (R$)</label>
                  <input className={inputCls} placeholder="0,00" value={novoForm.valorAReceber}
                    onChange={(e) => setNovoForm((f) => ({ ...f, valorAReceber: e.target.value }))} />
                </div>
              </div>

              {erroNovo && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erroNovo}</p>
              )}
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setModal(null)}
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
