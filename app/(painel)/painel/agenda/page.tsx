import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  BadgeStatus,
  Card,
  CORES_STATUS,
  EmptyState,
  LinkButton,
  PageHeader,
  cn,
} from "@/components/painel/ui";
import BotoesRapidos from "@/components/painel/botoes-rapidos";
import { exigirPerfil } from "../../_lib/dados";
import {
  diasDaSemana,
  fmtDataCurta,
  fmtDataLonga,
  fmtDiaSemana,
  fmtHora,
  hojeISO,
  inicioSemanaISO,
  somarDiasISO,
} from "../../_lib/datas";
import { TIPO_ATENDIMENTO_LABEL } from "@/lib/domain/types";
import type { StatusAtendimento, TipoAtendimento } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

type Linha = {
  id: string;
  data: string;
  hora_prevista_inicio: string;
  tipo: TipoAtendimento;
  status: StatusAtendimento;
  endereco_destino: string;
  cliente: { nome: string } | null;
  acompanhado: { nome: string; apelido: string | null } | null;
};

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ visao?: string; ref?: string }>;
}) {
  await exigirPerfil();
  const sp = await searchParams;
  const visao = sp.visao === "dia" ? "dia" : "semana";
  const hoje = hojeISO();
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(sp.ref ?? "") ? sp.ref! : hoje;

  const de = visao === "dia" ? ref : inicioSemanaISO(ref);
  const ate = visao === "dia" ? ref : somarDiasISO(de, 6);

  const supabase = await createClient();
  const { data } = await supabase
    .from("atendimento")
    .select(
      "id, data, hora_prevista_inicio, tipo, status, endereco_destino, cliente:cliente_id(nome), acompanhado:acompanhado_id(nome, apelido)",
    )
    .gte("data", de)
    .lte("data", ate)
    .order("data")
    .order("hora_prevista_inicio");

  const linhas = (data ?? []) as unknown as Linha[];
  const dias = visao === "dia" ? [ref] : diasDaSemana(de);
  const passo = visao === "dia" ? 1 : 7;

  const url = (novoRef: string, novaVisao = visao) =>
    `/painel/agenda?visao=${novaVisao}&ref=${novoRef}`;

  return (
    <>
      <PageHeader
        titulo="Agenda"
        subtitulo={
          visao === "dia"
            ? fmtDataLonga(ref)
            : `Semana de ${fmtDataCurta(de)} a ${fmtDataCurta(ate)}`
        }
        acao={
          <LinkButton
            href={`/painel/agenda/novo?data=${ref}`}
            variante="primario"
          >
            + Novo
          </LinkButton>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <LinkButton
          href={url(somarDiasISO(ref, -passo))}
          variante="fantasma"
          tamanho="sm"
          aria-label="Período anterior"
        >
          ← Anterior
        </LinkButton>
        <LinkButton href={url(hoje)} variante="fantasma" tamanho="sm">
          Hoje
        </LinkButton>
        <LinkButton
          href={url(somarDiasISO(ref, passo))}
          variante="fantasma"
          tamanho="sm"
          aria-label="Próximo período"
        >
          Próximo →
        </LinkButton>

        <span className="ml-auto inline-flex overflow-hidden rounded-xl border border-vc-bege-escuro">
          <Link
            href={url(ref, "semana")}
            className={cn(
              "px-3 py-2 text-sm font-semibold",
              visao === "semana"
                ? "bg-vc-verde text-vc-creme"
                : "bg-white text-vc-texto/70",
            )}
          >
            Semana
          </Link>
          <Link
            href={url(ref, "dia")}
            className={cn(
              "px-3 py-2 text-sm font-semibold",
              visao === "dia"
                ? "bg-vc-verde text-vc-creme"
                : "bg-white text-vc-texto/70",
            )}
          >
            Dia
          </Link>
        </span>
      </div>

      {linhas.length === 0 ? (
        <EmptyState
          titulo="Nenhum atendimento neste período"
          acao={
            <LinkButton
              href={`/painel/agenda/novo?data=${ref}`}
              variante="primario"
            >
              Agendar atendimento
            </LinkButton>
          }
        />
      ) : (
        <div className="space-y-4">
          {dias.map((dia) => {
            const doDia = linhas.filter((l) => l.data === dia);
            return (
              <Card
                key={dia}
                titulo={
                  <span className="capitalize">
                    {fmtDiaSemana(dia)} · {fmtDataCurta(dia)}
                    {dia === hoje ? " · hoje" : ""}
                  </span>
                }
                acao={
                  <Link
                    href={`/painel/agenda/novo?data=${dia}`}
                    className="text-sm font-semibold text-vc-marrom underline underline-offset-2"
                  >
                    + agendar
                  </Link>
                }
              >
                {doDia.length === 0 ? (
                  <p className="text-sm text-vc-texto/50">Livre.</p>
                ) : (
                  <ul className="space-y-2">
                    {doDia.map((l) => (
                      <li
                        key={l.id}
                        className={cn(
                          "rounded-xl border-l-4 bg-white p-3",
                          CORES_STATUS[l.status],
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link
                              href={`/painel/atendimentos/${l.id}`}
                              className="font-semibold underline-offset-2 hover:underline"
                            >
                              {fmtHora(l.hora_prevista_inicio)} ·{" "}
                              {l.acompanhado?.apelido ||
                                l.acompanhado?.nome ||
                                "—"}
                            </Link>
                            <p className="text-xs opacity-80">
                              {TIPO_ATENDIMENTO_LABEL[l.tipo]} ·{" "}
                              {l.endereco_destino}
                            </p>
                            <p className="text-xs opacity-70">
                              {l.cliente?.nome ?? ""}
                            </p>
                          </div>
                          <BadgeStatus status={l.status} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <BotoesRapidos id={l.id} status={l.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
