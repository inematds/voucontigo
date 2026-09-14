/**
 * Leituras do portal do familiar. TUDO com o cliente de sessão (respeita as
 * policies de SELECT do familiar: auth.uid() = cliente.auth_user_id).
 * O admin client entra só onde a RLS do familiar não permite (vincular, eventos).
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseConfiguracao, paraMapa, lerNumero, lerTexto } from "@/lib/domain/config";
import type {
  Acompanhado,
  Atendimento,
  Cliente,
  Pacote,
  Pagamento,
  Plano,
  StatusAtendimento,
} from "@/lib/domain/types";
import { hojeISO, instanteDe, minutosAgoraSP } from "./datas";
import { JANELA_PADRAO, type JanelaAgenda, type Ocupado, minutosDe } from "./agendamento";

export const STATUS_FUTUROS: StatusAtendimento[] = [
  "solicitado",
  "agendado",
  "confirmado",
  "em_andamento",
];

export const STATUS_CANCELAVEIS: StatusAtendimento[] = [
  "solicitado",
  "agendado",
  "confirmado",
];

export interface ContextoFamiliar {
  cliente: Pick<Cliente, "id" | "nome" | "email" | "whatsapp">;
  userId: string;
  userEmail: string | null;
}

/** Garante sessão + cliente vinculado. Sem sessão → /entrar; sem cliente → /entrar/sem-cadastro. */
export async function exigirFamiliar(): Promise<ContextoFamiliar> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");

  const { data } = await supabase
    .from("cliente")
    .select("id, nome, email, whatsapp")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!data) redirect("/entrar/sem-cadastro");

  return {
    cliente: data as ContextoFamiliar["cliente"],
    userId: user.id,
    userEmail: user.email ?? null,
  };
}

/** Configuração visível ao familiar (policy parcial) + defaults do domínio. */
export async function lerConfiguracao() {
  const supabase = await createClient();
  const { data } = await supabase.from("configuracao").select("chave, valor");
  const linhas = (data ?? []) as { chave: string; valor: string }[];
  return { config: parseConfiguracao(linhas), mapa: paraMapa(linhas) };
}

/** Janela de agenda a partir das chaves v2 (com defaults seguros). */
export function janelaDaConfig(mapa: Record<string, string>): JanelaAgenda {
  const dias = lerTexto(mapa.dias_semana, JANELA_PADRAO.dias_semana.join(","))
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return {
    horario_inicio: lerTexto(mapa.horario_inicio, JANELA_PADRAO.horario_inicio).slice(0, 5),
    horario_fim: lerTexto(mapa.horario_fim, JANELA_PADRAO.horario_fim).slice(0, 5),
    dias_semana: dias.length ? dias : JANELA_PADRAO.dias_semana,
    intervalo_entre_atendimentos_min: Math.max(
      0,
      lerNumero(mapa.intervalo_entre_atendimentos_min, JANELA_PADRAO.intervalo_entre_atendimentos_min),
    ),
    slot_min: Math.max(5, lerNumero(mapa.slot_min, JANELA_PADRAO.slot_min)),
  };
}

export type AtendimentoPortal = Pick<
  Atendimento,
  | "id"
  | "tipo"
  | "descricao"
  | "data"
  | "hora_prevista_inicio"
  | "duracao_prevista_min"
  | "status"
  | "endereco_destino"
  | "endereco_saida"
  | "acompanhado_id"
  | "pacote_id"
  | "relatorio_texto"
  | "relatorio_enviado_em"
  | "motivo_cancelamento"
>;

const CAMPOS_ATENDIMENTO =
  "id, tipo, descricao, data, hora_prevista_inicio, duracao_prevista_min, status," +
  " endereco_destino, endereco_saida, acompanhado_id, pacote_id, relatorio_texto," +
  " relatorio_enviado_em, motivo_cancelamento";

export async function listarProximosAtendimentos(clienteId: string): Promise<AtendimentoPortal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("atendimento")
    .select(CAMPOS_ATENDIMENTO)
    .eq("cliente_id", clienteId)
    .gte("data", hojeISO())
    .in("status", STATUS_FUTUROS)
    .order("data", { ascending: true })
    .order("hora_prevista_inicio", { ascending: true });
  return (data ?? []) as unknown as AtendimentoPortal[];
}

export async function buscarAtendimento(
  clienteId: string,
  id: string,
): Promise<AtendimentoPortal | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("atendimento")
    .select(CAMPOS_ATENDIMENTO)
    .eq("cliente_id", clienteId)
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as AtendimentoPortal | null) ?? null;
}

export async function listarRelatorios(
  clienteId: string,
  limite = 20,
  periodo?: { de: string; ate: string },
): Promise<AtendimentoPortal[]> {
  const supabase = await createClient();
  let q = supabase
    .from("atendimento")
    .select(CAMPOS_ATENDIMENTO)
    .eq("cliente_id", clienteId)
    .eq("status", "relatado")
    .not("relatorio_texto", "is", null);
  if (periodo) q = q.gte("data", periodo.de).lte("data", periodo.ate);
  const { data } = await q
    .order("data", { ascending: false })
    .order("hora_prevista_inicio", { ascending: false })
    .limit(limite);
  return (data ?? []) as unknown as AtendimentoPortal[];
}

export type AcompanhadoPortal = Pick<
  Acompanhado,
  "id" | "nome" | "apelido" | "endereco" | "telefone" | "mobilidade" | "preferencias"
>;

export async function listarAcompanhados(clienteId: string): Promise<AcompanhadoPortal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("acompanhado")
    .select("id, nome, apelido, endereco, telefone, mobilidade, preferencias")
    .eq("cliente_id", clienteId)
    .order("nome");
  return (data ?? []) as AcompanhadoPortal[];
}

export interface PacotePortal extends Pick<
  Pacote,
  "id" | "horas_contratadas" | "horas_usadas" | "valido_de" | "valido_ate" | "status"
> {
  plano: Pick<Plano, "nome" | "horas" | "valor_centavos"> | null;
}

export async function listarPacotes(clienteId: string): Promise<PacotePortal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pacote")
    .select(
      "id, horas_contratadas, horas_usadas, valido_de, valido_ate, status, plano:plano_id (nome, horas, valor_centavos)",
    )
    .eq("cliente_id", clienteId)
    .order("valido_ate", { ascending: false });
  return ((data ?? []) as unknown[]).map((linha) => {
    const p = linha as Record<string, unknown>;
    const plano = Array.isArray(p.plano) ? p.plano[0] : p.plano;
    return { ...(p as object), plano: (plano as PacotePortal["plano"]) ?? null } as PacotePortal;
  });
}

export type PagamentoPortal = Pick<
  Pagamento,
  "id" | "valor_centavos" | "meio" | "status" | "vencimento" | "pago_em" | "descricao"
> & {
  pix_copia_cola: string | null;
  link_pagamento: string | null;
};

export async function listarPagamentos(clienteId: string): Promise<PagamentoPortal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pagamento")
    .select(
      "id, valor_centavos, meio, status, vencimento, pago_em, descricao, pix_copia_cola, link_pagamento",
    )
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false })
    .limit(30);
  return (data ?? []) as PagamentoPortal[];
}

/** Valor-hora do pacote do atendimento (para estimar a taxa de cancelamento). */
export function valorHoraDoPacote(pacotes: PacotePortal[], pacoteId: string | null): number | null {
  if (!pacoteId) return null;
  const p = pacotes.find((x) => x.id === pacoteId);
  if (!p?.plano || !p.plano.horas) return null;
  return Math.round(p.plano.valor_centavos / p.plano.horas);
}

/**
 * Horários ocupados via RPC `horarios_ocupados(p_de, p_ate)`.
 * Tolerante ao formato: aceita {data, hora, duracao_min} ou {inicio, fim}.
 * Se a RPC ainda não existir, devolve lista vazia + aviso (não quebra a página).
 */
export async function lerOcupados(
  de: string,
  ate: string,
): Promise<{ ocupados: Ocupado[]; aviso: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("horarios_ocupados", { p_de: de, p_ate: ate });
  if (error) {
    return {
      ocupados: [],
      aviso: "Não conseguimos conferir a agenda agora — confirmaremos o horário com você.",
    };
  }
  const linhas = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const ocupados: Ocupado[] = [];
  for (const l of linhas) {
    if (typeof l.data === "string" && typeof l.hora === "string") {
      const inicio = minutosDe(l.hora);
      const dur = Number(l.duracao_min ?? l.duracao_prevista_min ?? 60) || 60;
      ocupados.push({ data: l.data, inicio_min: inicio, fim_min: inicio + dur });
      continue;
    }
    const ini = l.inicio ?? l.inicio_em ?? l.de;
    const fim = l.fim ?? l.fim_em ?? l.ate;
    if (typeof ini === "string" && typeof fim === "string") {
      const di = new Date(ini);
      const df = new Date(fim);
      if (Number.isNaN(di.getTime()) || Number.isNaN(df.getTime())) continue;
      const dataISO = di.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const hi = di.toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
      });
      const minutos = Math.max(Math.round((df.getTime() - di.getTime()) / 60000), 30);
      const inicio = minutosDe(hi);
      ocupados.push({ data: dataISO, inicio_min: inicio, fim_min: inicio + minutos });
    }
  }
  return { ocupados, aviso: null };
}

/** Evento de auditoria — usa admin porque o familiar só tem SELECT. */
export async function registrarEvento(
  clienteId: string,
  tipo: string,
  canal: string,
  payload: Record<string, unknown> = {},
  atendimentoId: string | null = null,
) {
  try {
    const admin = createAdminClient();
    await admin
      .from("evento")
      .insert({ cliente_id: clienteId, atendimento_id: atendimentoId, tipo, canal, payload });
  } catch {
    // auditoria nunca derruba a ação do familiar
  }
}

export { instanteDe, minutosAgoraSP };
