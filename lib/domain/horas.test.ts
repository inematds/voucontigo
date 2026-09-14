import { describe, expect, it } from "vitest";

import {
  calcularExtras,
  calcularHorasAtendimento,
  calcularTaxaCancelamento,
  calcularValorAvulso,
  horasRestantes,
} from "./horas";
import { CONFIG_PADRAO, parseConfiguracao } from "./config";

const TOL = CONFIG_PADRAO.tolerancia_espera_min; // 15

describe("calcularHorasAtendimento", () => {
  it("devolve 0 sem início ou fim", () => {
    expect(
      calcularHorasAtendimento({
        inicio_real: null,
        fim_real: "2026-09-18T12:00:00Z",
        minutos_espera: 0,
        tolerancia_espera_min: TOL,
      }),
    ).toBe(0);
  });

  it("arredonda para cima em blocos de 30 min", () => {
    expect(
      calcularHorasAtendimento({
        inicio_real: "2026-09-18T10:00:00Z",
        fim_real: "2026-09-18T11:10:00Z", // 70 min → 3 blocos → 1,5h
        minutos_espera: 0,
        tolerancia_espera_min: TOL,
      }),
    ).toBe(1.5);
  });

  it("não arredonda quando já bate o bloco exato", () => {
    expect(
      calcularHorasAtendimento({
        inicio_real: "2026-09-18T10:00:00Z",
        fim_real: "2026-09-18T12:00:00Z",
        minutos_espera: 0,
        tolerancia_espera_min: TOL,
      }),
    ).toBe(2);
  });

  it("espera dentro da tolerância não conta", () => {
    expect(
      calcularHorasAtendimento({
        inicio_real: "2026-09-18T10:00:00Z",
        fim_real: "2026-09-18T12:00:00Z",
        minutos_espera: 15,
        tolerancia_espera_min: TOL,
      }),
    ).toBe(2);
  });

  it("espera excedente conta e empurra para o bloco seguinte", () => {
    // 120 min + (40 - 15) = 145 min → 5 blocos → 2,5h
    expect(
      calcularHorasAtendimento({
        inicio_real: "2026-09-18T10:00:00Z",
        fim_real: "2026-09-18T12:00:00Z",
        minutos_espera: 40,
        tolerancia_espera_min: TOL,
      }),
    ).toBe(2.5);
  });

  it("um minuto a mais já cobra o bloco inteiro", () => {
    expect(
      calcularHorasAtendimento({
        inicio_real: "2026-09-18T10:00:00Z",
        fim_real: "2026-09-18T12:01:00Z",
        minutos_espera: 0,
        tolerancia_espera_min: TOL,
      }),
    ).toBe(2.5);
  });

  it("fim antes do início não gera horas negativas", () => {
    expect(
      calcularHorasAtendimento({
        inicio_real: "2026-09-18T12:00:00Z",
        fim_real: "2026-09-18T10:00:00Z",
        minutos_espera: 0,
        tolerancia_espera_min: TOL,
      }),
    ).toBe(0);
  });
});

describe("calcularValorAvulso", () => {
  it("aplica o mínimo de horas", () => {
    expect(calcularValorAvulso(1, 7500, 2)).toBe(15000);
  });

  it("cobra as horas reais acima do mínimo", () => {
    expect(calcularValorAvulso(3.5, 7500, 2)).toBe(26250);
  });

  it("nunca devolve negativo", () => {
    expect(calcularValorAvulso(0, 7500, 0)).toBe(0);
  });
});

describe("calcularTaxaCancelamento", () => {
  const config = parseConfiguracao([
    { chave: "cancelamento_gratis_horas", valor: "24" },
    { chave: "cancelamento_taxa_percentual", valor: "50" },
  ]);

  it("é grátis com mais de 24h de antecedência", () => {
    const r = calcularTaxaCancelamento(
      "2026-09-20T10:00:00Z",
      "2026-09-18T10:00:00Z",
      config,
      28000,
    );
    expect(r.gratuito).toBe(true);
    expect(r.taxa_centavos).toBe(0);
    expect(r.horas_antecedencia).toBe(48);
  });

  it("no limite exato de 24h ainda é grátis", () => {
    const r = calcularTaxaCancelamento("2026-09-19T10:00:00Z", "2026-09-18T10:00:00Z", config, 28000);
    expect(r.gratuito).toBe(true);
  });

  it("cobra 50% com menos de 24h", () => {
    const r = calcularTaxaCancelamento("2026-09-19T10:00:00Z", "2026-09-18T12:00:00Z", config, 28000);
    expect(r.gratuito).toBe(false);
    expect(r.percentual).toBe(50);
    expect(r.taxa_centavos).toBe(14000);
  });

  it("cancelar depois do horário também cobra", () => {
    const r = calcularTaxaCancelamento("2026-09-18T10:00:00Z", "2026-09-18T12:00:00Z", config, 15000);
    expect(r.gratuito).toBe(false);
    expect(r.horas_antecedencia).toBe(-2);
    expect(r.taxa_centavos).toBe(7500);
  });
});

describe("calcularExtras", () => {
  it("soma os três custos", () => {
    const e = calcularExtras({
      custo_estacionamento_centavos: 1200,
      custo_pedagio_centavos: 800,
      custo_outros_centavos: 0,
      km_rodados: 14.5,
    });
    expect(e.total_centavos).toBe(2000);
    expect(e.km_rodados).toBe(14.5);
    expect(e.vazio).toBe(false);
  });

  it("marca vazio quando não há custo", () => {
    const e = calcularExtras({
      custo_estacionamento_centavos: null,
      custo_pedagio_centavos: null,
      custo_outros_centavos: null,
      km_rodados: null,
    });
    expect(e.vazio).toBe(true);
    expect(e.total_centavos).toBe(0);
  });
});

describe("horasRestantes", () => {
  it("nunca fica negativo", () => {
    expect(horasRestantes(8, 9.5)).toBe(0);
    expect(horasRestantes(8, 6)).toBe(2);
  });
});
