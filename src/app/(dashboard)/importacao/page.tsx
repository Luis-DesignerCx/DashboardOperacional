"use client";

import { useState, useEffect } from "react";
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Plus, CalendarDays, Trash2, UmbrellaOff, Snowflake, RefreshCw, Lock, AlertTriangle, ArrowDownToLine, CheckCheck } from "lucide-react";
import { formatarMoeda } from "@/lib/utils";
import { Select } from "@/components/ui/Select";

interface Competencia {
  id: string;
  descricao: string;
  mes: number;
  ano: number;
  fechada: boolean;
}

interface Consultor {
  id: string;
  nome: string;
}

interface FeriasEntry {
  id: string;
  consultorId: string;
  dataInicio: string;
  dataFim: string;
  congelado: boolean;
  congeladoEm?: string | null;
  snapshotSaldo?: number | null;
  snapshotRecebido?: number | null;
  snapshotMetaAlvo?: number | null;
  consultor: { id: string; nome: string };
}

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export default function ImportacaoPage() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [competenciaId, setCompetenciaId] = useState("");
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [tipoImport, setTipoImport] = useState<"BASE" | "FLASH" | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<{ processadas: number; erros: number; tipoDetectado?: string } | null>(null);
  const [erro, setErro] = useState("");

  // Nova competência
  const [showNovaComp, setShowNovaComp] = useState(false);
  const [novoMes, setNovoMes] = useState(new Date().getMonth() + 1);
  const [novoAno, setNovoAno] = useState(new Date().getFullYear());
  const [criandoComp, setCriandoComp] = useState(false);
  const [erroComp, setErroComp] = useState("");

  // Fã Pass
  const [fpArquivo, setFpArquivo] = useState<File | null>(null);
  const [fpCarregando, setFpCarregando] = useState(false);
  const [fpProgresso, setFpProgresso] = useState("");
  const [fpResultado, setFpResultado] = useState<any | null>(null);
  const [fpErro, setFpErro] = useState("");
  const [fpStatus, setFpStatus] = useState<any | null>(null);
  const [fpFechando, setFpFechando] = useState(false);

  // Baixas confirmadas (empreendimentos gerais)
  const [bxArquivo, setBxArquivo] = useState<File | null>(null);
  const [bxCarregando, setBxCarregando] = useState(false);
  const [bxResultado, setBxResultado] = useState<any | null>(null);
  const [bxErro, setBxErro] = useState("");
  const [bxAberto, setBxAberto] = useState<"divergencias" | "naoLancados" | "naoConfirmados" | null>(null);

  // Resolução de divergência
  const [resolverModal, setResolverModal] = useState<{ ids: string[]; contrato: string; cliente: string } | null>(null);
  const [resolverMotivo, setResolverMotivo] = useState("Juros e encargos");
  const [resolverCarregando, setResolverCarregando] = useState(false);

  // Férias
  const [ferias, setFerias] = useState<FeriasEntry[]>([]);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [novaFeriasConsultorId, setNovaFeriasConsultorId] = useState("");
  const [novaFeriasInicio, setNovaFeriasInicio] = useState("");
  const [novaFeriasFim, setNovaFeriasFim] = useState("");
  const [salvandoFerias, setSalvandoFerias] = useState(false);

  async function carregarFpStatus(cId: string) {
    const d = await fetch(`/api/fapass/status?competenciaId=${cId}`).then((r) => r.json()).catch(() => null);
    if (d && !d.erro) setFpStatus(d);
    else setFpStatus(null);
  }

  // Limite seguro abaixo do teto de corpo de requisição da Vercel (~4.5MB) —
  // arquivos menores vão pelo caminho direto (rápido); arquivos maiores
  // (ex: a query bruta do Passaporte BC, ~56MB) vão pelo Supabase Storage +
  // GitHub Actions, que processa fora da Vercel e não tem esse limite.
  const FP_LIMITE_UPLOAD_DIRETO = 4 * 1024 * 1024;

  async function handleFpSync() {
    if (!fpArquivo || !competenciaId) return;
    setFpCarregando(true);
    setFpErro("");
    setFpResultado(null);

    try {
      if (fpArquivo.size <= FP_LIMITE_UPLOAD_DIRETO) {
        setFpProgresso("Processando...");
        const form = new FormData();
        form.append("arquivo", fpArquivo);
        form.append("competenciaId", competenciaId);

        const res = await fetch("/api/fapass/importar", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.erro || "Erro ao importar");

        await carregarFpStatus(competenciaId);
        setFpResultado(data);
        return;
      }

      // ── Arquivo grande: Storage + GitHub Actions (assíncrono) ─────────────
      setFpProgresso("Preparando upload...");
      const urlRes = await fetch("/api/fapass/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competenciaId }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.erro || "Erro ao preparar upload");

      setFpProgresso("Enviando arquivo (pode demorar em conexões lentas)...");
      const putRes = await fetch(urlData.uploadUrl, {
        method: "PUT",
        body: fpArquivo,
        headers: { "Content-Type": "application/octet-stream" },
      });
      if (!putRes.ok) throw new Error("Falha ao enviar arquivo para o Storage");

      setFpProgresso("Disparando processamento...");
      const trigRes = await fetch("/api/fapass/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncId: urlData.syncId, filePath: urlData.filePath, competenciaId }),
      });
      const trigData = await trigRes.json();
      if (!trigRes.ok) throw new Error(trigData.erro || "Erro ao disparar processamento");

      setFpProgresso("Processando em segundo plano (pode levar alguns minutos)...");
      for (let tentativa = 0; tentativa < 90; tentativa++) {
        await new Promise((r) => setTimeout(r, 5000));
        const statusRes = await fetch(`/api/fapass/status?competenciaId=${competenciaId}`);
        const statusData = await statusRes.json();
        const sync = statusData.ultimaSync;
        if (sync?.id !== urlData.syncId) continue;

        if (sync.status === "CONCLUIDO") {
          setFpResultado({
            primeiraSync: sync.primeiraSync,
            novosInadimplentes: Math.max(0, sync.totalContratos - sync.totalFlash),
            novosFlash: sync.totalFlash,
            totalDivergencias: sync.totalDivergencias,
          });
          await carregarFpStatus(competenciaId);
          return;
        }
        if (sync.status === "ERRO") {
          throw new Error(sync.erro || "Erro ao processar no GitHub Actions");
        }
      }
      throw new Error("Tempo limite excedido aguardando o processamento. Confira o status manualmente em alguns minutos.");
    } catch (e: any) {
      setFpErro(e?.message || "Erro ao processar o arquivo.");
    } finally {
      setFpCarregando(false);
      setFpProgresso("");
    }
  }

  async function handleFpFecharCiclo() {
    if (!competenciaId || !confirm("Confirma o fechamento do ciclo Fã Pass para esta competência?")) return;
    setFpFechando(true);
    const res = await fetch("/api/fapass/fechar-ciclo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competenciaId }),
    });
    const data = await res.json();
    setFpFechando(false);
    if (res.ok) { await recarregarCompetencias(); carregarFpStatus(competenciaId); }
    else alert(data.erro || "Erro ao fechar ciclo");
  }

  async function recarregarCompetencias() {
    const data = await fetch("/api/competencias").then((r) => r.json());
    setCompetencias(data);
    return data as Competencia[];
  }

  useEffect(() => { recarregarCompetencias(); }, []);

  useEffect(() => {
    if (!competenciaId) { setFerias([]); return; }
    fetch(`/api/ferias?competenciaId=${competenciaId}`)
      .then((r) => r.json())
      .then(setFerias);
  }, [competenciaId]);

  useEffect(() => {
    fetch("/api/usuarios")
      .then((r) => r.json())
      .then((data: any[]) =>
        setConsultores(
          data
            .filter((u) => u.perfil === "CONSULTOR" && u.ativo)
            .map((u) => ({ id: u.id, nome: u.nome }))
        )
      );
  }, []);

  async function criarCompetencia() {
    setCriandoComp(true);
    setErroComp("");
    const res = await fetch("/api/competencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes: novoMes, ano: novoAno }),
    });
    setCriandoComp(false);
    if (!res.ok) {
      const d = await res.json();
      setErroComp(d.erro || "Erro ao criar competência");
      return;
    }
    const nova: Competencia = await res.json();
    await recarregarCompetencias();
    setCompetenciaId(nova.id);
    setShowNovaComp(false);
    setErroComp("");
  }

  async function adicionarFerias() {
    if (!novaFeriasConsultorId || !novaFeriasInicio || !novaFeriasFim || !competenciaId) return;
    setSalvandoFerias(true);
    const res = await fetch("/api/ferias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consultorId: novaFeriasConsultorId,
        competenciaId,
        dataInicio: novaFeriasInicio,
        dataFim: novaFeriasFim,
      }),
    });
    setSalvandoFerias(false);
    if (res.ok) {
      const nova = await res.json();
      setFerias((prev) => {
        const filtrado = prev.filter((f) => f.consultorId !== nova.consultorId);
        return [...filtrado, nova].sort((a, b) => a.consultor.nome.localeCompare(b.consultor.nome));
      });
      setNovaFeriasConsultorId("");
      setNovaFeriasInicio("");
      setNovaFeriasFim("");
    }
  }

  async function removerFerias(id: string) {
    await fetch(`/api/ferias?id=${id}`, { method: "DELETE" });
    setFerias((prev) => prev.filter((f) => f.id !== id));
  }

  async function toggleCongelar(f: FeriasEntry) {
    const endpoint = f.congelado ? "descongelar" : "congelar";
    const res = await fetch(`/api/ferias/${f.id}/${endpoint}`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setFerias((prev) => prev.map((item) =>
        item.id === f.id
          ? {
              ...item,
              congelado: !f.congelado,
              congeladoEm: f.congelado ? null : new Date().toISOString(),
              snapshotSaldo: data.snapshotSaldo ?? null,
              snapshotRecebido: data.snapshotRecebido ?? null,
              snapshotMetaAlvo: data.snapshotMetaAlvo ?? null,
            }
          : item
      ));
    }
  }

  async function handleResolver() {
    if (!resolverModal) return;
    setResolverCarregando(true);
    const res = await fetch("/api/baixas-oficiais/resolver", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recebimentoIds: resolverModal.ids, motivo: resolverMotivo }),
    });
    setResolverCarregando(false);
    if (res.ok) {
      setBxResultado((prev: any) => {
        if (!prev) return prev;
        const novasDivs = prev.detalhes.divergencias.filter((d: any) =>
          !d.recebimentoIds?.some((id: string) => resolverModal.ids.includes(id))
        );
        return {
          ...prev,
          divergencias: prev.divergencias - 1,
          confirmados: prev.confirmados + 1,
          detalhes: { ...prev.detalhes, divergencias: novasDivs },
        };
      });
      setResolverModal(null);
      setResolverMotivo("Juros e encargos");
    }
  }

  async function handleBxImportar() {
    if (!bxArquivo || !competenciaId) return;
    setBxCarregando(true);
    setBxErro("");
    setBxResultado(null);
    setBxAberto(null);
    const form = new FormData();
    form.append("arquivo", bxArquivo);
    form.append("competenciaId", competenciaId);
    const res = await fetch("/api/baixas-oficiais/importar", { method: "POST", body: form });
    const data = await res.json();
    setBxCarregando(false);
    if (!res.ok) setBxErro(data.erro || "Erro ao importar baixas.");
    else setBxResultado(data);
  }

  async function handleImportar() {
    if (!arquivo || !competenciaId) return;
    setCarregando(true);
    setErro("");
    setResultado(null);

    const form = new FormData();
    form.append("arquivo", arquivo);
    form.append("competenciaId", competenciaId);
    form.append("tipoBase", tipoImport!);

    const res = await fetch("/api/importacao", { method: "POST", body: form });
    const data = await res.json();
    setCarregando(false);

    if (!res.ok) {
      setErro(data.erro || "Erro ao importar.");
    } else {
      setResultado({ processadas: data.processadas, erros: data.erros, tipoDetectado: data.tipoDetectado });
    }
  }

  const consultoresDisponiveis = consultores.filter(
    (c) => !ferias.some((f) => f.consultorId === c.id)
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Modal de resolução de divergência */}
      {resolverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-surface-2 border border-white/[0.08] rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div>
              <h3 className="text-white font-semibold text-base">Resolver divergência</h3>
              <p className="text-slate-400 text-xs mt-1">{resolverModal.contrato} · {resolverModal.cliente}</p>
            </div>
            <p className="text-slate-400 text-sm">O recebimento será marcado como <span className="text-emerald-400 font-medium">Confirmado</span> e não será sobrescrito em próximas importações.</p>
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Motivo</label>
              <Select
                value={resolverMotivo}
                onValueChange={setResolverMotivo}
                className="py-2 focus:ring-emerald-500"
                options={[
                  { value: "Juros e encargos", label: "Juros e encargos" },
                  { value: "Valor verificado com o banco", label: "Valor verificado com o banco" },
                  { value: "Acordo negociado", label: "Acordo negociado" },
                  { value: "Outro", label: "Outro" },
                ]}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setResolverModal(null); setResolverMotivo("Juros e encargos"); }}
                className="flex-1 py-2 rounded-lg bg-surface-1 hover:bg-white/[0.04] text-slate-300 text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleResolver}
                disabled={resolverCarregando}
                className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {resolverCarregando ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold text-white">Importação de Planilha</h1>
        <p className="text-slate-400 text-sm mt-1">
          Importe a planilha de inadimplência. A carteira será distribuída automaticamente.
        </p>
      </div>

      <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-6 space-y-5">
        {/* Seleção de competência */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm text-slate-400">Competência</label>
            <button
              onClick={() => { setShowNovaComp(!showNovaComp); setErroComp(""); }}
              className="flex items-center gap-1 text-xs text-gr-400 hover:text-gr-300 transition-colors"
            >
              <Plus size={12} />
              Nova competência
            </button>
          </div>

          {showNovaComp && (
            <div className="mb-3 p-3 bg-surface-1 border border-white/[0.08] rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <CalendarDays size={14} className="text-gr-400 flex-shrink-0" />
                <span className="text-xs font-medium text-slate-300">Nova Competência</span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    value={String(novoMes)}
                    onValueChange={(v) => setNovoMes(Number(v))}
                    className="w-full bg-white/[0.07] border-white/[0.12] py-2"
                    options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
                  />
                </div>
                <input
                  type="number"
                  value={novoAno}
                  onChange={(e) => setNovoAno(Number(e.target.value))}
                  min={2024}
                  max={2030}
                  className="w-24 bg-white/[0.07] border border-white/[0.12] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gr-500"
                />
                <button
                  onClick={criarCompetencia}
                  disabled={criandoComp}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gr-500 hover:bg-gr-600 disabled:bg-gr-500/50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {criandoComp ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Criar
                </button>
              </div>
              {erroComp && <p className="text-xs text-red-400">{erroComp}</p>}
            </div>
          )}

          <Select
            value={competenciaId}
            onValueChange={(v) => { setCompetenciaId(v); setTipoImport(null); if (v) carregarFpStatus(v); }}
            placeholder="Selecione a competência"
            className="w-full"
            options={competencias.filter((c) => !c.fechada).map((c) => ({ value: c.id, label: c.descricao }))}
          />

          {/* Tipo de base */}
          <div className="mt-3">
            <label className="block text-sm text-slate-400 mb-2">Tipo de base</label>
            <div className="grid grid-cols-2 gap-2">
              {(["BASE", "FLASH"] as const).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setTipoImport(tipo)}
                  className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border text-left transition-colors ${
                    tipoImport === tipo
                      ? tipo === "FLASH"
                        ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300"
                        : "bg-gr-500/15 border-gr-500/50 text-gr-300"
                      : "bg-surface-1 border-white/[0.08] text-slate-400 hover:border-white/[0.12]"
                  }`}
                >
                  <span className="text-sm font-medium">
                    {tipo === "BASE" ? "Base Mensal" : "Flash Semanal"}
                  </span>
                  <span className="text-xs opacity-70">
                    {tipo === "BASE"
                      ? "Primeiro envio desta competência"
                      : "Envio incremental semanal"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Férias desta competência */}
        {competenciaId && (
          <div className="border border-white/[0.08] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <UmbrellaOff size={14} className="text-amber-400" />
              <span className="text-sm font-medium text-slate-300">Férias nesta competência</span>
              <span className="text-xs text-slate-500">(registre antes de importar)</span>
            </div>

            {ferias.length > 0 && (
              <div className="space-y-1.5">
                {ferias.map((f) => (
                  <div key={f.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${f.congelado ? "bg-sky-500/10 border border-sky-500/20" : "bg-surface-1"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white">{f.consultor.nome}</span>
                        {f.congelado && (
                          <span className="flex items-center gap-1 text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded">
                            <Snowflake size={10} /> Congelado
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        {new Date(f.dataInicio).toLocaleDateString("pt-BR", { timeZone: "UTC" })} →{" "}
                        {new Date(f.dataFim).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                      </span>
                      {f.congelado && f.snapshotMetaAlvo != null && (
                        <p className="text-xs text-sky-400 mt-0.5">
                          Meta congelada: R$ {Number(f.snapshotMetaAlvo).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <button
                        onClick={() => toggleCongelar(f)}
                        title={f.congelado ? "Descongelar" : "Congelar carteira/meta"}
                        className={`p-1.5 rounded-lg transition-colors ${f.congelado ? "text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20" : "text-slate-500 hover:text-sky-400 hover:bg-sky-500/10"}`}
                      >
                        <Snowflake size={14} />
                      </button>
                      <button
                        onClick={() => removerFerias(f.id)}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1.5"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {consultoresDisponiveis.length > 0 ? (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Select
                    value={novaFeriasConsultorId}
                    onValueChange={setNovaFeriasConsultorId}
                    placeholder="Selecionar consultor"
                    className="w-full py-2 text-xs"
                    options={consultoresDisponiveis.map((c) => ({ value: c.id, label: c.nome }))}
                  />
                </div>
                <input
                  type="date"
                  value={novaFeriasInicio}
                  onChange={(e) => setNovaFeriasInicio(e.target.value)}
                  className="bg-surface-1 border border-white/[0.08] rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-gr-500"
                />
                <input
                  type="date"
                  value={novaFeriasFim}
                  onChange={(e) => setNovaFeriasFim(e.target.value)}
                  className="bg-surface-1 border border-white/[0.08] rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-gr-500"
                />
                <button
                  onClick={adicionarFerias}
                  disabled={!novaFeriasConsultorId || !novaFeriasInicio || !novaFeriasFim || salvandoFerias}
                  className="flex items-center gap-1 px-3 py-2 bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-40 text-amber-300 text-xs rounded-lg transition-colors"
                >
                  {salvandoFerias ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Adicionar
                </button>
              </div>
            ) : (
              ferias.length === 0 && (
                <p className="text-xs text-slate-500">Nenhum consultor de férias nesta competência.</p>
              )
            )}
          </div>
        )}

        {/* Seleção de arquivo */}
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">Planilha de Inadimplência</label>
          <label className="flex items-center gap-3 w-full border border-dashed border-white/[0.08] rounded-xl px-4 py-3 cursor-pointer hover:border-sky-500 hover:bg-sky-500/5 transition-colors">
            <FileSpreadsheet size={18} className="text-slate-500 flex-shrink-0" />
            <span className="text-sm text-slate-400 truncate">
              {arquivo ? arquivo.name : "Arraste ou clique para selecionar (.xlsx, .xls, .csv)"}
            </span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
          </label>
        </div>

        {erro && (
          <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm">
            <XCircle size={16} />
            {erro}
          </div>
        )}

        {resultado && (
          <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
            <CheckCircle size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-emerald-400 font-medium text-sm">Importação concluída!</p>
              <p className="text-slate-400 text-xs mt-0.5">
                {resultado.processadas} contratos importados
                {resultado.erros > 0 && ` · ${resultado.erros} erros`}
                {resultado.tipoDetectado && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    resultado.tipoDetectado === "FLASH"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-gr-500/20 text-gr-400"
                  }`}>
                    {resultado.tipoDetectado === "FLASH" ? "Flash Semanal" : "Base Mensal"}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        <button
          onClick={handleImportar}
          disabled={!arquivo || !competenciaId || !tipoImport || carregando}
          className="w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
        >
          {carregando ? (
            <><Loader2 size={16} className="animate-spin" /> Importando...</>
          ) : (
            <><Upload size={16} /> Importar e Distribuir Carteira</>
          )}
        </button>
      </div>

      {/* ── Seção Baixas Confirmadas — Empreendimentos Gerais ──────────────── */}
      <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-white">Baixas Confirmadas</h2>
          <p className="text-xs text-slate-400 mt-0.5">Importe a planilha oficial de baixados para cruzar com os recebimentos registrados pelos consultores.</p>
        </div>

        {competenciaId ? (
          <>
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Planilha de Baixados — Empreendimentos Gerais</label>
              <label className="flex items-center gap-3 w-full border border-dashed border-white/[0.08] rounded-xl px-4 py-3 cursor-pointer hover:border-sky-500 hover:bg-sky-500/5 transition-colors">
                <FileSpreadsheet size={18} className="text-slate-500 flex-shrink-0" />
                <span className="text-sm text-slate-400 truncate">
                  {bxArquivo ? bxArquivo.name : "Baixado [mês] multi e mydest.xls"}
                </span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { setBxArquivo(e.target.files?.[0] || null); setBxResultado(null); setBxErro(""); }} />
              </label>
            </div>

            {bxErro && (
              <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm">
                <XCircle size={16} /> {bxErro}
              </div>
            )}

            {bxResultado && (
              <div className="space-y-3">
                <div className="bg-white/[0.03] rounded-xl px-4 py-2.5 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Total na carteira</span>
                  <span className="text-white font-bold">{bxResultado.totalCarteira} contratos</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                    <p className="text-xs text-slate-400">Confirmados</p>
                    <p className="text-xs text-slate-500">Planilha e sistema coincidem</p>
                    <p className="text-sm font-bold text-emerald-400 mt-1">{bxResultado.confirmados}</p>
                  </div>
                  <button
                    onClick={() => setBxAberto(bxAberto === "naoLancados" ? null : "naoLancados")}
                    className={`rounded-xl p-3 text-left transition-colors ${(bxResultado.naoLancados + bxResultado.semMovimento) > 0 ? "bg-red-500/10 border border-red-500/20 hover:bg-red-500/15" : "bg-white/[0.03]"}`}
                  >
                    <p className="text-xs text-slate-400">Não recebido</p>
                    <p className="text-xs text-slate-500">Sem confirmação de pagamento</p>
                    <p className={`text-sm font-bold mt-1 ${(bxResultado.naoLancados + bxResultado.semMovimento) > 0 ? "text-red-400" : "text-slate-400"}`}>{bxResultado.naoLancados + bxResultado.semMovimento}</p>
                  </button>
                  <button
                    onClick={() => setBxAberto(bxAberto === "divergencias" ? null : "divergencias")}
                    className={`rounded-xl p-3 text-left transition-colors ${bxResultado.divergencias > 0 ? "bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15" : "bg-white/[0.03]"}`}
                  >
                    <p className="text-xs text-slate-400">Divergência</p>
                    <p className="text-xs text-slate-500">No sistema, sem baixa no banco</p>
                    <p className={`text-sm font-bold mt-1 ${bxResultado.divergencias > 0 ? "text-amber-400" : "text-slate-400"}`}>{bxResultado.divergencias}</p>
                  </button>
                </div>

                {bxAberto === "divergencias" && bxResultado.detalhes.divergencias.length > 0 && (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
                    <p className="text-xs font-medium text-amber-400 px-4 py-2 border-b border-amber-500/20">No sistema, sem baixa no banco (máx 50)</p>
                    <div className="max-h-56 overflow-y-auto divide-y divide-white/[0.05]">
                      {bxResultado.detalhes.divergencias.map((d: any, i: number) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2 text-xs gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="text-white font-medium">{d.contrato}</span>
                            <span className="text-slate-400 ml-2">{d.cliente}</span>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-amber-400">Sistema: {formatarMoeda(d.valorSistema)}</p>
                          </div>
                          {d.recebimentoIds?.length > 0 && (
                            <button
                              onClick={() => setResolverModal({ ids: d.recebimentoIds, contrato: d.contrato, cliente: d.cliente })}
                              className="flex-shrink-0 flex items-center gap-1 px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 rounded-lg transition-colors text-[11px]"
                            >
                              <CheckCheck size={11} /> Resolver
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {bxAberto === "naoLancados" && bxResultado.detalhes.naoLancados.length > 0 && (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-xl overflow-hidden">
                    <p className="text-xs font-medium text-red-400 px-4 py-2 border-b border-red-500/20">Baixou na planilha, sem lançamento no sistema (máx 50)</p>
                    <div className="max-h-56 overflow-y-auto divide-y divide-white/[0.05]">
                      {bxResultado.detalhes.naoLancados.map((d: any, i: number) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2 text-xs">
                          <div>
                            <span className="text-white font-medium">{d.contrato}</span>
                            <span className="text-slate-400 ml-2">{d.cliente}</span>
                          </div>
                          <div className="text-right flex-shrink-0 ml-4">
                            <p className="text-emerald-400">{formatarMoeda(d.valorPlanilha)}</p>
                            <p className="text-slate-500">{d.dataLiquidacao}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleBxImportar}
              disabled={!bxArquivo || bxCarregando}
              className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-600/30 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              {bxCarregando
                ? <><Loader2 size={16} className="animate-spin" /> Cruzando dados...</>
                : <><ArrowDownToLine size={16} /> Importar e Cruzar Baixas</>}
            </button>
          </>
        ) : (
          <p className="text-xs text-slate-500">Selecione uma competência acima para importar baixas.</p>
        )}
      </div>

      {/* ── Seção Fã Pass ──────────────────────────────────────────────────── */}
      <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Fã Pass</h2>
            <p className="text-xs text-slate-400 mt-0.5">Base de inadimplência — Passaporte BC</p>
          </div>
          {fpStatus?.ultimaSync && (
            <div className="text-right">
              <p className="text-xs text-slate-400">Última sync</p>
              <p className="text-xs text-slate-300 font-medium">
                {new Date(fpStatus.ultimaSync.criadoEm).toLocaleDateString("pt-BR")} · {new Date(fpStatus.ultimaSync.criadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          )}
        </div>

        {/* Status cards */}
        {fpStatus && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/[0.03] rounded-xl p-3">
              <p className="text-xs text-slate-400">Inadimplência</p>
              <p className="text-sm font-bold text-white mt-0.5">{formatarMoeda(fpStatus.totalInadimplencia)}</p>
              <p className="text-xs text-slate-500">{fpStatus.totalContratos} contratos</p>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-3">
              <p className="text-xs text-slate-400">Baixado</p>
              <p className="text-sm font-bold text-emerald-400 mt-0.5">{formatarMoeda(fpStatus.totalBaixado)}</p>
            </div>
            <div className={`rounded-xl p-3 ${fpStatus.divergenciasPendentes > 0 ? "bg-amber-500/10 border border-amber-500/20" : "bg-white/[0.03]"}`}>
              <p className="text-xs text-slate-400">Divergências</p>
              <p className={`text-sm font-bold mt-0.5 ${fpStatus.divergenciasPendentes > 0 ? "text-amber-400" : "text-slate-300"}`}>
                {fpStatus.divergenciasPendentes}
              </p>
            </div>
          </div>
        )}

        {/* Upload do arquivo */}
        {competenciaId && (
          <>
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Arquivo da QUERY</label>
              <label className="flex items-center gap-3 w-full border border-dashed border-white/[0.08] rounded-xl px-4 py-3 cursor-pointer hover:border-gr-500 hover:bg-gr-500/5 transition-colors">
                <FileSpreadsheet size={18} className="text-slate-500 flex-shrink-0" />
                <span className="text-sm text-slate-400 truncate">
                  {fpArquivo ? fpArquivo.name : "Base CAR Passaporte BC.xlsx"}
                </span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { setFpArquivo(e.target.files?.[0] || null); setFpResultado(null); setFpErro(""); }} />
              </label>
            </div>

            {fpCarregando && fpProgresso && (
              <div className="flex items-center gap-2 text-slate-300 bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-3 text-sm">
                <Loader2 size={15} className="animate-spin text-gr-400 flex-shrink-0" />
                <span>{fpProgresso}</span>
              </div>
            )}

            {fpErro && (
              <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm">
                <XCircle size={16} /> {fpErro}
              </div>
            )}

            {fpResultado && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-400" />
                  <p className="text-emerald-400 font-medium text-sm">{fpResultado.primeiraSync ? "Competência inicializada" : "Query atualizada"}</p>
                </div>
                <div className="grid grid-cols-2 gap-x-4 text-xs text-slate-400 mt-2">
                  <span>{fpResultado.novosInadimplentes} inadimplentes novos</span>
                  <span>{fpResultado.novosFlash} flash novos</span>
                  {fpResultado.totalDivergencias > 0 && (
                    <span className="text-amber-400 col-span-2 flex items-center gap-1">
                      <AlertTriangle size={12} /> {fpResultado.totalDivergencias} divergências detectadas
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleFpSync}
                disabled={!fpArquivo || fpCarregando}
                className="flex-1 flex items-center justify-center gap-2 bg-gr-500 hover:bg-gr-600 disabled:bg-gr-500/30 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
              >
                {fpCarregando ? <><Loader2 size={15} className="animate-spin" /> Processando...</> : <><RefreshCw size={15} /> Importar Fã Pass</>}
              </button>
              <button
                onClick={() => window.open(`/api/fapass/exportar?competenciaId=${competenciaId}`, "_blank")}
                disabled={!competenciaId}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.07] hover:bg-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                title="Exporta os dados de inadimplência, baixas e divergências desta competência"
              >
                <ArrowDownToLine size={15} />
                Exportar
              </button>
              <button
                onClick={handleFpFecharCiclo}
                disabled={fpFechando || !fpStatus?.totalContratos}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/[0.07] hover:bg-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {fpFechando ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
                Fechar Ciclo
              </button>
            </div>
          </>
        )}

        {!competenciaId && (
          <p className="text-xs text-slate-500">Selecione uma competência acima para usar o Fã Pass.</p>
        )}
      </div>

      {/* ── Seção Baixas Fã Pass ───────────────────────────────────────────── */}
      <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-6">
        <div>
          <h2 className="text-base font-semibold text-white">Baixas Fã Pass</h2>
          <p className="text-xs text-slate-400 mt-0.5">Confirmação de pagamentos — Passaporte BC</p>
        </div>
        <p className="text-xs text-slate-500 mt-4">Em breve — aguardando arquivo de baixas do banco.</p>
      </div>
    </div>
  );
}
