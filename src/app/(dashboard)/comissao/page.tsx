"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { formatarMoeda } from "@/lib/utils";
import { DollarSign, Target, TrendingUp, Calculator, Pencil, Check, X, AlertCircle } from "lucide-react";

const FAIXAS = [
  { meta: "<70%", comissao: "0%", cor: "text-slate-500" },
  { meta: "70%", comissao: "60%", cor: "text-orange-400" },
  { meta: "80%", comissao: "70%", cor: "text-amber-400" },
  { meta: "90%", comissao: "80%", cor: "text-yellow-400" },
  { meta: "100%", comissao: "100%", cor: "text-emerald-400" },
  { meta: "110%", comissao: "110%", cor: "text-emerald-400" },
  { meta: "120%", comissao: "120%", cor: "text-emerald-400" },
  { meta: "130%", comissao: "130%", cor: "text-emerald-400" },
  { meta: "140%", comissao: "140%", cor: "text-emerald-400" },
  { meta: "150%", comissao: "150%", cor: "text-emerald-400" },
  { meta: "160%+", comissao: "160%", cor: "text-sky-400" },
];

function faixaCor(pct: number) {
  if (pct < 70) return "text-slate-500";
  if (pct < 80) return "text-orange-400";
  if (pct < 90) return "text-amber-400";
  if (pct < 100) return "text-yellow-400";
  return "text-emerald-400";
}

function faixaBarCor(pct: number) {
  if (pct < 70) return "bg-slate-600";
  if (pct < 80) return "bg-orange-500";
  if (pct < 90) return "bg-amber-500";
  if (pct < 100) return "bg-yellow-500";
  return "bg-emerald-500";
}

interface Consultor {
  id: string;
  nome: string;
  recebido: number;
  percentualMeta: number;
  faixaAplicada: number;
  valorFinal: number;
}

interface HistoricoItem {
  id: string;
  usuarioId: string;
  valorBase: number;
  percentualMeta: number;
  faixaAplicada: number;
  valorFinal: number;
  calculadoEm: string;
  equipe: { nome: string };
}

const inputCls = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500 placeholder:text-slate-500";

// ─────────────────────────────────────────────────────────
// GESTOR VIEW
// ─────────────────────────────────────────────────────────
function GestorComissao({ equipeId }: { equipeId: string }) {
  const [competencias, setCompetencias] = useState<any[]>([]);
  const [competenciaId, setCompetenciaId] = useState("");
  const [meta, setMeta] = useState<{ id: string; valorAlvo: number } | null>(null);
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [novoValorMeta, setNovoValorMeta] = useState("");
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [erroCalc, setErroCalc] = useState("");
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    fetch("/api/competencias").then((r) => r.json()).then((cs) => {
      setCompetencias(cs);
      if (cs[0]) setCompetenciaId(cs[0].id);
    });
  }, []);

  const carregarDados = useCallback(async (cId: string) => {
    if (!cId) return;
    setCarregando(true);
    setErroCalc("");
    setSucesso(false);

    const [metaRes, historicoRes, consultoresRes] = await Promise.all([
      fetch(`/api/metas?competenciaId=${cId}&equipeId=${equipeId}`).then((r) => r.json()),
      fetch(`/api/comissao?competenciaId=${cId}`).then((r) => r.json()),
      fetch(`/api/comissao/preview?competenciaId=${cId}&equipeId=${equipeId}`).then((r) => r.json()),
    ]);

    setMeta(Array.isArray(metaRes) && metaRes[0] ? metaRes[0] : null);
    setHistorico(Array.isArray(historicoRes) ? historicoRes : []);
    setConsultores(Array.isArray(consultoresRes) ? consultoresRes : []);
    setCarregando(false);
  }, [equipeId]);

  useEffect(() => {
    if (competenciaId) carregarDados(competenciaId);
  }, [competenciaId, carregarDados]);

  async function salvarMeta() {
    if (!novoValorMeta || !competenciaId) return;
    setSalvandoMeta(true);
    const valor = parseFloat(novoValorMeta.replace(",", "."));
    const res = await fetch("/api/metas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipeId, competenciaId, valorAlvo: valor, nome: "Meta Financeira" }),
    });
    setSalvandoMeta(false);
    if (res.ok) {
      setEditandoMeta(false);
      carregarDados(competenciaId);
    }
  }

  async function calcular() {
    setCalculando(true);
    setErroCalc("");
    setSucesso(false);
    const res = await fetch("/api/comissao/calcular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipeId, competenciaId }),
    });
    setCalculando(false);
    if (res.ok) {
      setSucesso(true);
      carregarDados(competenciaId);
    } else {
      const d = await res.json();
      setErroCalc(d.erro || "Erro ao calcular");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Comissão</h1>
          <p className="text-slate-400 text-sm mt-1">Gerencie metas e comissões da sua equipe</p>
        </div>
        <select
          value={competenciaId}
          onChange={(e) => setCompetenciaId(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
        >
          {competencias.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
        </select>
      </div>

      {/* Meta da equipe */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target size={16} className="text-sky-400" />
            <h2 className="text-sm font-semibold text-white">Meta da Equipe</h2>
          </div>
          {!editandoMeta && (
            <button
              onClick={() => { setEditandoMeta(true); setNovoValorMeta(meta ? String(meta.valorAlvo) : ""); }}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Pencil size={12} /> {meta ? "Editar" : "Definir meta"}
            </button>
          )}
        </div>

        {editandoMeta ? (
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
              <input
                type="text"
                placeholder="0,00"
                value={novoValorMeta}
                onChange={(e) => setNovoValorMeta(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
                autoFocus
              />
            </div>
            <button
              onClick={salvarMeta}
              disabled={salvandoMeta}
              className="p-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/20 transition-colors"
            >
              <Check size={15} />
            </button>
            <button
              onClick={() => setEditandoMeta(false)}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        ) : meta ? (
          <p className="text-2xl font-bold text-white tabular-nums">{formatarMoeda(Number(meta.valorAlvo))}</p>
        ) : (
          <div className="flex items-center gap-2 text-amber-400">
            <AlertCircle size={15} />
            <p className="text-sm">Nenhuma meta definida para esta competência. Clique em "Definir meta" para configurar.</p>
          </div>
        )}
      </div>

      {/* Tabela de consultores */}
      {carregando ? (
        <div className="flex justify-center py-10">
          <div className="w-7 h-7 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-gr-400" />
              <h2 className="text-sm font-semibold text-white">Acompanhamento dos Consultores</h2>
            </div>
            <p className="text-xs text-slate-500">Recebido inclui valores "a parte"</p>
          </div>

          {consultores.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-slate-500 text-sm">Nenhum consultor ativo na equipe</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {consultores.map((c) => (
                <div key={c.id} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white font-medium text-sm">{c.nome}</p>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="text-[10px] text-slate-500">Recebido</p>
                        <p className="text-white text-sm font-semibold tabular-nums">{formatarMoeda(c.recebido)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500">% Meta</p>
                        <p className={`text-sm font-bold tabular-nums ${faixaCor(c.percentualMeta)}`}>{c.percentualMeta.toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500">Faixa</p>
                        <p className={`text-sm font-bold tabular-nums ${faixaCor(c.percentualMeta)}`}>{c.faixaAplicada}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500">Comissão</p>
                        <p className="text-emerald-400 text-sm font-bold tabular-nums">{formatarMoeda(c.valorFinal)}</p>
                      </div>
                    </div>
                  </div>
                  {meta && (
                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${faixaBarCor(c.percentualMeta)}`}
                        style={{ width: `${Math.min(c.percentualMeta, 160) / 160 * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Botão calcular */}
      <div className="flex items-center gap-3">
        <button
          onClick={calcular}
          disabled={calculando || !meta}
          className="flex items-center gap-2 bg-gr-500 hover:bg-gr-400 disabled:bg-gr-500/30 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
        >
          <Calculator size={15} />
          {calculando ? "Calculando..." : "Calcular e Registrar Comissões"}
        </button>
        {!meta && <p className="text-amber-400 text-xs">Defina uma meta antes de calcular</p>}
        {erroCalc && <p className="text-red-400 text-xs">{erroCalc}</p>}
        {sucesso && <p className="text-emerald-400 text-xs">Comissões registradas com sucesso!</p>}
      </div>

      {/* Tabela de faixas */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Tabela de Faixas</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-11 gap-2">
          {FAIXAS.map((f) => (
            <div key={f.meta} className="bg-slate-800 rounded-xl p-3 text-center">
              <p className="text-slate-400 text-[10px]">Meta</p>
              <p className="text-white font-bold text-xs">{f.meta}</p>
              <p className="text-slate-400 text-[10px] mt-1">Comis.</p>
              <p className={`font-bold text-xs ${f.cor}`}>{f.comissao}</p>
            </div>
          ))}
        </div>
        <p className="text-slate-600 text-xs mt-3">Abaixo de 100%: arredonda para baixo · Acima de 100%: arredonda se faltar até 2%</p>
      </div>

      {/* Histórico */}
      {historico.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-white">Últimas Comissões Registradas</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Consultor</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Base</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">% Meta</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Faixa</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Valor Final</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((c) => (
                <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-white">{(c as any).usuario?.nome ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{formatarMoeda(Number(c.valorBase))}</td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${faixaCor(Number(c.percentualMeta))}`}>{Number(c.percentualMeta).toFixed(1)}%</td>
                  <td className="px-4 py-3 text-right text-amber-400 tabular-nums">{Number(c.faixaAplicada).toFixed(0)}%</td>
                  <td className="px-4 py-3 text-right text-emerald-400 font-bold tabular-nums">{formatarMoeda(Number(c.valorFinal))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// CONSULTOR VIEW (somente acompanhamento)
// ─────────────────────────────────────────────────────────
function ConsultorComissao({ consultorId }: { consultorId: string }) {
  const [competencias, setCompetencias] = useState<any[]>([]);
  const [competenciaId, setCompetenciaId] = useState("");
  const [preview, setPreview] = useState<Consultor | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    fetch("/api/competencias").then((r) => r.json()).then((cs) => {
      setCompetencias(cs);
      if (cs[0]) setCompetenciaId(cs[0].id);
    });
  }, []);

  useEffect(() => {
    if (!competenciaId) return;
    setCarregando(true);
    fetch(`/api/comissao/preview?competenciaId=${competenciaId}`)
      .then((r) => r.json())
      .then((d) => {
        const item = Array.isArray(d) ? d.find((x: any) => x.id === consultorId) : null;
        setPreview(item ?? null);
        setCarregando(false);
      });
  }, [competenciaId, consultorId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Minha Comissão</h1>
          <p className="text-slate-400 text-sm mt-1">Acompanhe sua performance e estimativa de comissão</p>
        </div>
        <select
          value={competenciaId}
          onChange={(e) => setCompetenciaId(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
        >
          {competencias.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
        </select>
      </div>

      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !preview ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <DollarSign size={36} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400">Nenhuma meta configurada para esta competência</p>
          <p className="text-slate-600 text-sm mt-1">Aguarde seu gestor configurar a meta da equipe.</p>
        </div>
      ) : (
        <>
          {/* Cards de performance */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">Total Recebido</p>
              <p className="text-white text-xl font-bold tabular-nums">{formatarMoeda(preview.recebido)}</p>
              <p className="text-slate-500 text-[10px] mt-1">inclui valores a parte</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">% da Meta</p>
              <p className={`text-xl font-bold tabular-nums ${faixaCor(preview.percentualMeta)}`}>{preview.percentualMeta.toFixed(1)}%</p>
              <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2">
                <div className={`h-1.5 rounded-full ${faixaBarCor(preview.percentualMeta)}`} style={{ width: `${Math.min(preview.percentualMeta, 160) / 160 * 100}%` }} />
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">Faixa Aplicada</p>
              <p className={`text-xl font-bold tabular-nums ${faixaCor(preview.percentualMeta)}`}>{preview.faixaAplicada}%</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">Comissão Estimada</p>
              <p className="text-emerald-400 text-xl font-bold tabular-nums">{formatarMoeda(preview.valorFinal)}</p>
            </div>
          </div>

          {/* Próxima faixa */}
          {preview.percentualMeta < 160 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <p className="text-slate-400 text-xs">Próxima faixa</p>
              {preview.percentualMeta < 70 && <p className="text-white text-sm mt-1">Atinja <span className="text-amber-400 font-semibold">70%</span> da meta para começar a receber comissão</p>}
              {preview.percentualMeta >= 70 && preview.percentualMeta < 80 && <p className="text-white text-sm mt-1">Faltam <span className="text-amber-400 font-semibold">{(80 - preview.percentualMeta).toFixed(1)}%</span> para a faixa de 70% → avançar para comissão de <span className="text-emerald-400 font-semibold">70%</span></p>}
              {preview.percentualMeta >= 80 && preview.percentualMeta < 90 && <p className="text-white text-sm mt-1">Faltam <span className="text-amber-400 font-semibold">{(90 - preview.percentualMeta).toFixed(1)}%</span> para a faixa de 90% → comissão de <span className="text-emerald-400 font-semibold">80%</span></p>}
              {preview.percentualMeta >= 90 && preview.percentualMeta < 100 && <p className="text-white text-sm mt-1">Faltam <span className="text-amber-400 font-semibold">{(100 - preview.percentualMeta).toFixed(1)}%</span> para atingir 100% da meta → comissão de <span className="text-emerald-400 font-semibold">100%</span></p>}
              {preview.percentualMeta >= 100 && preview.percentualMeta < 160 && <p className="text-white text-sm mt-1">Continue! Cada 10% adicional aumenta sua comissão. Próxima faixa: <span className="text-emerald-400 font-semibold">{Math.ceil(preview.percentualMeta / 10) * 10}%</span></p>}
            </div>
          )}
        </>
      )}

      {/* Tabela de faixas */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Tabela de Faixas</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-11 gap-2">
          {FAIXAS.map((f) => {
            const pct = parseFloat(f.meta);
            const ativa = !isNaN(pct) && preview && Math.floor(preview.percentualMeta / 10) * 10 === pct;
            return (
              <div key={f.meta} className={`rounded-xl p-3 text-center border ${ativa ? "bg-gr-500/15 border-gr-500/40" : "bg-slate-800 border-transparent"}`}>
                <p className="text-slate-400 text-[10px]">Meta</p>
                <p className="text-white font-bold text-xs">{f.meta}</p>
                <p className="text-slate-400 text-[10px] mt-1">Comis.</p>
                <p className={`font-bold text-xs ${f.cor}`}>{f.comissao}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────

interface FrenteOpcao { equipeId: string; label: string }

const FRENTE_CHIP_STYLE: Record<string, string> = {
  "eq-flash":   "bg-sky-500/15 text-sky-300 border-sky-500/30",
  "eq-1-30":    "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "eq-31-90":   "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "eq-91-180":  "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "eq-181plus": "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export default function ComissaoPage() {
  const { data: session } = useSession();
  const [frentesGerenciadas, setFrentesGerenciadas] = useState<FrenteOpcao[]>([]);
  const [frenteSelecionada, setFrenteSelecionada] = useState<string>("");

  const perfil = (session?.user as any)?.perfil as string | undefined;
  const userId = (session?.user as any)?.id as string | undefined;

  useEffect(() => {
    if (!perfil || perfil === "CONSULTOR") return;
    fetch("/api/usuarios/frentes")
      .then((r) => r.json())
      .then((data: FrenteOpcao[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setFrentesGerenciadas(data);
          setFrenteSelecionada(data[0].equipeId);
        }
      })
      .catch(() => {});
  }, [perfil]);

  if (!perfil) return null;

  if (perfil === "CONSULTOR") {
    return <ConsultorComissao consultorId={userId ?? ""} />;
  }

  if (perfil === "GESTOR" || perfil === "ADMINISTRADOR") {
    return (
      <div className="space-y-6">
        {/* Seletor de frente — só frentes que o gestor gerencia */}
        {frentesGerenciadas.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 font-medium mr-1">Frente:</span>
            {frentesGerenciadas.map((f) => {
              const ativo = frenteSelecionada === f.equipeId;
              const style = FRENTE_CHIP_STYLE[f.equipeId] ?? "bg-slate-700 text-slate-300 border-slate-600";
              return (
                <button
                  key={f.equipeId}
                  onClick={() => setFrenteSelecionada(f.equipeId)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    ativo ? style : "bg-slate-800/50 text-slate-500 border-slate-700 hover:text-slate-300"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        )}

        {frenteSelecionada
          ? <GestorComissao key={frenteSelecionada} equipeId={frenteSelecionada} />
          : (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )
        }
      </div>
    );
  }

  return null;
}
