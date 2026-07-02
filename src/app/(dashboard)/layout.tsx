import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { SessaoGuard } from "@/components/SessaoGuard";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <DashboardShell>
      <div className="flex h-screen bg-slate-950 overflow-hidden">
        <Sidebar perfil={session.user.perfil} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header user={session.user} />
          <main className="flex-1 overflow-y-auto p-6 bg-slate-950">
            {children}
          </main>
        </div>
        <SessaoGuard />
      </div>
    </DashboardShell>
  );
}
