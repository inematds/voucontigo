import { describe, it, expect } from "vitest";
import { CONFIG_PADRAO } from "@/lib/domain/config";
import { taxaDeCancelamento, valorReferenciaCentavos, type AtendimentoParaTaxa } from "./taxa";
import { calcularSlotsLivres, formatarSlots, JANELA_PADRAO } from "./agendamento";

const config = { ...CONFIG_PADRAO, valor_hora_centavos: 7500, minimo_horas_avulso: 2 };

const atendimento: AtendimentoParaTaxa = {
  data: "2026-09-20",
  hora_prevista_inicio: "09:00",
  duracao_prevista_min: 240, // 4h
  pacote_id: null,
};

describe("valorReferenciaCentavos", () => {
  it("cobra a duração prevista pelo valor da hora", () => {
    expect(valorReferenciaCentavos(atendimento, config)).toBe(30000);
  });
  it("respeita o mínimo de horas do avulso", () => {
    const curto = { ...atendimento, duracao_prevista_min: 60 };
    expect(valorReferenciaCentavos(curto, config)).toBe(15000); // 2h mínimo
  });
  it("usa o valor-hora do pacote quando o atendimento está num pacote", () => {
    const noPacote = { ...atendimento, pacote_id: "pac-1" };
    expect(valorReferenciaCentavos(noPacote, config, 6500)).toBe(26000);
  });
  it("cai no avulso se o pacote não tem valor-hora conhecido", () => {
    const noPacote = { ...atendimento, pacote_id: "pac-1" };
    expect(valorReferenciaCentavos(noPacote, config, null)).toBe(30000);
  });
});

describe("taxaDeCancelamento", () => {
  it("é gratuito com mais de 24h de antecedência", () => {
    const r = taxaDeCancelamento(atendimento, new Date("2026-09-18T12:00:00-03:00"), config);
    expect(r.gratuito).toBe(true);
    expect(r.taxa_centavos).toBe(0);
    expect(r.mensagem).toContain("sem custo");
  });

  it("cobra 50% dentro das 24h", () => {
    const r = taxaDeCancelamento(atendimento, new Date("2026-09-20T00:00:00-03:00"), config);
    expect(r.gratuito).toBe(false);
    expect(r.percentual).toBe(50);
    expect(r.valor_referencia_centavos).toBe(30000);
    expect(r.taxa_centavos).toBe(15000);
    expect(r.mensagem).toContain("R$");
  });

  it("trata a borda exata de 24h como gratuito", () => {
    const r = taxaDeCancelamento(atendimento, new Date("2026-09-19T09:00:00-03:00"), config);
    expect(r.gratuito).toBe(true);
  });

  it("interpreta data+hora no fuso de São Paulo (não em UTC)", () => {
    // 2026-09-19T14:00Z = 11:00 em SP → faltam 22h → com taxa
    const r = taxaDeCancelamento(atendimento, new Date("2026-09-19T14:00:00Z"), config);
    expect(r.gratuito).toBe(false);
    expect(r.horas_antecedencia).toBeCloseTo(22, 1);
  });

  it("aplica taxa quando o horário já passou", () => {
    const r = taxaDeCancelamento(atendimento, new Date("2026-09-21T09:00:00-03:00"), config);
    expect(r.gratuito).toBe(false);
    expect(r.horas_antecedencia).toBeLessThan(0);
  });
});

describe("calcularSlotsLivres (stub local do portal)", () => {
  it("ignora dias fora dos dias de atendimento (domingo)", () => {
    const slots = calcularSlotsLivres({
      de: "2026-09-20", // domingo
      dias: 1,
      duracao_min: 120,
      janela: JANELA_PADRAO,
      ocupados: [],
    });
    expect(slots).toHaveLength(0);
  });

  it("gera slots dentro da janela, com passo de slot_min", () => {
    const slots = calcularSlotsLivres({
      de: "2026-09-21", // segunda
      dias: 1,
      duracao_min: 120,
      janela: JANELA_PADRAO,
      ocupados: [],
    });
    expect(slots[0]).toEqual({ data: "2026-09-21", hora: "07:00" });
    expect(slots[1].hora).toBe("07:30");
    // último slot de 2h precisa terminar até 19:00
    expect(slots.at(-1)!.hora <= "17:00").toBe(true);
  });

  it("descarta slots que colidem com o ocupado mais o intervalo", () => {
    const slots = calcularSlotsLivres({
      de: "2026-09-21",
      dias: 1,
      duracao_min: 120,
      janela: JANELA_PADRAO,
      ocupados: [{ data: "2026-09-21", inicio_min: 9 * 60, fim_min: 11 * 60 }],
    });
    const horas = slots.map((s) => s.hora);
    expect(horas).not.toContain("09:00");
    expect(horas).not.toContain("08:00"); // 8h–10h colide
    // 07:00–09:00 encosta no ocupado: o intervalo de 60min entre atendimentos derruba
    expect(horas).not.toContain("07:00");
    expect(horas[0]).toBe("12:00"); // 11:00 + 60min de intervalo
  });

  it("respeita a antecedência mínima no primeiro dia", () => {
    const slots = calcularSlotsLivres({
      de: "2026-09-21",
      dias: 1,
      duracao_min: 120,
      janela: JANELA_PADRAO,
      ocupados: [],
      agora_min: 15 * 60,
    });
    expect(slots[0].hora).toBe("15:00");
  });
});

describe("formatarSlots", () => {
  it("agrupa por dia", () => {
    const texto = formatarSlots(
      [
        { data: "2026-09-21", hora: "07:00" },
        { data: "2026-09-21", hora: "09:00" },
        { data: "2026-09-22", hora: "10:00" },
      ],
      120,
    );
    expect(texto).toContain("2h");
    expect(texto).toContain("07:00, 09:00");
    expect(texto.split("•")).toHaveLength(3);
  });

  it("avisa quando não há horários", () => {
    expect(formatarSlots([])).toContain("Não encontramos");
  });
});
