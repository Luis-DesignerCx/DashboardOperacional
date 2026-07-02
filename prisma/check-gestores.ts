import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const gestores = await prisma.usuario.findMany({
    where: { perfil: "GESTOR" },
    select: {
      id: true,
      nome: true,
      equipeId: true,
      frentesAdicionais: { select: { equipeId: true } },
    },
    orderBy: { nome: "asc" },
  });

  console.log("\n=== Gestores e suas frentes ===\n");
  for (const g of gestores) {
    const adicionais = g.frentesAdicionais.map((f) => f.equipeId).join(", ") || "—";
    console.log(`${g.nome}`);
    console.log(`  Principal : ${g.equipeId ?? "null"}`);
    console.log(`  Adicionais: ${adicionais}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
