/**
 * Helpers locais do módulo Telegram.
 *
 * TEMPORÁRIO: `lib/domain/horas.ts` e `lib/domain/templates.ts` estão sendo
 * escritos em paralelo por outro agente. Enquanto não existirem, o bot usa
 * estas implementações mínimas. Quando os módulos de domínio entrarem, basta
 * trocar os imports em `comandos.ts` — as assinaturas aqui foram feitas iguais
 * (`renderTemplate(template, vars)`, `montarRelatorio(...)`).
 *
 * Regras implementadas (§3 e §6.2 do PLANO.md):
 * - Horas debitadas: minutos faturáveis = (fim - inicio) - min(espera, tolerancia).
 *   Arredonda para CIMA em blocos de 30 min. Espera além da tolerância conta.
 * - Fuso: tudo em America/Sao_Paulo (sem horário de verão desde 2019 → -03:00).
 */

import { calcularHorasAtendimento } from "@/lib/domain/horas";
import { renderTemplate as renderTemplateDominio } from "@/lib/domain/templates";

export const TZ = "America/Sao_Paulo";
export const OFFSET_BR = "-03:00";

/** Tolerância padrão de espera (min) quando `configuracao` não define. */
export const TOLERANCIA_ESPERA_PADRAO_MIN = 15;

// ---------------------------------------------------------------------------
// Datas (wall-clock de São Paulo, mesmo rodando em UTC na Vercel)
// ---------------------------------------------------------------------------

const FMT_DATA = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const FMT_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  hourCycle: "h23",
});

/** 'YYYY-MM-DD' do instante no fuso de São Paulo. */
export function dataSP(quando: Date = new Date()): string {
  return FMT_DATA.format(quando);
}

/** 'HH:MM' do instante no fuso de São Paulo. */
export function horaSP(quando: Date = new Date()): string {
  return FMT_HORA.format(quando);
}

/** Soma `dias` a uma data 'YYYY-MM-DD' (aritmética de calendário, sem fuso). */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/** Instante real a partir de 'YYYY-MM-DD' + 'HH:MM' interpretados em BRT. */
export function instante(data: string, hora: string): Date {
  const hhmm = hora.length >= 5 ? hora.slice(0, 5) : `${hora}:00`;
  return new Date(`${data}T${hhmm}:00${OFFSET_BR}`);
}

/** 'YYYY-MM-DD' → 'dd/mm'. */
export function ddmm(data: string): string {
  const [, m, d] = data.split("-");
  return `${d}/${m}`;
}

/** 'YYYY-MM-DD' → 'dd/mm/aaaa'. */
export function ddmmaaaa(data: string): string {
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}

/** Nome do dia da semana em PT-BR para 'YYYY-MM-DD'. */
export function diaSemana(data: string): string {
  const nomes = [
    "domingo",
    "segunda",
    "terça",
    "quarta",
    "quinta",
    "sexta",
    "sábado",
  ];
  const [a, m, d] = data.split("-").map(Number);
  return nomes[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

// ---------------------------------------------------------------------------
// Dinheiro / horas
// ---------------------------------------------------------------------------

export function reais(centavos: number | null | undefined): string {
  const v = (centavos ?? 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** 'R$ 12,50' | '12,50' | '12.5' | '' → centavos. */
export function parseCentavos(entrada: string): number | null {
  const limpo = entrada
    .replace(/r\$/i, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (limpo === "") return 0;
  const n = Number(limpo);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export interface CalculoHoras {
  minutos_brutos: number;
  minutos_espera_cobrados: number;
  minutos_faturaveis: number;
  horas_debitadas: number;
}

/**
 * Horas debitadas do pacote. Blocos de 30 min arredondados para cima.
 * A espera só é descontada até a tolerância; o que passa disso é cobrado
 * (já está dentro do intervalo início→fim, então não soma de novo — apenas
 * não é abatido).
 */
export function calcularHoras(
  inicio: Date,
  fim: Date,
  minutosEspera: number,
  toleranciaMin: number = TOLERANCIA_ESPERA_PADRAO_MIN,
): CalculoHoras {
  // Regra única do negócio vive em lib/domain/horas.ts (espera excedente à tolerância é cobrada).
  const brutos = Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 60000));
  const espera = Math.max(0, minutosEspera);
  const cobrada = Math.max(0, espera - Math.max(0, toleranciaMin));
  const horas = calcularHorasAtendimento({
    inicio_real: inicio.toISOString(),
    fim_real: fim.toISOString(),
    minutos_espera: espera,
    tolerancia_espera_min: toleranciaMin,
  });
  return {
    minutos_brutos: brutos,
    minutos_espera_cobrados: cobrada,
    minutos_faturaveis: brutos + cobrada,
    horas_debitadas: Math.max(0.5, horas),
  };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** Troca `{chave}` pelo valor. Chave sem valor vira string vazia. */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  const limpo: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(vars)) limpo[k] = v === null || v === undefined ? "" : v;
  return renderTemplateDominio(template, limpo);
}

export interface DadosRelatorio {
  acompanhado: string;
  data: string; // 'YYYY-MM-DD'
  tipo: string;
  destino: string;
  inicio_real: Date | null;
  fim_real: Date | null;
  texto: string | null;
  extras_centavos: number;
  horas_restantes: number | null;
}

/** Relatório pós-atendimento conforme §6.2 do PLANO (texto para WhatsApp). */
export function montarRelatorio(d: DadosRelatorio): string {
  const linhas = [
    `*Relatório — ${d.acompanhado} · ${ddmm(d.data)}*`,
    `✅ ${d.tipo} em ${d.destino}`,
    `⏰ Saímos ${d.inicio_real ? horaSP(d.inicio_real) : "--:--"} e voltamos ${
      d.fim_real ? horaSP(d.fim_real) : "--:--"
    }`,
    `🗒️ ${d.texto?.trim() || "Tudo tranquilo, sem intercorrências."}`,
    `💰 Extras: ${d.extras_centavos > 0 ? reais(d.extras_centavos) : "nenhum"}`,
  ];
  if (d.horas_restantes !== null) {
    linhas.push(`⏳ Saldo do pacote: ${d.horas_restantes}h`);
  }
  linhas.push("Qualquer dúvida, estou por aqui. 💚");
  return linhas.join("\n");
}

// ---------------------------------------------------------------------------
// HTML seguro (parse_mode: HTML do Telegram)
// ---------------------------------------------------------------------------

export function escapeHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Id curto exibido nos comandos: primeiros 8 chars do uuid. */
export function idCurto(id: string): string {
  return id.slice(0, 8);
}
