import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DashboardConsultor } from "@/components/charts/DashboardConsultor";
import { DashboardGestor } from "@/components/charts/DashboardGestor";
import { DashboardExecutivo } from "@/components/charts/DashboardExecutivo";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const { perfil } = session.user;

  return (
    <div>
      {perfil === "CONSULTOR" && <DashboardConsultor />}
      {perfil === "GESTOR" && <DashboardGestor />}
      {perfil === "ADMINISTRADOR" && <DashboardExecutivo />}
    </div>
  );
}
