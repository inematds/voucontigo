import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hojeISO, somarDiasISO } from "../../../_lib/datas";
import { lerAtendimentosPeriodo } from "../../../_lib/metricas";
import { TIPO_ATENDIMENTO_LABEL } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

function valido(iso: string | null): iso is string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso ?? "");
}

/** Escapa um campo para CSV pt-BR (separador ';'). */
function campo(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function reais(centavos: number | null | undefined): string {
  return ((centavos ?? 0) / 100).toFixed(2).replace(".", ",");
}

export async function GET(request: NextRequest) {
  // A rota faz sua própria checagem: não depende só do middleware.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("perfil")
    .select("papel")
    .eq("id", user.id)
    .maybeSingle<{ papel: string }>();
  if (perfil?.papel !== "gestora") {
    return NextResponse.json({ erro: "acesso restrito" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const ate = valido(sp.get("ate")) ? sp.get("ate")! : hojeISO();
  const de = valido(sp.get("de")) ? sp.get("de")! : somarDiasISO(ate, -29);

  const linhas = await lerAtendimentosPeriodo(de, ate);

  const cabecalho = [
    "data",
    "hora_prevista",
    "cliente",
    "acompanhado",
    "tipo",
    "status",
    "duracao_prevista_min",
    "inicio_real",
    "fim_real",
    "horas_debitadas",
    "minutos_espera",
    "km_rodados",
    "estacionamento_reais",
    "pedagio_reais",
    "outros_reais",
    "extras_reais",
    "valor_avulso_reais",
    "nivel_esforco",
  ];

  const corpo = linhas.map((l) =>
    [
      l.data,
      l.hora_prevista_inicio?.slice(0, 5) ?? "",
      l.cliente?.nome ?? "",
      l.acompanhado?.nome ?? "",
      TIPO_ATENDIMENTO_LABEL[l.tipo],
      l.status,
      l.duracao_prevista_min,
      l.inicio_real ?? "",
      l.fim_real ?? "",
      String(l.horas_debitadas ?? 0).replace(".", ","),
      l.minutos_espera ?? 0,
      String(l.km_rodados ?? 0).replace(".", ","),
      reais(l.custo_estacionamento_centavos),
      reais(l.custo_pedagio_centavos),
      reais(l.custo_outros_centavos),
      reais(l.valor_extras_centavos),
      reais(l.valor_avulso_centavos),
      l.nivel_esforco ?? "",
    ]
      .map(campo)
      .join(";"),
  );

  const csv = `﻿${[cabecalho.map(campo).join(";"), ...corpo].join("\r\n")}\r\n`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="voucontigo-atendimentos-${de}_a_${ate}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
