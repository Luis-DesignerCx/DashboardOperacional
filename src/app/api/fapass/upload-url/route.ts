import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Gera uma URL assinada para upload direto ao Supabase Storage (bypass Vercel 4.5MB limit)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMINISTRADOR", "GESTOR"].includes(session.user?.perfil ?? "")) {
    return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  }

  const { competenciaId } = await req.json();
  if (!competenciaId) return NextResponse.json({ erro: "competenciaId obrigatório" }, { status: 400 });

  const competencia = await prisma.competencia.findUnique({ where: { id: competenciaId } });
  if (!competencia) return NextResponse.json({ erro: "Competência não encontrada" }, { status: 404 });
  if (competencia.fechada) return NextResponse.json({ erro: "Competência fechada" }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ erro: "Supabase Storage não configurado no servidor." }, { status: 500 });
  }

  // Nome do arquivo: competencias/{id}/{timestamp}.xlsx
  const filePath = `competencias/${competenciaId}/${Date.now()}.xlsx`;

  // Solicita URL assinada para upload ao Supabase Storage
  const resp = await fetch(`${supabaseUrl}/storage/v1/object/sign/upload/fapass/${filePath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ upsert: true }),
  });

  if (!resp.ok) {
    const erro = await resp.text();
    return NextResponse.json({ erro: `Erro ao gerar URL de upload: ${erro}` }, { status: 500 });
  }

  const { url: signedPath, token } = await resp.json();

  // Monta a URL completa para o cliente fazer o PUT
  const uploadUrl = signedPath.startsWith("http")
    ? signedPath
    : `${supabaseUrl}${signedPath}`;

  // Cria o registro de sync com status AGUARDANDO
  const sync = await prisma.faPassSync.create({
    data: { competenciaId, origem: "ACTIONS", status: "AGUARDANDO" },
  });

  return NextResponse.json({ uploadUrl, filePath, syncId: sync.id });
}
