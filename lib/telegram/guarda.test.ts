/**
 * Porteiro do bot com contexto grammy mockado.
 * Nenhuma chamada real ao Telegram: `ctx.reply` é um spy.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("não deveria consultar o banco neste teste");
  },
}));

const { guardaAutorizacao, cmdAjuda, AJUDA } = await import("./comandos");

function ctxFake(chatId?: number | string) {
  const reply = vi.fn().mockResolvedValue(undefined);
  return {
    ctx: {
      chat: chatId === undefined ? undefined : { id: chatId },
      message: { text: "/hoje" },
      reply,
    },
    reply,
  };
}

describe("guardaAutorizacao", () => {
  it("libera chat autorizado sem responder nada", async () => {
    const { ctx, reply } = ctxFake(-100999);
    const ok = await guardaAutorizacao(ctx, async () => true);
    expect(ok).toBe(true);
    expect(reply).not.toHaveBeenCalled();
  });

  it("responde 'não autorizado' com o chat id e bloqueia", async () => {
    const { ctx, reply } = ctxFake(123456);
    const ok = await guardaAutorizacao(ctx, async () => false);
    expect(ok).toBe(false);
    expect(reply).toHaveBeenCalledTimes(1);
    const texto = reply.mock.calls[0][0] as string;
    expect(texto).toContain("não está autorizado");
    expect(texto).toContain("123456");
  });

  it("repassa o chat id para o verificador", async () => {
    const verificador = vi.fn().mockResolvedValue(true);
    const { ctx } = ctxFake("-4242");
    await guardaAutorizacao(ctx, verificador);
    expect(verificador).toHaveBeenCalledWith("-4242");
  });

  it("ignora update sem chat", async () => {
    const { ctx, reply } = ctxFake(undefined);
    const verificador = vi.fn();
    expect(await guardaAutorizacao(ctx, verificador)).toBe(false);
    expect(verificador).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });
});

describe("/ajuda", () => {
  it("responde em HTML com o formato de linha única do /agendar", async () => {
    const { ctx, reply } = ctxFake(1);
    await cmdAjuda(ctx);
    expect(reply).toHaveBeenCalledWith(AJUDA, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    const texto = reply.mock.calls[0][0] as string;
    expect(texto).toContain("/agendar cliente | acompanhado | tipo");
    for (const cmd of [
      "/hoje",
      "/amanha",
      "/semana",
      "/cancelar",
      "/iniciar",
      "/finalizar",
      "/relatorio",
      "/saldo",
      "/lead",
    ]) {
      expect(texto).toContain(cmd);
    }
  });
});
