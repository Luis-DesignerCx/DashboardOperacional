import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEquipesGerenciadas } from "@/lib/frentes";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const ferias = await prisma.feriasConsultor.findUnique({
    where: { id: params.id },
    select: { id: true, consultorId: true, competenciaId: true, congelado: true, consultor: { select: { equipeId: true } } },
  });
  if (!ferias) return NextResponse.json({ erro: "Férias não encontradas" }, { status: 404 });

  // GESTOR só congela snapshot de consultor de uma frente que ele gerencia
  // (achado real da auditoria de segurança, 2026-09-15).
  if (session.user.perfil === "GESTOR") {
    const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
    if (!ferias.consultor.equipeId || !equipesGerenciadas.includes(ferias.consultor.equipeId)) {
      return NextResponse.json({ erro: "Sem permissão para este consultor" }, { status: 403 });
    }
  }

  const competencia = await prisma.competencia.findUnique({
    where: { id: ferias.competenciaId },
    select: { mes: true, ano: true },
  });
  if (!competencia) return NextResponse.json({ erro: "Competência não encontrada" }, { status: 404 });

  // Boundary UTC-3 (Brasília) explícito, igual ao resto do sistema -- antes
  // usava hora local do servidor; se o processo não roda no fuso de
  // Brasília, a virada de mês contava recebimento no mês errado só aqui
  // (achado real da varredura de consistência, 2026-09-22).
  const iniComp = new Date(Date.UTC(competencia.ano, competencia.mes - 1, 1, 3, 0, 0, 0));
  const fimComp = new Date(Date.UTC(competencia.ano, competencia.mes, 1, 2, 59, 59, 999));

  // Snapshot do saldo atual: soma o valorTotalAberto do CONTRATO (fixo), não
  // a soma ao vivo das parcelas em aberto -- antes usava parcela.aggregate
  // (paga:false), então o saldo congelado dependia do exato instante em que
  // alguém clicou "congelar" (se houve pagamento parcial minutos antes, o
  // snapshot já vinha "encolhido"), divergindo da Carteira Total normal do
  // consultor (achado real: Leticia Cristina da Silva Sergio, 2026-09-22).
  const saldoCarteiras = await prisma.carteiraParcela.findMany({
    where: {
      consultorId: ferias.consultorId,
      competenciaId: ferias.competenciaId,
      ativo: true,
      contrato: { inadimplenciaEquivocada: false },
    },
    select: { contrato: { select: { valorTotalAberto: true } } },
  });

  // Snapshot do total recebido na competência
  const recebidoAgg = await prisma.recebimento.aggregate({
    where: {
      consultorId: ferias.consultorId,
      contrato: {
        inadimplenciaEquivocada: false,
        carteiras: { some: { consultorId: ferias.consultorId, competenciaId: ferias.competenciaId, ativo: true } },
      },
      dataRecebimento: { gte: iniComp, lte: fimComp },
    },
    _sum: { valor: true, valorAParte: true },
  });

  // Snapshot da meta alvo
  const metas = await prisma.meta.findMany({
    where: {
      equipe: { usuarios: { some: { id: ferias.consultorId } } },
      competenciaId: ferias.competenciaId,
      OR: [{ consultorId: null }, { consultorId: ferias.consultorId }],
      tipo: "FINANCEIRA",
    },
    select: { valorAlvo: true, percentualAlvo: true, consultorId: true },
  });

  const metaEsp = metas.find((m) => m.consultorId === ferias.consultorId) ?? null;
  const metaGlobal = metas.find((m) => m.consultorId === null) ?? null;
  const meta = metaEsp ?? metaGlobal;

  const saldo = saldoCarteiras.reduce((s, c) => s + Number(c.contrato.valorTotalAberto ?? 0), 0);
  const recebido = Number(recebidoAgg._sum.valor ?? 0) + Number(recebidoAgg._sum.valorAParte ?? 0);

  const metaAlvo = meta
    ? meta.percentualAlvo && saldo > 0
      ? (Number(meta.percentualAlvo) / 100) * saldo
      : meta.valorAlvo ? Number(meta.valorAlvo) : null
    : null;

  await prisma.feriasConsultor.update({
    where: { id: params.id },
    data: {
      congelado: true,
      congeladoEm: new Date(),
      snapshotSaldo: saldo,
      snapshotRecebido: recebido,
      snapshotMetaAlvo: metaAlvo,
    },
  });

  return NextResponse.json({ ok: true, snapshotSaldo: saldo, snapshotRecebido: recebido, snapshotMetaAlvo: metaAlvo });
}
