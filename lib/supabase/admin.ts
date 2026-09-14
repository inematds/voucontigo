import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Cliente com service role — SÓ no servidor (webhooks, cron, formulário público de lead). Ignora RLS. */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
