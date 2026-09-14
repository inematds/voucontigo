import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TIPO_ATENDIMENTO_LABEL } from "@/lib/domain/types";
import { gerarICS, type EventoICS } from "../../_lib/ics";
import { hojeISO } from "../../_lib/datas";
import { STATUS_FUTUROS } from "../../_lib/dados";

export const dynamic = "force-dynamic";

/** Calendário (.ics) com os atendimentos futuros do familiar logado. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Não autenticado", { status: 401 });

  const { data: cliente } = await supabase
    .from("cliente")
    .select("id, nome")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!cliente) return new NextResponse("Cadastro não encontrado", { status: 404 });

  const { data } = await supabase
    .from("atendimento")
    .select(
      "id, tipo, data, hora_prevista_inicio, duracao_prevista_min, endereco_destino, descricao, acompanhado:acompanhado_id (nome, apelido)",
    )
    .eq("cliente_id", cliente.id)
    .gte("data", hojeISO())
    .in("status", STATUS_FUTUROS)
    .order("data", { ascending: true });

  const eventos: EventoICS[] = ((data ?? []) as unknown[]).map((linha) => {
    const a = linha as Record<string, unknown>;
    const ac = (Array.isArray(a.acompanhado) ? a.acompanhado[0] : a.acompanhado) as
      | { nome?: string; apelido?: string | null }
      | null;
    const tipo = String(a.tipo) as keyof typeof TIPO_ATENDIMENTO_LABEL;
    return {
      id: String(a.id),
      data: String(a.data),
      hora: String(a.hora_prevista_inicio ?? "00:00"),
      duracao_min: Number(a.duracao_prevista_min ?? 60),
      tipo_label: TIPO_ATENDIMENTO_LABEL[tipo] ?? "Acompanhamento",
      acompanhado: ac?.apelido || ac?.nome || "Acompanhado(a)",
      destino: (a.endereco_destino as string | null) ?? null,
      descricao: (a.descricao as string | null) ?? null,
    };
  });

  const ics = gerarICS(eventos, { nomeCalendario: `Vou Contigo — ${cliente.nome}` });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vou-contigo.ics"',
      "Cache-Control": "no-store",
    },
  });
}
