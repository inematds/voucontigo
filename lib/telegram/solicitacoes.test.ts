/**
 * Callbacks inline de solicitação e comandos v2 — tudo com banco e
 * integrações mockados. Nenhuma chamada real ao Telegram/WhatsApp.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("não deveria criar cliente real neste teste");
  },
}));

const enviarConfirmacaoAgendamento = vi.fn(async (_id: string) => true);
const enviarMensagemGestao = vi.fn(async (_w: string, _t: string) => true);
const liberarConversa = vi.fn(async (_w: string) => true);

vi.mock("./_compat_v2", () => ({
  enviarConfirmacaoAgendamento: (id: string) =>
    enviarConfirmacaoAgendamento(id),
  enviarMensagemGestao: (w: string, t: string) => enviarMensagemGestao(w, t),
  liberarConversa: (w: string) => liberarConversa(w),
  normalizarWhatsApp: (b: string) => {
    const so = (b ?? "").replace(/\D/g, "");
    return /^[0-9]{10,15}$/.test(so) ? so : null;
  },
  urlPainel: (c: string) => `https://exemplo.test${c}`,
  baseUrl: () => "https://exemplo.test",
}));

const { criarCtxFake, criarDbFake } = await import("./_fake-db");
const { tratarCallbackSolicitacao, tratarCallbackConversa, cmdResponder, cmdLiberar } =
  await import("./comandos-v2");
const { aprovarSolicitacao, recusarSolicitacao } = await import(
  "./solicitacoes"
);

const ID = "11111111-2222-3333-4444-555555555555";

function atendimentoSolicitado(status = "solicitado") {
  return {
    id: ID,
    cliente_id: "cli-1",
    status,
    tipo: "consulta",
    data: "2026-03-12",
    hora_prevista_inicio: "14:30:00",
    duracao_prevista_min: 120,
    endereco_destino: "Hospital Moinhos",
    cliente: { id: "cli-1", nome: "Maria", whatsapp: "5551999998888" },
    acompanhado: { id: "ac-1", nome: "Dona Ana", apelido: null, endereco: "Rua X" },
  };
}

beforeEach(() => {
  enviarConfirmacaoAgendamento.mockClear();
  enviarMensagemGestao.mockClear();
  liberarConversa.mockClear();
});

describe("aprovarSolicitacao", () => {
  it("muda o status para agendado e chama a confirmação", async () => {
    const db = criarDbFake({
      atendimento: { data: [atendimentoSolicitado()], error: null },
      evento: { data: [], error: null },
    });
    const r = await aprovarSolicitacao(ID, { db: db as never });

    expect(r.ok).toBe(true);
    const update = db.chamadas.find(
      (c) => c.tabela === "atendimento" && c.operacao === "update",
    );
    expect(update?.valores).toEqual({ status: "agendado" });
    expect(enviarConfirmacaoAgendamento).toHaveBeenCalledWith(ID);
  });

  it("recusa aprovar o que já foi tratado e não chama a confirmação", async () => {
    const db = criarDbFake({
      atendimento: { data: [atendimentoSolicitado("agendado")], error: null },
    });
    const r = await aprovarSolicitacao(ID, { db: db as never });

    expect(r.ok).toBe(false);
    expect(enviarConfirmacaoAgendamento).not.toHaveBeenCalled();
  });
});

describe("recusarSolicitacao", () => {
  it("cancela pela operação e avisa o cliente no WhatsApp", async () => {
    const db = criarDbFake({
      atendimento: { data: [atendimentoSolicitado()], error: null },
      evento: { data: [], error: null },
    });
    const r = await recusarSolicitacao(ID, "sem acompanhante livre", {
      db: db as never,
    });

    expect(r.ok).toBe(true);
    const update = db.chamadas.find(
      (c) => c.tabela === "atendimento" && c.operacao === "update",
    );
    expect(update?.valores).toMatchObject({
      status: "cancelado_operacao",
      motivo_cancelamento: "sem acompanhante livre",
    });
    expect(enviarMensagemGestao).toHaveBeenCalledTimes(1);
    expect(enviarMensagemGestao).toHaveBeenCalledWith(
      "5551999998888",
      expect.stringContaining("sem acompanhante livre"),
    );
  });
});

describe("callback sol:*", () => {
  it("sol:aprovar aprova, limpa os botões e responde", async () => {
    const db = criarDbFake({
      atendimento: { data: [atendimentoSolicitado()], error: null },
      evento: { data: [], error: null },
    });
    const { ctx, reply, answerCallbackQuery, editMessageReplyMarkup } =
      criarCtxFake({ callbackData: `sol:aprovar:${ID}` });

    await tratarCallbackSolicitacao(ctx as never, db as never);

    expect(enviarConfirmacaoAgendamento).toHaveBeenCalledWith(ID);
    expect(answerCallbackQuery.mock.calls.length).toBe(1);
    expect(editMessageReplyMarkup.mock.calls.length).toBe(1);
    expect(String(reply.mock.calls[0][0])).toContain("aprovada");
  });

  it("sol:ajustar só devolve o link do painel", async () => {
    const db = criarDbFake({});
    const { ctx, reply } = criarCtxFake({ callbackData: `sol:ajustar:${ID}` });

    await tratarCallbackSolicitacao(ctx as never, db as never);

    expect(enviarConfirmacaoAgendamento).not.toHaveBeenCalled();
    expect(String(reply.mock.calls[0][0])).toContain(
      `/painel/agenda/${ID}/editar`,
    );
  });

  it("sol:recusar cancela e avisa o cliente", async () => {
    const db = criarDbFake({
      atendimento: { data: [atendimentoSolicitado()], error: null },
      evento: { data: [], error: null },
    });
    const { ctx, reply } = criarCtxFake({ callbackData: `sol:recusar:${ID}` });

    await tratarCallbackSolicitacao(ctx as never, db as never);

    expect(enviarMensagemGestao).toHaveBeenCalledTimes(1);
    expect(String(reply.mock.calls[0][0])).toContain("recusada");
  });
});

describe("/responder e /liberar", () => {
  it("/responder envia pela integração de WhatsApp", async () => {
    const db = criarDbFake({ evento: { data: [], error: null } });
    const { ctx, reply } = criarCtxFake({
      texto: "/responder 5551999998888 Oi, já te retorno!",
    });

    await cmdResponder(ctx as never, db as never);

    expect(enviarMensagemGestao).toHaveBeenCalledWith(
      "5551999998888",
      "Oi, já te retorno!",
    );
    expect(String(reply.mock.calls[0][0])).toContain("enviada");
  });

  it("/responder recusa número inválido sem enviar nada", async () => {
    const db = criarDbFake({});
    const { ctx, reply } = criarCtxFake({ texto: "/responder abc Oi" });

    await cmdResponder(ctx as never, db as never);

    expect(enviarMensagemGestao).not.toHaveBeenCalled();
    expect(String(reply.mock.calls[0][0])).toContain("inválido");
  });

  it("/liberar devolve a conversa ao bot", async () => {
    const db = criarDbFake({ evento: { data: [], error: null } });
    const { ctx, reply } = criarCtxFake({ texto: "/liberar 5551999998888" });

    await cmdLiberar(ctx as never, db as never);

    expect(liberarConversa).toHaveBeenCalledWith("5551999998888");
    expect(String(reply.mock.calls[0][0])).toContain("liberado");
  });

  it("callback conv:liberar também libera", async () => {
    const db = criarDbFake({ evento: { data: [], error: null } });
    const { ctx, answerCallbackQuery } = criarCtxFake({
      callbackData: "conv:liberar:5551999998888",
    });

    await tratarCallbackConversa(ctx as never, db as never);

    expect(liberarConversa).toHaveBeenCalledWith("5551999998888");
    expect(answerCallbackQuery.mock.calls.length).toBe(1);
  });
});
