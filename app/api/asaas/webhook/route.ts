/**
 * Webhook do Asaas.
 * Autenticação: header `asaas-access-token` == ASAAS_WEBHOOK_TOKEN (401 senão).
 * Idempotência: `webhook_processado (provedor='asaas', evento_id)`.
 * Responde SEMPRE 200 quando autenticado — o Asaas trava a fila em não-2xx.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { notificarGestao } from "@/lib/telegram/notificacoes";
import { DESCRICAO_RENOVACAO_PREFIXO, centavosParaBRL } from "@/lib/asaas/cobranca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Admin = ReturnType<typeof createAdminClient>;

interface EventoAsaas {
  id?: string;
  event?: string;
  payment?: {
    id?: string;
    status?: string;
    value?: number;
    paymentDate?: string | null;
    confirmedDate?: string | null;
    clientPaymentDate?: string | null;
    externalReference?: string | null;
  };
}

const PAGOS = ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"];
const CANCELA = ["PAYMENT_DELETED", "PAYMENT_REFUNDED", "PAYMENT_REFUND_IN_PROGRESS"];
/** Estorno atinge cobrança já paga — não pode ter o guarda `neq('status','pago')`. */
const ESTORNOS = ["PAYMENT_REFUNDED", "PAYMENT_REFUND_IN_PROGRESS"];

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function somarDiasISO(data: string, dias: number): string {
  const d = new Date(`${data.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
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

/** Cria o pacote seguinte quando a cobrança paga era uma renovação. */
async function ativarRenovacao(
  db: Admin,
  pagamento: { id: string; cliente_id: string; pacote_id: string | null; descricao: string | null },
): Promise<string | null> {
  if (!pagamento.pacote_id) return null;
  if (!(pagamento.descricao ?? "").startsWith(DESCRICAO_RENOVACAO_PREFIXO)) return null;

  const { data: atualRaw } = await db
    .from("pacote")
    .select("id, cliente_id, plano_id, horas_contratadas, valido_de, valido_ate, status")
    .eq("id", pagamento.pacote_id)
    .maybeSingle();
  const atual = atualRaw as
    | {
        id: string;
        cliente_id: string;
        plano_id: string;
        horas_contratadas: number;
        valido_de: string;
        valido_ate: string;
        status: string;
      }
    | null;
  if (!atual) return null;

  const validoDe = somarDiasISO(atual.valido_ate, 1);
  const validoAte = somarDiasISO(validoDe, 29);

  // Já existe o sucessor? (webhook duplicado / reprocessamento)
  const { data: jaRaw } = await db
    .from("pacote")
    .select("id")
    .eq("cliente_id", atual.cliente_id)
    .eq("plano_id", atual.plano_id)
    .eq("valido_de", validoDe)
    .maybeSingle();
  if ((jaRaw as { id: string } | null)?.id) return (jaRaw as { id: string }).id;

  const { data: plano } = await db
    .from("plano")
    .select("id, horas")
    .eq("id", atual.plano_id)
    .maybeSingle();
  const horas = (plano as { horas: number } | null)?.horas ?? atual.horas_contratadas;

  const { data: novoRaw, error } = await db
    .from("pacote")
    .insert({
      cliente_id: atual.cliente_id,
      plano_id: atual.plano_id,
      horas_contratadas: horas,
      horas_usadas: 0,
      valido_de: validoDe,
      valido_ate: validoAte,
      status: "ativo",
    })
    .select("id")
    .maybeSingle();
  if (error) return null;

  const novoId = (novoRaw as { id: string } | null)?.id ?? null;
  if (novoId) {
    await evento(db, "pacote.renovado", atual.cliente_id, {
      pacote_anterior: atual.id,
      pacote_novo: novoId,
      valido_de: validoDe,
      valido_ate: validoAte,
      pagamento_id: pagamento.id,
    });
  }
  return novoId;
}

export async function POST(request: Request): Promise<Response> {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  const recebido = request.headers.get("asaas-access-token");
  if (!esperado || recebido !== esperado) {
    return json({ erro: "não autorizado" }, 401);
  }

  let corpo: EventoAsaas;
  try {
    corpo = (await request.json()) as EventoAsaas;
  } catch {
    return json({ ok: true, ignorado: "corpo inválido" });
  }

  const eventoId = corpo.id ?? null;
  const tipo = corpo.event ?? "";
  const asaasId = corpo.payment?.id ?? null;
  if (!eventoId || !tipo) return json({ ok: true, ignorado: "evento sem id/tipo" });

  const db = createAdminClient();

  // 1. Reserva o evento — duplicado sai aqui.
  const { error: erroClaim } = await db
    .from("webhook_processado")
    .insert({ provedor: "asaas", evento_id: eventoId });
  if (erroClaim) {
    if (erroClaim.code === "23505") return json({ ok: true, duplicado: true });
    console.error("[asaas] falha ao reservar evento:", erroClaim.message);
    return json({ ok: true, erro: "claim" });
  }

  try {
    if (!asaasId) return json({ ok: true, ignorado: "evento sem pagamento" });

    const { data: pagRaw } = await db
      .from("pagamento")
      .select("id, cliente_id, pacote_id, valor_centavos, status, descricao")
      .eq("asaas_id", asaasId)
      .maybeSingle();
    const pagamento = pagRaw as
      | {
          id: string;
          cliente_id: string;
          pacote_id: string | null;
          valor_centavos: number;
          status: string;
          descricao: string | null;
        }
      | null;

    if (!pagamento) {
      await evento(db, "asaas.webhook.orfao", null, { evento_id: eventoId, tipo, asaas_id: asaasId });
      return json({ ok: true, ignorado: "pagamento desconhecido" });
    }

    if (PAGOS.includes(tipo)) {
      const pagoEm =
        corpo.payment?.paymentDate ??
        corpo.payment?.confirmedDate ??
        corpo.payment?.clientPaymentDate ??
        null;
      const pagoEmISO = pagoEm
        ? new Date(pagoEm.length === 10 ? `${pagoEm}T12:00:00-03:00` : pagoEm).toISOString()
        : new Date().toISOString();

      // Transição atômica: só o primeiro de RECEIVED/CONFIRMED pega a linha pendente.
      const { data: atualizadas } = await db
        .from("pagamento")
        .update({ status: "pago", pago_em: pagoEmISO })
        .eq("asaas_id", asaasId)
        .eq("status", "pendente")
        .select("id");

      const mudou = ((atualizadas ?? []) as { id: string }[]).length > 0;
      if (!mudou) return json({ ok: true, jaPago: true });

      await evento(db, "pagamento.pago", pagamento.cliente_id, {
        pagamento_id: pagamento.id,
        asaas_id: asaasId,
        origem: "asaas",
        tipo,
      });

      const novoPacote = await ativarRenovacao(db, pagamento);

      await notificarGestao(
        [
          "💰 <b>Pagamento confirmado (Asaas)</b>",
          `${centavosParaBRL(pagamento.valor_centavos)} · ${pagamento.descricao ?? "sem descrição"}`,
          novoPacote ? "Pacote renovado automaticamente." : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );

      return json({ ok: true, pago: true, pacote_novo: novoPacote });
    }

    if (tipo === "PAYMENT_OVERDUE") {
      await evento(db, "pagamento.vencido", pagamento.cliente_id, {
        pagamento_id: pagamento.id,
        asaas_id: asaasId,
      });
      await notificarGestao(
        [
          "⏰ <b>Cobrança vencida</b>",
          `${centavosParaBRL(pagamento.valor_centavos)} · ${pagamento.descricao ?? "sem descrição"}`,
        ].join("\n"),
      );
      return json({ ok: true, vencido: true });
    }

    if (CANCELA.includes(tipo)) {
      const estorno = ESTORNOS.includes(tipo);
      const q = db.from("pagamento").update({ status: "cancelado" }).eq("asaas_id", asaasId);
      // Só o DELETE precisa poupar cobrança já paga; estorno derruba justamente a paga.
      await (estorno ? q : q.neq("status", "pago"));
      await evento(db, estorno ? "pagamento.estornado" : "pagamento.cancelado", pagamento.cliente_id, {
        pagamento_id: pagamento.id,
        asaas_id: asaasId,
        tipo,
      });
      if (estorno) {
        await notificarGestao(
          [
            "↩️ <b>Pagamento estornado (Asaas)</b>",
            `${centavosParaBRL(pagamento.valor_centavos)} · ${pagamento.descricao ?? "sem descrição"}`,
          ].join("\n"),
        );
      }
      return json({ ok: true, cancelado: true, estorno });
    }

    return json({ ok: true, ignorado: tipo });
  } catch (e) {
    // Libera a reserva para o Asaas poder reentregar o evento.
    try {
      await db
        .from("webhook_processado")
        .delete()
        .eq("provedor", "asaas")
        .eq("evento_id", eventoId);
    } catch {
      /* nada a fazer */
    }
    console.error("[asaas] erro ao processar webhook:", e);
    return json({ ok: false, erro: "falha ao processar" });
  }
}
