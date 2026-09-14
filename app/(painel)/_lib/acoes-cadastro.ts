"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { exigirPerfil, registrarEvento } from "./dados";

export type Estado = { erro?: string; ok?: string };

const opcional = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
};

const soDigitos = (v: FormDataEntryValue | null) =>
  String(v ?? "").replace(/\D/g, "");

const ORIGENS = [
  "landing",
  "instagram",
  "whatsapp",
  "indicacao",
  "clinica",
  "outro",
] as const;

const MOBILIDADES = [
  "anda_sozinho",
  "bengala",
  "andador",
  "cadeira_rodas",
  "precisa_apoio",
] as const;

/* -------------------------------------------------------------------------- */
/* Cliente                                                                     */
/* -------------------------------------------------------------------------- */

const esquemaCliente = z.object({
  nome: z.string().trim().min(2, "Informe o nome do cliente."),
  whatsapp: z
    .string()
    .regex(/^\d{10,15}$/, "WhatsApp com DDI e DDD, só números. Ex.: 5551999998888"),
  email: z.string().email("E-mail inválido.").nullable(),
  cpf: z.string().nullable(),
  endereco_cobranca: z.string().nullable(),
  origem: z.enum(ORIGENS),
  observacoes: z.string().nullable(),
});

function lerCliente(formData: FormData) {
  return esquemaCliente.safeParse({
    nome: formData.get("nome"),
    whatsapp: soDigitos(formData.get("whatsapp")),
    email: opcional(formData.get("email")),
    cpf: opcional(formData.get("cpf")),
    endereco_cobranca: opcional(formData.get("endereco_cobranca")),
    origem: formData.get("origem") ?? "landing",
    observacoes: opcional(formData.get("observacoes")),
  });
}

export async function criarCliente(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirPerfil();
  const parsed = lerCliente(formData);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const consentiu = formData.get("consentimento_lgpd") === "on";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cliente")
    .insert({
      ...parsed.data,
      consentimento_lgpd_em: consentiu ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) {
    return {
      erro: error.message.includes("cliente_whatsapp_idx")
        ? "Já existe um cliente com esse WhatsApp."
        : `Não foi possível salvar: ${error.message}`,
    };
  }

  await registrarEvento({
    tipo: "cliente.criado",
    cliente_id: data.id,
    payload: { nome: parsed.data.nome },
  });

  revalidatePath("/painel/clientes");
  redirect(`/painel/clientes/${data.id}`);
}

export async function editarCliente(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirPerfil();
  const id = String(formData.get("id") ?? "");
  if (!id) return { erro: "Cliente não identificado." };

  const parsed = lerCliente(formData);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const consentiu = formData.get("consentimento_lgpd") === "on";
  const jaConsentiu = String(formData.get("consentimento_atual") ?? "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("cliente")
    .update({
      ...parsed.data,
      consentimento_lgpd_em: consentiu
        ? jaConsentiu || new Date().toISOString()
        : null,
    })
    .eq("id", id);

  if (error) return { erro: `Não foi possível salvar: ${error.message}` };

  revalidatePath("/painel/clientes");
  revalidatePath(`/painel/clientes/${id}`);
  return { ok: "Cliente atualizado." };
}

/* -------------------------------------------------------------------------- */
/* Acompanhado                                                                 */
/* -------------------------------------------------------------------------- */

const esquemaAcompanhado = z.object({
  cliente_id: z.string().uuid("Cliente não identificado."),
  nome: z.string().trim().min(2, "Informe o nome."),
  apelido: z.string().nullable(),
  data_nascimento: z.string().nullable(),
  endereco: z.string().trim().min(3, "Informe o endereço."),
  telefone: z.string().nullable(),
  contato_emergencia_nome: z.string().nullable(),
  contato_emergencia_telefone: z.string().nullable(),
  mobilidade: z.enum(MOBILIDADES),
  preferencias: z.string().nullable(),
  restricoes_declaradas: z.string().nullable(),
});

function lerAcompanhado(formData: FormData) {
  return esquemaAcompanhado.safeParse({
    cliente_id: formData.get("cliente_id"),
    nome: formData.get("nome"),
    apelido: opcional(formData.get("apelido")),
    data_nascimento: opcional(formData.get("data_nascimento")),
    endereco: formData.get("endereco"),
    telefone: opcional(formData.get("telefone")),
    contato_emergencia_nome: opcional(formData.get("contato_emergencia_nome")),
    contato_emergencia_telefone: opcional(
      formData.get("contato_emergencia_telefone"),
    ),
    mobilidade: formData.get("mobilidade") ?? "anda_sozinho",
    preferencias: opcional(formData.get("preferencias")),
    restricoes_declaradas: opcional(formData.get("restricoes_declaradas")),
  });
}

export async function salvarAcompanhado(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirPerfil();
  const parsed = lerAcompanhado(formData);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();

  const { error } = id
    ? await supabase.from("acompanhado").update(parsed.data).eq("id", id)
    : await supabase.from("acompanhado").insert(parsed.data);

  if (error) return { erro: `Não foi possível salvar: ${error.message}` };

  await registrarEvento({
    tipo: id ? "acompanhado.editado" : "acompanhado.criado",
    cliente_id: parsed.data.cliente_id,
    payload: { nome: parsed.data.nome },
  });

  revalidatePath(`/painel/clientes/${parsed.data.cliente_id}`);
  return { ok: id ? "Ficha atualizada." : "Acompanhado(a) cadastrado(a)." };
}

export async function excluirAcompanhado(formData: FormData): Promise<void> {
  await exigirPerfil();
  const id = String(formData.get("id") ?? "");
  const clienteId = String(formData.get("cliente_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("acompanhado").delete().eq("id", id);
  revalidatePath(`/painel/clientes/${clienteId}`);
}
