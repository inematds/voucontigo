/**
 * Superfície pública de `lib/automacao` — o que painel, crons, bot de WhatsApp
 * (agente B) e bot de Telegram (agente F) podem importar.
 */

export {
  enviarRelatorioAutomatico,
  TEXTO_RELATORIO_PADRAO,
  type DepsAutomacao,
  type ResultadoRelatorio,
} from "./relatorio";

export {
  enviarLembretesD1,
  enviarLembretes2h,
  enviarConfirmacaoAgendamento,
  enviarHorariosLivresSemanal,
  STATUS_LEMBRETE,
  TEMPLATE_D1_PADRAO,
  TEMPLATE_2H_PADRAO,
  TEMPLATE_CONFIRMACAO_PADRAO,
  type DepsLembretes,
  type ItemLembrete,
  type ResultadoLembretes,
  type ResultadoHorariosSemanal,
} from "./lembretes";

export { verificarRaio, descreverRaio, type ResultadoRaio, type DepsRaio } from "./raio";

export {
  enviarAoCliente,
  avisarGestao,
  textoParaHtml,
  type DepsEnvio,
  type ResultadoEnvioCliente,
} from "./envio";

export {
  criarRepoSupabase,
  criarRepoMemoria,
  type RepoAutomacao,
  type AtendimentoCompleto,
  type ClienteMin,
  type PacoteComSaldo,
} from "./repo";

export {
  criarGeocoder,
  distanciaKm,
  dentroDoRaio,
  FakeGeocoder,
  montarMensagemHorariosLivres,
  type Coordenada,
  type Geocoder,
  type SlotLivre,
} from "./_compat";
