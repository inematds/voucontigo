# 💚 Vou Contigo — v2.0.0

> **Quando a família não pode estar presente, nós estamos.**

Plataforma do **Vou Contigo** — serviço de acompanhamento e apoio à rotina de pessoas mais velhas (consultas, exames, mercado, banco, farmácia, passeios), vendido para os filhos e familiares que não conseguem estar presentes.

O sistema tira o negócio do caderno e do WhatsApp solto **sem tirar o WhatsApp do cliente**: na v1 organiza agenda, execução e relatório; na **v2.0.0 ("Automação")** o próprio WhatsApp passa a agendar, cancelar, mostrar horários livres e mandar lembretes sozinho, a cobrança PIX vira Asaas e o familiar ganha um portal web.

## 📖 Guia de uso

Guia completo (landing + passo a passo): **https://inematds.github.io/voucontigo/guia/**

Plano de implementação completo (v1, v2 com o que ficou ✅/⚠️, v3, modelo de dados, templates): [PLANO.md](PLANO.md).

---

## O que tem

### v1.0.0 — "Caderno digital"

- **Landing promocional** (`/`) — mobile-first, na paleta do logo, com CTA fixo de WhatsApp e formulário curto que cria um lead e notifica a gestora no Telegram.
- **Painel** (`/painel`, login Supabase, papéis gestora/acompanhante) — agenda, clientes e acompanhados, pacotes e saldo de horas, financeiro, leads, configurações e métricas com exportação em CSV.
- **Execução do atendimento** — Iniciar/Finalizar com captura obrigatória de minutos de espera, km rodados, estacionamento, pedágio e nível de esforço (1–5). É isso que permite revisar o preço após 10–20 atendimentos.
- **Relatório de WhatsApp copiável** — texto pré-montado no modelo da marca.
- **Bot de Telegram da gestão** — notificações e comandos de agenda/execução.
- **Cron de lembretes** — rota protegida por `CRON_SECRET`.

### v2.0.0 — "Automação" (novo)

- **Bot de WhatsApp** (`lib/whatsapp/fluxo.ts` + `textos.ts`), menu numérico:
  `1` Agendar · `2` Cancelar ou remarcar · `3` Ver horários livres · `4` Meu saldo e próxima visita · `5` Falar com uma pessoa.
  Agendar oferece os slots livres calculados da agenda e grava pela RPC `solicitar_atendimento` (nasce `solicitado`, à espera da gestora). Cancelar usa `cancelar_atendimento_familiar`, que aplica a política e informa a taxa. Três situações põem a conversa no estado **`humano`**: a opção `5`, texto livre no menu e número sem cadastro (que também vira lead). Nesse estado o bot **silencia por completo** — nem "menu" reativa — até a gestão mandar `/liberar` no Telegram. Já dentro de um fluxo (escolher tipo, data, horário) a resposta inválida não escala: ele pede o número de novo.
- **Webhook de WhatsApp** (`app/api/whatsapp/route.ts`) — Evolution API por padrão; Meta Cloud API opcional com `WHATSAPP_PROVIDER=meta`.
- **Lembretes e avisos automáticos ao cliente** (`lib/automacao/**`) — confirmação ao aprovar a solicitação, **D-1**, **2h antes**, **relatório enviado sozinho** ao finalizar e envio semanal opcional dos horários livres (config `enviar_horarios_semanal`). O aviso de **saldo baixo** vai para o Telegram da gestão, com o texto pronto para ela mandar.
- **Raio de atendimento** — geocodificação do destino (Nominatim) e comparação com `lat_base`/`lng_base`. É **informativo**: sem base ou sem geocoder, responde "raio não verificado" e **não bloqueia nada**.
- **Cobrança PIX via Asaas** (`lib/asaas/**`) — cobrança com QR e copia-e-cola, webhook em `/api/asaas/webhook` autenticado pelo header **`asaas-access-token`**, e `/api/cron/renovacoes` avisando o vencimento dos pacotes mensais. O pacote novo só nasce quando o webhook confirma o pagamento.
- **Portal do familiar** (`app/(portal)/**`) — `/entrar` por **link mágico por e-mail**, `/minha-conta` (saldo, próximas visitas, histórico, dados do acompanhado, solicitar e cancelar), `/minha-conta/horarios` com "receber por e-mail / por WhatsApp", `/minha-conta/relatorios/[mes]` em **página imprimível** (Imprimir → Salvar como PDF) e `/minha-conta/calendario.ics` (download com a sessão aberta).
- **Telegram v2** (`lib/telegram/comandos-v2.ts`) — botões inline ✅ aprovar / ✏️ ajustar / ❌ recusar e os comandos `/solicitacoes`, `/conversas`, `/responder`, `/liberar`, `/resumo`, `/financeiro`.
- **Painel v2** — `/painel/inbox` (caixa de entrada WhatsApp + leads), `/painel/solicitacoes`, timeline por cliente e PIX do Asaas na tela de financeiro.
- **E-mail transacional** (`lib/email/cliente.ts`) — Resend via REST, sem SDK. Sem `RESEND_API_KEY` vira um cliente Fake que só registra.
- **Banco** — `supabase/migrations/0004_v2_schema.sql` (conversas e mensagens de WhatsApp, `webhook_processado`) e `0005_v2_rls_funcoes.sql` (papel familiar por `auth_user_id` e as RPCs `solicitar_atendimento`, `cancelar_atendimento_familiar`, `vincular_familiar`, `horarios_ocupados`).

**Ainda não feito (v3):** múltiplas acompanhantes, app PWA com check-in, avaliações e IA assistiva.

## Stack

| Camada | Escolha |
|---|---|
| Web (landing, painel, portal) | Next.js 15 (App Router) + TypeScript + Tailwind 4 |
| Banco, auth, storage | Supabase (Postgres + RLS + Auth) |
| WhatsApp | **Evolution API** self-hosted (número comum via QR) · Meta Cloud API opcional |
| Bot de gestão | grammY em rota Next.js (webhook) |
| Cobrança | Asaas (PIX, webhook) |
| E-mail | Resend (REST) |
| Jobs agendados | Vercel Cron (Hobby: só diário) ou cron do sistema na VPS |
| Validação | Zod · testes com Vitest |
| Hospedagem | VPS com Docker + Caddy, ou Vercel — sempre por `git push` |

## Como rodar local

Pré-requisitos: Node 20+, npm e Docker (para o Supabase local). O fluxo da v1 não mudou.

```bash
git clone https://github.com/inematds/voucontigo.git
cd voucontigo
npm install

# 1. variáveis de ambiente
cp .env.example .env.local

# 2. Supabase local (imprime a URL e as chaves — copie para o .env.local)
npx supabase start

# 3. aplica as migrações de supabase/migrations (0001 → 0005)
npx supabase db reset

# 4. sobe o app
npm run dev        # http://localhost:3000 · painel em /painel · portal em /minha-conta
```

Studio local do Supabase: `http://localhost:54323` — é lá que se cria a **usuária gestora** (Authentication → Add user). Um gatilho cria o `perfil` com papel padrão `acompanhante`; promova a primeira conta a `gestora` pelo SQL Editor:

```sql
update public.perfil set papel = 'gestora'
  where id = (select id from auth.users where email = 'voce@exemplo.com');
```

Sem Evolution, sem Asaas e sem Resend o app roda: o WhatsApp e o e-mail caem em clientes Fake que apenas registram o envio.

Outros scripts: `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`.

### Variáveis de ambiente

Todas listadas em [`.env.example`](.env.example).

**v1 (inalteradas)**

| Variável | De onde vem |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API (ou a saída do `npx supabase start`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API — **só no servidor** |
| `TELEGRAM_BOT_TOKEN` | `@BotFather` |
| `TELEGRAM_WEBHOOK_SECRET` | string longa inventada por você; valida as chamadas do Telegram |
| `TELEGRAM_CHAT_GESTAO` | id do grupo privado da gestão |
| `CRON_SECRET` | segredo enviado pelo cron como `Authorization: Bearer ...` |
| `NEXT_PUBLIC_SITE_URL` | URL pública do site |
| `NEXT_PUBLIC_WHATSAPP_EMPRESA` | número do WhatsApp Business, formato `55DDDNÚMERO` |
| `TZ` | **`America/Sao_Paulo`** — fuso do processo; defina também nas env vars do projeto na Vercel |

**v2 (novas)**

| Variável | De onde vem |
|---|---|
| `WHATSAPP_PROVIDER` | `evolution` (padrão) ou `meta` |
| `EVOLUTION_API_URL` | `http://evolution:8080` quando o app e a Evolution dividem a rede Docker |
| `EVOLUTION_API_KEY` | a **mesma** string de `AUTHENTICATION_API_KEY` da Evolution |
| `EVOLUTION_INSTANCE` | nome da instância criada no manager (`voucontigo`) |
| `WHATSAPP_WEBHOOK_TOKEN` | segredo que você inventa; a Evolution não assina o corpo, então ele viaja na query string |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_APP_SECRET` | só com `WHATSAPP_PROVIDER=meta` |
| `RESEND_API_KEY` / `EMAIL_FROM` | Resend → API Keys; o domínio do remetente precisa estar verificado |
| `ASAAS_API_KEY` / `ASAAS_WEBHOOK_TOKEN` / `ASAAS_BASE_URL` | Asaas → Integrações; comece em `https://sandbox.asaas.com/api/v3` |
| `GEOCODER_PROVIDER` / `GEOCODING_URL` / `GEOCODER_EMAIL` | Nominatim do OpenStreetMap; a política de uso **exige** um e-mail de contato |

Vazio = desligado, não = erro: sem `ASAAS_API_KEY` não há PIX automático, sem `RESEND_API_KEY` não há e-mail, sem geocoder o raio nunca é verificado.

## Subir a Evolution API na VPS

A Evolution roda ao lado do app, na mesma rede Docker (`inemadlp_default`), e é ela que conversa com o WhatsApp por um **número comum lido via QR** — sem verificação Meta e sem templates aprovados.

**1. Configurar e subir**

```bash
cp .env.evolution.example .env.evolution
# edite: EVOLUTION_SERVER_URL, EVOLUTION_API_KEY (string longa), EVOLUTION_DB_PASSWORD

docker compose -p voucontigo -f docker-compose.evolution.yml --env-file .env.evolution up -d
```

Use sempre `-p voucontigo` (ou rode de um diretório chamado `voucontigo`): o `deploy/Caddyfile.snippet` faz proxy para os containers `voucontigo-app-1` e `voucontigo-evolution-1`, nomes que dependem desse prefixo de projeto. A imagem está fixada em `atendai/evolution-api:v2.2.3`; o Postgres da Evolution é próprio e não tem relação com o Supabase.

**2. Criar a instância e ler o QR**

Abra `https://evolution.inema.club/manager` e entre com a `EVOLUTION_API_KEY`. Crie a instância com o nome **`voucontigo`** (o mesmo valor de `EVOLUTION_INSTANCE`), peça o QR Code e leia com o **celular do número do Vou Contigo** (WhatsApp → Aparelhos conectados). A sessão fica no volume `evolution_instances` e sobrevive a reinícios.

**3. Configurar o webhook da instância**

`WEBHOOK_GLOBAL_ENABLED` está `false` de propósito: o webhook é cadastrado **na instância**, no manager.

| Campo | Valor |
|---|---|
| URL | `https://voucontigo.inema.club/api/whatsapp?token=<WHATSAPP_WEBHOOK_TOKEN>` |
| Eventos | `MESSAGES_UPSERT` e `MESSAGES_UPDATE` |
| `webhook_by_events` | **false** (todos os eventos na mesma URL) |
| `webhook_base64` | **false** (não queremos mídia em base64) |

O mesmo `WHATSAPP_WEBHOOK_TOKEN` tem de estar no `.env` do app: a rota compara em tempo constante e devolve 401 se não bater. Mensagens de grupo, enviadas por você mesma e sem texto são ignoradas com 200; `wa_message_id` garante idempotência.

**4. Apontar o app para ela**

```env
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=http://evolution:8080   # nome do serviço na rede Docker compartilhada
EVOLUTION_API_KEY=<a mesma AUTHENTICATION_API_KEY>
EVOLUTION_INSTANCE=voucontigo
WHATSAPP_WEBHOOK_TOKEN=<o mesmo da URL do webhook>
```

## Asaas (cobrança PIX)

1. Crie a conta e comece em **sandbox** (`https://sandbox.asaas.com`): gere a API key e ponha em `ASAAS_API_KEY`, com `ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3`.
2. Cadastre o webhook apontando para `https://voucontigo.inema.club/api/asaas/webhook`, com um **token de autenticação** — o Asaas o envia no header **`asaas-access-token`**, e a rota compara com `ASAAS_WEBHOOK_TOKEN` (401 se não bater).
3. Eventos que importam: `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED` (marca pago) e `PAYMENT_DELETED` / `PAYMENT_REFUNDED` (desfaz). A rota responde 200 sempre que autenticada — o Asaas trava a fila em qualquer resposta não-2xx — e deduplica por `webhook_processado`.
4. Só depois de uma cobrança de ponta a ponta no sandbox troque para produção: `ASAAS_BASE_URL=https://api.asaas.com/v3` e a chave de produção (a config `asaas_ambiente` registra qual ambiente está em uso).

## Resend (e-mail, opcional)

Crie a API key em Resend, verifique o domínio usado em `EMAIL_FROM` e preencha as duas variáveis. Sem `RESEND_API_KEY` o sistema segue funcionando: o e-mail vira um cliente Fake e tudo sai só por WhatsApp.

## Supabase Auth — Redirect URLs

O projeto tem **dois** logins por link mágico. Em **Authentication → URL Configuration → Redirect URLs**, cadastre os dois, ou o link do e-mail volta com erro:

```
${NEXT_PUBLIC_SITE_URL}/entrar/callback     # portal do familiar
${NEXT_PUBLIC_SITE_URL}/login/callback      # painel da equipe
```

O familiar só entra se o **e-mail (ou o WhatsApp) já estiver cadastrado na ficha do cliente no painel** — é assim que a RPC `vincular_familiar` liga a conta ao cliente. Sem casar, o login cai em `/entrar/sem-cadastro`. Quem não é familiar vira `acompanhante` por padrão; a gestora é promovida por SQL.

## Deploy

Publicar é **`git push`** — o resto é webhook.

```bash
git add -A
git commit -m "feat: ..."
git push
```

### VPS (recomendado — é onde a Evolution vive)

```bash
docker compose -p voucontigo -f docker-compose.vps.yml --env-file .env up -d --build
```

- O Caddy do host faz TLS e proxy: acrescente `deploy/Caddyfile.snippet` ao Caddyfile (`voucontigo.inema.club` → `voucontigo-app-1:3000`, `evolution.inema.club` → `voucontigo-evolution-1:8080`).
- As variáveis `NEXT_PUBLIC_*` entram como **build args** (ficam embutidas no bundle), as demais vêm do `.env` em runtime.
- Os jobs viram cron do sistema: copie `deploy/vps-cron.example` para `/etc/cron.d/voucontigo`, troque o `CRON_SECRET` e o domínio. Ele usa `CRON_TZ=America/Sao_Paulo` e roda `07:00` lembretes, `06:30` renovações e **de hora em hora** o lembrete de 2h.

### Vercel

`vercel.json` já traz os três crons — em **UTC**, equivalentes aos horários da VPS: `0 10 * * *` (07:00 BRT, lembretes D-1 + resumo), `30 9 * * *` (06:30 BRT, renovações) e `0 * * * *` (lembrete de 2h).

> ⚠️ **O cron de hora em hora exige plano Pro.** No Hobby a Vercel só executa crons uma vez por dia e sem horário garantido, então o lembrete "2h antes" não funciona direito. Na VPS isso não é problema: o cron é do sistema.

Antes do primeiro deploy, cadastre as variáveis (incluindo `TZ=America/Sao_Paulo`) no projeto, e rode `npx tsx scripts/telegram-set-webhook.ts` já com a URL final.

## Comandos do Telegram

**v1 — agenda e execução**

| Comando | O que faz |
|---|---|
| `/start`, `/ajuda` | Lista os comandos disponíveis |
| `/hoje` | Agenda de hoje, com ids |
| `/amanha` | Agenda de amanhã |
| `/semana` | Próximos sete dias |
| `/agendar` | Assistente passo a passo de agendamento |
| `/cancelar <id>` | Cancela e registra o motivo, aplicando a política |
| `/iniciar <id>` | Check-in: grava a hora real de início |
| `/finalizar <id>` | Check-out: pede espera, km, estacionamento, pedágio e esforço 1–5 |
| `/relatorio <id>` | Monta o relatório no modelo da marca |
| `/saldo <cliente>` | Horas contratadas, usadas e restantes |
| `/lead` | Leads novos da landing, com link de WhatsApp |

**v2 — solicitações e conversas**

| Comando | O que faz |
|---|---|
| `/solicitacoes` | Solicitações pendentes do WhatsApp, com botões ✅ aprovar · ✏️ ajustar · ❌ recusar |
| `/conversas` | Quem está aguardando atendimento humano |
| `/responder <whatsapp> <texto>` | Responde a pessoa pelo WhatsApp sem sair do Telegram |
| `/liberar <whatsapp>` | Devolve a conversa ao bot (tira do estado `humano`) |
| `/resumo` | Resumo operacional de hoje |
| `/financeiro` | Resumo financeiro da última semana |

Além dos comandos, o bot avisa sozinho: novo lead, atendimento criado ou cancelado, nova solicitação do WhatsApp, pedido de atendimento humano, relatório pendente há mais de 2h e pacote com saldo baixo. O cron das 7h manda o resumo do dia; às segundas ele inclui o resumo financeiro da semana fechada.

## Limites do serviço

**Sem cuidados médicos.** O Vou Contigo não aplica medicação, não faz enfermagem nem procedimentos. Por isso o sistema não tem campos de medicação nem prontuário — apenas "restrições declaradas" em texto livre, com o mínimo necessário.

**LGPD.** Dados de pessoas idosas são sensíveis: coleta mínima, consentimento registrado no cadastro, fotos só com autorização explícita, exclusão a pedido e isolamento por RLS no Supabase. O familiar enxerga apenas o próprio cliente; a equipe, só o que o papel permite.

**Risco de bloqueio do número no WhatsApp.** A Evolution API usa um **número comum** conectado por QR, não a API oficial da Meta. É barato e sem burocracia, mas a Meta pode bloquear o número se houver comportamento de spam. Regras de uso, portanto:

- responder apenas conversas iniciadas pelo cliente;
- enviar **só mensagens sobre compromissos reais** (confirmação, lembrete, relatório, cobrança do que foi contratado);
- nada de disparo em massa, lista de transmissão, promoção ou marketing;
- manter um número de reserva e, se o volume crescer, migrar para a Meta Cloud API (`WHATSAPP_PROVIDER=meta`, já suportado no código).

## Roadmap — v3.0.0 "Rede"

- Múltiplas acompanhantes: cadastro, documentos, regiões, disponibilidade e repasse.
- Matching por região, disponibilidade e histórico com o mesmo acompanhado.
- App PWA da acompanhante com check-in/check-out e relatório guiado.
- Avaliação da família pós-atendimento e alerta de queda de qualidade.
- IA assistiva: rascunho/áudio vira relatório, resumo do histórico antes da visita, sugestão de rota.
- Financeiro completo (repasse, inadimplência, nota fiscal) e programa de indicação.

Antes disso, as lacunas conhecidas da v2 (§7.2 do PLANO): OTP por WhatsApp no portal, `.ics` por URL assinada, aviso "estou a caminho" no check-in e PDF do relatório gerado no servidor.

---

Documentos: [PLANO.md](PLANO.md) · [docs/conversa-original.md](docs/conversa-original.md)
