import { createClient } from "@/lib/supabase/server";
import { calcularExtras } from "./dominio-local";
import type { StatusAtendimento, TipoAtendimento } from "@/lib/domain/types";

export type LinhaMetrica = {
  id: string;
  data: string;
  hora_prevista_inicio: string;
  tipo: TipoAtendimento;
  status: StatusAtendimento;
  duracao_prevista_min: number;
  inicio_real: string | null;
  fim_real: string | null;
  minutos_espera: number | null;
  km_rodados: number | null;
  custo_estacionamento_centavos: number | null;
  custo_pedagio_centavos: number | null;
  custo_outros_centavos: number | null;
  nivel_esforco: number | null;
  horas_debitadas: number | null;
  valor_avulso_centavos: number | null;
  valor_extras_centavos: number | null;
  cliente: { nome: string } | null;
  acompanhado: { nome: string } | null;
};

export type Resumo = {
  atendimentos: number;
  horas_previstas: number;
  horas_reais: number;
  media_espera_min: number;
  km_medio: number;
  extras_medio_centavos: number;
  receita_centavos: number;
  receita_hora_centavos: number;
  ocupacao_semanal_horas: number;
  media_esforco: number;
};

const SELECT_METRICAS =
  "id, data, hora_prevista_inicio, tipo, status, duracao_prevista_min, inicio_real, fim_real, minutos_espera, km_rodados, custo_estacionamento_centavos, custo_pedagio_centavos, custo_outros_centavos, nivel_esforco, horas_debitadas, valor_avulso_centavos, valor_extras_centavos, cliente:cliente_id(nome), acompanhado:acompanhado_id(nome)";

/** Atendimentos concluídos/relatados do período. */
export async function lerAtendimentosPeriodo(
  de: string,
  ate: string,
): Promise<LinhaMetrica[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("atendimento")
    .select(SELECT_METRICAS)
    .gte("data", de)
    .lte("data", ate)
    .in("status", ["concluido", "relatado"])
    .order("data");
  return (data ?? []) as unknown as LinhaMetrica[];
}

/** Cálculo em TypeScript — fallback quando a RPC metricas_validacao não existe. */
export function calcularResumo(
  linhas: LinhaMetrica[],
  de: string,
  ate: string,
): Resumo {
  const n = linhas.length;
  const soma = (f: (l: LinhaMetrica) => number) =>
    linhas.reduce((s, l) => s + f(l), 0);

  const horasPrevistas = soma((l) => l.duracao_prevista_min / 60);
  const horasReais = soma((l) =>
    l.inicio_real && l.fim_real
      ? Math.max(
          0,
          (new Date(l.fim_real).getTime() - new Date(l.inicio_real).getTime()) /
            3600000,
        )
      : Number(l.horas_debitadas ?? 0),
  );
  const espera = soma((l) => Number(l.minutos_espera ?? 0));
  const km = soma((l) => Number(l.km_rodados ?? 0));
  const extras = soma((l) => calcularExtras(l));
  const esforco = soma((l) => Number(l.nivel_esforco ?? 0));
  const receita = soma((l) => Number(l.valor_avulso_centavos ?? 0));

  const dias =
    Math.max(
      1,
      Math.round(
        (new Date(`${ate}T12:00:00`).getTime() -
          new Date(`${de}T12:00:00`).getTime()) /
          86400000,
      ) + 1,
    );
  const semanas = dias / 7;

  return {
    atendimentos: n,
    horas_previstas: horasPrevistas,
    horas_reais: horasReais,
    media_espera_min: n ? espera / n : 0,
    km_medio: n ? km / n : 0,
    extras_medio_centavos: n ? extras / n : 0,
    receita_centavos: receita,
    receita_hora_centavos: horasReais > 0 ? receita / horasReais : 0,
    ocupacao_semanal_horas: semanas > 0 ? horasReais / semanas : 0,
    media_esforco: n ? esforco / n : 0,
  };
}

/** Tenta a RPC do banco; se falhar, calcula em TS. */
export async function lerMetricas(
  de: string,
  ate: string,
): Promise<{ resumo: Resumo; linhas: LinhaMetrica[]; origem: "rpc" | "ts" }> {
  const linhas = await lerAtendimentosPeriodo(de, ate);
  const fallback = calcularResumo(linhas, de, ate);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("metricas_validacao", {
      p_de: de,
      p_ate: ate,
    });
    if (!error && data) {
      const bruto = (Array.isArray(data) ? data[0] : data) as Record<
        string,
        unknown
      > | null;
      if (bruto && typeof bruto === "object") {
        // A função SQL devolve jsonb; `numeric` chega como string.
        const n = (chave: string, padrao: number) => {
          const v = Number(bruto[chave]);
          return Number.isFinite(v) ? v : padrao;
        };
        const horasReais = n("horas_reais_total", fallback.horas_reais);
        const dias =
          Math.max(
            1,
            Math.round(
              (new Date(`${ate}T12:00:00`).getTime() -
                new Date(`${de}T12:00:00`).getTime()) /
                86400000,
            ) + 1,
          );
        return {
          resumo: {
            atendimentos: n("total_atendimentos", fallback.atendimentos),
            horas_previstas: n(
              "horas_previstas_total",
              fallback.horas_previstas,
            ),
            horas_reais: horasReais,
            media_espera_min: n(
              "media_minutos_espera",
              fallback.media_espera_min,
            ),
            km_medio: n("km_medio", fallback.km_medio),
            extras_medio_centavos: n(
              "custo_extra_medio_centavos",
              fallback.extras_medio_centavos,
            ),
            receita_centavos: n(
              "receita_total_centavos",
              fallback.receita_centavos,
            ),
            receita_hora_centavos: n(
              "receita_por_hora_efetiva_centavos",
              fallback.receita_hora_centavos,
            ),
            ocupacao_semanal_horas: horasReais / (dias / 7),
            media_esforco: n("nivel_esforco_medio", fallback.media_esforco),
          },
          linhas,
          origem: "rpc",
        };
      }
    }
  } catch {
    // segue com o cálculo em TS
  }

  return { resumo: fallback, linhas, origem: "ts" };
}
