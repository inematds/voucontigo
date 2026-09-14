/**
 * Geração e envio da cobrança PIX via Asaas.
 * Sempre com service role (`createAdminClient`) — roda em server action, webhook e cron.
 * Nunca faz HTTP em testes: `criarAsaasClient()` cai no Fake sem ASAAS_API_KEY.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { criarAsaasClient, type AsaasClient } from "./cliente";
import { criarWhatsAppClient, whatsappProvider } from "@/lib/whatsapp/cliente";
import { criarEmailClient } from "@/lib/email/cliente";
import { renderTemplate } from "@/lib/domain/templates";
import { escapeHtml } from "@/lib/telegram/_local";

export type Admin = ReturnType<typeof createAdminClient>;
export type CanalCobranca = "whatsapp" | "email" | "ambos";

/** Prefixo usado por cron e webhook para reconhecer a cobrança de renovação. */
export const DESCRICAO_RENOVACAO_PREFIXO = "Renovação plano ";

export const TEMPLATE_COBRANCA_PIX_ASAAS_PADRAO = [
  "Oi, {nome}! Segue a cobrança de {valor} referente a {descricao}.",
  "Vence em {vencimento}.",
  "",
  "PIX copia e cola:",
  "{pix_copia_cola}",
  "",
  "Ou pague por aqui: {link}",
  "Assim que cair, o sistema confirma sozinho. 💚",
].join("\n");

export interface PagamentoCobranca {
  id: string;
  cliente_id: string;
  pacote_id: string | null;
  atendimento_id: string | null;
  valor_centavos: number;
  meio: string;
  status: string;
  vencimento: string | null;
  descricao: string | null;
  asaas_id: string | null;
  pix_qrcode_base64: string | null;
  pix_copia_cola: string | null;
  link_pagamento: string | null;
}

const COLUNAS =
  "id, cliente_id, pacote_id, atendimento_id, valor_centavos, meio, status, vencimento, descricao, asaas_id, pix_qrcode_base64, pix_copia_cola, link_pagamento";

export function centavosParaBRL(centavos: number | null | undefined): string {
  return ((centavos ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function dataBR(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

async function lerConfig(db: Admin, chaves: string[]): Promise<Record<string, string>> {
  const { data } = await db.from("configuracao").select("chave, valor").in("chave", chaves);
  const out: Record<string, string> = {};
  for (const l of (data ?? []) as { chave: string; valor: string }[]) out[l.chave] = l.valor;
  return out;
}

async function gravarEvento(
  db: Admin,
  tipo: string,
  cliente_id: string | null,
  payload: Record<string, unknown>,
  canal: "sistema" | "whatsapp" | "email" | "painel" = "sistema",
): Promise<void> {
  try {
    await db.from("evento").insert({ tipo, cliente_id, atendimento_id: null, payload, canal });
  } catch {
    // auditoria é best-effort
  }
}

/* -------------------------------------------------------------------------- */
/* Geração                                                                     */
/* -------------------------------------------------------------------------- */

export interface GerarCobrancaParams {
  /** Cliente interno (id obrigatório). */
  cliente: { id: string; nome: string; whatsapp: string; email?: string | null; cpf?: string | null };
  pacote?: { id: string } | null;
  atendimento?: { id: string } | null;
  valorCentavos: number;
  /** ISO 'YYYY-MM-DD'. */
  vencimento: string;
  descricao?: string | null;
  /** Atualiza um pagamento já existente em vez de inserir um novo. */
  pagamentoId?: string | null;
  db?: Admin;
  asaas?: AsaasClient;
}

export interface GerarCobrancaResultado {
  ok: boolean;
  erro?: string;
  pagamento?: PagamentoCobranca;
  reaproveitado?: boolean;
}

/**
 * Cria (ou atualiza) a linha em `pagamento` com a cobrança PIX do Asaas.
 * Idempotente: se o pagamento já tem `asaas_id` e está pendente, só reatualiza o QR.
 */
export async function gerarCobrancaPix(
  params: GerarCobrancaParams,
): Promise<GerarCobrancaResultado> {
  const db = params.db ?? createAdminClient();
  const asaas = params.asaas ?? criarAsaasClient();

  try {
    let existente: PagamentoCobranca | null = null;
    if (params.pagamentoId) {
      const { data } = await db
        .from("pagamento")
        .select(COLUNAS)
        .eq("id", params.pagamentoId)
        .maybeSingle();
      existente = (data as PagamentoCobranca | null) ?? null;
      if (!existente) return { ok: false, erro: "Cobrança não encontrada." };
    }

    // Nunca reabrir uma cobrança já paga/cancelada.
    if (existente && existente.status !== "pendente") {
      return { ok: false, erro: "Esta cobrança não está mais pendente." };
    }

    // Já tem cobrança Asaas pendente → só renova o QR, nunca cria uma segunda.
    if (existente?.asaas_id) {
      const qr = await asaas.obterQrCodePix(existente.asaas_id);
      const { data } = await db
        .from("pagamento")
        .update({
          pix_qrcode_base64: qr.encodedImage || existente.pix_qrcode_base64,
          pix_copia_cola: qr.payload || existente.pix_copia_cola,
        })
        .eq("id", existente.id)
        .select(COLUNAS)
        .maybeSingle();
      return {
        ok: true,
        reaproveitado: true,
        pagamento: ((data as PagamentoCobranca | null) ?? existente) as PagamentoCobranca,
      };
    }

    const cli = await asaas.criarOuBuscarCliente({
      nome: params.cliente.nome,
      cpfCnpj: params.cliente.cpf ?? null,
      mobilePhone: params.cliente.whatsapp,
      email: params.cliente.email ?? null,
      externalReference: params.cliente.id,
    });

    const descricao = params.descricao ?? existente?.descricao ?? "Serviço Vou Contigo";
    const cob = await asaas.criarCobrancaPix({
      customerId: cli.id,
      valorCentavos: params.valorCentavos,
      vencimento: params.vencimento,
      descricao,
      referenciaExterna: existente?.id ?? params.cliente.id,
    });
    const qr = await asaas.obterQrCodePix(cob.id);

    const campos = {
      cliente_id: params.cliente.id,
      pacote_id: params.pacote?.id ?? existente?.pacote_id ?? null,
      atendimento_id: params.atendimento?.id ?? existente?.atendimento_id ?? null,
      valor_centavos: params.valorCentavos,
      meio: "pix",
      status: "pendente",
      vencimento: params.vencimento,
      descricao,
      asaas_id: cob.id,
      pix_qrcode_base64: qr.encodedImage || null,
      pix_copia_cola: qr.payload || null,
      link_pagamento: cob.invoiceUrl,
      referencia_externa: cob.id,
    };

    const { data, error } = existente
      ? await db.from("pagamento").update(campos).eq("id", existente.id).select(COLUNAS).maybeSingle()
      : await db.from("pagamento").insert(campos).select(COLUNAS).maybeSingle();

    if (error) return { ok: false, erro: error.message };
    const pagamento = data as PagamentoCobranca | null;
    if (!pagamento) return { ok: false, erro: "Cobrança não foi gravada." };

    await gravarEvento(db, "cobranca.asaas.gerada", params.cliente.id, {
      pagamento_id: pagamento.id,
      asaas_id: cob.id,
      valor_centavos: params.valorCentavos,
      descricao,
    });

    return { ok: true, pagamento };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/* -------------------------------------------------------------------------- */
/* Envio                                                                       */
/* -------------------------------------------------------------------------- */

export interface EnvioCobrancaResultado {
  ok: boolean;
  whatsapp?: boolean;
  email?: boolean;
  erro?: string;
}

function htmlCobranca(vars: Record<string, string>, qrBase64: string | null): string {
  const img = qrBase64
    ? `<p><img src="data:image/png;base64,${qrBase64}" alt="QR Code PIX" width="240" height="240" style="display:block;border:1px solid #eee" /></p>`
    : "";
  const link = vars.link
    ? `<p><a href="${escapeHtml(vars.link)}" style="color:#2f6b4f">Abrir a fatura e pagar</a></p>`
    : "";
  return [
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#2b2b2b">`,
    `<p>Oi, ${escapeHtml(vars.nome)}!</p>`,
    `<p>Segue a cobrança de <strong>${vars.valor}</strong> referente a ${escapeHtml(vars.descricao)}.` +
      (vars.vencimento ? ` Vence em ${vars.vencimento}.` : "") +
      `</p>`,
    img,
    `<p><strong>PIX copia e cola:</strong></p>`,
    `<p style="word-break:break-all;background:#f6f4ef;padding:12px;border-radius:8px;font-family:monospace;font-size:12px">${escapeHtml(vars.pix_copia_cola)}</p>`,
    link,
    `<p>Assim que o pagamento cair, o sistema confirma sozinho. 💚<br/>Vou Contigo</p>`,
    `</div>`,
  ].join("\n");
}

/**
 * Envia a cobrança pelo WhatsApp e/ou e-mail usando `template_cobranca_pix`.
 * Nunca lança: falha de canal vira `ok:false` + evento.
 */
export async function enviarCobranca(
  pagamento: PagamentoCobranca,
  canal: CanalCobranca = "whatsapp",
  opts: { db?: Admin } = {},
): Promise<EnvioCobrancaResultado> {
  const db = opts.db ?? createAdminClient();

  try {
    const { data: cliRaw } = await db
      .from("cliente")
      .select("id, nome, whatsapp, email")
      .eq("id", pagamento.cliente_id)
      .maybeSingle();
    const cliente = cliRaw as
      | { id: string; nome: string; whatsapp: string; email: string | null }
      | null;
    if (!cliente) return { ok: false, erro: "Cliente não encontrado." };

    const cfg = await lerConfig(db, [
      "template_cobranca_pix",
      "chave_pix",
      "whatsapp_template_cobranca",
    ]);

    const vars: Record<string, string> = {
      nome: cliente.nome,
      valor: centavosParaBRL(pagamento.valor_centavos),
      vencimento: dataBR(pagamento.vencimento),
      pix_copia_cola: pagamento.pix_copia_cola ?? "",
      link: pagamento.link_pagamento ?? "",
      descricao: pagamento.descricao ?? "serviço Vou Contigo",
      chave_pix: cfg.chave_pix ?? "",
    };

    const modelo = cfg.template_cobranca_pix?.trim()
      ? cfg.template_cobranca_pix
      : TEMPLATE_COBRANCA_PIX_ASAAS_PADRAO;
    const texto = renderTemplate(modelo, vars);

    let okWhats: boolean | undefined;
    let okEmail: boolean | undefined;

    if (canal === "whatsapp" || canal === "ambos") {
      const wa = criarWhatsAppClient();
      const nomeTemplate = cfg.whatsapp_template_cobranca?.trim();
      const r =
        whatsappProvider() === "meta" && nomeTemplate
          ? await wa.enviarTemplate(cliente.whatsapp, nomeTemplate, [
              vars.nome,
              vars.valor,
              vars.vencimento,
              vars.pix_copia_cola,
            ])
          : await wa.enviarTexto(cliente.whatsapp, texto);
      okWhats = r.ok;
      await gravarEvento(
        db,
        r.ok ? "cobranca.enviada" : "cobranca.envio_falhou",
        cliente.id,
        { pagamento_id: pagamento.id, canal: "whatsapp", erro: r.erro ?? null },
        "whatsapp",
      );
    }

    if (canal === "email" || canal === "ambos") {
      if (!cliente.email) {
        okEmail = false;
      } else {
        const mail = criarEmailClient();
        const r = await mail.enviar(
          cliente.email,
          `Cobrança Vou Contigo — ${vars.valor}`,
          htmlCobranca(vars, pagamento.pix_qrcode_base64),
          texto,
        );
        okEmail = r.ok;
        await gravarEvento(
          db,
          r.ok ? "cobranca.enviada" : "cobranca.envio_falhou",
          cliente.id,
          { pagamento_id: pagamento.id, canal: "email", erro: r.erro ?? null },
          "email",
        );
      }
    }

    return { ok: Boolean(okWhats || okEmail), whatsapp: okWhats, email: okEmail };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Lê um pagamento com os campos da cobrança. */
export async function lerPagamento(
  id: string,
  db: Admin = createAdminClient(),
): Promise<PagamentoCobranca | null> {
  const { data } = await db.from("pagamento").select(COLUNAS).eq("id", id).maybeSingle();
  return (data as PagamentoCobranca | null) ?? null;
}

export const COLUNAS_PAGAMENTO = COLUNAS;
