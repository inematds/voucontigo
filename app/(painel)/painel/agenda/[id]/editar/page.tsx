import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/painel/ui";
import FormAtendimento from "@/components/painel/form-atendimento";
import { exigirPerfil } from "../../../../_lib/dados";
import { carregarOpcoesAtendimento } from "../../../../_lib/opcoes";
import type { Atendimento } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export default async function EditarAtendimentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirPerfil();

  const supabase = await createClient();
  const { data } = await supabase
    .from("atendimento")
    .select("*")
    .eq("id", id)
    .maybeSingle<Atendimento>();

  if (!data) notFound();
  const opcoes = await carregarOpcoesAtendimento();

  return (
    <>
      <PageHeader titulo="Editar atendimento" />
      <Card>
        <FormAtendimento
          {...opcoes}
          valores={{
            id: data.id,
            cliente_id: data.cliente_id,
            acompanhado_id: data.acompanhado_id,
            acompanhante_id: data.acompanhante_id,
            pacote_id: data.pacote_id,
            tipo: data.tipo,
            descricao: data.descricao,
            endereco_saida: data.endereco_saida,
            endereco_destino: data.endereco_destino,
            data: data.data,
            hora_prevista_inicio: data.hora_prevista_inicio,
            duracao_prevista_min: data.duracao_prevista_min,
          }}
        />
      </Card>
    </>
  );
}
