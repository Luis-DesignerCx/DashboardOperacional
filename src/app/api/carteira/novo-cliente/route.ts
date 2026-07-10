import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { FormaPagamento } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const {
    nomeCliente, telefones, emails,
    numeroContrato, diasAtraso, valorAReceber, competenciaId,
    tipo = "inadimplencia", formaPagamento,
  } = body;

  if (!nomeCliente || !numeroContrato || !competenciaId) {
    return NextResponse.json({ erro: "Nome do cliente, número do contrato e competência são obrigatórios" }, { status: 400 });
  }

  const dias = parseInt(diasAtraso) || 0;
  const valor = parseFloat(String(valorAReceber).replace(",", ".")) || 0;

  const contratoExistente = await prisma.contrato.findUnique({ where: { numero: numeroContrato } });

  // ── RECEBIMENTO A PARTE ────────────────────────────────────────────────────
  if (tipo === "a_parte") {
    if (!formaPagamento) {
      return NextResponse.json({ erro: "Forma de pagamento obrigatória para lançamento a parte" }, { status: 400 });
    }

    let contratoId: string;

    if (contratoExistente) {
      contratoId = contratoExistente.id;
    } else {
      // Cria contrato sem dívida (valorTotalAberto = 0)
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

    // Garante que o contrato está na carteira desta competência
    const carteiraExistente = await prisma.carteiraParcela.findFirst({
      where: { contratoId, competenciaId },
    });
    if (!carteiraExistente) {
      await prisma.carteiraParcela.create({
        data: {
          id: randomUUID(),
          contratoId,
          consultorId: session.user.id,
          competenciaId,
        },
      });
    }

    // Lança diretamente como recebimento a parte
    await prisma.recebimento.create({
      data: {
        id: randomUUID(),
        contratoId,
        consultorId: session.user.id,
        valor: new Decimal("0"),
        valorAParte: new Decimal(valor.toFixed(2)),
        dataRecebimento: new Date(),
        formaPagamento: formaPagamento as FormaPagamento,
        justificativa: "Lançamento manual a parte",
      },
    });

    return NextResponse.json({ ok: true, contratoId }, { status: 201 });
  }

  // ── INADIMPLÊNCIA ─────────────────────────────────────────────────────────
  if (contratoExistente) {
    // Próximo número de parcela
    const ultimaParcela = await prisma.parcela.findFirst({
      where: { contratoId: contratoExistente.id },
      orderBy: { numero: "desc" },
      select: { numero: true },
    });
    const proximoNumero = (ultimaParcela?.numero ?? 0) + 1;

    // Cria parcela e atualiza valor total — faixa (maiorDiasAtraso) congelada
    await prisma.$transaction([
      prisma.parcela.create({
        data: {
          id: randomUUID(),
          contratoId: contratoExistente.id,
          numero: proximoNumero,
          dataVencimento: new Date(),
          diasAtraso: dias,
          valorParcela: new Decimal(valor.toFixed(2)),
          valorTotalAberto: new Decimal(valor.toFixed(2)),
        },
      }),
      prisma.contrato.update({
        where: { id: contratoExistente.id },
        data: { valorTotalAberto: { increment: new Decimal(valor.toFixed(2)) } },
      }),
    ]);

    // Vincula à carteira se ainda não estiver
    const carteiraExistente = await prisma.carteiraParcela.findFirst({
      where: { contratoId: contratoExistente.id, competenciaId },
    });
    if (!carteiraExistente) {
      await prisma.carteiraParcela.create({
        data: {
          id: randomUUID(),
          contratoId: contratoExistente.id,
          consultorId: session.user.id,
          competenciaId,
        },
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
        maiorDiasAtraso: dias,
        valorTotalAberto: new Decimal(valor.toFixed(2)),
      },
    }),
    prisma.parcela.create({
      data: {
        id: randomUUID(),
        contratoId,
        numero: 1,
        dataVencimento: new Date(),
        diasAtraso: dias,
        valorParcela: new Decimal(valor.toFixed(2)),
        valorTotalAberto: new Decimal(valor.toFixed(2)),
      },
    }),
    prisma.carteiraParcela.create({
      data: {
        id: randomUUID(),
        contratoId,
        consultorId: session.user.id,
        competenciaId,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, contratoId }, { status: 201 });
}
