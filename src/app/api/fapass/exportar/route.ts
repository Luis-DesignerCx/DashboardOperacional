export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

// GET /api/fapass/exportar?competenciaId=xxx — exporta os dados do Fã Pass
// (inadimplência, baixas, divergências) já salvos no banco para essa
// competência. Não depende do arquivo bruto original — os dados persistidos
// no Postgres são a fonte de verdade para conferência futura.
export async function GET(req: NextRequest) {
  try {
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

    const [inadimplencia, baixas, divergencias, sync] = await Promise.all([
      prisma.faPassInadimplencia.findMany({ where: { competenciaId }, orderBy: { contratoNumero: "asc" } }),
      prisma.faPassBaixa.findMany({ where: { competenciaId }, orderBy: { contratoNumero: "asc" } }),
      prisma.faPassDivergencia.findMany({ where: { competenciaId }, orderBy: { contratoNumero: "asc" } }),
      prisma.faPassSync.findFirst({ where: { competenciaId }, orderBy: { criadoEm: "desc" } }),
    ]);

    const linhasInad = inadimplencia.map((i) => ({
      Contrato: i.contratoNumero,
      Valor: Number(i.valor),
      VencimentoMaisAntigo: i.vencimentoMaisAntigo.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
      Faixa: i.faixa,
      Flash: i.isFlash ? "Sim" : "Não",
      RegistradoEm: i.criadoEm.toLocaleString("pt-BR"),
    }));

    const linhasBaixas = baixas.map((b) => ({
      Contrato: b.contratoNumero,
      Valor: Number(b.valor),
      TipoPagamento: b.tipoPagamento,
      DataBaixa: b.dataBaixa ? b.dataBaixa.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "",
      RegistradoEm: b.criadoEm.toLocaleString("pt-BR"),
    }));

    const linhasDivergencias = divergencias.map((d) => ({
      Contrato: d.contratoNumero,
      ValorSistema: Number(d.valorSistema),
      ValorQuery: Number(d.valorQuery),
      Diferenca: Number(d.valorSistema) - Number(d.valorQuery),
      Status: d.status,
      RegistradoEm: d.criadoEm.toLocaleString("pt-BR"),
      ResolvidaEm: d.resolvidaEm ? d.resolvidaEm.toLocaleString("pt-BR") : "",
    }));

    const linhasResumo = [{
      Competencia: competencia.descricao,
      UltimaSync: sync?.criadoEm ? sync.criadoEm.toLocaleString("pt-BR") : "",
      ArquivoOrigem: sync?.origem ?? "",
      TotalInadimplencia: linhasInad.reduce((s, l) => s + l.Valor, 0),
      TotalContratos: linhasInad.length,
      TotalBaixado: linhasBaixas.reduce((s, l) => s + l.Valor, 0),
      TotalDivergencias: linhasDivergencias.length,
    }];

    const wb = XLSX.utils.book_new();
    const wsResumo = XLSX.utils.json_to_sheet(linhasResumo);
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

    const wsInad = XLSX.utils.json_to_sheet(linhasInad);
    XLSX.utils.book_append_sheet(wb, wsInad, "Inadimplência");

    const wsBaixas = XLSX.utils.json_to_sheet(linhasBaixas);
    XLSX.utils.book_append_sheet(wb, wsBaixas, "Baixas");

    const wsDivergencias = XLSX.utils.json_to_sheet(linhasDivergencias);
    XLSX.utils.book_append_sheet(wb, wsDivergencias, "Divergências");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const nomeArquivo = `fapass_${competencia.descricao.replace(/\s+/g, "_")}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      },
    });
  } catch (err: any) {
    console.error("[fapass/exportar]", err);
    return NextResponse.json({ erro: err?.message ?? "Erro interno" }, { status: 500 });
  }
}
