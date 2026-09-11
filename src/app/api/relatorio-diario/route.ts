import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEquipesGerenciadas } from "@/lib/frentes";

// Mesmo padrão de fronteira usado em toda competência (UTC+3h = meia-noite
// Brasil) -- aqui pra um único dia, não o mês inteiro.
function limitesDoDia(dataStr: string) {
  const ini = new Date(`${dataStr}T03:00:00.000Z`);
  const fim = new Date(ini.getTime() + 24 * 3600 * 1000);
  return { ini, fim };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dataParam = searchParams.get("data") || new Date().toISOString().slice(0, 10);
  const { ini, fim } = limitesDoDia(dataParam);

  // Escopo de consultores: Consultor só vê a si mesmo; Gestor só vê as
  // frentes que gerencia (mesmo padrão de Solicitações/Dashboard);
  // Administrador vê todos.
  let consultorIdsEscopo: string[] | null = null;
  if (session.user.perfil === "CONSULTOR") {
    consultorIdsEscopo = [session.user.id];
  } else if (session.user.perfil === "GESTOR") {
    const equipes = await getEquipesGerenciadas(session.user.id);
    const consultoresDasFrentes = await prisma.usuario.findMany({
      where: { perfil: "CONSULTOR", equipeId: { in: equipes } },
      select: { id: true },
    });
    consultorIdsEscopo = consultoresDasFrentes.map((c) => c.id);
  }

  const recebimentos = await prisma.recebimento.findMany({
    where: {
      dataRecebimento: { gte: ini, lt: fim },
      ...(consultorIdsEscopo ? { consultorId: { in: consultorIdsEscopo } } : {}),
    },
    select: {
      id: true, valor: true, valorAParte: true, formaPagamento: true, justificativa: true, criadoEm: true,
      consultorId: true,
      contrato: { select: { numero: true, cliente: { select: { nome: true } }, empresa: { select: { nome: true } } } },
    },
    orderBy: { criadoEm: "desc" },
  });

  const porConsultor = new Map<string, { valor: number; valorAParte: number; itens: typeof recebimentos }>();
  for (const r of recebimentos) {
    if (!porConsultor.has(r.consultorId)) porConsultor.set(r.consultorId, { valor: 0, valorAParte: 0, itens: [] });
    const reg = porConsultor.get(r.consultorId)!;
    reg.valor += Number(r.valor);
    reg.valorAParte += Number(r.valorAParte ?? 0);
    reg.itens.push(r);
  }

  // Roster de consultores a exibir: todos os ativos dentro do escopo (pra
  // mostrar também quem recebeu R$0 hoje) + qualquer um que tenha
  // recebimento hoje mesmo se estiver inativo agora (não esconde dinheiro
  // real por causa de status atual do usuário).
  const whereRoster: any = { perfil: "CONSULTOR", ativo: true };
  if (consultorIdsEscopo) whereRoster.id = { in: consultorIdsEscopo };
  const roster = await prisma.usuario.findMany({ where: whereRoster, select: { id: true, nome: true } });

  const idsExtras = [...porConsultor.keys()].filter((id) => !roster.some((u) => u.id === id));
  const extras = idsExtras.length
    ? await prisma.usuario.findMany({ where: { id: { in: idsExtras } }, select: { id: true, nome: true } })
    : [];

  const resultado = [...roster, ...extras]
    .map((c) => {
      const reg = porConsultor.get(c.id);
      return {
        id: c.id,
        nome: c.nome,
        totalRecebido: reg?.valor ?? 0,
        totalAParte: reg?.valorAParte ?? 0,
        itens: (reg?.itens ?? []).map((r) => ({
          id: r.id,
          contrato: r.contrato.numero,
          cliente: r.contrato.cliente.nome,
          empresa: r.contrato.empresa.nome,
          valor: Number(r.valor),
          valorAParte: Number(r.valorAParte ?? 0),
          formaPagamento: r.formaPagamento,
          observacao: r.justificativa,
          hora: r.criadoEm,
        })),
      };
    })
    .sort((a, b) => (b.totalRecebido + b.totalAParte) - (a.totalRecebido + a.totalAParte));

  const totalGeral = resultado.reduce((s, c) => s + c.totalRecebido + c.totalAParte, 0);

  return NextResponse.json({ data: dataParam, totalGeral, consultores: resultado });
}
