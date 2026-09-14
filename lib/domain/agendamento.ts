/**
 * Agenda: cálculo de horários livres, formatação para WhatsApp e escolha por
 * número. Funções PURAS (sem banco, sem I/O) — a lista de ocupados vem da
 * função SQL public.horarios_ocupados (0005_v2_rls_funcoes.sql).
 *
 * Regras (PLANO §7.2 "Agendar → oferece slots livres da agenda"):
 *   * nunca oferece horário no passado;
 *   * respeita os dias da semana configurados (0 = domingo);
 *   * respeita a janela horario_inicio..horario_fim — o slot inteiro precisa
 *     caber dentro dela;
 *   * respeita o intervalo entre atendimentos: um slot [s, s+dur) é bloqueado
 *     se intersecta [ocupado_inicio − intervalo, ocupado_fim + intervalo).
 */

import type { ISODate, SlotDisponivel } from "./types";

/** Um atendimento já marcado, do ponto de vista da agenda. */
export interface HorarioOcupado {
  data: ISODate; // 'YYYY-MM-DD'
  hora: string; // 'HH:MM' ou 'HH:MM:SS'
  duracao_min: number;
}

export interface ConfigAgenda {
  horario_inicio: string; // 'HH:MM'
  horario_fim: string; // 'HH:MM'
  dias_semana: number[]; // 0 = domingo … 6 = sábado
  intervalo_min: number; // folga antes e depois de cada atendimento
  slot_min: number; // granularidade dos horários ofertados
}

export interface EntradaSlots {
  de: ISODate;
  ate: ISODate;
  duracao_min: number;
  ocupados: HorarioOcupado[];
  config: ConfigAgenda;
  /** "Agora" — slots anteriores a este instante não são oferecidos. */
  agora?: Date;
  /** Máximo de slots retornados (default 20). */
  limite?: number;
}

export const CONFIG_AGENDA_PADRAO: ConfigAgenda = {
  horario_inicio: "07:00",
  horario_fim: "19:00",
  dias_semana: [1, 2, 3, 4, 5, 6],
  intervalo_min: 60,
  slot_min: 30,
};

/** "1,2,3" → [1,2,3]. Ignora lixo e duplicata; vazio → [] . */
export function parseDiasSemana(valor: string | null | undefined): number[] {
  if (!valor) return [];
  const vistos = new Set<number>();
  const saida: number[] = [];
  for (const parte of String(valor).split(",")) {
    const n = Number(parte.trim());
    if (!Number.isInteger(n) || n < 0 || n > 6 || vistos.has(n)) continue;
    vistos.add(n);
    saida.push(n);
  }
  return saida.sort((a, b) => a - b);
}

/** 'HH:MM' | 'HH:MM:SS' → minutos desde a meia-noite. NaN vira null. */
export function horaParaMinutos(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(hora).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** minutos desde a meia-noite → 'HH:MM'. */
export function minutosParaHora(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 'YYYY-MM-DD' → Date local (meia-noite). Evita o parse UTC do ISO curto. */
export function dataParaLocal(data: ISODate, minutos = 0): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data).trim());
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, minutos, 0, 0);
}

/** Date → 'YYYY-MM-DD' no fuso local. */
export function localParaData(d: Date): ISODate {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

interface Bloqueio {
  data: ISODate;
  de: number; // minutos (já com o intervalo aplicado)
  ate: number;
}

function montarBloqueios(ocupados: HorarioOcupado[], intervalo: number): Bloqueio[] {
  const folga = Math.max(0, intervalo);
  const saida: Bloqueio[] = [];
  for (const o of ocupados) {
    const inicio = horaParaMinutos(o.hora);
    if (inicio === null) continue;
    const duracao = Math.max(0, Number(o.duracao_min) || 0);
    saida.push({ data: o.data, de: inicio - folga, ate: inicio + duracao + folga });
  }
  return saida;
}

/**
 * Horários livres no intervalo [de, ate], em ordem cronológica.
 */
export function calcularSlotsLivres(entrada: EntradaSlots): SlotDisponivel[] {
  const cfg = { ...CONFIG_AGENDA_PADRAO, ...entrada.config };
  const duracao = Math.max(1, Math.round(entrada.duracao_min));
  const limite = entrada.limite === undefined ? 20 : Math.max(0, entrada.limite);
  if (limite === 0) return [];

  const passo = Math.max(5, Math.round(cfg.slot_min) || 30);
  const abre = horaParaMinutos(cfg.horario_inicio) ?? 0;
  const fecha = horaParaMinutos(cfg.horario_fim) ?? 24 * 60;
  const dias = cfg.dias_semana.length ? cfg.dias_semana : CONFIG_AGENDA_PADRAO.dias_semana;
  const agora = entrada.agora ?? new Date();

  const inicioDia = dataParaLocal(entrada.de);
  const fimDia = dataParaLocal(entrada.ate);
  if (Number.isNaN(inicioDia.getTime()) || Number.isNaN(fimDia.getTime())) return [];

  const bloqueios = montarBloqueios(entrada.ocupados ?? [], cfg.intervalo_min);
  const slots: SlotDisponivel[] = [];

  for (
    const cursor = new Date(inicioDia);
    cursor.getTime() <= fimDia.getTime() && slots.length < limite;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    if (!dias.includes(cursor.getDay())) continue;
    const data = localParaData(cursor);
    const doDia = bloqueios.filter((b) => b.data === data);

    for (let m = abre; m + duracao <= fecha; m += passo) {
      if (slots.length >= limite) break;

      // nunca oferece passado
      const quando = dataParaLocal(data, m);
      if (quando.getTime() <= agora.getTime()) continue;

      const conflita = doDia.some((b) => m < b.ate && m + duracao > b.de);
      if (conflita) continue;

      slots.push({ data, hora: minutosParaHora(m) });
    }
  }

  return slots;
}

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "seg 16/09 às 09:00" */
export function formatarSlot(slot: SlotDisponivel): string {
  const d = dataParaLocal(slot.data);
  if (Number.isNaN(d.getTime())) return `${slot.data} às ${slot.hora}`;
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${DIAS_CURTOS[d.getDay()]} ${dia}/${mes} às ${slot.hora}`;
}

/** Lista numerada pronta para o template `template_horarios_livres`. */
export function formatarSlots(slots: SlotDisponivel[]): string {
  return slots.map((s, i) => `${i + 1}. ${formatarSlot(s)}`).join("\n");
}

/**
 * Resolve a resposta do familiar ("2", " 2 ", "opção 2") no slot escolhido.
 * Devolve null quando não for um número válido da lista.
 */
export function escolherSlot(
  slots: SlotDisponivel[],
  resposta: string | number | null | undefined,
): SlotDisponivel | null {
  if (resposta === null || resposta === undefined) return null;
  const texto = String(resposta).trim();
  const m = /(\d{1,3})/.exec(texto);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1 || n > slots.length) return null;
  return slots[n - 1];
}
