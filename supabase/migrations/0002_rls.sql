-- =============================================================================
-- Vou Contigo — 0002_rls.sql
-- Row Level Security, papéis e guardas de escrita.
--
-- Resumo do modelo de acesso:
--   * gestora      → tudo em todas as tabelas.
--   * acompanhante → SELECT em cliente, acompanhado, atendimento, plano,
--                    pacote e configuracao (esta última só nas chaves
--                    `template_*` e `tolerancia_espera_min`);
--                    UPDATE em atendimento SOMENTE nos campos de execução e
--                    relatório (garantido por trigger).
--   * anon         → apenas INSERT em `lead` (formulário da landing).
--   * service_role → ignora RLS (usado pelas rotas de API/bot).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Papel do usuário autenticado (security definer: lê `perfil` sem cair na RLS)
-- -----------------------------------------------------------------------------
create or replace function public.papel_atual()
returns public.papel
language sql
stable
security definer
set search_path = public
as $$
  select p.papel from public.perfil p where p.id = auth.uid();
$$;

create or replace function public.eh_gestora()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.papel_atual() = 'gestora', false);
$$;

create or replace function public.eh_equipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.papel_atual() is not null;
$$;

revoke all on function public.papel_atual() from public, anon;
revoke all on function public.eh_gestora() from public, anon;
revoke all on function public.eh_equipe() from public, anon;
grant execute on function public.papel_atual() to authenticated, service_role;
grant execute on function public.eh_gestora() to authenticated, service_role;
grant execute on function public.eh_equipe() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Cria `perfil` automaticamente ao inserir em auth.users.
-- Papel padrão: 'acompanhante'. A primeira conta é promovida a 'gestora'
-- manualmente (ver supabase/seed.sql) ou por SQL.
-- -----------------------------------------------------------------------------
create or replace function public.criar_perfil_para_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfil (id, nome, papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(coalesce(new.email, ''), '@', 1)),
    'acompanhante'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists criar_perfil_apos_signup on auth.users;
create trigger criar_perfil_apos_signup
  after insert on auth.users
  for each row execute function public.criar_perfil_para_novo_usuario();

-- -----------------------------------------------------------------------------
-- Guarda: acompanhante só altera campos de execução/relatório do atendimento.
-- -----------------------------------------------------------------------------
create or replace function public.guardar_campos_atendimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- gestora, service_role e rotinas internas do sistema passam direto
  if coalesce(current_setting('voucontigo.rotina_interna', true), 'off') = 'on'
     or auth.uid() is null
     or public.eh_gestora()
  then
    return new;
  end if;

  -- campos que a acompanhante NÃO pode alterar
  if new.cliente_id is distinct from old.cliente_id
     or new.acompanhado_id is distinct from old.acompanhado_id
     or new.acompanhante_id is distinct from old.acompanhante_id
     or new.pacote_id is distinct from old.pacote_id
     or new.tipo is distinct from old.tipo
     or new.descricao is distinct from old.descricao
     or new.endereco_saida is distinct from old.endereco_saida
     or new.endereco_destino is distinct from old.endereco_destino
     or new.data is distinct from old.data
     or new.hora_prevista_inicio is distinct from old.hora_prevista_inicio
     or new.duracao_prevista_min is distinct from old.duracao_prevista_min
     or new.horas_debitadas is distinct from old.horas_debitadas
     or new.valor_avulso_centavos is distinct from old.valor_avulso_centavos
     or new.valor_extras_centavos is distinct from old.valor_extras_centavos
     or new.motivo_cancelamento is distinct from old.motivo_cancelamento
     or new.criado_em is distinct from old.criado_em
     or new.id is distinct from old.id
  then
    raise exception 'Acompanhante só pode alterar campos de execução e relatório do atendimento';
  end if;

  -- status: só transições de execução
  if new.status is distinct from old.status
     and new.status not in ('em_andamento', 'concluido', 'relatado')
  then
    raise exception 'Acompanhante só pode mover o atendimento para em_andamento, concluido ou relatado';
  end if;

  return new;
end;
$$;

create trigger atendimento_guarda_campos
  before update on public.atendimento
  for each row execute function public.guardar_campos_atendimento();

-- -----------------------------------------------------------------------------
-- Função de conveniência: finaliza o atendimento gravando execução + relatório.
-- Usada pelo painel mobile e pelo bot Telegram (`/finalizar <id>`).
-- -----------------------------------------------------------------------------
create or replace function public.finalizar_atendimento(
  p_atendimento_id uuid,
  p_fim_real timestamptz default now(),
  p_minutos_espera integer default 0,
  p_km_rodados numeric default 0,
  p_custo_estacionamento_centavos integer default 0,
  p_custo_pedagio_centavos integer default 0,
  p_custo_outros_centavos integer default 0,
  p_nivel_esforco integer default 3,
  p_observacoes_internas text default null,
  p_relatorio_texto text default null
)
returns public.atendimento
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_atendimento public.atendimento;
begin
  if not exists (
    select 1 from public.atendimento where id = p_atendimento_id and inicio_real is not null
  ) then
    raise exception 'Atendimento % não foi iniciado (inicio_real vazio) ou não está acessível', p_atendimento_id;
  end if;

  update public.atendimento a
     set fim_real = p_fim_real,
         minutos_espera = p_minutos_espera,
         km_rodados = p_km_rodados,
         custo_estacionamento_centavos = p_custo_estacionamento_centavos,
         custo_pedagio_centavos = p_custo_pedagio_centavos,
         custo_outros_centavos = p_custo_outros_centavos,
         nivel_esforco = p_nivel_esforco,
         observacoes_internas = coalesce(p_observacoes_internas, a.observacoes_internas),
         relatorio_texto = coalesce(p_relatorio_texto, a.relatorio_texto),
         status = 'concluido'
   where a.id = p_atendimento_id
  returning a.* into v_atendimento;

  if v_atendimento.id is null then
    raise exception 'Atendimento % não encontrado ou sem permissão', p_atendimento_id;
  end if;

  return v_atendimento;
end;
$$;

revoke all on function public.finalizar_atendimento(
  uuid, timestamptz, integer, numeric, integer, integer, integer, integer, text, text
) from public, anon;
grant execute on function public.finalizar_atendimento(
  uuid, timestamptz, integer, numeric, integer, integer, integer, integer, text, text
) to authenticated, service_role;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.perfil        enable row level security;
alter table public.cliente       enable row level security;
alter table public.acompanhado   enable row level security;
alter table public.acompanhante  enable row level security;
alter table public.plano         enable row level security;
alter table public.pacote        enable row level security;
alter table public.atendimento   enable row level security;
alter table public.pagamento     enable row level security;
alter table public.lead          enable row level security;
alter table public.configuracao  enable row level security;
alter table public.evento        enable row level security;

-- perfil ----------------------------------------------------------------------
create policy perfil_ler_proprio on public.perfil
  for select to authenticated using (id = auth.uid());
create policy perfil_gestora_tudo on public.perfil
  for all to authenticated using (public.eh_gestora()) with check (public.eh_gestora());

-- cliente ---------------------------------------------------------------------
create policy cliente_gestora_tudo on public.cliente
  for all to authenticated using (public.eh_gestora()) with check (public.eh_gestora());
create policy cliente_equipe_ler on public.cliente
  for select to authenticated using (public.eh_equipe());

-- acompanhado -----------------------------------------------------------------
create policy acompanhado_gestora_tudo on public.acompanhado
  for all to authenticated using (public.eh_gestora()) with check (public.eh_gestora());
create policy acompanhado_equipe_ler on public.acompanhado
  for select to authenticated using (public.eh_equipe());

-- acompanhante ----------------------------------------------------------------
create policy acompanhante_gestora_tudo on public.acompanhante
  for all to authenticated using (public.eh_gestora()) with check (public.eh_gestora());
create policy acompanhante_ler_proprio on public.acompanhante
  for select to authenticated using (perfil_id = auth.uid());

-- plano -----------------------------------------------------------------------
create policy plano_gestora_tudo on public.plano
  for all to authenticated using (public.eh_gestora()) with check (public.eh_gestora());
create policy plano_equipe_ler on public.plano
  for select to authenticated using (public.eh_equipe());

-- pacote ----------------------------------------------------------------------
create policy pacote_gestora_tudo on public.pacote
  for all to authenticated using (public.eh_gestora()) with check (public.eh_gestora());
create policy pacote_equipe_ler on public.pacote
  for select to authenticated using (public.eh_equipe());

-- atendimento -----------------------------------------------------------------
create policy atendimento_gestora_tudo on public.atendimento
  for all to authenticated using (public.eh_gestora()) with check (public.eh_gestora());
create policy atendimento_equipe_ler on public.atendimento
  for select to authenticated using (public.eh_equipe());
-- UPDATE da acompanhante: a restrição de COLUNAS é feita pelo trigger
-- public.guardar_campos_atendimento (policies do Postgres não filtram por coluna).
create policy atendimento_acompanhante_atualizar on public.atendimento
  for update to authenticated
  using (public.eh_equipe())
  with check (public.eh_equipe());

-- pagamento -------------------------------------------------------------------
create policy pagamento_gestora_tudo on public.pagamento
  for all to authenticated using (public.eh_gestora()) with check (public.eh_gestora());

-- lead ------------------------------------------------------------------------
create policy lead_gestora_tudo on public.lead
  for all to authenticated using (public.eh_gestora()) with check (public.eh_gestora());
-- Formulário público da landing. Na prática a rota usa service role, mas a
-- policy fica aqui de propósito (fallback e documentação do contrato).
create policy lead_anon_inserir on public.lead
  for insert to anon with check (true);

-- configuracao ----------------------------------------------------------------
create policy configuracao_gestora_tudo on public.configuracao
  for all to authenticated using (public.eh_gestora()) with check (public.eh_gestora());
-- Acompanhante lê só o que precisa para escrever relatório e calcular horas.
create policy configuracao_equipe_ler on public.configuracao
  for select to authenticated
  using (
    public.eh_equipe()
    and (chave like 'template\_%' or chave = 'tolerancia_espera_min')
  );

-- evento ----------------------------------------------------------------------
create policy evento_gestora_tudo on public.evento
  for all to authenticated using (public.eh_gestora()) with check (public.eh_gestora());
create policy evento_equipe_inserir on public.evento
  for insert to authenticated with check (public.eh_equipe());

-- -----------------------------------------------------------------------------
-- Grants de base (RLS ainda decide linha a linha)
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant insert on public.lead to anon;
