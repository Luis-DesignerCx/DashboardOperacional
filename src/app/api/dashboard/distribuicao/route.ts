import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEquipesGerenciadas } from "@/lib/frentes";

const FRENTE_ORDER = ["eq-flash", "eq-1-30", "eq-31-90", "eq-91-180"];
const FRENTE_LABEL: Record<string, string> = {
  "eq-flash":  "Flash",
  "eq-1-30":   "1 a 30 dias",
  "eq-31-90":  "31 a 90 dias",
  "eq-91-180": "91+ dias",
};

const TIPO_EQUIPE_PARA_FRENTE: Record<string, string> = {
  FLASH:         "eq-flash",
  CRA_1_30:      "eq-1-30",
  CR_31_90:      "eq-31-90",
  CR_PDD_91_180: "eq-91-180",
};

// Usa a frente "congelada" na carteira (tipoEquipe, gravada no momento da
// distribuição) -- é o que define de qual frente aquele contrato É, não o
// atraso atual dele. Sem isso, um contrato que envelhece muda de frente
// sozinho e "puxa" o consultor pra uma aba que não é a dele. Só cai no
// fallback por atraso pra linhas antigas (pré-migração, tipoEquipe null).
function derivarFrenteId(tipoEquipe: string | null, consultorEquipeId: string | null, diasAtraso: number): string {
  if (tipoEquipe && TIPO_EQUIPE_PARA_FRENTE[tipoEquipe]) return TIPO_EQUIPE_PARA_FRENTE[tipoEquipe];
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
  const equipeIdsSolicitadas = equipeIdsParam ? equipeIdsParam.split(",").filter(Boolean) : [];

  // Isolamento total por frente: Gestor nunca vê frente fora das suas (mesma
  // regra do /api/dashboard) -- sem essa checagem, qualquer gestor via
  // "equipeIds" na URL (ou até sem passar nada, que caía em TODAS as
  // frentes) enxergava a performance de consultores de outra gestão.
  // Administrador continua sem restrição.
  let frentesAtivas: string[];
  if (session.user.perfil === "GESTOR") {
    const gerenciadas = await getEquipesGerenciadas(session.user.id);
    frentesAtivas = equipeIdsSolicitadas.length > 0
      ? equipeIdsSolicitadas.filter((id) => gerenciadas.includes(id))
      : gerenciadas;
  } else {
    frentesAtivas = equipeIdsSolicitadas.length > 0 ? equipeIdsSolicitadas : FRENTE_ORDER;
  }

  try {
    // Escopo de datas da competência -- boundary UTC-3 explícito, igual ao
    // resto do sistema (dashboard/route.ts, comissao/*, carteira/*). Antes
    // usava hora local do servidor: se o processo não roda no fuso de
    // Brasília, a virada de mês contava recebimento no mês errado só aqui
    // (achado real da varredura de consistência, 2026-09-22).
    const competencia = await prisma.competencia.findUnique({
      where: { id: competenciaId },
      select: { mes: true, ano: true },
    });
    const iniComp = competencia ? new Date(Date.UTC(competencia.ano, competencia.mes - 1, 1, 3, 0, 0, 0)) : new Date(0);
    const fimComp = competencia ? new Date(Date.UTC(competencia.ano, competencia.mes, 1, 2, 59, 59, 999)) : new Date();

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
    // "inadimplenciaEquivocada: false" -- sem isso, contratos com disputa
    // aprovada continuavam contados aqui mesmo já removidos de todo o resto
    // do sistema (carteira, dashboard do consultor, comissão), causando o
    // card do topo (via /api/dashboard) e esta tabela (via este endpoint)
    // mostrarem contagens/valores diferentes pro mesmo gestor.
    const carteiras = await prisma.carteiraParcela.findMany({
      where: { consultorId: { in: consultorIds }, competenciaId, ativo: true, contrato: { inadimplenciaEquivocada: false } },
      select: {
        contratoId: true,
        consultorId: true,
        tipoEquipe: true,
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
        valorAParte: true,
        contrato: { select: { maiorDiasAtraso: true } },
      },
    });

    // 3b. Metas FINANCEIRA da competência -- para "% da Meta" por consultor.
    // Meta individual do consultor tem prioridade sobre a meta padrão da
    // equipe (mesma regra de resolução usada na tela do próprio consultor).
    // MONITORIA nunca entra aqui -- o gestor/consultor não tem meta desse
    // tipo e o sistema não teria como calcular isso corretamente.
    const equipeIdsDosConsultores = [...new Set(consultores.map((c) => c.equipeId).filter((x): x is string => !!x))];
    const metas = await prisma.meta.findMany({
      where: {
        competenciaId,
        tipo: "FINANCEIRA",
        OR: [
          { consultorId: { in: consultorIds } },
          { consultorId: null, equipeId: { in: equipeIdsDosConsultores } },
        ],
      },
      select: { consultorId: true, equipeId: true, percentualAlvo: true, valorAlvo: true },
    });
    const metaIndividualMap = new Map(metas.filter((m) => m.consultorId).map((m) => [m.consultorId as string, m]));
    const metaEquipeMap = new Map(metas.filter((m) => !m.consultorId).map((m) => [m.equipeId, m]));
    function resolverMetaConsultor(consultorId: string, equipeId: string | null) {
      return metaIndividualMap.get(consultorId) ?? (equipeId ? metaEquipeMap.get(equipeId) : undefined) ?? null;
    }
    function calcularMetaAlvo(meta: { percentualAlvo: unknown; valorAlvo: unknown } | null, saldoAberto: number): number | null {
      if (!meta) return null;
      if (meta.percentualAlvo && saldoAberto > 0) return (Number(meta.percentualAlvo) / 100) * saldoAberto;
      if (meta.valorAlvo) return Number(meta.valorAlvo);
      return null;
    }

    // 4. Acumular saldo e recebido por (frenteId, consultorId)
    type Acum = { saldoAberto: number; recebidoInadimplente: number; parcelaMes: number; contratos: number; contratosRecebidosSet: Set<string> };
    const frenteConsultorMap = new Map<string, Map<string, Acum>>();
    for (const fId of frentesAtivas) frenteConsultorMap.set(fId, new Map());

    // Mapa contratoId -> frenteId, pra recebimento herdar a MESMA frente da
    // carteira que o originou -- em vez de recalcular pelo atraso atual do
    // contrato, que pode já ter mudado de faixa. Chave é só o contratoId
    // (não consultorId+contratoId): a frente vem do tipoEquipe "congelado"
    // do CONTRATO, não de quem é o dono atual da carteira -- se o contrato
    // trocar de consultor (ex: redistribuição de frente por férias) DEPOIS
    // de um recebimento já ter sido registrado pelo consultor anterior, o
    // recebimento sumia da Matriz de Performance inteira (nem contava pro
    // consultor antigo, nem pro novo) porque a chave antiga nunca dava
    // match. Achado real: André de Brito Rodrigues (14 recebimentos, R$
    // 8.806,56 em setembro) aparecendo com só 1/R$197 depois que o Jair
    // redistribuiu a carteira dele (de férias) pra Selma, 2026-09-15.
    const contratoFrenteMap = new Map<string, string>();

    for (const cp of carteiras) {
      const consultor = consultorMap.get(cp.consultorId);
      const frenteId = derivarFrenteId(cp.tipoEquipe, consultor?.equipeId ?? null, cp.contrato.maiorDiasAtraso ?? 0);
      contratoFrenteMap.set(cp.contratoId, frenteId);
      if (!frenteConsultorMap.has(frenteId)) continue;
      const fMap = frenteConsultorMap.get(frenteId)!;
      if (!fMap.has(cp.consultorId)) fMap.set(cp.consultorId, { saldoAberto: 0, recebidoInadimplente: 0, parcelaMes: 0, contratos: 0, contratosRecebidosSet: new Set() });
      const d = fMap.get(cp.consultorId)!;
      // Saldo sob Gestão soma o valorTotalAberto do contrato (fixo) -- não
      // cai por pagamento parcial nem quando o contrato é recuperado de
      // vez; quitado ou não, permanece contado (achado real: Leusiele
      // Ribeiro dos Santos, 2026-09-21).
      d.saldoAberto += Number(cp.contrato.valorTotalAberto ?? 0);
      d.contratos += 1;
    }

    for (const r of recebimentos) {
      const frenteId = contratoFrenteMap.get(r.contratoId);
      if (!frenteId || !frenteConsultorMap.has(frenteId)) continue;
      const fMap = frenteConsultorMap.get(frenteId)!;
      if (!fMap.has(r.consultorId)) fMap.set(r.consultorId, { saldoAberto: 0, recebidoInadimplente: 0, parcelaMes: 0, contratos: 0, contratosRecebidosSet: new Set() });
      const d = fMap.get(r.consultorId)!;
      // Recebido Inadimplente (valor) e Parcela Mês (valorAParte) ficam
      // separados -- são conceitos diferentes: o primeiro é recuperação de
      // dívida em atraso, o segundo é a parcela do mês vigente, paga em dia.
      d.recebidoInadimplente += Number(r.valor ?? 0);
      d.parcelaMes += Number(r.valorAParte ?? 0);
      d.contratosRecebidosSet.add(r.contratoId);
    }

    // 5. Construir array de frentes
    const frentes = frentesAtivas
      .filter((eqId) => FRENTE_LABEL[eqId])
      .map((eqId) => {
        const fMap = frenteConsultorMap.get(eqId) ?? new Map<string, Acum>();
        const fConsultores = Array.from(fMap.entries())
          .filter(([, d]) => d.contratos > 0)
          .map(([cId, d]) => {
            const consultor = consultorMap.get(cId);
            const meta = resolverMetaConsultor(cId, consultor?.equipeId ?? null);
            const metaAlvo = calcularMetaAlvo(meta, d.saldoAberto);
            return {
              consultorId: cId,
              nome: consultor?.nome ?? cId,
              saldoAberto: d.saldoAberto,
              recebidoInadimplente: d.recebidoInadimplente,
              parcelaMes: d.parcelaMes,
              contratos: d.contratos,
              contratosRecebidos: d.contratosRecebidosSet.size,
              metaAlvo,
            };
          })
          .sort((a, b) => (b.recebidoInadimplente + b.parcelaMes) - (a.recebidoInadimplente + a.parcelaMes));

        const total = fConsultores.reduce(
          (acc, c) => ({
            saldoAberto: acc.saldoAberto + c.saldoAberto,
            recebidoInadimplente: acc.recebidoInadimplente + c.recebidoInadimplente,
            parcelaMes: acc.parcelaMes + c.parcelaMes,
            contratos: acc.contratos + c.contratos,
            contratosRecebidos: acc.contratosRecebidos + c.contratosRecebidos,
            metaAlvo: acc.metaAlvo + (c.metaAlvo ?? 0),
          }),
          { saldoAberto: 0, recebidoInadimplente: 0, parcelaMes: 0, contratos: 0, contratosRecebidos: 0, metaAlvo: 0 }
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

    // Recebimentos por contrato para empresa (já filtrados pelo mês acima) --
    // Recebido Inadimplente e Parcela Mês somados separadamente.
    const recInadimplenteContMap = new Map<string, number>();
    const parcelaMesContMap = new Map<string, number>();
    for (const r of recebimentos) {
      recInadimplenteContMap.set(r.contratoId, (recInadimplenteContMap.get(r.contratoId) ?? 0) + Number(r.valor ?? 0));
      parcelaMesContMap.set(r.contratoId, (parcelaMesContMap.get(r.contratoId) ?? 0) + Number(r.valorAParte ?? 0));
    }

    const porEmpresa = Array.from(empresaMap.entries())
      .map(([id, e]) => {
        const recebidoInadimplente = Array.from(e.contratos).reduce((sum, cId) => sum + (recInadimplenteContMap.get(cId) ?? 0), 0);
        const parcelaMes = Array.from(e.contratos).reduce((sum, cId) => sum + (parcelaMesContMap.get(cId) ?? 0), 0);
        const contratosRecuperados = Array.from(e.contratos).filter((cId) => (recInadimplenteContMap.get(cId) ?? 0) > 0 || (parcelaMesContMap.get(cId) ?? 0) > 0).length;
        return {
          empresaId: id,
          nome: e.nome,
          saldoAberto: e.saldoAberto,
          recebidoInadimplente,
          parcelaMes,
          contratosRecuperados,
          contratos: e.contratos.size,
          // % Recuperação: só Recebido Inadimplente sobre o saldo em aberto --
          // Parcela Mês não é "recuperação" de dívida, é parcela do mês em
          // dia, então não entra nessa conta.
          percentual: e.saldoAberto > 0 ? Math.min((recebidoInadimplente / e.saldoAberto) * 100, 100) : 0,
        };
      })
      .sort((a, b) => b.saldoAberto - a.saldoAberto);

    return NextResponse.json({ frentes, porEmpresa });
  } catch (err: any) {
    // Detalhe completo só no log do servidor (achado real da auditoria de
    // segurança, 2026-09-15).
    console.error("[distribuicao]", err);
    return NextResponse.json({ erro: "Erro ao carregar dados. Tente novamente." }, { status: 500 });
  }
}
