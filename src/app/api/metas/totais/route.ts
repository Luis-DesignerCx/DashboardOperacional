import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEquipesGerenciadas } from "@/lib/frentes";

// Retorna o total de inadimplência de uma equipe (ou consultor) numa competência.
// Usado para calcular a prévia do valor alvo quando a meta é definida em %.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const equipeId = searchParams.get("equipeId");
  const competenciaId = searchParams.get("competenciaId");
  const consultorId = searchParams.get("consultorId");

  if (!equipeId || !competenciaId) {
    return NextResponse.json({ erro: "equipeId e competenciaId obrigatórios" }, { status: 400 });
  }

  // GESTOR só consulta total de uma frente que ele gerencia (achado real
  // da auditoria de segurança, 2026-09-15).
  if (session.user.perfil === "GESTOR") {
    const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
    if (!equipesGerenciadas.includes(equipeId)) {
      return NextResponse.json({ erro: "Sem permissão para esta frente" }, { status: 403 });
    }
  }

  let consultorIds: string[];
  let carteiraTeamOr: any[] | null = null;

  if (consultorId) {
    consultorIds = [consultorId];
  } else {
    const equipe = await prisma.equipe.findUnique({
      where: { id: equipeId },
      select: {
        tipo: true,
        usuarios: { where: { ativo: true, perfil: "CONSULTOR" }, select: { id: true } },
        consultoresAdic: { select: { consultor: { select: { id: true, ativo: true, perfil: true } } } },
      },
    });
    if (!equipe) return NextResponse.json({ totalInadimplencia: 0 });
    consultorIds = [
      ...equipe.usuarios.map((u) => u.id),
      ...equipe.consultoresAdic
        .filter((ec) => ec.consultor.ativo && ec.consultor.perfil === "CONSULTOR")
        .map((ec) => ec.consultor.id),
    ];
    // Usa a equipe "congelada" na carteira, não a equipe atual do usuário --
    // mesma regra do dashboard/comissão (ver comentário no schema).
    carteiraTeamOr = [{ tipoEquipe: equipe.tipo }, { tipoEquipe: null }];
  }

  // Mesma base do dashboard: soma o valorTotalAberto do CONTRATO (fixo), não
  // a soma ao vivo das parcelas em aberto -- antes usava parcela.aggregate
  // (paga:false), que caía a cada pagamento parcial e fazia o valor-alvo da
  // meta em % mudar sozinho durante o mês, mesmo sem a carteira ter mudado
  // (achado real: Leticia Cristina da Silva Sergio, 2026-09-22).
  const carteiras = await prisma.carteiraParcela.findMany({
    where: {
      consultorId: { in: consultorIds },
      competenciaId,
      ativo: true,
      contrato: { inadimplenciaEquivocada: false },
      ...(carteiraTeamOr ? { OR: carteiraTeamOr } : {}),
    },
    select: { contrato: { select: { valorTotalAberto: true } } },
  });
  const totalInadimplencia = carteiras.reduce((s, c) => s + Number(c.contrato.valorTotalAberto ?? 0), 0);

  return NextResponse.json({ totalInadimplencia });
}
