"use client";

import { Fragment, useEffect, useState, useCallback, useMemo } from "react";
import { useFrente } from "@/contexts/FrenteContext";
import { formatarMoeda, cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Building2 } from "lucide-react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { corBadgeRecuperado, corBadgeMeta, pctRecuperado, pctMeta } from "@/components/charts/MatrizPerformance";
import { corBadgeRecuperacao } from "@/components/charts/SaudeEmpreendimentos";

// ── Frentes visíveis no sidebar ──────────────────────────────────────────────
// CR_PDD_181 não aparece como frente separada; é sub-faixa de PDD 91+
const FRENTES_VISIVEIS = ["FLASH", "CRA_1_30", "CR_31_90", "CR_PDD_91_180"];

const FAIXA_LABEL: Record<string, string> = {
  FLASH:         "Flash",
  CRA_1_30:      "1 a 30 dias",
  CR_31_90:      "31 a 90 dias",
  CR_PDD_91_180: "PDD 91+",
};

const FAIXA_COR: Record<string, string> = {
  FLASH:         "text-amber-400 bg-amber-500/10 border-amber-500/20",
  CRA_1_30:      "text-sky-400 bg-sky-500/10 border-sky-500/20",
  CR_31_90:      "text-blue-400 bg-blue-500/10 border-blue-500/20",
  CR_PDD_91_180: "text-orange-400 bg-orange-500/10 border-orange-500/20",
};

const TIPO_ORDEM = ["FLASH", "CRA_1_30", "CR_31_90", "CR_PDD_91_180"];

// Sub-faixas por tipo de frente
const SUB_FAIXAS_MAP: Record<string, Array<{ label: string; diasMin?: number; diasMax?: number }>> = {
  CR_31_90: [
    // "Todos 31-90" == a frente inteira, sem recorte -- não pode reaplicar
    // maiorDiasAtraso 31-90 aqui: esse campo é AO VIVO e só cresce, então um
    // contrato distribuído a esta frente (tipoEquipe CONGELADO) que passa dos
    // 90 dias ainda na mesma competência sumia da tela mesmo continuando
    // corretamente contado no Dashboard/demais telas (achado real, Jair
    // Matias, 2026-09-24: 33 contratos / R$ 6.249,18 escondidos).
    { label: "Todos 31-90" },
    { label: "31–60 dias",  diasMin: 31, diasMax: 60 },
    { label: "61–90 dias",  diasMin: 61, diasMax: 90 },
  ],
  CR_PDD_91_180: [
    { label: "Todos 91+",    diasMin: 91,  diasMax: undefined },
    { label: "91–120 dias",  diasMin: 91,  diasMax: 120 },
    { label: "121–150 dias", diasMin: 121, diasMax: 150 },
    { label: "151–180 dias", diasMin: 151, diasMax: 180 },
    { label: "181+ dias",    diasMin: 181, diasMax: undefined },
  ],
};

// Cor dos botões de sub-faixa por tipo
const SUB_FAIXA_COR: Record<string, string> = {
  CR_31_90:      "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  CR_PDD_91_180: "bg-orange-500/20 text-orange-300 border border-orange-500/30",
  FLASH:         "bg-amber-500/20 text-amber-300 border border-amber-500/30",
};

// Base de vencimento Flash (05/10/15/20/25) -- mesmo filtro que o consultor
// Flash já tem em Minha Carteira, agora também pro gestor/admin.
const BASES_VENCIMENTO_FLASH = [5, 10, 15, 20, 25];

interface EquipeUsuario { id: string; perfil: string; }
interface Equipe { id: string; nome: string; tipo: string; usuarios: EquipeUsuario[]; }
interface PorEmpresa { id: string; nome: string; contratos: number; inadimplencia: number; recebido: number; recebidoAParte: number; contratosRecebidos: number; }
interface Consultor {
  id: string; nome: string; emFerias: boolean;
  totalContratos: number; inadimplencia: number; recebido: number;
  recebidoAParte: number; contratosRecebidos: number; metaAlvo: number | null; percentual: number; porEmpresa: PorEmpresa[];
  frenteId?: string; frenteLabel?: string; // presentes quando 2+ frentes estão selecionadas
}
interface ConsultorNoEmpreendimento {
  id: string; nome: string; contratos: number; inadimplencia: number; recebido: number; recebidoAParte: number;
  contratosRecebidos: number; metaAlvo: number | null; frenteId?: string;
}
interface Empreendimento {
  id: string; nome: string;
  contratos: number; inadimplencia: number; recebido: number; recebidoAParte: number; contratosRecebidos: number; percentual: number;
  consultores: ConsultorNoEmpreendimento[];
}

export default function GestaoPage() {
  const { equipeIds: filtroFrentes } = useFrente();
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [equipeIds, setEquipeIds] = useState<string[]>([]);
  const [competencias, setCompetencias] = useState<any[]>([]);
  const [competenciaId, setCompetenciaId] = useState("");
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [expandidosEmpreend, setExpandidosEmpreend] = useState<Set<string>>(new Set());
  // Sub-faixa de dias e base de vencimento Flash agora são POR FRENTE (chave =
  // equipeId) -- várias frentes podem estar selecionadas ao mesmo tempo, cada
  // uma com seu próprio recorte independente. Array vazio/ausente = "Todos".
  const [subFaixasPorFrente, setSubFaixasPorFrente] = usePersistedState<Record<string, number[]>>("subFaixasPorFrente", {});
  const [baseVencPorFrente, setBaseVencPorFrente] = usePersistedState<Record<string, number[]>>("baseVencPorFrente", {});

  function toggleEquipeId(id: string) {
    setEquipeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSubFaixa(alvoId: string, indice: number) {
    setSubFaixasPorFrente((prev) => {
      // índice 0 é sempre "Todos X" (a frente inteira, sem recorte) -- marcá-lo
      // limpa o array em vez de entrar nele, senão ele se somaria às outras
      // sub-faixas e duplicaria consultor/contrato (é superconjunto das
      // demais, não uma faixa independente que possa concatenar com elas).
      if (indice === 0) return { ...prev, [alvoId]: [] };
      const atual = prev[alvoId] ?? [];
      const novo = atual.includes(indice) ? atual.filter((i) => i !== indice) : [...atual, indice];
      return { ...prev, [alvoId]: novo };
    });
  }

  function toggleBaseVenc(alvoId: string, dia: number | null) {
    setBaseVencPorFrente((prev) => {
      if (dia === null) return { ...prev, [alvoId]: [] }; // "Todos"
      const atual = prev[alvoId] ?? [];
      const novo = atual.includes(dia) ? atual.filter((d) => d !== dia) : [...atual, dia];
      return { ...prev, [alvoId]: novo };
    });
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/equipes").then((r) => r.json()),
      fetch("/api/competencias").then((r) => r.json()),
    ]).then(([eq, cs]) => {
      const ordenadas = (Array.isArray(eq) ? eq : []).sort(
        (a: Equipe, b: Equipe) => TIPO_ORDEM.indexOf(a.tipo) - TIPO_ORDEM.indexOf(b.tipo)
      );
      setEquipes(ordenadas);
      const visiveis = ordenadas.filter((e: Equipe) => FRENTES_VISIVEIS.includes(e.tipo));
      const doFiltroGlobal = visiveis.filter((e: Equipe) => filtroFrentes.includes(e.id));
      const inicial = doFiltroGlobal.length > 0
        ? doFiltroGlobal.map((e) => e.id)
        : (visiveis[0] ? [visiveis[0].id] : []);
      setEquipeIds(inicial);
      if (Array.isArray(cs) && cs.length > 0) {
        setCompetencias(cs);
        setCompetenciaId(cs[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (filtroFrentes.length > 0 && equipes.length > 0) {
      const validos = equipes
        .filter((e) => FRENTES_VISIVEIS.includes(e.tipo) && filtroFrentes.includes(e.id))
        .map((e) => e.id);
      if (validos.length > 0) setEquipeIds(validos);
    }
  }, [filtroFrentes, equipes.length]);

  const carregarConsultores = useCallback(() => {
    if (equipeIds.length === 0 || !competenciaId) {
      setConsultores([]);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setExpandidosEmpreend(new Set());

    // 1 fetch por frente selecionada; dentro de cada frente, 1 fetch POR
    // sub-faixa/base-de-vencimento marcada (a API só aceita 1 par diasMin/
    // diasMax ou 1 baseVencimento por chamada) -- concatena os resultados da
    // mesma frente entre si, depois anexa frenteId/frenteLabel e junta tudo.
    const porFrente = equipeIds.map((id) => {
      const equipe = equipes.find((e) => e.id === id);
      const tipo = equipe?.tipo ?? "";
      const label = equipe ? (FAIXA_LABEL[tipo] ?? equipe.nome) : id;

      let sufixos: string[] = [""]; // "" = sem filtro extra ("Todos")
      const subFaixasDoTipo = SUB_FAIXAS_MAP[tipo];
      if (subFaixasDoTipo) {
        const indices = subFaixasPorFrente[id] ?? [];
        if (indices.length > 0) {
          sufixos = indices.map((i) => {
            const sf = subFaixasDoTipo[i];
            let s = "";
            if (sf?.diasMin !== undefined) s += `&diasMin=${sf.diasMin}`;
            if (sf?.diasMax !== undefined) s += `&diasMax=${sf.diasMax}`;
            return s;
          });
        }
      } else if (tipo === "FLASH") {
        const bases = baseVencPorFrente[id] ?? [];
        if (bases.length > 0) sufixos = bases.map((dia) => `&baseVencimento=${dia}`);
      }

      return Promise.all(
        sufixos.map((sufixo) =>
          fetch(`/api/gestao/${id}?competenciaId=${competenciaId}${sufixo}`).then((r) => r.json())
        )
      ).then((resultados) => {
        const consolidados: Consultor[] = resultados.flatMap((data) => (Array.isArray(data) ? data : []));
        return consolidados.map((c) => ({ ...c, frenteId: id, frenteLabel: label }));
      });
    });

    Promise.all(porFrente).then((resultadosPorFrente) => {
      setConsultores(resultadosPorFrente.flat());
      setCarregando(false);
    });
  }, [equipeIds, competenciaId, equipes, subFaixasPorFrente, baseVencPorFrente]);

  useEffect(() => { carregarConsultores(); }, [carregarConsultores]);

  function toggleExpandirEmpreend(id: string) {
    setExpandidosEmpreend((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Agregado por empreendimento -- sempre da frente inteira (não some com a
  // busca de consultor, que serve só pra tabela de baixo).
  const porEmpreendimento: Empreendimento[] = useMemo(() => {
    const mapa = new Map<string, { nome: string; contratos: number; inadimplencia: number; recebido: number; recebidoAParte: number; contratosRecebidos: number; consultores: ConsultorNoEmpreendimento[] }>();
    for (const c of consultores) {
      for (const emp of c.porEmpresa) {
        if (!mapa.has(emp.id)) {
          mapa.set(emp.id, { nome: emp.nome, contratos: 0, inadimplencia: 0, recebido: 0, recebidoAParte: 0, contratosRecebidos: 0, consultores: [] });
        }
        const reg = mapa.get(emp.id)!;
        reg.contratos += emp.contratos;
        reg.inadimplencia += emp.inadimplencia;
        reg.recebido += emp.recebido;
        reg.recebidoAParte += emp.recebidoAParte;
        reg.contratosRecebidos += emp.contratosRecebidos;
        reg.consultores.push({
          id: c.id, nome: c.nome, contratos: emp.contratos, inadimplencia: emp.inadimplencia,
          recebido: emp.recebido, recebidoAParte: emp.recebidoAParte, contratosRecebidos: emp.contratosRecebidos,
          metaAlvo: c.metaAlvo, frenteId: c.frenteId,
        });
      }
    }
    return Array.from(mapa.entries())
      .map(([id, v]) => ({
        id,
        nome: v.nome,
        contratos: v.contratos,
        inadimplencia: v.inadimplencia,
        recebido: v.recebido,
        recebidoAParte: v.recebidoAParte,
        contratosRecebidos: v.contratosRecebidos,
        percentual: v.inadimplencia > 0 ? Math.min((v.recebido / v.inadimplencia) * 100, 100) : 0,
        consultores: v.consultores.sort((a, b) => b.recebido - a.recebido),
      }))
      .sort((a, b) => b.inadimplencia - a.inadimplencia);
  }, [consultores]);

  const totalPorEmpreendimento = useMemo(() => porEmpreendimento.reduce(
    (acc, e) => ({
      contratos: acc.contratos + e.contratos,
      inadimplencia: acc.inadimplencia + e.inadimplencia,
      recebido: acc.recebido + e.recebido,
      recebidoAParte: acc.recebidoAParte + e.recebidoAParte,
      contratosRecebidos: acc.contratosRecebidos + e.contratosRecebidos,
    }),
    { contratos: 0, inadimplencia: 0, recebido: 0, recebidoAParte: 0, contratosRecebidos: 0 }
  ), [porEmpreendimento]);

  const visiveis = equipes.filter((e) => FRENTES_VISIVEIS.includes(e.tipo));
  const equipesSelecionadas = visiveis.filter((e) => equipeIds.includes(e.id));
  const equipesComSubFaixa = equipesSelecionadas.filter((e) => SUB_FAIXAS_MAP[e.tipo]);
  const equipesFlash = equipesSelecionadas.filter((e) => e.tipo === "FLASH");

  const totalInad = consultores.reduce((s, c) => s + c.inadimplencia, 0);
  const totalRec  = consultores.reduce((s, c) => s + c.recebido, 0);
  const totalAP   = consultores.reduce((s, c) => s + c.recebidoAParte, 0);

  return (
    <div className="flex gap-0 h-[calc(100vh-4rem)] -m-6 overflow-hidden">
      {/* ── Sidebar: Frentes ── */}
      <aside className="w-52 flex-shrink-0 border-r border-white/[0.06] bg-surface-0/50 flex flex-col">
        <div className="p-4 border-b border-white/[0.06]">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Frentes</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {visiveis.map((eq) => {
            const ativo = equipeIds.includes(eq.id);
            const cor = FAIXA_COR[eq.tipo] ?? "text-slate-400 bg-surface-1 border-white/[0.08]";
            const qtd = eq.usuarios.filter((u) => u.perfil === "CONSULTOR").length;
            return (
              <button
                key={eq.id}
                onClick={() => toggleEquipeId(eq.id)}
                className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  ativo
                    ? "bg-gr-500/15 text-white border border-gr-500/20 font-medium"
                    : "text-slate-400 hover:text-white hover:bg-white/[0.03]"
                }`}
              >
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold flex-shrink-0 ${cor}`}>
                  {FAIXA_LABEL[eq.tipo]?.split(" ")[0] ?? "?"}
                </span>
                <span className="truncate flex-1">{FAIXA_LABEL[eq.tipo] ?? eq.nome}</span>
                {qtd > 0 && (
                  <span className="text-[10px] bg-white/[0.07] text-slate-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    {qtd}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Painel principal ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold text-white">
              {equipesSelecionadas.length === 0
                ? "Gestão de Carteiras"
                : equipesSelecionadas.length === 1
                ? (FAIXA_LABEL[equipesSelecionadas[0].tipo] ?? equipesSelecionadas[0].nome)
                : equipesSelecionadas.map((e) => FAIXA_LABEL[e.tipo] ?? e.nome).join(" · ")}
            </h1>
            {!carregando && (
              <p className="text-slate-500 text-xs mt-0.5">
                {consultores.length} consultor{consultores.length !== 1 ? "es" : ""} · {formatarMoeda(totalInad)} em carteira
              </p>
            )}
          </div>
          <select
            value={competenciaId}
            onChange={(e) => setCompetenciaId(e.target.value)}
            className="bg-surface-1 border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gr-500/50 focus:border-gr-500/40"
          >
            {competencias.map((c) => <option key={c.id} value={c.id}>{c.descricao}</option>)}
          </select>
        </div>

        {/* Sub-faixas (CR 31-90 e PDD 91+) -- 1 bloco por frente selecionada
            desse tipo, cada uma com seu próprio recorte independente. */}
        {equipesComSubFaixa.map((eq) => {
          const subFaixas = SUB_FAIXAS_MAP[eq.tipo]!;
          const selecionados = subFaixasPorFrente[eq.id] ?? [];
          const cor = SUB_FAIXA_COR[eq.tipo] ?? "bg-gr-500/20 text-gr-300 border border-gr-500/30";
          return (
            <div key={eq.id} className="flex items-center gap-2 px-6 pt-3 pb-0 flex-shrink-0 flex-wrap">
              {equipesComSubFaixa.length > 1 && (
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold flex-shrink-0">
                  {FAIXA_LABEL[eq.tipo] ?? eq.nome}
                </span>
              )}
              <div className="flex gap-1 flex-wrap">
                {subFaixas.map((sf, i) => {
                  const ativo = i === 0 ? selecionados.length === 0 : selecionados.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleSubFaixa(eq.id, i)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        ativo ? cor : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]"
                      }`}
                    >
                      {sf.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Base de vencimento (Flash) -- 1 bloco por frente Flash selecionada
            (na prática só existe 1 no sistema, mas trata genericamente). */}
        {equipesFlash.map((eq) => {
          const selecionados = baseVencPorFrente[eq.id] ?? [];
          return (
            <div key={eq.id} className="flex items-center gap-2 px-6 pt-3 pb-0 flex-shrink-0 flex-wrap">
              {equipesFlash.length > 1 && (
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold flex-shrink-0">
                  {FAIXA_LABEL[eq.tipo] ?? eq.nome}
                </span>
              )}
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => toggleBaseVenc(eq.id, null)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    selecionados.length === 0
                      ? SUB_FAIXA_COR.FLASH
                      : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]"
                  }`}
                >
                  Todos
                </button>
                {BASES_VENCIMENTO_FLASH.map((dia) => (
                  <button
                    key={dia}
                    onClick={() => toggleBaseVenc(eq.id, dia)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      selecionados.includes(dia)
                        ? SUB_FAIXA_COR.FLASH
                        : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]"
                    }`}
                  >
                    Dia {String(dia).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {/* Cards de totais */}
        {!carregando && consultores.length > 0 && (
          <div className="grid grid-cols-3 gap-3 px-6 py-3 border-b border-white/[0.06] flex-shrink-0">
            <div className="bg-surface-2 border border-white/[0.06] rounded-xl px-4 py-3">
              <p className="text-xs text-slate-500">Inadimplência total</p>
              <p className="text-lg font-bold text-white mt-0.5">{formatarMoeda(totalInad)}</p>
            </div>
            <div className="bg-surface-2 border border-white/[0.06] rounded-xl px-4 py-3">
              <p className="text-xs text-slate-500">Total recebido</p>
              <p className="text-lg font-bold text-emerald-400 mt-0.5">{formatarMoeda(totalRec)}</p>
            </div>
            <div className="bg-surface-2 border border-white/[0.06] rounded-xl px-4 py-3">
              <p className="text-xs text-slate-500">Parcela Mês</p>
              <p className="text-lg font-bold text-sky-400 mt-0.5">{formatarMoeda(totalAP)}</p>
            </div>
          </div>
        )}

        {/* A partir daqui, tudo rola junto num bloco só -- Por Empreendimento
            pode crescer bastante (vários empreendimentos, linhas expandidas)
            e antes disso "empurrava" a tabela de consultor pra fora da tela
            sem nenhum jeito de rolar até ela (cada bloco fixo demais, sem
            sobra de espaço pro flex-1 da tabela). */}
        <div className="flex-1 overflow-y-auto">

        {/* Por Empreendimento -- única visão da tela agora (removida a tabela
            "Por Consultor" solta que existia abaixo: mesma informação, já
            repetida aqui dentro de cada empreendimento ao expandir). Mesmo
            desenho de tabela + linha de Total do dash principal
            (MatrizPerformance/SaudeEmpreendimentos) -- pedido do Luis,
            2026-09-25. */}
        {!carregando && porEmpreendimento.length > 0 && (
          <div className="px-6 pt-3 pb-6">
            <div className="bg-surface-2 border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={14} className="text-slate-500" />
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Performance por Empreendimento</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-slate-600 uppercase tracking-wider border-b border-white/[0.05]">
                      <th className="text-left px-2 pb-2.5 font-semibold whitespace-nowrap">Empreendimento</th>
                      <th className="text-right px-2 pb-2.5 font-semibold whitespace-nowrap">Total Inadimplente</th>
                      <th className="text-center px-2 pb-2.5 font-semibold whitespace-nowrap">Contr. Inadimplente</th>
                      <th className="text-right px-2 pb-2.5 font-semibold whitespace-nowrap">Recebido Inadimplente</th>
                      <th className="text-right px-2 pb-2.5 font-semibold whitespace-nowrap">Parcela Mês</th>
                      <th className="text-center px-2 pb-2.5 font-semibold whitespace-nowrap">Contr. Recebidos</th>
                      <th className="text-right px-2 pb-2.5 font-semibold whitespace-nowrap">% Recuperação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {porEmpreendimento.map((emp) => {
                      const aberto = expandidosEmpreend.has(emp.id);
                      return (
                        <Fragment key={emp.id}>
                          <tr
                            className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                            onClick={() => toggleExpandirEmpreend(emp.id)}
                          >
                            <td className="py-2.5 px-2 text-left text-slate-200 font-bold">
                              <div className="flex items-center gap-2">
                                {aberto
                                  ? <ChevronDown size={14} className="text-gr-400 flex-shrink-0" />
                                  : <ChevronRight size={14} className="text-slate-500 flex-shrink-0" />}
                                {emp.nome}
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-right text-slate-400 tabular-nums whitespace-nowrap">{formatarMoeda(emp.inadimplencia)}</td>
                            <td className="py-2.5 px-2 text-center text-slate-500 tabular-nums">{emp.contratos}</td>
                            <td className="py-2.5 px-2 text-right text-slate-200 font-semibold tabular-nums whitespace-nowrap">{formatarMoeda(emp.recebido)}</td>
                            <td className="py-2.5 px-2 text-right text-slate-400 tabular-nums whitespace-nowrap">{formatarMoeda(emp.recebidoAParte)}</td>
                            <td className="py-2.5 px-2 text-center text-slate-500 tabular-nums">{emp.contratosRecebidos}</td>
                            <td className="py-2.5 px-2 text-right">
                              <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums", corBadgeRecuperacao(emp.percentual))}>
                                {emp.percentual.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                          {aberto && (
                            <tr>
                              <td colSpan={7} className="p-0">
                                <div className="bg-surface-0/60 px-4 py-3">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-[10px] text-slate-600 uppercase tracking-wider border-b border-white/[0.05]">
                                        <th className="text-left px-2 pb-2 font-semibold whitespace-nowrap">Consultor</th>
                                        <th className="text-right px-2 pb-2 font-semibold whitespace-nowrap">Total Inadimplente</th>
                                        <th className="text-center px-2 pb-2 font-semibold whitespace-nowrap">Contr. Inadimplente</th>
                                        <th className="text-right px-2 pb-2 font-semibold whitespace-nowrap">Recebido Inadimplente</th>
                                        <th className="text-right px-2 pb-2 font-semibold whitespace-nowrap">Parcela Mês</th>
                                        <th className="text-center px-2 pb-2 font-semibold whitespace-nowrap">Contr. Recebidos</th>
                                        <th className="text-right px-2 pb-2 font-semibold whitespace-nowrap">% Recuperação</th>
                                        <th className="text-right px-2 pb-2 font-semibold whitespace-nowrap">% da Meta</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.03]">
                                      {emp.consultores.map((cons) => {
                                        const pctRec = pctRecuperado(cons.inadimplencia, cons.recebido);
                                        const pctM = pctMeta(cons.metaAlvo, cons.recebido, cons.recebidoAParte);
                                        return (
                                          <tr key={`${cons.frenteId ?? ""}-${cons.id}`} className="hover:bg-white/[0.02]">
                                            <td className="py-2 px-2 text-left text-slate-300">{cons.nome}</td>
                                            <td className="py-2 px-2 text-right text-slate-400 tabular-nums whitespace-nowrap">{formatarMoeda(cons.inadimplencia)}</td>
                                            <td className="py-2 px-2 text-center text-slate-500 tabular-nums">{cons.contratos}</td>
                                            <td className="py-2 px-2 text-right text-slate-200 font-medium tabular-nums whitespace-nowrap">{formatarMoeda(cons.recebido)}</td>
                                            <td className="py-2 px-2 text-right text-slate-400 tabular-nums whitespace-nowrap">{formatarMoeda(cons.recebidoAParte)}</td>
                                            <td className="py-2 px-2 text-center text-slate-500 tabular-nums">{cons.contratosRecebidos}</td>
                                            <td className="py-2 px-2 text-right">
                                              <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums", corBadgeRecuperado(pctRec))}>
                                                {pctRec.toFixed(1)}%
                                              </span>
                                            </td>
                                            <td className="py-2 px-2 text-right">
                                              <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums", corBadgeMeta(pctM))}>
                                                {pctM === null ? "—" : `${pctM.toFixed(1)}%`}
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/[0.07]">
                      <td className="pt-3 pb-0.5 px-2 text-white font-semibold">Total</td>
                      <td className="pt-3 pb-0.5 px-2 text-right text-white font-semibold tabular-nums whitespace-nowrap">{formatarMoeda(totalPorEmpreendimento.inadimplencia)}</td>
                      <td className="pt-3 pb-0.5 px-2 text-center text-white font-semibold tabular-nums">{totalPorEmpreendimento.contratos}</td>
                      <td className="pt-3 pb-0.5 px-2 text-right text-white font-semibold tabular-nums whitespace-nowrap">{formatarMoeda(totalPorEmpreendimento.recebido)}</td>
                      <td className="pt-3 pb-0.5 px-2 text-right text-white font-semibold tabular-nums whitespace-nowrap">{formatarMoeda(totalPorEmpreendimento.recebidoAParte)}</td>
                      <td className="pt-3 pb-0.5 px-2 text-center text-white font-semibold tabular-nums">{totalPorEmpreendimento.contratosRecebidos}</td>
                      <td className="pt-3 pb-0.5 px-2 text-right text-slate-500 text-[10px] tabular-nums">
                        {totalPorEmpreendimento.inadimplencia > 0 ? `${pctRecuperado(totalPorEmpreendimento.inadimplencia, totalPorEmpreendimento.recebido).toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        </div>
      </div>
    </div>
  );
}
