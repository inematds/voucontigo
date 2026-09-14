-- =============================================================================
-- Vou Contigo — 0001_schema.sql
-- Schema núcleo do MVP (v1.0.0). Espelha lib/domain/types.ts.
--
-- REGRA DE DOMÍNIO (PLANO §3 e §6.3): o sistema NÃO possui campos de medicação,
-- prontuário, diagnóstico ou procedimento de saúde. O único campo próximo é
-- `acompanhado.restricoes_declaradas`, texto livre, mínimo necessário.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.papel as enum ('gestora', 'acompanhante');

create type public.origem_lead as enum (
  'landing', 'instagram', 'whatsapp', 'indicacao', 'clinica', 'outro'
);

create type public.status_lead as enum ('novo', 'contatado', 'convertido', 'perdido');

create type public.mobilidade as enum (
  'anda_sozinho', 'bengala', 'andador', 'cadeira_rodas', 'precisa_apoio'
);

create type public.tipo_atendimento as enum (
  'consulta', 'exame', 'fisioterapia', 'mercado', 'farmacia', 'banco', 'passeio', 'outro'
);

create type public.status_atendimento as enum (
  'solicitado', 'agendado', 'confirmado', 'em_andamento', 'concluido', 'relatado',
  'cancelado_cliente', 'cancelado_operacao', 'nao_compareceu'
);

create type public.tipo_plano as enum ('avulso', 'pacote_mensal');
create type public.status_pacote as enum ('ativo', 'esgotado', 'expirado', 'cancelado');
create type public.meio_pagamento as enum ('pix', 'dinheiro', 'cartao', 'transferencia');
create type public.status_pagamento as enum ('pendente', 'pago', 'cancelado');
create type public.canal_evento as enum ('painel', 'telegram', 'whatsapp', 'sistema');

-- -----------------------------------------------------------------------------
-- Trigger genérico de `atualizado_em`
-- -----------------------------------------------------------------------------
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- perfil — 1:1 com auth.users
-- -----------------------------------------------------------------------------
create table public.perfil (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  papel public.papel not null default 'acompanhante',
  telegram_chat_id text,
  criado_em timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- cliente — familiar/pagador
-- -----------------------------------------------------------------------------
create table public.cliente (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  whatsapp text not null,                        -- E.164 sem '+', ex.: 5551999998888
  email text,
  cpf text,
  endereco_cobranca text,
  origem public.origem_lead not null default 'landing',
  consentimento_lgpd_em timestamptz,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint cliente_whatsapp_formato check (whatsapp ~ '^[0-9]{10,15}$')
);

create index cliente_nome_idx on public.cliente (nome);
create unique index cliente_whatsapp_idx on public.cliente (whatsapp);
create index cliente_origem_idx on public.cliente (origem);

-- -----------------------------------------------------------------------------
-- acompanhado — a pessoa mais velha (sem login, sem prontuário)
-- -----------------------------------------------------------------------------
create table public.acompanhado (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.cliente (id) on delete cascade,
  nome text not null,
  apelido text,
  data_nascimento date,
  endereco text not null,
  telefone text,
  contato_emergencia_nome text,
  contato_emergencia_telefone text,
  mobilidade public.mobilidade not null default 'anda_sozinho',
  preferencias text,                             -- texto livre
  restricoes_declaradas text,                    -- texto livre, mínimo necessário
  foto_url text,                                 -- só com consentimento explícito
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index acompanhado_cliente_idx on public.acompanhado (cliente_id);
create index acompanhado_nome_idx on public.acompanhado (nome);

-- -----------------------------------------------------------------------------
-- acompanhante
-- -----------------------------------------------------------------------------
create table public.acompanhante (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid references public.perfil (id) on delete set null,
  nome text not null,
  whatsapp text not null,
  telegram_chat_id text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index acompanhante_perfil_idx on public.acompanhante (perfil_id)
  where perfil_id is not null;
create index acompanhante_ativo_idx on public.acompanhante (ativo);

-- -----------------------------------------------------------------------------
-- plano — catálogo
-- -----------------------------------------------------------------------------
create table public.plano (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  horas numeric(6, 2) not null check (horas > 0),
  valor_centavos integer not null check (valor_centavos >= 0),
  tipo public.tipo_plano not null,
  descricao text,
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index plano_ativo_ordem_idx on public.plano (ativo, ordem);

-- -----------------------------------------------------------------------------
-- pacote — compra de horas por um cliente
-- -----------------------------------------------------------------------------
create table public.pacote (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.cliente (id) on delete cascade,
  plano_id uuid not null references public.plano (id),
  horas_contratadas numeric(6, 2) not null check (horas_contratadas > 0),
  horas_usadas numeric(6, 2) not null default 0 check (horas_usadas >= 0),
  valido_de date not null,
  valido_ate date not null,
  status public.status_pacote not null default 'ativo',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint pacote_validade_coerente check (valido_ate >= valido_de)
);

create index pacote_cliente_idx on public.pacote (cliente_id);
create index pacote_status_idx on public.pacote (status);
create index pacote_validade_idx on public.pacote (valido_de, valido_ate);

-- -----------------------------------------------------------------------------
-- atendimento — unidade de serviço (PLANO §1)
-- -----------------------------------------------------------------------------
create table public.atendimento (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.cliente (id) on delete restrict,
  acompanhado_id uuid not null references public.acompanhado (id) on delete restrict,
  acompanhante_id uuid references public.acompanhante (id) on delete set null,
  pacote_id uuid references public.pacote (id) on delete set null,
  tipo public.tipo_atendimento not null default 'outro',
  descricao text,
  endereco_saida text not null,
  endereco_destino text not null,
  data date not null,
  hora_prevista_inicio time not null,
  duracao_prevista_min integer not null default 120 check (duracao_prevista_min > 0),
  status public.status_atendimento not null default 'solicitado',

  -- execução (null até finalizar)
  inicio_real timestamptz,
  fim_real timestamptz,
  minutos_espera integer check (minutos_espera >= 0),
  km_rodados numeric(7, 2) check (km_rodados >= 0),
  custo_estacionamento_centavos integer check (custo_estacionamento_centavos >= 0),
  custo_pedagio_centavos integer check (custo_pedagio_centavos >= 0),
  custo_outros_centavos integer check (custo_outros_centavos >= 0),
  nivel_esforco integer,
  observacoes_internas text,

  -- relatório
  relatorio_texto text,
  relatorio_enviado_em timestamptz,

  -- financeiro
  horas_debitadas numeric(6, 2) check (horas_debitadas >= 0),
  valor_avulso_centavos integer check (valor_avulso_centavos >= 0),
  valor_extras_centavos integer check (valor_extras_centavos >= 0),
  motivo_cancelamento text,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- esforço declarado sempre entre 1 e 5
  constraint atendimento_nivel_esforco_faixa
    check (nivel_esforco is null or (nivel_esforco between 1 and 5)),

  -- fim depois do início
  constraint atendimento_janela_real_coerente
    check (inicio_real is null or fim_real is null or fim_real >= inicio_real),

  -- REQUISITO DE VALIDAÇÃO DE PREÇO (PLANO §3): concluído/relatado exige
  -- todos os campos de execução preenchidos.
  constraint atendimento_execucao_obrigatoria check (
    status not in ('concluido', 'relatado')
    or (
      inicio_real is not null
      and fim_real is not null
      and minutos_espera is not null
      and km_rodados is not null
      and custo_estacionamento_centavos is not null
      and custo_pedagio_centavos is not null
      and custo_outros_centavos is not null
      and nivel_esforco is not null
    )
  )
);

create index atendimento_data_idx on public.atendimento (data, hora_prevista_inicio);
create index atendimento_status_idx on public.atendimento (status);
create index atendimento_cliente_idx on public.atendimento (cliente_id);
create index atendimento_acompanhado_idx on public.atendimento (acompanhado_id);
create index atendimento_acompanhante_idx on public.atendimento (acompanhante_id);
create index atendimento_pacote_idx on public.atendimento (pacote_id);
create index atendimento_status_data_idx on public.atendimento (status, data);
create index atendimento_inicio_real_idx on public.atendimento (inicio_real);

-- -----------------------------------------------------------------------------
-- pagamento
-- -----------------------------------------------------------------------------
create table public.pagamento (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.cliente (id) on delete cascade,
  pacote_id uuid references public.pacote (id) on delete set null,
  atendimento_id uuid references public.atendimento (id) on delete set null,
  valor_centavos integer not null check (valor_centavos >= 0),
  meio public.meio_pagamento not null default 'pix',
  status public.status_pagamento not null default 'pendente',
  vencimento date,
  pago_em timestamptz,
  referencia_externa text,
  descricao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint pagamento_pago_tem_data check (status <> 'pago' or pago_em is not null)
);

create index pagamento_cliente_idx on public.pagamento (cliente_id);
create index pagamento_status_idx on public.pagamento (status);
create index pagamento_vencimento_idx on public.pagamento (vencimento);
create index pagamento_pacote_idx on public.pagamento (pacote_id);
create index pagamento_atendimento_idx on public.pagamento (atendimento_id);

-- -----------------------------------------------------------------------------
-- lead — formulário da landing
-- -----------------------------------------------------------------------------
create table public.lead (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  whatsapp text not null,
  mensagem text,
  origem public.origem_lead not null default 'landing',
  status public.status_lead not null default 'novo',
  cliente_id uuid references public.cliente (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index lead_status_idx on public.lead (status);
create index lead_criado_em_idx on public.lead (criado_em desc);
create index lead_whatsapp_idx on public.lead (whatsapp);

-- -----------------------------------------------------------------------------
-- configuracao — chave/valor em texto (regras de negócio editáveis pela gestora)
-- -----------------------------------------------------------------------------
create table public.configuracao (
  chave text primary key,
  valor text not null,
  atualizado_em timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- evento — auditoria / linha do tempo
-- -----------------------------------------------------------------------------
create table public.evento (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid references public.atendimento (id) on delete cascade,
  cliente_id uuid references public.cliente (id) on delete cascade,
  tipo text not null,
  payload jsonb not null default '{}'::jsonb,
  canal public.canal_evento not null default 'sistema',
  criado_em timestamptz not null default now()
);

create index evento_atendimento_idx on public.evento (atendimento_id);
create index evento_cliente_idx on public.evento (cliente_id);
create index evento_tipo_idx on public.evento (tipo);
create index evento_criado_em_idx on public.evento (criado_em desc);

-- -----------------------------------------------------------------------------
-- Triggers de `atualizado_em`
-- -----------------------------------------------------------------------------
create trigger cliente_atualizado_em before update on public.cliente
  for each row execute function public.tocar_atualizado_em();
create trigger acompanhado_atualizado_em before update on public.acompanhado
  for each row execute function public.tocar_atualizado_em();
create trigger acompanhante_atualizado_em before update on public.acompanhante
  for each row execute function public.tocar_atualizado_em();
create trigger plano_atualizado_em before update on public.plano
  for each row execute function public.tocar_atualizado_em();
create trigger pacote_atualizado_em before update on public.pacote
  for each row execute function public.tocar_atualizado_em();
create trigger atendimento_atualizado_em before update on public.atendimento
  for each row execute function public.tocar_atualizado_em();
create trigger pagamento_atualizado_em before update on public.pagamento
  for each row execute function public.tocar_atualizado_em();
create trigger lead_atualizado_em before update on public.lead
  for each row execute function public.tocar_atualizado_em();
create trigger configuracao_atualizado_em before update on public.configuracao
  for each row execute function public.tocar_atualizado_em();
