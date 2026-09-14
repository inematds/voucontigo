/**
 * Parsers puros dos comandos do bot. Sem I/O — testáveis isoladamente.
 */
import { z } from "zod";
import type { TipoAtendimento } from "@/lib/domain/types";
import { parseCentavos, dataSP } from "./_local";

export type Resultado<T> =
  | { ok: true; valor: T }
  | { ok: false; erro: string };

const TIPOS: TipoAtendimento[] = [
  "consulta",
  "exame",
  "fisioterapia",
  "mercado",
  "farmacia",
  "banco",
  "passeio",
  "outro",
];

/** Aceita acento e variações: "farmácia" → "farmacia". */
function normalizarTipo(bruto: string): TipoAtendimento | null {
  const t = bruto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if ((TIPOS as string[]).includes(t)) return t as TipoAtendimento;
  const apelidos: Record<string, TipoAtendimento> = {
    medico: "consulta",
    "consulta medica": "consulta",
    fisio: "fisioterapia",
    supermercado: "mercado",
    compras: "mercado",
  };
  return apelidos[t] ?? null;
}

// ---------------------------------------------------------------------------
// /agendar <cliente> | <acompanhado> | <tipo> | <dd/mm> <hh:mm> | <dur min> | <destino>
// ---------------------------------------------------------------------------

export interface AgendarParsed {
  cliente: string;
  acompanhado: string;
  tipo: TipoAtendimento;
  data: string; // 'YYYY-MM-DD'
  hora: string; // 'HH:MM'
  duracao_min: number;
  destino: string;
}

/**
 * `hoje` permite testar sem depender do relógio. Ano ausente no dd/mm:
 * usa o ano corrente; se a data já passou, joga para o ano seguinte.
 */
export function parseAgendar(
  texto: string,
  hoje: string = dataSP(),
): Resultado<AgendarParsed> {
  const corpo = texto.replace(/^\/agendar(@\w+)?\s*/i, "").trim();
  if (!corpo) {
    return {
      ok: false,
      erro:
        "Formato: /agendar cliente | acompanhado | tipo | dd/mm hh:mm | duração min | destino",
    };
  }

  const partes = corpo.split("|").map((p) => p.trim());
  if (partes.length !== 6) {
    return {
      ok: false,
      erro: `Esperava 6 campos separados por "|", recebi ${partes.length}.\nFormato: /agendar cliente | acompanhado | tipo | dd/mm hh:mm | duração min | destino`,
    };
  }

  const [cliente, acompanhado, tipoBruto, quando, duracaoBruta, destino] =
    partes;

  if (!cliente) return { ok: false, erro: "Cliente vazio." };
  if (!acompanhado) return { ok: false, erro: "Acompanhado vazio." };
  if (!destino) return { ok: false, erro: "Destino vazio." };

  const tipo = normalizarTipo(tipoBruto);
  if (!tipo) {
    return { ok: false, erro: `Tipo inválido. Use: ${TIPOS.join(", ")}.` };
  }

  const m = quando.match(
    /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(\d{1,2}):(\d{2})$/,
  );
  if (!m) {
    return { ok: false, erro: 'Data/hora inválida. Use "dd/mm hh:mm".' };
  }
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    return { ok: false, erro: "Data inválida." };
  }
  if (hh > 23 || mm > 59) {
    return { ok: false, erro: "Hora inválida." };
  }

  const anoHoje = Number(hoje.slice(0, 4));
  let ano: number;
  if (m[3]) {
    ano = Number(m[3]);
    if (ano < 100) ano += 2000;
  } else {
    ano = anoHoje;
  }
  let data = `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  if (!m[3] && data < hoje) {
    data = `${ano + 1}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }

  // valida existência real do dia (31/02 etc.)
  const check = new Date(`${data}T00:00:00Z`);
  if (
    Number.isNaN(check.getTime()) ||
    check.getUTCDate() !== dia ||
    check.getUTCMonth() + 1 !== mes
  ) {
    return { ok: false, erro: "Data inexistente no calendário." };
  }

  const duracao = Number(duracaoBruta.replace(/\s*min\w*/i, "").trim());
  if (!Number.isInteger(duracao) || duracao < 15 || duracao > 12 * 60) {
    return {
      ok: false,
      erro: "Duração deve ser um número inteiro de minutos entre 15 e 720.",
    };
  }

  return {
    ok: true,
    valor: {
      cliente,
      acompanhado,
      tipo,
      data,
      hora: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
      duracao_min: duracao,
      destino,
    },
  };
}

// ---------------------------------------------------------------------------
// /finalizar <id> espera=<min> km=<n> estac=<R$> pedagio=<R$> outros=<R$>
//            esforco=<1-5> [obs...]
// ---------------------------------------------------------------------------

const finalizarSchema = z.object({
  id_curto: z
    .string()
    .min(4, "Id curto precisa de pelo menos 4 caracteres.")
    .regex(/^[0-9a-f-]+$/i, "Id curto inválido."),
  minutos_espera: z.number().int().min(0).max(600),
  km_rodados: z.number().min(0).max(2000),
  custo_estacionamento_centavos: z.number().int().min(0),
  custo_pedagio_centavos: z.number().int().min(0),
  custo_outros_centavos: z.number().int().min(0),
  nivel_esforco: z.number().int().min(1).max(5),
  observacoes_internas: z.string().nullable(),
});

export type FinalizarParsed = z.infer<typeof finalizarSchema>;

const ALIAS_CAMPO: Record<string, string> = {
  espera: "espera",
  km: "km",
  estac: "estac",
  estacionamento: "estac",
  pedagio: "pedagio",
  outros: "outros",
  esforco: "esforco",
};

export const FORMATO_FINALIZAR =
  "/finalizar <id> espera=<min> km=<n> estac=<R$> pedagio=<R$> outros=<R$> esforco=<1-5> [obs]";

export function parseFinalizar(texto: string): Resultado<FinalizarParsed> {
  const corpo = texto.replace(/^\/finalizar(@\w+)?\s*/i, "").trim();
  const tokens = corpo.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { ok: false, erro: `Formato: ${FORMATO_FINALIZAR}` };
  }

  const idCurto = tokens.shift()!;
  const campos: Record<string, string> = {};
  const obs: string[] = [];

  for (const token of tokens) {
    const m = token.match(/^([a-zA-Zçã]+)=(.*)$/);
    const chave = m
      ? ALIAS_CAMPO[
          m[1]
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
        ]
      : undefined;
    if (m && chave && obs.length === 0) {
      campos[chave] = m[2];
    } else {
      obs.push(token);
    }
  }

  const faltando = ["espera", "km", "estac", "pedagio", "outros", "esforco"].filter(
    (c) => campos[c] === undefined,
  );
  if (faltando.length > 0) {
    return {
      ok: false,
      erro: `Faltam campos obrigatórios: ${faltando.join(", ")}.\nFormato: ${FORMATO_FINALIZAR}`,
    };
  }

  const numero = (v: string) => Number(v.replace(",", "."));
  const estac = parseCentavos(campos.estac);
  const pedagio = parseCentavos(campos.pedagio);
  const outros = parseCentavos(campos.outros);
  if (estac === null || pedagio === null || outros === null) {
    return { ok: false, erro: "Valores de custo inválidos (use 0 ou 12,50)." };
  }

  const bruto = {
    id_curto: idCurto,
    minutos_espera: numero(campos.espera),
    km_rodados: numero(campos.km),
    custo_estacionamento_centavos: estac,
    custo_pedagio_centavos: pedagio,
    custo_outros_centavos: outros,
    nivel_esforco: numero(campos.esforco),
    observacoes_internas: obs.length > 0 ? obs.join(" ") : null,
  };

  const r = finalizarSchema.safeParse(bruto);
  if (!r.success) {
    const msg = r.error.issues
      .map((i) => `${i.path.join(".") || "campo"}: ${i.message}`)
      .join("; ");
    return { ok: false, erro: `Dados inválidos — ${msg}` };
  }
  return { ok: true, valor: r.data };
}

// ---------------------------------------------------------------------------
// /cancelar <id> [motivo] · /iniciar <id> · /relatorio <id> [enviado]
// ---------------------------------------------------------------------------

export function parseIdEResto(
  texto: string,
  comando: string,
): Resultado<{ id_curto: string; resto: string | null }> {
  const corpo = texto
    .replace(new RegExp(`^/${comando}(@\\w+)?\\s*`, "i"), "")
    .trim();
  const tokens = corpo.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { ok: false, erro: `Informe o id curto. Ex.: /${comando} a1b2c3d4` };
  }
  const id = tokens.shift()!;
  if (!/^[0-9a-f-]{4,}$/i.test(id)) {
    return { ok: false, erro: "Id curto inválido (use os 8 primeiros caracteres)." };
  }
  return {
    ok: true,
    valor: { id_curto: id, resto: tokens.length ? tokens.join(" ") : null },
  };
}
