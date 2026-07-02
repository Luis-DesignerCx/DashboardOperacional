"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatarMoeda } from "@/lib/utils";
import {
  ArrowLeft, Phone, Mail, Building2, FileText,
  Calendar, Clock, TrendingDown, CheckCircle2, AlertCircle, User,
} from "lucide-react";

interface Contrato {
  id: string;
  numero: string;
  statusContrato: string | null;
  maiorDiasAtraso: number | null;
  valorTotalAberto: number | null;
  valorContrato: number | null;
  totalParcelasVencidas: number | null;
  statusRecuperacao: string;
  empresa: { nome: string };
  parcelas: {
    numero: number;
    dataVencimento: string;
    diasAtraso: number;
    valorParcela: number;
    valorTotalAberto: number;
    origem: string | null;
    meioPagamento: string | null;
    paga: boolean;
  }[];
  recebimentos: { id: string; valor: number; dataRecebimento: string; formaPagamento: string }[];
  contatos: { id: string; tipo: string; status: string; observacao: string | null; criadoEm: string }[];
  promessas: { id: string; valorPrometido: number; dataPrometida: string; formaPagamento: string }[];
  carteiras: { consultor: { nome: string }; competencia: { descricao: string } }[];
}

interface Cliente {
  id: string;
  nome: string;
  cpf: string | null;
  telefones: string | null;
  emails: string | null;
  contratos: Contrato[];
}

function badgeDias(dias: number) {
  if (dias <= 0) return "bg-blue-500/15 text-blue-400 border border-blue-500/20";
  if (dias <= 30) return "bg-amber-500/15 text-amber-400 border border-amber-500/20";
  if (dias <= 90) return "bg-orange-500/15 text-orange-400 border border-orange-500/20";
  if (dias <= 180) return "bg-red-500/15 text-red-400 border border-red-500/20";
  return "bg-red-900/30 text-red-300 border border-red-700/30";
}

function labelDias(dias: number) {
  if (dias <= 0) return "Flash";
  if (dias <= 30) return "1–30 dias";
  if (dias <= 90) return "31–90 dias";
  if (dias <= 180) return "91–180 dias";
  return "181+ dias";
}

export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [erro, setErro] = useState("");
  const [contratoAberto, setContratoAberto] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/clientes/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { setErro(d.erro); return; }
        setCliente(d);
        if (d.contratos?.[0]) setContratoAberto(d.contratos[0].id);
      })
      .catch(() => setErro("Erro de conexão"));
  }, [id]);

  if (erro) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertCircle size={32} className="text-red-400" />
      <p className="text-red-400">{erro}</p>
      <button onClick={() => router.back()} className="text-slate-400 text-sm hover:text-white">← Voltar</button>
    </div>
  );

  if (!cliente) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-2 border-gr-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const totalAberto = cliente.contratos.reduce((s, c) => s + Number(c.valorTotalAberto ?? 0), 0);
  const totalRecebido = cliente.contratos.reduce(
    (s, c) => s + c.recebimentos.reduce((r, rec) => r + Number(rec.valor), 0), 0
  );
  const telefones = cliente.telefones ? cliente.telefones.split(",") : [];
  const emails = cliente.emails ? cliente.emails.split(",") : [];
  const contrato = cliente.contratos.find((c) => c.id === contratoAberto) ?? cliente.contratos[0];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors mt-0.5"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{cliente.nome}</h1>
          <div className="flex flex-wrap items-center gap-4 mt-1.5">
            {telefones.length > 0 && (
              <span className="flex items-center gap-1.5 text-slate-400 text-sm">
                <Phone size={13} />
                {telefones[0]}
                {telefones.length > 1 && <span className="text-slate-600">+{telefones.length - 1}</span>}
              </span>
            )}
            {emails.length > 0 && (
              <span className="flex items-center gap-1.5 text-slate-400 text-sm">
                <Mail size={13} />
                {emails[0]}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Contratos</p>
          <p className="text-2xl font-bold text-white mt-1">{cliente.contratos.length}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Total em Aberto</p>
          <p className="text-xl font-bold text-red-400 mt-1">{formatarMoeda(totalAberto)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Total Recebido</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{formatarMoeda(totalRecebido)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-500 text-xs">Maior Atraso</p>
          <p className="text-2xl font-bold text-white mt-1">
            {Math.max(...cliente.contratos.map((c) => c.maiorDiasAtraso ?? 0))}d
          </p>
        </div>
      </div>

      {/* Seletor de contrato (se tiver mais de 1) */}
      {cliente.contratos.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {cliente.contratos.map((c) => (
            <button
              key={c.id}
              onClick={() => setContratoAberto(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                contratoAberto === c.id
                  ? "bg-gr-500 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {c.numero}
            </button>
          ))}
        </div>
      )}

      {contrato && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Dados do contrato */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText size={15} className="text-gr-400" />
              Contrato {contrato.numero}
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <Info label="Empresa" value={contrato.empresa.nome} />
              <Info label="Status" value={contrato.statusContrato ?? "—"} />
              <Info label="Valor Contrato" value={formatarMoeda(Number(contrato.valorContrato ?? 0))} />
              <Info label="Total em Aberto" value={formatarMoeda(Number(contrato.valorTotalAberto ?? 0))} />
              <Info label="Parcelas Vencidas" value={String(contrato.totalParcelasVencidas ?? "—")} />
              <div>
                <p className="text-slate-500 text-xs mb-1">Faixa de Atraso</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeDias(contrato.maiorDiasAtraso ?? 0)}`}>
                  {contrato.maiorDiasAtraso ?? 0}d — {labelDias(contrato.maiorDiasAtraso ?? 0)}
                </span>
              </div>
            </div>

            {contrato.carteiras[0] && (
              <div className="pt-3 border-t border-slate-800">
                <p className="text-slate-500 text-xs mb-1">Consultor responsável</p>
                <div className="flex items-center gap-2">
                  <User size={13} className="text-gr-400" />
                  <span className="text-white text-sm">{contrato.carteiras[0].consultor.nome}</span>
                  <span className="text-slate-600 text-xs">· {contrato.carteiras[0].competencia.descricao}</span>
                </div>
              </div>
            )}
          </div>

          {/* Parcelas */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Calendar size={15} className="text-gr-400" />
              Parcelas ({contrato.parcelas.length})
            </h2>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {contrato.parcelas.map((p) => (
                <div key={p.numero} className="flex items-center justify-between py-1.5 border-b border-slate-800/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 text-xs w-5 text-right">{p.numero}</span>
                    <span className="text-slate-400 text-xs">
                      {new Date(p.dataVencimento).toLocaleDateString("pt-BR")}
                    </span>
                    {p.diasAtraso > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${badgeDias(p.diasAtraso)}`}>
                        {p.diasAtraso}d
                      </span>
                    )}
                  </div>
                  <span className="text-white text-xs font-medium tabular-nums">
                    {formatarMoeda(Number(p.valorTotalAberto))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recebimentos */}
          {contrato.recebimentos.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-400" />
                Recebimentos ({contrato.recebimentos.length})
              </h2>
              <div className="space-y-2">
                {contrato.recebimentos.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex justify-between items-center py-1.5 border-b border-slate-800/50 last:border-0">
                    <div>
                      <p className="text-white text-sm font-medium">{formatarMoeda(Number(r.valor))}</p>
                      <p className="text-slate-500 text-xs">{r.formaPagamento.replace(/_/g, " ")} · {new Date(r.dataRecebimento).toLocaleDateString("pt-BR")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Últimos contatos */}
          {contrato.contatos.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Clock size={15} className="text-gr-400" />
                Últimos Contatos
              </h2>
              <div className="space-y-2">
                {contrato.contatos.map((c) => (
                  <div key={c.id} className="py-1.5 border-b border-slate-800/50 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{c.tipo}</span>
                      <span className="text-xs text-slate-600">·</span>
                      <span className="text-xs text-slate-300">{c.status.replace(/_/g, " ")}</span>
                    </div>
                    {c.observacao && <p className="text-slate-500 text-xs mt-0.5">{c.observacao}</p>}
                    <p className="text-slate-700 text-xs mt-0.5">{new Date(c.criadoEm).toLocaleDateString("pt-BR")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-500 text-xs">{label}</p>
      <p className="text-white text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}
