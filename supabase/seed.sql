-- =============================================================================
-- Vou Contigo — seed.sql
-- Catálogo de planos (PLANO §3) e configurações/templates (PLANO §6.2).
-- Idempotente: pode rodar várias vezes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Catálogo de planos
-- -----------------------------------------------------------------------------
insert into public.plano (nome, horas, valor_centavos, tipo, descricao, ativo, ordem) values
  ('Essencial',    2,  15000, 'avulso',
   'Acompanhamento de até 2 horas: farmácia, mercado, banco ou um compromisso curto.', true, 1),
  ('Consulta',     4,  28000, 'avulso',
   'Até 4 horas para consulta ou exame: saída, espera, atendimento e volta em casa.', true, 2),
  ('Frequente 8h', 8,  52000, 'pacote_mensal',
   'Pacote mensal de 8 horas, usadas como a família precisar no mês.', true, 3),
  ('Frequente 12h', 12, 75000, 'pacote_mensal',
   'Pacote mensal de 12 horas, usadas como a família precisar no mês.', true, 4),
  ('Frequente 20h', 20, 118000, 'pacote_mensal',
   'Pacote mensal de 20 horas, para quem precisa de apoio toda semana.', true, 5)
on conflict (nome) do update
  set horas = excluded.horas,
      valor_centavos = excluded.valor_centavos,
      tipo = excluded.tipo,
      descricao = excluded.descricao,
      ativo = excluded.ativo,
      ordem = excluded.ordem;

-- -----------------------------------------------------------------------------
-- Configurações — regras de negócio editáveis pela gestora (PLANO §3)
-- -----------------------------------------------------------------------------
insert into public.configuracao (chave, valor) values
  ('valor_hora_centavos',           '7500'),
  ('minimo_horas_avulso',           '2'),
  ('raio_km',                       '20'),
  ('cidade_base',                   'Porto Alegre'),
  ('tolerancia_espera_min',         '15'),
  ('cancelamento_gratis_horas',     '24'),
  ('cancelamento_taxa_percentual',  '50'),
  ('saldo_baixo_horas',             '2'),
  ('chave_pix',                     ''),
  ('whatsapp_empresa',              ''),
  ('telegram_chat_gestao',          '')
on conflict (chave) do nothing;

-- -----------------------------------------------------------------------------
-- Templates de WhatsApp (PLANO §6.2). Placeholders no formato {chave}.
-- -----------------------------------------------------------------------------
insert into public.configuracao (chave, valor) values
  ('template_resposta_lead',
   'Oi, {nome}! Aqui é do Vou Contigo 💚 Recebi sua mensagem sobre {mensagem}. ' ||
   'A gente acompanha {acompanhado_ou_familiar} em consultas, exames, mercado, banco e passeios, ' ||
   'e manda um relatório para você depois de cada saída. Me conta: que dia e horário você precisa?'),

  ('template_confirmacao',
   'Oi, {nome}! Confirmado: {dia} às {hora}, acompanhamento de {acompanhado} para {tipo} em {destino}. ' ||
   'Saímos de {saida}. Qualquer mudança é só me avisar até {prazo_cancelamento}. 💚'),

  ('template_lembrete_d1',
   'Oi, {nome}! Lembrando que amanhã ({dia}) às {hora} eu acompanho {acompanhado} para {tipo}. Está tudo certo?'),

  ('template_lembrete_2h',
   'Oi, {nome}! Daqui a pouco ({hora}) eu passo para acompanhar {acompanhado} em {saida}. Já estou a caminho. 💚'),

  ('template_relatorio',
   '*Relatório — {acompanhado} · {dia}*' || chr(10) ||
   '✅ {tipo} em {destino}' || chr(10) ||
   '⏰ Saímos {inicio_real} e voltamos {fim_real}' || chr(10) ||
   '🗒️ {relatorio_texto}' || chr(10) ||
   '💰 Extras: {extras}' || chr(10) ||
   '⏳ Saldo do pacote: {horas_restantes}h' || chr(10) ||
   'Qualquer dúvida, estou por aqui. 💚'),

  ('template_saldo_baixo',
   'Oi, {nome}! Passando para avisar que restam {horas_restantes}h no pacote de {acompanhado}. ' ||
   'Quer que eu já deixe a renovação preparada para o próximo mês?'),

  ('template_cobranca_pix',
   'Oi, {nome}! Segue a cobrança de {valor} referente a {descricao}. ' ||
   'Chave PIX: {chave_pix}. Vencimento: {vencimento}. Assim que pagar é só mandar o comprovante. Obrigada! 💚')
on conflict (chave) do nothing;

-- -----------------------------------------------------------------------------
-- Promoção da primeira conta a gestora.
-- Enquanto não houver nenhuma gestora, o perfil mais antigo é promovido.
-- Para promover manualmente:
--   update public.perfil set papel = 'gestora' where id = '<uuid do auth.users>';
-- -----------------------------------------------------------------------------
update public.perfil
   set papel = 'gestora'
 where not exists (select 1 from public.perfil where papel = 'gestora')
   and id = (select id from public.perfil order by criado_em asc limit 1);
