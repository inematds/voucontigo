-- =============================================================================
-- Vou Contigo — 0005_v2_rls_funcoes.sql
-- v2.0.0: RLS das tabelas novas, papel FAMILIAR (portal do familiar) e RPCs
-- de agendamento/cancelamento/vínculo.
--
-- Modelo de acesso acrescentado nesta migração:
--   * familiar     → usuário autenticado cujo auth.uid() = cliente.auth_user_id.
--                    SELECT (somente leitura) do que é dele: cliente, acompanhado,
--                    atendimento, pacote, pagamento; planos ativos; configurações
--                    públicas. Escreve SÓ pelas RPCs security definer.
--   * conversa/mensagem/webhook → leitura só para equipe; escrita só gestora
--                    ou service_role. Nenhum acesso anon.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Papel FAMILIAR
-- -----------------------------------------------------------------------------

-- Cliente vinculado ao usuário autenticado (null quando não é familiar).
-- security definer: lê `cliente` sem cair na própria RLS (evita recursão).
create or replace function public.cliente_do_familiar()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
    from public.cliente c
   where auth.uid() is not null
     and c.auth_user_id = auth.uid()
   limit 1;
$$;

create or replace function public.eh_familiar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cliente_do_familiar() is not null;
$$;

revoke all on function public.cliente_do_familiar() from public, anon;
revoke all on function public.eh_familiar() from public, anon;
grant execute on function public.cliente_do_familiar() to authenticated, service_role;
grant execute on function public.eh_familiar() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. O familiar NÃO pode ganhar `perfil` (senão viraria equipe pela 0002).
-- Reescreve o trigger de signup: quem é (ou será) familiar não recebe perfil.
-- -----------------------------------------------------------------------------
create or replace function public.criar_perfil_para_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Familiar explícito no metadata, ou e-mail/whatsapp que já é de um cliente:
  -- nesse caso o usuário é do portal do familiar e NÃO entra na equipe.
  if coalesce(new.raw_user_meta_data ->> 'papel', '') = 'familiar'
     or exists (
          select 1 from public.cliente c
           where c.auth_user_id = new.id
              or (new.email is not null and lower(c.email) = lower(new.email))
        )
  then
    return new;
  end if;

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

-- -----------------------------------------------------------------------------
-- 3. RLS das tabelas novas da v2 (0004)
-- -----------------------------------------------------------------------------
alter table public.conversa_whatsapp  enable row level security;
alter table public.mensagem_whatsapp  enable row level security;
alter table public.webhook_processado enable row level security;

-- leitura: equipe (gestora ou acompanhante). escrita: gestora (service_role
-- ignora RLS). Nenhuma policy para anon => negado por padrão.
create policy conversa_equipe_ler on public.conversa_whatsapp
  for select to authenticated using (public.eh_equipe());
create policy conversa_gestora_tudo on public.conversa_whatsapp
  for all to authenticated using (public.eh_gestora()) with check (public.eh_gestora());

create policy mensagem_equipe_ler on public.mensagem_whatsapp
  for select to authenticated using (public.eh_equipe());
create policy mensagem_gestora_tudo on public.mensagem_whatsapp
  for all to authenticated using (public.eh_gestora()) with check (public.eh_gestora());

create policy webhook_equipe_ler on public.webhook_processado
  for select to authenticated using (public.eh_equipe());
create policy webhook_gestora_tudo on public.webhook_processado
  for all to authenticated using (public.eh_gestora()) with check (public.eh_gestora());

-- Grants explícitos (a 0002 só cobriu as tabelas que existiam na época).
revoke all on public.conversa_whatsapp  from anon;
revoke all on public.mensagem_whatsapp  from anon;
revoke all on public.webhook_processado from anon;
grant select, insert, update, delete on public.conversa_whatsapp  to authenticated;
grant select, insert, update, delete on public.mensagem_whatsapp  to authenticated;
grant select, insert, update, delete on public.webhook_processado to authenticated;
grant all on public.conversa_whatsapp  to service_role;
grant all on public.mensagem_whatsapp  to service_role;
grant all on public.webhook_processado to service_role;

-- -----------------------------------------------------------------------------
-- 4. Policies de leitura do FAMILIAR (permissivas: somam-se às da 0002)
-- -----------------------------------------------------------------------------
create policy cliente_familiar_ler on public.cliente
  for select to authenticated
  using (id = public.cliente_do_familiar());

create policy acompanhado_familiar_ler on public.acompanhado
  for select to authenticated
  using (cliente_id = public.cliente_do_familiar());

create policy atendimento_familiar_ler on public.atendimento
  for select to authenticated
  using (cliente_id = public.cliente_do_familiar());

create policy pacote_familiar_ler on public.pacote
  for select to authenticated
  using (cliente_id = public.cliente_do_familiar());

create policy pagamento_familiar_ler on public.pagamento
  for select to authenticated
  using (cliente_id = public.cliente_do_familiar());

create policy plano_familiar_ler on public.plano
  for select to authenticated
  using (ativo and public.eh_familiar());

-- Só as chaves públicas: templates, janela de atendimento, cancelamento, raio.
create policy configuracao_familiar_ler on public.configuracao
  for select to authenticated
  using (
    public.eh_familiar()
    and (
      chave like 'template\_%'
      or chave like 'horario\_%'
      or chave like 'cancelamento\_%'
      or chave in ('dias_semana', 'raio_km', 'cidade_base')
    )
  );

-- Sem INSERT/UPDATE/DELETE para o familiar em nenhuma tabela: toda escrita
-- passa pelas RPCs security definer abaixo.

-- -----------------------------------------------------------------------------
-- 5. horarios_ocupados — base do cálculo de slots livres
-- -----------------------------------------------------------------------------
create or replace function public.horarios_ocupados(p_de date, p_ate date)
returns table (data date, hora_inicio time, duracao_min integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.eh_equipe() then
    raise exception 'Apenas a equipe vê a agenda completa' using errcode = '42501';
  end if;

  return query
    select a.data, a.hora_prevista_inicio, a.duracao_prevista_min
      from public.atendimento a
     where a.data between p_de and p_ate
       and a.status not in ('cancelado_cliente', 'cancelado_operacao')
     order by a.data, a.hora_prevista_inicio;
end;
$$;

revoke all on function public.horarios_ocupados(date, date) from public, anon;
grant execute on function public.horarios_ocupados(date, date) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Valor de referência de um atendimento (base da taxa de cancelamento)
-- -----------------------------------------------------------------------------
create or replace function public.valor_referencia_atendimento(p_atendimento_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.atendimento;
  v_rateio numeric;
  v_horas numeric;
begin
  select * into a from public.atendimento where id = p_atendimento_id;
  if a.id is null then
    return 0;
  end if;

  if a.valor_avulso_centavos is not null then
    return a.valor_avulso_centavos;
  end if;

  if a.pacote_id is not null then
    select (pl.valor_centavos::numeric / nullif(pc.horas_contratadas, 0))
      into v_rateio
      from public.pacote pc
      join public.plano pl on pl.id = pc.plano_id
     where pc.id = a.pacote_id;
    if v_rateio is not null then
      return round(v_rateio * (a.duracao_prevista_min / 60.0))::integer;
    end if;
  end if;

  v_horas := greatest(
    a.duracao_prevista_min / 60.0,
    public.config_numero('minimo_horas_avulso', 2)
  );
  return ceil(v_horas * public.config_numero('valor_hora_centavos', 7500))::integer;
end;
$$;

revoke all on function public.valor_referencia_atendimento(uuid) from public, anon;
grant execute on function public.valor_referencia_atendimento(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. cancelar_atendimento_familiar
-- Aplica a política de cancelamento (cancelamento_gratis_horas /
-- cancelamento_taxa_percentual) sobre o valor de referência.
-- -----------------------------------------------------------------------------
create or replace function public.cancelar_atendimento_familiar(
  p_atendimento_id uuid,
  p_motivo text default null,
  p_canal public.canal_evento default 'painel'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.atendimento;
  v_cliente uuid;
  v_gratis_horas numeric;
  v_percentual numeric;
  v_referencia integer;
  v_taxa integer := 0;
  v_quando timestamptz;
  v_mensagem text;
begin
  v_cliente := public.cliente_do_familiar();

  select * into a from public.atendimento where id = p_atendimento_id;
  if a.id is null then
    raise exception 'Atendimento não encontrado' using errcode = 'P0002';
  end if;

  -- service_role / rotina sem sessão passa; familiar só cancela o que é dele.
  if auth.uid() is not null and not public.eh_gestora() then
    if v_cliente is null or a.cliente_id <> v_cliente then
      raise exception 'Atendimento % não pertence ao familiar autenticado', p_atendimento_id
        using errcode = '42501';
    end if;
  end if;

  if a.status not in ('solicitado', 'agendado', 'confirmado') then
    raise exception 'Atendimento com status % não pode mais ser cancelado pelo cliente', a.status
      using errcode = '22023';
  end if;

  v_gratis_horas := public.config_numero('cancelamento_gratis_horas', 24);
  v_percentual   := public.config_numero('cancelamento_taxa_percentual', 50);

  -- horário previsto interpretado no fuso da operação
  v_quando := (a.data + a.hora_prevista_inicio) at time zone 'America/Sao_Paulo';

  if now() > v_quando - make_interval(mins => (v_gratis_horas * 60)::integer) then
    v_referencia := public.valor_referencia_atendimento(p_atendimento_id);
    v_taxa := round(v_referencia * v_percentual / 100.0)::integer;
  end if;

  perform set_config('voucontigo.rotina_interna', 'on', true);

  update public.atendimento
     set status = 'cancelado_cliente',
         motivo_cancelamento = p_motivo,
         valor_extras_centavos = case when v_taxa > 0 then v_taxa else valor_extras_centavos end
   where id = p_atendimento_id;

  insert into public.evento (atendimento_id, cliente_id, tipo, payload, canal)
  values (
    p_atendimento_id,
    a.cliente_id,
    'atendimento.cancelado_cliente',
    jsonb_build_object('motivo', p_motivo, 'taxa_centavos', v_taxa),
    p_canal
  );

  if v_taxa > 0 then
    v_mensagem := format(
      'Atendimento cancelado. Como faltavam menos de %s horas, a taxa de cancelamento é de R$ %s.',
      trim(to_char(v_gratis_horas, 'FM999990.99')),
      trim(to_char(v_taxa / 100.0, 'FM999G999D00'))
    );
  else
    v_mensagem := 'Atendimento cancelado sem custo. 💚';
  end if;

  return jsonb_build_object(
    'atendimento_id', p_atendimento_id,
    'status', 'cancelado_cliente',
    'taxa_centavos', v_taxa,
    'valor_referencia_centavos', coalesce(v_referencia, 0),
    'mensagem', v_mensagem
  );
end;
$$;

revoke all on function public.cancelar_atendimento_familiar(uuid, text, public.canal_evento)
  from public, anon;
grant execute on function public.cancelar_atendimento_familiar(uuid, text, public.canal_evento)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. solicitar_atendimento — entrada do bot de WhatsApp e do portal do familiar
-- -----------------------------------------------------------------------------
create or replace function public.solicitar_atendimento(
  p_cliente_id uuid,
  p_acompanhado_id uuid,
  p_tipo public.tipo_atendimento,
  p_data date,
  p_hora time,
  p_duracao_min integer default 120,
  p_destino text default null,
  p_saida text default null,
  p_canal public.canal_evento default 'whatsapp'
)
returns public.atendimento
language plpgsql
security definer
set search_path = public
as $$
declare
  ac public.acompanhado;
  v_saida text;
  v_pacote uuid;
  v_novo public.atendimento;
begin
  if auth.uid() is not null
     and not public.eh_gestora()
     and public.cliente_do_familiar() is distinct from p_cliente_id
  then
    raise exception 'Sem permissão para solicitar atendimento para este cliente'
      using errcode = '42501';
  end if;

  select * into ac from public.acompanhado where id = p_acompanhado_id;
  if ac.id is null or ac.cliente_id <> p_cliente_id then
    raise exception 'Acompanhado % não pertence ao cliente %', p_acompanhado_id, p_cliente_id
      using errcode = '22023';
  end if;

  v_saida := coalesce(nullif(trim(coalesce(p_saida, '')), ''), ac.endereco);

  -- pacote ativo com saldo suficiente (o que vence antes primeiro)
  select pc.id into v_pacote
    from public.pacote pc
   where pc.cliente_id = p_cliente_id
     and pc.status = 'ativo'
     and current_date between pc.valido_de and pc.valido_ate
     and (pc.horas_contratadas - pc.horas_usadas) >= (p_duracao_min / 60.0)
   order by pc.valido_ate asc
   limit 1;

  insert into public.atendimento (
    cliente_id, acompanhado_id, pacote_id, tipo,
    endereco_saida, endereco_destino,
    data, hora_prevista_inicio, duracao_prevista_min, status
  ) values (
    p_cliente_id, p_acompanhado_id, v_pacote, p_tipo,
    v_saida, coalesce(nullif(trim(coalesce(p_destino, '')), ''), v_saida),
    p_data, p_hora, p_duracao_min, 'solicitado'
  )
  returning * into v_novo;

  insert into public.evento (atendimento_id, cliente_id, tipo, payload, canal)
  values (
    v_novo.id, p_cliente_id, 'atendimento.solicitado',
    jsonb_build_object(
      'tipo', p_tipo, 'data', p_data, 'hora', p_hora,
      'duracao_min', p_duracao_min, 'pacote_id', v_pacote
    ),
    p_canal
  );

  return v_novo;
end;
$$;

revoke all on function public.solicitar_atendimento(
  uuid, uuid, public.tipo_atendimento, date, time, integer, text, text, public.canal_evento
) from public, anon;
grant execute on function public.solicitar_atendimento(
  uuid, uuid, public.tipo_atendimento, date, time, integer, text, text, public.canal_evento
) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9. vincular_familiar — chamada pelo callback de login (service role)
-- -----------------------------------------------------------------------------
create or replace function public.vincular_familiar(
  p_auth_user_id uuid,
  p_email text default null,
  p_whatsapp text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid;
begin
  if p_auth_user_id is null then
    return null;
  end if;

  -- já vinculado?
  select id into v_cliente from public.cliente where auth_user_id = p_auth_user_id;
  if v_cliente is not null then
    delete from public.perfil where id = p_auth_user_id;
    return v_cliente;
  end if;

  select c.id into v_cliente
    from public.cliente c
   where c.auth_user_id is null
     and (
       (p_email is not null and c.email is not null and lower(c.email) = lower(trim(p_email)))
       or (p_whatsapp is not null and c.whatsapp = regexp_replace(p_whatsapp, '[^0-9]', '', 'g'))
     )
   order by c.criado_em asc
   limit 1;

  if v_cliente is null then
    return null;
  end if;

  update public.cliente set auth_user_id = p_auth_user_id where id = v_cliente;
  -- familiar nunca é equipe
  delete from public.perfil where id = p_auth_user_id;

  return v_cliente;
end;
$$;

revoke all on function public.vincular_familiar(uuid, text, text) from public, anon, authenticated;
grant execute on function public.vincular_familiar(uuid, text, text) to service_role;

comment on function public.cliente_do_familiar() is
  'Cliente vinculado ao usuário autenticado (portal do familiar). Null para equipe/anon.';
comment on function public.cancelar_atendimento_familiar(uuid, text, public.canal_evento) is
  'Cancelamento pelo cliente com aplicação automática da política de taxa.';
comment on function public.solicitar_atendimento(
  uuid, uuid, public.tipo_atendimento, date, time, integer, text, text, public.canal_evento) is
  'Cria atendimento em status solicitado (bot de WhatsApp / portal do familiar).';
