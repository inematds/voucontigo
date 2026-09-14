import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CanalEvento, Perfil } from "@/lib/domain/types";
import { configNumerica, type ConfigNumerica } from "./dominio-local";

/** Usuário logado + perfil. Redireciona para /login se não houver sessão. */
export async function exigirPerfil(): Promise<{
  perfil: Perfil;
  email: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("perfil")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // Sem linha em `perfil` = não é equipe (ex.: familiar logado pelo portal). Não sintetizar papel.
  if (!data) redirect("/login?erro=sem_acesso");
  const perfil = data as Perfil;

  return { perfil, email: user.email ?? null };
}

/** Igual a exigirPerfil, mas exige papel 'gestora'. */
export async function exigirGestora() {
  const r = await exigirPerfil();
  if (r.perfil.papel !== "gestora") redirect("/painel");
  return r;
}

/** Todas as chaves da tabela configuracao como objeto. */
export async function lerConfiguracao(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("configuracao").select("chave, valor");
  const out: Record<string, string> = {};
  for (const linha of (data ?? []) as { chave: string; valor: string }[]) {
    out[linha.chave] = linha.valor;
  }
  return out;
}

export async function lerConfigNumerica(): Promise<{
  bruta: Record<string, string>;
  num: ConfigNumerica;
}> {
  const bruta = await lerConfiguracao();
  return { bruta, num: configNumerica(bruta) };
}

/** Registra um evento de auditoria. Nunca lança — auditoria não pode quebrar o fluxo. */
export async function registrarEvento(params: {
  tipo: string;
  atendimento_id?: string | null;
  cliente_id?: string | null;
  payload?: Record<string, unknown>;
  canal?: CanalEvento;
}): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("evento").insert({
      tipo: params.tipo,
      atendimento_id: params.atendimento_id ?? null,
      cliente_id: params.cliente_id ?? null,
      payload: params.payload ?? {},
      canal: params.canal ?? "painel",
    });
  } catch {
    // auditoria é best-effort
  }
}

/** Link wa.me com texto pré-preenchido. */
export function linkWhatsApp(numero: string, texto?: string): string {
  const limpo = (numero || "").replace(/\D/g, "");
  const base = `https://wa.me/${limpo}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}
