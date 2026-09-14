import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Callback do link mágico (PKCE): troca o code por sessão e entra no painel. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const proximo = searchParams.get("proximo") ?? "/painel";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(
        `${origin}${proximo.startsWith("/painel") ? proximo : "/painel"}`,
      );
    }
  }

  return NextResponse.redirect(`${origin}/login?erro=link`);
}
