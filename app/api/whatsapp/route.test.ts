import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { criarFakeSupabase, type FakeSupabase } from "@/lib/whatsapp/_fake-supabase";
import { obterFakeWhatsApp } from "@/lib/whatsapp/cliente";

const estado = vi.hoisted(() => ({ sb: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => estado.sb }));
vi.mock("@/lib/telegram/notificacoes", () => ({
  notificarGestao: vi.fn(async () => true),
  notificarNovoLead: vi.fn(async () => true),
  notificarAtendimentoCriado: vi.fn(async () => true),
  notificarAtendimentoCancelado: vi.fn(async () => true),
}));

const { GET, POST } = await import("./route");

const NUMERO = "5551999998888";
const TOKEN = "segredo-webhook";
const APP_SECRET = "segredo-meta";
let sb: FakeSupabase;

function evolutionUpsert(id = "3EB0C1", texto = "oi") {
  return {
    event: "messages.upsert",
    instance: "voucontigo",
    data: {
      key: { remoteJid: `${NUMERO}@s.whatsapp.net`, fromMe: false, id },
      pushName: "Ana",
      message: { conversation: texto },
    },
  };
}

function postEvolution(corpo: unknown, token = TOKEN) {
  return new Request(`https://app.local/api/whatsapp?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

function postMeta(corpo: unknown, assinatura?: string) {
  const bruto = JSON.stringify(corpo);
  const sig =
    assinatura ?? `sha256=${createHmac("sha256", APP_SECRET).update(bruto, "utf8").digest("hex")}`;
  return new Request("https://app.local/api/whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sig },
    body: bruto,
  });
}

beforeEach(() => {
  sb = criarFakeSupabase({
    configuracao: [],
    cliente: [{ id: "c1", nome: "Ana Souza", whatsapp: NUMERO }],
    acompanhado: [
      { id: "a1", cliente_id: "c1", nome: "Dona Maria", apelido: null, endereco: "Rua A, 10" },
    ],
    atendimento: [],
    pacote: [],
    lead: [],
    evento: [],
  });
  estado.sb = sb;
  obterFakeWhatsApp().envios = [];
  process.env.WHATSAPP_WEBHOOK_TOKEN = TOKEN;
  process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  process.env.WHATSAPP_VERIFY_TOKEN = "verifica-123";
  delete process.env.WHATSAPP_PROVIDER;
});

afterEach(() => {
  delete process.env.WHATSAPP_PROVIDER;
});

describe("Evolution (provedor padrão)", () => {
  it("processa messages.upsert e responde o menu", async () => {
    const r = await POST(postEvolution(evolutionUpsert()));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, processado: true, estado: "menu" });
    expect(obterFakeWhatsApp().envios.at(-1)?.texto).toContain("Sou o assistente do Vou Contigo");
  });

  it("token inválido → 401 e nada é processado", async () => {
    const r = await POST(postEvolution(evolutionUpsert(), "errado"));
    expect(r.status).toBe(401);
    expect(sb.tabela("mensagem_whatsapp")).toHaveLength(0);
  });

  it("token ausente no servidor → 401", async () => {
    delete process.env.WHATSAPP_WEBHOOK_TOKEN;
    const r = await POST(postEvolution(evolutionUpsert(), ""));
    expect(r.status).toBe(401);
  });

  it("idempotência por wa_message_id", async () => {
    await POST(postEvolution(evolutionUpsert("dup-1")));
    const enviados = obterFakeWhatsApp().envios.length;
    const r = await POST(postEvolution(evolutionUpsert("dup-1")));
    expect(await r.json()).toMatchObject({ ignorado: "duplicada" });
    expect(obterFakeWhatsApp().envios).toHaveLength(enviados);
  });

  it("ignora fromMe, grupo e evento desconhecido com 200", async () => {
    const meu = evolutionUpsert("x1");
    meu.data.key.fromMe = true;
    expect((await POST(postEvolution(meu))).status).toBe(200);

    const grupo = evolutionUpsert("x2");
    grupo.data.key.remoteJid = "120363@g.us";
    expect(await (await POST(postEvolution(grupo))).json()).toMatchObject({
      ignorado: "sem_mensagem",
    });

    const outro = { event: "contacts.update", instance: "voucontigo", data: {} };
    expect(await (await POST(postEvolution(outro))).json()).toMatchObject({
      ignorado: "evento_desconhecido",
    });
    expect(sb.tabela("mensagem_whatsapp")).toHaveLength(0);
  });

  it("messages.update atualiza o status da mensagem enviada", async () => {
    await POST(postEvolution(evolutionUpsert("in-1")));
    const saida = sb.tabela("mensagem_whatsapp").find((m) => m.direcao === "saida")!;
    const r = await POST(
      postEvolution({
        event: "messages.update",
        data: { key: { id: saida.wa_message_id }, status: "READ" },
      }),
    );
    expect(r.status).toBe(200);
    expect(saida.status).toBe("lida");
  });

  it("JSON inválido não derruba o webhook", async () => {
    const req = new Request(`https://app.local/api/whatsapp?token=${TOKEN}`, {
      method: "POST",
      body: "{nao-e-json",
    });
    const r = await POST(req);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ignorado: "json_invalido" });
  });
});

describe("Meta (WHATSAPP_PROVIDER=meta)", () => {
  const corpo = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ profile: { name: "Ana" }, wa_id: NUMERO }],
              messages: [{ from: NUMERO, id: "wamid.meta1", type: "text", text: { body: "oi" } }],
            },
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    process.env.WHATSAPP_PROVIDER = "meta";
  });

  it("GET devolve o challenge com o verify_token certo", async () => {
    const r = await GET(
      new Request(
        "https://app.local/api/whatsapp?hub.mode=subscribe&hub.verify_token=verifica-123&hub.challenge=98765",
      ),
    );
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("98765");
  });

  it("GET com verify_token errado → 401", async () => {
    const r = await GET(
      new Request(
        "https://app.local/api/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1",
      ),
    );
    expect(r.status).toBe(401);
  });

  it("POST com HMAC válido processa", async () => {
    const r = await POST(postMeta(corpo));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ processado: true });
    expect(obterFakeWhatsApp().envios.at(-1)?.texto).toContain("Sou o assistente do Vou Contigo");
  });

  it("POST com HMAC inválido → 401 e nada processado", async () => {
    const r = await POST(postMeta(corpo, "sha256=deadbeef"));
    expect(r.status).toBe(401);
    expect(sb.tabela("mensagem_whatsapp")).toHaveLength(0);
  });

  it("POST sem assinatura → 401", async () => {
    const req = new Request("https://app.local/api/whatsapp", {
      method: "POST",
      body: JSON.stringify(corpo),
    });
    expect((await POST(req)).status).toBe(401);
  });

  it("status da Meta atualiza a mensagem", async () => {
    await POST(postMeta(corpo));
    const saida = sb.tabela("mensagem_whatsapp").find((m) => m.direcao === "saida")!;
    await POST(
      postMeta({
        entry: [
          { changes: [{ value: { statuses: [{ id: saida.wa_message_id, status: "delivered" }] } }] },
        ],
      }),
    );
    expect(saida.status).toBe("entregue");
  });
});
