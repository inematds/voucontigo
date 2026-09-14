/**
 * Resumos: formatam sem quebrar com listas vazias e somam corretamente.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("não deveria criar cliente real neste teste");
  },
}));

vi.mock("./notificacoes", () => ({ notificarGestao: async () => true }));

const { criarDbFake } = await import("./_fake-db");
const {
  ehSegunda,
  inicioSemana,
  resumoDiario,
  resumoFinanceiroSemanal,
} = await import("./resumos");

describe("resumoDiario", () => {
  it("não quebra com tudo vazio e traz todas as seções", async () => {
    const db = criarDbFake({});
    const { texto, contagem } = await resumoDiario(
      db as never,
      new Date("2026-03-12T10:00:00Z"),
    );

    expect(texto.length).toBeGreaterThan(0);
    expect(texto).not.toContain("NaN");
    expect(texto).not.toContain("undefined");
    expect(texto).toContain("Nenhum atendimento");
    expect(texto).toContain("Nenhuma aguardando aprovação");
    expect(texto).toContain("Ninguém esperando atendimento humano");
    expect(contagem).toEqual({
      agenda: 0,
      solicitacoes: 0,
      conversas_humano: 0,
      relatorios_pendentes: 0,
      cobrancas_vencendo: 0,
    });
  });

  it("lista solicitações e conversas pendentes", async () => {
    const db = criarDbFake({
      atendimento: [
        { data: [], error: null }, // agenda de hoje
        {
          data: [
            {
              id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
              data: "2026-03-13",
              hora_prevista_inicio: "09:00:00",
              cliente: { nome: "Maria" },
            },
          ],
          error: null,
        },
        { data: [], error: null }, // relatórios
      ],
      conversa_whatsapp: {
        data: [{ id: "c1", whatsapp: "5551999998888", cliente: null }],
        error: null,
      },
    });

    const { texto, contagem } = await resumoDiario(
      db as never,
      new Date("2026-03-12T10:00:00Z"),
    );

    expect(texto).toContain("Maria");
    expect(texto).toContain("5551999998888");
    expect(contagem.solicitacoes).toBe(1);
    expect(contagem.conversas_humano).toBe(1);
  });
});

describe("resumoFinanceiroSemanal", () => {
  it("com semana vazia não divide por zero nem mostra NaN", async () => {
    const db = criarDbFake({});
    const { texto, contagem } = await resumoFinanceiroSemanal(
      db as never,
      new Date("2026-03-16T10:00:00Z"),
    );

    expect(texto).not.toContain("NaN");
    expect(texto).toContain("Nada recebido nesta semana");
    expect(contagem.receita_por_hora_centavos).toBe(0);
    expect(contagem.horas_atendidas).toBe(0);
  });

  it("agrupa por meio e calcula receita por hora", async () => {
    const db = criarDbFake({
      pagamento: [
        {
          data: [
            { valor_centavos: 30000, meio: "pix" },
            { valor_centavos: 10000, meio: "pix" },
            { valor_centavos: 20000, meio: "dinheiro" },
          ],
          error: null,
        },
        { data: [{ valor_centavos: 5000 }], error: null },
      ],
      pacote: {
        data: [{ id: "p1", horas_contratadas: 10, plano: { nome: "Mensal" } }],
        error: null,
      },
      atendimento: {
        data: [{ horas_debitadas: 2 }, { horas_debitadas: 4 }],
        error: null,
      },
    });

    const { texto, contagem } = await resumoFinanceiroSemanal(
      db as never,
      new Date("2026-03-16T10:00:00Z"),
    );

    expect(contagem.recebido_centavos).toBe(60000);
    expect(contagem.pendente_centavos).toBe(5000);
    expect(contagem.pacotes_vendidos).toBe(1);
    expect(contagem.horas_atendidas).toBe(6);
    expect(contagem.receita_por_hora_centavos).toBe(10000);
    expect(texto).toContain("PIX");
    expect(texto).toContain("Dinheiro");
    expect(texto).not.toContain("NaN");
  });
});

describe("agenda semanal", () => {
  it("inicioSemana cai sempre na segunda", () => {
    expect(inicioSemana("2026-03-12")).toBe("2026-03-09"); // quinta → segunda
    expect(inicioSemana("2026-03-09")).toBe("2026-03-09");
    expect(inicioSemana("2026-03-15")).toBe("2026-03-09"); // domingo
  });

  it("ehSegunda só é verdadeiro na segunda", () => {
    expect(ehSegunda(new Date("2026-03-16T12:00:00Z"))).toBe(true);
    expect(ehSegunda(new Date("2026-03-17T12:00:00Z"))).toBe(false);
  });
});
