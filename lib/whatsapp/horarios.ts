/**
 * Mensagem de "horários livres" — reutilizada pelo bot de WhatsApp, pelo painel
 * e pelo e-mail. Função PURA: recebe config + ocupados já lidos do banco.
 */

import type { Acompanhado, Cliente, SlotDisponivel } from "@/lib/domain/types";
import {
  calcularSlotsLivres,
  dataLocal,
  formatarSlots,
  type ConfigAgenda,
  type Ocupado,
} from "./_compat";
import { renderizar, TEXTO_SEM_HORARIOS } from "./textos";

export interface EntradaHorariosLivres {
  cliente?: Pick<Cliente, "nome"> | null;
  acompanhado?: Pick<Acompanhado, "nome" | "apelido"> | null;
  duracao_min: number;
  config: ConfigAgenda;
  ocupados: Ocupado[];
  agora: Date | string;
  /** Quantos dias à frente varrer (default 14). */
  dias?: number;
  /** Máximo de slots listados (default 8). */
  limite?: number;
  /** Templates vindos da tabela `configuracao` (opcional). */
  templates?: Record<string, string>;
}

export interface SaidaHorariosLivres {
  texto: string;
  slots: SlotDisponivel[];
}

function rotuloDuracao(min: number): string {
  const h = min / 60;
  return Number.isInteger(h) ? `${h}h` : `${Math.floor(h)}h${String(min % 60).padStart(2, "0")}`;
}

export function montarMensagemHorariosLivres(
  entrada: EntradaHorariosLivres,
): SaidaHorariosLivres {
  const slots = calcularSlotsLivres({
    de: dataLocal(entrada.agora),
    dias: entrada.dias ?? 14,
    duracao_min: entrada.duracao_min,
    config: entrada.config,
    ocupados: entrada.ocupados ?? [],
    agora: entrada.agora,
    limite: entrada.limite ?? 8,
  });

  if (slots.length === 0) return { texto: TEXTO_SEM_HORARIOS, slots };

  const texto = renderizar(entrada.templates ?? {}, "template_horarios_livres", {
    nome: entrada.cliente?.nome ?? "",
    acompanhado: entrada.acompanhado?.apelido || entrada.acompanhado?.nome || "",
    duracao: rotuloDuracao(entrada.duracao_min),
    slots: formatarSlots(slots),
  });

  return { texto, slots };
}
