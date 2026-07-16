import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularComissaoMetas } from "@/lib/comissao";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const competenciaId = searchParams.get("competenciaId");
  const equipeIdParam = searchParams.get("equipeId");

  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

  const perfil = session.user.perfil;

  let consultores: { id: string; nome: string; equipeId: string | null }[] = [];

  if (perfil === "CONSULTOR") {
    const c = await prisma.usuario.findUnique({
      where: { id: session.user.id },
      select: { id: true, nome: true, equipeId: true },
    });
    if (c) consultores = [c];
  } else {
    const equipeAlvo = equipeIdParam ?? (perfil === "GESTOR" ? session.user.equipeId : null);
    if (!equipeAlvo) return NextResponse.json({ erro: "equipeId obrigatório" }, { status: 400 });

    // Consultor pertence à frente via equipeId primário OU via EquipeConsultor (frente adicional)
    consultores = await prisma.usuario.findMany({
      where: {
        ativo: true,
        perfil: "CONSULTOR",
        OR: [
          { equipeId: equipeAlvo },
          { frentesAdicionais: { some: { equipeId: equipeAlvo } } },
        ],
      },
      select: { id: true, nome: true, equipeId: true },
    });
  }

  if (consultores.length === 0) return NextResponse.json([]);

  const equipeId = equipeIdParam ?? (session.user as any).equipeId ?? consultores[0].equipeId;

  const [equipe, metas] = await Promise.all([
    equipeId ? prisma.equipe.findUnique({ where: { id: equipeId }, select: { comissaoBase: true } }) : null,
    equipeId ? prisma.meta.findMany({ where: { equipeId, competenciaId }, orderBy: { criadoEm: "asc" } }) : [],
  ]);

  const comissaoBase = Number(equipe?.comissaoBase ?? 0);

  const resultados = await Promise.all(
    consultores.map(async (consultor) => {
      // Saldo da carteira individual do consultor (para metas com percentualAlvo)
      const saldoAgg = await prisma.parcela.aggregate({
        where: {
          paga: false,
          equivocada: false,
          contrato: {
            inadimplenciaEquivocada: false,
            carteiras: { some: { consultorId: consultor.id, competenciaId, ativo: true } },
          },
        },
        _sum: { valorTotalAberto: true },
      });
      const saldoConsultor = Number(saldoAgg._sum.valorTotalAberto ?? 0);

      const [recebimentos, qtdRecuperados] = await Promise.all([
        prisma.recebimento.findMany({
          where: {
            consultorId: consultor.id,
            contrato: { carteiras: { some: { consultorId: consultor.id, competenciaId, ativo: true } } },
          },
          select: { valor: true, valorAParte: true },
        }),
        prisma.contrato.count({
          where: {
            statusRecuperacao: "RECUPERADO_INTEGRALMENTE",
            carteiras: { some: { consultorId: consultor.id, competenciaId, ativo: true } },
          },
        }),
      ]);

      const totalRecebido = recebimentos.reduce(
        (s, r) => s + Number(r.valor) + Number(r.valorAParte ?? 0),
        0
      );

      // Por tipo: meta individual substitui a da equipe apenas no mesmo tipo
      const tiposComEspecifica = new Set(
        metas.filter((m) => m.consultorId === consultor.id).map((m) => m.tipo)
      );
      const metasConsultor = metas.filter(
        (m) =>
          m.consultorId === consultor.id ||
          (m.consultorId === null && !tiposComEspecifica.has(m.tipo))
      );

      const metasComNota = metasConsultor.map((m) => {
        const valorAlvo = m.tipo === "QUANTIDADE"
          ? (m.quantidadeAlvo ? Number(m.quantidadeAlvo) : null)
          : m.percentualAlvo && saldoConsultor > 0
          ? (Number(m.percentualAlvo) / 100) * saldoConsultor
          : m.valorAlvo ? Number(m.valorAlvo) : null;
        return {
          id: m.id,
          nome: m.nome,
          tipo: m.tipo,
          peso: Number(m.peso),
          valorAlvo,
          thresholdsMonitoria: (m.thresholdsMonitoria as Record<string, number>) ?? null,
          notaMonitoria: ((m.resultadosConsultores as Record<string, number>) ?? {})[consultor.id] ?? 0,
        };
      });

      const { totalComissao, breakdown } = calcularComissaoMetas(comissaoBase, metasComNota, totalRecebido, qtdRecuperados);

      const metaFin = metasComNota.find((m) => m.tipo === "FINANCEIRA");
      const percentualMeta = metaFin?.valorAlvo ? (totalRecebido / metaFin.valorAlvo) * 100 : 0;
      const faixaAplicada = breakdown.find((b) => b.tipo === "FINANCEIRA")?.multiplicador ?? 0;

      return {
        id: consultor.id,
        nome: consultor.nome,
        totalRecebido,
        totalComissao,
        comissaoBase,
        breakdown,
        // compat fields
        recebido: totalRecebido,
        percentualMeta,
        faixaAplicada,
        valorFinal: totalComissao,
      };
    })
  );

  return NextResponse.json(resultados);
}
