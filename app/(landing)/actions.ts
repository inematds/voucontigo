"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificarGestao } from "@/lib/notify/telegram";

export type EstadoSolicitacao = {
  ok: boolean;
  mensagem: string | null;
  erros: Partial<Record<"nome" | "whatsapp" | "precisa", string>>;
};

/** Escapa texto do usuário antes de mandar com parse_mode HTML no Telegram. */
function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Normaliza o WhatsApp para E.164 sem '+' (padrão do domínio: 5551999998888). */
function normalizarWhatsapp(bruto: string): string {
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos;
}

const esquema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Conte o seu nome.")
    .max(120, "Nome muito longo."),
  whatsapp: z
    .string()
    .trim()
    .min(1, "Informe um WhatsApp com DDD.")
    .transform(normalizarWhatsapp)
    .refine(
      (valor) => valor.length >= 12 && valor.length <= 15,
      "Informe um WhatsApp válido com DDD.",
    ),
  precisa: z
    .string()
    .trim()
    .max(1000, "Mensagem muito longa.")
    .optional()
    .transform((valor) => (valor && valor.length > 0 ? valor : null)),
});

export async function solicitarContato(
  _estadoAnterior: EstadoSolicitacao,
  formData: FormData,
): Promise<EstadoSolicitacao> {
  const resultado = esquema.safeParse({
    nome: formData.get("nome") ?? "",
    whatsapp: formData.get("whatsapp") ?? "",
    precisa: formData.get("precisa") ?? "",
  });

  if (!resultado.success) {
    const erros: EstadoSolicitacao["erros"] = {};
    for (const issue of resultado.error.issues) {
      const campo = issue.path[0];
      if (campo === "nome" || campo === "whatsapp" || campo === "precisa") {
        erros[campo] ??= issue.message;
      }
    }
    return { ok: false, mensagem: null, erros };
  }

  const { nome, whatsapp, precisa } = resultado.data;

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return {
      ok: false,
      mensagem:
        "Não conseguimos registrar agora. Fale com a gente direto no WhatsApp que respondemos na hora.",
      erros: {},
    };
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("lead").insert({
      nome,
      whatsapp,
      mensagem: precisa,
      origem: "landing",
      status: "novo",
    });

    if (error) {
      return {
        ok: false,
        mensagem:
          "Algo deu errado ao enviar. Tente de novo ou fale com a gente no WhatsApp.",
        erros: {},
      };
    }
  } catch {
    return {
      ok: false,
      mensagem:
        "Algo deu errado ao enviar. Tente de novo ou fale com a gente no WhatsApp.",
      erros: {},
    };
  }

  await notificarGestao(
    [
      "🌱 <b>Novo lead pela landing</b>",
      `👤 ${escaparHtml(nome)}`,
      `📱 https://wa.me/${whatsapp}`,
      precisa ? `📝 ${escaparHtml(precisa)}` : "📝 (sem mensagem)",
    ].join("\n"),
  );

  return {
    ok: true,
    mensagem:
      "Recebemos o seu pedido! Vamos te chamar no WhatsApp em breve. 💚",
    erros: {},
  };
}
