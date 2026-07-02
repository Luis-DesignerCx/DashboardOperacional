"use client";

import { FrenteProvider } from "@/contexts/FrenteContext";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return <FrenteProvider>{children}</FrenteProvider>;
}
