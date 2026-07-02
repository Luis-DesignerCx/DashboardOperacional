import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { distribuirCarteira } from "@/utils/distribuicao-carteira";
import { CONFIG_EQUIPES } from "@/constants/equipes";
import { TipoEquipe } from "@prisma/client";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  if (!["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { competenciaId } = await req.json();
  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

  const equipe = await prisma.equipe.findUnique({
    where: { id: params.id },
    include: {
      usuarios: {
        where: { ativo: true, perfil: "CONSULTOR", emFerias: false },
        select: { id: true },
      },
    },
  });
  if (!equipe) return NextResponse.json({ erro: "Frente não encontrada" }, { status: 404 });
  if (!equipe.usuarios.length) {
    return NextResponse.json({ erro: "Nenhum colaborador ativo nesta frente" }, { status: 400 });
  }

  const config = CONFIG_EQUIPES[equipe.tipo as TipoEquipe];
  const [minDias, maxDias] = config.diasAtraso;

  // Busca contratos desta faixa de dias (base mensal, não flash)
  const contratos = await prisma.contrato.findMany({
    where: {
      ativo: true,
      maiorDiasAtraso: { gte: minDias, lte: maxDias },
    },
    select: { id: true, clienteId: true, maiorDiasAtraso: true, valorTotalAberto: true },
  });

  if (!contratos.length) {
    return NextResponse.json({ aviso: "Nenhum contrato nesta faixa de inadimplência", redistribuidos: 0 });
  }

  const contratoIds = contratos.map((c) => c.id);

  // Apaga carteiras existentes desta competência para esses contratos
  await prisma.carteiraParcela.deleteMany({
    where: { competenciaId, contratoId: { in: contratoIds } },
  });

  // Redistribui
  const atribuicoes = distribuirCarteira(
    contratos.map((c) => ({
      contratoId: c.id,
      clienteId: c.clienteId,
      valorTotalAberto: Number(c.valorTotalAberto ?? 0),
    })),
    equipe.usuarios.map((u) => u.id)
  );

  const novas: { id: string; contratoId: string; consultorId: string; competenciaId: string }[] = [];
  for (const at of atribuicoes) {
    for (const contratoId of at.contratoIds) {
      novas.push({ id: randomUUID(), contratoId, consultorId: at.consultorId, competenciaId });
    }
  }

  // Insere em lotes
  for (let i = 0; i < novas.length; i += 3000) {
    await prisma.carteiraParcela.createMany({ data: novas.slice(i, i + 3000), skipDuplicates: true });
  }

  return NextResponse.json({ redistribuidos: novas.length, consultores: equipe.usuarios.length });
}
