/**
 * Contrato de domínio do Vou Contigo (v1.0.0 — MVP).
 * Espelha o schema em supabase/migrations. Todos os módulos importam daqui.
 * Regra: NÃO existem campos de medicação, prontuário ou procedimentos de saúde.
 */

export type UUID = string;
export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // ISO 8601 com timezone

export type Papel = "gestora" | "acompanhante";

export type OrigemLead =
  | "landing"
  | "instagram"
  | "whatsapp"
  | "indicacao"
  | "clinica"
  | "outro";

export type StatusLead = "novo" | "contatado" | "convertido" | "perdido";

export type Mobilidade =
  | "anda_sozinho"
  | "bengala"
  | "andador"
  | "cadeira_rodas"
  | "precisa_apoio";

export type TipoAtendimento =
  | "consulta"
  | "exame"
  | "fisioterapia"
  | "mercado"
  | "farmacia"
  | "banco"
  | "passeio"
  | "outro";

export type StatusAtendimento =
  | "solicitado"
  | "agendado"
  | "confirmado"
  | "em_andamento"
  | "concluido"
  | "relatado"
  | "cancelado_cliente"
  | "cancelado_operacao"
  | "nao_compareceu";

export type TipoPlano = "avulso" | "pacote_mensal";
export type StatusPacote = "ativo" | "esgotado" | "expirado" | "cancelado";
export type MeioPagamento = "pix" | "dinheiro" | "cartao" | "transferencia";
export type StatusPagamento = "pendente" | "pago" | "cancelado";
export type CanalEvento = "painel" | "telegram" | "whatsapp" | "sistema";

export interface Perfil {
  id: UUID; // = auth.users.id
  nome: string;
  papel: Papel;
  telegram_chat_id: string | null;
  criado_em: ISODateTime;
}

export interface Cliente {
  id: UUID;
  nome: string;
  whatsapp: string; // E.164 sem '+', ex.: 5551999998888
  email: string | null;
  cpf: string | null;
  endereco_cobranca: string | null;
  origem: OrigemLead;
  consentimento_lgpd_em: ISODateTime | null;
  observacoes: string | null;
  criado_em: ISODateTime;
}

export interface Acompanhado {
  id: UUID;
  cliente_id: UUID;
  nome: string;
  apelido: string | null;
  data_nascimento: ISODate | null;
  endereco: string;
  telefone: string | null;
  contato_emergencia_nome: string | null;
  contato_emergencia_telefone: string | null;
  mobilidade: Mobilidade;
  preferencias: string | null; // texto livre: "gosta de conversar", "sem pressa"
  restricoes_declaradas: string | null; // texto livre, mínimo necessário
  foto_url: string | null; // só com consentimento
  criado_em: ISODateTime;
}

export interface Acompanhante {
  id: UUID;
  perfil_id: UUID | null;
  nome: string;
  whatsapp: string;
  telegram_chat_id: string | null;
  ativo: boolean;
  criado_em: ISODateTime;
}

export interface Plano {
  id: UUID;
  nome: string; // "Essencial", "Consulta", "Frequente 8h"...
  horas: number;
  valor_centavos: number;
  tipo: TipoPlano;
  descricao: string | null;
  ativo: boolean;
  ordem: number;
}

export interface Pacote {
  id: UUID;
  cliente_id: UUID;
  plano_id: UUID;
  horas_contratadas: number;
  horas_usadas: number;
  valido_de: ISODate;
  valido_ate: ISODate;
  status: StatusPacote;
  criado_em: ISODateTime;
}

/** Campos OBRIGATÓRIOS ao finalizar — base da validação de preço (§3 do PLANO). */
export interface ExecucaoAtendimento {
  inicio_real: ISODateTime;
  fim_real: ISODateTime;
  minutos_espera: number;
  km_rodados: number;
  custo_estacionamento_centavos: number;
  custo_pedagio_centavos: number;
  custo_outros_centavos: number;
  nivel_esforco: 1 | 2 | 3 | 4 | 5;
  observacoes_internas: string | null;
}

export interface Atendimento {
  id: UUID;
  cliente_id: UUID;
  acompanhado_id: UUID;
  acompanhante_id: UUID | null;
  pacote_id: UUID | null;
  tipo: TipoAtendimento;
  descricao: string | null;
  endereco_saida: string;
  endereco_destino: string;
  data: ISODate;
  hora_prevista_inicio: string; // 'HH:MM'
  duracao_prevista_min: number;
  status: StatusAtendimento;
  // execução (null até finalizar)
  inicio_real: ISODateTime | null;
  fim_real: ISODateTime | null;
  minutos_espera: number | null;
  km_rodados: number | null;
  custo_estacionamento_centavos: number | null;
  custo_pedagio_centavos: number | null;
  custo_outros_centavos: number | null;
  nivel_esforco: number | null;
  observacoes_internas: string | null;
  // relatório
  relatorio_texto: string | null;
  relatorio_enviado_em: ISODateTime | null;
  // financeiro
  horas_debitadas: number | null;
  valor_avulso_centavos: number | null;
  valor_extras_centavos: number | null;
  motivo_cancelamento: string | null;
  criado_em: ISODateTime;
  atualizado_em: ISODateTime;
}

export interface Pagamento {
  id: UUID;
  cliente_id: UUID;
  pacote_id: UUID | null;
  atendimento_id: UUID | null;
  valor_centavos: number;
  meio: MeioPagamento;
  status: StatusPagamento;
  vencimento: ISODate | null;
  pago_em: ISODateTime | null;
  referencia_externa: string | null;
  descricao: string | null;
  criado_em: ISODateTime;
}

export interface Lead {
  id: UUID;
  nome: string;
  whatsapp: string;
  mensagem: string | null;
  origem: OrigemLead;
  status: StatusLead;
  cliente_id: UUID | null;
  criado_em: ISODateTime;
}

/** Chaves conhecidas da tabela `configuracao` (chave/valor em texto). */
export type ChaveConfiguracao =
  | "valor_hora_centavos" // ex.: "7500"
  | "minimo_horas_avulso" // ex.: "2"
  | "raio_km" // ex.: "20"
  | "cidade_base" // ex.: "Porto Alegre"
  | "tolerancia_espera_min" // minutos de espera que NÃO contam como hora, ex.: "15"
  | "cancelamento_gratis_horas" // ex.: "24"
  | "cancelamento_taxa_percentual" // ex.: "50"
  | "chave_pix"
  | "whatsapp_empresa" // E.164 sem '+'
  | "telegram_chat_gestao" // chat id do grupo de gestão
  | "saldo_baixo_horas" // ex.: "2"
  | "template_confirmacao"
  | "template_lembrete_d1"
  | "template_lembrete_2h"
  | "template_relatorio"
  | "template_saldo_baixo"
  | "template_cobranca_pix"
  | "template_resposta_lead";

export interface Configuracao {
  chave: ChaveConfiguracao | string;
  valor: string;
  atualizado_em: ISODateTime;
}

export interface Evento {
  id: UUID;
  atendimento_id: UUID | null;
  cliente_id: UUID | null;
  tipo: string; // ex.: 'atendimento.criado', 'lead.novo', 'relatorio.enviado'
  payload: Record<string, unknown>;
  canal: CanalEvento;
  criado_em: ISODateTime;
}

/** Rótulos em PT-BR para UI e templates. */
export const TIPO_ATENDIMENTO_LABEL: Record<TipoAtendimento, string> = {
  consulta: "Consulta médica",
  exame: "Exame",
  fisioterapia: "Fisioterapia",
  mercado: "Mercado",
  farmacia: "Farmácia",
  banco: "Banco",
  passeio: "Passeio",
  outro: "Outro compromisso",
};

export const STATUS_ATENDIMENTO_LABEL: Record<StatusAtendimento, string> = {
  solicitado: "Solicitado",
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  relatado: "Relatório enviado",
  cancelado_cliente: "Cancelado pelo cliente",
  cancelado_operacao: "Cancelado pela operação",
  nao_compareceu: "Não compareceu",
};

export const MOBILIDADE_LABEL: Record<Mobilidade, string> = {
  anda_sozinho: "Anda sozinho(a)",
  bengala: "Usa bengala",
  andador: "Usa andador",
  cadeira_rodas: "Cadeira de rodas",
  precisa_apoio: "Precisa de apoio para andar",
};

// ===========================================================================
// v2.0.0 — WhatsApp API, cobrança Asaas, portal do familiar
// ===========================================================================

/** Estados da conversa do bot de WhatsApp (menu numérico). */
export type EstadoConversa =
  | "menu"
  | "agendar_acompanhado"
  | "agendar_tipo"
  | "agendar_data"
  | "agendar_hora"
  | "agendar_destino"
  | "agendar_confirmar"
  | "cancelar_escolher"
  | "cancelar_confirmar"
  | "humano"
  | "encerrada";

export interface ConversaWhatsApp {
  id: UUID;
  whatsapp: string; // E.164 sem '+'
  cliente_id: UUID | null;
  estado: EstadoConversa;
  dados: Record<string, unknown>; // rascunho do agendamento em curso etc.
  ultima_mensagem_em: ISODateTime | null;
  criado_em: ISODateTime;
  atualizado_em: ISODateTime;
}

export type DirecaoMensagem = "entrada" | "saida";
export type StatusMensagem = "recebida" | "enviada" | "entregue" | "lida" | "falhou";

export interface MensagemWhatsApp {
  id: UUID;
  conversa_id: UUID;
  direcao: DirecaoMensagem;
  wa_message_id: string | null; // id da Meta — chave de idempotência
  corpo: string;
  template: string | null; // nome do template Meta quando for mensagem iniciada pela empresa
  status: StatusMensagem;
  criado_em: ISODateTime;
}

/** Campos novos em `pagamento` (v2). */
export interface PagamentoAsaas {
  asaas_id: string | null;
  pix_qrcode_base64: string | null;
  pix_copia_cola: string | null;
  link_pagamento: string | null;
}

/** Campo novo em `cliente` (v2): vínculo com auth.users para o portal do familiar. */
export interface ClientePortal {
  auth_user_id: UUID | null;
}

/** Chaves de configuração acrescentadas na v2. */
export type ChaveConfiguracaoV2 =
  | "horario_inicio" // 'HH:MM' ex.: "07:00"
  | "horario_fim" // 'HH:MM' ex.: "19:00"
  | "dias_semana" // ex.: "1,2,3,4,5,6" (0 = domingo)
  | "intervalo_entre_atendimentos_min" // ex.: "60"
  | "slot_min" // granularidade dos horários ofertados, ex.: "30"
  | "endereco_base" // endereço usado como centro do raio
  | "lat_base"
  | "lng_base"
  | "whatsapp_template_confirmacao" // nomes aprovados na Meta
  | "whatsapp_template_lembrete_d1"
  | "whatsapp_template_lembrete_2h"
  | "whatsapp_template_relatorio"
  | "whatsapp_template_cobranca"
  | "whatsapp_template_saldo_baixo"
  | "asaas_ambiente" // 'sandbox' | 'producao'
  | "renovacao_aviso_dias"; // ex.: "3"

export interface SlotDisponivel {
  data: ISODate;
  hora: string; // 'HH:MM'
}
