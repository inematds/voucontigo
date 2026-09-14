/**
 * Templates de WhatsApp (PLANO §6.2) — substituição de placeholders `{chave}`
 * e montagem do relatório pós-atendimento. Funções puras.
 */

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

import type { Acompanhado, Atendimento, Cliente, ISODateTime, Pacote } from "./types";
import { TIPO_ATENDIMENTO_LABEL } from "./types";
import { calcularExtras, horasRestantes } from "./horas";

export type VariaveisTemplate = Record<string, string | number | null | undefined>;

/** Placeholder não preenchido fica visível para a gestora corrigir antes de enviar. */
const NAO_PREENCHIDO = (chave: string) => `{${chave}}`;

/** Substitui `{chave}` pelo valor correspondente. Chaves ausentes ficam como estão. */
export function renderTemplate(template: string, vars: VariaveisTemplate): string {
  if (!template) return "";
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_todo, chave: string) => {
    const valor = vars[chave];
    if (valor === null || valor === undefined || valor === "") return NAO_PREENCHIDO(chave);
    return String(valor);
  });
}

/** Lista as chaves `{...}` usadas por um template. */
export function chavesDoTemplate(template: string): string[] {
  const achadas = new Set<string>();
  for (const m of (template ?? "").matchAll(/\{([a-zA-Z0-9_]+)\}/g)) achadas.add(m[1]);
  return [...achadas];
}

function paraDate(v: ISODateTime | Date | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = typeof v === "string" && v.length === 10 ? parseISO(v) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "quinta-feira, 18 de setembro" */
export function formatarDiaExtenso(valor: ISODateTime | Date | null | undefined): string {
  const d = paraDate(valor);
  return d ? format(d, "EEEE, dd 'de' MMMM", { locale: ptBR }) : "";
}

/** "18/09/2026" */
export function formatarData(valor: ISODateTime | Date | null | undefined): string {
  const d = paraDate(valor);
  return d ? format(d, "dd/MM/yyyy", { locale: ptBR }) : "";
}

/** "14:30" */
export function formatarHora(valor: ISODateTime | Date | null | undefined): string {
  const d = paraDate(valor);
  return d ? format(d, "HH:mm", { locale: ptBR }) : "";
}

/** "R$ 1.180,00" */
export function formatarReais(centavos: number | null | undefined): string {
  const v = (centavos ?? 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "2h" / "2h30" */
export function formatarHoras(horas: number | null | undefined): string {
  const h = horas ?? 0;
  const inteiras = Math.floor(h);
  const minutos = Math.round((h - inteiras) * 60);
  return minutos === 0 ? `${inteiras}h` : `${inteiras}h${String(minutos).padStart(2, "0")}`;
}

/** Descrição dos extras para o relatório: "estacionamento R$ 12,00 · pedágio R$ 8,00". */
export function descreverExtras(atendimento: Parameters<typeof calcularExtras>[0]): string {
  const e = calcularExtras(atendimento);
  if (e.vazio) return "nenhum";
  const partes: string[] = [];
  if (e.estacionamento_centavos > 0) partes.push(`estacionamento ${formatarReais(e.estacionamento_centavos)}`);
  if (e.pedagio_centavos > 0) partes.push(`pedágio ${formatarReais(e.pedagio_centavos)}`);
  if (e.outros_centavos > 0) partes.push(`outros ${formatarReais(e.outros_centavos)}`);
  return `${partes.join(" · ")} (total ${formatarReais(e.total_centavos)})`;
}

/** Variáveis padrão disponíveis a qualquer template de atendimento. */
export function variaveisAtendimento(
  atendimento: Atendimento,
  acompanhado: Pick<Acompanhado, "nome" | "apelido">,
  cliente: Pick<Cliente, "nome">,
  pacote: Pick<Pacote, "horas_contratadas" | "horas_usadas"> | null,
): VariaveisTemplate {
  const saldo = pacote ? horasRestantes(pacote.horas_contratadas, pacote.horas_usadas) : null;
  return {
    nome: cliente.nome,
    acompanhado: acompanhado.apelido || acompanhado.nome,
    tipo: TIPO_ATENDIMENTO_LABEL[atendimento.tipo] ?? atendimento.tipo,
    destino: atendimento.endereco_destino,
    saida: atendimento.endereco_saida,
    dia: formatarDiaExtenso(atendimento.data),
    data: formatarData(atendimento.data),
    hora: atendimento.hora_prevista_inicio?.slice(0, 5) ?? "",
    inicio_real: formatarHora(atendimento.inicio_real),
    fim_real: formatarHora(atendimento.fim_real),
    relatorio_texto: atendimento.relatorio_texto,
    extras: descreverExtras(atendimento),
    // o template §6.2 já escreve o "h" depois: "Saldo do pacote: {horas_restantes}h"
    horas_restantes: saldo === null ? null : saldo.toLocaleString("pt-BR"),
    horas_debitadas: atendimento.horas_debitadas ?? null,
    minutos_espera: atendimento.minutos_espera ?? 0,
    km_rodados: atendimento.km_rodados ?? 0,
  };
}

/**
 * Monta o texto do relatório pós-atendimento (PLANO §6.2).
 * `template` é o valor da configuração `template_relatorio`; quando ausente,
 * usa o modelo padrão embutido.
 */
export const TEMPLATE_RELATORIO_PADRAO = [
  "*Relatório — {acompanhado} · {dia}*",
  "✅ {tipo} em {destino}",
  "⏰ Saímos {inicio_real} e voltamos {fim_real}",
  "🗒️ {relatorio_texto}",
  "💰 Extras: {extras}",
  "⏳ Saldo do pacote: {horas_restantes}h",
  "Qualquer dúvida, estou por aqui. 💚",
].join("\n");

export function montarRelatorio(
  atendimento: Atendimento,
  acompanhado: Pick<Acompanhado, "nome" | "apelido">,
  cliente: Pick<Cliente, "nome">,
  pacote: Pick<Pacote, "horas_contratadas" | "horas_usadas"> | null,
  template: string = TEMPLATE_RELATORIO_PADRAO,
): string {
  const modelo = template && template.trim() !== "" ? template : TEMPLATE_RELATORIO_PADRAO;
  const vars = variaveisAtendimento(atendimento, acompanhado, cliente, pacote);

  let texto = renderTemplate(modelo, vars);

  // Sem pacote não existe saldo: remove a linha inteira em vez de deixar "{horas_restantes}h".
  if (!pacote) {
    texto = texto
      .split("\n")
      .filter((linha) => !linha.includes("{horas_restantes}"))
      .join("\n");
  }
  return texto.trim();
}
