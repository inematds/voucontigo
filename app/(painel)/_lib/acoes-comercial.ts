"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { exigirGestora, exigirPerfil, registrarEvento } from "./dados";
import { reaisParaCentavos } from "./dominio-local";

export type Estado = { erro?: string; ok?: string };

const opcional = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
};

/* -------------------------------------------------------------------------- */
/* Pacotes                                                                     */
/* -------------------------------------------------------------------------- */

const esquemaPacote = z.object({
  cliente_id: z.string().uuid("Escolha o cliente."),
  plano_id: z.string().uuid("Escolha o plano."),
  valido_de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o início."),
  valido_ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a validade."),
});

export async function venderPacote(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirPerfil();
  const parsed = esquemaPacote.safeParse({
    cliente_id: formData.get("cliente_id"),
    plano_id: formData.get("plano_id"),
    valido_de: formData.get("valido_de"),
    valido_ate: formData.get("valido_ate"),
  });
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (parsed.data.valido_ate < parsed.data.valido_de) {
    return { erro: "A validade precisa ser posterior ao início." };
  }

  const supabase = await createClient();
  const { data: plano } = await supabase
    .from("plano")
    .select("id, horas, valor_centavos, nome")
    .eq("id", parsed.data.plano_id)
    .maybeSingle<{
      id: string;
      horas: number;
      valor_centavos: number;
      nome: string;
    }>();

  if (!plano) return { erro: "Plano não encontrado." };

  const { data: pacote, error } = await supabase
    .from("pacote")
    .insert({
      cliente_id: parsed.data.cliente_id,
      plano_id: plano.id,
      horas_contratadas: plano.horas,
      horas_usadas: 0,
      valido_de: parsed.data.valido_de,
      valido_ate: parsed.data.valido_ate,
      status: "ativo",
    })
    .select("id")
    .single();

  if (error) return { erro: `Não foi possível vender: ${error.message}` };

  if (formData.get("gerar_cobranca") === "on") {
    await supabase.from("pagamento").insert({
      cliente_id: parsed.data.cliente_id,
      pacote_id: pacote.id,
      valor_centavos: plano.valor_centavos,
      meio: "pix",
      status: "pendente",
      vencimento: parsed.data.valido_de,
      descricao: `Pacote ${plano.nome}`,
    });
  }

  await registrarEvento({
    tipo: "pacote.vendido",
    cliente_id: parsed.data.cliente_id,
    payload: { plano: plano.nome, horas: plano.horas },
  });

  revalidatePath("/painel/pacotes");
  revalidatePath("/painel/financeiro");
  redirect("/painel/pacotes");
}

/* -------------------------------------------------------------------------- */
/* Pagamentos                                                                  */
/* -------------------------------------------------------------------------- */

const MEIOS = ["pix", "dinheiro", "cartao", "transferencia"] as const;

export async function criarCobranca(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirPerfil();

  const esquema = z.object({
    cliente_id: z.string().uuid("Escolha o cliente."),
    valor_centavos: z.number().int().min(1, "Informe um valor maior que zero."),
    meio: z.enum(MEIOS),
    vencimento: z.string().nullable(),
    descricao: z.string().nullable(),
    pacote_id: z.string().uuid().nullable(),
    atendimento_id: z.string().uuid().nullable(),
  });

  const parsed = esquema.safeParse({
    cliente_id: formData.get("cliente_id"),
    valor_centavos: reaisParaCentavos(String(formData.get("valor") ?? "")),
    meio: formData.get("meio") ?? "pix",
    vencimento: opcional(formData.get("vencimento")),
    descricao: opcional(formData.get("descricao")),
    pacote_id: opcional(formData.get("pacote_id")),
    atendimento_id: opcional(formData.get("atendimento_id")),
  });

  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("pagamento")
    .insert({ ...parsed.data, status: "pendente" });

  if (error) return { erro: `Não foi possível criar: ${error.message}` };

  await registrarEvento({
    tipo: "cobranca.criada",
    cliente_id: parsed.data.cliente_id,
    payload: { valor_centavos: parsed.data.valor_centavos },
  });

  revalidatePath("/painel/financeiro");
  return { ok: "Cobrança criada." };
}

export async function marcarPago(formData: FormData): Promise<void> {
  await exigirPerfil();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("pagamento")
    .update({ status: "pago", pago_em: new Date().toISOString() })
    .eq("id", id);

  await registrarEvento({ tipo: "pagamento.pago", payload: { id } });
  revalidatePath("/painel/financeiro");
}

export async function cancelarCobranca(formData: FormData): Promise<void> {
  await exigirPerfil();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("pagamento").update({ status: "cancelado" }).eq("id", id);
  revalidatePath("/painel/financeiro");
}

/* -------------------------------------------------------------------------- */
/* Leads                                                                       */
/* -------------------------------------------------------------------------- */

const STATUS_LEAD = ["novo", "contatado", "convertido", "perdido"] as const;

export async function mudarStatusLead(formData: FormData): Promise<void> {
  await exigirPerfil();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !STATUS_LEAD.includes(status as (typeof STATUS_LEAD)[number]))
    return;

  const supabase = await createClient();
  await supabase.from("lead").update({ status }).eq("id", id);
  await registrarEvento({ tipo: "lead.status", payload: { id, status } });
  revalidatePath("/painel/leads");
}

export async function converterLeadEmCliente(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirPerfil();
  const id = String(formData.get("id") ?? "");
  if (!id) return { erro: "Lead não identificado." };

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("lead")
    .select("id, nome, whatsapp, mensagem, origem, cliente_id")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      nome: string;
      whatsapp: string;
      mensagem: string | null;
      origem: string;
      cliente_id: string | null;
    }>();

  if (!lead) return { erro: "Lead não encontrado." };
  if (lead.cliente_id) return { erro: "Este lead já virou cliente." };

  const { data: existente } = await supabase
    .from("cliente")
    .select("id")
    .eq("whatsapp", lead.whatsapp)
    .maybeSingle<{ id: string }>();

  let clienteId = existente?.id ?? null;

  if (!clienteId) {
    const { data: novo, error } = await supabase
      .from("cliente")
      .insert({
        nome: lead.nome,
        whatsapp: lead.whatsapp,
        origem: lead.origem,
        observacoes: lead.mensagem,
      })
      .select("id")
      .single();
    if (error) return { erro: `Não foi possível converter: ${error.message}` };
    clienteId = novo.id;
  }

  await supabase
    .from("lead")
    .update({ status: "convertido", cliente_id: clienteId })
    .eq("id", id);

  await registrarEvento({
    tipo: "lead.convertido",
    cliente_id: clienteId,
    payload: { lead_id: id },
  });

  revalidatePath("/painel/leads");
  revalidatePath("/painel/clientes");
  redirect(`/painel/clientes/${clienteId}`);
}

/* -------------------------------------------------------------------------- */
/* Configuração (só gestora)                                                   */
/* -------------------------------------------------------------------------- */

export async function salvarConfiguracao(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirGestora();

  const linhas: { chave: string; valor: string }[] = [];
  for (const [chave, valor] of formData.entries()) {
    if (!chave.startsWith("cfg__")) continue;
    linhas.push({
      chave: chave.slice(5),
      valor: typeof valor === "string" ? valor : "",
    });
  }
  if (linhas.length === 0) return { erro: "Nada para salvar." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("configuracao")
    .upsert(linhas, { onConflict: "chave" });

  if (error) return { erro: `Não foi possível salvar: ${error.message}` };

  revalidatePath("/painel/configuracoes");
  return { ok: "Configurações salvas." };
}

/* -------------------------------------------------------------------------- */
/* Acompanhantes (só gestora)                                                  */
/* -------------------------------------------------------------------------- */

export async function salvarAcompanhante(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirGestora();

  const esquema = z.object({
    nome: z.string().trim().min(2, "Informe o nome."),
    whatsapp: z.string().regex(/^\d{10,15}$/, "WhatsApp só com números (DDI+DDD)."),
    telegram_chat_id: z.string().nullable(),
    ativo: z.boolean(),
  });

  const parsed = esquema.safeParse({
    nome: formData.get("nome"),
    whatsapp: String(formData.get("whatsapp") ?? "").replace(/\D/g, ""),
    telegram_chat_id: opcional(formData.get("telegram_chat_id")),
    ativo: formData.get("ativo") === "on",
  });

  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("acompanhante").update(parsed.data).eq("id", id)
    : await supabase.from("acompanhante").insert(parsed.data);

  if (error) return { erro: `Não foi possível salvar: ${error.message}` };

  revalidatePath("/painel/configuracoes");
  return { ok: id ? "Acompanhante atualizada." : "Acompanhante cadastrada." };
}
