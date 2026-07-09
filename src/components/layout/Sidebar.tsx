"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Perfil } from "@prisma/client";
import {
  LayoutDashboard, Users, FolderOpen, Upload, Target, DollarSign,
  BarChart3, ClipboardList, Settings, Shield, Bell, ChevronLeft, ChevronRight, History, Layers, UserCog, PieChart, Search, Filter,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useFrente } from "@/contexts/FrenteContext";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  perfis: Perfil[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",            href: "/dashboard",   icon: LayoutDashboard, perfis: ["ADMINISTRADOR", "GESTOR", "CONSULTOR"] },
  { label: "Consulta",             href: "/consulta",    icon: Search,          perfis: ["ADMINISTRADOR", "GESTOR", "CONSULTOR"] },
  { label: "Minha Carteira",       href: "/carteira",    icon: FolderOpen,      perfis: ["CONSULTOR"] },
  { label: "Clientes",             href: "/clientes",    icon: Users,           perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Minhas Tarefas",       href: "/pendencias",  icon: Bell,            perfis: ["CONSULTOR", "GESTOR"] },
  { label: "Importação",           href: "/importacao",  icon: Upload,          perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Histórico",            href: "/historico",   icon: History,         perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Usuários",              href: "/usuarios",    icon: UserCog,         perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Gestão de Carteiras",  href: "/gestao",      icon: PieChart,        perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Frentes",              href: "/equipes",     icon: Layers,          perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Metas",                href: "/metas",       icon: Target,          perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Comissão",             href: "/comissao",    icon: DollarSign,      perfis: ["ADMINISTRADOR", "GESTOR", "CONSULTOR"] },
  { label: "Relatórios",           href: "/relatorios",  icon: BarChart3,       perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Solicitações",         href: "/solicitacoes",icon: ClipboardList,   perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Auditoria",            href: "/auditoria",   icon: Shield,          perfis: ["ADMINISTRADOR"] },
  { label: "Configurações",        href: "/configuracoes",icon: Settings,       perfis: ["ADMINISTRADOR"] },
];

const FRENTE_CHIPS = [
  { id: "eq-flash",   label: "Flash" },
  { id: "eq-1-30",    label: "1-30" },
  { id: "eq-31-90",   label: "31-90" },
  { id: "eq-91-180",  label: "91-180" },
  { id: "eq-181plus", label: "181+" },
];

export function Sidebar({ perfil }: { perfil: Perfil }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const [promessasHoje, setPromessasHoje] = useState(0);
  const { equipeIds, toggleEquipe, clearFilter } = useFrente();

  useEffect(() => {
    if (!["ADMINISTRADOR", "GESTOR"].includes(perfil)) return;
    const fetchPendentes = () => {
      fetch("/api/solicitacoes")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setPendentes(data.filter((s: any) => s.status === "PENDENTE").length);
        })
        .catch(() => {});
    };
    fetchPendentes();
    const interval = setInterval(fetchPendentes, 60_000);
    return () => clearInterval(interval);
  }, [perfil]);

  useEffect(() => {
    if (!["CONSULTOR", "GESTOR"].includes(perfil)) return;
    const fetchPromessas = () => {
      fetch("/api/promessas?vencendoHoje=true")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setPromessasHoje(data.length);
        })
        .catch(() => {});
    };
    fetchPromessas();
    const interval = setInterval(fetchPromessas, 60_000);
    return () => clearInterval(interval);
  }, [perfil]);

  const itensVisiveis = NAV_ITEMS.filter((item) => item.perfis.includes(perfil));

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-gr-900/60 transition-all duration-300",
        "bg-[#0f0f24]",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gr-900/60">
        {!collapsed ? (
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo-gr-icon.png"
              alt="GR Group"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <div className="leading-tight">
              <p className="text-white font-semibold text-sm">DASH CR</p>
              <p className="text-gr-400 text-[10px] font-medium">GR Group</p>
            </div>
          </div>
        ) : (
          <Image
            src="/logo-gr-icon.png"
            alt="GR"
            width={28}
            height={28}
            className="rounded-md"
          />
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-gr-900/40 transition-colors ml-auto"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navegação */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {itensVisiveis.map((item) => {
            const ativo = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                    ativo
                      ? "bg-gr-500/15 text-gr-300 font-medium border border-gr-500/20"
                      : "text-slate-200 hover:text-white hover:bg-white/5"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon size={17} className="flex-shrink-0" />
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                  {!collapsed && item.href === "/solicitacoes" && pendentes > 0 && (
                    <span className="ml-auto text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                      {pendentes > 99 ? "99+" : pendentes}
                    </span>
                  )}
                  {collapsed && item.href === "/solicitacoes" && pendentes > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full" />
                  )}
                  {!collapsed && item.href === "/pendencias" && promessasHoje > 0 && (
                    <span className="ml-auto text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                      {promessasHoje > 99 ? "99+" : promessasHoje}
                    </span>
                  )}
                  {collapsed && item.href === "/pendencias" && promessasHoje > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Filtro de frente — visível só para GESTOR e ADMIN */}
      {["ADMINISTRADOR", "GESTOR"].includes(perfil) && (
        <div className={cn("border-t border-gr-900/60", collapsed ? "p-2" : "p-3")}>
          {!collapsed ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Filter size={11} className="text-slate-500" />
                  <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Filtrar frente</span>
                </div>
                {equipeIds.length > 0 && (
                  <button
                    onClick={clearFilter}
                    className="text-[9px] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    limpar
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {FRENTE_CHIPS.map((chip) => {
                  const ativo = equipeIds.includes(chip.id);
                  return (
                    <button
                      key={chip.id}
                      onClick={() => toggleEquipe(chip.id)}
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors border",
                        ativo
                          ? "bg-gr-500/20 text-gr-300 border-gr-500/40"
                          : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-300"
                      )}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
              {equipeIds.length === 0 && (
                <p className="text-[9px] text-slate-400 mt-1.5">Nenhum selecionado = todas</p>
              )}
            </div>
          ) : (
            <button
              title={equipeIds.length > 0 ? equipeIds.map(id => FRENTE_CHIPS.find(c => c.id === id)?.label).join(", ") : "Todas as frentes"}
              className={cn(
                "relative w-full flex justify-center p-1.5 rounded-lg transition-colors",
                equipeIds.length > 0 ? "text-gr-400 bg-gr-500/10" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <Filter size={14} />
              {equipeIds.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-gr-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold leading-none">
                  {equipeIds.length}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Badge de perfil */}
      {!collapsed && (
        <div className="p-4 border-t border-gr-900/60">
          <span className={cn(
            "text-xs px-2.5 py-1 rounded-full font-medium",
            perfil === "ADMINISTRADOR" && "bg-gr-500/15 text-gr-300 border border-gr-500/20",
            perfil === "GESTOR"        && "bg-amber-500/10 text-amber-400",
            perfil === "CONSULTOR"     && "bg-teal-500/10 text-teal-400",
          )}>
            {perfil === "ADMINISTRADOR" && "Administrador"}
            {perfil === "GESTOR"        && "Gestor"}
            {perfil === "CONSULTOR"     && "Consultor"}
          </span>
        </div>
      )}
    </aside>
  );
}
