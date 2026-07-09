import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const FRENTE_ORDER = ["eq-flash", "eq-1-30", "eq-31-90", "eq-91-180"];
const FRENTE_LABEL: Record<string, string> = {
  "eq-flash":  "Flash",
  "eq-1-30":   "1 a 30 dias",
  "eq-31-90":  "31 a 90 dias",
  "eq-91-180": "91+ dias",
};

function derivarFrenteId(consultorEquipeId: string | null, diasAtraso: number): string {
  if (consultorEquipeId === "eq-flash") return "eq-flash";
  if (diasAtraso <= 30) return "eq-1-30";
  if (diasAtraso <= 90) return "eq-31-90";
  return "eq-91-180"; // 91+ engloba tudo acima de 90
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  if (session.user.perfil === "CONSULTOR") return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const competenciaId = searchParams.get("competenciaId");
  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

  const equipeIdsParam = searchParams.get("equipeIds") ?? "";
  const equipeIds = equipeIdsParam ? equipeIdsParam.split(",").filter(Boolean) : [];
  const frentesAtivas = equipeIds.length > 0 ? equipeIds : FRENTE_ORDER;

  try {
    // Escopo de datas da competência
    const competencia = await prisma.competencia.findUnique({
      where: { id: competenciaId },
      select: { mes: true, ano: true },
    });
    const iniComp = competencia ? new Date(competencia.ano, competencia.mes - 1, 1) : new Date(0);
    const fimComp = competencia ? new Date(competencia.ano, competencia.mes, 0, 23, 59, 59, 999) : new Date();

    // 1. Consultores: frente primária OU frente adicional dentro das frentes ativas
    const consultores = await prisma.usuario.findMany({
      where: {
        ativo: true,
        perfil: "CONSULTOR",
        OR: [
          { equipeId: { in: frentesAtivas } },
          { frentesAdicionais: { some: { equipeId: { in: frentesAtivas } } } },
        ],
      },
      select: { id: true, nome: true, equipeId: true },
      orderBy: { nome: "asc" },
    });

    const consultorIds = consultores.map((c) => c.id);
    const consultorMap = new Map(consultores.map((c) => [c.id, c]));

    // 2. Carteiras para a competência (inclui diasAtraso e empresa para derivar frente)
    const carteiras = await prisma.carteiraParcela.findMany({
      where: { consultorId: { in: consultorIds }, competenciaId, ativo: true },
      select: {
        contratoId: true,
        consultorId: true,
        contrato: {
          select: {
            valorTotalAberto: true,
            empresaId: true,
            maiorDiasAtraso: true,
            empresa: { select: { nome: true } },
          },
        },
      },
    });

    // 3. Recebimentos no mês da competência (evita vazamento entre competências)
    const recebimentos = await prisma.recebimento.findMany({
      where: {
        consultorId: { in: consultorIds },
        contrato: { carteiras: { some: { consultorId: { in: consultorIds }, competenciaId, ativo: true } } },
        dataRecebimento: { gte: iniComp, lte: fimComp },
      },
      select: {
        consultorId: true,
        contratoId: true,
        valor: true,
        contrato: { select: { maiorDiasAtraso: true } },
      },
    });

    // 4. Acumular saldo e recebido por (frenteId, consultorId)
    type Acum = { saldoAberto: number; recebido: number; contratos: number };
    const frenteConsultorMap = new Map<string, Map<string, Acum>>();
    for (const fId of frentesAtivas) frenteConsultorMap.set(fId, new Map());

    for (const cp of carteiras) {
      const consultor = consultorMap.get(cp.consultorId);
      const frenteId = derivarFrenteId(consultor?.equipeId ?? null, cp.contrato.maiorDiasAtraso ?? 0);
      if (!frenteConsultorMap.has(frenteId)) continue;
      const fMap = frenteConsultorMap.get(frenteId)!;
      if (!fMap.has(cp.consultorId)) fMap.set(cp.consultorId, { saldoAberto: 0, recebido: 0, contratos: 0 });
      const d = fMap.get(cp.consultorId)!;
      d.saldoAberto += Number(cp.contrato.valorTotalAberto ?? 0);
      d.contratos += 1;
    }

    for (const r of recebimentos) {
      const consultor = consultorMap.get(r.consultorId);
      const frenteId = derivarFrenteId(consultor?.equipeId ?? null, r.contrato.maiorDiasAtraso ?? 0);
      if (!frenteConsultorMap.has(frenteId)) continue;
      const fMap = frenteConsultorMap.get(frenteId)!;
      if (!fMap.has(r.consultorId)) fMap.set(r.consultorId, { saldoAberto: 0, recebido: 0, contratos: 0 });
      fMap.get(r.consultorId)!.recebido += Number(r.valor ?? 0);
    }

    // 5. Construir array de frentes
    const frentes = frentesAtivas
      .filter((eqId) => FRENTE_LABEL[eqId])
      .map((eqId) => {
        const fMap = frenteConsultorMap.get(eqId) ?? new Map<string, Acum>();
        const fConsultores = Array.from(fMap.entries())
          .filter(([, d]) => d.contratos > 0)
          .map(([cId, d]) => ({
            consultorId: cId,
            nome: consultorMap.get(cId)?.nome ?? cId,
            saldoAberto: d.saldoAberto,
            recebido: d.recebido,
            contratos: d.contratos,
          }))
          .sort((a, b) => b.saldoAberto - a.saldoAberto);

        const total = fConsultores.reduce(
          (acc, c) => ({
            saldoAberto: acc.saldoAberto + c.saldoAberto,
            recebido: acc.recebido + c.recebido,
            contratos: acc.contratos + c.contratos,
          }),
          { saldoAberto: 0, recebido: 0, contratos: 0 }
        );

        return { equipeId: eqId, label: FRENTE_LABEL[eqId], consultores: fConsultores, total };
      });

    // 6. Breakdown por empresa (dedup por contratoId)
    const empresaMap = new Map<string, { nome: string; saldoAberto: number; contratos: Set<string> }>();
    for (const cp of carteiras) {
      const eId = cp.contrato.empresaId;
      if (!empresaMap.has(eId)) {
        empresaMap.set(eId, { nome: cp.contrato.empresa.nome, saldoAberto: 0, contratos: new Set() });
      }
      const e = empresaMap.get(eId)!;
      if (!e.contratos.has(cp.contratoId)) {
        e.contratos.add(cp.contratoId);
        e.saldoAberto += Number(cp.contrato.valorTotalAberto ?? 0);
      }
    }

    // Recebimentos por contrato para empresa (já filtrados pelo mês acima)
    const recContMap = new Map<string, number>();
    for (const r of recebimentos) {
      recContMap.set(r.contratoId, (recContMap.get(r.contratoId) ?? 0) + Number(r.valor ?? 0));
    }

    const porEmpresa = Array.from(empresaMap.entries())
      .map(([id, e]) => {
        const recebido = Array.from(e.contratos).reduce((sum, cId) => sum + (recContMap.get(cId) ?? 0), 0);
        return {
          empresaId: id,
          nome: e.nome,
          saldoAberto: e.saldoAberto,
          recebido,
          contratos: e.contratos.size,
          percentual: e.saldoAberto > 0 ? Math.min((recebido / e.saldoAberto) * 100, 100) : 0,
        };
      })
      .sort((a, b) => b.saldoAberto - a.saldoAberto);

    return NextResponse.json({ frentes, porEmpresa });
  } catch (err: any) {
    console.error("[distribuicao]", err);
    return NextResponse.json({ erro: err.message }, { status: 500 });
  }
}
