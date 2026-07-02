import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Garante que as duas equipes PDD existem com os tipos corretos
  await prisma.equipe.upsert({
    where: { id: "eq-91-180" },
    update: { nome: "CR PDD 91 a 180", tipo: "CR_PDD_91_180", diasSemContato: 7 },
    create: { id: "eq-91-180", nome: "CR PDD 91 a 180", tipo: "CR_PDD_91_180", diasSemContato: 7, ativa: true },
  });

  await prisma.equipe.upsert({
    where: { id: "eq-181plus" },
    update: { nome: "CR PDD 181+", tipo: "CR_PDD_181", diasSemContato: 10 },
    create: { id: "eq-181plus", nome: "CR PDD 181+", tipo: "CR_PDD_181", diasSemContato: 10, ativa: true },
  });

  // Remove equipe antiga se ainda existir
  await prisma.equipe.deleteMany({ where: { id: "eq-91plus" } }).catch(() => {});

  const equipes = await prisma.equipe.findMany({ orderBy: { tipo: "asc" } });
  console.log("✅ Equipes:");
  equipes.forEach((e) => console.log(`   ${e.tipo.padEnd(18)} — ${e.nome}`));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
