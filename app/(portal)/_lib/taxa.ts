/**
 * Taxa de cancelamento exibida ao familiar — função PURA (sem next/*, sem banco).
 * Usa calcularTaxaCancelamento / calcularValorAvulso de lib/domain/horas.
 */

import {
  calcularTaxaCancelamento,
  calcularValorAvulso,
  type ResultadoCancelamento,
} from "@/lib/domain/horas";
import type { ConfiguracaoNegocio } from "@/lib/domain/config";
import { instanteDe, fmtMoeda } from "./datas";

export interface AtendimentoParaTaxa {
  data: string; // 'YYYY-MM-DD'
  hora_prevista_inicio: string; // 'HH:MM'
  duracao_prevista_min: number;
  pacote_id: string | null;
}

/** Referência de cobrança do atendimento, em centavos. */
export function valorReferenciaCentavos(
  a: AtendimentoParaTaxa,
  config: Pick<ConfiguracaoNegocio, "valor_hora_centavos" | "minimo_horas_avulso">,
  valorHoraPacoteCentavos?: number | null,
): number {
  const horas = Math.max((a.duracao_prevista_min || 0) / 60, 0);
  if (a.pacote_id && valorHoraPacoteCentavos && valorHoraPacoteCentavos > 0) {
    return Math.ceil(horas * valorHoraPacoteCentavos);
  }
  return calcularValorAvulso(horas, config.valor_hora_centavos, config.minimo_horas_avulso);
}

export interface TaxaExibida extends ResultadoCancelamento {
  valor_referencia_centavos: number;
  /** Texto pronto para a tela de confirmação. */
  mensagem: string;
}

/** Calcula e descreve a taxa de cancelamento para exibir ANTES de confirmar. */
export function taxaDeCancelamento(
  a: AtendimentoParaTaxa,
  agora: Date,
  config: ConfiguracaoNegocio,
  valorHoraPacoteCentavos?: number | null,
): TaxaExibida {
  const referencia = valorReferenciaCentavos(a, config, valorHoraPacoteCentavos);
  const quando = instanteDe(a.data, a.hora_prevista_inicio);
  const r = calcularTaxaCancelamento(quando, agora, config, referencia);

  const mensagem = r.gratuito
    ? `Cancelamento sem custo (faltam mais de ${config.cancelamento_gratis_horas}h para o horário).`
    : `Faltam menos de ${config.cancelamento_gratis_horas}h: taxa de ${r.percentual}% — ` +
      `${fmtMoeda(r.taxa_centavos)} sobre ${fmtMoeda(referencia)}.`;

  return { ...r, valor_referencia_centavos: referencia, mensagem };
}
