/**
 * Limpeza de dados de teste antes do go-live.
 * Mantém: Usuarios, Equipes, Empresas, EquipeConsultores.
 * Remove: todos os dados operacionais (contratos, clientes, competências, recebimentos, etc.)
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("=== Limpeza de dados de teste — preparação para go-live ===\n");

  // Ordem: filhos primeiro, pais depois (respeita FK)

  const delAud = await prisma.auditoria.deleteMany({});
  console.log(`Auditoria:       ${delAud.count} registros deletados`);

  const delSol = await prisma.solicitacao.deleteMany({});
  console.log(`Solicitações:    ${delSol.count} registros deletados`);

  const delRec = await prisma.recebimento.deleteMany({});
  console.log(`Recebimentos:    ${delRec.count} registros deletados`);

  const delPro = await prisma.promessa.deleteMany({});
  console.log(`Promessas:       ${delPro.count} registros deletados`);

  const delCont = await prisma.contato.deleteMany({});
  console.log(`Contatos:        ${delCont.count} registros deletados`);

  const delCart = await prisma.carteiraParcela.deleteMany({});
  console.log(`CarteiraParcela: ${delCart.count} registros deletados`);

  const delImp = await prisma.importacao.deleteMany({});
  console.log(`Importações:     ${delImp.count} registros deletados`);

  const delParc = await prisma.parcela.deleteMany({});
  console.log(`Parcelas:        ${delParc.count} registros deletados`);

  const delCtrt = await prisma.contrato.deleteMany({});
  console.log(`Contratos:       ${delCtrt.count} registros deletados`);

  const delCli = await prisma.cliente.deleteMany({});
  console.log(`Clientes:        ${delCli.count} registros deletados`);

  // Meta e Comissao referenciam Competencia — deletar antes
  const delMeta = await prisma.meta.deleteMany({});
  console.log(`Metas:           ${delMeta.count} registros deletados`);

  const delCom = await prisma.comissao.deleteMany({});
  console.log(`Comissões:       ${delCom.count} registros deletados`);

  const delComp = await prisma.competencia.deleteMany({});
  console.log(`Competências:    ${delComp.count} registros deletados`);

  console.log("\n✓ Sistema limpo. Usuários, equipes e empresas intactos.");
  console.log("  Próximo passo: criar competência Julho/2026 e reimportar a planilha.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
