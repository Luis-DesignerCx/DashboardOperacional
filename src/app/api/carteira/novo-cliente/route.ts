import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { identificarEmpresa } from "@/constants/empresas";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const {
    nomeCliente, telefones, emails,
    numeroContrato, diasAtraso, valorAReceber, competenciaId,
  } = body;

  if (!nomeCliente || !numeroContrato || !competenciaId) {
    return NextResponse.json({ erro: "Nome do cliente, número do contrato e competência são obrigatórios" }, { status: 400 });
  }

  const dias = parseInt(diasAtraso) || 0;
  const valor = parseFloat(String(valorAReceber).replace(",", ".")) || 0;

  // ── Contrato já existe: adiciona nova parcela sem alterar a faixa ──────────
  const contratoExistente = await prisma.contrato.findUnique({ where: { numero: numeroContrato } });
  if (contratoExistente) {
    // Próximo número de parcela
    const ultimaParcela = await prisma.parcela.findFirst({
      where: { contratoId: contratoExistente.id },
      orderBy: { numero: "desc" },
      select: { numero: true },
    });
    const proximoNumero = (ultimaParcela?.numero ?? 0) + 1;

    // Adiciona parcela e atualiza valor total do contrato em uma transação
    // maiorDiasAtraso NÃO é alterado — faixa congelada na competência atual
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
        data: {
          valorTotalAberto: {
            increment: new Decimal(valor.toFixed(2)),
          },
        },
      }),
    ]);

    // Vincula à carteira do consultor se ainda não estiver nesta competência
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

  // ── Contrato novo: cria cliente, contrato, parcela e carteira ─────────────
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
