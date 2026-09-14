import { describe, it, expect } from "vitest";
import {
  gerarICS,
  escaparTextoICS,
  dobrarLinha,
  carimboLocal,
  type EventoICS,
} from "./ics";

const AGORA = new Date("2026-09-14T12:00:00Z");

const base: EventoICS = {
  id: "11111111-2222-3333-4444-555555555555",
  data: "2026-09-20",
  hora: "09:30",
  duracao_min: 120,
  tipo_label: "Consulta médica",
  acompanhado: "Dona Alzira",
  destino: "Av. Ipiranga, 100, sala 5 — Porto Alegre",
};

describe("escaparTextoICS", () => {
  it("escapa vírgula, ponto e vírgula, barra e quebra de linha", () => {
    expect(escaparTextoICS("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
});

describe("dobrarLinha", () => {
  it("mantém linhas curtas", () => {
    expect(dobrarLinha("SUMMARY:oi")).toBe("SUMMARY:oi");
  });
  it("dobra linhas com mais de 75 octetos usando CRLF + espaço", () => {
    const dobrada = dobrarLinha("X:" + "a".repeat(200));
    expect(dobrada).toContain("\r\n ");
    for (const parte of dobrada.split("\r\n")) {
      expect(Buffer.from(parte, "utf8").length).toBeLessThanOrEqual(75);
    }
  });
});

describe("carimboLocal", () => {
  it("formata a hora local e soma a duração", () => {
    expect(carimboLocal("2026-09-20", "09:30")).toBe("20260920T093000");
    expect(carimboLocal("2026-09-20", "09:30", 120)).toBe("20260920T113000");
  });
  it("vira o dia quando a duração passa da meia-noite", () => {
    expect(carimboLocal("2026-09-20", "23:30", 60)).toBe("20260921T003000");
  });
});

describe("gerarICS", () => {
  const ics = gerarICS([base], { agora: AGORA, dominio: "voucontigo.app" });

  it("abre e fecha o VCALENDAR com CRLF", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\n").every((l) => l === "" || l.endsWith("\r"))).toBe(true);
  });

  it("inclui VTIMEZONE de America/Sao_Paulo", () => {
    expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:America/Sao_Paulo");
    expect(ics).toContain("TZOFFSETTO:-0300");
  });

  it("usa o id do atendimento como UID e carimba DTSTAMP", () => {
    expect(ics).toContain(`UID:${base.id}@voucontigo.app`);
    expect(ics).toContain("DTSTAMP:20260914T120000Z");
  });

  it("gera DTSTART/DTEND com TZID e a duração prevista", () => {
    expect(ics).toContain("DTSTART;TZID=America/Sao_Paulo:20260920T093000");
    expect(ics).toContain("DTEND;TZID=America/Sao_Paulo:20260920T113000");
  });

  it("monta o SUMMARY no padrão e escapa a LOCATION", () => {
    expect(ics).toContain("SUMMARY:Vou Contigo — Consulta médica — Dona Alzira");
    expect(ics).toContain("LOCATION:Av. Ipiranga\\, 100\\, sala 5 — Porto Alegre");
  });

  it("omite LOCATION quando não há destino", () => {
    const semDestino = gerarICS([{ ...base, destino: null }], { agora: AGORA });
    expect(semDestino).not.toContain("LOCATION:");
  });

  it("gera um VEVENT por atendimento", () => {
    const dois = gerarICS([base, { ...base, id: "outro" }], { agora: AGORA });
    expect(dois.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(dois.match(/END:VEVENT/g)).toHaveLength(2);
  });

  it("gera calendário vazio válido sem atendimentos", () => {
    const vazio = gerarICS([], { agora: AGORA });
    expect(vazio).not.toContain("BEGIN:VEVENT");
    expect(vazio).toContain("END:VCALENDAR");
  });

  it("usa 60 minutos quando a duração é inválida", () => {
    const ruim = gerarICS([{ ...base, duracao_min: 0 }], { agora: AGORA });
    expect(ruim).toContain("DTEND;TZID=America/Sao_Paulo:20260920T103000");
  });
});
