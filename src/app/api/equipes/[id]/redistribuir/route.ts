import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { distribuirCarteira } from "@/utils/distribuicao-carteira";
import { CONFIG_EQUIPES } from "@/constants/equipes";
import { TipoEquipe } from "@prisma/client";
import { getEquipesGerenciadas } from "@/lib/frentes";
import { reatribuirRecebimentosDaCarteira } from "@/lib/recebimento";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  if (!["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  // GESTOR só redistribui uma frente que ele gerencia -- essa rota APAGA e
  // recria a carteira inteira da faixa; sem essa checagem, qualquer gestor
  // conseguia apagar/redistribuir a carteira de qualquer outra frente
  // (achado real da revisão de segurança, 2026-09-16).
  if (session.user.perfil === "GESTOR") {
    const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
    if (!equipesGerenciadas.includes(params.id)) {
      return NextResponse.json({ erro: "Sem permissão para esta frente" }, { status: 403 });
    }
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

  // Cliente com mais de 1 contrato nesta faixa fica sempre no mesmo
  // consultor -- não existe deduplicação de Cliente no sistema (cada
  // contrato tem seu próprio registro, mesma pessoa real aparece em
  // várias linhas), então o match é por nome normalizado. Contrato que já
  // tem recebimento registrado nesta competência NUNCA muda de dono; os
  // demais contratos do mesmo cliente seguem pro consultor que recebeu.
  // Achado real: 156 clientes com contratos em consultores diferentes,
  // corrigido manualmente em 2026-09-18 -- isso evita que a própria
  // redistribuição em massa recrie o problema.
  function normalizarNome(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }

  const clientesPorContrato = await prisma.contrato.findMany({
    where: { id: { in: contratoIds } },
    select: { id: true, cliente: { select: { nome: true } } },
  });
  const nomePorContrato = new Map(clientesPorContrato.map((c) => [c.id, normalizarNome(c.cliente.nome)]));

  const comp = await prisma.competencia.findUnique({ where: { id: competenciaId }, select: { mes: true, ano: true } });
  let recebimentoPorContrato = new Map<string, string>();
  if (comp) {
    const ini = new Date(Date.UTC(comp.ano, comp.mes - 1, 1, 3, 0, 0, 0));
    const fim = new Date(Date.UTC(comp.ano, comp.mes, 1, 2, 59, 59, 999));
    const recs = await prisma.recebimento.findMany({
      where: { contratoId: { in: contratoIds }, dataRecebimento: { gte: ini, lte: fim } },
      select: { contratoId: true, consultorId: true },
    });
    recebimentoPorContrato = new Map(recs.map((r) => [r.contratoId, r.consultorId]));
  }

  // Agrupa por nome de cliente pra achar quem já tem recebimento no grupo
  // -- e pra decidir pra quem os contratos SEM recebimento daquele cliente
  // seguem, quando dá pra decidir (só 1 consultor com recebimento no grupo).
  const contratosPorNome = new Map<string, typeof contratos>();
  for (const c of contratos) {
    const nome = nomePorContrato.get(c.id)!;
    if (!contratosPorNome.has(nome)) contratosPorNome.set(nome, []);
    contratosPorNome.get(nome)!.push(c);
  }
  const anchorPorNome = new Map<string, string>();
  for (const [nome, lista] of contratosPorNome) {
    const consultoresComReceb = new Set(
      lista.filter((c) => recebimentoPorContrato.has(c.id)).map((c) => recebimentoPorContrato.get(c.id)!)
    );
    if (consultoresComReceb.size === 1) anchorPorNome.set(nome, [...consultoresComReceb][0]);
    // 0 ou 2+ consultores com recebimento diferentes no grupo: sem âncora
    // única -- os contratos SEM recebimento próprio desse cliente seguem
    // pra distribuição normal (caso raro e ambíguo, tratado à parte).
  }

  // Apaga carteiras existentes desta competência para esses contratos
  await prisma.carteiraParcela.deleteMany({
    where: { competenciaId, contratoId: { in: contratoIds } },
  });

  const novas: { id: string; contratoId: string; consultorId: string; competenciaId: string; tipoEquipe: TipoEquipe }[] = [];
  const paraDistribuirGreedy: typeof contratos = [];
  for (const c of contratos) {
    // Contrato que já tem recebimento próprio NUNCA muda de dono.
    const recebPróprio = recebimentoPorContrato.get(c.id);
    if (recebPróprio) {
      novas.push({ id: randomUUID(), contratoId: c.id, consultorId: recebPróprio, competenciaId, tipoEquipe: equipe.tipo });
      continue;
    }
    // Sem recebimento próprio, mas outro contrato do mesmo cliente tem --
    // segue pro mesmo consultor (se houver uma âncora única pro cliente).
    const anchor = anchorPorNome.get(nomePorContrato.get(c.id)!);
    if (anchor) {
      novas.push({ id: randomUUID(), contratoId: c.id, consultorId: anchor, competenciaId, tipoEquipe: equipe.tipo });
      continue;
    }
    paraDistribuirGreedy.push(c);
  }

  // Redistribui os que não têm consultor fixo por recebimento
  const atribuicoes = distribuirCarteira(
    paraDistribuirGreedy.map((c) => ({
      contratoId: c.id,
      clienteId: c.clienteId,
      valorTotalAberto: Number(c.valorTotalAberto ?? 0),
    })),
    equipe.usuarios.map((u) => u.id)
  );

  // Mesmo cliente, 2+ contratos SEM recebimento caindo em consultores
  // diferentes neste mesmo lote -- une no primeiro consultor encontrado.
  const consultorPorNomeNoLote = new Map<string, string>();
  for (const at of atribuicoes) {
    for (const contratoId of at.contratoIds) {
      const nome = nomePorContrato.get(contratoId)!;
      const consultorFinal = consultorPorNomeNoLote.get(nome) ?? at.consultorId;
      consultorPorNomeNoLote.set(nome, consultorFinal);
      novas.push({ id: randomUUID(), contratoId, consultorId: consultorFinal, competenciaId, tipoEquipe: equipe.tipo });
    }
  }

  // Insere em lotes
  for (let i = 0; i < novas.length; i += 3000) {
    await prisma.carteiraParcela.createMany({ data: novas.slice(i, i + 3000), skipDuplicates: true });
  }

  // Recebimento pertence a quem tem a carteira hoje -- redistribuir a
  // carteira inteira precisa levar junto os recebimentos já registrados
  // nesta competência pros contratos que mudaram de dono.
  const contratosPorConsultorFinal = new Map<string, string[]>();
  for (const n of novas) {
    if (!contratosPorConsultorFinal.has(n.consultorId)) contratosPorConsultorFinal.set(n.consultorId, []);
    contratosPorConsultorFinal.get(n.consultorId)!.push(n.contratoId);
  }
  for (const [consultorId, ids] of contratosPorConsultorFinal) {
    await reatribuirRecebimentosDaCarteira(ids, competenciaId, consultorId);
  }

  return NextResponse.json({ redistribuidos: novas.length, consultores: equipe.usuarios.length });
}
