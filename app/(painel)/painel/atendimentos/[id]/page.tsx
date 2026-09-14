import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  BadgeStatus,
  Button,
  Card,
  LinkButton,
  PageHeader,
} from "@/components/painel/ui";
import FormFinalizar from "@/components/painel/form-finalizar";
import PainelRelatorio from "@/components/painel/painel-relatorio";
import FormCancelar from "@/components/painel/form-cancelar";
import { exigirPerfil, lerConfigNumerica } from "../../../_lib/dados";
import { fmtDataLonga, fmtHora, fmtHoraTZ } from "../../../_lib/datas";
import {
  calcularExtras,
  calcularTaxaCancelamento,
  centavosParaReais,
  fmtHoras,
  montarRelatorio,
  TEMPLATE_RELATORIO_PADRAO,
} from "../../../_lib/dominio-local";
import {
  iniciarAtendimento,
  mudarStatus,
} from "../../../_lib/acoes-atendimento";
import { TIPO_ATENDIMENTO_LABEL } from "@/lib/domain/types";
import type { Atendimento } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

type Registro = Atendimento & {
  cliente: { id: string; nome: string; whatsapp: string } | null;
  acompanhado: { id: string; nome: string; apelido: string | null } | null;
  pacote:
    | { id: string; horas_contratadas: number; horas_usadas: number }
    | null;
};

export default async function AtendimentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirPerfil();
  const supabase = await createClient();
  const { bruta, num: cfg } = await lerConfigNumerica();

  const { data } = await supabase
    .from("atendimento")
    .select(
      "*, cliente:cliente_id(id, nome, whatsapp), acompanhado:acompanhado_id(id, nome, apelido), pacote:pacote_id(id, horas_contratadas, horas_usadas)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const a = data as unknown as Registro;

  const extras = calcularExtras(a);
  const horasRestantes = a.pacote
    ? Number(a.pacote.horas_contratadas) - Number(a.pacote.horas_usadas)
    : null;

  const taxaEstimada = calcularTaxaCancelamento(
    {
      data: a.data,
      hora_prevista_inicio: a.hora_prevista_inicio,
      duracao_prevista_min: a.duracao_prevista_min,
    },
    cfg,
  );

  const relatorioBase =
    a.relatorio_texto ??
    montarRelatorio(
      {
        ...a,
        relatorio_texto:
          a.descricao ?? "Correu tudo bem, sem intercorrências.",
      },
      {
        nome: a.acompanhado?.nome ?? "—",
        apelido: a.acompanhado?.apelido ?? null,
      },
      { nome: a.cliente?.nome ?? "" },
      a.pacote
        ? {
            horas_contratadas: Number(a.pacote.horas_contratadas),
            horas_usadas: Number(a.pacote.horas_usadas),
          }
        : null,
      bruta.template_relatorio || TEMPLATE_RELATORIO_PADRAO,
    );

  const emAndamento = a.status === "em_andamento";
  const concluido = a.status === "concluido" || a.status === "relatado";
  const cancelado = a.status.startsWith("cancelado");

  return (
    <>
      <PageHeader
        titulo={a.acompanhado?.apelido || a.acompanhado?.nome || "Atendimento"}
        subtitulo={`${fmtDataLonga(a.data)} · ${fmtHora(a.hora_prevista_inicio)} · ${TIPO_ATENDIMENTO_LABEL[a.tipo]}`}
        acao={<BadgeStatus status={a.status} />}
      />

      <div className="space-y-5">
        <Card titulo="Roteiro">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-vc-texto/60">Saída</dt>
              <dd className="font-semibold">{a.endereco_saida}</dd>
            </div>
            <div>
              <dt className="text-xs text-vc-texto/60">Destino</dt>
              <dd className="font-semibold">{a.endereco_destino}</dd>
            </div>
            <div>
              <dt className="text-xs text-vc-texto/60">Cliente</dt>
              <dd className="font-semibold">
                {a.cliente ? (
                  <Link
                    href={`/painel/clientes/${a.cliente.id}`}
                    className="underline underline-offset-2"
                  >
                    {a.cliente.nome}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-vc-texto/60">Duração prevista</dt>
              <dd className="font-semibold">{a.duracao_prevista_min} min</dd>
            </div>
            {a.descricao ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-vc-texto/60">Descrição</dt>
                <dd>{a.descricao}</dd>
              </div>
            ) : null}
            {a.pacote ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-vc-texto/60">Pacote a debitar</dt>
                <dd className="font-semibold">
                  {fmtHoras(horasRestantes ?? 0)} restantes de{" "}
                  {fmtHoras(Number(a.pacote.horas_contratadas))}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <LinkButton
              href={`/painel/agenda/${a.id}/editar`}
              variante="fantasma"
              tamanho="sm"
            >
              Editar
            </LinkButton>
          </div>
        </Card>

        {cancelado ? (
          <Card titulo="Cancelamento">
            <p className="text-sm">
              Motivo: {a.motivo_cancelamento || "não informado"}
            </p>
          </Card>
        ) : null}

        {!concluido && !cancelado ? (
          <Card titulo="Execução" className="border-vc-verde/40">
            {!emAndamento ? (
              <form action={iniciarAtendimento}>
                <input type="hidden" name="id" value={a.id} />
                <Button
                  type="submit"
                  tamanho="lg"
                  className="w-full text-xl tracking-wide"
                >
                  INICIAR
                </Button>
                <p className="mt-2 text-center text-xs text-vc-texto/60">
                  Grava o horário de agora como início real.
                </p>
              </form>
            ) : (
              <div id="finalizar">
                <p className="mb-4 rounded-xl bg-vc-verde/10 px-3 py-2 text-sm font-semibold text-vc-verde">
                  Em andamento desde {fmtHoraTZ(a.inicio_real)}.
                </p>
                <FormFinalizar id={a.id} />
              </div>
            )}

            <form action={mudarStatus} className="mt-4">
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="status" value="nao_compareceu" />
              <Button type="submit" variante="fantasma" tamanho="sm">
                Marcar como não compareceu
              </Button>
            </form>
          </Card>
        ) : null}

        {concluido ? (
          <>
            <Card titulo="Como foi">
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-vc-texto/60">Início</dt>
                  <dd className="font-semibold">{fmtHoraTZ(a.inicio_real)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-vc-texto/60">Fim</dt>
                  <dd className="font-semibold">{fmtHoraTZ(a.fim_real)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-vc-texto/60">Horas debitadas</dt>
                  <dd className="font-semibold">
                    {fmtHoras(Number(a.horas_debitadas ?? 0))}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-vc-texto/60">Espera</dt>
                  <dd className="font-semibold">{a.minutos_espera ?? 0} min</dd>
                </div>
                <div>
                  <dt className="text-xs text-vc-texto/60">Km</dt>
                  <dd className="font-semibold">{a.km_rodados ?? 0} km</dd>
                </div>
                <div>
                  <dt className="text-xs text-vc-texto/60">Esforço</dt>
                  <dd className="font-semibold">{a.nivel_esforco ?? "—"}/5</dd>
                </div>
                <div>
                  <dt className="text-xs text-vc-texto/60">Extras</dt>
                  <dd className="font-semibold">{centavosParaReais(extras)}</dd>
                </div>
                {a.valor_avulso_centavos !== null ? (
                  <div>
                    <dt className="text-xs text-vc-texto/60">Valor avulso</dt>
                    <dd className="font-semibold">
                      {centavosParaReais(a.valor_avulso_centavos)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {a.observacoes_internas ? (
                <p className="mt-3 rounded-xl bg-vc-bege/40 px-3 py-2 text-sm">
                  <strong>Interno:</strong> {a.observacoes_internas}
                </p>
              ) : null}
            </Card>

            <Card titulo="Relatório para a família" className="scroll-mt-4">
              <div id="relatorio">
                <PainelRelatorio
                  id={a.id}
                  textoInicial={relatorioBase}
                  whatsappCliente={a.cliente?.whatsapp ?? ""}
                  enviadoEm={a.relatorio_enviado_em}
                />
              </div>
            </Card>
          </>
        ) : null}

        {!cancelado && !concluido ? (
          <Card titulo="Cancelar atendimento">
            <FormCancelar
              id={a.id}
              taxaEstimadaCentavos={taxaEstimada}
              horasGratis={cfg.cancelamento_gratis_horas}
              percentual={cfg.cancelamento_taxa_percentual}
            />
          </Card>
        ) : null}
      </div>
    </>
  );
}
