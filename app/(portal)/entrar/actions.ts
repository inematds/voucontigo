"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type EstadoEntrar = { erro?: string; ok?: string };

const esquema = z.object({
  email: z.string().trim().min(1, "Informe o seu e-mail.").email("E-mail inválido."),
});

/** Link mágico do familiar (signInWithOtp por e-mail). */
export async function enviarLinkFamiliar(
  _estado: EstadoEntrar,
  formData: FormData,
): Promise<EstadoEntrar> {
  const parsed = esquema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "E-mail inválido." };
  }

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const origem = process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origem}/entrar/callback`,
      // O trigger de signup NÃO cria `perfil` (equipe) para quem entra com este papel.
      data: { papel: "familiar" },
    },
  });
  if (error) return { erro: "Não conseguimos enviar o link agora. Tente de novo em instantes." };

  return {
    ok: "Pronto! Enviamos um link para o seu e-mail. Abra pelo celular e você já entra.",
  };
}
