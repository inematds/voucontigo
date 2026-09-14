-- =============================================================================
-- Vou Contigo — 0003_funcoes.sql
-- Funções de negócio: débito de horas do pacote e métricas de validação de preço.
--
-- A regra de horas é a MESMA de lib/domain/horas.ts (calcularHorasAtendimento):
--   duração real (min) + espera excedente à tolerância, arredondado para CIMA
--   em blocos de 30 minutos. A espera dentro da tolerância não conta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Leitura tipada de uma configuração numérica, com default.
-- -----------------------------------------------------------------------------
create or replace function public.config_numero(p_chave text, p_padrao numeric)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select nullif(c.valor, '')::numeric from public.configuracao c where c.chave = p_chave),
    p_padrao
  );
$$;

-- security invoker de propósito: quem chama só enxerga as configs que a RLS
-- permite. Dentro de debitar_horas_pacote (security definer) roda como owner.
revoke all on function public.config_numero(text, numeric) from public, anon;
grant execute on function public.config_numero(text, numeric) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Horas cobráveis de um atendimento já executado.
-- -----------------------------------------------------------------------------
create or replace function public.calcular_horas_atendimento(
  p_inicio_real timestamptz,
  p_fim_real timestamptz,
  p_minutos_espera integer,
  p_tolerancia_espera_min integer
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_minutos_servico numeric;
  v_espera_excedente numeric;
  v_total numeric;
  v_blocos numeric;
begin
  if p_inicio_real is null or p_fim_real is null then
    return null;
  end if;

  v_minutos_servico := greatest(extract(epoch from (p_fim_real - p_inicio_real)) / 60.0, 0);
  v_espera_excedente := greatest(coalesce(p_minutos_espera, 0) - coalesce(p_tolerancia_espera_min, 0), 0);
  v_total := v_minutos_servico + v_espera_excedente;

  if v_total <= 0 then
    return 0;
  end if;

  -- arredonda para cima em blocos de 30 minutos
  v_blocos := ceil(round(v_total::numeric, 6) / 30.0);
  return round(v_blocos * 0.5, 2);
end;
$$;

revoke all on function public.calcular_horas_atendimento(
  timestamptz, timestamptz, integer, integer
) from public, anon;
grant execute on function public.calcular_horas_atendimento(
  timestamptz, timestamptz, integer, integer
) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- debitar_horas_pacote(atendimento_id)
-- Calcula horas_debitadas do atendimento, grava, e atualiza o saldo do pacote.
-- Sem pacote vinculado, calcula o valor avulso e não mexe em pacote nenhum.
-- Retorna JSON com o resultado.
-- -----------------------------------------------------------------------------
create or replace function public.debitar_horas_pacote(p_atendimento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.atendimento;
  pk public.pacote;
  v_tolerancia integer;
  v_horas numeric;
  v_valor_hora integer;
  v_minimo_horas numeric;
  v_extras integer;
  v_valor_avulso integer := null;
  v_novo_status public.status_pacote;
begin
  -- equipe (gestora ou acompanhante) ou rotina de servidor sem sessão debita horas;
  -- a função é idempotente e recalcula o saldo do zero, então a acompanhante pode chamá-la ao finalizar
  if auth.uid() is not null and not public.eh_equipe() then
    raise exception 'Apenas a equipe pode debitar horas do pacote';
  end if;

  perform set_config('voucontigo.rotina_interna', 'on', true);

  select * into a from public.atendimento where id = p_atendimento_id;
  if a.id is null then
    raise exception 'Atendimento % não encontrado', p_atendimento_id;
  end if;
  if a.status not in ('concluido', 'relatado') then
    raise exception 'Atendimento % ainda não foi concluído', p_atendimento_id;
  end if;

  v_tolerancia := public.config_numero('tolerancia_espera_min', 15)::integer;
  v_valor_hora := public.config_numero('valor_hora_centavos', 7500)::integer;
  v_minimo_horas := public.config_numero('minimo_horas_avulso', 2);

  v_horas := public.calcular_horas_atendimento(
    a.inicio_real, a.fim_real, a.minutos_espera, v_tolerancia
  );

  v_extras := coalesce(a.custo_estacionamento_centavos, 0)
            + coalesce(a.custo_pedagio_centavos, 0)
            + coalesce(a.custo_outros_centavos, 0);

  if a.pacote_id is null then
    v_valor_avulso := ceil(greatest(v_horas, v_minimo_horas) * v_valor_hora)::integer;
  end if;

  update public.atendimento
     set horas_debitadas = v_horas,
         valor_extras_centavos = v_extras,
         valor_avulso_centavos = v_valor_avulso
   where id = p_atendimento_id;

  if a.pacote_id is not null then
    -- recalcula o saldo somando TODOS os atendimentos do pacote (idempotente)
    update public.pacote p
       set horas_usadas = coalesce((
             select sum(x.horas_debitadas)
               from public.atendimento x
              where x.pacote_id = p.id
                and x.status in ('concluido', 'relatado')
           ), 0)
     where p.id = a.pacote_id
    returning * into pk;

    v_novo_status := pk.status;
    if pk.status = 'ativo' and pk.horas_usadas >= pk.horas_contratadas then
      v_novo_status := 'esgotado';
    elsif pk.status = 'esgotado' and pk.horas_usadas < pk.horas_contratadas then
      v_novo_status := 'ativo';
    end if;

    if v_novo_status is distinct from pk.status then
      update public.pacote set status = v_novo_status where id = pk.id returning * into pk;
    end if;
  end if;

  return jsonb_build_object(
    'atendimento_id', p_atendimento_id,
    'horas_debitadas', v_horas,
    'valor_extras_centavos', v_extras,
    'valor_avulso_centavos', v_valor_avulso,
    'pacote_id', a.pacote_id,
    'pacote_horas_usadas', pk.horas_usadas,
    'pacote_horas_restantes',
      case when pk.id is null then null
           else greatest(pk.horas_contratadas - pk.horas_usadas, 0) end,
    'pacote_status', pk.status
  );
end;
$$;

revoke all on function public.debitar_horas_pacote(uuid) from public, anon;
grant execute on function public.debitar_horas_pacote(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- metricas_validacao(de, ate)
-- Painel §6.1 "Métricas de validação": base para revisar preço após 10–20
-- atendimentos. Considera atendimentos concluídos/relatados no intervalo (data).
--
-- Receita considerada = avulsos (valor_avulso_centavos) + parcela rateada dos
-- pacotes: valor do pacote / horas_contratadas * horas_debitadas.
-- -----------------------------------------------------------------------------
create or replace function public.metricas_validacao(p_de date, p_ate date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_resultado jsonb;
begin
  -- só gestora (ou rotina de servidor sem sessão) vê as métricas
  if auth.uid() is not null and not public.eh_gestora() then
    raise exception 'Apenas a gestora vê as métricas de validação' using errcode = '42501';
  end if;

  with base as (
    select a.*,
           coalesce(a.custo_estacionamento_centavos, 0)
         + coalesce(a.custo_pedagio_centavos, 0)
         + coalesce(a.custo_outros_centavos, 0) as extras_centavos,
           extract(epoch from (a.fim_real - a.inicio_real)) / 3600.0 as horas_reais,
           a.duracao_prevista_min / 60.0 as horas_previstas,
           case
             when a.pacote_id is null then coalesce(a.valor_avulso_centavos, 0)
             else coalesce(
               (select p.valor_centavos::numeric / nullif(pc.horas_contratadas, 0)
                  from public.pacote pc join public.plano p on p.id = pc.plano_id
                 where pc.id = a.pacote_id) * coalesce(a.horas_debitadas, 0),
               0)
           end as receita_centavos
      from public.atendimento a
     where a.status in ('concluido', 'relatado')
       and a.data between p_de and p_ate
  )
  select jsonb_build_object(
    'de', p_de,
    'ate', p_ate,
    'total_atendimentos', count(*),
    'horas_previstas_total', round(coalesce(sum(horas_previstas), 0)::numeric, 2),
    'horas_reais_total', round(coalesce(sum(horas_reais), 0)::numeric, 2),
    'horas_debitadas_total', round(coalesce(sum(horas_debitadas), 0)::numeric, 2),
    'media_minutos_espera', round(coalesce(avg(minutos_espera), 0)::numeric, 1),
    'km_medio', round(coalesce(avg(km_rodados), 0)::numeric, 2),
    'km_total', round(coalesce(sum(km_rodados), 0)::numeric, 2),
    'custo_extra_medio_centavos', round(coalesce(avg(extras_centavos), 0)::numeric, 0),
    'custo_extra_total_centavos', coalesce(sum(extras_centavos), 0),
    'nivel_esforco_medio', round(coalesce(avg(nivel_esforco), 0)::numeric, 2),
    'receita_total_centavos', round(coalesce(sum(receita_centavos), 0)::numeric, 0),
    'receita_por_hora_efetiva_centavos',
      case when coalesce(sum(horas_reais), 0) = 0 then 0
           else round(coalesce(sum(receita_centavos), 0)::numeric
                      / sum(horas_reais)::numeric, 0) end
  )
  from base
  into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.metricas_validacao(date, date) from public, anon;
grant execute on function public.metricas_validacao(date, date) to authenticated, service_role;
