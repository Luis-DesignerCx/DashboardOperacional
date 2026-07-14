import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const pdd = await prisma.equipe.findFirst({ where: { tipo: "CR_PDD_91_180" } });
  if (!pdd) { console.log("Equipe PDD 91+ não encontrada"); return; }
  console.log(`Equipe PDD 91+: ${pdd.id} (${pdd.nome})\n`);

  // Consultores sem nenhuma frente
  const semFrente = await prisma.usuario.findMany({
    where: { perfil: "CONSULTOR", equipeId: null, deletadoEm: null },
    select: { id: true, nome: true, email: true },
  });
  console.log(`Consultores SEM frente: ${semFrente.length}`);
  semFrente.forEach(u => console.log(`  - ${u.nome} (${u.email})`));

  // Consultores já na PDD 91+
  const naPDD = await prisma.usuario.findMany({
    where: { perfil: "CONSULTOR", equipeId: pdd.id, deletadoEm: null },
    select: { nome: true },
  });
  console.log(`\nConsultores na PDD 91+: ${naPDD.length}`);
  naPDD.forEach(u => console.log(`  - ${u.nome}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
