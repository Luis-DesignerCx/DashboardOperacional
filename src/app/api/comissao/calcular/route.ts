import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularComissao } from "@/constants/comissao";
import { getEquipesGerenciadas } from "@/lib/frentes";

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

  // Busca meta da equipe/competência
  const meta = await prisma.meta.findFirst({ where: { equipeId, competenciaId } });
  if (!meta) {
    return NextResponse.json({ erro: "Nenhuma meta configurada para esta equipe/competência" }, { status: 400 });
  }

  // Busca consultores ativos da equipe
  const consultores = await prisma.usuario.findMany({
    where: { equipeId, ativo: true, perfil: "CONSULTOR" },
    select: { id: true, nome: true },
  });

  if (consultores.length === 0) {
    return NextResponse.json({ erro: "Nenhum consultor ativo na equipe" }, { status: 400 });
  }

  // Para cada consultor: soma recebimentos (valor + valorAParte) dos contratos na carteira
  const resultados = await Promise.all(
    consultores.map(async (consultor) => {
      const recebimentos = await prisma.recebimento.findMany({
        where: {
          consultorId: consultor.id,
          contrato: {
            carteiras: { some: { consultorId: consultor.id, competenciaId, ativo: true } },
          },
        },
        select: { valor: true, valorAParte: true },
      });

      // Comissão: valor normal + valorAParte
      const totalComissao = recebimentos.reduce(
        (s, r) => s + Number(r.valor) + Number(r.valorAParte ?? 0),
        0
      );
      const metaValor = Number(meta.valorAlvo);
      const percentualMeta = metaValor > 0 ? (totalComissao / metaValor) * 100 : 0;
      const { faixa, valor } = calcularComissao(totalComissao, percentualMeta);

      // Upsert na tabela Comissao (permite recalcular)
      const existing = await prisma.comissao.findFirst({
        where: { usuarioId: consultor.id, equipeId, competenciaId },
      });

      if (existing) {
        await prisma.comissao.update({
          where: { id: existing.id },
          data: {
            valorBase: totalComissao,
            percentualMeta,
            faixaAplicada: faixa,
            valorFinal: valor,
            calculadoEm: new Date(),
          },
        });
      } else {
        await prisma.comissao.create({
          data: {
            equipeId,
            competenciaId,
            usuarioId: consultor.id,
            valorBase: totalComissao,
            percentualMeta,
            faixaAplicada: faixa,
            valorFinal: valor,
          },
        });
      }

      return {
        consultorId: consultor.id,
        consultorNome: consultor.nome,
        totalComissao,
        percentualMeta,
        faixaAplicada: faixa,
        valorFinal: valor,
      };
    })
  );

  return NextResponse.json({ ok: true, resultados });
}
