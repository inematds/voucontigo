# Changelog de falhas (uma linha por falha, mais recente no topo)

| data | o que quebrou | menor correção | prompt \| infra |
|---|---|---|---|
| 2026-09-14 | `exigirPerfil` sintetizava papel `acompanhante` para usuário sem linha em `perfil`; familiar logado pelo portal entrava no painel (inbox, aprovações) via service role | sem `perfil` → redirect `/login?erro=sem_acesso`; `/entrar` envia metadata `papel=familiar` para o trigger não criar perfil | prompt |
| 2026-09-14 | `formatarHora/formatarData` de `lib/domain/templates.ts` usavam fuso do processo; na Vercel (UTC) o relatório enviado à família sairia 3h errado | `Intl.DateTimeFormat` com `timeZone: America/Sao_Paulo` + `TZ` no Dockerfile/env | prompt |
| 2026-09-14 | Migration 0004 chamava trigger `definir_atualizado_em()` mas a 0001 define `tocar_atualizado_em()` | corrigir o nome na 0004 | prompt |
| 2026-09-14 | Trigger de signup dava perfil `acompanhante` a todo usuário novo; familiar do portal viraria equipe e leria a base inteira | trigger pula e-mail que já é de `cliente` ou metadata papel=familiar; `vincular_familiar` apaga perfil | prompt |
| 2026-09-14 | `pkill` com exit 144 encadeado com `&&` cancelou o `git commit` seguinte | separar o commit do pkill | infra |
| 2026-09-14 | Helper local do bot Telegram (`lib/telegram/_local.ts`) calculava horas com regra diferente de `lib/domain/horas.ts` (abatia espera em vez de cobrar excedente) | delegar `calcularHoras`/`renderTemplate` para `lib/domain` e ajustar o teste | prompt |
| 2026-09-14 | RPC `debitar_horas_pacote` só permitia gestora; acompanhante finalizando caía em fallback manual bloqueado por RLS | guarda `eh_gestora()` → `eh_equipe()` (função é security definer e idempotente) | prompt |
| 2026-09-14 | `npx supabase start` falhou: porta 54322 ocupada pelo projeto local `my-inema` | trocar portas para 544xx no `supabase/config.toml` | infra |
| 2026-09-14 | `create-next-app` recusou a pasta por ter `PLANO.md`/`docs/` | gerar no scratchpad e `rsync` para o projeto | infra |
