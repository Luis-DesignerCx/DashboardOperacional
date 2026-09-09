import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: { equipeId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  if (!["ADMINISTRADOR", "GESTOR"].includes(session.user.perfil)) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { equipeId } = params;
  const { searchParams } = new URL(req.url);
  const competenciaId = searchParams.get("competenciaId");
  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

  // Escopo de datas da competência -- recebimentos somados abaixo precisam
  // ser só os DESSE mês (mesmo bug de vazamento entre competências já
  // corrigido em /api/carteira, ver commit c3080b7, faltava aqui).
  const competencia = await prisma.competencia.findUnique({
    where: { id: competenciaId },
    select: { mes: true, ano: true },
  });
  const iniComp = competencia ? new Date(Date.UTC(competencia.ano, competencia.mes - 1, 1, 3, 0, 0, 0)) : new Date(0);
  const fimComp = competencia ? new Date(Date.UTC(competencia.ano, competencia.mes, 1, 2, 59, 59, 999)) : new Date();

  // Permite refinar por sub-faixa de dias via query params (drill-down DENTRO
  // da equipe já selecionada -- nunca substitui o escopo por equipe abaixo)
  const diasMinParam = searchParams.get("diasMin");
  const diasMaxParam = searchParams.get("diasMax");

  const equipeInfo = await prisma.equipe.findUnique({
    where: { id: equipeId },
    select: { tipo: true },
  });

  // Escopo por tipoEquipe CONGELADO (CarteiraParcela.tipoEquipe), não pelos
  // dias em atraso atuais do contrato nem pela equipe atual do consultor.
  // Sem isso, um contrato distribuído para a equipe Flash/CRA que continua
  // vencido (dias em atraso só cresce com o tempo) passava a aparecer na
  // faixa PDD 91+ mesmo continuando corretamente contado na equipe original
  // -- mesmo bug de "equipe congelada" já corrigido em outros pontos do
  // sistema (ver distribuicao-carteira.ts), faltava aqui.
  const carteiraWhere: any = { competenciaId, ativo: true };
  if (equipeInfo) {
    carteiraWhere.tipoEquipe = equipeInfo.tipo;
  } else {
    carteiraWhere.consultor = { equipeId };
  }
  if (diasMinParam || diasMaxParam) {
    const diasFilter: { gte?: number; lte?: number } = {};
    if (diasMinParam) diasFilter.gte = Number(diasMinParam);
    if (diasMaxParam) diasFilter.lte = Number(diasMaxParam);
    carteiraWhere.contrato = { maiorDiasAtraso: diasFilter };
  }

  const carteiraData = await prisma.carteiraParcela.findMany({
    where: carteiraWhere,
    select: {
      consultorId: true,
      contratoId: true,
      contrato: {
        select: {
          empresaId: true,
          valorTotalAberto: true,
          empresa: { select: { id: true, nome: true } },
        },
      },
    },
  });

  const consultorIdsCarteira = [...new Set(carteiraData.map((c) => c.consultorId))];

  // Inclui também consultores cadastrados nesta equipe mas sem contratos na competência
  const consultoresDaFrente = await prisma.usuario.findMany({
    where: { equipeId, perfil: "CONSULTOR", ativo: true },
    select: { id: true },
  });
  const consultorIds = [...new Set([...consultorIdsCarteira, ...consultoresDaFrente.map((c) => c.id)])];

  const [consultores, recebimentos] = await Promise.all([
    consultorIds.length > 0
      ? prisma.usuario.findMany({
          where: { id: { in: consultorIds }, perfil: "CONSULTOR", ativo: true },
          select: { id: true, nome: true, emFerias: true },
          orderBy: { nome: "asc" },
        })
      : Promise.resolve([]),
    consultorIds.length > 0
      ? prisma.recebimento.findMany({
          where: {
            consultorId: { in: consultorIds },
            contrato: { carteiras: { some: { competenciaId, ativo: true } } },
            dataRecebimento: { gte: iniComp, lte: fimComp },
          },
          select: {
            consultorId: true,
            valor: true,
            valorAParte: true,
            contrato: { select: { empresaId: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const empresaNames = new Map<string, string>();

  const carteiraMap = new Map<string, Map<string, { inadimplencia: number; contratos: Set<string> }>>();
  for (const c of carteiraData) {
    empresaNames.set(c.contrato.empresa.id, c.contrato.empresa.nome);
    if (!carteiraMap.has(c.consultorId)) carteiraMap.set(c.consultorId, new Map());
    const empMap = carteiraMap.get(c.consultorId)!;
    if (!empMap.has(c.contrato.empresaId)) empMap.set(c.contrato.empresaId, { inadimplencia: 0, contratos: new Set() });
    const reg = empMap.get(c.contrato.empresaId)!;
    reg.inadimplencia += Number(c.contrato.valorTotalAberto ?? 0);
    reg.contratos.add(c.contratoId);
  }

  const recebMap = new Map<string, Map<string, { recebido: number; recebidoAParte: number }>>();
  for (const r of recebimentos) {
    if (!recebMap.has(r.consultorId)) recebMap.set(r.consultorId, new Map());
    const empMap = recebMap.get(r.consultorId)!;
    if (!empMap.has(r.contrato.empresaId)) empMap.set(r.contrato.empresaId, { recebido: 0, recebidoAParte: 0 });
    const reg = empMap.get(r.contrato.empresaId)!;
    reg.recebido += Number(r.valor);
    reg.recebidoAParte += Number(r.valorAParte ?? 0);
  }

  const resultado = consultores.map((c) => {
    const empCarteira = carteiraMap.get(c.id) ?? new Map();
    const empReceb = recebMap.get(c.id) ?? new Map();

    const inadimplencia = Array.from(empCarteira.values()).reduce((s, e) => s + e.inadimplencia, 0);
    const recebido = Array.from(empReceb.values()).reduce((s, e) => s + e.recebido, 0);
    const recebidoAParte = Array.from(empReceb.values()).reduce((s, e) => s + e.recebidoAParte, 0);
    const totalContratos = Array.from(empCarteira.values()).reduce((s, e) => s + e.contratos.size, 0);

    const todasEmpresas = new Set([...empCarteira.keys(), ...empReceb.keys()]);
    const porEmpresa = Array.from(todasEmpresas).map((empId) => ({
      id: empId,
      nome: empresaNames.get(empId) ?? empId,
      inadimplencia: empCarteira.get(empId)?.inadimplencia ?? 0,
      recebido: empReceb.get(empId)?.recebido ?? 0,
      recebidoAParte: empReceb.get(empId)?.recebidoAParte ?? 0,
    })).sort((a, b) => b.inadimplencia - a.inadimplencia);

    return {
      id: c.id,
      nome: c.nome,
      emFerias: c.emFerias,
      totalContratos,
      inadimplencia,
      recebido,
      recebidoAParte,
      percentual: inadimplencia > 0 ? Math.min((recebido / inadimplencia) * 100, 100) : 0,
      porEmpresa,
    };
  }).sort((a, b) => b.recebido - a.recebido);

  return NextResponse.json(resultado);
}
