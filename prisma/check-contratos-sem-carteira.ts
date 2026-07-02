import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const competenciaId = "cmr13flou0000lt7k49trxx2t";

  // Total de contratos na base
  const totalContratos = await prisma.contrato.count();
  console.log(`\nTotal de contratos na base: ${totalContratos}`);

  // Contratos COM carteira ativa nessa competência
  const comCarteira = await prisma.carteiraParcela.count({ where: { competenciaId, ativo: true } });
  console.log(`Contratos com CarteiraParcela ativa (Junho/2026): ${comCarteira}`);

  // Contratos SEM carteira em qualquer competência
  const semCarteira = await prisma.contrato.count({
    where: { carteiras: { none: {} } },
  });
  console.log(`Contratos sem nenhuma CarteiraParcela: ${semCarteira}`);

  // Distribuição de contratos por empresa
  const porEmpresa = await prisma.contrato.groupBy({
    by: ["empresaId"],
    _count: { id: true },
  });
  const empresas = await prisma.empresa.findMany({ select: { id: true, nome: true } });
  const empMap = new Map(empresas.map(e => [e.id, e.nome]));
  console.log("\n=== Contratos por empresa ===");
  for (const e of porEmpresa.sort((a, b) => b._count.id - a._count.id)) {
    console.log(`  ${empMap.get(e.empresaId) ?? e.empresaId}: ${e._count.id} contratos`);
  }

  // CarteiraParcela por consultor (só os que têm)
  const carteiraPorConsultor = await prisma.carteiraParcela.groupBy({
    by: ["consultorId"],
    where: { competenciaId, ativo: true },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });
  const usuarios = await prisma.usuario.findMany({ select: { id: true, nome: true, equipeId: true } });
  const userMap = new Map(usuarios.map(u => [u.id, u]));
  console.log("\n=== CarteiraParcela por consultor (Junho/2026) ===");
  for (const c of carteiraPorConsultor) {
    const u = userMap.get(c.consultorId);
    console.log(`  ${u?.nome ?? c.consultorId} (${u?.equipeId}): ${c._count.id}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
