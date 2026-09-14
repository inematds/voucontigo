import { describe, expect, it } from "vitest";

import {
  numeroDoJid,
  parseEvolution,
  parseEvolutionStatus,
  parseMeta,
  parseMetaStatus,
} from "./normalizar";
import {
  calcularSlotsLivres,
  escolherSlot,
  formatarSlots,
  interpretarData,
  CONFIG_AGENDA_PADRAO,
  duracaoPadrao,
} from "./_compat";

const upsert = (over: Record<string, unknown> = {}) => ({
  event: "messages.upsert",
  instance: "voucontigo",
  data: {
    key: {
      remoteJid: "5551999998888@s.whatsapp.net",
      fromMe: false,
      id: "3EB0C1",
      ...(over.key as object),
    },
    pushName: "Ana",
    message: { conversation: "oi" },
    ...over,
  },
});

describe("numeroDoJid", () => {
  it("extrai o número do JID", () => {
    expect(numeroDoJid("5551999998888@s.whatsapp.net")).toBe("5551999998888");
  });
  it("recusa grupo e lixo", () => {
    expect(numeroDoJid("12036@g.us")).toBeNull();
    expect(numeroDoJid("abc@s.whatsapp.net")).toBeNull();
    expect(numeroDoJid("123@s.whatsapp.net")).toBeNull();
  });
});

describe("parseEvolution", () => {
  it("normaliza messages.upsert", () => {
    expect(parseEvolution(upsert())).toEqual({
      whatsapp: "5551999998888",
      wa_message_id: "3EB0C1",
      texto: "oi",
      nome: "Ana",
    });
  });

  it("aceita extendedTextMessage, botões e lista", () => {
    const ext = upsert({ message: { extendedTextMessage: { text: "2" } } });
    expect(parseEvolution(ext)?.texto).toBe("2");
    const btn = upsert({ message: { buttonsResponseMessage: { selectedButtonId: "3" } } });
    expect(parseEvolution(btn)?.texto).toBe("3");
    const lst = upsert({
      message: { listResponseMessage: { singleSelectReply: { selectedRowId: "4" } } },
    });
    expect(parseEvolution(lst)?.texto).toBe("4");
  });

  it("aceita data como array", () => {
    const body = upsert();
    expect(parseEvolution({ ...body, data: [body.data] })?.whatsapp).toBe("5551999998888");
  });

  it("ignora fromMe, grupo, evento desconhecido e mensagem sem texto", () => {
    expect(parseEvolution(upsert({ key: { fromMe: true } }))).toBeNull();
    expect(
      parseEvolution(upsert({ key: { remoteJid: "12036@g.us", id: "x", fromMe: false } })),
    ).toBeNull();
    expect(parseEvolution({ ...upsert(), event: "contacts.update" })).toBeNull();
    expect(parseEvolution(upsert({ message: { imageMessage: {} } }))).toBeNull();
  });

  it("usa senderPn quando o remoteJid é @lid", () => {
    const body = upsert({
      key: { remoteJid: "27411234@lid", fromMe: false, id: "A1", senderPn: "5551999998888@s.whatsapp.net" },
    });
    expect(parseEvolution(body)?.whatsapp).toBe("5551999998888");
  });

  it("mapeia messages.update para status", () => {
    expect(
      parseEvolutionStatus({
        event: "messages.update",
        data: { key: { id: "wamid.1" }, status: "DELIVERY_ACK" },
      }),
    ).toEqual({ wa_message_id: "wamid.1", status: "entregue" });
  });
});

describe("parseMeta", () => {
  const body = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ profile: { name: "Ana" }, wa_id: "5551999998888" }],
              messages: [
                { from: "5551999998888", id: "wamid.HB", type: "text", text: { body: "1" } },
              ],
            },
          },
        ],
      },
    ],
  };

  it("normaliza mensagem de texto", () => {
    expect(parseMeta(body)).toEqual({
      whatsapp: "5551999998888",
      wa_message_id: "wamid.HB",
      texto: "1",
      nome: "Ana",
    });
  });

  it("normaliza resposta de botão interativo", () => {
    const b = structuredClone(body) as unknown as {
      entry: { changes: { value: { messages: unknown[] } }[] }[];
    };
    b.entry[0].changes[0].value.messages[0] = {
      from: "5551999998888",
      id: "wamid.2",
      type: "interactive",
      interactive: { type: "button_reply", button_reply: { id: "2", title: "Cancelar" } },
    };
    expect(parseMeta(b as unknown as Parameters<typeof parseMeta>[0])?.texto).toBe("2");
  });

  it("status vira atualização", () => {
    expect(
      parseMetaStatus({
        entry: [{ changes: [{ value: { statuses: [{ id: "wamid.HB", status: "read" }] } }] }],
      }),
    ).toEqual({ wa_message_id: "wamid.HB", status: "lida" });
  });

  it("payload vazio devolve null", () => {
    expect(parseMeta({})).toBeNull();
    expect(parseMeta(null)).toBeNull();
  });
});

describe("_compat — agenda", () => {
  it("duração padrão por tipo", () => {
    expect(duracaoPadrao("consulta")).toBe(240);
    expect(duracaoPadrao("exame")).toBe(240);
    expect(duracaoPadrao("mercado")).toBe(120);
  });

  it("interpreta datas", () => {
    expect(interpretarData("amanhã", "2026-09-15")).toBe("2026-09-16");
    expect(interpretarData("24/09", "2026-09-15")).toBe("2026-09-24");
    expect(interpretarData("01/02", "2026-09-15")).toBe("2027-02-01");
    expect(interpretarData("banana", "2026-09-15")).toBeNull();
  });

  it("calcula slots respeitando ocupados e intervalo", () => {
    const slots = calcularSlotsLivres({
      de: "2026-09-16",
      dias: 1,
      duracao_min: 120,
      config: CONFIG_AGENDA_PADRAO,
      ocupados: [{ data: "2026-09-16", hora_inicio: "07:00", hora_fim: "09:00" }],
      agora: "2026-09-15T13:00:00Z",
      limite: 3,
    });
    expect(slots[0]).toEqual({ data: "2026-09-16", hora: "10:00" });
    expect(slots).toHaveLength(3);
    expect(formatarSlots(slots).split("\n")[0]).toBe("1. qua 16/09 às 10:00");
    expect(escolherSlot(slots, "2")).toEqual(slots[1]);
    expect(escolherSlot(slots, "9")).toBeNull();
  });

  it("pula dias fora do expediente", () => {
    const slots = calcularSlotsLivres({
      de: "2026-09-20", // domingo
      dias: 2,
      duracao_min: 120,
      config: CONFIG_AGENDA_PADRAO,
      ocupados: [],
      agora: "2026-09-15T13:00:00Z",
      limite: 1,
    });
    expect(slots[0].data).toBe("2026-09-21");
  });
});
