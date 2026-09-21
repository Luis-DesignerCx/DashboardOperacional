export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

const FAIXA_LABEL: Record<string, string> = {
  FLASH: "Flash",
  CRA_1_30: "1 a 30",
  CR_31_90: "31 a 90",
  CR_PDD_91_180: "91+",
};

// GET /api/carteira/exportar?competenciaId=xxx — exporta a carteira em xlsx,
// 1 linha por contrato. Consultor exporta só a própria carteira; gestor e
// administrador exportam a base INTEIRA (mesmo fora da própria frente) --
// decisão deliberada: essa exportação é ferramenta de auto-auditoria pra
// pegar erro de distribuição entre frentes diferentes (achado real: cliente
// com contratos em consultores diferentes, 2026-09-18/21), então não faz
// sentido escopar o gestor só na sua própria frente aqui.
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
    if (!["CONSULTOR", "GESTOR", "ADMINISTRADOR"].includes(session.user.perfil)) {
      return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const competenciaId = searchParams.get("competenciaId");
    if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

    const competencia = await prisma.competencia.findUnique({ where: { id: competenciaId } });
    if (!competencia) return NextResponse.json({ erro: "Competência não encontrada" }, { status: 404 });

    const iniComp = new Date(Date.UTC(competencia.ano, competencia.mes - 1, 1, 3, 0, 0, 0));
    const fimComp = new Date(Date.UTC(competencia.ano, competencia.mes, 1, 2, 59, 59, 999));

    const where: any = { competenciaId, ativo: true, contrato: { inadimplenciaEquivocada: false } };
    if (session.user.perfil === "CONSULTOR") where.consultorId = session.user.id;

    const carteiras = await prisma.carteiraParcela.findMany({
      where,
      select: {
        tipoEquipe: true,
        baseVencimento: true,
        consultor: { select: { nome: true } },
        contrato: {
          select: {
            numero: true,
            statusContrato: true,
            statusRecuperacao: true,
            situacao: true,
            maiorDiasAtraso: true,
            totalParcelasVencidas: true,
            valorTotalAberto: true,
            valorContrato: true,
            cliente: { select: { nome: true, telefones: true, emails: true } },
            empresa: { select: { nome: true } },
            recebimentos: {
              where: { dataRecebimento: { gte: iniComp, lte: fimComp } },
              select: { valor: true, valorAParte: true },
            },
            promessas: {
              where: { status: "ABERTA" },
              select: { valorPrometido: true, dataPrometida: true },
              orderBy: { dataPrometida: "asc" },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ contrato: { maiorDiasAtraso: "desc" } }],
    });

    const linhas = carteiras.map((c) => {
      const recebidoNaCompetencia = c.contrato.recebimentos.reduce(
        (s, r) => s + Number(r.valor) + Number(r.valorAParte ?? 0),
        0
      );
      const promessa = c.contrato.promessas[0];
      return {
        Competencia: competencia.descricao,
        Contrato: c.contrato.numero,
        Cliente: c.contrato.cliente.nome,
        Telefones: c.contrato.cliente.telefones ?? "",
        Emails: c.contrato.cliente.emails ?? "",
        Empresa: c.contrato.empresa.nome,
        Consultor: c.consultor.nome,
        Faixa: c.tipoEquipe ? FAIXA_LABEL[c.tipoEquipe] ?? c.tipoEquipe : "",
        BaseVencimento: c.baseVencimento ?? "",
        StatusContrato: c.contrato.statusContrato ?? "",
        StatusRecuperacao: c.contrato.statusRecuperacao ?? "",
        Situacao: c.contrato.situacao ?? "",
        DiasEmAtraso: c.contrato.maiorDiasAtraso ?? 0,
        TotalParcelasVencidas: c.contrato.totalParcelasVencidas ?? "",
        ValorTotalAberto: Number(c.contrato.valorTotalAberto ?? 0),
        ValorContrato: Number(c.contrato.valorContrato ?? 0),
        RecebidoNaCompetencia: recebidoNaCompetencia,
        PromessaData: promessa ? promessa.dataPrometida.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "",
        PromessaValor: promessa ? Number(promessa.valorPrometido) : "",
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws["!cols"] = [
      { wch: 15 }, { wch: 18 }, { wch: 35 }, { wch: 20 }, { wch: 30 },
      { wch: 15 }, { wch: 25 }, { wch: 10 }, { wch: 12 }, { wch: 14 },
      { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 16 },
      { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
    ];
    const nomeAba = competencia.descricao.replace(/[:\\/?\*\[\]]/g, "-").slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, nomeAba);

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const prefixo = session.user.perfil === "CONSULTOR" ? "minha_carteira" : "carteira";
    const nomeArquivo = `${prefixo}_${competencia.descricao.replace(/\s+/g, "_")}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      },
    });
  } catch (err: any) {
    // Detalhe completo só no log do servidor -- não vaza schema/infra
    // interna pro cliente (mesmo padrão já usado nos outros exports).
    console.error("[carteira/exportar]", err);
    return NextResponse.json({ erro: "Erro ao gerar exportação. Tente novamente." }, { status: 500 });
  }
}
