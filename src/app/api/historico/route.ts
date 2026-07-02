import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/historico — lista competências com resumo de importações
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const competencias = await prisma.competencia.findMany({
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
    include: {
      importacoes: {
        orderBy: { criadoEm: "desc" },
        take: 1,
        select: {
          id: true,
          nomeArquivo: true,
          totalContratos: true,
          totalLinhas: true,
          erros: true,
          status: true,
          criadoEm: true,
          concluidoEm: true,
        },
      },
    },
  });

  // Para cada competência, conta contratos e soma inadimplência
  const resultado = await Promise.all(
    competencias.map(async (comp) => {
      const carteiras = await prisma.carteiraParcela.count({
        where: { competenciaId: comp.id },
      });

      // Contratos atribuídos nesta competência
      const totalContratos = carteiras;

      // Soma inadimplência: valor total aberto de contratos desta competência
      const agg = await prisma.carteiraParcela.findMany({
        where: { competenciaId: comp.id },
        include: {
          contrato: { select: { valorTotalAberto: true } },
        },
      });

      const inadimplencia = agg.reduce(
        (sum, cp) => sum + Number(cp.contrato.valorTotalAberto ?? 0),
        0
      );

      return {
        id: comp.id,
        descricao: comp.descricao,
        mes: comp.mes,
        ano: comp.ano,
        fechada: comp.fechada,
        fechadaEm: comp.fechadaEm,
        totalContratos,
        inadimplencia,
        ultimaImportacao: comp.importacoes[0] ?? null,
      };
    })
  );

  return NextResponse.json(resultado);
}
