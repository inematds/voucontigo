# Changelog de falhas (uma linha por falha, mais recente no topo)

| data | o que quebrou | menor correção | prompt \| infra |
|---|---|---|---|
| 2026-09-14 | Helper local do bot Telegram (`lib/telegram/_local.ts`) calculava horas com regra diferente de `lib/domain/horas.ts` (abatia espera em vez de cobrar excedente) | delegar `calcularHoras`/`renderTemplate` para `lib/domain` e ajustar o teste | prompt |
| 2026-09-14 | RPC `debitar_horas_pacote` só permitia gestora; acompanhante finalizando caía em fallback manual bloqueado por RLS | guarda `eh_gestora()` → `eh_equipe()` (função é security definer e idempotente) | prompt |
| 2026-09-14 | `npx supabase start` falhou: porta 54322 ocupada pelo projeto local `my-inema` | trocar portas para 544xx no `supabase/config.toml` | infra |
| 2026-09-14 | `create-next-app` recusou a pasta por ter `PLANO.md`/`docs/` | gerar no scratchpad e `rsync` para o projeto | infra |
