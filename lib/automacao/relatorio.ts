/**
 * Relatório automático (PLANO §7.2): ao finalizar o atendimento, o sistema
 * monta o texto com `template_relatorio` da configuração (NUNCA layout fixo)
 * e manda para a família por WhatsApp — e por e-mail quando o cliente tiver.
 *
 * Falhou o envio? O atendimento continua `concluido` (fluxo manual de copiar
 * segue disponível) e a gestão é avisada no Telegram.
 */

import { montarRelatorio, TEMPLATE_RELATORIO_PADRAO } from "@/lib/domain/templates";
import { criarRepoSupabase, type RepoAutomacao } from "./repo";
import { avisarGestao, enviarAoCliente, escapeHtml, type DepsEnvio } from "./envio";

/** Usado quando a acompanhante não escreveu nada — nunca mandamos `{chave}` à família. */
export const TEXTO_RELATORIO_PADRAO = "Tudo tranquilo, sem intercorrências.";

export interface DepsAutomacao extends DepsEnvio {
  repo?: RepoAutomacao;
}

export interface ResultadoRelatorio {
  ok: boolean;
  motivo?:
    | "nao_encontrado"
    | "ja_enviado"
    | "placeholder"
    | "envio_falhou"
    | "sem_cliente";
  canais: ("whatsapp" | "email")[];
  texto?: string;
}

const PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/;

export async function enviarRelatorioAutomatico(
  atendimentoId: string,
  deps: DepsAutomacao = {},
): Promise<ResultadoRelatorio> {
  const repo = deps.repo ?? criarRepoSupabase();

  const a = await repo.carregarAtendimento(atendimentoId);
  if (!a) return { ok: false, motivo: "nao_encontrado", canais: [] };
  if (a.relatorio_enviado_em) return { ok: true, motivo: "ja_enviado", canais: [] };
  if (!a.cliente) return { ok: false, motivo: "sem_cliente", canais: [] };

  const cfg = await repo.lerConfig();
  const template = cfg.template_relatorio?.trim() || TEMPLATE_RELATORIO_PADRAO;

  const corpo =
    a.relatorio_texto?.trim() || a.observacoes_internas?.trim() || TEXTO_RELATORIO_PADRAO;

  const texto = montarRelatorio(
    { ...a, relatorio_texto: corpo },
    a.acompanhado ?? { nome: "", apelido: null },
    a.cliente,
    a.pacote,
    template,
  );

  // Placeholder sobrando = template pede um dado que não temos. Não mandamos
  // "{hora}" para a família: a gestora completa à mão.
  if (PLACEHOLDER.test(texto)) {
    await avisarGestao(
      [
        "⚠️ <b>Relatório automático não enviado</b>",
        `Faltam dados no template para <code>${escapeHtml(a.id.slice(0, 8))}</code>.`,
        `<pre>${escapeHtml(texto)}</pre>`,
      ].join("\n"),
      deps,
    );
    await repo.registrarEvento({
      tipo: "relatorio.falhou",
      canal: "sistema",
      atendimento_id: a.id,
      cliente_id: a.cliente_id,
      payload: { motivo: "placeholder" },
    });
    return { ok: false, motivo: "placeholder", canais: [], texto };
  }

  const envio = await enviarAoCliente(
    a.cliente,
    texto,
    `Relatório — ${a.acompanhado?.apelido || a.acompanhado?.nome || "acompanhamento"}`,
    deps,
  );

  if (!envio.ok) {
    await avisarGestao(
      [
        "⚠️ <b>Relatório automático falhou</b>",
        `Atendimento <code>${escapeHtml(a.id.slice(0, 8))}</code> segue como concluído.`,
        `Erros: ${escapeHtml(envio.erros.join(" · "))}`,
        `<pre>${escapeHtml(texto)}</pre>`,
      ].join("\n"),
      deps,
    );
    await repo.registrarEvento({
      tipo: "relatorio.falhou",
      canal: "sistema",
      atendimento_id: a.id,
      cliente_id: a.cliente_id,
      payload: { motivo: "envio_falhou", erros: envio.erros },
    });
    return { ok: false, motivo: "envio_falhou", canais: [], texto };
  }

  const agora = new Date().toISOString();
  await repo.atualizarAtendimento(a.id, {
    relatorio_texto: texto,
    relatorio_enviado_em: agora,
    status: "relatado",
  });

  await repo.registrarEvento({
    tipo: "relatorio.enviado",
    canal: envio.canais.includes("whatsapp") ? "whatsapp" : "email",
    atendimento_id: a.id,
    cliente_id: a.cliente_id,
    payload: { enviado_em: agora, canais: envio.canais, automatico: true },
  });

  return { ok: true, canais: envio.canais, texto };
}
