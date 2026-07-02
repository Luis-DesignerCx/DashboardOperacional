"use client";

import { useEffect, useState } from "react";
import { useFrente } from "@/contexts/FrenteContext";
import { formatarMoeda } from "@/lib/utils";
import { ChevronDown, ChevronRight, Search, AlertCircle, TrendingUp, Palmtree } from "lucide-react";

const FAIXA_LABEL: Record<string, string> = {
  FLASH:          "Flash",
  CRA_1_30:       "1 a 30 dias",
  CR_31_90:       "31 a 90 dias",
  CR_PDD_91_180:  "91 a 180 dias",
  CR_PDD_181:     "181+ dias",
};

const FAIXA_COR: Record<string, string> = {
  FLASH:          "text-amber-400 bg-amber-500/10 border-amber-500/20",
  CRA_1_30:       "text-sky-400 bg-sky-500/10 border-sky-500/20",
  CR_31_90:       "text-blue-400 bg-blue-500/10 border-blue-500/20",
  CR_PDD_91_180:  "text-orange-400 bg-orange-500/10 border-orange-500/20",
  CR_PDD_181:     "text-red-400 bg-red-500/10 border-red-500/20",
};

const TIPO_ORDEM = ["FLASH", "CRA_1_30", "CR_31_90", "CR_PDD_91_180", "CR_PDD_181"];

interface EquipeUsuario {
  id: string;
  perfil: string;
}

interface Equipe {
  id: string;
  nome: string;
  tipo: string;
  usuarios: EquipeUsuario[];
}

interface PorEmpresa {
  id: string;
  nome: string;
  inadimplencia: number;
  recebido: number;
  recebidoAParte: number;
}

interface Consultor {
  id: string;
  nome: string;
  emFerias: boolean;
  totalContratos: number;
  inadimplencia: number;
  recebido: number;
  recebidoAParte: number;
  percentual: number;
  porEmpresa: PorEmpresa[];
}

export default function GestaoPage() {
  const { equipeId: filtroFrente, setEquipeId: setFiltroFrente } = useFrente();
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [equipeId, setEquipeId] = useState<string>("");
  const [competencias, setCompetencias] = useState<any[]>([]);
  const [competenciaId, setCompetenciaId] = useState("");
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  // Carrega equipes e competências em paralelo
  useEffect(() => {
    Promise.all([
      fetch("/api/equipes").then((r) => r.json()),
      fetch("/api/competencias").then((r) => r.json()),
    ]).then(([eq, cs]) => {
      const equipesOrdenadas = (Array.isArray(eq) ? eq : []).sort(
        (a: Equipe, b: Equipe) => TIPO_ORDEM.indexOf(a.tipo) - TIPO_ORDEM.indexOf(b.tipo)
      );
      setEquipes(equipesOrdenadas);
      const primeiraComConsultores = equipesOrdenadas.find(
        (e) => e.usuarios.some((u: EquipeUsuario) => u.perfil === "CONSULTOR")
      ) ?? equipesOrdenadas[0];
      // Usa o filtro global se estiver ativo, senão pega a primeira com consultores
      const inicial = filtroFrente
        ? (equipesOrdenadas.find((e) => e.id === filtroFrente) ?? primeiraComConsultores)
        : primeiraComConsultores;
      if (inicial) setEquipeId(inicial.id);

      if (Array.isArray(cs) && cs.length > 0) setCompetencias(cs);
      if (cs[0]) setCompetenciaId(cs[0].id);
    });
  }, []);

  // Sincroniza tab com filtro global
  useEffect(() => {
    if (filtroFrente && equipes.length > 0) setEquipeId(filtroFrente);
  }, [filtroFrente, equipes.length]);

  // Carrega consultores quando equipe ou competência muda
  useEffect(() => {
    if (!equipeId || !competenciaId) return;
    setCarregando(true);
    setExpandidos(new Set());
    fetch(`/api/gestao/${equipeId}?competenciaId=${competenciaId}`)
      .then((r) => r.json())
      .then((data) => { setConsultores(Array.isArray(data) ? data : []); setCarregando(false); });
  }, [equipeId, competenciaId]);

  function toggleExpandir(id: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const equipeSelecionada = equipes.find((e) => e.id === equipeId);
  const filtrados = consultores.filter((c) =>
    c.nome.toLowerCase().includes(busca.toLowerCase())
  );

  const totalInadimplencia = filtrados.reduce((s, c) => s + c.inadimplencia, 0);
  const totalRecebido = filtrados.reduce((s, c) => s + c.recebido, 0);
  const totalAParte = filtrados.reduce((s, c) => s + c.recebidoAParte, 0);

  return (
    <div className="flex gap-0 h-[calc(100vh-4rem)] -m-6 overflow-hidden">
      {/* ── Painel esquerdo: Frentes ── */}
      <aside className="w-52 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Frentes</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {equipes.map((eq) => {
            const ativo = eq.id === equipeId;
            const cor = FAIXA_COR[eq.tipo] ?? "text-slate-400 bg-slate-800 border-slate-700";
            const qtd = eq.usuarios.filter((u: EquipeUsuario) => u.perfil === "CONSULTOR").length;
            return (
              <button
                key={eq.id}
                onClick={() => setEquipeId(eq.id)}
                className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  ativo
                    ? "bg-gr-500/15 text-white border border-gr-500/20 font-medium"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold flex-shrink-0 ${cor}`}>
                  {FAIXA_LABEL[eq.tipo]?.split(" ")[0] ?? "?"}
                </span>
                <span className="truncate flex-1">{FAIXA_LABEL[eq.tipo] ?? eq.nome}</span>
                {qtd > 0 && (
                  <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    {qtd}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Painel direito: Conteúdo ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold text-white">
              {equipeSelecionada ? (FAIXA_LABEL[equipeSelecionada.tipo] ?? equipeSelecionada.nome) : "Gestão de Carteiras"}
            </h1>
            {!carregando && (
              <p className="text-slate-500 text-xs mt-0.5">
                {filtrados.length} consultor{filtrados.length !== 1 ? "es" : ""} · {formatarMoeda(totalInadimplencia)} em carteira
              </p>
            )}
          </div>
          <select
            value={competenciaId}
            onChange={(e) => setCompetenciaId(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500"
          >
            {competencias.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
          </select>
        </div>

        {/* Totais */}
        {!carregando && filtrados.length > 0 && (
          <div className="grid grid-cols-3 gap-3 px-6 py-3 border-b border-slate-800 flex-shrink-0">
            <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
              <p className="text-xs text-slate-500">Inadimplência total</p>
              <p className="text-lg font-bold text-white mt-0.5">{formatarMoeda(totalInadimplencia)}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
              <p className="text-xs text-slate-500">Total recebido</p>
              <p className="text-lg font-bold text-emerald-400 mt-0.5">{formatarMoeda(totalRecebido)}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
              <p className="text-xs text-slate-500">Total a parte</p>
              <p className="text-lg font-bold text-sky-400 mt-0.5">{formatarMoeda(totalAParte)}</p>
            </div>
          </div>
        )}

        {/* Busca */}
        <div className="px-6 py-3 border-b border-slate-800 flex-shrink-0">
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar consultor..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gr-500"
            />
          </div>
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-y-auto">
          {carregando ? (
            <div className="flex justify-center items-center h-48">
              <div className="w-7 h-7 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <AlertCircle size={28} className="text-slate-600 mb-2" />
              <p className="text-slate-500 text-sm">Nenhum consultor com carteira nesta frente</p>
            </div>
          ) : (
            <>
              {/* Cabeçalho da tabela */}
              <div className="grid grid-cols-[1fr_100px_160px_160px_160px_80px] gap-2 px-6 py-2.5 border-b border-slate-800 bg-slate-900/30">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Consultor</span>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Contratos</span>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Inadimplência</span>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Recebido</span>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">A Parte</span>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">%</span>
              </div>

              <div className="divide-y divide-slate-800/60">
                {filtrados.map((c) => {
                  const expandido = expandidos.has(c.id);
                  return (
                    <div key={c.id}>
                      {/* Linha do consultor */}
                      <button
                        onClick={() => toggleExpandir(c.id)}
                        className="w-full grid grid-cols-[1fr_100px_160px_160px_160px_80px] gap-2 px-6 py-3.5 hover:bg-slate-800/30 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2.5">
                          {expandido
                            ? <ChevronDown size={15} className="text-gr-400 flex-shrink-0" />
                            : <ChevronRight size={15} className="text-slate-600 flex-shrink-0" />
                          }
                          <span className="text-white font-medium text-sm">{c.nome}</span>
                          {c.emFerias && (
                            <span className="flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                              <Palmtree size={9} /> Férias
                            </span>
                          )}
                        </div>
                        <span className="text-slate-400 text-sm tabular-nums text-right self-center">{c.totalContratos}</span>
                        <span className="text-white text-sm tabular-nums font-medium text-right self-center">{formatarMoeda(c.inadimplencia)}</span>
                        <span className="text-emerald-400 text-sm tabular-nums font-semibold text-right self-center">{formatarMoeda(c.recebido)}</span>
                        <span className="text-sky-400 text-sm tabular-nums text-right self-center">
                          {c.recebidoAParte > 0 ? formatarMoeda(c.recebidoAParte) : <span className="text-slate-600">—</span>}
                        </span>
                        <div className="text-right self-center">
                          <span className={`text-sm font-bold tabular-nums ${
                            c.percentual >= 80 ? "text-emerald-400" : c.percentual >= 40 ? "text-gr-400" : "text-slate-400"
                          }`}>
                            {c.percentual.toFixed(1)}%
                          </span>
                        </div>
                      </button>

                      {/* Expansão: por empresa */}
                      {expandido && (
                        <div className="bg-slate-900/60 border-t border-slate-800/50">
                          <div className="grid grid-cols-[1fr_160px_160px_160px] gap-2 px-14 py-2 border-b border-slate-800/30">
                            <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">Empresa</span>
                            <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider text-right">Inadimplência</span>
                            <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider text-right">Recebido</span>
                            <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider text-right">A Parte</span>
                          </div>
                          {c.porEmpresa.map((emp) => (
                            <div
                              key={emp.id}
                              className="grid grid-cols-[1fr_160px_160px_160px] gap-2 px-14 py-2.5 border-b border-slate-800/20 last:border-0 hover:bg-slate-800/20"
                            >
                              <span className="text-slate-300 text-sm">{emp.nome}</span>
                              <span className="text-slate-400 text-sm tabular-nums text-right">{formatarMoeda(emp.inadimplencia)}</span>
                              <span className={`text-sm tabular-nums font-medium text-right ${emp.recebido > 0 ? "text-emerald-400" : "text-slate-600"}`}>
                                {emp.recebido > 0 ? formatarMoeda(emp.recebido) : "—"}
                              </span>
                              <span className={`text-sm tabular-nums text-right ${emp.recebidoAParte > 0 ? "text-sky-400" : "text-slate-600"}`}>
                                {emp.recebidoAParte > 0 ? formatarMoeda(emp.recebidoAParte) : "—"}
                              </span>
                            </div>
                          ))}

                          {/* Subtotal do consultor */}
                          <div className="grid grid-cols-[1fr_160px_160px_160px] gap-2 px-14 py-2.5 border-t border-slate-700/40 bg-slate-800/20">
                            <span className="text-xs text-slate-500 font-semibold">TOTAL</span>
                            <span className="text-xs text-white tabular-nums font-semibold text-right">{formatarMoeda(c.inadimplencia)}</span>
                            <span className="text-xs text-emerald-400 tabular-nums font-semibold text-right">{formatarMoeda(c.recebido)}</span>
                            <span className="text-xs text-sky-400 tabular-nums font-semibold text-right">
                              {c.recebidoAParte > 0 ? formatarMoeda(c.recebidoAParte) : "—"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
