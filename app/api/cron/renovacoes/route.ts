/**
 * Cron diário de renovação de pacotes mensais (PLANO §7.2).
 *
 * 1. Pacotes `pacote_mensal` ativos que vencem em até `renovacao_aviso_dias`
 *    → gera a cobrança PIX de renovação no Asaas (uma só por ciclo) e envia
 *      ao cliente por WhatsApp (+ e-mail quando houver).
 * 2. Pacotes ativos já vencidos → status `expirado` + aviso à gestão.
 *
 * O pacote NOVO só nasce quando o webhook do Asaas marcar a cobrança como paga
 * (`ativarRenovacao` em /api/asaas/webhook) — aqui nada é criado adiantado.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAutorizado, respostaJson } from "@/lib/telegram/cron";
import { notificarGestao } from "@/lib/telegram/notificacoes";
import { dataSP, somarDias } from "@/lib/telegram/_local";
import {
  DESCRICAO_RENOVACAO_PREFIXO,
  centavosParaBRL,
  enviarCobranca,
  gerarCobrancaPix,
  type PagamentoCobranca,
} from "@/lib/asaas/cobranca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof createAdminClient>;

const AVISO_DIAS_PADRAO = 3;

interface PacoteLinha {
  id: string;
  cliente_id: string;
  plano_id: string;
  valido_de: string;
  valido_ate: string;
  status: string;
}

async function lerAvisoDias(db: Admin): Promise<number> {
  const { data } = await db
    .from("configuracao")
    .select("valor")
    .eq("chave", "renovacao_aviso_dias")
    .maybeSingle();
  const n = Number((data as { valor?: string } | null)?.valor);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : AVISO_DIAS_PADRAO;
}

async function evento(
  db: Admin,
  tipo: string,
  cliente_id: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await db.from("evento").insert({ tipo, cliente_id, payload, canal: "sistema" });
  } catch {
    /* best-effort */
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!cronAutorizado(request)) {
    return respostaJson({ erro: "não autorizado" }, 401);
  }

  const db = createAdminClient();
  const hoje = dataSP();
  const avisoDias = await lerAvisoDias(db);
  const limite = somarDias(hoje, avisoDias);

  // Planos mensais
  const { data: planosRaw } = await db
    .from("plano")
    .select("id, nome, valor_centavos, horas, tipo")
    .eq("tipo", "pacote_mensal");
  const planos = (planosRaw ?? []) as {
    id: string;
    nome: string;
    valor_centavos: number;
    horas: number;
  }[];
  if (planos.length === 0) {
    return respostaJson({ ok: true, cobrancas: 0, expirados: 0, motivo: "sem planos mensais" });
  }
  const porPlano = new Map(planos.map((p) => [p.id, p]));

  const { data: pacotesRaw } = await db
    .from("pacote")
    .select("id, cliente_id, plano_id, valido_de, valido_ate, status")
    .eq("status", "ativo")
    .in(
      "plano_id",
      planos.map((p) => p.id),
    )
    .lte("valido_ate", limite);
  const pacotes = (pacotesRaw ?? []) as PacoteLinha[];

  const aRenovar = pacotes.filter((p) => p.valido_ate >= hoje);
  const vencidos = pacotes.filter((p) => p.valido_ate < hoje);

  /* ---------------------------------------------------------------- */
  /* 1. Cobranças de renovação                                         */
  /* ---------------------------------------------------------------- */
  const geradas: { pacote_id: string; pagamento_id: string }[] = [];
  const falhas: { pacote_id: string; erro: string }[] = [];

  for (const pacote of aRenovar) {
    const plano = porPlano.get(pacote.plano_id);
    if (!plano) continue;

    // Idempotência: já existe cobrança de renovação viva para este pacote?
    const { data: jaRaw } = await db
      .from("pagamento")
      .select("id, descricao, status")
      .eq("pacote_id", pacote.id)
      .neq("status", "cancelado");
    const ja = ((jaRaw ?? []) as { id: string; descricao: string | null; status: string }[]).some(
      (p) => (p.descricao ?? "").startsWith(DESCRICAO_RENOVACAO_PREFIXO),
    );
    if (ja) continue;

    const { data: cliRaw } = await db
      .from("cliente")
      .select("id, nome, whatsapp, email, cpf")
      .eq("id", pacote.cliente_id)
      .maybeSingle();
    const cliente = cliRaw as
      | { id: string; nome: string; whatsapp: string; email: string | null; cpf: string | null }
      | null;
    if (!cliente) continue;

    const r = await gerarCobrancaPix({
      cliente,
      pacote: { id: pacote.id },
      valorCentavos: plano.valor_centavos,
      vencimento: pacote.valido_ate,
      descricao: `${DESCRICAO_RENOVACAO_PREFIXO}${plano.nome}`,
      db,
    });

    if (!r.ok || !r.pagamento) {
      falhas.push({ pacote_id: pacote.id, erro: r.erro ?? "desconhecido" });
      continue;
    }

    const pagamento = r.pagamento as PagamentoCobranca;
    await enviarCobranca(pagamento, cliente.email ? "ambos" : "whatsapp", { db });
    await evento(db, "renovacao.cobranca_gerada", cliente.id, {
      pacote_id: pacote.id,
      pagamento_id: pagamento.id,
      plano: plano.nome,
      vencimento: pacote.valido_ate,
    });
    geradas.push({ pacote_id: pacote.id, pagamento_id: pagamento.id });

    await notificarGestao(
      [
        "🔁 <b>Renovação cobrada</b>",
        `${cliente.nome} · ${plano.nome}`,
        `${centavosParaBRL(plano.valor_centavos)} · vence ${pacote.valido_ate}`,
      ].join("\n"),
    );
  }

  /* ---------------------------------------------------------------- */
  /* 2. Pacotes vencidos sem pagamento                                 */
  /* ---------------------------------------------------------------- */
  const expirados: string[] = [];
  let semRenovacao = 0;
  for (const pacote of vencidos) {
    const { data } = await db
      .from("pacote")
      .update({ status: "expirado" })
      .eq("id", pacote.id)
      .eq("status", "ativo")
      .select("id");
    if (((data ?? []) as { id: string }[]).length === 0) continue;
    expirados.push(pacote.id);

    // Renovado = já existe cobrança de renovação PAGA para este pacote.
    const { data: pagosRaw } = await db
      .from("pagamento")
      .select("id, descricao")
      .eq("pacote_id", pacote.id)
      .eq("status", "pago");
    const renovado = ((pagosRaw ?? []) as { descricao: string | null }[]).some((p) =>
      (p.descricao ?? "").startsWith(DESCRICAO_RENOVACAO_PREFIXO),
    );
    if (!renovado) semRenovacao += 1;

    await evento(db, "pacote.expirado", pacote.cliente_id, {
      pacote_id: pacote.id,
      valido_ate: pacote.valido_ate,
      renovado,
    });
  }

  if (semRenovacao > 0) {
    await notificarGestao(
      `⚠️ <b>${semRenovacao} pacote(s) expiraram</b> sem renovação. Confira o painel.`,
    );
  }

  return respostaJson({
    ok: true,
    hoje,
    aviso_dias: avisoDias,
    cobrancas: geradas.length,
    expirados: expirados.length,
    expirados_sem_renovacao: semRenovacao,
    falhas,
  });
}
