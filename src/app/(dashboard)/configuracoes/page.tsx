"use client";

import { useEffect, useState } from "react";
import { Settings, Save } from "lucide-react";

interface Config { chave: string; valor: string }

const LABELS: Record<string, { label: string; descricao: string; tipo: string }> = {
  VALOR_BASE_COMISSAO: { label: "Valor Base da Comissão (R$)", descricao: "Valor base mensal para cálculo das comissões", tipo: "number" },
  DIAS_ALERTA_SEM_CONTATO_FLASH: { label: "Alerta sem contato — Flash (dias)", descricao: "Dias sem contato para alerta na equipe Flash", tipo: "number" },
};

export default function ConfiguracoesPage() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [editados, setEditados] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    fetch("/api/configuracoes").then((r) => r.json()).then(setConfigs);
  }, []);

  async function salvar() {
    setSalvando(true);
    await fetch("/api/configuracoes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editados),
    });
    setSalvando(false);
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Settings size={24} className="text-slate-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Configurações</h1>
          <p className="text-slate-400 text-sm">Parâmetros globais do sistema</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        {configs.map((c) => {
          const info = LABELS[c.chave];
          if (!info) return null;
          const valor = editados[c.chave] ?? c.valor;
          return (
            <div key={c.chave}>
              <label className="block text-sm font-medium text-white mb-1">{info.label}</label>
              <p className="text-slate-500 text-xs mb-2">{info.descricao}</p>
              <input
                type={info.tipo}
                value={valor}
                onChange={(e) => setEditados((prev) => ({ ...prev, [c.chave]: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          );
        })}

        <button
          onClick={salvar}
          disabled={salvando || Object.keys(editados).length === 0}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 disabled:cursor-not-allowed text-white font-medium px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          <Save size={16} />
          {salvando ? "Salvando..." : salvo ? "Salvo!" : "Salvar Alterações"}
        </button>
      </div>

      {/* Competências */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-white font-semibold mb-4">Nova Competência</h2>
        <NovaCompetencia />
      </div>
    </div>
  );
}

function NovaCompetencia() {
  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [criando, setCriando] = useState(false);
  const [ok, setOk] = useState(false);

  async function criar() {
    setCriando(true);
    await fetch("/api/competencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes, ano }),
    });
    setCriando(false);
    setOk(true);
    setTimeout(() => setOk(false), 2500);
  }

  return (
    <div className="flex items-end gap-3">
      <div>
        <label className="block text-xs text-slate-400 mb-1.5">Mês</label>
        <select value={mes} onChange={(e) => setMes(Number(e.target.value))}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
          {meses.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1.5">Ano</label>
        <input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm w-24 focus:outline-none focus:ring-2 focus:ring-sky-500" />
      </div>
      <button onClick={criar} disabled={criando}
        className="bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
        {ok ? "Criada!" : criando ? "Criando..." : "Criar"}
      </button>
    </div>
  );
}
