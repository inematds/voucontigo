/**
 * Stubs mínimos para módulos que outros agentes escrevem em paralelo
 * (`lib/domain/geo.ts` — agente A; `lib/whatsapp/horarios.ts` — agente B).
 *
 * São implementações autocontidas e SEM HTTP por padrão: assim `lib/automacao`
 * compila, roda e é testável antes daqueles arquivos existirem. Quando eles
 * entrarem, basta trocar os imports em `raio.ts` / `lembretes.ts`.
 */

import { TIPO_ATENDIMENTO_LABEL, type TipoAtendimento } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Geo (espelha a assinatura combinada com o agente A)
// ---------------------------------------------------------------------------

import {
  distanciaKm as distanciaKmDominio,
  dentroDoRaio as dentroDoRaioDominio,
  FakeGeocoder as FakeGeocoderDominio,
  NominatimGeocoder as NominatimGeocoderDominio,
  type Geocoder as GeocoderDominio,
  type Ponto,
} from "@/lib/domain/geo";

export type Coordenada = Ponto;
export type Geocoder = GeocoderDominio;
export const distanciaKm = distanciaKmDominio;
export const dentroDoRaio = dentroDoRaioDominio;
export const FakeGeocoder = FakeGeocoderDominio;
export const NominatimGeocoder = NominatimGeocoderDominio;

/**
 * Geocoder configurado por env (lib/domain/geo). Sem provedor → `null`: o raio fica
 * "não verificado" em vez de bloquear. Aceita GEOCODER_PROVIDER=nominatim ou GEOCODING_URL.
 */
export function criarGeocoder(): Geocoder | null {
  const provider = (process.env.GEOCODER_PROVIDER ?? "").toLowerCase();
  const url = (process.env.GEOCODING_URL ?? "").trim();
  if (provider === "nominatim" || url) {
    return new NominatimGeocoderDominio(url || "https://nominatim.openstreetmap.org/search");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Horários livres (espelha `lib/whatsapp/horarios.ts` — agente B)
// ---------------------------------------------------------------------------

export interface SlotLivre {
  data: string; // 'YYYY-MM-DD'
  hora: string; // 'HH:MM'
}

/** Texto amigável com os horários livres da semana. */
export function montarMensagemHorariosLivres(
  nomeCliente: string,
  slots: SlotLivre[],
): string {
  if (slots.length === 0) {
    return `Oi, ${nomeCliente}! Esta semana a agenda está cheia. Me avise que eu procuro um encaixe. 💚`;
  }
  const porDia = new Map<string, string[]>();
  for (const s of slots) {
    const lista = porDia.get(s.data) ?? [];
    lista.push(s.hora);
    porDia.set(s.data, lista);
  }
  const linhas = [...porDia.entries()].map(([data, horas]) => {
    const [a, m, d] = data.split("-");
    void a;
    return `• ${d}/${m}: ${horas.join(", ")}`;
  });
  return [
    `Oi, ${nomeCliente}! Estes são os horários livres da semana:`,
    ...linhas,
    "É só responder com o dia e a hora que eu já reservo. 💚",
  ].join("\n");
}

/** Rótulo do tipo de atendimento (usado nas mensagens automáticas). */
export function rotuloTipo(tipo: string): string {
  return TIPO_ATENDIMENTO_LABEL[tipo as TipoAtendimento] ?? tipo;
}
