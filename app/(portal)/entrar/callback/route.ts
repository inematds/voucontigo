import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Só dígitos; devolve null quando não parece um telefone. */
function normalizarWhatsApp(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const digitos = valor.replace(/\D/g, "");
  return digitos.length >= 10 && digitos.length <= 15 ? digitos : null;
}

/**
 * Callback do link mágico do familiar: troca o code por sessão, tenta vincular
 * o auth.user ao cliente (RPC de service role) e manda para /minha-conta.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/entrar?erro=link`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/entrar?erro=link`);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/entrar?erro=link`);

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const whatsapp =
    normalizarWhatsApp(user.phone) ??
    normalizarWhatsApp(meta.whatsapp) ??
    normalizarWhatsApp(meta.phone) ??
    normalizarWhatsApp(meta.telefone);

  try {
    const admin = createAdminClient();
    await admin.rpc("vincular_familiar", {
      p_auth_user_id: user.id,
      p_email: user.email ?? null,
      p_whatsapp: whatsapp,
    });
  } catch {
    // RPC ainda não publicada: segue para a verificação abaixo.
  }

  // Verificação independente do retorno da RPC.
  let vinculado = false;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("cliente")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    vinculado = Boolean(data);
  } catch {
    vinculado = false;
  }

  return NextResponse.redirect(`${origin}${vinculado ? "/minha-conta" : "/entrar/sem-cadastro"}`);
}
