import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Migração já executada via script — equipe CR_PDD_181 foi removida do banco
export async function POST() {
  return NextResponse.json({ ok: true, mensagem: "Migração já concluída" });
}
