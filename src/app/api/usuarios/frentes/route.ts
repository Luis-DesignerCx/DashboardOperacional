import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEquipesGerenciadas, frenteLabel } from "@/lib/frentes";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const equipeIds = await getEquipesGerenciadas(session.user.id);

  return NextResponse.json(
    equipeIds.map((id) => ({ equipeId: id, label: frenteLabel(id) }))
  );
}
