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

  let whereConsultores: any = { ativo: true, perfil: "CONSULTOR" };
  if (perfil === "CONSULTOR") {
    whereConsultores.id = session.user.id;
  } else if (perfil === "GESTOR") {
    whereConsultores.equipeId = session.user.equipeId;
  } else if (equipeIdParam) {
    whereConsultores.equipeId = equipeIdParam;
  }

  const consultores = await prisma.usuario.findMany({
    where: whereConsultores,
    select: { id: true, nome: true, equipeId: true },
  });

  if (consultores.length === 0) return NextResponse.json([]);

  const equipeId = perfil === "GESTOR"
    ? (session.user as any).equipeId
    : equipeIdParam ?? consultores[0].equipeId;

  const [equipe, metas] = await Promise.all([
    equipeId ? prisma.equipe.findUnique({ where: { id: equipeId }, select: { comissaoBase: true } }) : null,
    equipeId ? prisma.meta.findMany({ where: { equipeId, competenciaId }, orderBy: { criadoEm: "asc" } }) : [],
  ]);

  const comissaoBase = Number(equipe?.comissaoBase ?? 0);

  const resultados = await Promise.all(
    consultores.map(async (consultor) => {
      const recebimentos = await prisma.recebimento.findMany({
        where: {
          consultorId: consultor.id,
          contrato: { carteiras: { some: { consultorId: consultor.id, competenciaId, ativo: true } } },
        },
        select: { valor: true, valorAParte: true },
      });

      const totalRecebido = recebimentos.reduce(
        (s, r) => s + Number(r.valor) + Number(r.valorAParte ?? 0),
        0
      );

      const metasComNota = metas.map((m) => ({
        id: m.id,
        nome: m.nome,
        tipo: m.tipo,
        peso: Number(m.peso),
        valorAlvo: m.valorAlvo ? Number(m.valorAlvo) : null,
        thresholdsMonitoria: (m.thresholdsMonitoria as Record<string, number>) ?? null,
        notaMonitoria: ((m.resultadosConsultores as Record<string, number>) ?? {})[consultor.id] ?? 0,
      }));

      const { totalComissao, breakdown } = calcularComissaoMetas(comissaoBase, metasComNota, totalRecebido);

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
