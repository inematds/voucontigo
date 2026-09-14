/**
 * Adaptador fino entre o painel e as regras de domínio de `lib/domain/*`
 * (escritas pelo agente A). Aqui ficam apenas:
 *   - atalhos com a assinatura que as telas do painel usam;
 *   - formatadores de entrada/saída (R$ ↔ centavos, horas).
 *
 * Nenhuma regra de negócio é duplicada: horas, valores, taxa de cancelamento,
 * extras e templates vêm de `lib/domain/horas.ts`, `config.ts` e `templates.ts`.
 */

import {
  calcularExtras as calcularExtrasDominio,
  calcularHorasAtendimento as calcularHorasDominio,
  calcularTaxaCancelamento as calcularTaxaDominio,
  calcularValorAvulso as calcularValorAvulsoDominio,
} from "@/lib/domain/horas";
import {
  CONFIG_PADRAO,
  parseConfiguracao,
  type ConfiguracaoNegocio,
} from "@/lib/domain/config";
import type { Atendimento } from "@/lib/domain/types";

export { CONFIG_PADRAO };
export { renderTemplate, montarRelatorio, TEMPLATE_RELATORIO_PADRAO } from "@/lib/domain/templates";

export type ConfigNumerica = ConfiguracaoNegocio;

export function configNumerica(cfg: Record<string, string>): ConfigNumerica {
  return parseConfiguracao(cfg);
}

export interface EntradaHoras {
  inicio_real: string;
  fim_real: string;
  minutos_espera: number;
}

/** Horas cobráveis (regra em lib/domain/horas.ts, espelha a função SQL). */
export function calcularHorasAtendimento(
  entrada: EntradaHoras,
  cfg: ConfigNumerica = CONFIG_PADRAO,
): number {
  return calcularHorasDominio({
    inicio_real: entrada.inicio_real,
    fim_real: entrada.fim_real,
    minutos_espera: entrada.minutos_espera,
    tolerancia_espera_min: cfg.tolerancia_espera_min,
  });
}

/** Valor de um atendimento avulso, em centavos. */
export function calcularValorAvulso(
  horas: number,
  cfg: ConfigNumerica = CONFIG_PADRAO,
): number {
  return calcularValorAvulsoDominio(
    horas,
    cfg.valor_hora_centavos,
    cfg.minimo_horas_avulso,
  );
}

/** Soma dos custos extras declarados, em centavos. */
export function calcularExtras(
  a: Pick<
    Atendimento,
    | "custo_estacionamento_centavos"
    | "custo_pedagio_centavos"
    | "custo_outros_centavos"
  >,
): number {
  return calcularExtrasDominio({ ...a, km_rodados: null }).total_centavos;
}

/** Taxa de cancelamento estimada agora, em centavos. */
export function calcularTaxaCancelamento(
  params: {
    data: string; // 'YYYY-MM-DD'
    hora_prevista_inicio: string; // 'HH:MM' ou 'HH:MM:SS'
    duracao_prevista_min: number;
    agora?: Date;
  },
  cfg: ConfigNumerica = CONFIG_PADRAO,
): number {
  const alvo = new Date(
    `${params.data}T${params.hora_prevista_inicio.slice(0, 5)}:00-03:00`,
  );
  const referencia = calcularValorAvulso(
    params.duracao_prevista_min / 60,
    cfg,
  );
  return calcularTaxaDominio(alvo, params.agora ?? new Date(), cfg, referencia)
    .taxa_centavos;
}

/* -------------------------------------------------------------------------- */
/* Formatadores de UI                                                          */
/* -------------------------------------------------------------------------- */

export function centavosParaReais(centavos: number | null | undefined): string {
  return ((centavos ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** '12,50' | '12.50' | 'R$ 12,50' → 1250 centavos. */
export function reaisParaCentavos(entrada: string | null | undefined): number {
  if (!entrada) return 0;
  const limpo = String(entrada)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function fmtHoras(horas: number | null | undefined): string {
  const h = horas ?? 0;
  return `${h.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h`;
}
