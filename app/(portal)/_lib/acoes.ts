"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { criarEmailClient } from "@/lib/email/cliente";
import { criarWhatsAppClient } from "@/lib/whatsapp/cliente";
import {
  exigirFamiliar,
  lerConfiguracao,
  janelaDaConfig,
  lerOcupados,
  buscarAtendimento,
  listarPacotes,
  valorHoraDoPacote,
  registrarEvento,
  STATUS_CANCELAVEIS,
} from "./dados";
import { taxaDeCancelamento } from "./taxa";
import { calcularSlotsLivres, formatarSlots } from "./agendamento";
import { montarMensagemHorariosLivres, mensagemParaHtml } from "./horarios";
import { hojeISO, minutosAgoraSP, somarDiasISO } from "./datas";

export type EstadoAcao = { erro?: string; ok?: string };

// ---------------------------------------------------------------- cancelar

const esquemaCancelar = z.object({
  atendimento_id: z.string().uuid("Atendimento inválido."),
  motivo: z.string().trim().min(3, "Conte em uma linha o motivo do cancelamento."),
});

export async function cancelarAtendimento(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const parsed = esquemaCancelar.safeParse({
    atendimento_id: formData.get("atendimento_id"),
    motivo: formData.get("motivo"),
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { cliente } = await exigirFamiliar();
  const atendimento = await buscarAtendimento(cliente.id, parsed.data.atendimento_id);
  if (!atendimento) return { erro: "Não encontramos esse acompanhamento." };
  if (!STATUS_CANCELAVEIS.includes(atendimento.status)) {
    return { erro: "Esse acompanhamento não pode mais ser cancelado por aqui." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_atendimento_familiar", {
    p_atendimento_id: atendimento.id,
    p_motivo: parsed.data.motivo,
    p_canal: "painel",
  });
  if (error) return { erro: "Não conseguimos cancelar agora. Fale com a gente no WhatsApp." };

  await registrarEvento(
    cliente.id,
    "atendimento.cancelado_familiar",
    "painel",
    { motivo: parsed.data.motivo },
    atendimento.id,
  );
  revalidatePath("/minha-conta");
  return { ok: "Acompanhamento cancelado. Avisamos a equipe." };
}

/** Taxa estimada para exibir antes de confirmar o cancelamento. */
export async function estimarTaxa(atendimentoId: string) {
  const { cliente } = await exigirFamiliar();
  const atendimento = await buscarAtendimento(cliente.id, atendimentoId);
  if (!atendimento) return null;
  const [{ config }, pacotes] = await Promise.all([lerConfiguracao(), listarPacotes(cliente.id)]);
  return taxaDeCancelamento(
    atendimento,
    new Date(),
    config,
    valorHoraDoPacote(pacotes, atendimento.pacote_id),
  );
}

// ---------------------------------------------------------------- solicitar

const esquemaSolicitar = z.object({
  acompanhado_id: z.string().uuid("Escolha quem será acompanhado."),
  tipo: z.enum([
    "consulta",
    "exame",
    "fisioterapia",
    "mercado",
    "farmacia",
    "banco",
    "passeio",
    "outro",
  ]),
  slot: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Escolha um horário da lista."),
  duracao_min: z.coerce.number().int().min(60).max(720),
  destino: z.string().trim().min(5, "Informe o endereço de destino."),
  saida: z.string().trim().min(5, "Informe o endereço de saída."),
});

export async function solicitarAcompanhamento(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const parsed = esquemaSolicitar.safeParse({
    acompanhado_id: formData.get("acompanhado_id"),
    tipo: formData.get("tipo"),
    slot: formData.get("slot"),
    duracao_min: formData.get("duracao_min"),
    destino: formData.get("destino"),
    saida: formData.get("saida"),
  });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const { cliente } = await exigirFamiliar();
  const [data, hora] = parsed.data.slot.split("T");

  const supabase = await createClient();
  const { error } = await supabase.rpc("solicitar_atendimento", {
    p_cliente_id: cliente.id,
    p_acompanhado_id: parsed.data.acompanhado_id,
    p_tipo: parsed.data.tipo,
    p_data: data,
    p_hora: hora,
    p_duracao_min: parsed.data.duracao_min,
    p_destino: parsed.data.destino,
    p_saida: parsed.data.saida,
    p_canal: "painel",
  });
  if (error) {
    return { erro: "Não conseguimos registrar o pedido agora. Fale com a gente no WhatsApp." };
  }

  await registrarEvento(cliente.id, "atendimento.solicitado", "painel", {
    data,
    hora,
    tipo: parsed.data.tipo,
  });
  revalidatePath("/minha-conta");
  return { ok: "Pedido enviado! A equipe confirma com você em seguida." };
}

// ---------------------------------------------------------------- horários livres

async function montarTextoHorarios(duracaoMin: number, nome: string) {
  const [{ mapa }] = await Promise.all([lerConfiguracao()]);
  const de = hojeISO();
  const ate = somarDiasISO(de, 14);
  const { ocupados } = await lerOcupados(de, ate);
  const slots = calcularSlotsLivres({
    de,
    dias: 15,
    duracao_min: duracaoMin,
    janela: janelaDaConfig(mapa),
    ocupados,
    agora_min: minutosAgoraSP() + 120,
    limite: 24,
  });
  const texto = slots.length
    ? montarMensagemHorariosLivres(slots, duracaoMin, nome)
    : formatarSlots(slots, duracaoMin);
  return { texto, total: slots.length };
}

const esquemaDuracao = z.coerce.number().int().refine((n) => n === 120 || n === 240);

export async function enviarHorariosPorEmail(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const dur = esquemaDuracao.safeParse(formData.get("duracao_min"));
  if (!dur.success) return { erro: "Escolha 2h ou 4h." };

  const { cliente, userEmail } = await exigirFamiliar();
  const destino = cliente.email ?? userEmail;
  if (!destino) return { erro: "Não temos um e-mail no seu cadastro." };

  const { texto } = await montarTextoHorarios(dur.data, cliente.nome);
  const email = criarEmailClient();
  const r = await email.enviar(
    destino,
    "Vou Contigo — horários livres",
    mensagemParaHtml(texto),
    texto,
  );
  if (!r.ok) return { erro: "Não conseguimos enviar o e-mail agora." };

  await registrarEvento(cliente.id, "horarios_livres.enviado", "email", {
    duracao_min: dur.data,
    para: destino,
  });
  return { ok: `Enviamos para ${destino}.` };
}

export async function enviarHorariosPorWhatsApp(
  _estado: EstadoAcao,
  formData: FormData,
): Promise<EstadoAcao> {
  const dur = esquemaDuracao.safeParse(formData.get("duracao_min"));
  if (!dur.success) return { erro: "Escolha 2h ou 4h." };

  const { cliente } = await exigirFamiliar();
  if (!cliente.whatsapp) return { erro: "Não temos um WhatsApp no seu cadastro." };

  const { texto } = await montarTextoHorarios(dur.data, cliente.nome);
  const wa = criarWhatsAppClient();
  const r = await wa.enviarTexto(cliente.whatsapp, texto);
  if (!r.ok) return { erro: "Não conseguimos enviar pelo WhatsApp agora." };

  await registrarEvento(cliente.id, "horarios_livres.enviado", "whatsapp", {
    duracao_min: dur.data,
  });
  return { ok: "Enviamos no seu WhatsApp." };
}

// ---------------------------------------------------------------- sessão

export async function sairDoPortal() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/minha-conta", "layout");
  redirect("/entrar");
}
