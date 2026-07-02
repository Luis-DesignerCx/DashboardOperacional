import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.importacao.updateMany({
    where: { status: "PROCESSANDO" },
    data:  { status: "ERRO" },
  });

  console.log(`✅ ${result.count} importação(ões) travada(s) marcada(s) como ERRO.`);
  console.log("   Agora você pode reimportar normalmente.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
