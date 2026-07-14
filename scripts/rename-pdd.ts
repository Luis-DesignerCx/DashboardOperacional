import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const e = await prisma.equipe.update({ where: { id: "eq-91-180" }, data: { nome: "PDD 91+" } });
  console.log("Renomeado para:", e.nome);
}
main().catch(console.error).finally(() => prisma.$disconnect());
