import { PrismaClient, Perfil, TipoEquipe } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed...");

  // ── Empresas ───────────────────────────────────────────────────────────────
  const empresas = await Promise.all([
    prisma.empresa.upsert({ where: { id: "emp-barretos-ab" }, update: {}, create: { id: "emp-barretos-ab", nome: "Barretos A&B", prefixos: ["BC", "BCB"] } }),
    prisma.empresa.upsert({ where: { id: "emp-barretos-c" }, update: {}, create: { id: "emp-barretos-c", nome: "Barretos C", prefixos: ["BCC"] } }),
    prisma.empresa.upsert({ where: { id: "emp-royal-prime" }, update: {}, create: { id: "emp-royal-prime", nome: "Royal Prime", prefixos: ["RP"] } }),
    prisma.empresa.upsert({ where: { id: "emp-royal-star" }, update: {}, create: { id: "emp-royal-star", nome: "Royal Star", prefixos: ["RS"] } }),
    prisma.empresa.upsert({ where: { id: "emp-pitangui" }, update: {}, create: { id: "emp-pitangui", nome: "Pitangui", prefixos: ["PG"] } }),
    prisma.empresa.upsert({ where: { id: "emp-mydest" }, update: {}, create: { id: "emp-mydest", nome: "Mydest", prefixos: [] } }),
    prisma.empresa.upsert({ where: { id: "emp-fapass" }, update: {}, create: { id: "emp-fapass", nome: "Fã Pass", prefixos: ["FP"] } }),
  ]);
  console.log(`✅ ${empresas.length} empresas criadas`);

  // ── Equipes ────────────────────────────────────────────────────────────────
  const equipes = await Promise.all([
    prisma.equipe.upsert({ where: { id: "eq-flash" }, update: {}, create: { id: "eq-flash", nome: "CRA / Apoio – Flash", tipo: TipoEquipe.FLASH, diasSemContato: 2 } }),
    prisma.equipe.upsert({ where: { id: "eq-1-30" }, update: {}, create: { id: "eq-1-30", nome: "CRA / Apoio 1 a 30", tipo: TipoEquipe.CRA_1_30, diasSemContato: 3 } }),
    prisma.equipe.upsert({ where: { id: "eq-31-90" }, update: {}, create: { id: "eq-31-90", nome: "CR 31 a 90", tipo: TipoEquipe.CR_31_90, diasSemContato: 5 } }),
    prisma.equipe.upsert({ where: { id: "eq-91-180" }, update: {}, create: { id: "eq-91-180", nome: "CR PDD 91 a 180", tipo: TipoEquipe.CR_PDD_91_180, diasSemContato: 7 } }),
    prisma.equipe.upsert({ where: { id: "eq-181plus" }, update: {}, create: { id: "eq-181plus", nome: "CR PDD 181+", tipo: TipoEquipe.CR_PDD_181, diasSemContato: 10 } }),
  ]);
  console.log(`✅ ${equipes.length} equipes criadas (Flash, 1-30, 31-90, 91-180, 181+)`);

  // ── Competência atual ──────────────────────────────────────────────────────
  const agora = new Date();
  const competencia = await prisma.competencia.upsert({
    where: { mes_ano: { mes: agora.getMonth() + 1, ano: agora.getFullYear() } },
    update: {},
    create: {
      mes: agora.getMonth() + 1,
      ano: agora.getFullYear(),
      descricao: `${agora.toLocaleString("pt-BR", { month: "long" })[0].toUpperCase()}${agora.toLocaleString("pt-BR", { month: "long" }).slice(1)}/${agora.getFullYear()}`,
    },
  });
  console.log(`✅ Competência: ${competencia.descricao}`);

  // ── Usuário Administrador ──────────────────────────────────────────────────
  const senhaAdmin = await bcrypt.hash("admin123", 12);
  const admin = await prisma.usuario.upsert({
    where: { email: "admin@grgroup.org" },
    update: {},
    create: {
      nome: "Administrador",
      email: "admin@grgroup.org",
      senhaHash: senhaAdmin,
      perfil: Perfil.ADMINISTRADOR,
    },
  });
  console.log(`✅ Admin criado: admin@grgroup.org / admin123`);

  // ── Gestor de exemplo ──────────────────────────────────────────────────────
  const senhaGestor = await bcrypt.hash("gestor123", 12);
  await prisma.usuario.upsert({
    where: { email: "gestor@dashcr.com" },
    update: {},
    create: {
      nome: "Gestor Exemplo",
      email: "gestor@dashcr.com",
      senhaHash: senhaGestor,
      perfil: Perfil.GESTOR,
      equipeId: "eq-1-30",
    },
  });

  // ── Consultores de exemplo ─────────────────────────────────────────────────
  const senhaConsultor = await bcrypt.hash("consultor123", 12);
  for (let i = 1; i <= 3; i++) {
    await prisma.usuario.upsert({
      where: { email: `consultor${i}@dashcr.com` },
      update: {},
      create: {
        nome: `Consultor ${i}`,
        email: `consultor${i}@dashcr.com`,
        senhaHash: senhaConsultor,
        perfil: Perfil.CONSULTOR,
        equipeId: "eq-1-30",
      },
    });
  }
  console.log(`✅ Usuários de exemplo criados`);

  // ── Configurações padrão ───────────────────────────────────────────────────
  await prisma.configuracao.upsert({
    where: { chave: "DIAS_ALERTA_SEM_CONTATO_FLASH" },
    update: {},
    create: { chave: "DIAS_ALERTA_SEM_CONTATO_FLASH", valor: "2" },
  });
  await prisma.configuracao.upsert({
    where: { chave: "VALOR_BASE_COMISSAO" },
    update: {},
    create: { chave: "VALOR_BASE_COMISSAO", valor: "1580.00" },
  });

  console.log("✅ Seed concluído!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
