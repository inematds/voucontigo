# Vou Contigo — o que falta na VPS (91.107.207.165 "Tiza") para ficar operacional

Estado em 2026-09-14: código v2.0.0 pronto no repo `inematds/voucontigo`. Nada instalado na VPS ainda.
A VPS já tem Docker, Caddy (rede `inemadlp_default`, serve dlp.inema.club) e ~1,5 GB de RAM + 5 GB de disco livres.

## 0. Contas externas (fora da VPS, feitas pela fundadora)
- [ ] **Supabase Cloud**: criar projeto; anotar URL, anon key, service role key. Em Auth → URL Configuration adicionar Redirect URLs `https://voucontigo.inema.club/entrar/callback` e `https://voucontigo.inema.club/login/callback`.
- [ ] **Telegram**: criar bot no @BotFather → token; criar grupo de gestão, adicionar o bot, pegar o chat id.
- [ ] **Asaas**: conta (sandbox primeiro) → API key; em Integrações → Webhooks apontar `https://voucontigo.inema.club/api/asaas/webhook` com token de acesso = `ASAAS_WEBHOOK_TOKEN`.
- [ ] **Resend** (opcional, e-mail): API key + domínio verificado.
- [ ] **DNS**: registros A `voucontigo.inema.club` e `evolution.inema.club` → 91.107.207.165.
- [ ] **Regras do negócio** (vão no painel → Configurações depois): raio km, endereço/lat/lng base, tolerância de espera, cancelamento grátis (h) e taxa (%), chave PIX, WhatsApp da empresa.

## 1. Preparar a VPS
- [ ] Liberar disco: `docker system prune -f` e `docker builder prune -f` (~5 GB recuperáveis; não remove containers ativos).
- [ ] `mkdir -p /root/projetos && cd /root/projetos && git clone https://github.com/inematds/voucontigo.git && cd voucontigo`

## 2. Banco: aplicar migrations no Supabase Cloud
- [ ] Na máquina local (ou na VPS com npx): `npx supabase link --project-ref <ref>` e `npx supabase db push` (aplica 0001→0005), depois rodar `supabase/seed.sql` no SQL Editor.
- [ ] Criar a primeira usuária (gestora) em Auth → Users; o seed promove a primeira conta a `gestora` (ou rodar `update perfil set papel='gestora' where id='<uuid>'`).

## 3. Evolution API (WhatsApp)
- [ ] `cp .env.evolution.example .env.evolution` e preencher `EVOLUTION_API_KEY` (chave longa) e `EVOLUTION_DB_PASSWORD`.
- [ ] `docker compose -p voucontigo -f docker-compose.evolution.yml --env-file .env.evolution up -d`
- [ ] Caddy: acrescentar o bloco `evolution.inema.club` de `deploy/Caddyfile.snippet` ao `/root/projetos/inemadlp/Caddyfile` e `docker exec inemadlp-caddy-1 caddy reload --config /etc/caddy/Caddyfile`.
- [ ] Abrir `https://evolution.inema.club/manager` (apikey = EVOLUTION_API_KEY), criar instância `voucontigo`, ler o QR com o celular do número do Vou Contigo.
- [ ] Na instância → Webhook: URL `https://voucontigo.inema.club/api/whatsapp?token=<WHATSAPP_WEBHOOK_TOKEN>`, eventos `MESSAGES_UPSERT` e `MESSAGES_UPDATE`, `webhook_by_events = false`, `webhook_base64 = false`.

## 4. App Next.js
- [ ] `cp .env.example .env` e preencher: Supabase (3 chaves), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (string aleatória), `TELEGRAM_CHAT_GESTAO`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL=https://voucontigo.inema.club`, `NEXT_PUBLIC_WHATSAPP_EMPRESA`, `WHATSAPP_PROVIDER=evolution`, `EVOLUTION_API_URL=http://voucontigo-evolution-1:8080`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE=voucontigo`, `WHATSAPP_WEBHOOK_TOKEN`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL`, `RESEND_API_KEY`/`EMAIL_FROM` (opcional), `GEOCODER_PROVIDER=nominatim`, `TZ=America/Sao_Paulo`.
- [ ] `docker compose -p voucontigo -f docker-compose.vps.yml --env-file .env up -d --build` (build ~3 min; container `voucontigo-app-1`, limite 512 MB).
- [ ] Caddy: acrescentar o bloco `voucontigo.inema.club` do snippet e recarregar (mesmo comando acima).
- [ ] Testar: `https://voucontigo.inema.club/` (landing), `/login` (painel), `/entrar` (portal do familiar), `/api/whatsapp` deve responder `{"ok":true,"provedor":"evolution"}`.

## 5. Telegram webhook
- [ ] Na VPS, dentro do repo: `docker compose -p voucontigo -f docker-compose.vps.yml run --rm app node -e "..."` ou, mais simples, na máquina local com o `.env` da VPS: `NEXT_PUBLIC_SITE_URL=https://voucontigo.inema.club npx tsx scripts/telegram-set-webhook.ts` (registra `https://voucontigo.inema.club/api/telegram` com o secret).
- [ ] No grupo: `/start` e `/ajuda` devem responder.

## 6. Crons (substituem os da Vercel)
- [ ] `cp deploy/vps-cron.example /etc/cron.d/voucontigo`, trocar `CRON_SECRET` pelo valor real; `chmod 644`. Rotas: `/api/cron/lembretes` 07:00, `/api/cron/lembrete-2h` a cada hora, `/api/cron/renovacoes` 06:30.
- [ ] Testar uma: `curl -H "Authorization: Bearer <CRON_SECRET>" https://voucontigo.inema.club/api/cron/lembretes` → `{"ok":true,...}`.

## 7. Validação ponta a ponta
- [ ] Mandar "oi" de outro celular para o número do Vou Contigo → bot responde boas-vindas e a gestão recebe aviso no Telegram (lead).
- [ ] Cadastrar esse número como cliente no painel, mandar "menu" → opções 1–5 funcionam; opção 3 lista horários livres.
- [ ] Criar um atendimento, iniciar/finalizar no painel → relatório chega no WhatsApp do cliente.
- [ ] Gerar PIX no financeiro (sandbox Asaas) → QR aparece; simular pagamento no sandbox → status vira pago.
- [ ] Familiar entra em `/entrar` com e-mail cadastrado → vê visitas, saldo, relatórios.

## Memória/RAM esperada na VPS
app ~250 MB + evolution ~350 MB + postgres da evolution ~60 MB. Cabe ao lado do inemadlp e do agent-zero, mas fica apertado: se faltar RAM, parar o agent-zero (`docker stop agent-zero`, 1,1 GB).
