-- v2.0.0 — DDL: conversas WhatsApp, mensagens, cobrança Asaas, portal do familiar.
-- RLS, funções e seed da v2 ficam em 0005_v2_rls_funcoes.sql.

-- Estados do bot de WhatsApp (menu numérico)
create type public.estado_conversa as enum (
  'menu',
  'agendar_acompanhado',
  'agendar_tipo',
  'agendar_data',
  'agendar_hora',
  'agendar_destino',
  'agendar_confirmar',
  'cancelar_escolher',
  'cancelar_confirmar',
  'humano',
  'encerrada'
);

create type public.direcao_mensagem as enum ('entrada', 'saida');
create type public.status_mensagem as enum ('recebida', 'enviada', 'entregue', 'lida', 'falhou');

-- Uma conversa por número de WhatsApp
create table public.conversa_whatsapp (
  id uuid primary key default gen_random_uuid(),
  whatsapp text not null unique check (whatsapp ~ '^[0-9]{10,15}$'),
  cliente_id uuid references public.cliente(id) on delete set null,
  estado public.estado_conversa not null default 'menu',
  dados jsonb not null default '{}'::jsonb,
  ultima_mensagem_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index conversa_whatsapp_cliente_idx on public.conversa_whatsapp (cliente_id);
create index conversa_whatsapp_estado_idx on public.conversa_whatsapp (estado);
create trigger conversa_whatsapp_atualizado_em
  before update on public.conversa_whatsapp
  for each row execute function public.tocar_atualizado_em();

-- Histórico de mensagens (idempotência pelo id do provedor)
create table public.mensagem_whatsapp (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversa_whatsapp(id) on delete cascade,
  direcao public.direcao_mensagem not null,
  wa_message_id text unique,
  corpo text not null,
  template text,
  status public.status_mensagem not null default 'recebida',
  criado_em timestamptz not null default now()
);
create index mensagem_whatsapp_conversa_idx on public.mensagem_whatsapp (conversa_id, criado_em desc);

-- Cobrança Asaas
alter table public.pagamento
  add column asaas_id text unique,
  add column pix_qrcode_base64 text,
  add column pix_copia_cola text,
  add column link_pagamento text;

-- Portal do familiar: vínculo do cliente com auth.users
alter table public.cliente
  add column auth_user_id uuid unique references auth.users(id) on delete set null;
create index cliente_auth_user_idx on public.cliente (auth_user_id);

-- Eventos de webhook já processados (idempotência do Asaas e afins)
create table public.webhook_processado (
  provedor text not null,
  evento_id text not null,
  recebido_em timestamptz not null default now(),
  primary key (provedor, evento_id)
);

-- Canal 'email' nos eventos
alter type public.canal_evento add value if not exists 'email';

comment on table public.conversa_whatsapp is 'Estado do bot de WhatsApp por número. estado=humano silencia o bot até a gestão liberar.';
comment on table public.mensagem_whatsapp is 'Histórico de entrada/saída. wa_message_id é a chave de idempotência do webhook.';
