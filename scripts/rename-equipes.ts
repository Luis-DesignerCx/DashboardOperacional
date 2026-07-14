import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const NOMES: Record<string, { nome: string; ordem: number }> = {
  FLASH:         { nome: "CRA - Flash",    ordem: 1 },
  CRA_1_30:      { nome: "CRA - 1 a 30",  ordem: 2 },
  CR_31_90:      { nome: "CR - 31 a 90",  ordem: 3 },
  CR_PDD_91_180: { nome: "CR PDD - 91+",  ordem: 4 },
};

async function main() {
  const equipes = await prisma.equipe.findMany({ select: { id: true, tipo: true, nome: true } });
  for (const e of equipes) {
    const cfg = NOMES[e.tipo];
    if (!cfg) { console.log(`Sem mapeamento para tipo ${e.tipo} — pulando`); continue; }
    const updated = await prisma.equipe.update({ where: { id: e.id }, data: { nome: cfg.nome } });
    console.log(`${e.tipo}: "${e.nome}" → "${updated.nome}"`);
  }
  console.log("\nConcluído.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
