#!/usr/bin/env bash
# =============================================================================
# Teste real de RLS do papel FAMILIAR (v2.0.0), via psql dentro do container
# do Postgres local do Supabase.
#
#   bash supabase/tests/rls_familiar.sh
#
# Tudo roda dentro de uma transação que termina em ROLLBACK: o banco fica
# exatamente como estava. Sai com código != 0 se qualquer verificação falhar.
# =============================================================================
set -uo pipefail

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_voucontigo}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "FALHA: container $CONTAINER não está rodando (npx supabase start)" >&2
  exit 1
fi

SAIDA=$(docker exec -i "$CONTAINER" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 <<'SQL' 2>&1
\set QUIET on
\pset pager off
begin;

-- ---------------------------------------------------------------------------
-- Cenário: dois clientes, cada um com seu usuário do portal do familiar.
-- ---------------------------------------------------------------------------
do $fix$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  c1 uuid; c2 uuid; a1 uuid; a2 uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'familiar1@teste.local', '', now(), now(), now(), '{}'::jsonb,
     '{"papel":"familiar"}'::jsonb),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'familiar2@teste.local', '', now(), now(), now(), '{}'::jsonb,
     '{"papel":"familiar"}'::jsonb);

  insert into public.cliente (nome, whatsapp, email, auth_user_id)
  values ('Familiar Um', '5551900000001', 'familiar1@teste.local', u1) returning id into c1;
  insert into public.cliente (nome, whatsapp, email, auth_user_id)
  values ('Familiar Dois', '5551900000002', 'familiar2@teste.local', u2) returning id into c2;

  insert into public.acompanhado (cliente_id, nome, endereco)
  values (c1, 'Dona Um', 'Rua Um, 1') returning id into a1;
  insert into public.acompanhado (cliente_id, nome, endereco)
  values (c2, 'Dona Dois', 'Rua Dois, 2') returning id into a2;

  -- Atendimento do cliente 1 daqui a ~2h => dentro do prazo, TEM taxa.
  -- valor_avulso_centavos = 30000, taxa 50% => 15000.
  insert into public.atendimento (id, cliente_id, acompanhado_id, tipo, endereco_saida,
                                  endereco_destino, data, hora_prevista_inicio,
                                  duracao_prevista_min, status, valor_avulso_centavos)
  values ('aaaaaaaa-0000-0000-0000-000000000001', c1, a1, 'consulta', 'Rua Um, 1',
          'Clínica', (now() at time zone 'America/Sao_Paulo' + interval '2 hours')::date,
          (now() at time zone 'America/Sao_Paulo' + interval '2 hours')::time,
          120, 'agendado', 30000);

  -- Atendimento do cliente 1 daqui a 5 dias => SEM taxa.
  insert into public.atendimento (id, cliente_id, acompanhado_id, tipo, endereco_saida,
                                  endereco_destino, data, hora_prevista_inicio,
                                  duracao_prevista_min, status, valor_avulso_centavos)
  values ('aaaaaaaa-0000-0000-0000-000000000002', c1, a1, 'mercado', 'Rua Um, 1',
          'Mercado', (current_date + 5), '10:00', 120, 'agendado', 30000);

  -- Atendimento do cliente 2.
  insert into public.atendimento (id, cliente_id, acompanhado_id, tipo, endereco_saida,
                                  endereco_destino, data, hora_prevista_inicio,
                                  duracao_prevista_min, status, valor_avulso_centavos)
  values ('bbbbbbbb-0000-0000-0000-000000000001', c2, a2, 'exame', 'Rua Dois, 2',
          'Laboratório', (current_date + 5), '15:00', 120, 'agendado', 40000);

  -- conversa de WhatsApp (para provar que anon não enxerga nada)
  insert into public.conversa_whatsapp (whatsapp, cliente_id) values ('5551900000001', c1);
end
$fix$;

create temporary table resultado_teste (ordem serial, caso text, ok boolean, detalhe text);
grant all on resultado_teste to authenticated, anon;
grant all on sequence resultado_teste_ordem_seq to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1. O trigger de signup NÃO cria perfil para familiar (senão viraria equipe)
-- ---------------------------------------------------------------------------
insert into resultado_teste (caso, ok, detalhe)
select 'familiar nao tem linha em perfil',
       count(*) = 0,
       'perfis encontrados: ' || count(*)
  from public.perfil
 where id in ('11111111-1111-1111-1111-111111111111',
              '22222222-2222-2222-2222-222222222222');

-- ---------------------------------------------------------------------------
-- 2. Como FAMILIAR 1: só enxerga o que é dele
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into resultado_teste (caso, ok, detalhe)
select 'cliente_do_familiar() resolve o cliente 1',
       public.cliente_do_familiar() = (select id from public.cliente where whatsapp = '5551900000001'),
       coalesce(public.cliente_do_familiar()::text, 'null');

insert into resultado_teste (caso, ok, detalhe)
select 'papel_atual() continua null para familiar', public.papel_atual() is null,
       coalesce(public.papel_atual()::text, 'null');

insert into resultado_teste (caso, ok, detalhe)
select 'SELECT atendimento devolve só os 2 do cliente 1',
       count(*) = 2 and bool_and(id::text like 'aaaaaaaa%'),
       'linhas: ' || count(*)
  from public.atendimento;

insert into resultado_teste (caso, ok, detalhe)
select 'SELECT cliente devolve só o próprio', count(*) = 1 and min(nome) = 'Familiar Um',
       'linhas: ' || count(*) from public.cliente;

insert into resultado_teste (caso, ok, detalhe)
select 'SELECT acompanhado devolve só o próprio', count(*) = 1 and min(nome) = 'Dona Um',
       'linhas: ' || count(*) from public.acompanhado;

insert into resultado_teste (caso, ok, detalhe)
select 'configuracao: vê template_* e horario_*, não vê chave_pix',
       count(*) filter (where chave = 'template_confirmacao') = 1
       and count(*) filter (where chave = 'horario_inicio') = 1
       and count(*) filter (where chave = 'dias_semana') = 1
       and count(*) filter (where chave = 'raio_km') = 1
       and count(*) filter (where chave = 'chave_pix') = 0
       and count(*) filter (where chave = 'valor_hora_centavos') = 0,
       'chaves visíveis: ' || count(*)
  from public.configuracao;

insert into resultado_teste (caso, ok, detalhe)
select 'plano: vê os ativos', count(*) >= 5, 'linhas: ' || count(*)
  from public.plano;

-- UPDATE direto tem que ser negado (nenhuma policy de update para familiar)
do $t$
declare n integer;
begin
  update public.atendimento set descricao = 'hack'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  insert into resultado_teste (caso, ok, detalhe)
  values ('UPDATE direto do familiar não altera nada', n = 0, 'linhas afetadas: ' || n);
exception when others then
  insert into resultado_teste (caso, ok, detalhe)
  values ('UPDATE direto do familiar não altera nada', true, 'negado: ' || sqlerrm);
end
$t$;

-- ---------------------------------------------------------------------------
-- 3. cancelar_atendimento_familiar de OUTRO cliente tem que falhar
-- ---------------------------------------------------------------------------
do $t$
declare r jsonb;
begin
  r := public.cancelar_atendimento_familiar('bbbbbbbb-0000-0000-0000-000000000001', 'tentativa');
  insert into resultado_teste (caso, ok, detalhe)
  values ('cancelar atendimento do cliente 2 falha', false, 'NÃO falhou: ' || r::text);
exception when others then
  insert into resultado_teste (caso, ok, detalhe)
  values ('cancelar atendimento do cliente 2 falha', true, sqlerrm);
end
$t$;

-- ---------------------------------------------------------------------------
-- 4. cancelar o próprio: com taxa (2h antes) e sem taxa (5 dias antes)
-- ---------------------------------------------------------------------------
do $t$
declare r jsonb;
begin
  r := public.cancelar_atendimento_familiar(
         'aaaaaaaa-0000-0000-0000-000000000001', 'imprevisto', 'whatsapp');
  insert into resultado_teste (caso, ok, detalhe)
  values ('cancelar o próprio (2h antes) cobra 50% de 30000 = 15000',
          (r->>'taxa_centavos')::int = 15000, r::text);
exception when others then
  insert into resultado_teste (caso, ok, detalhe)
  values ('cancelar o próprio (2h antes) cobra 50% de 30000 = 15000', false, sqlerrm);
end
$t$;

do $t$
declare r jsonb;
begin
  r := public.cancelar_atendimento_familiar(
         'aaaaaaaa-0000-0000-0000-000000000002', 'mudou de ideia');
  insert into resultado_teste (caso, ok, detalhe)
  values ('cancelar o próprio (5 dias antes) é grátis',
          (r->>'taxa_centavos')::int = 0, r::text);
exception when others then
  insert into resultado_teste (caso, ok, detalhe)
  values ('cancelar o próprio (5 dias antes) é grátis', false, sqlerrm);
end
$t$;

-- ---------------------------------------------------------------------------
-- 5. Efeitos gravados + evento no canal certo
-- ---------------------------------------------------------------------------
insert into resultado_teste (caso, ok, detalhe)
select 'status e taxa gravados no atendimento',
       bool_and(status = 'cancelado_cliente')
       and max(valor_extras_centavos) filter (where id::text like '%0001') = 15000,
       string_agg(status::text || '/' || coalesce(valor_extras_centavos::text, '-'), ' ')
  from public.atendimento
 where id in ('aaaaaaaa-0000-0000-0000-000000000001',
              'aaaaaaaa-0000-0000-0000-000000000002');

-- ---------------------------------------------------------------------------
-- 6. solicitar_atendimento pelo próprio familiar funciona, para outro não
-- ---------------------------------------------------------------------------
do $t$
declare a public.atendimento; c2 uuid; a2 uuid;
begin
  a := public.solicitar_atendimento(
         public.cliente_do_familiar(),
         (select id from public.acompanhado limit 1),
         'consulta', current_date + 7, '09:00', 120, 'Clínica Nova', null, 'whatsapp');
  insert into resultado_teste (caso, ok, detalhe)
  values ('solicitar_atendimento do próprio cliente cria em solicitado',
          a.status = 'solicitado' and a.endereco_saida = 'Rua Um, 1',
          a.status::text || ' / saida=' || a.endereco_saida);
exception when others then
  insert into resultado_teste (caso, ok, detalhe)
  values ('solicitar_atendimento do próprio cliente cria em solicitado', false, sqlerrm);
end
$t$;

reset role;
select set_config('request.jwt.claims', null, true);

do $t$
declare c2 uuid; a2 uuid;
begin
  select id into c2 from public.cliente where whatsapp = '5551900000002';
  select id into a2 from public.acompanhado where cliente_id = c2;
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  set local role authenticated;
  perform public.solicitar_atendimento(c2, a2, 'consulta', current_date + 7, '09:00');
  insert into resultado_teste (caso, ok, detalhe)
  values ('solicitar_atendimento para o cliente 2 falha', false, 'NÃO falhou');
exception when others then
  insert into resultado_teste (caso, ok, detalhe)
  values ('solicitar_atendimento para o cliente 2 falha', true, sqlerrm);
end
$t$;

reset role;
select set_config('request.jwt.claims', null, true);

-- ---------------------------------------------------------------------------
-- 7. Tabelas novas: sem acesso anon
-- ---------------------------------------------------------------------------
do $t$
declare n integer;
begin
  set local role anon;
  select count(*) into n from public.conversa_whatsapp;
  reset role;
  insert into resultado_teste (caso, ok, detalhe)
  values ('anon não lê conversa_whatsapp', n = 0, 'linhas: ' || n);
exception when others then
  reset role;
  insert into resultado_teste (caso, ok, detalhe)
  values ('anon não lê conversa_whatsapp', true, 'negado: ' || sqlerrm);
end
$t$;

do $t$
declare n integer;
begin
  set local role anon;
  insert into public.mensagem_whatsapp (conversa_id, direcao, corpo)
  values (gen_random_uuid(), 'entrada', 'hack');
  reset role;
  insert into resultado_teste (caso, ok, detalhe)
  values ('anon não escreve em mensagem_whatsapp', false, 'NÃO falhou');
exception when others then
  reset role;
  insert into resultado_teste (caso, ok, detalhe)
  values ('anon não escreve em mensagem_whatsapp', true, sqlerrm);
end
$t$;

do $t$
declare n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  select count(*) into n from public.conversa_whatsapp;
  reset role;
  insert into resultado_teste (caso, ok, detalhe)
  values ('familiar não lê conversa_whatsapp', n = 0, 'linhas: ' || n);
exception when others then
  reset role;
  insert into resultado_teste (caso, ok, detalhe)
  values ('familiar não lê conversa_whatsapp', true, 'negado: ' || sqlerrm);
end
$t$;

reset role;
select set_config('request.jwt.claims', null, true);

-- ---------------------------------------------------------------------------
-- 8. horarios_ocupados ignora cancelados
-- ---------------------------------------------------------------------------
insert into resultado_teste (caso, ok, detalhe)
select 'horarios_ocupados ignora cancelados',
       count(*) filter (where hora_inicio = '10:00:00') = 0,
       'linhas: ' || count(*)
  from public.horarios_ocupados(current_date, current_date + 10);

-- ---------------------------------------------------------------------------
-- Relatório
-- ---------------------------------------------------------------------------
\pset format unaligned
\pset tuples_only on
select case when ok then 'PASS' else 'FAIL' end || ' | ' || caso ||
       case when ok then '' else '  << ' || coalesce(detalhe, '') end
  from resultado_teste order by ordem;
select 'TOTAL ' || count(*) filter (where ok) || '/' || count(*) from resultado_teste;
select case when count(*) filter (where not ok) = 0 then 'RESULTADO OK'
            else 'RESULTADO COM FALHAS' end from resultado_teste;

rollback;
SQL
)

echo "$SAIDA"

if echo "$SAIDA" | grep -q "RESULTADO OK"; then
  exit 0
fi
echo "FALHA: ver linhas FAIL acima" >&2
exit 1
