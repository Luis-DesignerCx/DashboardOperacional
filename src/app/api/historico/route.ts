import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEquipesGerenciadas } from "@/lib/frentes";

// GET /api/historico — lista competências com resumo de importações
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  // GESTOR só vê contagem/inadimplência das frentes que gerencia -- sem
  // isso, qualquer gestor via o total agregado da empresa inteira em
  // cada competência (achado real da auditoria de segurança, 2026-09-15).
  const equipesGerenciadas = session.user.perfil === "GESTOR"
    ? await getEquipesGerenciadas(session.user.id)
    : null;

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
          detalhesErros: true,
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
      const where: any = { competenciaId: comp.id };
      if (equipesGerenciadas) where.consultor = { equipeId: { in: equipesGerenciadas } };

      const carteiras = await prisma.carteiraParcela.count({ where });

      // Contratos atribuídos nesta competência
      const totalContratos = carteiras;

      // Soma inadimplência: valor total aberto de contratos desta competência
      const agg = await prisma.carteiraParcela.findMany({
        where,
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
