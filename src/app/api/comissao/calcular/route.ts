import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEquipesGerenciadas } from "@/lib/frentes";
import { calcularComissaoMetas } from "@/lib/comissao";
import { Decimal } from "@prisma/client/runtime/library";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { equipeId, competenciaId } = await req.json();
  if (!equipeId || !competenciaId) {
    return NextResponse.json({ erro: "equipeId e competenciaId são obrigatórios" }, { status: 400 });
  }

  if (session.user.perfil === "GESTOR") {
    const gerenciadas = await getEquipesGerenciadas(session.user.id);
    if (!gerenciadas.includes(equipeId)) {
      return NextResponse.json({ erro: "Sem permissão para esta equipe" }, { status: 403 });
    }
  }

  const equipe = await prisma.equipe.findUnique({
    where: { id: equipeId },
    select: { comissaoBase: true },
  });
  const comissaoBase = Number(equipe?.comissaoBase ?? 0);

  if (comissaoBase <= 0) {
    return NextResponse.json({ erro: "Configure o valor base (100%) desta frente antes de calcular" }, { status: 400 });
  }

  const metas = await prisma.meta.findMany({
    where: { equipeId, competenciaId },
    orderBy: { criadoEm: "asc" },
  });

  if (metas.length === 0) {
    return NextResponse.json({ erro: "Nenhuma meta configurada para esta equipe/competência" }, { status: 400 });
  }

  const consultores = await prisma.usuario.findMany({
    where: {
      ativo: true,
      perfil: "CONSULTOR",
      OR: [
        { equipeId },
        { frentesAdicionais: { some: { equipeId } } },
      ],
    },
    select: { id: true, nome: true },
  });

  if (consultores.length === 0) {
    return NextResponse.json({ erro: "Nenhum consultor ativo na equipe" }, { status: 400 });
  }

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

      const existing = await prisma.comissao.findFirst({
        where: { usuarioId: consultor.id, equipeId, competenciaId },
      });

      const comissaoData = {
        valorBase: new Decimal(String(comissaoBase)),
        percentualMeta: new Decimal(percentualMeta.toFixed(2)),
        faixaAplicada: new Decimal(String(faixaAplicada)),
        valorFinal: new Decimal(totalComissao.toFixed(2)),
        breakdown: breakdown as any,
        calculadoEm: new Date(),
      };

      if (existing) {
        await prisma.comissao.update({ where: { id: existing.id }, data: comissaoData });
      } else {
        await prisma.comissao.create({ data: { equipeId, competenciaId, usuarioId: consultor.id, ...comissaoData } });
      }

      return { consultorId: consultor.id, consultorNome: consultor.nome, totalRecebido, totalComissao, breakdown };
    })
  );

  return NextResponse.json({ ok: true, resultados });
}
