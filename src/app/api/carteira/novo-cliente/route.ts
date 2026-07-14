import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { FormaPagamento } from "@prisma/client";
import { primeiroDiaUtilDoMes } from "@/utils/dias-uteis";

interface ParcelaInput {
  dataVencimento: string; // YYYY-MM-DD
  valor: string;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const {
    nomeCliente, telefones, emails,
    numeroContrato, competenciaId,
    tipo = "inadimplencia", formaPagamento,
    parcelas, dataRecebimento,
  } = body;

  if (!nomeCliente || !numeroContrato || !competenciaId) {
    return NextResponse.json({ erro: "Nome do cliente, número do contrato e competência são obrigatórios" }, { status: 400 });
  }

  const contratoExistente = await prisma.contrato.findUnique({ where: { numero: numeroContrato } });

  // ── RECEBIMENTO A PARTE ────────────────────────────────────────────────────
  if (tipo === "a_parte") {
    if (!formaPagamento) {
      return NextResponse.json({ erro: "Forma de pagamento obrigatória para lançamento a parte" }, { status: 400 });
    }
    if (!dataRecebimento) {
      return NextResponse.json({ erro: "Data do recebimento obrigatória" }, { status: 400 });
    }

    const parcelasAParte: ParcelaInput[] = Array.isArray(parcelas) && parcelas.length > 0 ? parcelas : [];
    if (parcelasAParte.length === 0) {
      return NextResponse.json({ erro: "Informe ao menos uma parcela recebida a parte" }, { status: 400 });
    }

    const valorTotal = parcelasAParte.reduce((s, p) => s + (parseFloat(String(p.valor).replace(",", ".")) || 0), 0);

    let contratoId: string;

    if (contratoExistente) {
      contratoId = contratoExistente.id;
    } else {
      const empresas = await prisma.empresa.findMany();
      const empresa = empresas.find((e) =>
        e.prefixos.some((p) => numeroContrato.toUpperCase().startsWith(p.toUpperCase()))
      );
      if (!empresa) {
        return NextResponse.json({ erro: "Não foi possível identificar a empresa pelo número do contrato" }, { status: 400 });
      }

      const clienteId = randomUUID();
      contratoId = randomUUID();

      await prisma.$transaction([
        prisma.cliente.create({
          data: {
            id: clienteId,
            nome: nomeCliente.trim(),
            telefones: telefones?.trim() || null,
            emails: emails?.trim() || null,
          },
        }),
        prisma.contrato.create({
          data: {
            id: contratoId,
            numero: numeroContrato.trim(),
            clienteId,
            empresaId: empresa.id,
            maiorDiasAtraso: 0,
            valorTotalAberto: new Decimal("0"),
          },
        }),
      ]);
    }

    const carteiraExistente = await prisma.carteiraParcela.findFirst({
      where: { contratoId, competenciaId },
    });
    if (!carteiraExistente) {
      await prisma.carteiraParcela.create({
        data: { id: randomUUID(), contratoId, consultorId: session.user.id, competenciaId },
      });
    }

    // Detalhes das parcelas ficam na justificativa (não criam registros de parcela)
    const detalhesParcelas = parcelasAParte
      .map((p) => {
        const d = new Date(p.dataVencimento + "T00:00:00.000Z");
        const data = `${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${d.getUTCFullYear()}`;
        const val = parseFloat(String(p.valor).replace(",", ".")) || 0;
        return `${data} R$ ${val.toFixed(2).replace(".", ",")}`;
      })
      .join(", ");

    await prisma.recebimento.create({
      data: {
        id: randomUUID(),
        contratoId,
        consultorId: session.user.id,
        valor: new Decimal("0"),
        valorAParte: new Decimal(valorTotal.toFixed(2)),
        dataRecebimento: new Date(dataRecebimento),
        formaPagamento: formaPagamento as FormaPagamento,
        justificativa: `Lançamento a parte — parcelas: ${detalhesParcelas}`,
      },
    });

    return NextResponse.json({ ok: true, contratoId }, { status: 201 });
  }

  // ── INADIMPLÊNCIA ─────────────────────────────────────────────────────────
  const parcelasInput: ParcelaInput[] = Array.isArray(parcelas) && parcelas.length > 0
    ? parcelas
    : [];

  if (parcelasInput.length === 0) {
    return NextResponse.json({ erro: "Informe ao menos uma parcela em atraso" }, { status: 400 });
  }

  // Busca competência para obter mes/ano e calcular 1º dia útil
  const competencia = await prisma.competencia.findUnique({
    where: { id: competenciaId },
    select: { mes: true, ano: true },
  });
  if (!competencia) {
    return NextResponse.json({ erro: "Competência não encontrada" }, { status: 400 });
  }

  const refDate = primeiroDiaUtilDoMes(competencia.mes, competencia.ano);

  // Calcula diasAtraso de cada parcela e valor total
  const parcelasProcessadas = parcelasInput.map((p, i) => {
    const venc = new Date(p.dataVencimento + "T00:00:00.000Z");
    const diffMs = refDate.getTime() - venc.getTime();
    const dias = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    const valor = parseFloat(String(p.valor).replace(",", ".")) || 0;
    return { numero: i + 1, dataVencimento: venc, diasAtraso: dias, valor };
  });

  const maiorDiasAtraso = Math.max(...parcelasProcessadas.map((p) => p.diasAtraso));
  const valorTotal = parcelasProcessadas.reduce((s, p) => s + p.valor, 0);

  if (contratoExistente) {
    const ultimaParcela = await prisma.parcela.findFirst({
      where: { contratoId: contratoExistente.id },
      orderBy: { numero: "desc" },
      select: { numero: true },
    });
    let proximoNumero = (ultimaParcela?.numero ?? 0) + 1;

    await prisma.$transaction([
      ...parcelasProcessadas.map((p) =>
        prisma.parcela.create({
          data: {
            id: randomUUID(),
            contratoId: contratoExistente.id,
            numero: proximoNumero++,
            dataVencimento: p.dataVencimento,
            diasAtraso: p.diasAtraso,
            valorParcela: new Decimal(p.valor.toFixed(2)),
            valorTotalAberto: new Decimal(p.valor.toFixed(2)),
          },
        })
      ),
      prisma.contrato.update({
        where: { id: contratoExistente.id },
        data: {
          valorTotalAberto: { increment: new Decimal(valorTotal.toFixed(2)) },
          maiorDiasAtraso: Math.max(contratoExistente.maiorDiasAtraso ?? 0, maiorDiasAtraso),
        },
      }),
    ]);

    const carteiraExistente = await prisma.carteiraParcela.findFirst({
      where: { contratoId: contratoExistente.id, competenciaId },
    });
    if (!carteiraExistente) {
      await prisma.carteiraParcela.create({
        data: { id: randomUUID(), contratoId: contratoExistente.id, consultorId: session.user.id, competenciaId },
      });
    }

    return NextResponse.json({ ok: true, contratoId: contratoExistente.id }, { status: 201 });
  }

  // Contrato novo — cria tudo
  const empresas = await prisma.empresa.findMany();
  const empresa = empresas.find((e) =>
    e.prefixos.some((p) => numeroContrato.toUpperCase().startsWith(p.toUpperCase()))
  );
  if (!empresa) {
    return NextResponse.json({ erro: "Não foi possível identificar a empresa pelo número do contrato" }, { status: 400 });
  }

  const clienteId = randomUUID();
  const contratoId = randomUUID();

  await prisma.$transaction([
    prisma.cliente.create({
      data: {
        id: clienteId,
        nome: nomeCliente.trim(),
        telefones: telefones?.trim() || null,
        emails: emails?.trim() || null,
      },
    }),
    prisma.contrato.create({
      data: {
        id: contratoId,
        numero: numeroContrato.trim(),
        clienteId,
        empresaId: empresa.id,
        maiorDiasAtraso,
        valorTotalAberto: new Decimal(valorTotal.toFixed(2)),
      },
    }),
    ...parcelasProcessadas.map((p, i) =>
      prisma.parcela.create({
        data: {
          id: randomUUID(),
          contratoId,
          numero: i + 1,
          dataVencimento: p.dataVencimento,
          diasAtraso: p.diasAtraso,
          valorParcela: new Decimal(p.valor.toFixed(2)),
          valorTotalAberto: new Decimal(p.valor.toFixed(2)),
        },
      })
    ),
    prisma.carteiraParcela.create({
      data: { id: randomUUID(), contratoId, consultorId: session.user.id, competenciaId },
    }),
  ]);

  return NextResponse.json({ ok: true, contratoId }, { status: 201 });
}
