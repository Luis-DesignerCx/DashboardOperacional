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

  const [consultores, carteiraData, recebimentos] = await Promise.all([
    prisma.usuario.findMany({
      where: { equipeId, perfil: "CONSULTOR", ativo: true },
      select: { id: true, nome: true, emFerias: true },
      orderBy: { nome: "asc" },
    }),
    // Inadimplência por consultor por empresa
    prisma.carteiraParcela.findMany({
      where: { consultor: { equipeId }, competenciaId, ativo: true },
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
    }),
    // Recebimentos por consultor por empresa
    prisma.recebimento.findMany({
      where: {
        consultor: { equipeId },
        contrato: { carteiras: { some: { competenciaId, ativo: true } } },
      },
      select: {
        consultorId: true,
        valor: true,
        valorAParte: true,
        contrato: { select: { empresaId: true } },
      },
    }),
  ]);

  // Mapas de empresa
  const empresaNames = new Map<string, string>();

  // Map: consultorId -> empresaId -> { inadimplencia, contratos }
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

  // Map: consultorId -> empresaId -> { recebido, recebidoAParte }
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
