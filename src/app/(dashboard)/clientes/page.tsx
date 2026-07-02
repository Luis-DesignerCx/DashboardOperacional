"use client";

import { useEffect, useRef, useState } from "react";
import { formatarMoeda } from "@/lib/utils";
import { Search, AlertCircle, ChevronRight, Phone, Loader2 } from "lucide-react";
import Link from "next/link";

interface Cliente {
  id: string;
  nome: string;
  cpf: string | null;
  telefones: string | null;
  emails: string | null;
  contratos: {
    id: string;
    numero: string;
    empresa: { nome: string };
    valorTotalAberto: number | null;
    maiorDiasAtraso: number | null;
  }[];
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [busca, setBusca] = useState("");
  const [empresaFiltro, setEmpresaFiltro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function carregarPagina(q: string, pg: number, append = false) {
    if (pg === 1 && !append) setCarregando(true);
    else setCarregandoMais(true);

    const params = new URLSearchParams({ page: String(pg) });
    if (q) params.set("q", q);
    const data = await fetch(`/api/clientes?${params}`).then((r) => r.json()).catch(() => ({}));
    const lista: Cliente[] = Array.isArray(data.clientes) ? data.clientes : [];

    if (append) setClientes((prev) => [...prev, ...lista]);
    else { setClientes(lista); setTotal(data.total ?? 0); }
    setPagina(pg);
    setTemMais(data.temMais ?? false);
    setCarregando(false);
    setCarregandoMais(false);
  }

  // Carga inicial
  useEffect(() => { carregarPagina("", 1); }, []);

  // Busca com debounce
  useEffect(() => {
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    buscaTimer.current = setTimeout(() => {
      setPagina(1);
      setTemMais(false);
      carregarPagina(busca, 1);
    }, 400);
  }, [busca]);

  const empresas = Array.from(
    new Set(clientes.flatMap((c) => c.contratos.map((ct) => ct.empresa.nome)))
  ).sort();

  const filtrados = empresaFiltro
    ? clientes.filter((c) => c.contratos.some((ct) => ct.empresa.nome === empresaFiltro))
    : clientes;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Clientes</h1>
        <p className="text-slate-400 text-sm mt-1">{total.toLocaleString("pt-BR")} clientes na base</p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Buscar por nome, contrato ou telefone..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gr-500"
        />
      </div>

      {/* Filtros por empresa */}
      {empresas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setEmpresaFiltro(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              !empresaFiltro ? "bg-gr-500 text-white" : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
            }`}
          >
            Todas
          </button>
          {empresas.map((emp) => (
            <button
              key={emp}
              onClick={() => setEmpresaFiltro(emp === empresaFiltro ? null : emp)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                empresaFiltro === emp ? "bg-gr-500 text-white" : "bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
              }`}
            >
              {emp}
            </button>
          ))}
        </div>
      )}

      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Cliente</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Telefone</th>
                    <th className="text-left px-4 py-3 text-slate-400 font-medium">Empresa</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Contratos</th>
                    <th className="text-right px-4 py-3 text-slate-400 font-medium">Em aberto</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c) => {
                    const totalAberto = c.contratos.reduce((s, ct) => s + Number(ct.valorTotalAberto ?? 0), 0);
                    const nomeEmpresas = Array.from(new Set(c.contratos.map((ct) => ct.empresa.nome))).join(", ");
                    const telefone = c.telefones ? c.telefones.split(",")[0] : null;
                    return (
                      <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/clientes/${c.id}`} className="block">
                            <p className="text-white font-medium hover:text-gr-300 transition-colors">{c.nome}</p>
                            <p className="text-slate-500 text-xs">{c.contratos.length === 1 ? c.contratos[0].numero : `${c.contratos.length} contratos`}</p>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {telefone ? (
                            <span className="flex items-center gap-1">
                              <Phone size={11} className="text-slate-600" />
                              {telefone}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{nomeEmpresas || "—"}</td>
                        <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{c.contratos.length}</td>
                        <td className="px-4 py-3 text-right text-white font-semibold tabular-nums">{formatarMoeda(totalAberto)}</td>
                        <td className="px-4 py-3">
                          <Link href={`/clientes/${c.id}`} className="flex items-center justify-center p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                            <ChevronRight size={16} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filtrados.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <AlertCircle size={32} className="mx-auto mb-3 opacity-50" />
                <p>{busca ? "Nenhum resultado encontrado" : "Nenhum cliente encontrado."}</p>
              </div>
            )}
          </div>

          {/* Carregar mais */}
          {temMais && !empresaFiltro && (
            <div className="flex justify-center pt-1">
              <button
                onClick={() => carregarPagina(busca, pagina + 1, true)}
                disabled={carregandoMais}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-sm font-medium px-6 py-2.5 rounded-xl transition-colors"
              >
                {carregandoMais
                  ? <><Loader2 size={14} className="animate-spin" /> Carregando...</>
                  : <>Carregar mais · {clientes.length}/{total}</>
                }
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
