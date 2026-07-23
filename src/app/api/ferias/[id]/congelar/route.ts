import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const ferias = await prisma.feriasConsultor.findUnique({
    where: { id: params.id },
    select: { id: true, consultorId: true, competenciaId: true, congelado: true },
  });
  if (!ferias) return NextResponse.json({ erro: "Férias não encontradas" }, { status: 404 });

  const competencia = await prisma.competencia.findUnique({
    where: { id: ferias.competenciaId },
    select: { mes: true, ano: true },
  });
  if (!competencia) return NextResponse.json({ erro: "Competência não encontrada" }, { status: 404 });

  const iniComp = new Date(competencia.ano, competencia.mes - 1, 1);
  const fimComp = new Date(competencia.ano, competencia.mes, 0, 23, 59, 59, 999);

  // Snapshot do saldo atual (parcelas em aberto, inclui remanejadas)
  const saldoAgg = await prisma.parcela.aggregate({
    where: {
      paga: false,
      equivocada: false,
      contrato: {
        inadimplenciaEquivocada: false,
        carteiras: { some: { consultorId: ferias.consultorId, competenciaId: ferias.competenciaId, ativo: true } },
      },
    },
    _sum: { valorTotalAberto: true },
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

  const saldo = Number(saldoAgg._sum.valorTotalAberto ?? 0);
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
