/**
 * Cálculo de horas, valores e taxas — funções PURAS (sem banco, sem I/O).
 * Espelham as funções SQL de supabase/migrations/0003_funcoes.sql.
 *
 * Regra central (PLANO §3 "Política de espera"):
 *   horas cobráveis = (duração real + espera que excede a tolerância),
 *   arredondadas para CIMA em blocos de 30 minutos.
 */

import type { Atendimento, ISODateTime } from "./types";
import type { ConfiguracaoNegocio } from "./config";

/** Tamanho do bloco de cobrança, em minutos. */
export const BLOCO_MINUTOS = 30;

export interface EntradaHoras {
  inicio_real: ISODateTime | Date | null;
  fim_real: ISODateTime | Date | null;
  minutos_espera: number | null;
  tolerancia_espera_min: number;
}

function paraDate(v: ISODateTime | Date | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Horas cobráveis de um atendimento executado.
 * Devolve 0 quando faltar início ou fim (nada a cobrar ainda).
 */
export function calcularHorasAtendimento(entrada: EntradaHoras): number {
  const inicio = paraDate(entrada.inicio_real);
  const fim = paraDate(entrada.fim_real);
  if (!inicio || !fim) return 0;

  const minutosServico = Math.max((fim.getTime() - inicio.getTime()) / 60000, 0);
  const tolerancia = Math.max(entrada.tolerancia_espera_min ?? 0, 0);
  const esperaExcedente = Math.max((entrada.minutos_espera ?? 0) - tolerancia, 0);

  const total = minutosServico + esperaExcedente;
  if (total <= 0) return 0;

  // ceil com correção de ponto flutuante (evita 120.00000000001 virar 2.5h)
  const blocos = Math.ceil(Number((total / BLOCO_MINUTOS).toFixed(6)));
  return Number((blocos * (BLOCO_MINUTOS / 60)).toFixed(2));
}

/** Minutos cobráveis brutos (útil para exibir no painel). */
export function calcularMinutosCobraveis(entrada: EntradaHoras): number {
  return Math.round(calcularHorasAtendimento(entrada) * 60);
}

/**
 * Valor de um atendimento avulso, em centavos.
 * Respeita o mínimo de horas configurado (PLANO §3: "R$ 60–90/h, mínimo 2h").
 */
export function calcularValorAvulso(
  horas: number,
  valor_hora_centavos: number,
  minimo_horas: number,
): number {
  const horasCobradas = Math.max(horas ?? 0, minimo_horas ?? 0, 0);
  return Math.ceil(horasCobradas * Math.max(valor_hora_centavos ?? 0, 0));
}

export interface ResultadoCancelamento {
  /** true quando o cancelamento é gratuito. */
  gratuito: boolean;
  /** Percentual aplicado (0 quando gratuito). */
  percentual: number;
  /** Horas de antecedência do cancelamento (negativo se já passou). */
  horas_antecedencia: number;
  /** Taxa em centavos, quando informado um valor de referência. */
  taxa_centavos: number;
}

export type ConfigCancelamento = Pick<
  ConfiguracaoNegocio,
  "cancelamento_gratis_horas" | "cancelamento_taxa_percentual"
>;

/**
 * Política de cancelamento (PLANO §3): grátis até N horas antes;
 * abaixo disso, cobra um percentual do valor de referência.
 */
export function calcularTaxaCancelamento(
  dataHoraAtendimento: ISODateTime | Date,
  agora: ISODateTime | Date,
  config: ConfigCancelamento,
  valor_referencia_centavos = 0,
): ResultadoCancelamento {
  const alvo = paraDate(dataHoraAtendimento);
  const momento = paraDate(agora);
  if (!alvo || !momento) {
    return { gratuito: true, percentual: 0, horas_antecedencia: 0, taxa_centavos: 0 };
  }

  const horasAntecedencia = (alvo.getTime() - momento.getTime()) / 3600000;
  const limite = Math.max(config.cancelamento_gratis_horas ?? 0, 0);
  const gratuito = horasAntecedencia >= limite;
  const percentual = gratuito ? 0 : Math.min(Math.max(config.cancelamento_taxa_percentual ?? 0, 0), 100);

  return {
    gratuito,
    percentual,
    horas_antecedencia: Number(horasAntecedencia.toFixed(2)),
    taxa_centavos: Math.round((Math.max(valor_referencia_centavos, 0) * percentual) / 100),
  };
}

export interface Extras {
  estacionamento_centavos: number;
  pedagio_centavos: number;
  outros_centavos: number;
  total_centavos: number;
  km_rodados: number;
  /** true quando não houve nenhum custo extra. */
  vazio: boolean;
}

/** Soma os custos extras de um atendimento (deslocamento especial, PLANO §3). */
export function calcularExtras(
  atendimento: Pick<
    Atendimento,
    | "custo_estacionamento_centavos"
    | "custo_pedagio_centavos"
    | "custo_outros_centavos"
    | "km_rodados"
  >,
): Extras {
  const estacionamento = Math.max(atendimento.custo_estacionamento_centavos ?? 0, 0);
  const pedagio = Math.max(atendimento.custo_pedagio_centavos ?? 0, 0);
  const outros = Math.max(atendimento.custo_outros_centavos ?? 0, 0);
  const total = estacionamento + pedagio + outros;
  return {
    estacionamento_centavos: estacionamento,
    pedagio_centavos: pedagio,
    outros_centavos: outros,
    total_centavos: total,
    km_rodados: Math.max(atendimento.km_rodados ?? 0, 0),
    vazio: total === 0,
  };
}

/** Saldo restante de um pacote, em horas (nunca negativo). */
export function horasRestantes(horas_contratadas: number, horas_usadas: number): number {
  return Number(Math.max((horas_contratadas ?? 0) - (horas_usadas ?? 0), 0).toFixed(2));
}
