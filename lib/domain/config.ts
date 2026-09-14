/**
 * Parser tipado da tabela `configuracao` (chave/valor em texto).
 * Toda regra de negócio numérica vive no banco (PLANO §3) — aqui ela vira
 * número com default seguro, para que a UI e os cálculos nunca quebrem quando
 * uma chave estiver faltando ou com valor inválido.
 */

import type { Configuracao } from "./types";

export interface ConfiguracaoNegocio {
  /** Valor da hora avulsa, em centavos. */
  valor_hora_centavos: number;
  /** Mínimo de horas cobradas num atendimento avulso. */
  minimo_horas_avulso: number;
  /** Raio de atendimento em km a partir da cidade base. */
  raio_km: number;
  /** Cidade base da operação. */
  cidade_base: string;
  /** Minutos de espera que NÃO contam como hora cobrável. */
  tolerancia_espera_min: number;
  /** Antecedência (em horas) para cancelar sem taxa. */
  cancelamento_gratis_horas: number;
  /** Percentual cobrado quando cancela dentro do prazo curto. */
  cancelamento_taxa_percentual: number;
  /** Saldo do pacote (em horas) que dispara o alerta de saldo baixo. */
  saldo_baixo_horas: number;
  chave_pix: string;
  whatsapp_empresa: string;
  telegram_chat_gestao: string;
}

/** Defaults iguais aos de supabase/seed.sql. */
export const CONFIG_PADRAO: ConfiguracaoNegocio = {
  valor_hora_centavos: 7500,
  minimo_horas_avulso: 2,
  raio_km: 20,
  cidade_base: "Porto Alegre",
  tolerancia_espera_min: 15,
  cancelamento_gratis_horas: 24,
  cancelamento_taxa_percentual: 50,
  saldo_baixo_horas: 2,
  chave_pix: "",
  whatsapp_empresa: "",
  telegram_chat_gestao: "",
};

/** Converte texto em número; devolve o default se vazio/inválido. */
export function lerNumero(valor: string | undefined | null, padrao: number): number {
  if (valor === undefined || valor === null) return padrao;
  const limpo = String(valor).trim().replace(",", ".");
  if (limpo === "") return padrao;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : padrao;
}

/** Converte texto em string; devolve o default se vazio. */
export function lerTexto(valor: string | undefined | null, padrao: string): string {
  if (valor === undefined || valor === null) return padrao;
  const limpo = String(valor).trim();
  return limpo === "" ? padrao : limpo;
}

/** Aceita tanto a lista vinda do banco quanto um mapa chave→valor. */
export type FonteConfiguracao =
  | ReadonlyArray<Pick<Configuracao, "chave" | "valor">>
  | Readonly<Record<string, string>>;

/** Normaliza a fonte para um mapa chave→valor. */
export function paraMapa(fonte: FonteConfiguracao | null | undefined): Record<string, string> {
  if (!fonte) return {};
  if (Array.isArray(fonte)) {
    const mapa: Record<string, string> = {};
    for (const linha of fonte) mapa[linha.chave] = linha.valor;
    return mapa;
  }
  return { ...(fonte as Record<string, string>) };
}

/** Parser principal: linhas da tabela `configuracao` → objeto tipado. */
export function parseConfiguracao(fonte: FonteConfiguracao | null | undefined): ConfiguracaoNegocio {
  const m = paraMapa(fonte);
  return {
    valor_hora_centavos: Math.max(
      0,
      Math.round(lerNumero(m.valor_hora_centavos, CONFIG_PADRAO.valor_hora_centavos)),
    ),
    minimo_horas_avulso: Math.max(0, lerNumero(m.minimo_horas_avulso, CONFIG_PADRAO.minimo_horas_avulso)),
    raio_km: Math.max(0, lerNumero(m.raio_km, CONFIG_PADRAO.raio_km)),
    cidade_base: lerTexto(m.cidade_base, CONFIG_PADRAO.cidade_base),
    tolerancia_espera_min: Math.max(
      0,
      lerNumero(m.tolerancia_espera_min, CONFIG_PADRAO.tolerancia_espera_min),
    ),
    cancelamento_gratis_horas: Math.max(
      0,
      lerNumero(m.cancelamento_gratis_horas, CONFIG_PADRAO.cancelamento_gratis_horas),
    ),
    cancelamento_taxa_percentual: Math.min(
      100,
      Math.max(0, lerNumero(m.cancelamento_taxa_percentual, CONFIG_PADRAO.cancelamento_taxa_percentual)),
    ),
    saldo_baixo_horas: Math.max(0, lerNumero(m.saldo_baixo_horas, CONFIG_PADRAO.saldo_baixo_horas)),
    chave_pix: lerTexto(m.chave_pix, CONFIG_PADRAO.chave_pix),
    whatsapp_empresa: lerTexto(m.whatsapp_empresa, CONFIG_PADRAO.whatsapp_empresa),
    telegram_chat_gestao: lerTexto(m.telegram_chat_gestao, CONFIG_PADRAO.telegram_chat_gestao),
  };
}

/** Só os templates (`template_*`), com fallback vazio. */
export function parseTemplates(fonte: FonteConfiguracao | null | undefined): Record<string, string> {
  const m = paraMapa(fonte);
  const templates: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(m)) {
    if (chave.startsWith("template_")) templates[chave] = valor;
  }
  return templates;
}
