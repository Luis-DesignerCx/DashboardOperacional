/**
 * Script único: migra todos os dados de CR_PDD_181 para CR_PDD_91_180 e deleta o registro.
 * Rodar: npx ts-node --project tsconfig.json scripts/merge-pdd181.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Localiza as duas equipes
  const origem = await prisma.equipe.findFirst({ where: { tipo: "CR_PDD_181" } });
  const destino = await prisma.equipe.findFirst({ where: { tipo: "CR_PDD_91_180" } });

  if (!origem) { console.log("CR_PDD_181 não encontrada — nada a fazer."); return; }
  if (!destino) { throw new Error("CR_PDD_91_180 não encontrada! Verifique o banco."); }

  console.log(`Origem : ${origem.id} (${origem.nome})`);
  console.log(`Destino: ${destino.id} (${destino.nome})`);

  // 1. Usuários
  const u = await prisma.usuario.updateMany({
    where: { equipeId: origem.id },
    data:  { equipeId: destino.id },
  });
  console.log(`Usuários migrados: ${u.count}`);

  // 2. EquipeConsultor (frentes adicionais)
  //    Deleta duplicatas que já existem no destino antes de mover o restante
  const jaExistem = await prisma.equipeConsultor.findMany({
    where: { equipeId: destino.id },
    select: { consultorId: true },
  });
  const idsJaVinculados = jaExistem.map((r) => r.consultorId);

  const deletadosDup = await prisma.equipeConsultor.deleteMany({
    where: { equipeId: origem.id, consultorId: { in: idsJaVinculados } },
  });
  console.log(`EquipeConsultor duplicatas removidas: ${deletadosDup.count}`);

  const ec = await prisma.equipeConsultor.updateMany({
    where: { equipeId: origem.id },
    data:  { equipeId: destino.id },
  });
  console.log(`EquipeConsultor migradas: ${ec.count}`);

  // 3. Metas
  const m = await prisma.meta.updateMany({
    where: { equipeId: origem.id },
    data:  { equipeId: destino.id },
  });
  console.log(`Metas migradas: ${m.count}`);

  // 4. Comissões
  const c = await prisma.comissao.updateMany({
    where: { equipeId: origem.id },
    data:  { equipeId: destino.id },
  });
  console.log(`Comissões migradas: ${c.count}`);

  // 5. Deleta a equipe CR_PDD_181
  await prisma.equipe.delete({ where: { id: origem.id } });
  console.log(`Equipe CR_PDD_181 deletada.`);

  console.log("\nMigração concluída com sucesso.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
