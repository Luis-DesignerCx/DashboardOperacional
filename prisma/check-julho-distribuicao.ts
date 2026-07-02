import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Competência de Julho
  const comp = await prisma.competencia.findFirst({
    where: { descricao: { contains: "Julho" } },
    select: { id: true, descricao: true },
  });
  if (!comp) { console.log("Competência Julho não encontrada"); return; }
  console.log(`\nCompetência: ${comp.descricao} (${comp.id})`);

  // CarteiraParcela criadas para Julho
  const totalCarteiras = await prisma.carteiraParcela.count({
    where: { competenciaId: comp.id, ativo: true },
  });
  console.log(`\nCarteiraParcela ativas em Julho: ${totalCarteiras}`);

  // Soma valorTotalAberto dos contratos distribuídos
  const contratos = await prisma.carteiraParcela.findMany({
    where: { competenciaId: comp.id, ativo: true },
    select: { contrato: { select: { valorTotalAberto: true } } },
  });
  const somaDistribuida = contratos.reduce(
    (s, c) => s + Number(c.contrato.valorTotalAberto ?? 0), 0
  );
  console.log(`Soma valorTotalAberto distribuída: R$ ${somaDistribuida.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);

  // Contratos SEM carteira em Julho (existem no banco mas não foram distribuídos)
  const semCarteira = await prisma.contrato.count({
    where: { carteiras: { none: { competenciaId: comp.id } } },
  });
  console.log(`\nContratos SEM CarteiraParcela em Julho: ${semCarteira}`);

  // Soma dos que ficaram sem carteira
  const semCarteiraContratos = await prisma.contrato.findMany({
    where: { carteiras: { none: { competenciaId: comp.id } } },
    select: { valorTotalAberto: true },
  });
  const somaSemCarteira = semCarteiraContratos.reduce(
    (s, c) => s + Number(c.valorTotalAberto ?? 0), 0
  );
  console.log(`Soma valorTotalAberto sem carteira: R$ ${somaSemCarteira.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);

  // Distribuição por frente (equipeId do consultor)
  console.log("\n=== Distribuição por frente em Julho ===");
  const porFrente = await prisma.carteiraParcela.groupBy({
    by: ["consultorId"],
    where: { competenciaId: comp.id, ativo: true },
    _count: { id: true },
  });
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nome: true, equipeId: true },
  });
  const userMap = new Map(usuarios.map(u => [u.id, u]));

  const porEquipe = new Map<string, { count: number; valor: number }>();
  for (const cp of porFrente) {
    const u = userMap.get(cp.consultorId);
    const eq = u?.equipeId ?? "desconhecido";
    const entry = porEquipe.get(eq) ?? { count: 0, valor: 0 };
    entry.count += cp._count.id;
    porEquipe.set(eq, entry);
  }
  for (const [eq, data] of [...porEquipe.entries()].sort()) {
    console.log(`  ${eq}: ${data.count} contratos`);
  }

  // Importação: verifica o registro
  const importacao = await prisma.importacao.findFirst({
    where: { competenciaId: comp.id },
    orderBy: { criadoEm: "desc" },
    select: { totalLinhas: true, totalContratos: true, processadas: true, erros: true, status: true },
  });
  if (importacao) {
    console.log(`\n=== Registro de importação ===`);
    console.log(`  Status: ${importacao.status}`);
    console.log(`  Total linhas: ${importacao.totalLinhas}`);
    console.log(`  Contratos processados: ${importacao.processadas}`);
    console.log(`  Erros: ${importacao.erros}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
