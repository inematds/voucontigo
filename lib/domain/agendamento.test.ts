import { describe, expect, it } from "vitest";
import {
  CONFIG_AGENDA_PADRAO,
  calcularSlotsLivres,
  escolherSlot,
  formatarSlot,
  formatarSlots,
  horaParaMinutos,
  minutosParaHora,
  parseDiasSemana,
  type ConfigAgenda,
} from "./agendamento";

// 2026-09-14 é uma segunda-feira.
const AGORA = new Date(2026, 8, 14, 8, 0, 0);

const cfg = (extra: Partial<ConfigAgenda> = {}): ConfigAgenda => ({
  ...CONFIG_AGENDA_PADRAO,
  ...extra,
});

describe("parseDiasSemana", () => {
  it("lê a lista do banco", () => {
    expect(parseDiasSemana("1,2,3")).toEqual([1, 2, 3]);
    expect(parseDiasSemana("1,2,3,4,5,6")).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("ignora lixo, duplicata e fora da faixa", () => {
    expect(parseDiasSemana(" 3 , x, 3, 9, -1, 0")).toEqual([0, 3]);
    expect(parseDiasSemana("")).toEqual([]);
    expect(parseDiasSemana(null)).toEqual([]);
  });
});

describe("horaParaMinutos / minutosParaHora", () => {
  it("vai e volta", () => {
    expect(horaParaMinutos("09:30")).toBe(570);
    expect(horaParaMinutos("09:30:00")).toBe(570);
    expect(horaParaMinutos("banana")).toBeNull();
    expect(minutosParaHora(570)).toBe("09:30");
  });
});

describe("calcularSlotsLivres", () => {
  it("respeita a janela, o passo e o limite", () => {
    const slots = calcularSlotsLivres({
      de: "2026-09-15",
      ate: "2026-09-15",
      duracao_min: 120,
      ocupados: [],
      config: cfg(),
      agora: AGORA,
      limite: 4,
    });
    expect(slots).toHaveLength(4);
    expect(slots[0]).toEqual({ data: "2026-09-15", hora: "07:00" });
    expect(slots[1].hora).toBe("07:30");
    // último slot possível do dia com 2h e fim às 19:00 seria 17:00
    const todos = calcularSlotsLivres({
      de: "2026-09-15",
      ate: "2026-09-15",
      duracao_min: 120,
      ocupados: [],
      config: cfg(),
      agora: AGORA,
      limite: 100,
    });
    expect(todos.at(-1)!.hora).toBe("17:00");
  });

  it("não oferece dias fora de dias_semana (domingo)", () => {
    // 2026-09-20 é domingo, 2026-09-21 segunda
    const slots = calcularSlotsLivres({
      de: "2026-09-19",
      ate: "2026-09-21",
      duracao_min: 60,
      ocupados: [],
      config: cfg({ dias_semana: [1, 2, 3, 4, 5, 6] }),
      agora: AGORA,
      limite: 200,
    });
    const datas = new Set(slots.map((s) => s.data));
    expect(datas.has("2026-09-19")).toBe(true); // sábado
    expect(datas.has("2026-09-20")).toBe(false); // domingo
    expect(datas.has("2026-09-21")).toBe(true); // segunda
  });

  it("só dias úteis quando dias_semana = 1..5", () => {
    const slots = calcularSlotsLivres({
      de: "2026-09-19",
      ate: "2026-09-20",
      duracao_min: 60,
      ocupados: [],
      config: cfg({ dias_semana: [1, 2, 3, 4, 5] }),
      agora: AGORA,
      limite: 50,
    });
    expect(slots).toEqual([]);
  });

  it("não oferece horário no passado", () => {
    const slots = calcularSlotsLivres({
      de: "2026-09-14",
      ate: "2026-09-14",
      duracao_min: 60,
      ocupados: [],
      config: cfg(),
      agora: new Date(2026, 8, 14, 10, 15, 0),
      limite: 3,
    });
    expect(slots[0]).toEqual({ data: "2026-09-14", hora: "10:30" });
    expect(slots.every((s) => s.hora >= "10:30")).toBe(true);
  });

  it("bloqueia o ocupado e o intervalo entre atendimentos", () => {
    // ocupado 10:00–12:00 + intervalo 60min => bloqueia [09:00, 13:00)
    const slots = calcularSlotsLivres({
      de: "2026-09-15",
      ate: "2026-09-15",
      duracao_min: 60,
      ocupados: [{ data: "2026-09-15", hora: "10:00:00", duracao_min: 120 }],
      config: cfg({ intervalo_min: 60 }),
      agora: AGORA,
      limite: 100,
    });
    const horas = slots.map((s) => s.hora);
    expect(horas).toContain("08:00");
    expect(horas).not.toContain("08:30"); // 08:30–09:30 entra na folga
    expect(horas).not.toContain("09:00");
    expect(horas).not.toContain("12:00");
    expect(horas).not.toContain("12:30");
    expect(horas).toContain("13:00");
  });

  it("sem intervalo, o slot encosta no ocupado", () => {
    const horas = calcularSlotsLivres({
      de: "2026-09-15",
      ate: "2026-09-15",
      duracao_min: 60,
      ocupados: [{ data: "2026-09-15", hora: "10:00", duracao_min: 120 }],
      config: cfg({ intervalo_min: 0 }),
      agora: AGORA,
      limite: 100,
    }).map((s) => s.hora);
    expect(horas).toContain("09:00");
    expect(horas).not.toContain("09:30");
    expect(horas).toContain("12:00");
  });

  it("limite 0 devolve lista vazia", () => {
    expect(
      calcularSlotsLivres({
        de: "2026-09-15",
        ate: "2026-09-30",
        duracao_min: 60,
        ocupados: [],
        config: cfg(),
        agora: AGORA,
        limite: 0,
      }),
    ).toEqual([]);
  });
});

describe("formatarSlots / escolherSlot", () => {
  const slots = [
    { data: "2026-09-16", hora: "09:00" },
    { data: "2026-09-19", hora: "14:30" },
  ];

  it("formata em pt-BR numerado", () => {
    expect(formatarSlot(slots[0])).toBe("qua 16/09 às 09:00");
    expect(formatarSlots(slots)).toBe("1. qua 16/09 às 09:00\n2. sáb 19/09 às 14:30");
  });

  it("escolhe pelo número", () => {
    expect(escolherSlot(slots, "2")).toEqual(slots[1]);
    expect(escolherSlot(slots, " 1 ")).toEqual(slots[0]);
    expect(escolherSlot(slots, 2)).toEqual(slots[1]);
    expect(escolherSlot(slots, "3")).toBeNull();
    expect(escolherSlot(slots, "0")).toBeNull();
    expect(escolherSlot(slots, "oi")).toBeNull();
    expect(escolherSlot(slots, null)).toBeNull();
  });
});
