/**
 * Geografia: raio de atendimento (PLANO §7.2 "Regras aplicadas automaticamente").
 * O cálculo é puro; a geocodificação fica atrás de uma interface para que os
 * testes nunca façam HTTP real.
 */

export interface Ponto {
  lat: number;
  lng: number;
}

const RAIO_TERRA_KM = 6371.0088;

const rad = (g: number) => (g * Math.PI) / 180;

/** Distância em km entre dois pontos (haversine). */
export function distanciaKm(a: Ponto, b: Ponto): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** O ponto está dentro do raio (em km) a partir da base? */
export function dentroDoRaio(base: Ponto, ponto: Ponto, raio_km: number): boolean {
  if (!Number.isFinite(raio_km) || raio_km <= 0) return false;
  return distanciaKm(base, ponto) <= raio_km;
}

/** Converte texto em coordenadas. Null quando não encontra. */
export interface Geocoder {
  geocodificar(endereco: string): Promise<Ponto | null>;
}

/** Normaliza endereço para uso como chave de mapa. */
export function chaveEndereco(endereco: string): string {
  return String(endereco ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Geocoder de testes e de desenvolvimento: mapa fixo, fallback null. */
export class FakeGeocoder implements Geocoder {
  private readonly mapa: Map<string, Ponto>;

  constructor(mapa: Record<string, Ponto> = {}) {
    this.mapa = new Map(Object.entries(mapa).map(([k, v]) => [chaveEndereco(k), v]));
  }

  async geocodificar(endereco: string): Promise<Ponto | null> {
    return this.mapa.get(chaveEndereco(endereco)) ?? null;
  }
}

/** Nominatim (OpenStreetMap) ou qualquer serviço com a mesma resposta. */
export class NominatimGeocoder implements Geocoder {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async geocodificar(endereco: string): Promise<Ponto | null> {
    const alvo = String(endereco ?? "").trim();
    if (!alvo) return null;

    const url = new URL(this.baseUrl);
    url.searchParams.set("q", alvo);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    try {
      const resposta = await this.fetchImpl(url.toString(), {
        headers: { "User-Agent": "VouContigo/2.0", Accept: "application/json" },
      });
      if (!resposta.ok) return null;
      const dados = (await resposta.json()) as Array<{ lat?: string; lon?: string }>;
      const primeiro = Array.isArray(dados) ? dados[0] : undefined;
      if (!primeiro) return null;
      const lat = Number(primeiro.lat);
      const lng = Number(primeiro.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    } catch {
      return null;
    }
  }
}

/**
 * Nominatim quando GEOCODING_URL estiver definido; senão um Fake vazio
 * (que devolve null e faz o sistema cair no comportamento manual).
 */
export function criarGeocoder(env: Record<string, string | undefined> = process.env): Geocoder {
  const url = (env.GEOCODING_URL ?? "").trim();
  if (url) return new NominatimGeocoder(url);
  return new FakeGeocoder();
}
