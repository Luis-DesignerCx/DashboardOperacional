"use client";

import { useState, useEffect } from "react";
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Plus, CalendarDays, Trash2, UmbrellaOff } from "lucide-react";

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

  // Férias
  const [ferias, setFerias] = useState<FeriasEntry[]>([]);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [novaFeriasConsultorId, setNovaFeriasConsultorId] = useState("");
  const [novaFeriasInicio, setNovaFeriasInicio] = useState("");
  const [novaFeriasFim, setNovaFeriasFim] = useState("");
  const [salvandoFerias, setSalvandoFerias] = useState(false);

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
      <div>
        <h1 className="text-2xl font-bold text-white">Importação de Planilha</h1>
        <p className="text-slate-400 text-sm mt-1">
          Importe a planilha de inadimplência. A carteira será distribuída automaticamente.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
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
            <div className="mb-3 p-3 bg-slate-800 border border-slate-700 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <CalendarDays size={14} className="text-gr-400 flex-shrink-0" />
                <span className="text-xs font-medium text-slate-300">Nova Competência</span>
              </div>
              <div className="flex gap-2">
                <select
                  value={novoMes}
                  onChange={(e) => setNovoMes(Number(e.target.value))}
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gr-500"
                >
                  {MESES.map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={novoAno}
                  onChange={(e) => setNovoAno(Number(e.target.value))}
                  min={2024}
                  max={2030}
                  className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gr-500"
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

          <select
            value={competenciaId}
            onChange={(e) => { setCompetenciaId(e.target.value); setTipoImport(null); }}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
          >
            <option value="">Selecione a competência</option>
            {competencias.filter((c) => !c.fechada).map((c) => (
              <option key={c.id} value={c.id}>{c.descricao}</option>
            ))}
          </select>

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
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
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
          <div className="border border-slate-700 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <UmbrellaOff size={14} className="text-amber-400" />
              <span className="text-sm font-medium text-slate-300">Férias nesta competência</span>
              <span className="text-xs text-slate-500">(registre antes de importar)</span>
            </div>

            {ferias.length > 0 && (
              <div className="space-y-1.5">
                {ferias.map((f) => (
                  <div key={f.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                    <div>
                      <span className="text-sm text-white">{f.consultor.nome}</span>
                      <span className="text-xs text-slate-400 ml-2">
                        {new Date(f.dataInicio).toLocaleDateString("pt-BR", { timeZone: "UTC" })} →{" "}
                        {new Date(f.dataFim).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                      </span>
                    </div>
                    <button
                      onClick={() => removerFerias(f.id)}
                      className="text-slate-500 hover:text-red-400 transition-colors ml-2"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {consultoresDisponiveis.length > 0 ? (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <select
                    value={novaFeriasConsultorId}
                    onChange={(e) => setNovaFeriasConsultorId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-gr-500"
                  >
                    <option value="">Selecionar consultor</option>
                    {consultoresDisponiveis.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <input
                  type="date"
                  value={novaFeriasInicio}
                  onChange={(e) => setNovaFeriasInicio(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-gr-500"
                />
                <input
                  type="date"
                  value={novaFeriasFim}
                  onChange={(e) => setNovaFeriasFim(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-gr-500"
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
          <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:border-sky-500 hover:bg-sky-500/5 transition-colors">
            {arquivo ? (
              <div className="flex items-center gap-3 text-sky-400">
                <FileSpreadsheet size={24} />
                <div>
                  <p className="text-sm font-medium">{arquivo.name}</p>
                  <p className="text-xs text-slate-500">{(arquivo.size / 1024).toFixed(0)} KB</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <Upload size={24} />
                <p className="text-sm">Arraste ou clique para selecionar</p>
                <p className="text-xs">.xlsx, .xls, .csv</p>
              </div>
            )}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        {/* Colunas esperadas */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-xs text-slate-400 font-medium mb-2">Colunas lidas da planilha (por posição):</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              "Col 2 – Status Contrato", "Col 3 – Origem", "Col 4 – Meio Pagamento",
              "Col 5 – Contrato (ID único)", "Col 7 – Nome Cliente",
              "Col 11 – Data Vencimento", "Col 13 – Dias em Atraso",
              "Col 15 – Telefones", "Col 17 – Emails",
              "Col 18 – Total Parcelas Vencidas", "Col 19 – Valor Contrato", "Col 20 – Valor a Receber",
            ].map((col) => (
              <span key={col} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                {col}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">Identificador único: número do contrato (sem CPF)</p>
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
    </div>
  );
}
