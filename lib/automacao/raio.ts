/**
 * Regra de raio aplicada automaticamente (PLANO §7.2). NUNCA bloqueia:
 * devolve `dentro: null` quando a base não está configurada ou o endereço não
 * geocodificou — a gestora decide com o aviso na tela.
 */

import { parseConfiguracao } from "@/lib/domain/config";
import { criarRepoSupabase, type RepoAutomacao } from "./repo";
import { criarGeocoder, distanciaKm, type Coordenada, type Geocoder } from "./_compat";

export interface ResultadoRaio {
  /** true dentro, false fora, null = não verificado. */
  dentro: boolean | null;
  distancia_km: number | null;
  raio_km: number;
  motivo?: "sem_base" | "sem_geocoder" | "endereco_nao_encontrado";
}

export interface DepsRaio {
  repo?: RepoAutomacao;
  geocoder?: Geocoder | null;
  /** Permite injetar a configuração já lida (evita segunda ida ao banco). */
  config?: Record<string, string>;
}

function lerBase(cfg: Record<string, string>): Coordenada | null {
  const lat = Number(String(cfg.lat_base ?? "").replace(",", "."));
  const lng = Number(String(cfg.lng_base ?? "").replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

export async function verificarRaio(
  enderecoDestino: string,
  deps: DepsRaio = {},
): Promise<ResultadoRaio> {
  const cfg = deps.config ?? (await (deps.repo ?? criarRepoSupabase()).lerConfig());
  const raio_km = parseConfiguracao(cfg).raio_km;

  const base = lerBase(cfg);
  if (!base) return { dentro: null, distancia_km: null, raio_km, motivo: "sem_base" };

  const geocoder = deps.geocoder === undefined ? criarGeocoder() : deps.geocoder;
  if (!geocoder) return { dentro: null, distancia_km: null, raio_km, motivo: "sem_geocoder" };

  const destino = await geocoder.geocodificar(enderecoDestino);
  if (!destino) {
    return { dentro: null, distancia_km: null, raio_km, motivo: "endereco_nao_encontrado" };
  }

  const distancia = distanciaKm(base, destino);
  return { dentro: distancia <= raio_km, distancia_km: distancia, raio_km };
}

/** Frase curta para o painel e para o bot de WhatsApp. */
export function descreverRaio(r: ResultadoRaio): string {
  if (r.dentro === null) {
    if (r.motivo === "sem_base") return "Raio não verificado: endereço-base não configurado.";
    if (r.motivo === "endereco_nao_encontrado") {
      return "Raio não verificado: não consegui localizar esse endereço.";
    }
    return "Raio não verificado.";
  }
  if (r.dentro) return `Dentro do raio (${r.distancia_km} km de ${r.raio_km} km).`;
  return `FORA do raio de atendimento: ${r.distancia_km} km (limite ${r.raio_km} km).`;
}
