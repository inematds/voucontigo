/**
 * Geração de VCALENDAR (RFC 5545) para os atendimentos futuros do cliente.
 * Função PURA — sem next/*, sem banco. Testada em ics.test.ts.
 */

import { FUSO } from "./datas";

export interface EventoICS {
  id: string;
  data: string; // 'YYYY-MM-DD'
  hora: string; // 'HH:MM' ou 'HH:MM:SS'
  duracao_min: number;
  tipo_label: string;
  acompanhado: string;
  destino: string | null;
  descricao?: string | null;
}

/** Escapa texto conforme RFC 5545 §3.3.11. */
export function escaparTextoICS(valor: string): string {
  return valor
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Dobra linhas com mais de 75 octetos (continuação com espaço). */
export function dobrarLinha(linha: string): string {
  const bytes = Buffer.from(linha, "utf8");
  if (bytes.length <= 75) return linha;
  const partes: string[] = [];
  let inicio = 0;
  let limite = 75;
  while (inicio < bytes.length) {
    let fim = Math.min(inicio + limite, bytes.length);
    // não cortar no meio de um caractere multibyte
    while (fim > inicio && fim < bytes.length && (bytes[fim] & 0xc0) === 0x80) fim -= 1;
    partes.push(bytes.subarray(inicio, fim).toString("utf8"));
    inicio = fim;
    limite = 74; // linhas de continuação começam com um espaço
  }
  return partes[0] + partes.slice(1).map((p) => `\r\n ${p}`).join("");
}

/** 'YYYY-MM-DD' + 'HH:MM' + minutos → 'YYYYMMDDTHHMMSS' (hora local de SP). */
export function carimboLocal(data: string, hora: string, somarMin = 0): string {
  const [a, m, d] = data.split("-").map(Number);
  const [hh, mm] = hora.slice(0, 5).split(":").map(Number);
  const base = Date.UTC(a, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0) + somarMin * 60000;
  const t = new Date(base);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}` +
    `T${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}`
  );
}

/** Date → 'YYYYMMDDTHHMMSSZ' (UTC), usado no DTSTAMP. */
export function carimboUTC(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export interface OpcoesICS {
  agora?: Date;
  dominio?: string;
  nomeCalendario?: string;
}

export function gerarICS(eventos: readonly EventoICS[], opcoes: OpcoesICS = {}): string {
  const agora = opcoes.agora ?? new Date();
  const dominio = opcoes.dominio ?? "voucontigo.app";
  const dtstamp = carimboUTC(agora);

  const linhas: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vou Contigo//Portal do familiar//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escaparTextoICS(opcoes.nomeCalendario ?? "Vou Contigo")}`,
    `X-WR-TIMEZONE:${FUSO}`,
    "BEGIN:VTIMEZONE",
    `TZID:${FUSO}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0300",
    "TZOFFSETTO:-0300",
    "TZNAME:-03",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const e of eventos) {
    const hora = e.hora ? e.hora.slice(0, 5) : "00:00";
    const dur = Number.isFinite(e.duracao_min) && e.duracao_min > 0 ? e.duracao_min : 60;
    const resumo = `Vou Contigo — ${e.tipo_label} — ${e.acompanhado}`;
    linhas.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@${dominio}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${FUSO}:${carimboLocal(e.data, hora)}`,
      `DTEND;TZID=${FUSO}:${carimboLocal(e.data, hora, dur)}`,
      `SUMMARY:${escaparTextoICS(resumo)}`,
    );
    if (e.destino) linhas.push(`LOCATION:${escaparTextoICS(e.destino)}`);
    if (e.descricao) linhas.push(`DESCRIPTION:${escaparTextoICS(e.descricao)}`);
    linhas.push("END:VEVENT");
  }

  linhas.push("END:VCALENDAR");
  return linhas.map(dobrarLinha).join("\r\n") + "\r\n";
}
