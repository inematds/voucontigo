import {
  Alerta,
  Card,
  EmptyState,
  Metrica,
  PageHeader,
} from "@/components/painel/ui";
import { exigirGestora } from "../../_lib/dados";
import { fmtData, hojeISO, somarDiasISO } from "../../_lib/datas";
import { centavosParaReais, fmtHoras } from "../../_lib/dominio-local";
import { lerMetricas } from "../../_lib/metricas";
import { TIPO_ATENDIMENTO_LABEL } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

function valido(iso?: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso ?? "");
}

export default async function MetricasPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  await exigirGestora();
  const sp = await searchParams;
  const hoje = hojeISO();
  const ate = valido(sp.ate) ? sp.ate! : hoje;
  const de = valido(sp.de) ? sp.de! : somarDiasISO(ate, -29);

  const { resumo, linhas, origem } = await lerMetricas(de, ate);

  return (
    <>
      <PageHeader
        titulo="Métricas de validação"
        subtitulo={`${fmtData(de)} a ${fmtData(ate)} · ${resumo.atendimentos} atendimentos concluídos`}
      />

      <Card className="mb-5">
        <form
          action="/painel/metricas"
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <label
              htmlFor="de"
              className="mb-1 block text-sm font-semibold text-vc-texto/80"
            >
              De
            </label>
            <input
              id="de"
              name="de"
              type="date"
              defaultValue={de}
              className="min-h-11 rounded-xl border border-vc-bege-escuro bg-white px-3"
            />
          </div>
          <div>
            <label
              htmlFor="ate"
              className="mb-1 block text-sm font-semibold text-vc-texto/80"
            >
              Até
            </label>
            <input
              id="ate"
              name="ate"
              type="date"
              defaultValue={ate}
              className="min-h-11 rounded-xl border border-vc-bege-escuro bg-white px-3"
            />
          </div>
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-vc-verde px-4 font-semibold text-vc-creme"
          >
            Aplicar
          </button>
          <a
            href={`/painel/metricas/csv?de=${de}&ate=${ate}`}
            className="min-h-11 rounded-xl bg-vc-bege px-4 py-2.5 font-semibold text-vc-texto"
          >
            Exportar CSV
          </a>
        </form>
      </Card>

      {resumo.atendimentos < 10 ? (
        <Alerta tom="aviso">
          Ainda são {resumo.atendimentos} atendimentos no período. O plano
          recomenda 10–20 antes de revisar o preço.
        </Alerta>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica rotulo="Atendimentos" valor={resumo.atendimentos} />
        <Metrica
          rotulo="Horas previstas"
          valor={fmtHoras(resumo.horas_previstas)}
        />
        <Metrica rotulo="Horas reais" valor={fmtHoras(resumo.horas_reais)} />
        <Metrica
          rotulo="Média de espera"
          valor={`${Math.round(resumo.media_espera_min)} min`}
        />
        <Metrica
          rotulo="Km médio"
          valor={`${resumo.km_medio.toFixed(1)} km`}
        />
        <Metrica
          rotulo="Extras médios"
          valor={centavosParaReais(Math.round(resumo.extras_medio_centavos))}
        />
        <Metrica
          rotulo="Receita/hora efetiva"
          valor={centavosParaReais(Math.round(resumo.receita_hora_centavos))}
          detalhe="considera só atendimentos avulsos cobrados"
        />
        <Metrica
          rotulo="Ocupação semanal"
          valor={fmtHoras(Number(resumo.ocupacao_semanal_horas.toFixed(1)))}
          detalhe="horas reais por semana"
        />
      </div>

      <p className="mb-4 text-xs text-vc-texto/50">
        Fonte dos números:{" "}
        {origem === "rpc"
          ? "função metricas_validacao do banco"
          : "cálculo local (a função SQL ainda não respondeu)"}
        .
      </p>

      <Card titulo="Atendimentos do período">
        {linhas.length === 0 ? (
          <EmptyState titulo="Nenhum atendimento concluído no período" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-vc-bege-escuro text-xs text-vc-texto/60 uppercase">
                  <th className="py-2 pr-3">Data</th>
                  <th className="py-2 pr-3">Acompanhado</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">Horas</th>
                  <th className="py-2 pr-3">Espera</th>
                  <th className="py-2 pr-3">Km</th>
                  <th className="py-2 pr-3">Extras</th>
                  <th className="py-2">Esforço</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-vc-bege-escuro/40 last:border-0"
                  >
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {fmtData(l.data)}
                    </td>
                    <td className="py-2 pr-3">{l.acompanhado?.nome ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {TIPO_ATENDIMENTO_LABEL[l.tipo]}
                    </td>
                    <td className="py-2 pr-3">
                      {fmtHoras(Number(l.horas_debitadas ?? 0))}
                    </td>
                    <td className="py-2 pr-3">{l.minutos_espera ?? 0} min</td>
                    <td className="py-2 pr-3">{l.km_rodados ?? 0}</td>
                    <td className="py-2 pr-3">
                      {centavosParaReais(l.valor_extras_centavos ?? 0)}
                    </td>
                    <td className="py-2">{l.nivel_esforco ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
