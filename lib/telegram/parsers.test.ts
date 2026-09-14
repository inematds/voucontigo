import { describe, expect, it } from "vitest";
import { parseAgendar, parseFinalizar, parseIdEResto } from "./parsers";
import { calcularHoras, montarRelatorio, parseCentavos } from "./_local";

const HOJE = "2026-09-14";

describe("parseAgendar", () => {
  it("aceita a linha única completa", () => {
    const r = parseAgendar(
      "/agendar Maria Silva | Dona Ana | consulta | 12/03 14:30 | 120 | Hospital Moinhos",
      HOJE,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toEqual({
      cliente: "Maria Silva",
      acompanhado: "Dona Ana",
      tipo: "consulta",
      data: "2027-03-12", // 12/03 já passou em 2026 → ano seguinte
      hora: "14:30",
      duracao_min: 120,
      destino: "Hospital Moinhos",
    });
  });

  it("mantém o ano corrente quando a data ainda não passou", () => {
    const r = parseAgendar("/agendar A | B | exame | 25/12 09:00 | 90 | Lab", HOJE);
    expect(r.ok && r.valor.data).toBe("2026-12-25");
  });

  it("aceita ano explícito e tipo com acento", () => {
    const r = parseAgendar(
      "/agendar A | B | farmácia | 01/02/2027 08:05 | 60 | Farmácia São João",
      HOJE,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.data).toBe("2027-02-01");
    expect(r.valor.tipo).toBe("farmacia");
    expect(r.valor.hora).toBe("08:05");
  });

  it("aceita 'min' na duração", () => {
    const r = parseAgendar("/agendar A | B | banco | 20/12 10:00 | 45 min | Caixa", HOJE);
    expect(r.ok && r.valor.duracao_min).toBe(45);
  });

  it("recusa número errado de campos", () => {
    const r = parseAgendar("/agendar A | B | consulta | 20/12 10:00", HOJE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toContain("6 campos");
  });

  it("recusa tipo inválido", () => {
    const r = parseAgendar("/agendar A | B | cirurgia | 20/12 10:00 | 60 | X", HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("Tipo inválido");
  });

  it("recusa data/hora malformada e data inexistente", () => {
    expect(parseAgendar("/agendar A | B | banco | 20-12 10h | 60 | X", HOJE).ok).toBe(
      false,
    );
    expect(parseAgendar("/agendar A | B | banco | 31/02 10:00 | 60 | X", HOJE).ok).toBe(
      false,
    );
    expect(parseAgendar("/agendar A | B | banco | 20/12 25:00 | 60 | X", HOJE).ok).toBe(
      false,
    );
  });

  it("recusa duração fora da faixa", () => {
    expect(parseAgendar("/agendar A | B | banco | 20/12 10:00 | 5 | X", HOJE).ok).toBe(
      false,
    );
    expect(parseAgendar("/agendar A | B | banco | 20/12 10:00 | 900 | X", HOJE).ok).toBe(
      false,
    );
  });

  it("recusa comando vazio", () => {
    expect(parseAgendar("/agendar", HOJE).ok).toBe(false);
  });
});

describe("parseFinalizar", () => {
  const base =
    "/finalizar a1b2c3d4 espera=20 km=12 estac=10,50 pedagio=0 outros=0 esforco=3";

  it("extrai todos os campos obrigatórios", () => {
    const r = parseFinalizar(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toEqual({
      id_curto: "a1b2c3d4",
      minutos_espera: 20,
      km_rodados: 12,
      custo_estacionamento_centavos: 1050,
      custo_pedagio_centavos: 0,
      custo_outros_centavos: 0,
      nivel_esforco: 3,
      observacoes_internas: null,
    });
  });

  it("junta o resto como observação", () => {
    const r = parseFinalizar(`${base} dona ana bem disposta, sem intercorrências`);
    expect(r.ok && r.valor.observacoes_internas).toBe(
      "dona ana bem disposta, sem intercorrências",
    );
  });

  it("aceita R$, ponto de milhar e aliases", () => {
    const r = parseFinalizar(
      "/finalizar a1b2c3d4 espera=0 km=3,5 estacionamento=R$12,00 pedagio=1.250,00 outros=0 esforço=5",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.km_rodados).toBe(3.5);
    expect(r.valor.custo_estacionamento_centavos).toBe(1200);
    expect(r.valor.custo_pedagio_centavos).toBe(125000);
    expect(r.valor.nivel_esforco).toBe(5);
  });

  it("reclama de campos faltando, nomeando-os", () => {
    const r = parseFinalizar("/finalizar a1b2c3d4 espera=10 km=5");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toContain("estac");
    expect(r.erro).toContain("esforco");
  });

  it("recusa esforço fora de 1-5", () => {
    const r = parseFinalizar(base.replace("esforco=3", "esforco=9"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("nivel_esforco");
  });

  it("recusa espera negativa", () => {
    expect(parseFinalizar(base.replace("espera=20", "espera=-5")).ok).toBe(false);
  });

  it("recusa comando sem id", () => {
    expect(parseFinalizar("/finalizar").ok).toBe(false);
  });
});

describe("parseIdEResto", () => {
  it("separa id e motivo", () => {
    const r = parseIdEResto("/cancelar a1b2c3d4 cliente remarcou", "cancelar");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toEqual({ id_curto: "a1b2c3d4", resto: "cliente remarcou" });
  });

  it("aceita menção ao bot e id sem resto", () => {
    const r = parseIdEResto("/iniciar@voucontigobot a1b2c3d4", "iniciar");
    expect(r.ok && r.valor.resto).toBeNull();
  });

  it("recusa id ausente ou inválido", () => {
    expect(parseIdEResto("/iniciar", "iniciar").ok).toBe(false);
    expect(parseIdEResto("/iniciar zzz!", "iniciar").ok).toBe(false);
  });
});

describe("calcularHoras", () => {
  const ini = new Date("2026-09-14T13:00:00-03:00");

  it("arredonda para cima em blocos de 30 min", () => {
    const r = calcularHoras(ini, new Date("2026-09-14T14:10:00-03:00"), 0, 15);
    expect(r.minutos_brutos).toBe(70);
    expect(r.horas_debitadas).toBe(1.5);
  });

  it("cobra a espera que excede a tolerância (regra de lib/domain/horas)", () => {
    const r = calcularHoras(ini, new Date("2026-09-14T15:00:00-03:00"), 40, 15);
    expect(r.minutos_faturaveis).toBe(145); // 120 + (40 - 15)
    expect(r.minutos_espera_cobrados).toBe(25);
    expect(r.horas_debitadas).toBe(2.5);
  });

  it("nunca debita menos de meia hora", () => {
    const r = calcularHoras(ini, new Date("2026-09-14T13:05:00-03:00"), 10, 15);
    expect(r.horas_debitadas).toBe(0.5);
  });
});

describe("parseCentavos", () => {
  it("converte formatos brasileiros", () => {
    expect(parseCentavos("R$ 12,50")).toBe(1250);
    expect(parseCentavos("0")).toBe(0);
    expect(parseCentavos("1.234,56")).toBe(123456);
    expect(parseCentavos("abc")).toBeNull();
    expect(parseCentavos("-1")).toBeNull();
  });
});

describe("montarRelatorio", () => {
  it("segue o modelo do §6.2", () => {
    const texto = montarRelatorio({
      acompanhado: "Dona Ana",
      data: "2026-09-14",
      tipo: "Consulta médica",
      destino: "Hospital Moinhos",
      inicio_real: new Date("2026-09-14T13:00:00-03:00"),
      fim_real: new Date("2026-09-14T15:00:00-03:00"),
      texto: "Tudo bem, humor ótimo.",
      extras_centavos: 1050,
      horas_restantes: 6,
    });
    expect(texto).toContain("Relatório — Dona Ana · 14/09");
    expect(texto).toContain("Consulta médica em Hospital Moinhos");
    expect(texto).toContain("Saímos 13:00 e voltamos 15:00");
    // Intl usa espaço não-quebrável depois de "R$"
    expect(texto).toMatch(/Extras: R\$\s10,50/);
    expect(texto).toContain("Saldo do pacote: 6h");
  });

  it("diz 'nenhum' sem extras e omite saldo sem pacote", () => {
    const texto = montarRelatorio({
      acompanhado: "Seu João",
      data: "2026-09-14",
      tipo: "Mercado",
      destino: "Zaffari",
      inicio_real: null,
      fim_real: null,
      texto: null,
      extras_centavos: 0,
      horas_restantes: null,
    });
    expect(texto).toContain("Extras: nenhum");
    expect(texto).not.toContain("Saldo do pacote");
    expect(texto).toContain("sem intercorrências");
  });
});
