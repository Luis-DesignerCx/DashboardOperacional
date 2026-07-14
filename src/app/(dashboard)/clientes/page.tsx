"use client";

import { useEffect, useRef, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { Search, AlertCircle, ChevronRight, Phone, Loader2, History, X, MessageCircle, Mail, PhoneCall, DollarSign, CheckCircle2, XCircle, Clock } from "lucide-react";
import Link from "next/link";

const STATUS_COR: Record<string, string> = {
  SEM_CONTATO: "bg-slate-600 text-slate-200",
  CONTATO_REALIZADO: "bg-sky-600 text-sky-100",
  VISUALIZOU_SEM_RESPOSTA: "bg-slate-500 text-slate-200",
  NAO_RESPONDE_MENSAGENS: "bg-slate-700 text-slate-300",
  PROMESSA_PAGAMENTO: "bg-amber-500 text-amber-100",
  PROMESSA_QUEBRADA: "bg-red-600 text-red-100",
  RECEBIDO_PARCIAL: "bg-lime-600 text-lime-100",
  REGULARIZADO: "bg-emerald-600 text-emerald-100",
  LIGAR_DEPOIS: "bg-indigo-600 text-indigo-100",
  AGUARDANDO_RETORNO: "bg-violet-600 text-violet-100",
  INADIMPLENCIA_EQUIVOCADA: "bg-orange-500 text-orange-100",
  NEGATIVADO: "bg-red-800 text-red-100",
  FALECIDO: "bg-zinc-700 text-zinc-200",
  ACORDO_JURIDICO: "bg-blue-700 text-blue-100",
  DISPUTA_JUDICIAL: "bg-rose-700 text-rose-100",
  OUTROS: "bg-slate-600 text-slate-200",
};

const STATUS_LABEL: Record<string, string> = {
  SEM_CONTATO: "Sem contato",
  CONTATO_REALIZADO: "Contato realizado",
  VISUALIZOU_SEM_RESPOSTA: "Visualizou sem resposta",
  NAO_RESPONDE_MENSAGENS: "Não responde mensagens",
  PROMESSA_PAGAMENTO: "Promessa de pagamento",
  PROMESSA_QUEBRADA: "Promessa quebrada",
  RECEBIDO_PARCIAL: "Recebido parcial",
  REGULARIZADO: "Regularizado",
  LIGAR_DEPOIS: "Ligar depois",
  AGUARDANDO_RETORNO: "Aguardando retorno",
  INADIMPLENCIA_EQUIVOCADA: "Inadimplência equivocada",
  NEGATIVADO: "Negativado",
  FALECIDO: "Falecido",
  ACORDO_JURIDICO: "Acordo jurídico",
  DISPUTA_JUDICIAL: "Disputa judicial",
  OUTROS: "Outros",
};

const TIPO_ICON: Record<string, React.ReactNode> = {
  WHATSAPP: <MessageCircle size={12} />,
  LIGACAO: <PhoneCall size={12} />,
  EMAIL: <Mail size={12} />,
};

interface UltimoContato { status: string; criadoEm: string }

interface Cliente {
  id: string;
  nome: string;
  cpf: string | null;
  telefones: string | null;
  emails: string | null;
  ultimoContato: UltimoContato | null;
  contratos: {
    id: string;
    numero: string;
    empresa: { nome: string };
    valorTotalAberto: number | null;
    maiorDiasAtraso: number | null;
  }[];
}

interface ContatoHistorico {
  id: string;
  tipo: string;
  status: string;
  observacao: string | null;
  agendadoPara: string | null;
  criadoEm: string;
  consultor: { nome: string };
  contrato: { numero: string };
}

interface Promessa {
  id: string;
  valorPrometido: number;
  dataPrometida: string;
  status: string;
  formaPagamento: string;
  observacao: string | null;
  consultor: { nome: string };
  contrato: { numero: string; empresa: { nome: string } };
}

const PROMESSA_STATUS_COR: Record<string, string> = {
  ABERTA: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  PAGA: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  QUEBRADA: "bg-red-500/10 text-red-400 border border-red-500/20",
  CANCELADA: "bg-slate-700 text-slate-400 border border-slate-600",
};
const PROMESSA_STATUS_LABEL: Record<string, string> = {
  ABERTA: "Aberta", PAGA: "Paga", QUEBRADA: "Quebrada", CANCELADA: "Cancelada",
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [busca, setBusca] = useState("");
  const [empresaFiltro, setEmpresaFiltro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal histórico + novo contato
  const [modalHistorico, setModalHistorico] = useState<{ clienteId: string; nome: string; contratos: Cliente["contratos"] } | null>(null);
  const [historico, setHistorico] = useState<ContatoHistorico[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [atendContratoId, setAtendContratoId] = useState("");
  const [atendForm, setAtendForm] = useState({ tipo: "LIGACAO", status: "ACIONADO", observacao: "", agendadoPara: "" });
  const [salvandoAtend, setSalvandoAtend] = useState(false);
  const [erroAtend, setErroAtend] = useState("");

  // Modal promessas + nova promessa
  const [modalPromessas, setModalPromessas] = useState<{ clienteId: string; nome: string; contratos: Cliente["contratos"] } | null>(null);
  const [promessas, setPromessas] = useState<Promessa[]>([]);
  const [carregandoPromessas, setCarregandoPromessas] = useState(false);
  const [promContratoId, setPromContratoId] = useState("");
  const [promForm, setPromForm] = useState({ valor: "", data: new Date().toISOString().slice(0, 10), formaPagamento: "PIX", observacao: "" });
  const [salvandoProm, setSalvandoProm] = useState(false);
  const [erroProm, setErroProm] = useState("");

  async function carregarPagina(q: string, pg: number, append = false) {
    if (pg === 1 && !append) setCarregando(true);
    else setCarregandoMais(true);

    const params = new URLSearchParams({ page: String(pg) });
    if (q) params.set("q", q);
    const data = await fetch(`/api/clientes?${params}`).then((r) => r.json()).catch(() => ({}));
    const lista: Cliente[] = Array.isArray(data.clientes) ? data.clientes : [];

    if (append) setClientes((prev) => [...prev, ...lista]);
    else { setClientes(lista); setTotal(data.total ?? 0); }
    setPagina(pg);
    setTemMais(data.temMais ?? false);
    setCarregando(false);
    setCarregandoMais(false);
  }

  async function abrirHistorico(cliente: Cliente) {
    const primContratoId = cliente.contratos[0]?.id ?? "";
    setModalHistorico({ clienteId: cliente.id, nome: cliente.nome, contratos: cliente.contratos });
    setAtendContratoId(primContratoId);
    setAtendForm({ tipo: "LIGACAO", status: "ACIONADO", observacao: "", agendadoPara: "" });
    setErroAtend("");
    setHistorico([]);
    setCarregandoHistorico(true);
    const data = await fetch(`/api/contatos?clienteId=${cliente.id}`).then((r) => r.json()).catch(() => []);
    setHistorico(Array.isArray(data) ? data : []);
    setCarregandoHistorico(false);
  }

  async function salvarAtendimento() {
    if (!modalHistorico || !atendContratoId) { setErroAtend("Selecione o contrato"); return; }
    setErroAtend("");
    if (atendForm.status === "OUTROS" && !atendForm.observacao.trim()) { setErroAtend("Observação obrigatória para Outros"); return; }
    if ((atendForm.status === "LIGAR_DEPOIS" || atendForm.status === "AGUARDANDO_RETORNO") && !atendForm.agendadoPara) {
      setErroAtend("Informe a data/hora para agendamento"); return;
    }
    setSalvandoAtend(true);
    const res = await fetch("/api/contatos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contratoId: atendContratoId, tipo: atendForm.tipo, status: atendForm.status, observacao: atendForm.observacao || null, agendadoPara: atendForm.agendadoPara || null }),
    });
    const body = await res.json();
    setSalvandoAtend(false);
    if (!res.ok) { setErroAtend(body.erro || "Erro ao registrar"); return; }
    setAtendForm({ tipo: "LIGACAO", status: "ACIONADO", observacao: "", agendadoPara: "" });
    const atualizado = await fetch(`/api/contatos?clienteId=${modalHistorico.clienteId}`).then((r) => r.json()).catch(() => []);
    setHistorico(Array.isArray(atualizado) ? atualizado : []);
    // Atualiza ultimoContato na lista
    setClientes((prev) => prev.map((c) => c.id === modalHistorico.clienteId ? { ...c, ultimoContato: { status: atendForm.status, criadoEm: new Date().toISOString() } } : c));
  }

  async function abrirPromessas(cliente: Cliente) {
    const primContratoId = cliente.contratos[0]?.id ?? "";
    setModalPromessas({ clienteId: cliente.id, nome: cliente.nome, contratos: cliente.contratos });
    setPromContratoId(primContratoId);
    setPromForm({ valor: "", data: new Date().toISOString().slice(0, 10), formaPagamento: "PIX", observacao: "" });
    setErroProm("");
    setPromessas([]);
    setCarregandoPromessas(true);
    const data = await fetch(`/api/promessas?clienteId=${cliente.id}&todas=true`).then((r) => r.json()).catch(() => []);
    setPromessas(Array.isArray(data) ? data : []);
    setCarregandoPromessas(false);
  }

  async function salvarPromessa() {
    if (!modalPromessas || !promContratoId) { setErroProm("Selecione o contrato"); return; }
    setErroProm("");
    const valor = parseFloat(promForm.valor.replace(",", "."));
    if (!valor || valor <= 0) { setErroProm("Informe um valor válido"); return; }
    if (!promForm.data) { setErroProm("Informe a data da promessa"); return; }
    setSalvandoProm(true);
    const res = await fetch("/api/promessas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contratoId: promContratoId, valorPrometido: valor, dataPrometida: promForm.data, formaPagamento: promForm.formaPagamento, observacao: promForm.observacao || null, parcelasIds: [] }),
    });
    const body = await res.json();
    setSalvandoProm(false);
    if (!res.ok) { setErroProm(body.erro || "Erro ao registrar"); return; }
    setPromForm({ valor: "", data: new Date().toISOString().slice(0, 10), formaPagamento: "PIX", observacao: "" });
    const atualizado = await fetch(`/api/promessas?clienteId=${modalPromessas.clienteId}&todas=true`).then((r) => r.json()).catch(() => []);
    setPromessas(Array.isArray(atualizado) ? atualizado : []);
  }

  // Carga inicial
  useEffect(() => { carregarPagina("", 1); }, []);

  // Busca com debounce
  useEffect(() => {
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    buscaTimer.current = setTimeout(() => {
      setPagina(1);
      setTemMais(false);
      carregarPagina(busca, 1);
    }, 400);
  }, [busca]);

  const empresas = Array.from(
    new Set(clientes.flatMap((c) => c.contratos.map((ct) => ct.empresa.nome)))
  ).sort();

  const filtrados = empresaFiltro
    ? clientes.filter((c) => c.contratos.some((ct) => ct.empresa.nome === empresaFiltro))
    : clientes;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Clientes</h1>
        <p className="text-slate-400 text-sm mt-1">{total.toLocaleString("pt-BR")} clientes na base</p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Buscar por nome, contrato ou telefone..."
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

      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Cliente</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Telefone</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Empresa</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Último status</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Em aberto</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c) => {
                    const totalAberto = c.contratos.reduce((s, ct) => s + Number(ct.valorTotalAberto ?? 0), 0);
                    const nomeEmpresas = Array.from(new Set(c.contratos.map((ct) => ct.empresa.nome))).join(", ");
                    const telefone = c.telefones ? c.telefones.split(",")[0] : null;
                    const uc = c.ultimoContato;
                    return (
                      <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/clientes/${c.id}`} className="block">
                            <p className="text-white font-medium hover:text-gr-300 transition-colors">{c.nome}</p>
                            <p className="text-slate-500 text-xs">{c.contratos.length === 1 ? c.contratos[0].numero : `${c.contratos.length} contratos`}</p>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {telefone ? (
                            <span className="flex items-center gap-1">
                              <Phone size={11} className="text-slate-400" />
                              {telefone}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{nomeEmpresas || "—"}</td>
                        <td className="px-4 py-3">
                          {uc ? (
                            <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COR[uc.status] ?? "bg-slate-700 text-slate-300"}`}>
                              {STATUS_LABEL[uc.status] ?? uc.status}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-white font-semibold tabular-nums">{formatarMoeda(totalAberto)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => abrirPromessas(c)}
                              title="Ver promessas"
                              className="p-1.5 text-slate-400 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors"
                            >
                              <DollarSign size={14} />
                            </button>
                            <button
                              onClick={() => abrirHistorico(c)}
                              title="Histórico de contatos"
                              className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg transition-colors"
                            >
                              <History size={14} />
                            </button>
                            <Link href={`/clientes/${c.id}`} className="flex items-center justify-center p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                              <ChevronRight size={16} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filtrados.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <AlertCircle size={32} className="mx-auto mb-3 opacity-50" />
                <p>{busca ? "Nenhum resultado encontrado" : "Nenhum cliente encontrado."}</p>
              </div>
            )}
          </div>

          {/* Carregar mais */}
          {temMais && !empresaFiltro && (
            <div className="flex justify-center pt-1">
              <button
                onClick={() => carregarPagina(busca, pagina + 1, true)}
                disabled={carregandoMais}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-sm font-medium px-6 py-2.5 rounded-xl transition-colors"
              >
                {carregandoMais
                  ? <><Loader2 size={14} className="animate-spin" /> Carregando...</>
                  : <>Carregar mais · {clientes.length}/{total}</>
                }
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal promessas */}
      {modalPromessas && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
              <div>
                <h2 className="text-white font-semibold flex items-center gap-2"><DollarSign size={16} className="text-purple-400" /> Promessas</h2>
                <p className="text-slate-500 text-xs mt-0.5 truncate max-w-xs">{modalPromessas.nome}</p>
              </div>
              <button onClick={() => setModalPromessas(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* Histórico de promessas */}
              {carregandoPromessas ? (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : promessas.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-3">Nenhuma promessa registrada.</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {promessas.map((p) => (
                    <div key={p.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PROMESSA_STATUS_COR[p.status] ?? "bg-slate-700 text-slate-300"}`}>
                            {PROMESSA_STATUS_LABEL[p.status] ?? p.status}
                          </span>
                          {p.contrato?.numero && (
                            <span className="text-[10px] text-slate-500 bg-slate-700/60 px-1.5 py-0.5 rounded">{p.contrato.numero}</span>
                          )}
                        </div>
                        <span className="text-white font-bold text-sm tabular-nums flex-shrink-0">{formatarMoeda(Number(p.valorPrometido))}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>Vence: <span className={new Date(p.dataPrometida) < new Date() && p.status === "ABERTA" ? "text-red-400" : "text-slate-300"}>{new Date(p.dataPrometida).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</span></span>
                        <span>· {p.formaPagamento.replace("_", " ")}</span>
                        <span>· {p.consultor.nome.split(" ")[0]}</span>
                      </div>
                      {p.observacao && <p className="text-slate-400 text-xs mt-1">{p.observacao}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Nova promessa */}
              <div className="border-t border-slate-800 pt-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Nova promessa</p>
                <div className="space-y-3">
                  {modalPromessas.contratos.length > 1 && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Contrato *</label>
                      <select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
                        value={promContratoId} onChange={(e) => setPromContratoId(e.target.value)}>
                        {modalPromessas.contratos.map((ct) => (
                          <option key={ct.id} value={ct.id}>{ct.numero} · {ct.empresa.nome}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Valor (R$) *</label>
                      <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500 placeholder:text-slate-500"
                        placeholder="0,00" value={promForm.valor} onChange={(e) => setPromForm((f) => ({ ...f, valor: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Data combinada *</label>
                      <input type="date" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
                        value={promForm.data} onChange={(e) => setPromForm((f) => ({ ...f, data: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1.5">Forma de pagamento</label>
                      <select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
                        value={promForm.formaPagamento} onChange={(e) => setPromForm((f) => ({ ...f, formaPagamento: e.target.value }))}>
                        <option value="PIX">PIX</option>
                        <option value="BOLETO">Boleto</option>
                        <option value="TED">Transferência (TED)</option>
                        <option value="DINHEIRO">Dinheiro</option>
                        <option value="CARTAO_DEBITO">Cartão Débito</option>
                        <option value="CARTAO_CREDITO">Cartão Crédito</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1.5">Observação</label>
                      <input className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500 placeholder:text-slate-500"
                        placeholder="Opcional" value={promForm.observacao} onChange={(e) => setPromForm((f) => ({ ...f, observacao: e.target.value }))} />
                    </div>
                  </div>
                  {erroProm && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erroProm}</p>}
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-slate-800 flex-shrink-0">
              <button onClick={() => setModalPromessas(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors">
                Fechar
              </button>
              <button onClick={salvarPromessa} disabled={salvandoProm}
                className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/30 text-white text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                {salvandoProm ? <><Loader2 size={14} className="animate-spin" /> Registrando...</> : <><CheckCircle2 size={14} /> Registrar promessa</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal histórico de contatos + novo registro */}
      {modalHistorico && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 flex-shrink-0">
              <div>
                <h2 className="text-white font-semibold flex items-center gap-2"><History size={16} className="text-sky-400" /> Histórico de Contatos</h2>
                <p className="text-slate-500 text-xs mt-0.5 truncate max-w-xs">{modalHistorico.nome}</p>
              </div>
              <button onClick={() => setModalHistorico(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* Histórico */}
              {carregandoHistorico ? (
                <div className="flex justify-center py-4"><div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : historico.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-3">Nenhum contato registrado.</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {historico.map((h) => (
                    <div key={h.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1 text-slate-400 text-xs">
                            {TIPO_ICON[h.tipo]}
                            {h.tipo === "WHATSAPP" ? "WhatsApp" : h.tipo === "LIGACAO" ? "Ligação" : "Email"}
                          </span>
                          <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COR[h.status] ?? "bg-slate-700 text-slate-300"}`}>
                            {STATUS_LABEL[h.status] ?? h.status}
                          </span>
                          {h.contrato?.numero && (
                            <span className="text-[10px] text-slate-500 bg-slate-700/60 px-1.5 py-0.5 rounded">{h.contrato.numero}</span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 flex-shrink-0">
                          {new Date(h.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {h.observacao && <p className="text-slate-300 text-xs mt-1.5">{h.observacao}</p>}
                      {h.agendadoPara && <p className="text-indigo-400 text-xs mt-1">Agendado: {new Date(h.agendadoPara).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>}
                      <p className="text-slate-400 text-[10px] mt-1">por {h.consultor.nome}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Novo contato */}
              <div className="border-t border-slate-800 pt-4">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Novo registro</p>
                <div className="space-y-3">
                  {modalHistorico.contratos.length > 1 && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Contrato *</label>
                      <select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
                        value={atendContratoId} onChange={(e) => setAtendContratoId(e.target.value)}>
                        {modalHistorico.contratos.map((ct) => (
                          <option key={ct.id} value={ct.id}>{ct.numero} · {ct.empresa.nome}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Canal *</label>
                      <select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
                        value={atendForm.tipo} onChange={(e) => setAtendForm((f) => ({ ...f, tipo: e.target.value }))}>
                        <option value="LIGACAO">Ligação</option>
                        <option value="WHATSAPP">WhatsApp</option>
                        <option value="EMAIL">E-mail</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Status *</label>
                      <select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
                        value={atendForm.status} onChange={(e) => setAtendForm((f) => ({ ...f, status: e.target.value }))}>
                        <option value="ACIONADO">Acionado</option>
                        <option value="VISUALIZOU_SEM_RESPOSTA">Visualizou, não respondeu</option>
                        <option value="NAO_ATENDE">Não atende</option>
                        <option value="NAO_RESPONDE_MENSAGENS">Não responde mensagens</option>
                        <option value="EM_NEGOCIACAO">Em negociação</option>
                        <option value="AGUARDANDO_RETORNO">Aguardando retorno</option>
                        <option value="LIGAR_DEPOIS">Ligar depois</option>
                        <option value="PROMESSA_PAGAMENTO">Promessa de pagamento</option>
                        <option value="RECEBIDO_PARCIAL">Recebido parcial</option>
                        <option value="REGULARIZADO">Regularizado</option>
                        <option value="INADIMPLENCIA_EQUIVOCADA">Inadimplência equivocada</option>
                        <option value="OUTROS">Outros</option>
                      </select>
                    </div>
                  </div>
                  {(atendForm.status === "LIGAR_DEPOIS" || atendForm.status === "AGUARDANDO_RETORNO") && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Data/hora *</label>
                      <input type="datetime-local" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
                        value={atendForm.agendadoPara} onChange={(e) => setAtendForm((f) => ({ ...f, agendadoPara: e.target.value }))} />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Observação</label>
                    <textarea rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500 resize-none placeholder:text-slate-500"
                      placeholder="Descreva o atendimento..." value={atendForm.observacao}
                      onChange={(e) => setAtendForm((f) => ({ ...f, observacao: e.target.value }))} />
                  </div>
                  {erroAtend && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erroAtend}</p>}
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-slate-800 flex-shrink-0">
              <button onClick={() => setModalHistorico(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors">
                Fechar
              </button>
              <button onClick={salvarAtendimento} disabled={salvandoAtend}
                className="flex-1 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-600/30 text-white text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                {salvandoAtend ? <><Loader2 size={14} className="animate-spin" /> Registrando...</> : <><Phone size={14} /> Registrar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
