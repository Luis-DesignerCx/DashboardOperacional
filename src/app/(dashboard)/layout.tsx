import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { SessaoGuard } from "@/components/SessaoGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getEquipesGerenciadas } from "@/lib/frentes";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Gestor só pode filtrar pelas próprias frentes (principal + adicionais) --
  // mesma regra que /api/dashboard já aplica no servidor. Administrador
  // continua vendo/filtrando todas (undefined = sem restrição).
  const equipesGerenciadas = session.user.perfil === "GESTOR"
    ? await getEquipesGerenciadas(session.user.id)
    : undefined;

  return (
    <DashboardShell>
      <div className="flex h-screen bg-surface-0 overflow-hidden">
        <Sidebar perfil={session.user.perfil} equipesGerenciadas={equipesGerenciadas} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header user={session.user} />
          <main id="dashboard-main" className="flex-1 overflow-y-auto p-5 bg-surface-0">
            {children}
          </main>
        </div>
        <SessaoGuard />
      </div>
    </DashboardShell>
  );
}
