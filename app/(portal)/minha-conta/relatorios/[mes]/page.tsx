import { notFound } from "next/navigation";
import Link from "next/link";
import BotaoImprimir from "@/components/portal/botao-imprimir";
import { TIPO_ATENDIMENTO_LABEL } from "@/lib/domain/types";
import { exigirFamiliar, listarAcompanhados, listarRelatorios } from "../../../_lib/dados";
import { fmtData, fmtMes, hhmm, limitesDoMes, mesValido } from "../../../_lib/datas";

export const dynamic = "force-dynamic";

export default async function RelatoriosDoMesPage({
  params,
}: {
  params: Promise<{ mes: string }>;
}) {
  const { mes } = await params;
  if (!mesValido(mes)) notFound();

  const { cliente } = await exigirFamiliar();
  const periodo = limitesDoMes(mes);
  const [relatorios, acompanhados] = await Promise.all([
    listarRelatorios(cliente.id, 200, periodo),
    listarAcompanhados(cliente.id),
  ]);

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          @page { margin: 16mm; }
          body { background: #fff; }
          header, footer, nav, .print\\:hidden { display: none !important; }
          .impressao { border: 0 !important; box-shadow: none !important; padding: 0 !important; background: #fff !important; }
          .relatorio { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <section className="impressao rounded-3xl border border-vc-bege-escuro bg-white/70 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-bold text-vc-verde">
              Relatórios de {fmtMes(mes)}
            </h1>
            <p className="text-sm text-vc-texto/75">
              Vou Contigo · {cliente.nome}
            </p>
          </div>
          <BotaoImprimir />
        </div>

        {relatorios.length === 0 ? (
          <p className="mt-6 text-base text-vc-texto/75">
            Nenhum relatório neste mês.
          </p>
        ) : (
          <ol className="mt-6 space-y-6">
            {relatorios
              .slice()
              .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))
              .map((r) => {
                const quem = acompanhados.find((x) => x.id === r.acompanhado_id);
                return (
                  <li
                    key={r.id}
                    className="relatorio border-t border-vc-bege-escuro pt-4 first:border-t-0 first:pt-0"
                  >
                    <p className="text-sm font-semibold text-vc-verde">
                      {fmtData(r.data)} às {hhmm(r.hora_prevista_inicio)} ·{" "}
                      {TIPO_ATENDIMENTO_LABEL[r.tipo]}
                    </p>
                    <p className="text-sm text-vc-texto/70">
                      Com {quem?.apelido || quem?.nome || "—"} · destino: {r.endereco_destino}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-vc-texto/90">
                      {r.relatorio_texto}
                    </p>
                  </li>
                );
              })}
          </ol>
        )}
      </section>

      <p className="text-center text-sm print:hidden">
        <Link
          href="/minha-conta"
          className="font-semibold text-vc-marrom underline underline-offset-4"
        >
          Voltar para a minha conta
        </Link>
      </p>
    </div>
  );
}
