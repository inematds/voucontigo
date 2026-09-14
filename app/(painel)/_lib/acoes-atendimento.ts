"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Atendimento, StatusAtendimento } from "@/lib/domain/types";
import { exigirPerfil, lerConfigNumerica, registrarEvento } from "./dados";
import {
  calcularHorasAtendimento,
  calcularValorAvulso,
  reaisParaCentavos,
} from "./dominio-local";

export type Estado = { erro?: string; ok?: string };

const TIPOS = [
  "consulta",
  "exame",
  "fisioterapia",
  "mercado",
  "farmacia",
  "banco",
  "passeio",
  "outro",
] as const;

const opcional = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
};

const esquemaAtendimento = z.object({
  cliente_id: z.string().uuid("Escolha o cliente."),
  acompanhado_id: z.string().uuid("Escolha quem será acompanhado."),
  acompanhante_id: z.string().uuid().nullable(),
  pacote_id: z.string().uuid().nullable(),
  tipo: z.enum(TIPOS),
  descricao: z.string().nullable(),
  endereco_saida: z.string().trim().min(3, "Informe o endereço de saída."),
  endereco_destino: z.string().trim().min(3, "Informe o endereço de destino."),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data."),
  hora_prevista_inicio: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Informe a hora prevista."),
  duracao_prevista_min: z.coerce
    .number()
    .int()
    .min(15, "A duração precisa ter ao menos 15 minutos."),
});

function lerFormAtendimento(formData: FormData) {
  return esquemaAtendimento.safeParse({
    cliente_id: formData.get("cliente_id"),
    acompanhado_id: formData.get("acompanhado_id"),
    acompanhante_id: opcional(formData.get("acompanhante_id")),
    pacote_id: opcional(formData.get("pacote_id")),
    tipo: formData.get("tipo"),
    descricao: opcional(formData.get("descricao")),
    endereco_saida: formData.get("endereco_saida"),
    endereco_destino: formData.get("endereco_destino"),
    data: formData.get("data"),
    hora_prevista_inicio: formData.get("hora_prevista_inicio"),
    duracao_prevista_min: formData.get("duracao_prevista_min"),
  });
}

export async function criarAtendimento(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirPerfil();
  const parsed = lerFormAtendimento(formData);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("atendimento")
    .insert({ ...parsed.data, status: "agendado" })
    .select("id")
    .single();

  if (error) return { erro: `Não foi possível salvar: ${error.message}` };

  await registrarEvento({
    tipo: "atendimento.criado",
    atendimento_id: data.id,
    cliente_id: parsed.data.cliente_id,
    payload: { data: parsed.data.data, hora: parsed.data.hora_prevista_inicio },
  });

  revalidatePath("/painel");
  revalidatePath("/painel/agenda");
  redirect(`/painel/atendimentos/${data.id}`);
}

export async function editarAtendimento(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirPerfil();
  const id = String(formData.get("id") ?? "");
  if (!id) return { erro: "Atendimento não identificado." };

  const parsed = lerFormAtendimento(formData);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("atendimento")
    .update(parsed.data)
    .eq("id", id);
  if (error) return { erro: `Não foi possível salvar: ${error.message}` };

  await registrarEvento({
    tipo: "atendimento.editado",
    atendimento_id: id,
    cliente_id: parsed.data.cliente_id,
    payload: { data: parsed.data.data, hora: parsed.data.hora_prevista_inicio },
  });

  revalidatePath("/painel/agenda");
  revalidatePath(`/painel/atendimentos/${id}`);
  redirect(`/painel/atendimentos/${id}`);
}

const STATUS_PERMITIDOS: StatusAtendimento[] = [
  "solicitado",
  "agendado",
  "confirmado",
  "em_andamento",
  "nao_compareceu",
];

export async function mudarStatus(formData: FormData): Promise<void> {
  await exigirPerfil();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as StatusAtendimento;
  if (!id || !STATUS_PERMITIDOS.includes(status)) return;

  const supabase = await createClient();
  const extra =
    status === "em_andamento" ? { inicio_real: new Date().toISOString() } : {};
  const { error } = await supabase
    .from("atendimento")
    .update({ status, ...extra })
    .eq("id", id);
  if (error) return;

  await registrarEvento({
    tipo: `atendimento.${status}`,
    atendimento_id: id,
    payload: { status },
  });

  revalidatePath("/painel");
  revalidatePath("/painel/agenda");
  revalidatePath(`/painel/atendimentos/${id}`);
}

/** Botão INICIAR da tela de execução. */
export async function iniciarAtendimento(formData: FormData): Promise<void> {
  await exigirPerfil();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("atendimento")
    .update({ status: "em_andamento", inicio_real: agora })
    .eq("id", id);
  if (error) return;

  await registrarEvento({
    tipo: "atendimento.iniciado",
    atendimento_id: id,
    payload: { inicio_real: agora },
  });

  revalidatePath("/painel");
  revalidatePath(`/painel/atendimentos/${id}`);
}

const esquemaFinalizar = z.object({
  id: z.string().uuid("Atendimento não identificado."),
  minutos_espera: z.coerce
    .number({ error: "Informe os minutos de espera." })
    .int("Minutos de espera precisa ser um número inteiro.")
    .min(0, "Minutos de espera não pode ser negativo."),
  km_rodados: z.coerce
    .number({ error: "Informe os km rodados." })
    .min(0, "Km rodados não pode ser negativo."),
  nivel_esforco: z.coerce
    .number({ error: "Escolha o nível de esforço." })
    .int()
    .min(1, "Escolha o nível de esforço (1 a 5).")
    .max(5, "Escolha o nível de esforço (1 a 5)."),
  observacoes_internas: z.string().nullable(),
});

/** FINALIZAR — grava tudo num único UPDATE (a constraint do banco exige isso). */
export async function finalizarAtendimento(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirPerfil();

  const obrigatorios = ["minutos_espera", "km_rodados", "nivel_esforco"];
  for (const campo of obrigatorios) {
    const v = formData.get(campo);
    if (v === null || String(v).trim() === "") {
      return {
        erro: "Preencha espera, km rodados e nível de esforço para finalizar.",
      };
    }
  }

  const parsed = esquemaFinalizar.safeParse({
    id: formData.get("id"),
    minutos_espera: formData.get("minutos_espera"),
    km_rodados: formData.get("km_rodados"),
    nivel_esforco: formData.get("nivel_esforco"),
    observacoes_internas: opcional(formData.get("observacoes_internas")),
  });
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { data: atendimento, error: erroLeitura } = await supabase
    .from("atendimento")
    .select("*")
    .eq("id", parsed.data.id)
    .single<Atendimento>();

  if (erroLeitura || !atendimento) {
    return { erro: "Atendimento não encontrado." };
  }

  const inicio = atendimento.inicio_real ?? new Date().toISOString();
  const fim = new Date().toISOString();
  const { num: cfg } = await lerConfigNumerica();

  const horas = calcularHorasAtendimento(
    {
      inicio_real: inicio,
      fim_real: fim,
      minutos_espera: parsed.data.minutos_espera,
    },
    cfg,
  );

  const estacionamento = reaisParaCentavos(
    String(formData.get("custo_estacionamento") ?? ""),
  );
  const pedagio = reaisParaCentavos(String(formData.get("custo_pedagio") ?? ""));
  const outros = reaisParaCentavos(String(formData.get("custo_outros") ?? ""));
  const extras = estacionamento + pedagio + outros;

  const valorAvulso = atendimento.pacote_id
    ? null
    : calcularValorAvulso(horas, cfg);

  const { error } = await supabase
    .from("atendimento")
    .update({
      status: "concluido",
      inicio_real: inicio,
      fim_real: fim,
      minutos_espera: parsed.data.minutos_espera,
      km_rodados: parsed.data.km_rodados,
      custo_estacionamento_centavos: estacionamento,
      custo_pedagio_centavos: pedagio,
      custo_outros_centavos: outros,
      nivel_esforco: parsed.data.nivel_esforco,
      observacoes_internas: parsed.data.observacoes_internas,
      horas_debitadas: horas,
      valor_extras_centavos: extras,
      valor_avulso_centavos: valorAvulso,
    })
    .eq("id", parsed.data.id);

  if (error) return { erro: `Não foi possível finalizar: ${error.message}` };

  // Débito de horas do pacote: usa a função SQL; se ela ainda não existir,
  // cai para o débito manual para que o fluxo nunca trave.
  if (atendimento.pacote_id) {
    const { error: erroRpc } = await supabase.rpc("debitar_horas_pacote", {
      p_atendimento_id: parsed.data.id,
    });
    if (erroRpc) {
      const { data: pacote } = await supabase
        .from("pacote")
        .select("horas_usadas, horas_contratadas")
        .eq("id", atendimento.pacote_id)
        .maybeSingle<{ horas_usadas: number; horas_contratadas: number }>();
      if (pacote) {
        const usadas = Number(pacote.horas_usadas) + horas;
        await supabase
          .from("pacote")
          .update({
            horas_usadas: usadas,
            status:
              usadas >= Number(pacote.horas_contratadas) ? "esgotado" : "ativo",
          })
          .eq("id", atendimento.pacote_id);
      }
    }
  }

  await registrarEvento({
    tipo: "atendimento.finalizado",
    atendimento_id: parsed.data.id,
    cliente_id: atendimento.cliente_id,
    payload: { horas, extras_centavos: extras },
  });

  revalidatePath("/painel");
  revalidatePath("/painel/agenda");
  revalidatePath("/painel/pacotes");
  revalidatePath(`/painel/atendimentos/${parsed.data.id}`);
  return { ok: "Atendimento finalizado. Agora é só enviar o relatório." };
}

export async function cancelarAtendimento(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirPerfil();
  const id = String(formData.get("id") ?? "");
  const motivo = String(formData.get("motivo_cancelamento") ?? "").trim();
  const status = String(formData.get("status") ?? "cancelado_cliente");

  if (!id) return { erro: "Atendimento não identificado." };
  if (motivo.length < 3) return { erro: "Descreva o motivo do cancelamento." };
  if (status !== "cancelado_cliente" && status !== "cancelado_operacao") {
    return { erro: "Tipo de cancelamento inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("atendimento")
    .update({ status, motivo_cancelamento: motivo })
    .eq("id", id);
  if (error) return { erro: `Não foi possível cancelar: ${error.message}` };

  await registrarEvento({
    tipo: "atendimento.cancelado",
    atendimento_id: id,
    payload: { status, motivo },
  });

  revalidatePath("/painel");
  revalidatePath("/painel/agenda");
  revalidatePath(`/painel/atendimentos/${id}`);
  return { ok: "Atendimento cancelado." };
}

export async function salvarRelatorio(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirPerfil();
  const id = String(formData.get("id") ?? "");
  const texto = String(formData.get("relatorio_texto") ?? "").trim();
  if (!id) return { erro: "Atendimento não identificado." };
  if (!texto) return { erro: "Escreva o relatório antes de salvar." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("atendimento")
    .update({ relatorio_texto: texto })
    .eq("id", id);
  if (error) return { erro: `Não foi possível salvar: ${error.message}` };

  revalidatePath(`/painel/atendimentos/${id}`);
  return { ok: "Relatório salvo." };
}

export async function marcarRelatorioEnviado(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirPerfil();
  const id = String(formData.get("id") ?? "");
  const texto = String(formData.get("relatorio_texto") ?? "").trim();
  if (!id) return { erro: "Atendimento não identificado." };
  if (!texto) return { erro: "Escreva o relatório antes de marcar como enviado." };

  const supabase = await createClient();
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("atendimento")
    .update({
      relatorio_texto: texto,
      relatorio_enviado_em: agora,
      status: "relatado",
    })
    .eq("id", id);
  if (error) return { erro: `Não foi possível marcar: ${error.message}` };

  await registrarEvento({
    tipo: "relatorio.enviado",
    atendimento_id: id,
    payload: { enviado_em: agora },
  });

  revalidatePath("/painel");
  revalidatePath(`/painel/atendimentos/${id}`);
  return { ok: "Relatório marcado como enviado. 💚" };
}
