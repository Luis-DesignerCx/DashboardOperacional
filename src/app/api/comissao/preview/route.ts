import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularComissao } from "@/constants/comissao";

// GET /api/comissao/preview?competenciaId=X&equipeId=Y
// Retorna projeção de comissão por consultor sem gravar no banco.
// Para CONSULTOR retorna somente seus dados; GESTOR/ADMIN retorna equipe inteira.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const competenciaId = searchParams.get("competenciaId");
  const equipeIdParam = searchParams.get("equipeId");

  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

  const perfil = session.user.perfil;

  // Determina quais consultores buscar
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

  // Meta: para GESTOR usa equipe própria; para ADMIN usa equipeIdParam
  const equipeId = perfil === "GESTOR" ? session.user.equipeId : equipeIdParam ?? consultores[0].equipeId;
  const meta = equipeId
    ? await prisma.meta.findFirst({ where: { equipeId, competenciaId } })
    : null;

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

      // Comissão inclui "a parte"
      const totalComissao = recebimentos.reduce(
        (s, r) => s + Number(r.valor) + Number(r.valorAParte ?? 0),
        0
      );
      const metaValor = meta ? Number(meta.valorAlvo) : 0;
      const percentualMeta = metaValor > 0 ? (totalComissao / metaValor) * 100 : 0;
      const { faixa, valor } = calcularComissao(totalComissao, percentualMeta);

      return {
        id: consultor.id,
        nome: consultor.nome,
        recebido: totalComissao,
        percentualMeta,
        faixaAplicada: faixa,
        valorFinal: valor,
      };
    })
  );

  return NextResponse.json(resultados);
}
