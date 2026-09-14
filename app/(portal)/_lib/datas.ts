/**
 * Datas do portal do familiar — funções PURAS (sem next/*, sem banco).
 * Brasil não tem horário de verão desde 2019: offset fixo -03:00.
 */

export const FUSO = "America/Sao_Paulo";
export const OFFSET_BR = "-03:00";

/** 'YYYY-MM-DD' de hoje no fuso de Porto Alegre (o servidor roda em UTC). */
export function hojeISO(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: FUSO });
}

/** 'HH:MM' ou 'HH:MM:SS' → 'HH:MM'. */
export function hhmm(hora: string | null | undefined): string {
  if (!hora) return "--:--";
  return String(hora).slice(0, 5);
}

/** data 'YYYY-MM-DD' + hora 'HH:MM' → instante real (America/Sao_Paulo). */
export function instanteDe(data: string, hora: string | null | undefined): Date {
  return new Date(`${data}T${hhmm(hora) === "--:--" ? "00:00" : hhmm(hora)}:00${OFFSET_BR}`);
}

/** 'YYYY-MM-DD' → Date ao meio-dia local (evita salto de fuso na formatação). */
export function dataISOParaDate(iso: string): Date {
  return new Date(`${iso}T12:00:00${OFFSET_BR}`);
}

export function somarDiasISO(iso: string, dias: number): string {
  const d = dataISOParaDate(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toLocaleDateString("en-CA", { timeZone: FUSO });
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Dia da semana (0=domingo) de uma data ISO, no fuso de Porto Alegre. */
export function diaSemanaISO(iso: string): number {
  return dataISOParaDate(iso).getUTCDay();
}

export function fmtData(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** "segunda, 14 de setembro" */
export function fmtDataLonga(iso: string): string {
  const d = dataISOParaDate(iso);
  return `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

/** 'AAAA-MM' → "setembro de 2026" */
export function fmtMes(mes: string): string {
  const [a, m] = mes.split("-");
  return `${MESES[Number(m) - 1] ?? m} de ${a}`;
}

export function fmtMoeda(centavos: number | null | undefined): string {
  return ((centavos ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** timestamptz → 'dd/MM/yyyy HH:mm' no fuso de Porto Alegre. */
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

/** Minutos desde 00:00 no fuso de Porto Alegre. */
export function minutosAgoraSP(agora: Date = new Date()): number {
  const hm = agora.toLocaleTimeString("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Valida 'AAAA-MM'. */
export function mesValido(mes: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

/** Primeiro e último dia (ISO) do mês 'AAAA-MM'. */
export function limitesDoMes(mes: string): { de: string; ate: string } {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, "0")}` };
}
