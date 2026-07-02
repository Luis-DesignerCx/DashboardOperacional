"use client";

import { useEffect, useRef, useState } from "react";
import { formatarMoeda, formatarData } from "@/lib/utils";
import { Bell, AlertTriangle, Clock, CheckCircle2, Plus, Search, X, Loader2 } from "lucide-react";

const inputCls = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500 placeholder:text-slate-500";

export default function PendenciasPage() {
  const [promessasHoje, setPromessasHoje] = useState<any[]>([]);
  const [promessasVencidas, setPromessasVencidas] = useState<any[]>([]);
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

  function recarregar() {
    setCarregando(true);
    Promise.all([
      fetch("/api/promessas?vencendoHoje=true").then((r) => r.json()),
      fetch("/api/promessas?status=ABERTA").then((r) => r.json()),
    ]).then(([hoje, abertas]) => {
      setPromessasHoje(Array.isArray(hoje) ? hoje : []);
      const vencidas = (Array.isArray(abertas) ? abertas : []).filter(
        (p: any) => new Date(p.dataPrometida) < new Date() && !hoje.find((h: any) => h.id === p.id)
      );
      setPromessasVencidas(vencidas);
      setCarregando(false);
    });
  }

  useEffect(() => {
    recarregar();
    fetch("/api/competencias").then((r) => r.json()).then((cs) => {
      if (cs[0]) setCompetenciaAtiva(cs[0].id);
    });
  }, []);

  // Busca de contrato com debounce
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
            <h1 className="text-2xl font-bold text-white">Central de Pendências</h1>
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

      <Section
        titulo="Promessas Vencendo Hoje"
        count={promessasHoje.length}
        icon={Clock}
        cor="text-amber-400"
        vazio="Nenhuma promessa para hoje"
      >
        {promessasHoje.map((p) => <CardPromessa key={p.id} promessa={p} />)}
      </Section>

      <Section
        titulo="Promessas Vencidas"
        count={promessasVencidas.length}
        icon={AlertTriangle}
        cor="text-red-400"
        vazio="Nenhuma promessa vencida"
      >
        {promessasVencidas.map((p) => <CardPromessa key={p.id} promessa={p} vencida />)}
      </Section>

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
              {/* Step 1: selecionar contrato */}
              {!contratoSelecionado ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">Selecione o contrato do cliente</p>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      autoFocus
                      value={buscaContrato}
                      onChange={(e) => setBuscaContrato(e.target.value)}
                      placeholder="Nome do cliente ou nº do contrato..."
                      className={inputCls + " pl-9"}
                    />
                  </div>

                  {buscando && (
                    <div className="flex justify-center py-3">
                      <Loader2 size={18} className="animate-spin text-slate-500" />
                    </div>
                  )}

                  {!buscando && resultadosBusca.length === 0 && buscaContrato.length >= 2 && (
                    <p className="text-slate-500 text-sm text-center py-3">Nenhum contrato encontrado</p>
                  )}

                  {resultadosBusca.length > 0 && (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {resultadosBusca.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setContratoSelecionado(item.contrato)}
                          className="w-full flex items-center justify-between bg-slate-800 hover:bg-slate-700 rounded-xl px-4 py-3 text-left transition-colors"
                        >
                          <div>
                            <p className="text-white text-sm font-medium">{item.contrato.cliente.nome}</p>
                            <p className="text-slate-500 text-xs font-mono">{item.contrato.numero} · {item.contrato.empresa.nome}</p>
                          </div>
                          <p className="text-white text-xs font-semibold tabular-nums">
                            {formatarMoeda(Number(item.contrato.valorTotalAberto ?? 0))}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Contrato selecionado */}
                  <div className="flex items-center justify-between bg-gr-500/10 border border-gr-500/20 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-white text-sm font-medium">{contratoSelecionado.cliente.nome}</p>
                      <p className="text-slate-400 text-xs">{contratoSelecionado.numero} · {contratoSelecionado.empresa.nome}</p>
                    </div>
                    <button
                      onClick={() => setContratoSelecionado(null)}
                      className="text-slate-400 hover:text-white p-1 rounded transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Formulário */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Valor prometido (R$) *</label>
                      <input
                        className={inputCls}
                        placeholder="0,00"
                        value={promessaForm.valor}
                        onChange={(e) => setPromessaForm((f) => ({ ...f, valor: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Data da promessa *</label>
                      <input
                        type="date"
                        className={inputCls}
                        value={promessaForm.data}
                        onChange={(e) => setPromessaForm((f) => ({ ...f, data: e.target.value }))}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1.5">Forma de pagamento *</label>
                      <select
                        className={inputCls}
                        value={promessaForm.formaPagamento}
                        onChange={(e) => setPromessaForm((f) => ({ ...f, formaPagamento: e.target.value }))}
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
                        value={promessaForm.observacao}
                        onChange={(e) => setPromessaForm((f) => ({ ...f, observacao: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {erro && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>
              )}
            </div>

            {contratoSelecionado && (
              <div className="flex gap-3 px-5 pb-5">
                <button
                  onClick={() => setModalAberto(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarPromessa}
                  disabled={salvando}
                  className="flex-1 bg-gr-500 hover:bg-gr-400 disabled:bg-gr-500/30 text-white text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {salvando ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : <><CheckCircle2 size={14} /> Registrar promessa</>}
                </button>
              </div>
            )}
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

function CardPromessa({ promessa: p, vencida }: { promessa: any; vencida?: boolean }) {
  const cliente = p.contrato?.cliente;
  return (
    <div className={`bg-slate-900 border rounded-xl p-4 flex items-center justify-between gap-4 ${vencida ? "border-red-500/20" : "border-amber-500/20"}`}>
      <div>
        <p className="text-white font-medium text-sm">{cliente?.nome || "—"}</p>
        <p className="text-slate-500 text-xs">{p.contrato?.numero} · {p.contrato?.empresa?.nome}</p>
        {p.observacao && <p className="text-slate-600 text-xs mt-0.5 italic">{p.observacao}</p>}
      </div>
      <div className="text-right">
        <p className="text-white font-semibold tabular-nums text-sm">{formatarMoeda(p.valorPrometido)}</p>
        <p className={`text-xs tabular-nums ${vencida ? "text-red-400" : "text-amber-400"}`}>{formatarData(p.dataPrometida)}</p>
        <p className="text-slate-600 text-xs">{p.formaPagamento}</p>
      </div>
    </div>
  );
}
