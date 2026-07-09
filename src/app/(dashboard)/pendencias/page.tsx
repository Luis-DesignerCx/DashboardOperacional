"use client";

import { useEffect, useRef, useState } from "react";
import { formatarMoeda, formatarData } from "@/lib/utils";
import { Bell, AlertTriangle, Clock, CheckCircle2, Plus, Search, X, Loader2, Phone } from "lucide-react";

const inputCls = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500 placeholder:text-slate-500";

export default function PendenciasPage() {
  const [promessasHoje, setPromessasHoje] = useState<any[]>([]);
  const [promessasVencidas, setPromessasVencidas] = useState<any[]>([]);
  const [agendadosHoje, setAgendadosHoje] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Modal nova promessa
  const [modalAberto, setModalAberto] = useState(false);
  const [competenciaAtiva, setCompetenciaAtiva] = useState("");
  const [buscaContrato, setBuscaContrato] = useState("");
  const [resultadosBusca, setResultadosBusca] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [contratoSelecionado, setContratoSelecionado] = useState<any>(null);
  const [promessaForm, setPromessaForm] = useState({
    valor: "",
    data: new Date().toISOString().slice(0, 10),
    formaPagamento: "PIX",
    observacao: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal editar promessa
  const [modalEditar, setModalEditar] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ valor: "", data: "", formaPagamento: "PIX", observacao: "" });
  const [salvandoEdit, setSalvandoEdit] = useState(false);
  const [erroEdit, setErroEdit] = useState("");

  function recarregar() {
    setCarregando(true);
    Promise.all([
      fetch("/api/promessas?vencendoHoje=true").then((r) => r.json()),
      fetch("/api/promessas?status=ABERTA").then((r) => r.json()),
      fetch("/api/contatos?agendadosHoje=true").then((r) => r.json()),
    ]).then(([hoje, abertas, agendados]) => {
      setPromessasHoje(Array.isArray(hoje) ? hoje : []);
      const vencidas = (Array.isArray(abertas) ? abertas : []).filter(
        (p: any) => new Date(p.dataPrometida) < new Date() && !((Array.isArray(hoje) ? hoje : []).find((h: any) => h.id === p.id))
      );
      setPromessasVencidas(vencidas);
      setAgendadosHoje(Array.isArray(agendados) ? agendados : []);
      setCarregando(false);
    });
  }

  useEffect(() => {
    recarregar();
    fetch("/api/competencias").then((r) => r.json()).then((cs) => {
      if (cs[0]) setCompetenciaAtiva(cs[0].id);
    });
  }, []);

  useEffect(() => {
    if (!buscaContrato || buscaContrato.length < 2) { setResultadosBusca([]); return; }
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    buscaTimer.current = setTimeout(async () => {
      if (!competenciaAtiva) return;
      setBuscando(true);
      const data = await fetch(`/api/carteira?competenciaId=${competenciaAtiva}&busca=${encodeURIComponent(buscaContrato)}`)
        .then((r) => r.json()).catch(() => ({}));
      setResultadosBusca(Array.isArray(data.contratos) ? data.contratos : []);
      setBuscando(false);
    }, 350);
  }, [buscaContrato, competenciaAtiva]);

  function abrirModal() {
    setModalAberto(true);
    setBuscaContrato("");
    setResultadosBusca([]);
    setContratoSelecionado(null);
    setPromessaForm({ valor: "", data: new Date().toISOString().slice(0, 10), formaPagamento: "PIX", observacao: "" });
    setErro("");
  }

  async function salvarPromessa() {
    setErro("");
    if (!contratoSelecionado) { setErro("Selecione um contrato"); return; }
    const valor = parseFloat(promessaForm.valor.replace(",", "."));
    if (!valor || valor <= 0) { setErro("Informe um valor válido"); return; }
    if (!promessaForm.data) { setErro("Informe a data da promessa"); return; }
    setSalvando(true);
    const res = await fetch("/api/promessas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contratoId: contratoSelecionado.id,
        valorPrometido: valor,
        dataPrometida: promessaForm.data,
        formaPagamento: promessaForm.formaPagamento,
        observacao: promessaForm.observacao || null,
      }),
    });
    const data = await res.json();
    setSalvando(false);
    if (!res.ok) { setErro(data.erro || "Erro ao salvar"); return; }
    setModalAberto(false);
    recarregar();
  }

  function abrirEditar(p: any) {
    setModalEditar(p);
    setEditForm({
      valor: Number(p.valorPrometido).toFixed(2).replace(".", ","),
      data: p.dataPrometida.slice(0, 10),
      formaPagamento: p.formaPagamento,
      observacao: p.observacao || "",
    });
    setErroEdit("");
  }

  async function salvarEdicao() {
    setErroEdit("");
    const valor = parseFloat(editForm.valor.replace(",", "."));
    if (!valor || valor <= 0) { setErroEdit("Informe um valor válido"); return; }
    setSalvandoEdit(true);
    const res = await fetch("/api/promessas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: modalEditar.id,
        valorPrometido: valor,
        dataPrometida: editForm.data,
        formaPagamento: editForm.formaPagamento,
        observacao: editForm.observacao || null,
      }),
    });
    const data = await res.json();
    setSalvandoEdit(false);
    if (!res.ok) { setErroEdit(data.erro || "Erro ao salvar"); return; }
    setModalEditar(null);
    recarregar();
  }

  if (carregando) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Bell size={24} className="text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Minhas Tarefas Diárias</h1>
            <p className="text-slate-400 text-sm">Ações prioritárias para hoje</p>
          </div>
        </div>
        <button
          onClick={abrirModal}
          className="flex items-center gap-2 bg-gr-500 hover:bg-gr-400 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={15} /> Nova Promessa
        </button>
      </div>

      {/* Central de Pendências */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Central de Pendências</h2>
        <div className="space-y-3">
          <div className={`flex items-center justify-between p-3 rounded-xl border ${promessasHoje.length > 0 ? "bg-amber-500/10 border-amber-500/20" : "bg-slate-800 border-slate-700"}`}>
            <div className="flex items-center gap-3">
              <Clock size={16} className={promessasHoje.length > 0 ? "text-amber-400" : "text-slate-500"} />
              <div>
                <p className="text-white text-sm font-medium">Promessas vencendo hoje</p>
                <p className="text-slate-400 text-xs">{formatarMoeda(promessasHoje.reduce((s, p) => s + Number(p.valorPrometido), 0))} agendado</p>
              </div>
            </div>
            <span className={`text-lg font-bold ${promessasHoje.length > 0 ? "text-amber-400" : "text-slate-400"}`}>{promessasHoje.length}</span>
          </div>

          <div className={`flex items-center justify-between p-3 rounded-xl border ${promessasVencidas.length > 0 ? "bg-red-500/10 border-red-500/20" : "bg-slate-800 border-slate-700"}`}>
            <div className="flex items-center gap-3">
              <AlertTriangle size={16} className={promessasVencidas.length > 0 ? "text-red-400" : "text-slate-500"} />
              <div>
                <p className="text-white text-sm font-medium">Promessas vencidas</p>
                <p className="text-slate-400 text-xs">{formatarMoeda(promessasVencidas.reduce((s, p) => s + Number(p.valorPrometido), 0))} não recebido</p>
              </div>
            </div>
            <span className={`text-lg font-bold ${promessasVencidas.length > 0 ? "text-red-400" : "text-slate-400"}`}>{promessasVencidas.length}</span>
          </div>

          <div className={`flex items-center justify-between p-3 rounded-xl border ${agendadosHoje.length > 0 ? "bg-sky-500/10 border-sky-500/20" : "bg-slate-800 border-slate-700"}`}>
            <div className="flex items-center gap-3">
              <Phone size={16} className={agendadosHoje.length > 0 ? "text-sky-400" : "text-slate-500"} />
              <div>
                <p className="text-white text-sm font-medium">Retornos agendados para hoje</p>
                <p className="text-slate-400 text-xs">Ligar depois / Aguardar retorno</p>
              </div>
            </div>
            <span className={`text-lg font-bold ${agendadosHoje.length > 0 ? "text-sky-400" : "text-slate-400"}`}>{agendadosHoje.length}</span>
          </div>
        </div>
      </div>

      <Section
        titulo="Promessas Vencendo Hoje"
        count={promessasHoje.length}
        icon={Clock}
        cor="text-amber-400"
        vazio="Nenhuma promessa para hoje"
      >
        {promessasHoje.map((p) => <CardPromessa key={p.id} promessa={p} onEditar={() => abrirEditar(p)} />)}
      </Section>

      <Section
        titulo="Promessas Vencidas"
        count={promessasVencidas.length}
        icon={AlertTriangle}
        cor="text-red-400"
        vazio="Nenhuma promessa vencida"
      >
        {promessasVencidas.map((p) => <CardPromessa key={p.id} promessa={p} vencida onEditar={() => abrirEditar(p)} />)}
      </Section>

      {agendadosHoje.length > 0 && (
        <Section
          titulo="Retornos Agendados Hoje"
          count={agendadosHoje.length}
          icon={Phone}
          cor="text-sky-400"
          vazio=""
        >
          {agendadosHoje.map((c: any) => (
            <div key={c.id} className="bg-slate-900 border border-sky-500/20 rounded-xl p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-white font-medium text-sm">{c.contrato?.cliente?.nome || "—"}</p>
                <p className="text-slate-500 text-xs">{c.contrato?.numero} · {c.consultor?.nome}</p>
                {c.observacao && <p className="text-slate-400 text-xs mt-0.5 italic">{c.observacao}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sky-400 text-xs font-medium">{c.status === "LIGAR_DEPOIS" ? "Ligar depois" : "Aguardando retorno"}</p>
                {c.agendadoPara && <p className="text-slate-500 text-xs">{new Date(c.agendadoPara).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Modal nova promessa */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h2 className="text-white font-semibold">Nova Promessa de Pagamento</h2>
                <p className="text-slate-500 text-xs mt-0.5">Registre o compromisso do cliente</p>
              </div>
              <button onClick={() => setModalAberto(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {!contratoSelecionado ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">Selecione o contrato do cliente</p>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input autoFocus value={buscaContrato} onChange={(e) => setBuscaContrato(e.target.value)}
                      placeholder="Nome do cliente ou nº do contrato..." className={inputCls + " pl-9"} />
                  </div>
                  {buscando && <div className="flex justify-center py-3"><Loader2 size={18} className="animate-spin text-slate-500" /></div>}
                  {!buscando && resultadosBusca.length === 0 && buscaContrato.length >= 2 && (
                    <p className="text-slate-500 text-sm text-center py-3">Nenhum contrato encontrado</p>
                  )}
                  {resultadosBusca.length > 0 && (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {resultadosBusca.map((item) => (
                        <button key={item.id} onClick={() => setContratoSelecionado(item.contrato)}
                          className="w-full flex items-center justify-between bg-slate-800 hover:bg-slate-700 rounded-xl px-4 py-3 text-left transition-colors">
                          <div>
                            <p className="text-white text-sm font-medium">{item.contrato.cliente.nome}</p>
                            <p className="text-slate-500 text-xs font-mono">{item.contrato.numero} · {item.contrato.empresa.nome}</p>
                          </div>
                          <p className="text-white text-xs font-semibold tabular-nums">{formatarMoeda(Number(item.contrato.valorTotalAberto ?? 0))}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-gr-500/10 border border-gr-500/20 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-white text-sm font-medium">{contratoSelecionado.cliente.nome}</p>
                      <p className="text-slate-400 text-xs">{contratoSelecionado.numero} · {contratoSelecionado.empresa.nome}</p>
                    </div>
                    <button onClick={() => setContratoSelecionado(null)} className="text-slate-400 hover:text-white p-1 rounded transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Valor prometido (R$) *</label>
                      <input className={inputCls} placeholder="0,00" value={promessaForm.valor}
                        onChange={(e) => setPromessaForm((f) => ({ ...f, valor: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Data da promessa *</label>
                      <input type="date" className={inputCls} value={promessaForm.data}
                        onChange={(e) => setPromessaForm((f) => ({ ...f, data: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1.5">Forma de pagamento *</label>
                      <select className={inputCls} value={promessaForm.formaPagamento}
                        onChange={(e) => setPromessaForm((f) => ({ ...f, formaPagamento: e.target.value }))}>
                        <option value="PIX">PIX</option>
                        <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                        <option value="BOLETO">Boleto</option>
                        <option value="TED">Transferência (TED)</option>
                        <option value="DINHEIRO">Dinheiro</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1.5">Observação</label>
                      <textarea rows={2} className={inputCls + " resize-none"} placeholder="Opcional" value={promessaForm.observacao}
                        onChange={(e) => setPromessaForm((f) => ({ ...f, observacao: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}
              {erro && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>}
            </div>

            {contratoSelecionado && (
              <div className="flex gap-3 px-5 pb-5">
                <button onClick={() => setModalAberto(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button onClick={salvarPromessa} disabled={salvando}
                  className="flex-1 bg-gr-500 hover:bg-gr-400 disabled:bg-gr-500/30 text-white text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {salvando ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : <><CheckCircle2 size={14} /> Registrar promessa</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal editar promessa */}
      {modalEditar && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h2 className="text-white font-semibold">Editar Promessa</h2>
                <p className="text-slate-500 text-xs mt-0.5">{modalEditar.contrato?.cliente?.nome}</p>
              </div>
              <button onClick={() => setModalEditar(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Valor (R$) *</label>
                  <input className={inputCls} value={editForm.valor} onChange={(e) => setEditForm((f) => ({ ...f, valor: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Data *</label>
                  <input type="date" className={inputCls} value={editForm.data} onChange={(e) => setEditForm((f) => ({ ...f, data: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5">Forma de pagamento</label>
                  <select className={inputCls} value={editForm.formaPagamento} onChange={(e) => setEditForm((f) => ({ ...f, formaPagamento: e.target.value }))}>
                    <option value="PIX">PIX</option>
                    <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                    <option value="BOLETO">Boleto</option>
                    <option value="TED">Transferência (TED)</option>
                    <option value="DINHEIRO">Dinheiro</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1.5">Observação</label>
                  <textarea rows={2} className={inputCls + " resize-none"} value={editForm.observacao}
                    onChange={(e) => setEditForm((f) => ({ ...f, observacao: e.target.value }))} />
                </div>
              </div>
              {erroEdit && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erroEdit}</p>}
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setModalEditar(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={salvarEdicao} disabled={salvandoEdit}
                className="flex-1 bg-gr-500 hover:bg-gr-400 disabled:bg-gr-500/30 text-white text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                {salvandoEdit ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : <><CheckCircle2 size={14} /> Salvar alteração</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ titulo, count, icon: Icon, cor, vazio, children }: any) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={18} className={cor} />
        <h2 className="text-white font-semibold">{titulo}</h2>
        {count > 0 && (
          <span className="ml-auto text-xs bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full">{count}</span>
        )}
      </div>
      {count === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
          <CheckCircle2 size={28} className="mx-auto mb-2 text-slate-700" />
          <p className="text-slate-500 text-sm">{vazio}</p>
        </div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

function CardPromessa({ promessa: p, vencida, onEditar }: { promessa: any; vencida?: boolean; onEditar: () => void }) {
  const cliente = p.contrato?.cliente;
  return (
    <div className={`bg-slate-900 border rounded-xl p-4 flex items-center justify-between gap-4 ${vencida ? "border-red-500/20" : "border-amber-500/20"}`}>
      <div>
        <p className="text-white font-medium text-sm">{cliente?.nome || "—"}</p>
        <p className="text-slate-500 text-xs">{p.contrato?.numero} · {p.contrato?.empresa?.nome}</p>
        {p.observacao && <p className="text-slate-400 text-xs mt-0.5 italic">{p.observacao}</p>}
      </div>
      <div className="text-right flex items-center gap-3">
        <div>
          <p className="text-white font-semibold tabular-nums text-sm">{formatarMoeda(p.valorPrometido)}</p>
          <p className={`text-xs tabular-nums ${vencida ? "text-red-400" : "text-amber-400"}`}>{formatarData(p.dataPrometida)}</p>
          <p className="text-slate-400 text-xs">{p.formaPagamento}</p>
        </div>
        <button onClick={onEditar}
          className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors text-xs"
          title="Editar promessa">
          ✏️
        </button>
      </div>
    </div>
  );
}
