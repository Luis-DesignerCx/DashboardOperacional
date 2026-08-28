/**
 * Roda quando alguma etapa anterior do workflow fapass-sync.yml falha (download,
 * extração, ou o próprio fapass-importar.mjs morrendo antes de chegar no catch
 * dele). Sem isso, a sync ficava presa em "PROCESSANDO" pra sempre, porque só
 * o fapass-importar.mjs marcava erro -- e só quando ele chegava a rodar.
 * Uso: node scripts/fapass-marcar-erro.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const syncId = process.env.FAPASS_SYNC_ID;

if (!syncId) {
  console.log("FAPASS_SYNC_ID não definido, nada a fazer.");
  process.exit(0);
}

const atual = await prisma.faPassSync.findUnique({ where: { id: syncId } });

// Só sobrescreve se ainda estiver "em aberto" -- não pisa num erro específico
// que o fapass-importar.mjs já tenha registrado, nem num sucesso.
if (atual && (atual.status === "AGUARDANDO" || atual.status === "PROCESSANDO")) {
  await prisma.faPassSync.update({
    where: { id: syncId },
    data: {
      status: "ERRO",
      erro: "Falha em uma etapa do processamento (GitHub Actions). Confira os logs do workflow para detalhes.",
    },
  });
  console.log(`Sync ${syncId} marcada como ERRO.`);
} else {
  console.log(`Sync ${syncId} já estava com status "${atual?.status}", nada a fazer.`);
}

await prisma.$disconnect();
