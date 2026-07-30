"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Perfil } from "@prisma/client";
import {
  LayoutDashboard, Users, FolderOpen, Upload, Target, DollarSign,
  BarChart3, ClipboardList, Settings, Shield, Bell, ChevronLeft,
  ChevronRight, History, Layers, UserCog, PieChart, Search,
  SlidersHorizontal,
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
  { label: "Dashboard",           href: "/dashboard",    icon: LayoutDashboard, perfis: ["ADMINISTRADOR", "GESTOR", "CONSULTOR"] },
  { label: "Consulta",            href: "/consulta",     icon: Search,          perfis: ["ADMINISTRADOR", "GESTOR", "CONSULTOR"] },
  { label: "Minha Carteira",      href: "/carteira",     icon: FolderOpen,      perfis: ["CONSULTOR"] },
  { label: "Clientes",            href: "/clientes",     icon: Users,           perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Minhas Tarefas",      href: "/pendencias",   icon: Bell,            perfis: ["CONSULTOR", "GESTOR"] },
  { label: "Importação",          href: "/importacao",   icon: Upload,          perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Histórico",           href: "/historico",    icon: History,         perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Usuários",            href: "/usuarios",     icon: UserCog,         perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Gestão de Carteiras", href: "/gestao",       icon: PieChart,        perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Frentes",             href: "/equipes",      icon: Layers,          perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Metas",               href: "/metas",        icon: Target,          perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Comissão",            href: "/comissao",     icon: DollarSign,      perfis: ["ADMINISTRADOR", "GESTOR", "CONSULTOR"] },
  { label: "Relatórios",          href: "/relatorios",   icon: BarChart3,       perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Solicitações",        href: "/solicitacoes", icon: ClipboardList,   perfis: ["ADMINISTRADOR", "GESTOR"] },
  { label: "Auditoria",           href: "/auditoria",    icon: Shield,          perfis: ["ADMINISTRADOR"] },
  { label: "Configurações",       href: "/configuracoes",icon: Settings,        perfis: ["ADMINISTRADOR"] },
];

const FRENTE_CHIPS = [
  { id: "eq-flash",  label: "Flash" },
  { id: "eq-1-30",   label: "1–30" },
  { id: "eq-31-90",  label: "31–90" },
  { id: "eq-91-180", label: "91+" },
];

export function Sidebar({ perfil }: { perfil: Perfil }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const [totalTarefasHoje, setTotalTarefasHoje] = useState(0);
  const { equipeIds, toggleEquipe, clearFilter } = useFrente();

  const seenKey    = `pendencias_seen_${new Date().toISOString().slice(0, 10)}`;
  const seenCount  = (): number => parseInt(typeof window !== "undefined" ? (localStorage.getItem(seenKey) ?? "0") : "0", 10);
  const markSeen   = (n: number) => { if (typeof window !== "undefined") localStorage.setItem(seenKey, String(n)); };
  const promessasHoje = Math.max(0, totalTarefasHoje - seenCount());

  useEffect(() => {
    if (!["ADMINISTRADOR", "GESTOR"].includes(perfil)) return;
    const fetch_ = () => {
      fetch("/api/solicitacoes")
        .then((r) => r.json())
        .then((d) => { if (Array.isArray(d)) setPendentes(d.filter((s: any) => s.status === "PENDENTE").length); })
        .catch(() => {});
    };
    fetch_();
    const t = setInterval(fetch_, 60_000);
    return () => clearInterval(t);
  }, [perfil]);

  useEffect(() => {
    if (!["CONSULTOR", "GESTOR"].includes(perfil)) return;
    const fetch_ = () => {
      Promise.all([
        fetch("/api/promessas?vencendoHoje=true").then((r) => r.json()).catch(() => []),
        fetch("/api/contatos?agendadosHoje=true").then((r) => r.json()).catch(() => []),
      ]).then(([p, a]) => {
        const total = (Array.isArray(p) ? p.length : 0) + (Array.isArray(a) ? a.length : 0);
        setTotalTarefasHoje(total);
        if (typeof window !== "undefined" && window.location.pathname === "/pendencias") markSeen(total);
      });
    };
    fetch_();
    const t = setInterval(fetch_, 60_000);
    return () => clearInterval(t);
  }, [perfil]);

  useEffect(() => {
    if (pathname === "/pendencias") {
      markSeen(totalTarefasHoje);
      setTotalTarefasHoje((t) => t);
    }
  }, [pathname]);

  const itensVisiveis = NAV_ITEMS.filter((i) => i.perfis.includes(perfil));

  return (
    <aside
      className={cn(
        "relative flex flex-col transition-all duration-300 ease-in-out flex-shrink-0",
        "bg-[#06080e] border-r border-white/[0.05]",
        collapsed ? "w-[60px]" : "w-60"
      )}
    >
      {/* Ambient top glow — roxo brand #4c3d8d */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-brand-purple/[0.08] to-transparent" />

      {/* Logo ──────────────────────────────────────────────────── */}
      <div className={cn(
        "relative flex items-center h-16 border-b border-white/[0.05] flex-shrink-0",
        collapsed ? "justify-center px-0" : "px-4 gap-2.5"
      )}>
        <div className="relative flex-shrink-0 w-8 h-8 rounded-lg overflow-hidden ring-1 ring-brand-purple/30">
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(76,61,141,0.3), rgba(40,37,82,0.5))" }} />
          <Image
            src="/logo-gr-icon.png"
            alt="GR Group"
            width={32} height={32}
            className="relative z-10 w-full h-full object-contain"
          />
        </div>

        {!collapsed && (
          <div className="flex-1 min-w-0 leading-tight">
            <p className="text-white font-bold text-sm tracking-tight">DASH CR</p>
            <p className="text-brand-violet/70 text-[9px] font-semibold tracking-[0.18em] uppercase">GR Group</p>
          </div>
        )}

        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/[0.04] transition-all"
            aria-label="Recolher sidebar"
          >
            <ChevronLeft size={14} />
          </button>
        )}

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#0b0f1c] border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:border-gr-500/40 transition-all shadow-card z-10"
            aria-label="Expandir sidebar"
          >
            <ChevronRight size={11} />
          </button>
        )}
      </div>

      {/* Nav ────────────────────────────────────────────────────── */}
      <nav className="relative flex-1 py-3 overflow-y-auto overflow-x-hidden">
        <ul className={cn("space-y-0.5", collapsed ? "px-2" : "px-2.5")}>
          {itensVisiveis.map((item) => {
            const ativo = pathname === item.href || pathname.startsWith(item.href + "/");
            const hasBadge =
              (item.href === "/solicitacoes" && pendentes > 0) ||
              (item.href === "/pendencias"   && promessasHoje > 0);
            const badgeCount = item.href === "/solicitacoes" ? pendentes : promessasHoje;
            const badgeColor = item.href === "/solicitacoes" ? "bg-amber-500" : "bg-red-500";

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "relative flex items-center rounded-xl text-sm transition-all duration-200 group",
                    collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
                    ativo
                      ? "bg-gr-500/[0.12] text-white font-medium"
                      : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.03]"
                  )}
                >
                  {/* Left accent line on active */}
                  {ativo && !collapsed && (
                    <span className="absolute left-0 inset-y-2 w-[2px] rounded-full bg-gr-400 shadow-[0_0_8px_rgba(100,96,228,0.6)]" />
                  )}

                  <item.icon
                    size={15}
                    className={cn(
                      "flex-shrink-0 transition-all duration-200",
                      ativo
                        ? "text-gr-400"
                        : "text-slate-500 group-hover:text-slate-300"
                    )}
                  />

                  {!collapsed && (
                    <span className="flex-1 truncate">{item.label}</span>
                  )}

                  {/* Badge expanded */}
                  {!collapsed && hasBadge && (
                    <span className={cn(
                      "ml-auto text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none",
                      badgeColor
                    )}>
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}

                  {/* Badge collapsed dot */}
                  {collapsed && hasBadge && (
                    <span className={cn(
                      "absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full",
                      badgeColor
                    )} />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Frente filter ─────────────────────────────────────────── */}
      {["ADMINISTRADOR", "GESTOR"].includes(perfil) && (
        <div className={cn(
          "border-t border-white/[0.04]",
          collapsed ? "p-2" : "p-3"
        )}>
          {!collapsed ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] text-slate-600 font-semibold uppercase tracking-[0.15em]">Frente</span>
                {equipeIds.length > 0 && (
                  <button
                    onClick={clearFilter}
                    className="text-[9px] text-slate-600 hover:text-gr-400 transition-colors"
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
                        "px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all border",
                        ativo
                          ? "bg-brand-purple/15 text-brand-violet border-brand-purple/30 shadow-[0_0_8px_rgba(76,61,141,0.2)]"
                          : "bg-white/[0.02] text-slate-500 border-white/[0.05] hover:text-slate-300 hover:border-white/[0.09] hover:bg-white/[0.04]"
                      )}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
              {equipeIds.length === 0 && (
                <p className="text-[9px] text-slate-600 mt-1.5">Todas as frentes</p>
              )}
            </div>
          ) : (
            <button
              title={
                equipeIds.length > 0
                  ? equipeIds.map((id) => FRENTE_CHIPS.find((c) => c.id === id)?.label).join(", ")
                  : "Todas as frentes"
              }
              className={cn(
                "relative w-full flex justify-center p-2 rounded-lg transition-all",
                equipeIds.length > 0
                  ? "text-gr-400 bg-gr-500/10"
                  : "text-slate-600 hover:text-slate-300 hover:bg-white/[0.04]"
              )}
            >
              <SlidersHorizontal size={14} />
              {equipeIds.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-gr-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold leading-none">
                  {equipeIds.length}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Profile badge ──────────────────────────────────────────── */}
      {!collapsed && (
        <div className="p-3 border-t border-white/[0.04]">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white/[0.025] border border-white/[0.05]">
            <div className={cn(
              "w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0",
              perfil === "ADMINISTRADOR" && "bg-brand-purple/20 text-brand-violet",
              perfil === "GESTOR"        && "bg-amber-500/20 text-amber-400",
              perfil === "CONSULTOR"     && "bg-teal-500/20 text-teal-400",
            )}>
              {perfil === "ADMINISTRADOR" ? "A" : perfil === "GESTOR" ? "G" : "C"}
            </div>
            <span className={cn(
              "text-xs font-medium",
              perfil === "ADMINISTRADOR" && "text-brand-violet",
              perfil === "GESTOR"        && "text-amber-400",
              perfil === "CONSULTOR"     && "text-teal-400",
            )}>
              {perfil === "ADMINISTRADOR" ? "Administrador" : perfil === "GESTOR" ? "Gestor" : "Consultor"}
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
