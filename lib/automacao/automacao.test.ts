import { beforeEach, describe, expect, it } from "vitest";

import { FakeWhatsAppClient } from "@/lib/whatsapp/cliente";
import { FakeEmailClient } from "@/lib/email/cliente";
import { criarRepoMemoria, type AtendimentoCompleto } from "./repo";
import { enviarRelatorioAutomatico } from "./relatorio";
import { enviarConfirmacaoAgendamento, enviarLembretesD1 } from "./lembretes";
import { verificarRaio } from "./raio";
import { FakeGeocoder } from "./_compat";

/** Nada de HTTP: WhatsApp e e-mail são sempre Fakes injetados. */
let wa: FakeWhatsAppClient;
let email: FakeEmailClient;
const notificados: string[] = [];
const deps = () => ({
  wa,
  email,
  notificar: async (t: string) => {
    notificados.push(t);
    return true;
  },
});

beforeEach(() => {
  wa = new FakeWhatsAppClient();
  email = new FakeEmailClient();
  notificados.length = 0;
});

function atendimento(over: Partial<AtendimentoCompleto> = {}): AtendimentoCompleto {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    cliente_id: "c1",
    acompanhado_id: "a1",
    acompanhante_id: null,
    pacote_id: "p1",
    tipo: "consulta",
    descricao: null,
    endereco_saida: "Rua A, 100",
    endereco_destino: "Clínica Central, 200",
    data: "2026-09-18",
    hora_prevista_inicio: "14:00",
    duracao_prevista_min: 120,
    status: "concluido",
    inicio_real: "2026-09-18T17:00:00.000Z",
    fim_real: "2026-09-18T19:00:00.000Z",
    minutos_espera: 20,
    km_rodados: 12,
    custo_estacionamento_centavos: 1200,
    custo_pedagio_centavos: 0,
    custo_outros_centavos: 0,
    nivel_esforco: 3,
    observacoes_internas: "Consulta tranquila, dona Maria comeu bem depois.",
    relatorio_texto: null,
    relatorio_enviado_em: null,
    horas_debitadas: 2,
    valor_avulso_centavos: null,
    valor_extras_centavos: 1200,
    motivo_cancelamento: null,
    criado_em: "2026-09-10T12:00:00.000Z",
    atualizado_em: "2026-09-18T19:00:00.000Z",
    cliente: { id: "c1", nome: "Ana", whatsapp: "5551999998888", email: "ana@exemplo.com" },
    acompanhado: { id: "a1", nome: "Maria Silva", apelido: "dona Maria" },
    pacote: { id: "p1", horas_contratadas: 8, horas_usadas: 6 },
    ...over,
  } as AtendimentoCompleto;
}

describe("enviarRelatorioAutomatico", () => {
  it("usa o template_relatorio da configuração, envia por WhatsApp + e-mail e grava", async () => {
    const repo = criarRepoMemoria({
      configuracao: {
        template_relatorio: "Oi {nome}! Relatório de {acompanhado}: {relatorio_texto}",
      },
      atendimentos: [atendimento()],
    });

    const r = await enviarRelatorioAutomatico(atendimento().id, { repo, ...deps() });

    expect(r.ok).toBe(true);
    expect(r.canais).toEqual(["whatsapp", "email"]);
    expect(wa.envios).toHaveLength(1);
    expect(wa.envios[0].tipo).toBe("texto");
    expect(wa.envios[0].texto).toContain("Oi Ana!");
    expect(wa.envios[0].texto).toContain("dona Maria");
    expect(email.envios[0].para).toBe("ana@exemplo.com");

    const gravado = await repo.carregarAtendimento(atendimento().id);
    expect(gravado?.status).toBe("relatado");
    expect(gravado?.relatorio_enviado_em).toBeTruthy();
    expect(repo.eventos.map((e) => e.tipo)).toContain("relatorio.enviado");
  });

  it("sem texto da acompanhante usa o texto padrão (nunca manda placeholder)", async () => {
    const repo = criarRepoMemoria({
      atendimentos: [atendimento({ observacoes_internas: null })],
    });
    const r = await enviarRelatorioAutomatico(atendimento().id, { repo, ...deps() });
    expect(r.ok).toBe(true);
    expect(r.texto).toContain("Tudo tranquilo, sem intercorrências.");
    expect(r.texto).not.toMatch(/\{[a-zA-Z0-9_]+\}/);
  });

  it("template com variável desconhecida não vai para a família e avisa a gestão", async () => {
    const repo = criarRepoMemoria({
      configuracao: { template_relatorio: "Oi {nome}, o valor foi {campo_inexistente}." },
      atendimentos: [atendimento()],
    });
    const r = await enviarRelatorioAutomatico(atendimento().id, { repo, ...deps() });

    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("placeholder");
    expect(wa.envios).toHaveLength(0);
    expect(notificados).toHaveLength(1);
    const gravado = await repo.carregarAtendimento(atendimento().id);
    expect(gravado?.status).toBe("concluido");
  });

  it("falha de envio mantém 'concluido' e notifica a gestão", async () => {
    const repo = criarRepoMemoria({
      atendimentos: [
        atendimento({
          cliente: { id: "c1", nome: "Ana", whatsapp: "", email: null },
        }),
      ],
    });
    const r = await enviarRelatorioAutomatico(atendimento().id, { repo, ...deps() });
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("envio_falhou");
    expect((await repo.carregarAtendimento(atendimento().id))?.status).toBe("concluido");
    expect(notificados).toHaveLength(1);
  });

  it("não reenvia relatório já enviado", async () => {
    const repo = criarRepoMemoria({
      atendimentos: [atendimento({ relatorio_enviado_em: "2026-09-18T20:00:00.000Z" })],
    });
    const r = await enviarRelatorioAutomatico(atendimento().id, { repo, ...deps() });
    expect(r.motivo).toBe("ja_enviado");
    expect(wa.envios).toHaveLength(0);
  });
});

describe("lembretes", () => {
  const agendado = atendimento({ status: "agendado", relatorio_enviado_em: null });

  it("envia o D-1 ao cliente com template_lembrete_d1", async () => {
    const repo = criarRepoMemoria({
      configuracao: { template_lembrete_d1: "Oi {nome}, amanhã {dia} às {hora} com {acompanhado}." },
      atendimentos: [agendado],
    });
    const r = await enviarLembretesD1("2026-09-18", { repo, ...deps() });
    expect(r.enviados).toBe(1);
    expect(wa.envios[0].texto).toBe("Oi Ana, amanhã 18/09 às 14:00 com dona Maria.");
    expect(repo.eventos.filter((e) => e.tipo === "lembrete_d1")).toHaveLength(1);
  });

  it("não duplica: segunda rodada não reenvia nada", async () => {
    const repo = criarRepoMemoria({ atendimentos: [agendado] });

    const primeira = await enviarLembretesD1("2026-09-18", { repo, ...deps() });
    expect(primeira.enviados).toBe(1);

    const segunda = await enviarLembretesD1("2026-09-18", { repo, ...deps() });
    expect(segunda.enviados).toBe(0);
    expect(segunda.pulados).toBe(1);
    expect(wa.envios).toHaveLength(1);
    expect(repo.eventos.filter((e) => e.tipo === "lembrete_d1")).toHaveLength(1);
  });

  it("template com chave desconhecida não vira mensagem nem evento", async () => {
    const repo = criarRepoMemoria({
      configuracao: { template_lembrete_d1: "Oi {nome}, {chave_que_nao_existe}." },
      atendimentos: [agendado],
    });
    const r = await enviarLembretesD1("2026-09-18", { repo, ...deps() });
    expect(r.enviados).toBe(0);
    expect(r.falhas).toBe(1);
    expect(wa.envios).toHaveLength(0);
    expect(repo.eventos.filter((e) => e.tipo === "lembrete_d1")).toHaveLength(0);
  });

  it("ignora atendimento ainda 'solicitado' (a gestora não aprovou)", async () => {
    const repo = criarRepoMemoria({
      atendimentos: [atendimento({ status: "solicitado" })],
    });
    const r = await enviarLembretesD1("2026-09-18", { repo, ...deps() });
    expect(r.enviados).toBe(0);
    expect(wa.envios).toHaveLength(0);
  });

  it("confirmação de agendamento só sai uma vez", async () => {
    const repo = criarRepoMemoria({
      configuracao: { template_confirmacao: "Confirmado, {nome}: {dia} às {hora}." },
      atendimentos: [agendado],
    });
    const um = await enviarConfirmacaoAgendamento(agendado.id, { repo, ...deps() });
    expect(um?.ok).toBe(true);
    expect(wa.envios[0].texto).toBe("Confirmado, Ana: 18/09 às 14:00.");

    const dois = await enviarConfirmacaoAgendamento(agendado.id, { repo, ...deps() });
    expect(dois).toBeNull();
    expect(wa.envios).toHaveLength(1);
  });
});

describe("verificarRaio", () => {
  it("sem lat_base/lng_base devolve 'não verificado' (null)", async () => {
    const repo = criarRepoMemoria({ configuracao: { raio_km: "20" } });
    const r = await verificarRaio("Clínica Central, 200", { repo, geocoder: null });
    expect(r.dentro).toBeNull();
    expect(r.distancia_km).toBeNull();
    expect(r.motivo).toBe("sem_base");
  });

  it("sem geocoder devolve 'não verificado' mesmo com base", async () => {
    const repo = criarRepoMemoria({
      configuracao: { lat_base: "-30.0346", lng_base: "-51.2177", raio_km: "20" },
    });
    const r = await verificarRaio("Clínica Central, 200", { repo, geocoder: null });
    expect(r.dentro).toBeNull();
    expect(r.motivo).toBe("sem_geocoder");
  });

  it("com base e geocoder calcula dentro/fora sem bloquear", async () => {
    const repo = criarRepoMemoria({
      configuracao: { lat_base: "-30.0346", lng_base: "-51.2177", raio_km: "20" },
    });
    const geocoder = new FakeGeocoder({
      "perto, 1": { lat: -30.04, lng: -51.22 },
      "longe, 2": { lat: -29.6, lng: -51.15 },
    });

    const perto = await verificarRaio("Perto, 1", { repo, geocoder });
    expect(perto.dentro).toBe(true);
    expect(perto.distancia_km).toBeLessThan(2);

    const longe = await verificarRaio("Longe, 2", { repo, geocoder });
    expect(longe.dentro).toBe(false);
    expect(longe.distancia_km).toBeGreaterThan(20);

    const desconhecido = await verificarRaio("Rua Fantasma", { repo, geocoder });
    expect(desconhecido.dentro).toBeNull();
    expect(desconhecido.motivo).toBe("endereco_nao_encontrado");
  });
});
