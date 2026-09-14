/**
 * Mensagem de horários livres — stub LOCAL do portal enquanto
 * lib/whatsapp/horarios.ts (agente B) não existe. Função PURA.
 */

import type { SlotDisponivel } from "@/lib/domain/types";
import { formatarSlots } from "./agendamento";

export function montarMensagemHorariosLivres(
  slots: readonly SlotDisponivel[],
  duracaoMin: number,
  nomeCliente?: string | null,
): string {
  const ola = nomeCliente ? `Oi, ${nomeCliente.split(" ")[0]}! ` : "Oi! ";
  return (
    `${ola}Aqui vão os horários livres do Vou Contigo.\n\n` +
    `${formatarSlots(slots, duracaoMin)}\n\n` +
    "Para reservar, responda com o dia e o horário — ou peça pelo portal, em /minha-conta."
  );
}

/** Versão HTML simples para e-mail. */
export function mensagemParaHtml(texto: string): string {
  const escapado = texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return (
    `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#3b3529;line-height:1.6">` +
    escapado.replace(/\n/g, "<br />") +
    `</div>`
  );
}
