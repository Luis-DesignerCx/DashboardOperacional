"use client";

import { useEffect, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { Target, Plus, X, CheckCircle2, Loader2 } from "lucide-react";

interface Meta {
  id: string;
  nome: string;
  tipo: string;
  valorAlvo: number;
  peso: number;
  equipe: { nome: string; tipo: string };
  competencia: { descricao: string };
}

const inputCls = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500 placeholder:text-slate-500";

export default function MetasPage() {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [competencias, setCompetencias] = useState<any[]>([]);

  // Modal nova meta
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState({ equipeId: "", competenciaId: "", nome: "", valorAlvo: "", tipo: "FINANCEIRA" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  function recarregar() {
    setCarregando(true);
    fetch("/api/metas").then((r) => r.json()).then((d) => { setMetas(d); setCarregando(false); });
  }

  useEffect(() => {
    recarregar();
    fetch("/api/equipes").then((r) => r.json()).then((d) => setEquipes(Array.isArray(d) ? d : []));
    fetch("/api/competencias").then((r) => r.json()).then((d) => {
      setCompetencias(Array.isArray(d) ? d : []);
      if (Array.isArray(d) && d.length > 0) setForm((f) => ({ ...f, competenciaId: d[0].id }));
    });
  }, []);

  function abrirModal() {
    setModalAberto(true);
    setForm((f) => ({ ...f, equipeId: equipes[0]?.id ?? "", nome: "", valorAlvo: "", tipo: "FINANCEIRA" }));
    setErro("");
  }

  async function salvarMeta() {
    setErro("");
    const valor = parseFloat(form.valorAlvo.replace(",", "."));
    if (!form.equipeId) { setErro("Selecione a equipe"); return; }
    if (!form.competenciaId) { setErro("Selecione a competência"); return; }
    if (!valor || valor <= 0) { setErro("Informe um valor alvo válido"); return; }
    setSalvando(true);
    const res = await fetch("/api/metas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        equipeId: form.equipeId,
        competenciaId: form.competenciaId,
        nome: form.nome || "Meta Financeira",
        tipo: form.tipo,
        valorAlvo: valor,
      }),
    });
    const data = await res.json();
    setSalvando(false);
    if (!res.ok) { setErro(data.erro || "Erro ao salvar"); return; }
    setModalAberto(false);
    recarregar();
  }

  const TIPO_EQUIPE_LABEL: Record<string, string> = {
    FLASH: "Flash", CRA_1_30: "1-30 dias", CR_31_90: "31-90 dias",
    CR_PDD_91_180: "91-180 dias", CR_PDD_181: "181+ dias",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Metas</h1>
          <p className="text-slate-400 text-sm mt-1">Configuração de metas por equipe e competência</p>
        </div>
        <button
          onClick={abrirModal}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={16} /> Nova Meta
        </button>
      </div>

      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : metas.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <Target size={40} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400 font-medium">Nenhuma meta configurada</p>
          <p className="text-slate-600 text-sm mt-1">Clique em "Nova Meta" para criar metas por equipe.</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Meta</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Equipe</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Competência</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Tipo</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Valor Alvo</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Peso</th>
              </tr>
            </thead>
            <tbody>
              {metas.map((m) => (
                <tr key={m.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{m.nome}</td>
                  <td className="px-4 py-3 text-slate-400">{m.equipe.nome}</td>
                  <td className="px-4 py-3 text-slate-400">{m.competencia.descricao}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${m.tipo === "FINANCEIRA" ? "bg-sky-500/10 text-sky-400" : "bg-purple-500/10 text-purple-400"}`}>
                      {m.tipo === "FINANCEIRA" ? "Financeira" : "Qtd. Clientes"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-white font-semibold tabular-nums">{formatarMoeda(m.valorAlvo)}</td>
                  <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{m.peso}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal nova meta */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h2 className="text-white font-semibold">Nova Meta</h2>
                <p className="text-slate-500 text-xs mt-0.5">Defina o valor alvo por equipe e competência</p>
              </div>
              <button onClick={() => setModalAberto(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Equipe *</label>
                <select className={inputCls} value={form.equipeId} onChange={(e) => setForm((f) => ({ ...f, equipeId: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {equipes.map((e: any) => (
                    <option key={e.id} value={e.id}>{e.nome} ({TIPO_EQUIPE_LABEL[e.tipo] ?? e.tipo})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Competência *</label>
                <select className={inputCls} value={form.competenciaId} onChange={(e) => setForm((f) => ({ ...f, competenciaId: e.target.value }))}>
                  {competencias.map((c: any) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Nome da meta</label>
                <input className={inputCls} placeholder="Ex: Meta de Recebimento Julho" value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Valor alvo (R$) *</label>
                  <input className={inputCls} placeholder="0,00" value={form.valorAlvo}
                    onChange={(e) => setForm((f) => ({ ...f, valorAlvo: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Tipo</label>
                  <select className={inputCls} value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                    <option value="FINANCEIRA">Financeira</option>
                    <option value="QUANTIDADE">Qtd. Clientes</option>
                  </select>
                </div>
              </div>

              {erro && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>}
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setModalAberto(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={salvarMeta} disabled={salvando}
                className="flex-1 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 text-white text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                {salvando ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : <><CheckCircle2 size={14} /> Criar meta</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
