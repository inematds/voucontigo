import { describe, expect, it } from "vitest";
import {
  FakeGeocoder,
  NominatimGeocoder,
  criarGeocoder,
  dentroDoRaio,
  distanciaKm,
  type Ponto,
} from "./geo";

const PORTO_ALEGRE: Ponto = { lat: -30.0346, lng: -51.2177 };
const CANOAS: Ponto = { lat: -29.9178, lng: -51.1836 };
const SAO_PAULO: Ponto = { lat: -23.5505, lng: -46.6333 };

describe("distanciaKm", () => {
  it("é zero para o mesmo ponto", () => {
    expect(distanciaKm(PORTO_ALEGRE, PORTO_ALEGRE)).toBe(0);
  });
  it("Porto Alegre → Canoas ≈ 13,5 km", () => {
    expect(distanciaKm(PORTO_ALEGRE, CANOAS)).toBeCloseTo(13.5, 0);
  });
  it("Porto Alegre → São Paulo ≈ 850 km", () => {
    expect(distanciaKm(PORTO_ALEGRE, SAO_PAULO)).toBeGreaterThan(830);
    expect(distanciaKm(PORTO_ALEGRE, SAO_PAULO)).toBeLessThan(870);
  });
  it("é simétrica", () => {
    expect(distanciaKm(CANOAS, PORTO_ALEGRE)).toBeCloseTo(distanciaKm(PORTO_ALEGRE, CANOAS), 9);
  });
});

describe("dentroDoRaio", () => {
  it("aceita dentro e recusa fora", () => {
    expect(dentroDoRaio(PORTO_ALEGRE, CANOAS, 20)).toBe(true);
    expect(dentroDoRaio(PORTO_ALEGRE, CANOAS, 10)).toBe(false);
    expect(dentroDoRaio(PORTO_ALEGRE, SAO_PAULO, 20)).toBe(false);
  });
  it("raio inválido nunca aceita", () => {
    expect(dentroDoRaio(PORTO_ALEGRE, PORTO_ALEGRE, 0)).toBe(false);
    expect(dentroDoRaio(PORTO_ALEGRE, PORTO_ALEGRE, Number.NaN)).toBe(false);
  });
});

describe("FakeGeocoder", () => {
  const geo = new FakeGeocoder({ "Av. Ipiranga, 100 - Porto Alegre": PORTO_ALEGRE });

  it("acha ignorando caixa e acento", async () => {
    await expect(geo.geocodificar("av. ipiranga, 100 - porto alegre")).resolves.toEqual(
      PORTO_ALEGRE,
    );
  });
  it("devolve null no fallback", async () => {
    await expect(geo.geocodificar("Rua que não existe")).resolves.toBeNull();
  });
});

describe("NominatimGeocoder (fetch injetado, sem HTTP real)", () => {
  it("manda o User-Agent e converte lat/lon", async () => {
    let urlChamada = "";
    let headers: Record<string, string> = {};
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      urlChamada = String(url);
      headers = (init?.headers ?? {}) as Record<string, string>;
      return {
        ok: true,
        json: async () => [{ lat: "-30.0346", lon: "-51.2177" }],
      };
    }) as unknown as typeof fetch;

    const geo = new NominatimGeocoder("https://nominatim.example/search", fakeFetch);
    await expect(geo.geocodificar("Av. Ipiranga, 100")).resolves.toEqual(PORTO_ALEGRE);
    expect(headers["User-Agent"]).toBe("VouContigo/2.0");
    expect(urlChamada).toContain("format=json");
    expect(urlChamada).toContain("limit=1");
  });

  it("null em resposta vazia, erro HTTP ou exceção de rede", async () => {
    const vazio = new NominatimGeocoder(
      "https://n.example/search",
      (async () => ({ ok: true, json: async () => [] })) as unknown as typeof fetch,
    );
    await expect(vazio.geocodificar("x")).resolves.toBeNull();

    const ruim = new NominatimGeocoder(
      "https://n.example/search",
      (async () => ({ ok: false, json: async () => [] })) as unknown as typeof fetch,
    );
    await expect(ruim.geocodificar("x")).resolves.toBeNull();

    const caiu = new NominatimGeocoder(
      "https://n.example/search",
      (async () => {
        throw new Error("rede fora");
      }) as unknown as typeof fetch,
    );
    await expect(caiu.geocodificar("x")).resolves.toBeNull();
  });

  it("endereço vazio não chama a rede", async () => {
    let chamou = false;
    const geo = new NominatimGeocoder(
      "https://n.example/search",
      (async () => {
        chamou = true;
        return { ok: true, json: async () => [] };
      }) as unknown as typeof fetch,
    );
    await expect(geo.geocodificar("   ")).resolves.toBeNull();
    expect(chamou).toBe(false);
  });
});

describe("criarGeocoder", () => {
  it("Fake quando não há GEOCODING_URL", () => {
    expect(criarGeocoder({})).toBeInstanceOf(FakeGeocoder);
    expect(criarGeocoder({ GEOCODING_URL: "  " })).toBeInstanceOf(FakeGeocoder);
  });
  it("Nominatim quando há GEOCODING_URL", () => {
    expect(criarGeocoder({ GEOCODING_URL: "https://n.example/search" })).toBeInstanceOf(
      NominatimGeocoder,
    );
  });
});
