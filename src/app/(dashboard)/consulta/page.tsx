"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Building2, User, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { formatarMoeda } from "@/lib/utils";
import Link from "next/link";

interface ResultadoConsulta {
  id: string;
  numero: string;
  valorTotalAberto: number | null;
  maiorDiasAtraso: number | null;
  statusRecuperacao: string | null;
  cliente: { id: string; nome: string; cpf: string | null; telefones: string | null };
  empresa: { nome: string };
  carteiras: {
    consultor: { id: string; nome: string; equipe: { nome: string } | null };
    competencia: { descricao: string };
  }[];
}

const STATUS_COR: Record<string, string> = {
  INADIMPLENTE: "bg-red-500/10 text-red-400 border-red-500/20",
  RECUPERACAO_PARCIAL: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  RECUPERADO_INTEGRALMENTE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};
const STATUS_LABEL: Record<string, string> = {
  INADIMPLENTE: "Inadimplente",
  RECUPERACAO_PARCIAL: "Rec. parcial",
  RECUPERADO_INTEGRALMENTE: "Recuperado",
};

function diasCor(dias: number | null) {
  if (!dias) return "text-slate-400";
  if (dias <= 30) return "text-sky-400";
  if (dias <= 90) return "text-amber-400";
  return "text-red-400";
}

export default function ConsultaPage() {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ResultadoConsulta[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResultados([]);
      setBuscou(false);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBuscando(true);
      setBuscou(false);
      const data = await fetch(`/api/consulta?q=${encodeURIComponent(query)}`).then((r) => r.json()).catch(() => []);
      setResultados(Array.isArray(data) ? data : []);
      setBuscando(false);
      setBuscou(true);
    }, 350);
  }, [query]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Consulta</h1>
        <p className="text-slate-400 text-sm mt-1">Pesquise qualquer cliente por nome, CPF, telefone ou número de contrato</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        {buscando && (
          <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 animate-spin" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nome do cliente, CPF, telefone ou nº do contrato..."
          className="w-full bg-slate-900 border border-slate-700 focus:border-gr-500 rounded-2xl pl-12 pr-12 py-4 text-white text-base placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-gr-500/30 transition-all"
        />
      </div>

      {/* Estado inicial */}
      {!buscou && !buscando && query.length < 2 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <Search size={40} className="mx-auto mb-3 text-slate-700" />
          <p className="text-slate-400 text-sm">Digite pelo menos 2 caracteres para pesquisar</p>
          <p className="text-slate-600 text-xs mt-1">Funciona com nome, CPF, telefone ou número do contrato</p>
        </div>
      )}

      {/* Sem resultados */}
      {buscou && resultados.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <AlertCircle size={36} className="mx-auto mb-3 text-slate-600" />
          <p className="text-slate-400 text-sm">Nenhum cliente encontrado para "{query}"</p>
        </div>
      )}

      {/* Resultados */}
      {resultados.length > 0 && (
        <>
          <p className="text-slate-500 text-xs">{resultados.length} resultado{resultados.length !== 1 ? "s" : ""} encontrado{resultados.length !== 1 ? "s" : ""}</p>
          <div className="space-y-3">
            {resultados.map((c) => {
              const carteira = c.carteiras[0];
              return (
                <div key={c.id} className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Nome + status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-semibold">{c.cliente.nome}</p>
                        {c.statusRecuperacao && (
                          <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${STATUS_COR[c.statusRecuperacao] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                            {STATUS_LABEL[c.statusRecuperacao] ?? c.statusRecuperacao}
                          </span>
                        )}
                      </div>

                      {/* Contrato + empresa */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-mono text-slate-400">{c.numero}</span>
                        <span className="text-slate-600 text-xs">·</span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Building2 size={11} /> {c.empresa.nome}
                        </span>
                        {c.cliente.cpf && (
                          <>
                            <span className="text-slate-600 text-xs">·</span>
                            <span className="text-xs text-slate-500 font-mono">{c.cliente.cpf}</span>
                          </>
                        )}
                        {c.cliente.telefones && (
                          <>
                            <span className="text-slate-600 text-xs">·</span>
                            <span className="text-xs text-slate-500">{c.cliente.telefones}</span>
                          </>
                        )}
                      </div>

                      {/* Consultor responsável */}
                      <div className="flex items-center gap-2">
                        {carteira ? (
                          <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-1.5">
                            <User size={12} className="text-gr-400 flex-shrink-0" />
                            <span className="text-xs text-white font-medium">{carteira.consultor.nome}</span>
                            {carteira.consultor.equipe && (
                              <>
                                <span className="text-slate-600 text-xs">·</span>
                                <span className="text-xs text-slate-400">{carteira.consultor.equipe.nome}</span>
                              </>
                            )}
                            <span className="text-slate-600 text-xs">·</span>
                            <span className="text-xs text-slate-500">{carteira.competencia.descricao}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-1.5">
                            <span className="text-xs text-slate-500">Sem carteira ativa</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Valor + dias + link */}
                    <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                      <div>
                        <p className="text-white font-bold text-sm tabular-nums">{formatarMoeda(Number(c.valorTotalAberto ?? 0))}</p>
                        <p className={`text-xs font-medium tabular-nums ${diasCor(c.maiorDiasAtraso)}`}>
                          {c.maiorDiasAtraso ?? 0}d em atraso
                        </p>
                      </div>
                      <Link
                        href={`/clientes/${c.cliente.id}`}
                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Ver ficha <ArrowRight size={12} />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
