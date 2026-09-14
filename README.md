# 💚 Vou Contigo

> **Quando a família não pode estar presente, nós estamos.**

Plataforma do **Vou Contigo** — serviço de acompanhamento e apoio à rotina de pessoas mais velhas (consultas, exames, mercado, banco, farmácia, passeios), vendido para os filhos e familiares que não conseguem estar presentes.

O sistema tira o negócio do caderno e do WhatsApp solto **sem tirar o WhatsApp do cliente**: organiza a agenda, registra a execução de cada atendimento (com os números que validam o preço), entrega o relatório pronto para a família e avisa a gestão pelo Telegram.

## 📖 Guia de uso

Guia completo (landing + passo a passo): **https://inematds.github.io/voucontigo/guia/**

Plano de implementação completo (MVP v1.0.0, v2.0.0, v3.0.0, modelo de dados, templates): [PLANO.md](PLANO.md).

---

## O que tem no MVP (v1.0.0)

- **Landing promocional** (`/`) — mobile-first, na paleta do logo, com CTA fixo de WhatsApp e formulário curto que cria um lead e notifica a gestora no Telegram.
- **Painel** (`/painel`, login Supabase, papéis gestora/acompanhante) — agenda, clientes e acompanhados, pacotes e saldo de horas, financeiro em PIX manual, leads, configurações e métricas com exportação em CSV.
- **Execução do atendimento** — Iniciar/Finalizar com captura obrigatória de minutos de espera, km rodados, estacionamento, pedágio e nível de esforço (1–5). É isso que permite revisar o preço após 10–20 atendimentos.
- **Relatório de WhatsApp copiável** — texto pré-montado no modelo da marca, com "copiar" e "marcar como enviado".
- **Bot de Telegram da gestão** — notificações (novo lead, mudança de agenda, relatório pendente, saldo baixo) e comandos `/hoje`, `/amanha`, `/semana`, `/agendar`, `/cancelar`, `/iniciar`, `/finalizar`, `/relatorio`, `/saldo`, `/lead`.
- **Cron de lembretes** — rota protegida por `CRON_SECRET`, disparada pelo Vercel Cron.

**Fora de escopo no MVP:** WhatsApp API, pagamento online, portal do familiar, app nativo e qualquer campo de medicação ou prontuário.

## Stack

| Camada | Escolha |
|---|---|
| Web (landing, painel) | Next.js 15 (App Router) + TypeScript + Tailwind 4 |
| Banco, auth, storage | Supabase (Postgres + RLS + Auth + Storage) |
| Bot de gestão | grammY em rota Next.js (webhook) |
| Jobs agendados | Vercel Cron |
| Validação | Zod · testes com Vitest |
| Hospedagem | Vercel (deploy por `git push`) |

## Como rodar local

Pré-requisitos: Node 20+, npm e Docker (para o Supabase local).

```bash
git clone https://github.com/inematds/voucontigo.git
cd voucontigo
npm install

# 1. variáveis de ambiente
cp .env.example .env.local

# 2. Supabase local (imprime a URL e as chaves — copie para o .env.local)
npx supabase start

# 3. aplica as migrações de supabase/migrations
npx supabase db reset

# 4. sobe o app
npm run dev        # http://localhost:3000 · painel em /painel
```

Studio local do Supabase: `http://localhost:54323` — é lá que se cria a **usuária gestora** (Authentication → Add user). Um gatilho cria o `perfil` com papel padrão `acompanhante`; promova a primeira conta a `gestora` pelo SQL Editor:

```sql
update public.perfil set papel = 'gestora'
  where id = (select id from auth.users where email = 'voce@exemplo.com');
```

Outros scripts: `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`.

### Variáveis de ambiente

Todas listadas em [`.env.example`](.env.example):

| Variável | De onde vem |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API (ou a saída do `npx supabase start`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API — **só no servidor** |
| `TELEGRAM_BOT_TOKEN` | `@BotFather` |
| `TELEGRAM_WEBHOOK_SECRET` | string longa inventada por você; valida as chamadas do Telegram |
| `TELEGRAM_CHAT_GESTAO` | id do grupo privado da gestão |
| `CRON_SECRET` | segredo enviado pelo Vercel Cron como `Authorization: Bearer ...` |
| `NEXT_PUBLIC_SITE_URL` | URL pública do site |
| `NEXT_PUBLIC_WHATSAPP_EMPRESA` | número do WhatsApp Business, formato `55DDDNÚMERO` |

## Bot de Telegram

1. No Telegram, fale com **`@BotFather`** → `/newbot` → escolha nome e usuário → guarde o token em `TELEGRAM_BOT_TOKEN`.
2. Adicione o bot ao grupo privado da gestão e coloque o id do grupo em `TELEGRAM_CHAT_GESTAO`.
3. Defina um `TELEGRAM_WEBHOOK_SECRET` e registre o webhook:

```bash
npx tsx scripts/telegram-set-webhook.ts
```

O script aponta o webhook para `$NEXT_PUBLIC_SITE_URL/api/telegram`. Em desenvolvimento o Telegram exige uma URL pública — use um túnel (ex.: `ngrok http 3000`) e rode o script com `NEXT_PUBLIC_SITE_URL` apontando para ele.

## Deploy

Publicar é **`git push`**. O webhook git → Vercel faz o deploy automático; não há nada a fazer no dashboard.

```bash
git add -A
git commit -m "feat: ..."
git push
```

Antes do primeiro deploy, cadastre as mesmas variáveis do `.env.local` no projeto da Vercel (com as chaves do Supabase de produção) e rode o script do webhook do Telegram de novo já com a URL final.

## Limites do serviço

O Vou Contigo **não faz cuidados médicos**: sem medicação, enfermagem ou procedimentos. Por isso o sistema não tem campos de medicação nem prontuário — apenas "restrições declaradas" em texto livre, com o mínimo necessário.

Dados de pessoas idosas são sensíveis: coleta mínima, consentimento LGPD registrado no cadastro, fotos só com autorização explícita, exclusão a pedido e isolamento por RLS no Supabase.

---

Documentos: [PLANO.md](PLANO.md) · [docs/conversa-original.md](docs/conversa-original.md)
