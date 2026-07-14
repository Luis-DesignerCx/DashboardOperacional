import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const equipe181 = await prisma.equipe.findFirst({ where: { tipo: "CR_PDD_181" } });
  const equipe91  = await prisma.equipe.findFirst({ where: { tipo: "CR_PDD_91_180" } });

  if (!equipe181) { console.log("Equipe 181+ não encontrada (já foi migrada ou não existe)"); return; }
  if (!equipe91)  { console.log("Equipe 91+ não encontrada"); return; }

  console.log(`Equipe 181+: ${equipe181.id} (${equipe181.nome})`);
  console.log(`Equipe 91+:  ${equipe91.id}  (${equipe91.nome})`);

  const usuarios = await prisma.usuario.findMany({ where: { equipeId: equipe181.id }, select: { id: true, nome: true } });
  console.log(`Usuários a mover: ${usuarios.length}`);
  usuarios.forEach(u => console.log(` - ${u.nome}`));

  if (usuarios.length > 0) {
    const result = await prisma.usuario.updateMany({
      where: { equipeId: equipe181.id },
      data:  { equipeId: equipe91.id },
    });
    console.log(`✓ ${result.count} usuário(s) movido(s) para 91+`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
