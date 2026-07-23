import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

// GET /api/historico/exportar?competenciaId=xxx — exporta planilha da competência
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  if (!["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const competenciaId = searchParams.get("competenciaId");
  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

  const competencia = await prisma.competencia.findUnique({ where: { id: competenciaId } });
  if (!competencia) return NextResponse.json({ erro: "Competência não encontrada" }, { status: 404 });

  // Busca todos os contratos atribuídos nesta competência
  const [carteiras, feriasComp] = await Promise.all([
    prisma.carteiraParcela.findMany({
      where: { competenciaId },
      include: {
        contrato: {
          include: {
            cliente: true,
            empresa: true,
            parcelas: { orderBy: { numero: "asc" } },
            recebimentos: {
              select: { valor: true, valorAParte: true, dataRecebimento: true, formaPagamento: true },
            },
          },
        },
        consultor: { select: { id: true, nome: true, email: true } },
      },
      orderBy: { atribuidoEm: "asc" },
    }),
    prisma.feriasConsultor.findMany({
      where: { competenciaId, congelado: true },
      select: {
        consultorId: true,
        snapshotSaldo: true,
        snapshotRecebido: true,
        snapshotMetaAlvo: true,
        consultor: { select: { nome: true, email: true } },
      },
    }),
  ]);

  // Mapa de snapshots por consultorId
  const snapshotMap = new Map(feriasComp.map((f) => [f.consultorId, f]));

  // Monta linhas: uma por parcela
  const linhas: any[] = [];

  for (const carteira of carteiras) {
    const { contrato, consultor } = carteira;
    const { cliente, empresa } = contrato;

    // Totais de recebimento por contrato
    const totalRecebidoInadimplencia = contrato.recebimentos.reduce((s, r) => s + Number(r.valor), 0);
    const totalAParte = contrato.recebimentos.reduce((s, r) => s + Number(r.valorAParte ?? 0), 0);
    const statusRec = contrato.statusRecuperacao ?? "INADIMPLENTE";

    for (const parcela of contrato.parcelas) {
      linhas.push({
        Competencia: competencia.descricao,
        Contrato: contrato.numero,
        Empresa: empresa.nome,
        Cliente: cliente.nome,
        Telefones: cliente.telefones ?? "",
        Emails: cliente.emails ?? "",
        StatusContrato: contrato.statusContrato ?? "",
        StatusRecuperacao: statusRec,
        Consultor: consultor.nome,
        EmailConsultor: consultor.email,
        NumeroParcela: parcela.numero,
        DataVencimento: parcela.dataVencimento.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
        DiasAtraso: parcela.diasAtraso,
        Origem: parcela.origem ?? "",
        MeioPagamento: parcela.meioPagamento ?? "",
        ValorParcela: Number(parcela.valorParcela),
        ValorTotalAberto: Number(parcela.valorTotalAberto),
        TotalParcelasVencidas: contrato.totalParcelasVencidas ?? "",
        ValorContrato: Number(contrato.valorContrato ?? 0),
        MaiorDiasAtraso: contrato.maiorDiasAtraso ?? 0,
        ValorRecebidoInadimplencia: totalRecebidoInadimplencia,
        ValorAParte: totalAParte,
      });
    }
  }

  // ── Resumo por consultor (respeita snapshot de férias congeladas) ────────────
  const resumoMap = new Map<string, {
    nome: string; email: string;
    inadimplencia: number; recebido: number; metaAlvo: number | null; congelado: boolean;
  }>();

  for (const carteira of carteiras) {
    const cId = carteira.consultor.id;
    const snap = snapshotMap.get(cId);
    if (snap) continue; // consultor congelado — valores vêm do snapshot abaixo

    if (!resumoMap.has(cId)) {
      resumoMap.set(cId, { nome: carteira.consultor.nome, email: carteira.consultor.email, inadimplencia: 0, recebido: 0, metaAlvo: null, congelado: false });
    }
    const entry = resumoMap.get(cId)!;
    const saldoParcelas = carteira.contrato.parcelas.reduce((s, p) => s + Number(p.valorTotalAberto), 0);
    const recebidoContrato = carteira.contrato.recebimentos.reduce((s, r) => s + Number(r.valor) + Number(r.valorAParte ?? 0), 0);
    entry.inadimplencia += saldoParcelas;
    entry.recebido += recebidoContrato;
  }

  // Consultores congelados: usa snapshot fixo
  for (const snap of feriasComp) {
    resumoMap.set(snap.consultorId, {
      nome: snap.consultor.nome,
      email: snap.consultor.email,
      inadimplencia: Number(snap.snapshotSaldo ?? 0),
      recebido: Number(snap.snapshotRecebido ?? 0),
      metaAlvo: snap.snapshotMetaAlvo ? Number(snap.snapshotMetaAlvo) : null,
      congelado: true,
    });
  }

  const linhasResumo = Array.from(resumoMap.values())
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map((r) => ({
      Consultor: r.nome,
      Email: r.email,
      Inadimplencia: r.inadimplencia,
      TotalRecebido: r.recebido,
      MetaAlvo: r.metaAlvo ?? "",
      PercAtingido: r.metaAlvo && r.metaAlvo > 0 ? Number(((r.recebido / r.metaAlvo) * 100).toFixed(2)) : "",
      Congelado: r.congelado ? "Sim" : "Não",
    }));

  // Gera XLSX
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(linhas);

  // Larguras de coluna aproximadas
  ws["!cols"] = [
    { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 35 }, { wch: 20 },
    { wch: 30 }, { wch: 20 }, { wch: 22 }, { wch: 25 }, { wch: 30 },
    { wch: 8 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 15 },
    { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
    { wch: 24 }, { wch: 14 },
  ];

  const wsResumo = XLSX.utils.json_to_sheet(linhasResumo);
  wsResumo["!cols"] = [{ wch: 30 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];

  XLSX.utils.book_append_sheet(wb, ws, competencia.descricao.slice(0, 31));
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo Comissão");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const nomeArquivo = `inadimplencia_${competencia.descricao.replace(/\s+/g, "_")}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
