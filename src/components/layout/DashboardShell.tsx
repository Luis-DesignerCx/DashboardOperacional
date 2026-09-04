"use client";

import { FrenteProvider } from "@/contexts/FrenteContext";
import { useScrollMemory } from "@/hooks/useScrollMemory";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  useScrollMemory("dashboard-main");
  return <FrenteProvider>{children}</FrenteProvider>;
}
