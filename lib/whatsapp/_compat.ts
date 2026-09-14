/**
 * Ponte entre `lib/whatsapp/**` e `lib/domain/agendamento.ts`.
 *
 * REGRA: nada em `lib/whatsapp/**` importa `@/lib/domain/agendamento` direto —
 * tudo passa por aqui, para que mudanças de assinatura no domínio custem um
 * único arquivo. O cálculo de slots é DELEGADO ao domínio; aqui ficam só o
 * adaptador de shape (a RPC `horarios_ocupados` é tolerante) e o que é próprio
 * do bot: duração padrão por tipo, datas no fuso da operação e "amanhã"/"dd/mm".
 *
 * Funções puras, sem I/O. Fuso fixo America/Sao_Paulo (Vercel roda em UTC).
 */

import type { ISODate, SlotDisponivel, TipoAtendimento } from "@/lib/domain/types";
import { paraMapa, lerNumero, lerTexto, type FonteConfiguracao } from "@/lib/domain/config";
import {
  calcularSlotsLivres as calcularSlotsLivresDominio,
  formatarSlot as formatarSlotDominio,
  formatarSlots as formatarSlotsDominio,
  escolherSlot as escolherSlotDominio,
  parseDiasSemana,
  CONFIG_AGENDA_PADRAO as CONFIG_AGENDA_PADRAO_DOMINIO,
  type ConfigAgenda,
  type HorarioOcupado,
} from "@/lib/domain/agendamento";

export type { ConfigAgenda, HorarioOcupado };
export const CONFIG_AGENDA_PADRAO = CONFIG_AGENDA_PADRAO_DOMINIO;
export { formatarSlotDominio as formatarSlot };

export const FUSO = "America/Sao_Paulo";

/** Duração padrão em minutos por tipo de atendimento (PLANO §7.2). */
export function duracaoPadrao(tipo: TipoAtendimento | string): number {
  return tipo === "consulta" || tipo === "exame" ? 240 : 120;
}

// ---------------------------------------------------------------------------
// Datas no fuso de operação
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DD' no fuso da operação. */
export function dataLocal(momento: Date | string = new Date()): ISODate {
  const d = momento instanceof Date ? momento : new Date(momento);
  return d.toLocaleDateString("sv-SE", { timeZone: FUSO });
}

/** 'HH:MM' no fuso da operação. */
export function horaLocal(momento: Date | string = new Date()): string {
  const d = momento instanceof Date ? momento : new Date(momento);
  return d.toLocaleTimeString("sv-SE", { timeZone: FUSO, hour12: false }).slice(0, 5);
}

/** Dia da semana (0 = domingo) no fuso da operação, a partir de 'YYYY-MM-DD'. */
export function diaDaSemana(data: ISODate): number {
  return new Date(`${data}T12:00:00Z`).getUTCDay();
}

/** Soma dias a uma data 'YYYY-MM-DD' sem passar por fuso. */
export function somarDias(data: ISODate, dias: number): ISODate {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** 'dd/mm' → 'YYYY-MM-DD' (ano atual ou o próximo, se a data já passou). */
export function interpretarData(texto: string, hoje: ISODate): ISODate | null {
  const limpo = (texto ?? "").trim().toLowerCase();
  if (limpo === "" ) return null;
  if (limpo === "hoje") return hoje;
  if (limpo === "amanha" || limpo === "amanhã") return somarDias(hoje, 1);
  if (limpo === "depois de amanha" || limpo === "depois de amanhã") return somarDias(hoje, 2);

  const iso = limpo.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return limpo;

  const m = limpo.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  let ano = m[3] ? Number(m[3]) : Number(hoje.slice(0, 4));
  if (ano < 100) ano += 2000;
  const candidata = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  if (!m[3] && candidata < hoje) {
    return `${ano + 1}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }
  return candidata;
}

// ---------------------------------------------------------------------------
// Configuração de agenda (chaves v2 da tabela `configuracao`)
// ---------------------------------------------------------------------------

export function parseConfigAgenda(fonte: FonteConfiguracao | null | undefined): ConfigAgenda {
  const m = paraMapa(fonte);
  const dias = parseDiasSemana(lerTexto(m.dias_semana, CONFIG_AGENDA_PADRAO.dias_semana.join(",")));
  return {
    horario_inicio: lerTexto(m.horario_inicio, CONFIG_AGENDA_PADRAO.horario_inicio).slice(0, 5),
    horario_fim: lerTexto(m.horario_fim, CONFIG_AGENDA_PADRAO.horario_fim).slice(0, 5),
    dias_semana: dias.length ? dias : CONFIG_AGENDA_PADRAO.dias_semana,
    slot_min: Math.max(5, Math.round(lerNumero(m.slot_min, CONFIG_AGENDA_PADRAO.slot_min))),
    intervalo_min: Math.max(
      0,
      Math.round(
        lerNumero(m.intervalo_entre_atendimentos_min, CONFIG_AGENDA_PADRAO.intervalo_min),
      ),
    ),
  };
}

// ---------------------------------------------------------------------------
// Slots livres
// ---------------------------------------------------------------------------

/** Janela ocupada, no formato tolerante ao que a RPC `horarios_ocupados` devolver. */
export interface Ocupado {
  data: ISODate;
  /** `horarios_ocupados` (0005) devolve `hora_inicio` + `duracao_min`. Os demais
   *  nomes são tolerância a outras fontes (agenda do painel, .ics). */
  hora_inicio?: string | null;
  hora_fim?: string | null;
  hora?: string | null;
  hora_prevista_inicio?: string | null;
  inicio?: string | null;
  fim?: string | null;
  duracao_min?: number | null;
}

export function minutosDe(hhmm: string): number {
  const [h, m] = (hhmm ?? "00:00").slice(0, 5).split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function paraHHMM(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function janela(o: Ocupado): { inicio: number; fim: number } {
  const ini = minutosDe(
    String(o.hora_inicio ?? o.inicio ?? o.hora ?? o.hora_prevista_inicio ?? "00:00"),
  );
  const fimBruto = o.hora_fim ?? o.fim;
  const fim = fimBruto ? minutosDe(String(fimBruto)) : ini + Math.max(0, o.duracao_min ?? 0);
  return { inicio: ini, fim: Math.max(fim, ini) };
}

export interface EntradaSlots {
  de: ISODate;
  dias: number;
  duracao_min: number;
  config: ConfigAgenda;
  ocupados: Ocupado[];
  /** Momento atual — slots no passado são descartados. */
  agora: Date | string;
  /** Máximo de slots devolvidos (default 8). */
  limite?: number;
  /** Antecedência mínima em minutos para ofertar um horário (default 0 — o
   *  domínio já descarta o passado). */
  antecedencia_min?: number;
}

/**
 * Horários livres na agenda, respeitando expediente, dias da semana,
 * intervalo entre atendimentos e o que já está ocupado.
 */
export function calcularSlotsLivres(entrada: EntradaSlots): SlotDisponivel[] {
  const agora = entrada.agora instanceof Date ? entrada.agora : new Date(entrada.agora);
  const antecedencia = entrada.antecedencia_min ?? 0;
  const piso = new Date(agora.getTime() + antecedencia * 60000);

  const ocupados: HorarioOcupado[] = (entrada.ocupados ?? [])
    .filter((o) => Boolean(o?.data))
    .map((o) => {
      const { inicio, fim } = janela(o);
      return { data: o.data, hora: paraHHMM(inicio), duracao_min: Math.max(0, fim - inicio) };
    });

  return calcularSlotsLivresDominio({
    de: entrada.de,
    ate: somarDias(entrada.de, Math.max(1, entrada.dias) - 1),
    duracao_min: Math.max(30, Math.round(entrada.duracao_min || 120)),
    ocupados,
    config: entrada.config,
    agora: piso,
    limite: entrada.limite ?? 8,
  });
}

/** "1. seg 15/09 às 09:00" — lista numerada para o WhatsApp. */
export function formatarSlots(slots: SlotDisponivel[]): string {
  return formatarSlotsDominio(slots);
}

/** Resolve a resposta do usuário ("3") no slot correspondente. */
export function escolherSlot(slots: SlotDisponivel[], resposta: string): SlotDisponivel | null {
  return escolherSlotDominio(slots, resposta);
}
