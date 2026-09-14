import { describe, expect, it } from "vitest";

import type { Atendimento } from "./types";
import {
  TEMPLATE_RELATORIO_PADRAO,
  chavesDoTemplate,
  descreverExtras,
  formatarHoras,
  formatarReais,
  montarRelatorio,
  renderTemplate,
} from "./templates";
import { parseConfiguracao, parseTemplates } from "./config";

const atendimento: Atendimento = {
  id: "11111111-1111-1111-1111-111111111111",
  cliente_id: "22222222-2222-2222-2222-222222222222",
  acompanhado_id: "33333333-3333-3333-3333-333333333333",
  acompanhante_id: null,
  pacote_id: "44444444-4444-4444-4444-444444444444",
  tipo: "consulta",
  descricao: "Cardiologista",
  endereco_saida: "Rua das Flores, 100",
  endereco_destino: "Hospital Moinhos, Porto Alegre",
  data: "2026-09-18",
  hora_prevista_inicio: "09:00",
  duracao_prevista_min: 180,
  status: "concluido",
  inicio_real: "2026-09-18T12:00:00.000Z",
  fim_real: "2026-09-18T15:30:00.000Z",
  minutos_espera: 40,
  km_rodados: 18.4,
  custo_estacionamento_centavos: 1200,
  custo_pedagio_centavos: 0,
  custo_outros_centavos: 0,
  nivel_esforco: 3,
  observacoes_internas: null,
  relatorio_texto: "Dona Alzira estava animada, tudo correu bem na consulta.",
  relatorio_enviado_em: null,
  horas_debitadas: 4,
  valor_avulso_centavos: null,
  valor_extras_centavos: 1200,
  motivo_cancelamento: null,
  criado_em: "2026-09-10T12:00:00.000Z",
  atualizado_em: "2026-09-18T15:30:00.000Z",
};

const acompanhado = { nome: "Alzira Souza", apelido: "Dona Alzira" };
const cliente = { nome: "Marcela" };
const pacote = { horas_contratadas: 8, horas_usadas: 5.5 };

describe("renderTemplate", () => {
  it("substitui placeholders", () => {
    expect(renderTemplate("Oi, {nome}! Às {hora}.", { nome: "Marcela", hora: "09:00" })).toBe(
      "Oi, Marcela! Às 09:00.",
    );
  });

  it("mantém o placeholder quando falta valor", () => {
    expect(renderTemplate("Oi, {nome}!", {})).toBe("Oi, {nome}!");
    expect(renderTemplate("Oi, {nome}!", { nome: "" })).toBe("Oi, {nome}!");
  });

  it("aceita números", () => {
    expect(renderTemplate("{km} km", { km: 18.4 })).toBe("18.4 km");
  });

  it("lista as chaves usadas", () => {
    expect(chavesDoTemplate("{a} e {b} e {a}").sort()).toEqual(["a", "b"]);
  });
});

describe("formatação pt-BR", () => {
  it("formata reais", () => {
    expect(formatarReais(118000).replace(/ /g, " ")).toBe("R$ 1.180,00");
    expect(formatarReais(null).replace(/ /g, " ")).toBe("R$ 0,00");
  });

  it("formata horas", () => {
    expect(formatarHoras(2)).toBe("2h");
    expect(formatarHoras(2.5)).toBe("2h30");
  });

  it("descreve extras", () => {
    expect(descreverExtras(atendimento)).toContain("estacionamento");
    expect(
      descreverExtras({
        custo_estacionamento_centavos: 0,
        custo_pedagio_centavos: 0,
        custo_outros_centavos: 0,
        km_rodados: 0,
      }),
    ).toBe("nenhum");
  });
});

describe("montarRelatorio", () => {
  it("gera o relatório da §6.2 com pacote", () => {
    const texto = montarRelatorio(atendimento, acompanhado, cliente, pacote);
    expect(texto).toContain("Dona Alzira");
    expect(texto).toContain("Consulta médica");
    expect(texto).toContain("Hospital Moinhos");
    expect(texto).toContain("Saldo do pacote: 2,5h"); // 8 - 5,5 = 2,5h
    expect(texto).toContain("estacionamento");
    expect(texto).not.toMatch(/\{[a-z_]+\}/);
  });

  it("sem pacote, remove a linha de saldo", () => {
    const texto = montarRelatorio(
      { ...atendimento, pacote_id: null },
      acompanhado,
      cliente,
      null,
    );
    expect(texto).not.toContain("Saldo do pacote");
    expect(texto).not.toMatch(/\{[a-z_]+\}/);
  });

  it("usa o template vindo da configuração", () => {
    const templates = parseTemplates([
      { chave: "template_relatorio", valor: "R: {acompanhado} / {tipo} / {extras}" },
      { chave: "valor_hora_centavos", valor: "7500" },
    ]);
    expect(Object.keys(templates)).toEqual(["template_relatorio"]);
    const texto = montarRelatorio(
      atendimento,
      acompanhado,
      cliente,
      pacote,
      templates.template_relatorio,
    );
    expect(texto.startsWith("R: Dona Alzira / Consulta médica /")).toBe(true);
  });

  it("cai no template padrão quando a configuração está vazia", () => {
    const texto = montarRelatorio(atendimento, acompanhado, cliente, pacote, "");
    expect(texto.split("\n").length).toBe(TEMPLATE_RELATORIO_PADRAO.split("\n").length);
  });
});

describe("parseConfiguracao", () => {
  it("usa defaults quando falta chave", () => {
    const c = parseConfiguracao([]);
    expect(c.valor_hora_centavos).toBe(7500);
    expect(c.tolerancia_espera_min).toBe(15);
    expect(c.cidade_base).toBe("Porto Alegre");
  });

  it("lê valores do banco e ignora lixo", () => {
    const c = parseConfiguracao([
      { chave: "valor_hora_centavos", valor: "9000" },
      { chave: "minimo_horas_avulso", valor: "abc" },
      { chave: "raio_km", valor: "25,5" },
      { chave: "cancelamento_taxa_percentual", valor: "150" },
    ]);
    expect(c.valor_hora_centavos).toBe(9000);
    expect(c.minimo_horas_avulso).toBe(2);
    expect(c.raio_km).toBe(25.5);
    expect(c.cancelamento_taxa_percentual).toBe(100);
  });

  it("aceita mapa chave→valor", () => {
    expect(parseConfiguracao({ saldo_baixo_horas: "3" }).saldo_baixo_horas).toBe(3);
  });
});
