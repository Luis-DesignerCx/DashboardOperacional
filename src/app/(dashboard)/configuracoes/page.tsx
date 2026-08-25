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

      <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-6 space-y-5">
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
                className="w-full bg-surface-1 border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
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
      <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-6">
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
  const [senha, setSenha] = useState("");
  const [resetando, setResetando] = useState(false);
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState("");

  async function executarReset() {
    setResetando(true);
    setErro("");
    const res = await fetch("/api/admin/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha }),
    });
    const data = await res.json();
    setResetando(false);
    if (!res.ok) { setErro(data.erro || "Erro ao resetar"); return; }
    setFeito(true);
    setConfirmando(false);
    setSenha("");
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
            Digite sua senha de administrador para confirmar:
          </p>
          <input
            autoFocus
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Sua senha"
            className="w-full bg-surface-1 border border-red-500/30 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          {erro && <p className="text-red-400 text-sm">{erro}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => { setConfirmando(false); setSenha(""); setErro(""); }}
              className="flex-1 bg-surface-1 hover:bg-white/[0.04] text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={executarReset}
              disabled={!senha || resetando}
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
          className="bg-surface-1 border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
          {meses.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1.5">Ano</label>
        <input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))}
          className="bg-surface-1 border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm w-24 focus:outline-none focus:ring-2 focus:ring-sky-500" />
      </div>
      <button onClick={criar} disabled={criando}
        className="bg-sky-500 hover:bg-sky-400 disabled:bg-sky-500/30 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
        {ok ? "Criada!" : criando ? "Criando..." : "Criar"}
      </button>
    </div>
  );
}
