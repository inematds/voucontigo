# Vou Contigo — Plano de implementação da plataforma

**Versão do documento:** 2.0.0 · **Data:** 2026-09-14 (v1 e v2 construídas)
**Fontes:** `docs/conversa-original.md` (conceito, planos, preços, próximos passos) e `assets/logo.jpg` (identidade visual).

---

## 0. Resumo executivo

O **Vou Contigo** é um serviço de acompanhamento e apoio à rotina (consultas, exames, mercado, banco, farmácia, passeios) para pessoas mais velhas, vendido para os **filhos e familiares** que não podem estar presentes. Hoje: **uma acompanhante** (a irmã da fundadora) e **uma gestora** (a fundadora). Canal principal: **WhatsApp**.

A plataforma existe para tirar o negócio do caderno e do WhatsApp solto **sem tirar o WhatsApp do cliente**. Ela precisa fazer quatro coisas bem:

1. **Agenda** — saber quem vai ser acompanhado, quando, onde, por quem.
2. **Atendimento** — registrar o que aconteceu (horas reais, espera, deslocamento, custos extras) e mandar o **relatório à família**.
3. **Comercial** — pacotes de horas, saldo, cobrança, lembretes.
4. **Aquisição** — landing page que converte para o WhatsApp.

Entregas em três versões:

| Versão | Nome | Objetivo | Prazo estimado |
|---|---|---|---|
| **v1.0.0 — MVP** | "Caderno digital" | Operar 1 acompanhante com organização, relatório e métricas de preço. Landing + painel + bot Telegram da gestão. WhatsApp manual. **Construída em 2026-09-14.** | 3–4 semanas (feito em 1 dia com agentes) |
| **v2.0.0** | "Automação" | WhatsApp via Evolution API (agendar, cancelar, horários livres, lembretes, relatório automático), cobrança PIX Asaas, portal do familiar, e-mail. **Construída em 2026-09-14.** | +6–8 semanas (feito em 1 dia com agentes) |
| **v3.0.0** | "Rede" | Múltiplas acompanhantes, app da acompanhante com check-in, avaliações, IA para agenda e relatório. | +8–12 semanas |

Segue o semver da casa (`vX.XX.YY`): dentro de cada major, minor/patch vão sendo somados sem zerar.

---

## 1. O que é um "atendimento" (definição central)

A palavra "atendimento" é ambígua neste domínio (pode ser "SAC" ou "serviço prestado"). No sistema, **atendimento é a unidade de serviço**:

```
Solicitação → Agendamento → Confirmação → Execução (check-in / check-out)
           → Relatório para a família → Débito de horas do pacote (ou cobrança avulsa)
```

WhatsApp, Telegram e painel são **canais** para agir sobre o atendimento. Não são o atendimento em si. Essa distinção define o modelo de dados e evita que o sistema vire "um chat com banco de dados".

**Cada atendimento tem um ciclo de estados:**

`solicitado → agendado → confirmado → em_andamento → concluido → relatado`
com saídas laterais: `cancelado_cliente`, `cancelado_operacao`, `nao_compareceu`.

---

## 2. Atores

| Ator | Quem é | O que faz | Onde interage |
|---|---|---|---|
| **Familiar / pagador** | Filho(a), neto(a), responsável | Solicita, agenda, cancela, recebe lembretes e relatório, paga | **WhatsApp** (v1 manual, v2 automático) e landing page. Portal web opcional em v2. |
| **Acompanhado(a)** | Pessoa mais velha | É acompanhada. **Não precisa de app, login nem celular.** | Nada. Só a ficha cadastral (preferências, endereço, contatos). |
| **Acompanhante** | A irmã (v1); várias (v3) | Executa o atendimento, faz check-in/out, escreve o relatório | Painel mobile-first (v1), bot Telegram (v1), app PWA (v3) |
| **Gestora** | A fundadora | Aprova solicitações, organiza agenda, cobra, acompanha métricas | **Painel de controle** + **bot Telegram** |

Premissa: em v1 gestora e acompanhante podem ser a mesma pessoa em momentos diferentes. O sistema tem papéis, não pessoas fixas.

---

## 3. Regras de negócio que a plataforma precisa carregar

Tiradas da conversa (seções 9 e 11). O sistema guarda essas regras como **configuração**, não como código, para que a gestora ajuste sem programador.

| Regra | Valor inicial (validação) | Onde aparece |
|---|---|---|
| Valor hora avulsa | R$ 60–90/h, mínimo 2h | Cálculo de orçamento |
| Plano Essencial | 2h — R$ 150 | Catálogo |
| Plano Consulta | até 4h — R$ 280 | Catálogo |
| Plano Frequente | 8h R$ 520 · 12h R$ 750 · 20h R$ 1.180 (mensal) | Catálogo, saldo de horas |
| Deslocamento especial | à parte (distância, estacionamento, pedágio) | Registro de custos extras no atendimento |
| Raio de atendimento | **a definir** (ex.: X km do centro da cidade) | Validação na solicitação |
| Política de espera | **a definir** (ex.: espera conta como hora; tolerância de 15 min) | Cálculo de horas do atendimento |
| Política de cancelamento | **a definir** (ex.: grátis até 24h antes; 50% com menos de 24h) | Fluxo de cancelamento via WhatsApp |
| Limite de atuação | **Não** faz cuidados médicos, medicação, enfermagem, procedimentos | Termos de uso; **o sistema não tem campos de medicação nem prontuário** |

**Validação de preço é requisito, não enfeite.** A conversa diz que os preços são provisórios até 10–20 atendimentos, observando tempo real, espera, deslocamento, combustível e desgaste. Logo, **o MVP obrigatoriamente captura por atendimento**: hora início/fim real, minutos de espera, km rodados, estacionamento/pedágio, observação de esforço. Sem isso a revisão de preço vira chute.

---

## 4. Modelo de dados (núcleo, vale para as três versões)

```
Cliente (familiar/pagador)
  id, nome, whatsapp, email?, cpf?, endereco_cobranca?, origem (landing|indicacao|instagram|...)
  consentimento_lgpd_em, observacoes

Acompanhado
  id, cliente_id, nome, apelido, data_nascimento?, endereco, telefone?,
  contato_emergencia, mobilidade (anda_sozinho|bengala|cadeira|...),
  preferencias (texto livre: "gosta de conversar", "não gosta de pressa"),
  restricoes_declaradas (texto livre, mínimo necessário, sem prontuário),
  foto? (opcional, consentida)

Acompanhante
  id, nome, whatsapp, telegram_chat_id, ativo, disponibilidade (v3), regiao (v3)

Plano (catálogo)
  id, nome, horas, valor, tipo (avulso|pacote_mensal), ativo

Pacote (compra de horas por um cliente)
  id, cliente_id, plano_id, horas_contratadas, horas_usadas, valido_de, valido_ate, status

Atendimento
  id, cliente_id, acompanhado_id, acompanhante_id?, pacote_id?
  tipo (consulta|exame|mercado|banco|farmacia|passeio|outro), descricao
  endereco_saida, endereco_destino, data, hora_prevista_inicio, duracao_prevista
  status (ver §1)
  -- execução (obrigatório no MVP):
  inicio_real, fim_real, minutos_espera, km_rodados, custo_estacionamento, custo_pedagio,
  custo_outros, nivel_esforco (1-5), observacoes_internas
  -- relatório:
  relatorio_texto, relatorio_enviado_em, fotos? (consentidas)
  -- financeiro:
  horas_debitadas, valor_avulso?, valor_extras

Pagamento
  id, cliente_id, pacote_id? | atendimento_id?, valor, meio (pix|dinheiro|cartao), status, pago_em, referencia_externa?

Lead
  id, nome, whatsapp, mensagem, origem (landing|instagram|...), status (novo|contatado|convertido|perdido), criado_em

Configuracao
  chave, valor  (raio_km, tolerancia_espera_min, politica_cancelamento, valor_hora, ...)

Evento (auditoria / linha do tempo)
  id, atendimento_id?, cliente_id?, tipo, payload, canal (painel|telegram|whatsapp|sistema), criado_em
```

**LGPD.** Dados de idosos, endereço, mobilidade e restrições são sensíveis. Regras: coletar o mínimo; consentimento registrado no cadastro; sem prontuário, sem medicação; fotos só com consentimento explícito; exclusão a pedido; acesso do painel por login.

---

## 5. Stack técnica

Escolhida para bater com o ecossistema já usado nos projetos INEMA (Next.js na Vercel, Supabase), o que reduz custo de manutenção.

| Camada | Escolha | Por quê |
|---|---|---|
| Web (landing, painel, portal) | **Next.js 15 (App Router) + TypeScript + Tailwind** | Mesmo padrão do portal inema.club; deploy automático por git → Vercel |
| Banco, auth, storage | **Supabase** (Postgres + RLS + Auth + Storage) | Já usado nas áreas logadas inema.pro; RLS resolve multi-papel; Storage para fotos consentidas |
| Jobs agendados (lembretes, renovações) | **Vercel Cron** (`vercel.json`) ou **cron do sistema na VPS** (`deploy/vps-cron.example`) chamando as rotas `/api/cron/*` | Sem infra própria; na VPS o cron horário não depende de plano pago |
| Bot Telegram (gestão) | **grammY** rodando em rota Next.js (webhook) | Grátis, simples, ótimo para notificar e comandar |
| WhatsApp | v1: **WhatsApp Business app** (manual, com templates copiáveis) · v2: **Evolution API** self-hosted (ver decisão §7.1; Meta Cloud API mantida como alternativa por env) | Número comum via QR, sem templates aprovados, custo zero por mensagem |
| Cobrança | v1: PIX manual (chave + comprovante) · v2: **Asaas** (PIX + boleto + cartão, webhook) | Asaas é o mais simples para MEI/pequeno no Brasil |
| Hospedagem | **Vercel** (deploy via `git push`, regra da casa) | — |
| Repositório | `inematds/voucontigo` (nome = pasta local) | Regra da casa |

**Identidade visual (do logo):** verde-oliva `#636751`, marrom `#7a583f`, bege `#ddcdb4`, bege-claro `#ccb99f`, creme de fundo `#fef9f3`. Tipografia serifada humanista no nome, sans espaçada nos subtítulos. Tom: acolhedor, sem estética hospitalar.

---

## 6. v1.0.0 — MVP "Caderno digital" (3–4 semanas)

**Meta:** a irmã opera com organização desde o primeiro cliente, a família recebe relatório profissional, a gestora enxerga tudo pelo Telegram e pelo painel, e o sistema junta os números para revisar preço após 10–20 atendimentos. **Nenhuma automação de WhatsApp** — o cliente continua falando com um humano.

### 6.1 Entregas

**A. Landing page promocional** (`/`)
- Uma página, mobile-first, paleta do logo, sem cara de clínica.
- Estrutura: herói com a dor ("Sua mãe precisa ir ao médico e você não consegue sair do trabalho?") → o que fazemos (lista de serviços) → como funciona (3 passos: chama no WhatsApp, combinamos, acompanhamos e mandamos relatório) → planos (Essencial / Consulta / Frequente, com "a partir de") → quem somos (foto da acompanhante, confiança) → o que **não** fazemos (transparência: sem cuidados médicos) → FAQ (espera, cancelamento, raio) → CTA fixo **"Falar no WhatsApp"**.
- Formulário curto de solicitação (nome, WhatsApp, o que precisa) que cria um **Lead** e notifica a gestora no Telegram.
- Botão WhatsApp com mensagem pré-preenchida (`wa.me/55...?text=`).
- SEO local (cidade + "acompanhamento idosos consulta"), Open Graph, Instagram link.

**B. Painel de controle** (`/painel`, login Supabase, papéis gestora/acompanhante)
- **Agenda**: visão semana/dia; criar, editar, mover, cancelar atendimento; cor por status.
- **Clientes e acompanhados**: cadastro com ficha do acompanhado (preferências, mobilidade, contato de emergência, consentimento LGPD).
- **Atendimento** (tela mobile-first para a acompanhante usar na rua):
  - botão **Iniciar** (grava `inicio_real`), **Finalizar** (grava `fim_real`);
  - campos obrigatórios ao finalizar: minutos de espera, km, estacionamento, pedágio, esforço 1–5;
  - campo de relatório com **modelo pré-preenchido** (ver §6.2) → botão "Copiar para WhatsApp" e "Marcar como enviado".
- **Pacotes e saldo**: vender pacote, ver horas usadas/restantes, alerta quando restar ≤ 2h.
- **Financeiro simples**: lista de cobranças, marcar como pago (PIX manual), extras por atendimento.
- **Leads**: lista, status, botão "abrir WhatsApp".
- **Configurações**: valores, raio, política de espera, política de cancelamento, chave PIX, textos dos templates.
- **Métricas de validação**: horas previstas × reais, média de espera, km médio, custo extra médio, receita/hora efetiva, ocupação semanal. Exportar CSV.

**C. Bot Telegram da gestão** (grupo privado gestora + acompanhante)
- Notifica: novo lead, atendimento criado/cancelado, lembrete "amanhã tem X às Y", relatório pendente há mais de 2h, saldo baixo de cliente.
- Comandos: `/hoje`, `/amanha`, `/semana`, `/agendar` (assistente passo a passo), `/cancelar <id>`, `/iniciar <id>`, `/finalizar <id>`, `/relatorio <id>`, `/saldo <cliente>`, `/lead`.
- Tudo que o bot faz, o painel também faz. O bot é o atalho no celular.

**D. Templates de WhatsApp (manuais, copiáveis do painel)**
- Resposta a lead, confirmação de agendamento, lembrete D-1, lembrete 2h antes, relatório pós-atendimento, aviso de saldo baixo, cobrança PIX. Ver §6.2.

### 6.2 Templates (rascunho inicial)

**Confirmação**
> Oi, {nome}! Confirmado: {dia} às {hora}, acompanhamento de {acompanhado} para {tipo} em {destino}. Saímos de {saida}. Qualquer mudança é só me avisar até {prazo_cancelamento}. 💚

**Lembrete D-1**
> Oi, {nome}! Lembrando que amanhã ({dia}) às {hora} eu acompanho {acompanhado} para {tipo}. Está tudo certo?

**Relatório pós-atendimento** (gerado a partir dos campos)
> **Relatório — {acompanhado} · {dia}**
> ✅ {tipo} em {destino}
> ⏰ Saímos {inicio_real} e voltamos {fim_real}
> 🗒️ {relatorio_texto — como foi, humor, o que o médico disse que pode ser repassado, compras feitas, etc.}
> 💰 Extras: {extras ou "nenhum"}
> ⏳ Saldo do pacote: {horas_restantes}h
> Qualquer dúvida, estou por aqui. 💚

### 6.3 Fora de escopo no MVP
- WhatsApp API / bot de WhatsApp.
- Pagamento online, cartão, assinatura recorrente automática.
- Portal do familiar com login.
- App nativo, GPS, mais de uma acompanhante.
- Qualquer campo de medicação, prontuário ou saúde além de "restrições declaradas" em texto livre.

### 6.4 Mapa dos "próximos passos" da conversa (§11) → onde entram

| Item da conversa | Versão | Como |
|---|---|---|
| Definir regras de cobrança | v1 | Configurações + catálogo de planos |
| Definir raio de atendimento | v1 | Config `raio_km`; v2 valida automaticamente pelo endereço |
| Política de espera | v1 | Config + cálculo de horas |
| Política de cancelamento | v1 | Config + texto no template; v2 aplica taxa automaticamente |
| Mensagem de WhatsApp | v1 | Templates copiáveis |
| 10 primeiros conteúdos de divulgação | v1 | Landing + pauta de Instagram (fora do sistema, mas o link da landing é o CTA) |
| Pacotes recorrentes | v1 | Pacote + saldo; v2 renovação automática |
| Validar preços | v1 | Métricas de validação + CSV |
| Padrão de atendimento | v1 | Checklist no fluxo Iniciar/Finalizar + relatório padronizado |
| Incorporar outras acompanhantes | v3 | Multi-acompanhante |

### 6.5 Cronograma sugerido

| Semana | Entregas |
|---|---|
| 1 | Repo, Supabase (schema + RLS), auth, layout base com paleta; landing publicada com lead → Telegram |
| 2 | Cadastros, agenda, atendimento (iniciar/finalizar/relatório copiável) |
| 3 | Pacotes/saldo, financeiro manual, configurações, bot Telegram completo, Vercel Cron de lembretes internos |
| 4 | Métricas, CSV, testes com 3–5 atendimentos reais, ajustes; **lançamento** |

### 6.6 Critérios de aceite do MVP
- A irmã consegue, só pelo celular, ver a agenda do dia, iniciar, finalizar e mandar o relatório em menos de 3 minutos.
- A gestora recebe no Telegram todo lead e toda mudança de agenda em menos de 1 minuto.
- Após 10 atendimentos, o painel mostra receita/hora efetiva e média de espera sem planilha à parte.
- A landing carrega em menos de 2 s no 4G e o botão do WhatsApp está sempre visível.

---

## 7. v2.0.0 — "Automação" (+6–8 semanas)

**Meta:** o familiar **agenda, cancela e recebe lembretes pelo WhatsApp** sem depender de alguém responder na hora; cobrança vira PIX automático; o relatório sai sozinho quando a acompanhante finaliza.

### 7.1 Decisão: qual WhatsApp API — **Evolution API (decidido em 2026-09-14)**
- **Evolution API (self-hosted, número comum via QR)** — escolhida pela fundadora. Sem verificação Meta, sem templates aprovados, texto livre a qualquer hora, roda na própria VPS (`docker-compose.evolution.yml`). Custo zero por mensagem. Risco: número comum pode ser bloqueado pela Meta se houver spam ou volume anormal; mitigação: só conversas iniciadas pelo cliente ou lembretes de compromissos reais, sem disparos em massa.
- **Meta WhatsApp Cloud API (oficial)** — mantida como alternativa no código (`WHATSAPP_PROVIDER=meta`): sem risco de banimento, mas exige Meta Business verificado, número dedicado e templates aprovados para mensagens fora da janela de 24h.

### 7.1b Horários livres por WhatsApp ou e-mail (requisito adicionado em 2026-09-14)
O familiar pode receber a lista de horários livres pelo canal que preferir: opção 3 do menu do WhatsApp, botões "Receber por e-mail / por WhatsApp" no portal do familiar, e envio semanal opcional pelo cron (config `enviar_horarios_semanal`). E-mail transacional via Resend (REST), com Fake quando não configurado.

### 7.2 Entregas — situação em 2026-09-14

Legenda: **✅ feito** · **⚠️ parcial** (entregue com desvio em relação ao que este plano previa).

- ✅ **Bot WhatsApp conversacional** (`lib/whatsapp/fluxo.ts` + `textos.ts`), menu numérico — a ordem final ficou diferente da rascunhada aqui:
  - `1` **Agendar** → tipo → data/horário (oferece slots livres calculados da agenda) → destino → resumo → confirmar. Grava via RPC `solicitar_atendimento`; nasce `solicitado` para a gestora aprovar.
  - `2` **Cancelar ou remarcar** → lista os atendimentos abertos → RPC `cancelar_atendimento_familiar`, que aplica a política de cancelamento e informa a taxa.
  - `3` **Ver horários livres** (opção adicionada — ver §7.1b).
  - `4` **Meu saldo e próxima visita**.
  - `5` **Falar com uma pessoa** → põe a conversa no estado `humano` e notifica o Telegram.
  - ✅ **Texto livre no menu** vai para o humano, como previsto. Entram em `humano` três situações: a opção `5`, texto livre no menu e **número sem cadastro** (que também vira lead). Dentro dos passos de um fluxo (escolher tipo, data, horário) a resposta inválida não escala: pede o número de novo. Uma vez em `humano`, **o bot fica totalmente em silêncio** — nem "menu" reativa — até `/liberar` no Telegram.
- ⚠️ **Lembretes automáticos** (`lib/automacao/lembretes.ts`): **D-1** e **2h antes** enviados direto ao cliente (WhatsApp + e-mail quando houver) e **confirmação ao aprovar** a solicitação. Não foram feitos o "estamos a caminho" disparado pelo check-in nem o pós-relatório "quer avaliar?". E não são *templates Meta*: o provedor é Evolution API, texto livre (§7.1).
- ✅ **Relatório automático** (`lib/automacao/relatorio.ts`): ao finalizar no painel ou no Telegram, o sistema monta e envia o relatório ao cliente.
- ✅ **Cobrança Asaas** (`lib/asaas/**`, `app/api/asaas/webhook`, `app/api/cron/renovacoes`): cobrança PIX com QR/copia-e-cola, webhook autenticado por header `asaas-access-token` marcando pago/estornado, aviso de vencimento e renovação mensal com `renovacao_aviso_dias` (padrão 3). O pacote novo só nasce quando o webhook confirma o pagamento.
- ⚠️ **Portal do familiar** (`app/(portal)/**`): `/entrar` por link mágico, `/minha-conta` com saldo, próximas visitas, histórico e dados do acompanhado; `/minha-conta/horarios` com solicitação e botões "receber por e-mail / por WhatsApp"; cancelamento pelo portal. Desvios:
  - ⚠️ o link mágico é **só por e-mail**; **OTP por WhatsApp está marcado "em breve"** na própria tela.
  - ⚠️ **PDF do mês** é, na prática, `/minha-conta/relatorios/[mes]` — uma **página imprimível** (botão Imprimir → "Salvar como PDF"), não um PDF gerado no servidor.
  - ⚠️ o vínculo familiar↔cliente depende de `vincular_familiar` casando **e-mail (ou WhatsApp) já cadastrado no painel**; sem isso o login cai em `/entrar/sem-cadastro`.
- ⚠️ **Regras aplicadas automaticamente**: taxa de cancelamento e espera após tolerância são calculadas e aplicadas ✅. O **raio** (`lib/automacao/raio.ts`, geocoder Nominatim) é **informativo**: sem `lat_base`/`lng_base` ou sem geocoder o resultado é "raio não verificado" e **nada é bloqueado** — a frase vai para a gestora decidir.
- ⚠️ **Telegram** (`lib/telegram/comandos-v2.ts` + `bot.ts`): botões inline ✅ aprovar / ✏️ ajustar / ❌ recusar ✅, novos comandos `/solicitacoes`, `/conversas`, `/responder`, `/liberar`, `/resumo`, `/financeiro` ✅. O **resumo diário sai junto do cron das 7h** (não é um job separado) e o **resumo financeiro semanal sai nesse mesmo cron às segundas** — ambos funcionam, mas dependem do cron de sistema na VPS (na Vercel Hobby o cron é diário).
- ⚠️ **Painel**: caixa de entrada unificada `/painel/inbox` ✅, `/painel/solicitacoes` ✅, timeline por cliente (tabela `evento`) ✅, **calendário `.ics`** em `/minha-conta/calendario.ics` ⚠️ — é **download autenticado pela sessão do portal**, não uma URL pública de assinatura que o Google Agenda consiga sincronizar sozinho.
- ✅ **E-mail transacional** (`lib/email/cliente.ts`): Resend via REST, sem SDK; sem `RESEND_API_KEY` o cliente vira Fake (só registra).
- ✅ **Banco**: migrações `0004_v2_schema.sql` (conversa/mensagem de WhatsApp, `webhook_processado`) e `0005_v2_rls_funcoes.sql` (papel familiar por `auth_user_id`, RPCs `solicitar_atendimento`, `cancelar_atendimento_familiar`, `vincular_familiar`, `horarios_ocupados`).

### 7.3 Critérios de aceite
- 80% dos agendamentos entram sem intervenção humana no horário comercial.
- Zero lembrete perdido em 30 dias (job monitorado; falha notifica Telegram).
- Cobrança PIX conciliada automaticamente em > 95% dos casos.

---

## 8. v3.0.0 — "Rede" (+8–12 semanas)

**Meta:** o negócio deixa de depender de uma pessoa. Várias acompanhantes, alocação inteligente, qualidade medida, gestão por dados.

### 8.1 Entregas
- **Multi-acompanhante**: cadastro, documentos (antecedentes, referências), regiões, disponibilidade semanal, remuneração por atendimento/hora, repasse.
- **Matching**: sugere acompanhante por região, disponibilidade, histórico com o mesmo acompanhado (continuidade importa muito para idosos) e avaliação.
- **App da acompanhante (PWA)**: agenda pessoal, check-in/check-out com localização (consentida, só no início/fim), câmera para foto consentida, relatório guiado, chat com gestão.
- **Avaliação da família** pós-atendimento (1–5 + comentário) → nota da acompanhante, alertas de queda de qualidade.
- **IA assistiva** (Claude API):
  - transforma áudio/rascunho da acompanhante em relatório no tom da marca;
  - resume histórico do acompanhado antes da visita ("da última vez ela pediu para passar na padaria");
  - sugere melhor horário/rota do dia; detecta conflitos de agenda.
- **Financeiro completo**: DRE simplificado, repasse por acompanhante, nota fiscal (integração com emissor), inadimplência.
- **Programa de indicação**: link/código por cliente e por parceiro (clínica, fisioterapeuta, farmácia) com atribuição de lead → converte o "canal mais forte" da conversa em dado.
- **Multi-cidade / franquia leve**: `organizacao_id` no schema desde v1 para não migrar depois.

### 8.2 Critérios de aceite
- Uma nova acompanhante entra em operação em < 1 dia, sem treinamento presencial no sistema.
- Ocupação e nota por acompanhante visíveis no painel.
- Relatório gerado por IA aceito sem edição em > 70% dos casos.

---

## 9. Riscos e decisões abertas

| Risco / decisão | Impacto | Mitigação |
|---|---|---|
| Número comum do WhatsApp (Evolution) ser bloqueado pela Meta | Perde o canal principal | Só mensagens de compromissos reais e respostas a quem escreveu; nada de disparo em massa; plano B: `WHATSAPP_PROVIDER=meta` (Cloud API oficial, já no código) |
| Raio, espera e cancelamento ainda não definidos | Bloqueiam templates e cálculo | Definir antes da semana 2; o sistema aceita mudar depois |
| Preço errado nos primeiros clientes | Margem | Métricas de validação no MVP; revisar após 10–20 atendimentos |
| LGPD com dados de idosos | Legal/reputação | Mínimo necessário, consentimento, RLS, sem prontuário, política de privacidade na landing |
| Promessa parecer "cuidado médico" | Legal | Seção "o que não fazemos" na landing; termos; sem campos de saúde |
| Uma pessoa só operando | Continuidade | v1 simples de aprender; v3 rede |
| Cliente idoso ligar em vez de WhatsApp | Canal | Painel permite gestora registrar tudo manualmente; telefone na landing |

---

## 10. Próximos passos concretos (atualizado em 2026-09-14, com v1 e v2 já construídas)

O código das duas versões está pronto. O que falta é **ligar as contas externas e decidir as regras de negócio** — tudo isso é trabalho da fundadora, não do código.

**A. Contas e infraestrutura**

1. **Supabase Cloud** — criar o projeto, aplicar `supabase/migrations` (0001→0005), copiar URL + anon key + service role para as variáveis. Em **Authentication → URL Configuration → Redirect URLs**, adicionar **os dois** callbacks, senão o login quebra:
   - `${NEXT_PUBLIC_SITE_URL}/entrar/callback` (portal do familiar)
   - `${NEXT_PUBLIC_SITE_URL}/login/callback` (painel da equipe)
   Depois criar a conta da gestora e promovê-la (`update public.perfil set papel = 'gestora' ...`).
2. **Bot de Telegram** — `@BotFather` → token; criar o grupo privado da gestão, pegar o `chat_id`, rodar `npx tsx scripts/telegram-set-webhook.ts`.
3. **Evolution API na VPS** — subir `docker-compose.evolution.yml`, abrir `https://evolution.inema.club/manager`, criar a instância `voucontigo`, **ler o QR com o celular do número do Vou Contigo** e cadastrar o webhook `https://voucontigo.inema.club/api/whatsapp?token=<WHATSAPP_WEBHOOK_TOKEN>` com `MESSAGES_UPSERT` + `MESSAGES_UPDATE`, `webhook_by_events=false`, `webhook_base64=false`.
4. **Asaas** — começar em **sandbox** (`ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3`), testar uma cobrança PIX de ponta a ponta com o webhook (header `asaas-access-token`), e **só então** trocar `ASAAS_API_KEY` e `ASAAS_BASE_URL` para produção (a config `asaas_ambiente` existe no catálogo e serve como registro do ambiente em uso).
5. **Resend** (opcional, mas recomendado) — verificar o domínio do `EMAIL_FROM`; sem `RESEND_API_KEY` o e-mail simplesmente não sai (modo Fake) e tudo vai só por WhatsApp.
6. **DNS** — apontar `voucontigo.inema.club` (app) e `evolution.inema.club` (Evolution) para a VPS e acrescentar o trecho de `deploy/Caddyfile.snippet`. Instalar `deploy/vps-cron.example` em `/etc/cron.d/` (na VPS o cron é do sistema; na Vercel o cron horário exigiria plano Pro).

**B. Regras de negócio que só a fundadora decide** (painel → Configurações; defaults em `supabase/seed.sql`)

| Config | Default de partida | Precisa decidir |
|---|---|---|
| `cidade_base`, `endereco_base`, `lat_base`, `lng_base` | Porto Alegre, coordenadas **vazias** | **Sem lat/lng o raio nunca é verificado.** Preencher. |
| `raio_km` | 20 | Raio real de atendimento |
| `tolerancia_espera_min` | 15 | Quanto de espera não conta como hora |
| `cancelamento_gratis_horas` / `cancelamento_taxa_percentual` | 24 h / 50% | Política de cancelamento (o bot já aplica sozinho) |
| `valor_hora_centavos`, `minimo_horas_avulso` | R$ 75/h, 2 h | Preço até a revisão dos 10–20 atendimentos |
| `chave_pix`, `whatsapp_empresa` | vazios | Preencher antes do primeiro cliente |
| `horario_inicio`/`horario_fim`/`dias_semana`/`slot_min` | 07:00–19:00, seg–sáb, 30 min | Define quais horários o bot oferece |
| `enviar_horarios_semanal` | ausente (desligado) | `1` liga o envio de horários livres às segundas |

**C. Operação e depois**

7. Fotos reais da acompanhante e 3 depoimentos para a landing.
8. Rodar 10–20 atendimentos reais e fazer a **reunião de revisão de preço** com as métricas do painel.
9. Fechar as lacunas ⚠️ da §7.2 conforme a operação pedir: OTP por WhatsApp no portal, `.ics` por URL assinada, "estamos a caminho" no check-in, PDF do relatório gerado no servidor.
10. Só então abrir a **v3.0.0 — Rede** (§8): múltiplas acompanhantes, app PWA com check-in, avaliações e IA assistiva.

---

## Anexos
- `docs/conversa-original.md` — conversa completa de concepção do negócio.
- `assets/logo.jpg` — logo aprovado (duas figuras abstratas, verde e bege).
