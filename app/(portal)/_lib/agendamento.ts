/**
 * Slots livres — stub LOCAL do portal enquanto lib/domain/agendamento.ts (agente A)
 * não existe. Funções PURAS: sem next/*, sem banco.
 * Espelha a assinatura combinada: calcularSlotsLivres / formatarSlots.
 */

import type { SlotDisponivel } from "@/lib/domain/types";
import { somarDiasISO, diaSemanaISO, fmtDataLonga } from "./datas";

export interface JanelaAgenda {
  horario_inicio: string; // 'HH:MM'
  horario_fim: string; // 'HH:MM'
  dias_semana: number[]; // 0=domingo
  intervalo_entre_atendimentos_min: number;
  slot_min: number; // granularidade
}

export const JANELA_PADRAO: JanelaAgenda = {
  horario_inicio: "07:00",
  horario_fim: "19:00",
  dias_semana: [1, 2, 3, 4, 5, 6],
  intervalo_entre_atendimentos_min: 60,
  slot_min: 30,
};

/** Intervalo ocupado da agenda (vem do RPC horarios_ocupados, normalizado). */
export interface Ocupado {
  data: string; // 'YYYY-MM-DD'
  inicio_min: number; // minutos desde 00:00
  fim_min: number;
}

export function minutosDe(hora: string): number {
  const [h, m] = hora.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function horaDe(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface EntradaSlots {
  de: string; // 'YYYY-MM-DD' (inclusive)
  dias: number; // quantos dias olhar a partir de `de`
  duracao_min: number;
  janela: JanelaAgenda;
  ocupados: readonly Ocupado[];
  /** Antecedência mínima, em minutos, a partir de `agoraMin` no dia `de`. */
  agora_min?: number;
  limite?: number;
}

/**
 * Slots livres: varre os dias úteis configurados, em passos de `slot_min`,
 * e descarta os que colidem com um ocupado (mais o intervalo entre atendimentos).
 */
export function calcularSlotsLivres(e: EntradaSlots): SlotDisponivel[] {
  const { janela } = e;
  const passo = Math.max(janela.slot_min || 30, 5);
  const folga = Math.max(janela.intervalo_entre_atendimentos_min || 0, 0);
  const abre = minutosDe(janela.horario_inicio);
  const fecha = minutosDe(janela.horario_fim);
  const duracao = Math.max(e.duracao_min || 60, passo);
  const limite = e.limite ?? 40;

  const slots: SlotDisponivel[] = [];
  for (let i = 0; i < Math.max(e.dias, 0) && slots.length < limite; i += 1) {
    const data = somarDiasISO(e.de, i);
    if (!janela.dias_semana.includes(diaSemanaISO(data))) continue;

    const doDia = e.ocupados.filter((o) => o.data === data);
    const minimo = i === 0 ? (e.agora_min ?? 0) : 0;

    for (let t = abre; t + duracao <= fecha; t += passo) {
      if (t < minimo) continue;
      const colide = doDia.some(
        (o) => t < o.fim_min + folga && t + duracao + folga > o.inicio_min,
      );
      if (colide) continue;
      slots.push({ data, hora: horaDe(t) });
      if (slots.length >= limite) break;
    }
  }
  return slots;
}

/** Texto agrupado por dia — usado no e-mail/WhatsApp de horários livres. */
export function formatarSlots(slots: readonly SlotDisponivel[], duracaoMin?: number): string {
  if (slots.length === 0) return "Não encontramos horários livres nos próximos dias.";
  const porDia = new Map<string, string[]>();
  for (const s of slots) {
    const lista = porDia.get(s.data) ?? [];
    lista.push(s.hora);
    porDia.set(s.data, lista);
  }
  const corpo = [...porDia.entries()]
    .map(([data, horas]) => `• ${fmtDataLonga(data)}: ${horas.join(", ")}`)
    .join("\n");
  const cabecalho = duracaoMin
    ? `Horários livres para ${duracaoMin / 60}h de acompanhamento:`
    : "Horários livres:";
  return `${cabecalho}\n\n${corpo}`;
}
