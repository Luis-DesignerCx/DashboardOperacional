"use client";

import { useState, useEffect } from "react";
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Plus, CalendarDays } from "lucide-react";

interface Competencia {
  id: string;
  descricao: string;
  fechada: boolean;
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

  async function recarregarCompetencias() {
    const data = await fetch("/api/competencias").then((r) => r.json());
    setCompetencias(data);
    return data as Competencia[];
  }

  useEffect(() => { recarregarCompetencias(); }, []);

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
    const lista = await recarregarCompetencias();
    setCompetenciaId(nova.id);
    setShowNovaComp(false);
    setErroComp("");
  }

  // Detecta tipo assim que seleciona a competência
  useEffect(() => {
    if (!competenciaId) { setTipoImport(null); return; }
    fetch(`/api/historico`)
      .then((r) => r.json())
      .then((lista: any[]) => {
        const comp = lista.find((c: any) => c.id === competenciaId);
        setTipoImport(comp && comp.totalContratos > 0 ? "FLASH" : "BASE");
      });
  }, [competenciaId]);

  async function handleImportar() {
    if (!arquivo || !competenciaId) return;
    setCarregando(true);
    setErro("");
    setResultado(null);

    const form = new FormData();
    form.append("arquivo", arquivo);
    form.append("competenciaId", competenciaId);

    const res = await fetch("/api/importacao", { method: "POST", body: form });
    const data = await res.json();
    setCarregando(false);

    if (!res.ok) {
      setErro(data.erro || "Erro ao importar.");
    } else {
      setResultado({ processadas: data.processadas, erros: data.erros, tipoDetectado: data.tipoDetectado });
    }
  }

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

          {/* Formulário inline de nova competência */}
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
            onChange={(e) => setCompetenciaId(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
          >
            <option value="">Selecione a competência</option>
            {competencias.filter((c) => !c.fechada).map((c) => (
              <option key={c.id} value={c.id}>{c.descricao}</option>
            ))}
          </select>

          {tipoImport && (
            <div className={`flex items-center gap-2 mt-2 px-3 py-2 rounded-lg text-xs font-medium border ${
              tipoImport === "FLASH"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-gr-500/10 border-gr-500/20 text-gr-300"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${tipoImport === "FLASH" ? "bg-emerald-400" : "bg-gr-400"}`} />
              {tipoImport === "FLASH"
                ? "Flash Semanal detectado — base mensal já existe para esta competência"
                : "Base Mensal — primeiro import desta competência"}
            </div>
          )}
        </div>

        {/* Upload de arquivo */}
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
          disabled={!arquivo || !competenciaId || carregando}
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
