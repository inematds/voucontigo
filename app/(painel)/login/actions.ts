"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type EstadoLogin = { erro?: string; ok?: string };

const esquemaSenha = z.object({
  email: z.string().trim().min(1, "Informe o e-mail.").email("E-mail inválido."),
  senha: z.string().min(6, "A senha precisa ter ao menos 6 caracteres."),
});

export async function entrarComSenha(
  _estado: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const parsed = esquemaSenha.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  });
  if (error) return { erro: "E-mail ou senha incorretos." };

  const destino = String(formData.get("proximo") || "/painel");
  revalidatePath("/painel", "layout");
  redirect(destino.startsWith("/painel") ? destino : "/painel");
}

const esquemaMagico = z.object({
  email: z.string().trim().min(1, "Informe o e-mail.").email("E-mail inválido."),
});

export async function enviarLinkMagico(
  _estado: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const parsed = esquemaMagico.safeParse({ email: formData.get("email") });
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
    options: { emailRedirectTo: `${origem}/login/callback` },
  });
  if (error) return { erro: "Não foi possível enviar o link agora." };

  return { ok: "Link enviado! Confira a caixa de entrada do seu e-mail." };
}

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/painel", "layout");
  redirect("/login");
}
