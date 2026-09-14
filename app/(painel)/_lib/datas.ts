import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export const FUSO = "America/Sao_Paulo";

/** 'YYYY-MM-DD' de hoje no fuso de Porto Alegre (Vercel roda em UTC). */
export function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: FUSO });
}

/** Converte 'YYYY-MM-DD' em Date local (meio-dia, evita salto de fuso). */
export function dataISOParaDate(iso: string): Date {
  return parseISO(`${iso}T12:00:00`);
}

export function somarDiasISO(iso: string, dias: number): string {
  const d = dataISOParaDate(iso);
  d.setDate(d.getDate() + dias);
  return format(d, "yyyy-MM-dd");
}

/** Segunda-feira da semana de `iso`. */
export function inicioSemanaISO(iso: string): string {
  const d = dataISOParaDate(iso);
  const dia = d.getDay(); // 0=dom
  const delta = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + delta);
  return format(d, "yyyy-MM-dd");
}

export function diasDaSemana(inicioISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => somarDiasISO(inicioISO, i));
}

export function fmtData(iso: string): string {
  return format(dataISOParaDate(iso), "dd/MM/yyyy", { locale: ptBR });
}

export function fmtDataCurta(iso: string): string {
  return format(dataISOParaDate(iso), "dd/MM", { locale: ptBR });
}

export function fmtDataLonga(iso: string): string {
  return format(dataISOParaDate(iso), "EEEE, d 'de' MMMM", { locale: ptBR });
}

export function fmtDiaSemana(iso: string): string {
  return format(dataISOParaDate(iso), "EEE", { locale: ptBR });
}

/** 'HH:MM:SS' (Postgres time) ou 'HH:MM' → 'HH:MM'. */
export function fmtHora(hora: string | null): string {
  if (!hora) return "--:--";
  return hora.slice(0, 5);
}

/** timestamptz ISO → 'HH:MM' no fuso de Porto Alegre. */
export function fmtHoraTZ(ts: string | null): string {
  if (!ts) return "--:--";
  return new Date(ts).toLocaleTimeString("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDataHoraTZ(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Soma minutos a 'HH:MM[:SS]' e devolve 'HH:MM'. */
export function somarMinutosHora(hora: string, minutos: number): string {
  const [h, m] = hora.slice(0, 5).split(":").map(Number);
  const total = h * 60 + m + minutos;
  const hh = Math.floor((total % 1440) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
