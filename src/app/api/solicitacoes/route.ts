import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEquipesGerenciadas } from "@/lib/frentes";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const where: any = {};
  if (session.user.perfil === "CONSULTOR") {
    where.solicitanteId = session.user.id;
  } else if (session.user.perfil === "GESTOR") {
    // Gestor só vê solicitações de consultores das frentes que ele gerencia --
    // Administrador continua vendo todas.
    const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
    where.solicitante = { equipeId: { in: equipesGerenciadas } };
  }

  const solicitacoes = await prisma.solicitacao.findMany({
    where,
    include: {
      solicitante: {
        select: {
          nome: true,
          equipe: { select: { nome: true, tipo: true } },
        },
      },
      contrato: {
        select: {
          numero: true,
          cliente: { select: { nome: true } },
          empresa: { select: { nome: true } },
          carteiras: {
            where: { ativo: true },
            select: {
              consultor: {
                select: {
                  nome: true,
                  equipe: { select: { nome: true, tipo: true } },
                },
              },
            },
            orderBy: { atribuidoEm: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { criadoEm: "desc" },
  });

  // Resolve o nome de quem é o destino, quando a transferência for do tipo
  // "enviar" (o próprio dono empurrando o cliente pra um colega) -- sem
  // isso, o gestor só via "solicitante = dono atual" e o destino ficava
  // escondido dentro do texto livre do motivo.
  const destinoIds = [...new Set(
    solicitacoes
      .map((s) => (s.dados as { destinoConsultorId?: string } | null)?.destinoConsultorId)
      .filter((id): id is string => !!id)
  )];
  const destinos = destinoIds.length > 0
    ? await prisma.usuario.findMany({ where: { id: { in: destinoIds } }, select: { id: true, nome: true } })
    : [];
  const destinoPorId = new Map(destinos.map((d) => [d.id, d.nome]));

  const resultado = solicitacoes.map((s) => {
    const destinoId = (s.dados as { destinoConsultorId?: string } | null)?.destinoConsultorId;
    return { ...s, destinoConsultorNome: destinoId ? destinoPorId.get(destinoId) ?? null : null };
  });

  return NextResponse.json(resultado);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { tipo, motivo, contratoId, dados } = await req.json();

  // Pedido de "enviar" (consultor empurrando um contrato da PRÓPRIA carteira
  // pra um colega) só pode ser aberto sobre um contrato que realmente está
  // na carteira ativa de quem está pedindo -- sem isso, um consultor
  // conseguia forjar uma solicitação movendo contrato de outra pessoa,
  // mesmo dependendo de aprovação do gestor depois.
  if (
    tipo === "TRANSFERENCIA_CONTRATO" &&
    contratoId &&
    dados?.destinoConsultorId &&
    session.user.perfil === "CONSULTOR"
  ) {
    const naCarteira = await prisma.carteiraParcela.findFirst({
      where: { contratoId, consultorId: session.user.id, ativo: true },
    });
    if (!naCarteira) {
      return NextResponse.json({ erro: "Contrato não está na sua carteira" }, { status: 403 });
    }

    // destinoConsultorId nunca era validado -- dava pra forjar o pedido
    // apontando pra qualquer id do sistema (até um ADMINISTRADOR, ou
    // alguém de outra frente), confiando só na aprovação manual do gestor
    // como barreira. Agora exige que o destino seja um CONSULTOR ativo da
    // MESMA frente de quem está pedindo (acompanha o que o front-end já
    // restringe). Achado da revisão de segurança, 2026-09-16.
    const meuId = session.user.id;
    const [meuUsuario, minhasAdicionais] = await Promise.all([
      prisma.usuario.findUnique({ where: { id: meuId }, select: { equipeId: true } }),
      prisma.equipeConsultor.findMany({ where: { consultorId: meuId }, select: { equipeId: true } }),
    ]);
    const minhasFrentes = [meuUsuario?.equipeId, ...minhasAdicionais.map((f) => f.equipeId)].filter(Boolean) as string[];
    const destino = await prisma.usuario.findUnique({
      where: { id: dados.destinoConsultorId },
      select: { ativo: true, perfil: true, equipeId: true },
    });
    if (
      !destino || !destino.ativo || destino.perfil !== "CONSULTOR" ||
      !destino.equipeId || !minhasFrentes.includes(destino.equipeId)
    ) {
      return NextResponse.json({ erro: "Consultor de destino inválido" }, { status: 400 });
    }
  }

  const solicitacao = await prisma.solicitacao.create({
    data: {
      tipo,
      motivo,
      contratoId: contratoId || null,
      dados: dados || null,
      solicitanteId: session.user.id,
    },
  });

  return NextResponse.json(solicitacao, { status: 201 });
}
