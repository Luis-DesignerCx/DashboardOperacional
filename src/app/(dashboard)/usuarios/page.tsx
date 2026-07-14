"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Users, Plus, Pencil, Trash2, Eye, EyeOff, X, Check,
  Palmtree, ShieldCheck, UserCog, User, KeyRound,
} from "lucide-react";

interface Equipe { id: string; nome: string; tipo: string }
interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: "ADMINISTRADOR" | "GESTOR" | "CONSULTOR";
  ativo: boolean;
  emFerias: boolean;
  deveAlterarSenha: boolean;
  criadoEm: string;
  equipe: Equipe | null;
  frentesAdicionais: { equipe: Equipe }[];
}

const PERFIL_LABEL: Record<string, string> = {
  ADMINISTRADOR: "Administrador",
  GESTOR: "Gestor",
  CONSULTOR: "Consultor",
};
const PERFIL_COR: Record<string, string> = {
  ADMINISTRADOR: "bg-gr-500/15 text-gr-300 border border-gr-500/20",
  GESTOR: "bg-amber-500/10 text-amber-400",
  CONSULTOR: "bg-teal-500/10 text-teal-400",
};
const PERFIL_ICON: Record<string, React.ElementType> = {
  ADMINISTRADOR: ShieldCheck,
  GESTOR: UserCog,
  CONSULTOR: User,
};
const FRENTE_LABEL: Record<string, string> = {
  FLASH: "Flash", CRA_1_30: "1-30", CR_31_90: "31-90",
  CR_PDD_91_180: "91+", CR_PDD_181: "91+",
};
const FRENTE_COR: Record<string, string> = {
  FLASH:         "bg-sky-500/15 text-sky-400 border border-sky-500/20",
  CRA_1_30:      "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
  CR_31_90:      "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  CR_PDD_91_180: "bg-orange-500/15 text-orange-400 border border-orange-500/20",
  CR_PDD_181:    "bg-orange-500/15 text-orange-400 border border-orange-500/20",
};

function FrenteChips({ equipe, frentesAdicionais }: { equipe: Equipe | null; frentesAdicionais: { equipe: Equipe }[] }) {
  const todas = [
    ...(equipe ? [equipe] : []),
    ...frentesAdicionais.map((f) => f.equipe),
  ].filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i);
  if (!todas.length) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {todas.map((e) => (
        <span key={e.id} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${FRENTE_COR[e.tipo] ?? "bg-slate-700 text-slate-300"}`}>
          {FRENTE_LABEL[e.tipo] ?? e.nome}
        </span>
      ))}
    </div>
  );
}

const inputCls = "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-gr-500 placeholder:text-slate-500";

export default function UsuariosPage() {
  const { data: session } = useSession();
  const meuPerfil = (session?.user as any)?.perfil as string | undefined;

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [modal, setModal] = useState<"criar" | "editar" | "senha" | null>(null);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const [form, setForm] = useState({ nome: "", email: "", frentesIds: [] as string[], perfilCriado: "CONSULTOR" });
  const [novaSenha, setNovaSenha] = useState("");

  useEffect(() => {
    carregar();
    fetch("/api/equipes").then((r) => r.json()).then(setEquipes);
  }, []);

  async function carregar() {
    const data = await fetch("/api/usuarios").then((r) => r.json());
    if (Array.isArray(data)) setUsuarios(data);
  }

  function abrirCriar() {
    setForm({ nome: "", email: "", frentesIds: [], perfilCriado: "CONSULTOR" });
    setErro(""); setModal("criar");
  }

  function abrirEditar(u: Usuario) {
    const ids = [
      ...(u.equipe ? [u.equipe.id] : []),
      ...u.frentesAdicionais.map((f) => f.equipe.id),
    ].filter((v, i, a) => a.indexOf(v) === i);
    setForm({ nome: u.nome, email: u.email, frentesIds: ids, perfilCriado: u.perfil });
    setEditando(u); setErro(""); setModal("editar");
  }

  function abrirSenha(u: Usuario) {
    setEditando(u); setNovaSenha(""); setErro(""); setMostrarSenha(false); setModal("senha");
  }

  function toggleFrenteId(equipeId: string) {
    setForm((f) => ({
      ...f,
      frentesIds: f.frentesIds.includes(equipeId)
        ? f.frentesIds.filter((x) => x !== equipeId)
        : [...f.frentesIds, equipeId],
    }));
  }

  async function salvar() {
    setErro(""); setCarregando(true);
    const body: any = {
      nome: form.nome,
      email: form.email,
      frentesIds: form.frentesIds,
      perfilCriado: form.perfilCriado,
    };

    const url = modal === "criar" ? "/api/usuarios" : `/api/usuarios/${editando!.id}`;
    const method = modal === "criar" ? "POST" : "PATCH";

    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setCarregando(false);
    if (!res.ok) { setErro(data.erro || "Erro ao salvar"); return; }
    setModal(null);
    carregar();
  }

  async function redefinirSenha() {
    if (!novaSenha || novaSenha.length < 6) { setErro("Mínimo 6 caracteres"); return; }
    setCarregando(true);
    const res = await fetch(`/api/usuarios/${editando!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha: novaSenha }),
    });
    const data = await res.json();
    setCarregando(false);
    if (!res.ok) { setErro(data.erro || "Erro"); return; }
    setModal(null);
    carregar();
  }

  async function excluir(id: string) {
    const res = await fetch(`/api/usuarios/${id}`, { method: "DELETE" });
    if (res.ok) { setConfirmDelete(null); carregar(); }
  }

  async function toggleFerias(u: Usuario) {
    await fetch(`/api/usuarios/${u.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emFerias: !u.emFerias }),
    });
    carregar();
  }

  async function toggleAtivo(u: Usuario) {
    await fetch(`/api/usuarios/${u.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !u.ativo }),
    });
    carregar();
  }

  // Frentes disponíveis para seleção (sem duplicatas de tipo CR_PDD_181)
  const frentesDisponiveis = equipes.filter((e) => e.tipo !== "CR_PDD_181");

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users size={22} className="text-slate-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Usuários</h1>
            <p className="text-slate-400 text-sm">{usuarios.length} colaboradores cadastrados</p>
          </div>
        </div>
        <button
          onClick={abrirCriar}
          className="flex items-center gap-2 bg-gr-500 hover:bg-gr-400 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={16} /> Novo Usuário
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Nome</th>
              <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">E-mail</th>
              <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Perfil</th>
              <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Frentes</th>
              <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const Icon = PERFIL_ICON[u.perfil];
              return (
                <tr key={u.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gr-500/15 flex items-center justify-center flex-shrink-0">
                        <Icon size={14} className="text-gr-400" />
                      </div>
                      <div>
                        <p className={`font-medium ${u.ativo ? "text-white" : "text-slate-500 line-through"}`}>{u.nome}</p>
                        <div className="flex gap-1 mt-0.5">
                          {u.emFerias && <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">férias</span>}
                          {u.deveAlterarSenha && <span className="text-[10px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded font-medium">senha pendente</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 text-xs">{u.email}</td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PERFIL_COR[u.perfil]}`}>
                      {PERFIL_LABEL[u.perfil]}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <FrenteChips equipe={u.equipe} frentesAdicionais={u.frentesAdicionais} />
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.ativo ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-700 text-slate-500"}`}>
                      {u.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => toggleFerias(u)} title={u.emFerias ? "Tirar de férias" : "Colocar em férias"}
                        className={`p-1.5 rounded-lg transition-colors ${u.emFerias ? "text-amber-400 bg-amber-500/10 hover:bg-amber-500/20" : "text-slate-500 hover:text-amber-400 hover:bg-amber-500/10"}`}>
                        <Palmtree size={14} />
                      </button>
                      <button onClick={() => toggleAtivo(u)} title={u.ativo ? "Desativar" : "Reativar"}
                        className={`p-1.5 rounded-lg transition-colors ${u.ativo ? "text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10" : "text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20"}`}>
                        <Check size={14} />
                      </button>
                      <button onClick={() => abrirSenha(u)} title="Redefinir senha"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-orange-400 hover:bg-orange-500/10 transition-colors">
                        <KeyRound size={14} />
                      </button>
                      <button onClick={() => abrirEditar(u)} title="Editar"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setConfirmDelete(u.id)} title="Excluir"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {usuarios.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-400 text-sm py-12">Nenhum usuário encontrado</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal criar / editar */}
      {(modal === "criar" || modal === "editar") && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h2 className="text-white font-semibold">{modal === "criar" ? "Novo Usuário" : "Editar Usuário"}</h2>
                {modal === "criar" && (
                  <p className="text-slate-500 text-xs mt-0.5">Senha inicial: <span className="text-slate-300 font-mono">mudar123</span> — o usuário deverá trocar no primeiro acesso</p>
                )}
              </div>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Nome completo</label>
                <input className={inputCls} placeholder="Ex: João Silva" value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">E-mail</label>
                <input type="email" className={inputCls} placeholder="joao@grgroup.com" value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              {meuPerfil === "ADMINISTRADOR" && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Perfil</label>
                  <select className={inputCls} value={form.perfilCriado}
                    onChange={(e) => setForm((f) => ({ ...f, perfilCriado: e.target.value }))}>
                    <option value="CONSULTOR">Consultor</option>
                    <option value="GESTOR">Gestor</option>
                    <option value="ADMINISTRADOR">Administrador</option>
                  </select>
                </div>
              )}
              {(meuPerfil === "ADMINISTRADOR" || meuPerfil === "GESTOR") && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Frentes de cobrança</label>
                  <div className="space-y-1.5 bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
                    {frentesDisponiveis.length === 0 && (
                      <p className="text-slate-500 text-xs text-center py-1">Nenhuma frente cadastrada</p>
                    )}
                    {frentesDisponiveis.map((e) => {
                      const selecionada = form.frentesIds.includes(e.id);
                      return (
                        <label key={e.id} className="flex items-center gap-3 cursor-pointer py-1 px-1 rounded-lg hover:bg-slate-700/40 transition-colors">
                          <input
                            type="checkbox"
                            checked={selecionada}
                            onChange={() => toggleFrenteId(e.id)}
                            className="w-4 h-4 accent-gr-500 flex-shrink-0"
                          />
                          <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${FRENTE_COR[e.tipo] ?? "bg-slate-700 text-slate-300"}`}>
                            {FRENTE_LABEL[e.tipo] ?? e.nome}
                          </span>
                          <span className="text-slate-300 text-sm">{e.nome}</span>
                        </label>
                      );
                    })}
                  </div>
                  {form.frentesIds.length === 0 && (
                    <p className="text-slate-500 text-xs mt-1">Nenhuma frente selecionada — usuário sem frente atribuída</p>
                  )}
                </div>
              )}
              {erro && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>}
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setModal(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={salvar} disabled={carregando || !form.nome || !form.email}
                className="flex-1 bg-gr-500 hover:bg-gr-400 disabled:bg-gr-500/30 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                {carregando ? "Salvando..." : modal === "criar" ? "Criar Usuário" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal redefinir senha */}
      {modal === "senha" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div>
                <h2 className="text-white font-semibold">Redefinir senha</h2>
                <p className="text-slate-500 text-xs mt-0.5">{editando?.nome}</p>
              </div>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-slate-400 text-xs">A nova senha será definida e o usuário deverá alterá-la no próximo acesso.</p>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Nova senha</label>
                <div className="relative">
                  <input type={mostrarSenha ? "text" : "password"} value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)} placeholder="Mínimo 6 caracteres"
                    className={inputCls + " pr-10"} />
                  <button type="button" onClick={() => setMostrarSenha((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {mostrarSenha ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              {erro && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>}
              <div className="flex gap-3">
                <button onClick={() => setModal(null)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button onClick={redefinirSenha} disabled={carregando || !novaSenha}
                  className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/30 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                  {carregando ? "Salvando..." : "Redefinir"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação exclusão */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <h2 className="text-white font-semibold">Excluir usuário?</h2>
            <p className="text-slate-400 text-sm">O usuário será desativado e não conseguirá mais acessar o sistema.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={() => excluir(confirmDelete)}
                className="flex-1 bg-red-500 hover:bg-red-400 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
