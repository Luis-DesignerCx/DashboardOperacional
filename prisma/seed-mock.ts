import { PrismaClient, Perfil, TipoContato, StatusContato, FormaPagamento, StatusPromessa } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

async function main() {
  console.log("🎭 Criando dados mock...");

  // ── Busca competência atual ────────────────────────────────────────────────
  const competencia = await prisma.competencia.findFirst({
    orderBy: [{ ano: "desc" }, { mes: "desc" }],
  });
  if (!competencia) throw new Error("Nenhuma competência encontrada. Rode o seed principal primeiro.");
  console.log(`📅 Competência: ${competencia.descricao}`);

  // ── Busca equipe CRA 1-30 ─────────────────────────────────────────────────
  const equipe130 = await prisma.equipe.findFirst({ where: { tipo: "CRA_1_30" } });
  const equipe3190 = await prisma.equipe.findFirst({ where: { tipo: "CR_31_90" } });
  if (!equipe130 || !equipe3190) throw new Error("Equipes não encontradas.");

  // ── Empresas ───────────────────────────────────────────────────────────────
  const empresas = await prisma.empresa.findMany();
  const empBarretosAB = empresas.find((e) => e.nome === "Barretos A&B")!;
  const empBarretosC  = empresas.find((e) => e.nome === "Barretos C")!;
  const empRoyalPrime = empresas.find((e) => e.nome === "Royal Prime")!;
  const empRoyalStar  = empresas.find((e) => e.nome === "Royal Star")!;
  const empPitangui   = empresas.find((e) => e.nome === "Pitangui")!;

  // ── 5 Consultores mock ────────────────────────────────────────────────────
  const senhaHash = await bcrypt.hash("consultor123", 12);

  const consultoresDados = [
    { nome: "Ana Paula Ferreira",  email: "ana.ferreira@dashcr.com",   equipeId: equipe130.id },
    { nome: "Carlos Eduardo Lima", email: "carlos.lima@dashcr.com",     equipeId: equipe130.id },
    { nome: "Mariana Costa Silva", email: "mariana.silva@dashcr.com",   equipeId: equipe130.id },
    { nome: "Roberto Souza Neto",  email: "roberto.souza@dashcr.com",   equipeId: equipe3190.id },
    { nome: "Fernanda Oliveira",   email: "fernanda.oliveira@dashcr.com", equipeId: equipe3190.id },
  ];

  const consultores = [];
  for (const c of consultoresDados) {
    const consultor = await prisma.usuario.upsert({
      where: { email: c.email },
      update: {},
      create: { ...c, senhaHash, perfil: Perfil.CONSULTOR, ativo: true },
    });
    consultores.push(consultor);
  }
  console.log(`✅ ${consultores.length} consultores criados`);

  // ── 15 Clientes + Contratos + Parcelas mock ───────────────────────────────
  const clientesMock = [
    // --- Equipe 1-30 dias ---
    {
      nome: "José Aparecido Rodrigues", cpf: "12345678901", telefone: "(17) 99801-2345",
      contrato: "BC-2024-00123", empresa: empBarretosAB,
      parcelas: [{ num: 3, vencDias: -15, atraso: 15, valor: 890.00, total: 890.00 }],
      consultor: consultores[0],
    },
    {
      nome: "Maria das Graças Santos", cpf: "23456789012", telefone: "(17) 98712-3456",
      contrato: "BCB-2024-00234", empresa: empBarretosAB,
      parcelas: [
        { num: 5, vencDias: -10, atraso: 10, valor: 1250.00, total: 1250.00 },
        { num: 6, vencDias: -3,  atraso: 3,  valor: 1250.00, total: 2500.00 },
      ],
      consultor: consultores[0],
    },
    {
      nome: "Paulo Henrique Machado", cpf: "34567890123", telefone: "(17) 99223-4567",
      contrato: "BCC-2024-00345", empresa: empBarretosC,
      parcelas: [{ num: 2, vencDias: -22, atraso: 22, valor: 450.00, total: 450.00 }],
      consultor: consultores[1],
    },
    {
      nome: "Luciana Pereira Alves", cpf: "45678901234", telefone: "(17) 99334-5678",
      contrato: "RP-2024-00456", empresa: empRoyalPrime,
      parcelas: [{ num: 1, vencDias: -5, atraso: 5, valor: 2100.00, total: 2100.00 }],
      consultor: consultores[1],
    },
    {
      nome: "Anderson da Silva Cruz", cpf: "56789012345", telefone: "(17) 98845-6789",
      contrato: "RS-2024-00567", empresa: empRoyalStar,
      parcelas: [
        { num: 4, vencDias: -28, atraso: 28, valor: 675.00, total: 675.00 },
        { num: 5, vencDias: -14, atraso: 14, valor: 675.00, total: 1350.00 },
      ],
      consultor: consultores[2],
    },
    {
      nome: "Claudia Regina Mendes", cpf: "67890123456", telefone: "(17) 99456-7890",
      contrato: "PG-2024-00678", empresa: empPitangui,
      parcelas: [{ num: 7, vencDias: -8, atraso: 8, valor: 380.00, total: 380.00 }],
      consultor: consultores[2],
    },
    // --- Equipe 31-90 dias ---
    {
      nome: "Marcos Antonio Vieira", cpf: "78901234567", telefone: "(17) 98567-8901",
      contrato: "BC-2024-00789", empresa: empBarretosAB,
      parcelas: [
        { num: 2, vencDias: -45, atraso: 45, valor: 1580.00, total: 1580.00 },
        { num: 3, vencDias: -35, atraso: 35, valor: 1580.00, total: 3160.00 },
      ],
      consultor: consultores[3],
    },
    {
      nome: "Rosangela Furtado Lima", cpf: "89012345678", telefone: "(17) 99678-9012",
      contrato: "RP-2024-00890", empresa: empRoyalPrime,
      parcelas: [{ num: 6, vencDias: -60, atraso: 60, valor: 920.00, total: 920.00 }],
      consultor: consultores[3],
    },
    {
      nome: "Thiago Barbosa Moreira", cpf: "90123456789", telefone: "(17) 98789-0123",
      contrato: "BCC-2024-00901", empresa: empBarretosC,
      parcelas: [
        { num: 3, vencDias: -55, atraso: 55, valor: 750.00, total: 750.00 },
        { num: 4, vencDias: -42, atraso: 42, valor: 750.00, total: 1500.00 },
        { num: 5, vencDias: -30, atraso: 30, valor: 750.00, total: 2250.00 },
      ],
      consultor: consultores[3],
    },
    {
      nome: "Sonia Maria Correia",   cpf: "01234567890", telefone: "(17) 99890-1234",
      contrato: "RS-2024-01012", empresa: empRoyalStar,
      parcelas: [{ num: 1, vencDias: -38, atraso: 38, valor: 1200.00, total: 1200.00 }],
      consultor: consultores[4],
    },
    {
      nome: "Edson Luiz Nascimento", cpf: "11223344556", telefone: "(17) 98901-2345",
      contrato: "BC-2024-01123", empresa: empBarretosAB,
      parcelas: [
        { num: 8, vencDias: -70, atraso: 70, valor: 430.00, total: 430.00 },
        { num: 9, vencDias: -60, atraso: 60, valor: 430.00, total: 860.00 },
      ],
      consultor: consultores[4],
    },
    {
      nome: "Beatriz Almeida Pinto", cpf: "22334455667", telefone: "(17) 99012-3456",
      contrato: "PG-2024-01234", empresa: empPitangui,
      parcelas: [{ num: 2, vencDias: -85, atraso: 85, valor: 560.00, total: 560.00 }],
      consultor: consultores[4],
    },
    // --- Equipe 91+ ---
    {
      nome: "Gilberto Ramos Freitas", cpf: "33445566778", telefone: "(17) 98123-4567",
      contrato: "RP-2024-01345", empresa: empRoyalPrime,
      parcelas: [
        { num: 5, vencDias: -120, atraso: 120, valor: 890.00, total: 890.00 },
        { num: 6, vencDias: -110, atraso: 110, valor: 890.00, total: 1780.00 },
      ],
      consultor: consultores[3],
    },
    {
      nome: "Vanessa Torres Borges", cpf: "44556677889", telefone: "(17) 99234-5678",
      contrato: "RS-2024-01456", empresa: empRoyalStar,
      parcelas: [{ num: 3, vencDias: -95, atraso: 95, valor: 1340.00, total: 1340.00 }],
      consultor: consultores[4],
    },
    {
      nome: "Rodrigo Cardoso Melo",  cpf: "55667788990", telefone: "(17) 98345-6789",
      contrato: "BCB-2024-01567", empresa: empBarretosAB,
      parcelas: [
        { num: 2, vencDias: -150, atraso: 150, valor: 2200.00, total: 2200.00 },
        { num: 3, vencDias: -140, atraso: 140, valor: 2200.00, total: 4400.00 },
        { num: 4, vencDias: -130, atraso: 130, valor: 2200.00, total: 6600.00 },
      ],
      consultor: consultores[3],
    },
  ];

  const todasParcelas: any[] = [];

  for (const mock of clientesMock) {
    // Cliente: cria apenas (cpf não é mais único; identificador é o contrato)
    let cliente = await prisma.cliente.findFirst({ where: { nome: mock.nome } });
    if (!cliente) {
      cliente = await prisma.cliente.create({
        data: { cpf: mock.cpf, nome: mock.nome, telefones: mock.telefone },
      });
    }

    // Upsert contrato (numero é único globalmente)
    const contrato = await prisma.contrato.upsert({
      where: { numero: mock.contrato },
      update: {},
      create: {
        numero: mock.contrato,
        clienteId: cliente.id,
        empresaId: mock.empresa.id,
      },
    });

    // Parcelas
    for (const p of mock.parcelas) {
      const dataVenc = new Date();
      dataVenc.setDate(dataVenc.getDate() + p.vencDias);

      const parcelaId = `${contrato.id}-parc-${p.num}`;

      const parcela = await prisma.parcela.upsert({
        where: { id: parcelaId },
        update: { diasAtraso: p.atraso, valorTotalAberto: new Decimal(p.total) },
        create: {
          id: parcelaId,
          contratoId: contrato.id,
          numero: p.num,
          dataVencimento: dataVenc,
          diasAtraso: p.atraso,
          valorParcela: new Decimal(p.valor),
          valorTotalAberto: new Decimal(p.total),
        },
      });

      // Carteira por contrato (upsert uma vez por contrato)
      await prisma.carteiraParcela.upsert({
        where: { contratoId_competenciaId: { contratoId: contrato.id, competenciaId: competencia.id } },
        update: {},
        create: { contratoId: contrato.id, consultorId: mock.consultor.id, competenciaId: competencia.id },
      });

      todasParcelas.push({ parcela, contrato, cliente, consultor: mock.consultor, empresa: mock.empresa });
    }
  }

  console.log(`✅ 15 clientes + contratos + parcelas criados`);

  // ── Contatos e interações mock ────────────────────────────────────────────
  const tiposContato: TipoContato[] = ["LIGACAO", "WHATSAPP", "LIGACAO", "LIGACAO"];

  // Sequência realista por grupo de parcela
  const interacoes = [
    // Parcela 0 — José → recebido depois de promessa
    { idx: 0, status: StatusContato.ACIONADO, obs: "Atendeu, ciente da dívida" },
    { idx: 0, status: StatusContato.PROMESSA_PAGAMENTO, obs: "Prometeu pagar até amanhã via PIX" },
    { idx: 0, status: StatusContato.RECEBIDO, obs: "Pagamento confirmado via PIX" },

    // Parcela 1 - Maria parcela 5 → em negociação
    { idx: 1, status: StatusContato.ACIONADO, obs: "Atendeu, pediu prazo" },
    { idx: 1, status: StatusContato.EM_NEGOCIACAO, obs: "Proposta de parcelamento do débito" },

    // Parcela 3 - Paulo → não atende
    { idx: 3, status: StatusContato.NAO_ATENDE, obs: "" },
    { idx: 3, status: StatusContato.NAO_ATENDE, obs: "" },
    { idx: 3, status: StatusContato.SEM_RESPOSTA, obs: "WhatsApp enviado, sem resposta" },

    // Parcela 5 - Luciana → promessa quebrada
    { idx: 5, status: StatusContato.ACIONADO, obs: "Atendeu, prometeu pagar sexta" },
    { idx: 5, status: StatusContato.PROMESSA_QUEBRADA, obs: "Não pagou na data prometida" },
    { idx: 5, status: StatusContato.EM_NEGOCIACAO, obs: "Nova negociação em andamento" },

    // Parcela 10 - Anderson → link enviado
    { idx: 8, status: StatusContato.LINK_ENVIADO, obs: "Link de pagamento enviado por WhatsApp" },
    { idx: 8, status: StatusContato.AGUARDANDO_RETORNO, obs: "Aguardando confirmação" },

    // Parcela 12 - Marcos → recebido parcialmente
    { idx: 12, status: StatusContato.ACIONADO, obs: "Atendeu, situação difícil financeiramente" },
    { idx: 12, status: StatusContato.PROMESSA_PAGAMENTO, obs: "Prometeu pagar parcela mais antiga" },
  ];

  for (const inter of interacoes) {
    const item = todasParcelas[inter.idx];
    if (!item) continue;
    await prisma.contato.create({
      data: {
        contratoId: item.contrato.id,
        consultorId: item.consultor.id,
        tipo: tiposContato[inter.idx % tiposContato.length],
        status: inter.status,
        observacao: inter.obs || null,
      },
    });
  }
  console.log(`✅ Contatos e interações criados`);

  // ── Promessas mock ────────────────────────────────────────────────────────
  const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
  const ontem  = new Date(); ontem.setDate(ontem.getDate() - 1);
  const hoje   = new Date();

  const promessas = [
    // José — paga
    { idx: 0, valor: 890.00, data: ontem, forma: FormaPagamento.PIX, status: StatusPromessa.PAGA, obs: "Pagou via PIX" },
    // Maria — aberta para amanhã
    { idx: 1, valor: 1250.00, data: amanha, forma: FormaPagamento.BOLETO, status: StatusPromessa.ABERTA, obs: "Vai pagar parcela 5" },
    // Luciana — quebrada
    { idx: 5, valor: 2100.00, data: ontem, forma: FormaPagamento.PIX, status: StatusPromessa.QUEBRADA, obs: "Não pagou" },
    // Marcos — aberta para hoje
    { idx: 12, valor: 1580.00, data: hoje, forma: FormaPagamento.TED, status: StatusPromessa.ABERTA, obs: "Pagar a mais antiga primeiro" },
    // Beatriz — aberta
    { idx: 17, valor: 560.00, data: amanha, forma: FormaPagamento.PIX, status: StatusPromessa.ABERTA, obs: "PIX agendado" },
  ];

  for (const prom of promessas) {
    const item = todasParcelas[prom.idx];
    if (!item) continue;
    await prisma.promessa.create({
      data: {
        contratoId: item.contrato.id,
        consultorId: item.consultor.id,
        valorPrometido: new Decimal(prom.valor),
        dataPrometida: prom.data,
        formaPagamento: prom.forma,
        status: prom.status,
        observacao: prom.obs,
      },
    });
  }
  console.log(`✅ Promessas criadas`);

  // ── Recebimentos mock — cada consultor com valores recebidos ──────────────
  const recebimentos = [
    // Ana Paula — recebeu de José (BC-00123, parcela 3) e Paulo (BCC-00345)
    { idx: 0,  consultor: consultores[0], valor: 890.00,  forma: FormaPagamento.PIX,    just: "Confirmado via extrato bancário" },
    { idx: 3,  consultor: consultores[1], valor: 450.00,  forma: FormaPagamento.PIX,    just: "Cliente pagou via PIX" },
    // Carlos — recebeu de Luciana (parcialmente)
    { idx: 5,  consultor: consultores[1], valor: 2100.00, forma: FormaPagamento.BOLETO, just: "Boleto compensado" },
    // Mariana — recebeu de Anderson parcela 4
    { idx: 8,  consultor: consultores[2], valor: 675.00,  forma: FormaPagamento.PIX,    just: "PIX recebido, aguardando baixa" },
    { idx: 9,  consultor: consultores[2], valor: 380.00,  forma: FormaPagamento.PIX,    just: "Cliente pagou no aplicativo" },
    // Roberto — recebeu de Marcos parcela 2
    { idx: 12, consultor: consultores[3], valor: 1580.00, forma: FormaPagamento.TED,    just: "TED identificado na conta" },
    { idx: 14, consultor: consultores[3], valor: 750.00,  forma: FormaPagamento.PIX,    just: "PIX confirmado" },
    // Fernanda — recebeu de Sonia e Edson
    { idx: 17, consultor: consultores[4], valor: 1200.00, forma: FormaPagamento.BOLETO, just: "Boleto pago na lotérica" },
    { idx: 18, consultor: consultores[4], valor: 430.00,  forma: FormaPagamento.PIX,    just: "PIX recebido" },
  ];

  for (const rec of recebimentos) {
    const item = todasParcelas[rec.idx];
    if (!item) continue;
    await prisma.recebimento.create({
      data: {
        contratoId: item.contrato.id,
        consultorId: rec.consultor.id,
        valor: new Decimal(rec.valor),
        dataRecebimento: new Date(),
        formaPagamento: rec.forma,
        justificativa: rec.just,
        aprovado: false,
      },
    });
  }
  console.log(`✅ Recebimentos criados`);

  // ── Metas mock ────────────────────────────────────────────────────────────
  await prisma.meta.upsert({
    where: { id: "meta-130-junho" },
    update: {},
    create: {
      id: "meta-130-junho",
      equipeId: equipe130.id,
      competenciaId: competencia.id,
      nome: "Meta Financeira — CRA 1 a 30",
      tipo: "FINANCEIRA",
      valorAlvo: new Decimal(15000.00),
      peso: new Decimal(1),
    },
  });

  await prisma.meta.upsert({
    where: { id: "meta-3190-junho" },
    update: {},
    create: {
      id: "meta-3190-junho",
      equipeId: equipe3190.id,
      competenciaId: competencia.id,
      nome: "Meta Financeira — CR 31 a 90",
      tipo: "FINANCEIRA",
      valorAlvo: new Decimal(20000.00),
      peso: new Decimal(1),
    },
  });
  console.log(`✅ Metas criadas`);

  // ── Resumo ─────────────────────────────────────────────────────────────────
  console.log("\n📊 Resumo dos dados mock:");
  console.log("─────────────────────────────────────────────────");

  for (const c of consultores) {
    const recebidos = await prisma.recebimento.aggregate({
      where: { consultorId: c.id },
      _sum: { valor: true },
    });
    const carteira = await prisma.carteiraParcela.aggregate({
      where: { consultorId: c.id, competenciaId: competencia.id },
      _count: true,
    });
    const total = Number(recebidos._sum.valor ?? 0);
    console.log(`  ${c.nome}: ${carteira._count} parcelas · R$ ${total.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")} recebido`);
  }

  console.log("─────────────────────────────────────────────────");
  console.log("✅ Dados mock concluídos!\n");
  console.log("🔑 Login consultores (senha: consultor123):");
  for (const c of consultores) {
    console.log(`   ${c.email}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
