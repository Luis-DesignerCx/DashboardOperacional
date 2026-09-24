import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { SituacaoContrato } from "@prisma/client";
import { parsearValorMonetario } from "@/lib/utils";
import { getEquipesGerenciadas } from "@/lib/frentes";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const isGestorAdmin = ["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil);
  const body = await req.json();
  const { maiorDiasAtraso, valorTotalAberto, statusContrato, situacao, justificativa, parcelasIds, todasParcelas } = body;

  // Consultores só podem atualizar situacao (e apenas de contratos na sua carteira)
  if (!isGestorAdmin) {
    if (!situacao) return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
    const naCarteira = await prisma.carteiraParcela.findFirst({
      where: { contratoId: params.id, consultorId: session.user.id, ativo: true },
    });
    if (!naCarteira) return NextResponse.json({ erro: "Contrato não está na sua carteira" }, { status: 403 });
  }

  // GESTOR só pode editar contrato de uma frente que ele gerencia -- sem
  // isso, qualquer gestor editava valor/dias/status de contrato de
  // qualquer outra gestão só sabendo o id (achado real da auditoria de
  // segurança, 2026-09-15).
  if (session.user.perfil === "GESTOR") {
    const carteiraAtual = await prisma.carteiraParcela.findFirst({
      where: { contratoId: params.id, ativo: true },
      select: { consultor: { select: { equipeId: true } } },
    });
    const equipesGerenciadas = await getEquipesGerenciadas(session.user.id);
    if (!carteiraAtual?.consultor.equipeId || !equipesGerenciadas.includes(carteiraAtual.consultor.equipeId)) {
      return NextResponse.json({ erro: "Sem permissão para editar este contrato" }, { status: 403 });
    }
  }

  // Bloqueia mudança de situação para contratos já recuperados integralmente
  // -- exceto GESTOR/ADMIN contestando Inadimplência Equivocada: contrato
  // pago numa competência mas ainda não baixado oficialmente quando a
  // próxima competência foi importada volta pra carteira "quitado" (acha
  // real: Bruno de Jesus Siqueira Campos, 2026-09-22) -- só o gestor pode
  // destravar esse caso específico, consultor continua bloqueado.
  const podeContestarRecuperado = isGestorAdmin && situacao === "INADIMPLENCIA_EQUIVOCADA";
  if (situacao && !podeContestarRecuperado) {
    const atual = await prisma.contrato.findUnique({
      where: { id: params.id },
      select: { statusRecuperacao: true },
    });
    if (atual?.statusRecuperacao === "RECUPERADO_INTEGRALMENTE") {
      return NextResponse.json({ erro: "Contrato já adimplente — situação não pode ser alterada" }, { status: 422 });
    }
  }

  const data: any = {};

  if (situacao !== undefined) {
    data.situacao = situacao as SituacaoContrato;
  }

  if (isGestorAdmin) {
    if (maiorDiasAtraso !== undefined && maiorDiasAtraso !== "") {
      data.maiorDiasAtraso = parseInt(String(maiorDiasAtraso));
    }
    if (valorTotalAberto !== undefined && valorTotalAberto !== "") {
      data.valorTotalAberto = new Decimal(parsearValorMonetario(valorTotalAberto));
    }
    if (statusContrato !== undefined && statusContrato !== "") {
      data.statusContrato = statusContrato;
    }
    if (valorTotalAberto !== undefined && valorTotalAberto !== "") {
      const contratoAtual = await prisma.contrato.findUnique({
        where: { id: params.id },
        select: { recebimentos: { select: { valor: true } } },
      });
      if (contratoAtual) {
        const totalRecebido = contratoAtual.recebimentos.reduce((s, r) => s + Number(r.valor), 0);
        const novoAberto = parsearValorMonetario(valorTotalAberto);
        const novoStatus =
          totalRecebido >= novoAberto
            ? "RECUPERADO_INTEGRALMENTE"
            : totalRecebido > 0
            ? "RECUPERACAO_PARCIAL"
            : "INADIMPLENTE";
        data.statusRecuperacao = novoStatus;
        // Zera situação ao recuperar integralmente
        if (novoStatus === "RECUPERADO_INTEGRALMENTE") {
          data.situacao = "INADIMPLENTE" as SituacaoContrato;
        }
      }
    }
  }

  const contrato = await prisma.contrato.update({ where: { id: params.id }, data });

  // Auditoria de edição de valor/dias/status -- antes não ficava rastro de
  // quem mudou esses campos de um contrato (achado real da auditoria de
  // segurança, 2026-09-15).
  if (data.maiorDiasAtraso !== undefined || data.valorTotalAberto !== undefined || data.statusContrato !== undefined) {
    prisma.auditoria.create({
      data: {
        usuarioId: session.user.id,
        tabela: "contratos",
        registroId: params.id,
        campo: ["maiorDiasAtraso", "valorTotalAberto", "statusContrato"].filter((k) => data[k] !== undefined).join(","),
        valorNovo: JSON.stringify({
          maiorDiasAtraso: data.maiorDiasAtraso, valorTotalAberto: data.valorTotalAberto?.toString(), statusContrato: data.statusContrato,
        }),
        acao: "UPDATE",
      },
    }).catch(() => {});
  }

  // Quando situação é INADIMPLENCIA_EQUIVOCADA, cria Solicitação para o gestor (se não houver pendente)
  if (situacao === "INADIMPLENCIA_EQUIVOCADA") {
    const jaExiste = await prisma.solicitacao.findFirst({
      where: { contratoId: params.id, tipo: "INADIMPLENCIA_EQUIVOCADA", status: "PENDENTE" },
    });
    if (!jaExiste) {
      // Guarda a competência ABERTA no momento da contestação -- na
      // aprovação, a remoção da carteira fica restrita a essa competência
      // (nunca desativa carteira de mês já fechado). Sem isso, um contrato
      // com carteira em mais de uma competência (dívida paga numa
      // competência mas ainda não baixada oficialmente quando a próxima já
      // foi importada) tinha a competência FECHADA anterior apagada
      // retroativamente junto -- achado real: Bruno de Jesus Siqueira
      // Campos, pago em 31/08 mas com carteira ativa em Agosto E Setembro,
      // 2026-09-22.
      const competenciaAberta = await prisma.competencia.findFirst({
        where: { fechada: false },
        orderBy: [{ ano: "desc" }, { mes: "desc" }],
        select: { id: true },
      });
      await prisma.solicitacao.create({
        data: {
          tipo: "INADIMPLENCIA_EQUIVOCADA",
          contratoId: params.id,
          solicitanteId: session.user.id,
          motivo: justificativa || "Consultor contestou a inadimplência via carteira",
          dados: {
            ...(Array.isArray(parcelasIds) && parcelasIds.length > 0 ? { parcelasIds, todasParcelas: !!todasParcelas } : { todasParcelas: true }),
            competenciaId: competenciaAberta?.id ?? null,
          },
        },
      });
    }
  }

  // Quando consultor muda de INADIMPLENCIA_EQUIVOCADA para outra situação, cancela solicitação pendente
  if (situacao && situacao !== "INADIMPLENCIA_EQUIVOCADA") {
    await prisma.solicitacao.updateMany({
      where: { contratoId: params.id, tipo: "INADIMPLENCIA_EQUIVOCADA", status: "PENDENTE" },
      data: { status: "REJEITADA", resposta: "Cancelada pelo consultor" },
    });
  }

  return NextResponse.json(contrato);
}
