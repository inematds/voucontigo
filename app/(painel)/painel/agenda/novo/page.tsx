import { Card, EmptyState, LinkButton, PageHeader } from "@/components/painel/ui";
import FormAtendimento from "@/components/painel/form-atendimento";
import { exigirPerfil } from "../../../_lib/dados";
import { carregarOpcoesAtendimento } from "../../../_lib/opcoes";
import { hojeISO } from "../../../_lib/datas";

export const dynamic = "force-dynamic";

export default async function NovoAtendimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; cliente?: string }>;
}) {
  await exigirPerfil();
  const sp = await searchParams;
  const opcoes = await carregarOpcoesAtendimento();

  return (
    <>
      <PageHeader
        titulo="Novo atendimento"
        subtitulo="Agende um acompanhamento para um cliente."
      />
      <Card>
        {opcoes.clientes.length === 0 ? (
          <EmptyState
            titulo="Cadastre um cliente primeiro"
            descricao="Todo atendimento precisa de um cliente e de um acompanhado."
            acao={
              <LinkButton href="/painel/clientes/novo" variante="primario">
                Cadastrar cliente
              </LinkButton>
            }
          />
        ) : (
          <FormAtendimento
            {...opcoes}
            valores={{
              data: sp.data ?? hojeISO(),
              cliente_id: sp.cliente,
              hora_prevista_inicio: "09:00",
            }}
          />
        )}
      </Card>
    </>
  );
}
