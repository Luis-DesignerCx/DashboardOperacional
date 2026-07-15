"use client";

import { useEffect, useState } from "react";
import { Settings, Save, Trash2, AlertTriangle } from "lucide-react";
import { useSession } from "next-auth/react";

interface Config { chave: string; valor: string }

const LABELS: Record<string, { label: string; descricao: string; tipo: string }> = {
  VALOR_BASE_COMISSAO: { label: "Valor Base da Comissão (R$)", descricao: "Valor base mensal para cálculo das comissões", tipo: "number" },
  DIAS_ALERTA_SEM_CONTATO_FLASH: { label: "Alerta sem contato — Flash (dias)", descricao: "Dias sem contato para alerta na equipe Flash", tipo: "number" },
};

export default function ConfiguracoesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.perfil === "ADMINISTRADOR";
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

      {/* Reset — somente Admin */}
      {isAdmin && <ResetSistema />}
    </div>
  );
}

function ResetSistema() {
  const [confirmando, setConfirmando] = useState(false);
  const [texto, setTexto] = useState("");
  const [resetando, setResetando] = useState(false);
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState("");

  const CONFIRMACAO = "LIMPAR TUDO";

  async function executarReset() {
    setResetando(true);
    setErro("");
    const res = await fetch("/api/admin/reset", { method: "POST" });
    const data = await res.json();
    setResetando(false);
    if (!res.ok) { setErro(data.erro || "Erro ao resetar"); return; }
    setFeito(true);
    setConfirmando(false);
    setTexto("");
  }

  if (feito) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
        <p className="text-emerald-400 font-semibold">Base limpa com sucesso.</p>
        <p className="text-slate-400 text-sm mt-1">Crie uma nova competência e importe a base para começar.</p>
      </div>
    );
  }

  return (
    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-red-400 mt-0.5 flex-shrink-0" />
        <div>
          <h2 className="text-white font-semibold">Limpar base de dados</h2>
          <p className="text-slate-400 text-sm mt-1">
            Remove todos os contratos, clientes, parcelas, carteiras, recebimentos, promessas, atendimentos, comissões, metas e competências.
            <span className="text-white font-medium"> Usuários, equipes e regras de comissão são mantidos.</span>
          </p>
        </div>
      </div>

      {!confirmando ? (
        <button
          onClick={() => setConfirmando(true)}
          className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Trash2 size={15} />
          Limpar base de dados
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Digite <span className="font-mono font-bold text-red-400">{CONFIRMACAO}</span> para confirmar:
          </p>
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={CONFIRMACAO}
            className="w-full bg-slate-800 border border-red-500/30 rounded-lg px-4 py-2.5 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          {erro && <p className="text-red-400 text-sm">{erro}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => { setConfirmando(false); setTexto(""); setErro(""); }}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={executarReset}
              disabled={texto !== CONFIRMACAO || resetando}
              className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-red-600/20 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {resetando ? "Limpando..." : "Confirmar limpeza"}
            </button>
          </div>
        </div>
      )}
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
