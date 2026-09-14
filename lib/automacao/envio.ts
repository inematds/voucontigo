/**
 * Camada de envio ao CLIENTE (família): WhatsApp sempre, e-mail quando houver.
 * Nenhuma regra de negócio aqui — só transporte, HTML simples e o resultado
 * agregado que os módulos de automação registram em `evento`.
 */

import { criarWhatsAppClient, type WhatsAppClient } from "@/lib/whatsapp/cliente";
import { criarEmailClient, type EmailClient } from "@/lib/email/cliente";
import { notificarGestao } from "@/lib/telegram/notificacoes";
import type { ClienteMin } from "./repo";

export interface DepsEnvio {
  wa?: WhatsAppClient;
  email?: EmailClient;
  notificar?: (texto: string) => Promise<boolean>;
}

export interface ResultadoEnvioCliente {
  ok: boolean;
  canais: ("whatsapp" | "email")[];
  erros: string[];
}

export function escapeHtml(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Texto de WhatsApp (`*negrito*`, quebras de linha) → HTML simples de e-mail. */
export function textoParaHtml(texto: string, titulo = "Vou Contigo"): string {
  const corpo = escapeHtml(texto)
    .replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>")
    .split("\n")
    .map((linha) => (linha.trim() === "" ? "<br>" : `<p style="margin:0 0 8px">${linha}</p>`))
    .join("\n");
  return [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#2f3a34;max-width:560px">`,
    `<h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(titulo)}</h2>`,
    corpo,
    `</div>`,
  ].join("\n");
}

/** Envia o mesmo texto por WhatsApp e, se o cliente tiver e-mail, por e-mail. */
export async function enviarAoCliente(
  cliente: Pick<ClienteMin, "nome" | "whatsapp" | "email"> | null,
  texto: string,
  assunto: string,
  deps: DepsEnvio = {},
): Promise<ResultadoEnvioCliente> {
  const canais: ("whatsapp" | "email")[] = [];
  const erros: string[] = [];

  if (!cliente) return { ok: false, canais, erros: ["cliente_ausente"] };
  if (!texto.trim()) return { ok: false, canais, erros: ["texto_vazio"] };

  const numero = (cliente.whatsapp ?? "").replace(/\D/g, "");
  if (numero) {
    try {
      const wa = deps.wa ?? criarWhatsAppClient();
      const r = await wa.enviarTexto(numero, texto);
      if (r.ok) canais.push("whatsapp");
      else erros.push(`whatsapp: ${r.erro ?? "falhou"}`);
    } catch (e) {
      erros.push(`whatsapp: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    erros.push("whatsapp: número ausente");
  }

  if (cliente.email) {
    try {
      const mail = deps.email ?? criarEmailClient();
      const r = await mail.enviar(cliente.email, assunto, textoParaHtml(texto, assunto), texto);
      if (r.ok) canais.push("email");
      else erros.push(`email: ${r.erro ?? "falhou"}`);
    } catch (e) {
      erros.push(`email: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { ok: canais.length > 0, canais, erros };
}

/** Avisa a gestão no Telegram sem nunca derrubar o fluxo do chamador. */
export async function avisarGestao(texto: string, deps: DepsEnvio = {}): Promise<boolean> {
  try {
    return await (deps.notificar ?? notificarGestao)(texto);
  } catch {
    return false;
  }
}
