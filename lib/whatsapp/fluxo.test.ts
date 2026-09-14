import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { criarFakeSupabase, type FakeSupabase } from "./_fake-supabase";
import { obterFakeWhatsApp } from "./cliente";

const estado = vi.hoisted(() => ({ sb: null as unknown }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => estado.sb,
}));

const notificar = vi.hoisted(() => vi.fn(async (_texto: string) => true));
vi.mock("@/lib/telegram/notificacoes", () => ({
  notificarGestao: notificar,
  notificarNovoLead: vi.fn(async () => true),
  notificarAtendimentoCriado: vi.fn(async () => true),
  notificarAtendimentoCancelado: vi.fn(async () => true),
}));

const { processarMensagemRecebida, enviarMensagemGestao, liberarConversa } = await import("./fluxo");

const NUMERO = "5551999998888";
const AGORA = new Date("2026-09-15T13:00:00Z"); // terça, 10:00 em São Paulo

let sb: FakeSupabase;
let seq = 0;

function semear() {
  return criarFakeSupabase({
    configuracao: [
      { chave: "valor_hora_centavos", valor: "7500" },
      { chave: "minimo_horas_avulso", valor: "2" },
      { chave: "cancelamento_gratis_horas", valor: "24" },
      { chave: "cancelamento_taxa_percentual", valor: "50" },
      { chave: "horario_inicio", valor: "07:00" },
      { chave: "horario_fim", valor: "19:00" },
      { chave: "dias_semana", valor: "1,2,3,4,5,6" },
      { chave: "slot_min", valor: "30" },
      { chave: "intervalo_entre_atendimentos_min", valor: "60" },
    ],
    cliente: [{ id: "c1", nome: "Ana Souza", whatsapp: NUMERO }],
    acompanhado: [
      { id: "a1", cliente_id: "c1", nome: "Dona Maria", apelido: null, endereco: "Rua A, 10" },
      { id: "a2", cliente_id: "c1", nome: "Seu João", apelido: null, endereco: "Rua B, 20" },
    ],
    atendimento: [],
    pacote: [],
    lead: [],
    evento: [],
  });
}

/** Manda uma mensagem do cliente e devolve as respostas do bot. */
async function falar(texto: string, numero = NUMERO) {
  seq += 1;
  const r = await processarMensagemRecebida({
    whatsapp: numero,
    wa_message_id: `wamid.${seq}`,
    texto,
    nome: "Ana",
  });
  return r;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  sb = semear();
  estado.sb = sb;
  seq = 0;
  notificar.mockClear();
  obterFakeWhatsApp().envios = [];
  delete process.env.WHATSAPP_PROVIDER;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("menu", () => {
  it("responde o menu numerado ao cliente conhecido", async () => {
    const r = await falar("oi");
    expect(r.ok).toBe(true);
    expect(r.estado).toBe("menu");
    expect(r.respostas[0]).toContain("Oi, Ana! Sou o assistente do Vou Contigo.");
    expect(r.respostas[0]).toContain("1. Agendar acompanhamento");
    expect(r.respostas[0]).toContain("5. Falar com uma pessoa");
    // a saída também é gravada
    const msgs = sb.tabela("mensagem_whatsapp");
    expect(msgs.filter((m) => m.direcao === "saida")).toHaveLength(1);
    expect(msgs.filter((m) => m.direcao === "entrada")).toHaveLength(1);
  });

  it("texto livre não reconhecido no menu vai para humano", async () => {
    await falar("oi");
    const r = await falar("preciso falar sobre o preço do pacote");
    expect(r.estado).toBe("humano");
    expect(r.respostas[0]).toBe("Vou chamar a gestora, já te respondemos por aqui.");
    expect(notificar).toHaveBeenCalled();
  });
});

describe("fluxo 1 — agendar", () => {
  it("vai do menu até solicitar_atendimento com os argumentos certos", async () => {
    await falar("oi");

    const acomp = await falar("1");
    expect(acomp.respostas[0]).toContain("1. Dona Maria");
    expect(acomp.respostas[0]).toContain("2. Seu João");

    const tipo = await falar("1"); // Dona Maria
    expect(tipo.respostas[0]).toContain("1. Consulta médica");

    const data = await falar("1"); // consulta
    expect(data.respostas[0]).toContain("Para que dia?");

    const horas = await falar("amanhã");
    expect(horas.respostas[0]).toContain("1. qua 16/09 às 07:00");

    const destino = await falar("1");
    expect(destino.respostas[0]).toContain("Para onde vamos?");

    const resumo = await falar("Hospital Moinhos de Vento");
    expect(resumo.respostas[0]).toContain("Dona Maria");
    expect(resumo.respostas[0]).toContain("1. Confirmar");
    expect(resumo.respostas[0]).toContain("2. Corrigir");

    const fim = await falar("1");
    expect(fim.estado).toBe("menu");
    expect(fim.respostas[0]).toContain("Recebemos sua solicitação!");

    const rpc = sb.ultimaRpc("solicitar_atendimento");
    expect(rpc?.args).toEqual({
      p_cliente_id: "c1",
      p_acompanhado_id: "a1",
      p_tipo: "consulta",
      p_data: "2026-09-16",
      p_hora: "07:00",
      p_duracao_min: 240,
      p_destino: "Hospital Moinhos de Vento",
      p_saida: "Rua A, 10",
      p_canal: "whatsapp",
    });

    // o evento é gravado pela própria RPC (canal 'whatsapp'), não pelo fluxo
    expect(sb.tabela("evento")).toHaveLength(0);
    // gestão avisada para aprovar
    expect(notificar.mock.calls.at(-1)?.[0]).toContain("Solicitação pelo WhatsApp");
  });

  // shape real da RPC `horarios_ocupados` (0005): {data, hora_inicio, duracao_min}
  it("respeita horários já ocupados", async () => {
    sb.handlers["horarios_ocupados"] = () => ({
      data: [{ data: "2026-09-16", hora_inicio: "07:00:00", duracao_min: 240 }],
      error: null,
    });
    await falar("oi");
    await falar("1");
    await falar("1");
    await falar("1"); // consulta, 240 min
    const horas = await falar("amanhã");
    expect(horas.respostas[0]).toContain("12:00");
    expect(horas.respostas[0]).not.toContain("07:00");
  });

  it("menu a qualquer momento reinicia o fluxo", async () => {
    await falar("oi");
    await falar("1");
    const r = await falar("menu");
    expect(r.estado).toBe("menu");
    expect(r.respostas[0]).toContain("Como posso ajudar?");
  });
});

describe("fluxo 2 — cancelar", () => {
  beforeEach(() => {
    sb.tabela("atendimento").push({
      id: "at1",
      cliente_id: "c1",
      acompanhado_id: "a1",
      tipo: "consulta",
      data: "2026-09-30",
      hora_prevista_inicio: "09:00:00",
      duracao_prevista_min: 240,
      endereco_destino: "Clínica X",
      status: "agendado",
    });
  });

  it("lista, informa a taxa e chama a RPC de cancelamento", async () => {
    await falar("oi");
    const lista = await falar("2");
    expect(lista.respostas[0]).toContain("1. Dona Maria · Consulta médica — 30/09/2026 às 09:00");

    const taxa = await falar("1");
    expect(taxa.respostas[0]).toContain("sem custo"); // faltam mais de 24h

    sb.handlers["cancelar_atendimento_familiar"] = () => ({
      data: { atendimento_id: "at1", taxa_centavos: 0, mensagem: "Atendimento cancelado sem custo. 💚" },
      error: null,
    });
    const fim = await falar("1");
    expect(sb.ultimaRpc("cancelar_atendimento_familiar")?.args).toEqual({
      p_atendimento_id: "at1",
      p_motivo: "Cancelado pelo cliente via WhatsApp",
      p_canal: "whatsapp",
    });
    expect(fim.respostas[0]).toContain("Cancelamento confirmado");
    expect(sb.tabela("evento")).toHaveLength(0);
  });

  it("informa a taxa estimada quando falta menos que o prazo", async () => {
    sb.tabela("atendimento")[0].data = "2026-09-15";
    sb.tabela("atendimento")[0].hora_prevista_inicio = "18:00:00";
    await falar("oi");
    await falar("2");
    const taxa = await falar("1");
    expect(taxa.respostas[0]).toContain("50%");
    expect(taxa.respostas[0]).toContain("R$");
  });

  it("cancelar e remarcar entra no fluxo de agendamento", async () => {
    await falar("oi");
    await falar("2");
    await falar("1");
    const r = await falar("2"); // cancelar e remarcar
    expect(sb.ultimaRpc("cancelar_atendimento_familiar")).not.toBeNull();
    expect(r.estado).toBe("agendar_acompanhado");
  });
});

describe("fluxo 3 — horários livres", () => {
  it("pergunta a duração, lista slots e cai no agendamento", async () => {
    await falar("oi");
    const dur = await falar("3");
    expect(dur.respostas[0]).toContain("1. Até 2 horas");

    const slots = await falar("1"); // até 2h
    expect(slots.respostas[0]).toContain("Responda o número para agendar");
    expect(slots.respostas[0]).toContain("15/09");

    const escolha = await falar("1");
    // cliente tem 2 acompanhados → pergunta qual antes do destino
    expect(escolha.estado).toBe("agendar_acompanhado");
    await falar("1"); // Dona Maria
    const destino = await falar("1"); // consulta
    expect(destino.estado).toBe("agendar_destino");
    expect(destino.respostas[0]).toContain("Para onde vamos?");
  });
});

describe("fluxo 4 — saldo", () => {
  it("mostra saldo do pacote e próxima visita", async () => {
    sb.tabela("pacote").push({
      id: "p1",
      cliente_id: "c1",
      horas_contratadas: 8,
      horas_usadas: 2.5,
      valido_ate: "2026-10-31",
      status: "ativo",
    });
    sb.tabela("atendimento").push({
      id: "at9",
      cliente_id: "c1",
      acompanhado_id: "a1",
      tipo: "exame",
      data: "2026-09-18",
      hora_prevista_inicio: "08:00:00",
      duracao_prevista_min: 240,
      endereco_destino: "Laboratório Y",
      status: "confirmado",
    });
    await falar("oi");
    const r = await falar("4");
    expect(r.respostas[0]).toContain("5h30");
    expect(r.respostas[0]).toContain("Próxima visita");
    expect(r.respostas[0]).toContain("Laboratório Y");
    expect(r.estado).toBe("menu");
  });

  it("sem pacote ativo avisa que é avulso", async () => {
    await falar("oi");
    const r = await falar("4");
    expect(r.respostas[0]).toContain("não tem pacote ativo");
  });
});

describe("estado humano", () => {
  it("silencia o bot e apenas notifica a gestão", async () => {
    await falar("oi");
    await falar("5");
    notificar.mockClear();
    obterFakeWhatsApp().envios = [];

    const r = await falar("alô?");
    expect(r.estado).toBe("humano");
    expect(r.respostas).toHaveLength(0);
    expect(obterFakeWhatsApp().envios).toHaveLength(0);
    expect(notificar).toHaveBeenCalledTimes(1);

    // nem "menu" reativa o bot
    const m = await falar("menu");
    expect(m.estado).toBe("humano");
    expect(m.respostas).toHaveLength(0);
  });

  it("liberarConversa devolve o número ao bot", async () => {
    await falar("oi");
    await falar("5");
    await liberarConversa(NUMERO);
    const r = await falar("oi");
    expect(r.estado).toBe("menu");
    expect(r.respostas[0]).toContain("Como posso ajudar?");
  });
});

describe("número desconhecido", () => {
  it("manda boas-vindas, cria lead e chama a gestão", async () => {
    const r = await falar("bom dia, quanto custa?", "5551888887777");
    expect(r.estado).toBe("humano");
    expect(r.respostas[0]).toContain("Vou Contigo");
    const leads = sb.tabela("lead");
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ whatsapp: "5551888887777", origem: "whatsapp" });
    expect(notificar).toHaveBeenCalled();
  });

  it("não duplica o lead na segunda mensagem", async () => {
    await falar("oi", "5551888887777");
    await falar("tem vaga?", "5551888887777");
    expect(sb.tabela("lead")).toHaveLength(1);
  });
});

describe("idempotência", () => {
  it("ignora a mesma wa_message_id duas vezes", async () => {
    const msg = { whatsapp: NUMERO, wa_message_id: "wamid.repetida", texto: "oi", nome: "Ana" };
    const a = await processarMensagemRecebida(msg);
    const b = await processarMensagemRecebida(msg);
    expect(a.ignorado).toBeUndefined();
    expect(b.ignorado).toBe("duplicada");
    expect(b.respostas).toHaveLength(0);
    expect(obterFakeWhatsApp().envios).toHaveLength(1);
  });
});

describe("enviarMensagemGestao", () => {
  it("envia e grava como saída", async () => {
    const r = await enviarMensagemGestao(NUMERO, "Oi Ana, aqui é a Camila!");
    expect(r.ok).toBe(true);
    expect(obterFakeWhatsApp().envios.at(-1)).toMatchObject({
      tipo: "texto",
      para: NUMERO,
      texto: "Oi Ana, aqui é a Camila!",
    });
    expect(sb.tabela("mensagem_whatsapp").at(-1)).toMatchObject({
      direcao: "saida",
      status: "enviada",
    });
  });
});
