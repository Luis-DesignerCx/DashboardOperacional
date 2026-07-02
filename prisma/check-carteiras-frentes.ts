import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Competências existentes
  const competencias = await prisma.competencia.findMany({
    orderBy: { criadoEm: "desc" },
    select: { id: true, descricao: true },
  });
  console.log("\n=== Competências ===");
  for (const c of competencias) console.log(`  ${c.id} | ${c.descricao}`);

  // CarteiraParcela por frente (equipeId do consultor)
  const frentes = ["eq-flash", "eq-1-30", "eq-31-90", "eq-91-180", "eq-181plus"];
  console.log("\n=== CarteiraParcela por frente (por competência) ===");

  for (const frenteId of frentes) {
    const contagem = await prisma.carteiraParcela.groupBy({
      by: ["competenciaId"],
      where: { consultor: { equipeId: frenteId }, ativo: true },
      _count: { id: true },
    });
    if (contagem.length === 0) {
      console.log(`  ${frenteId}: SEM REGISTROS`);
    } else {
      for (const c of contagem) {
        const comp = competencias.find((x) => x.id === c.competenciaId);
        console.log(`  ${frenteId} | ${comp?.descricao ?? c.competenciaId}: ${c._count.id} carteiras`);
      }
    }
  }

  // Verificar consultores de 31+ e suas carteiras
  console.log("\n=== Consultores 31+ e qtd de carteiras ativas ===");
  const consultores31plus = await prisma.usuario.findMany({
    where: { perfil: "CONSULTOR", equipeId: { in: ["eq-31-90", "eq-91-180", "eq-181plus"] } },
    select: {
      nome: true, equipeId: true,
      carteiras: { where: { ativo: true }, select: { id: true, competenciaId: true } },
    },
    orderBy: { nome: "asc" },
  });
  for (const c of consultores31plus) {
    console.log(`  ${c.nome} (${c.equipeId}): ${c.carteiras.length} carteiras`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
