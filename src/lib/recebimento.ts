import { prisma } from "@/lib/prisma";

// Recebimento pertence a quem tem a carteira do contrato HOJE, não a quem
// registrou -- regra confirmada em 2026-09-17. Sempre que uma carteira
// muda de dono dentro de uma competência já em andamento, os recebimentos
// já registrados pro(s) contrato(s) NESSA competência precisam seguir pro
// novo dono, ou ficam "presos" no consultor antigo até alguém rodar um
// ajuste manual (foi o que aconteceu com a Selma, Roberta e Leticia).
export async function reatribuirRecebimentosDaCarteira(
  contratoIds: string[],
  competenciaId: string,
  novoConsultorId: string
) {
  if (!contratoIds.length) return;

  const competencia = await prisma.competencia.findUnique({
    where: { id: competenciaId },
    select: { mes: true, ano: true },
  });
  if (!competencia) return;

  const ini = new Date(Date.UTC(competencia.ano, competencia.mes - 1, 1, 3, 0, 0, 0));
  const fim = new Date(Date.UTC(competencia.ano, competencia.mes, 1, 2, 59, 59, 999));

  await prisma.recebimento.updateMany({
    where: {
      contratoId: { in: contratoIds },
      dataRecebimento: { gte: ini, lte: fim },
      consultorId: { not: novoConsultorId },
    },
    data: { consultorId: novoConsultorId },
  });
}
