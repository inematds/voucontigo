/**
 * Textos do bot de WhatsApp. Os `template_*` podem ser sobrescritos na tabela
 * `configuracao` (painel → Configurações); aqui ficam os defaults.
 */

import { renderTemplate } from "@/lib/domain/templates";

export const TEMPLATE_MENU_PADRAO = [
  "Oi, {nome}! Sou o assistente do Vou Contigo. Como posso ajudar?",
  "1. Agendar acompanhamento",
  "2. Cancelar ou remarcar",
  "3. Ver horários livres",
  "4. Meu saldo e próxima visita",
  "5. Falar com uma pessoa",
].join("\n");

export const TEMPLATE_BOAS_VINDAS_PADRAO = [
  "Oi! Aqui é o Vou Contigo — acompanhamento de idosos em consultas, exames e compromissos. 💚",
  "Ainda não encontrei seu cadastro por este número. Já avisei a nossa gestora e ela responde por aqui em instantes.",
].join("\n\n");

export const TEMPLATE_SOLICITACAO_RECEBIDA_PADRAO = [
  "Recebemos sua solicitação! 💚",
  "{acompanhado} · {tipo}",
  "{dia} às {hora}",
  "Destino: {destino}",
  "",
  "Vou confirmar com a gestora e te aviso por aqui. Se precisar mudar algo, é só mandar *menu*.",
].join("\n");

export const TEMPLATE_CANCELAMENTO_CONFIRMADO_PADRAO = [
  "Cancelamento confirmado: {acompanhado} · {tipo}, {dia} às {hora}.",
  "{aviso_taxa}",
  "Qualquer coisa, estou por aqui. 💚",
].join("\n");

export const TEMPLATE_HORARIOS_LIVRES_PADRAO = [
  "Estes são os próximos horários livres para *{duracao}*:",
  "",
  "{slots}",
  "",
  "Responda o número para agendar.",
].join("\n");

export const TEXTO_HUMANO =
  "Vou chamar a gestora, já te respondemos por aqui.";

export const TEXTO_SEM_HORARIOS =
  "Não encontrei horários livres nos próximos dias. Vou pedir para a gestora falar com você.";

export const TEXTO_NAO_ENTENDI =
  "Não entendi. Responda com o número da opção, ou mande *menu* para recomeçar.";

/** Chaves de `configuracao` que este módulo consome. */
export const CHAVES_TEMPLATE = [
  "template_menu",
  "template_boas_vindas",
  "template_solicitacao_recebida",
  "template_cancelamento_confirmado",
  "template_horarios_livres",
] as const;

const PADROES: Record<string, string> = {
  template_menu: TEMPLATE_MENU_PADRAO,
  template_boas_vindas: TEMPLATE_BOAS_VINDAS_PADRAO,
  template_solicitacao_recebida: TEMPLATE_SOLICITACAO_RECEBIDA_PADRAO,
  template_cancelamento_confirmado: TEMPLATE_CANCELAMENTO_CONFIRMADO_PADRAO,
  template_horarios_livres: TEMPLATE_HORARIOS_LIVRES_PADRAO,
};

/** Renderiza um template da configuração, caindo no default quando ausente/vazio. */
export function renderizar(
  templates: Record<string, string>,
  chave: keyof typeof PADROES | string,
  vars: Record<string, string | number | null | undefined>,
): string {
  const bruto = templates?.[chave];
  const modelo = bruto && bruto.trim() !== "" ? bruto : (PADROES[chave] ?? "");
  return renderTemplate(modelo, vars).trim();
}

/** Monta o texto do menu principal. */
export function montarMenu(templates: Record<string, string>, nome: string): string {
  return renderizar(templates, "template_menu", { nome: nome || "tudo bem" });
}

/** Lista numerada genérica: ["a","b"] → "1. a\n2. b". */
export function listaNumerada(itens: string[]): string {
  return itens.map((t, i) => `${i + 1}. ${t}`).join("\n");
}

/** Interpreta a resposta do usuário como índice de uma lista numerada (1-based). */
export function escolhaNumerica(texto: string, total: number): number | null {
  const n = Number((texto ?? "").trim().replace(/[).\s]/g, ""));
  if (!Number.isInteger(n) || n < 1 || n > total) return null;
  return n;
}

const VOLTAR = new Set(["menu", "0", "voltar", "inicio", "início", "oi", "olá", "ola"]);

/** true quando o texto pede o menu principal. */
export function pediuMenu(texto: string): boolean {
  return VOLTAR.has((texto ?? "").trim().toLowerCase().replace(/[!.?]+$/, ""));
}
