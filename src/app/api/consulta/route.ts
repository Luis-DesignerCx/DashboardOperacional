import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  const contratos = await prisma.contrato.findMany({
    where: {
      OR: [
        { cliente: { nome: { contains: q, mode: "insensitive" } } },
        { numero: { contains: q, mode: "insensitive" } },
        { cliente: { cpf: { contains: q, mode: "insensitive" } } },
        { cliente: { telefones: { contains: q, mode: "insensitive" } } },
      ],
    },
    select: {
      id: true,
      numero: true,
      valorTotalAberto: true,
      maiorDiasAtraso: true,
      statusRecuperacao: true,
      cliente: { select: { id: true, nome: true, cpf: true, telefones: true, emails: true } },
      empresa: { select: { nome: true } },
      carteiras: {
        where: { ativo: true },
        select: {
          consultor: {
            select: {
              id: true,
              nome: true,
              equipe: { select: { nome: true } },
            },
          },
          competencia: { select: { descricao: true } },
        },
        orderBy: { atribuidoEm: "desc" },
        take: 1,
      },
    },
    orderBy: { maiorDiasAtraso: "desc" },
    take: 25,
  });

  // Consultor precisa achar QUALQUER cliente pra saber de quem é (ex: cliente
  // liga, ele precisa identificar o responsável) -- por isso a busca continua
  // sem filtro de carteira acima. Mas CPF, telefone, e-mail e situação
  // financeira só aparecem pra quem é dono do contrato (carteira ativa do
  // próprio consultor); pra qualquer outro caso, só nome do cliente e quem é
  // o consultor/frente responsável. Corrige o achado C4 da auditoria de
  // segurança (2026-09-15) sem quebrar o caso de uso real (decisão do
  // usuário, 2026-09-15: "o consultor precisa conseguir consultar na
  // competência inteira pra saber de quem é aquele cliente").
  const resultado = contratos.map((c) => {
    const donoDoContrato = c.carteiras[0]?.consultor.id === session.user.id;
    const podeVerDetalhes = session.user.perfil !== "CONSULTOR" || donoDoContrato;
    return {
      ...c,
      naMinhaCarteira: podeVerDetalhes,
      valorTotalAberto: podeVerDetalhes ? c.valorTotalAberto : null,
      maiorDiasAtraso: podeVerDetalhes ? c.maiorDiasAtraso : null,
      statusRecuperacao: podeVerDetalhes ? c.statusRecuperacao : null,
      cliente: {
        ...c.cliente,
        cpf: podeVerDetalhes ? c.cliente.cpf : null,
        telefones: podeVerDetalhes ? c.cliente.telefones : null,
        emails: podeVerDetalhes ? c.cliente.emails : null,
      },
    };
  });

  return NextResponse.json(resultado);
}
