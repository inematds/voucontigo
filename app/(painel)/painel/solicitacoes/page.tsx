import Link from "next/link";
import { admin } from "@/lib/telegram/dados";
import { listarSolicitacoesPendentes } from "@/lib/telegram/solicitacoes";
import { Card, EmptyState, PageHeader } from "@/components/painel/ui";
import AcoesSolicitacao from "@/components/painel/inbox-solicitacao";
import { exigirPerfil } from "../../_lib/dados";
import { fmtData, fmtHora } from "../../_lib/datas";
import { TIPO_ATENDIMENTO_LABEL } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export default async function SolicitacoesPage() {
  await exigirPerfil();
  const pendentes = await listarSolicitacoesPendentes(admin(), 50);

  return (
    <>
      <PageHeader
        titulo="Solicitações"
        subtitulo="Pedidos de agendamento aguardando sua aprovação."
      />

      {pendentes.length === 0 ? (
        <EmptyState
          titulo="Nada aguardando aprovação"
          descricao="Pedidos feitos pelo WhatsApp ou pelo portal do familiar aparecem aqui."
        />
      ) : (
        <ul className="space-y-3">
          {pendentes.map((a) => (
            <li key={a.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-serif text-lg font-bold text-vc-verde">
                      {a.acompanhado?.apelido || a.acompanhado?.nome || "—"}
                    </p>
                    <p className="text-sm text-vc-texto/80">
                      {TIPO_ATENDIMENTO_LABEL[a.tipo] ?? a.tipo} ·{" "}
                      {fmtData(a.data)} às {fmtHora(a.hora_prevista_inicio)} (
                      {a.duracao_prevista_min} min)
                    </p>
                    <p className="text-sm text-vc-texto/70">
                      Destino: {a.endereco_destino}
                    </p>
                    {a.cliente_id ? (
                      <Link
                        href={`/painel/clientes/${a.cliente_id}`}
                        className="text-xs font-semibold text-vc-marrom underline underline-offset-2"
                      >
                        {a.cliente?.nome ?? "Ver cliente"}
                      </Link>
                    ) : null}
                  </div>
                </div>

                <AcoesSolicitacao id={a.id} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
