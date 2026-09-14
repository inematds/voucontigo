import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  BadgeStatus,
  Barra,
  Button,
  Card,
  LinkButton,
  PageHeader,
} from "@/components/painel/ui";
import FormCliente from "@/components/painel/form-cliente";
import FormAcompanhado from "@/components/painel/form-acompanhado";
import TimelineCliente from "@/components/painel/timeline-cliente";
import {
  exigirPerfil,
  lerConfigNumerica,
  linkWhatsApp,
} from "../../../_lib/dados";
import { fmtData, fmtHora } from "../../../_lib/datas";
import { fmtHoras } from "../../../_lib/dominio-local";
import { excluirAcompanhado } from "../../../_lib/acoes-cadastro";
import {
  MOBILIDADE_LABEL,
  TIPO_ATENDIMENTO_LABEL,
} from "@/lib/domain/types";
import type {
  Acompanhado,
  Cliente,
  StatusAtendimento,
  TipoAtendimento,
} from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export default async function ClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirPerfil();
  const supabase = await createClient();
  const { num: cfg } = await lerConfigNumerica();

  const { data: cliente } = await supabase
    .from("cliente")
    .select("*")
    .eq("id", id)
    .maybeSingle<Cliente>();

  if (!cliente) notFound();

  const [acompanhadosRes, atendimentosRes, pacotesRes] = await Promise.all([
    supabase
      .from("acompanhado")
      .select("*")
      .eq("cliente_id", id)
      .order("nome"),
    supabase
      .from("atendimento")
      .select(
        "id, data, hora_prevista_inicio, tipo, status, horas_debitadas, acompanhado:acompanhado_id(nome)",
      )
      .eq("cliente_id", id)
      .order("data", { ascending: false })
      .limit(25),
    supabase
      .from("pacote")
      .select("id, horas_contratadas, horas_usadas, valido_ate, status")
      .eq("cliente_id", id)
      .order("valido_ate", { ascending: false }),
  ]);

  const acompanhados = (acompanhadosRes.data ?? []) as Acompanhado[];
  const atendimentos = (atendimentosRes.data ?? []) as unknown as {
    id: string;
    data: string;
    hora_prevista_inicio: string;
    tipo: TipoAtendimento;
    status: StatusAtendimento;
    horas_debitadas: number | null;
    acompanhado: { nome: string } | null;
  }[];
  const pacotes = (pacotesRes.data ?? []) as {
    id: string;
    horas_contratadas: number;
    horas_usadas: number;
    valido_ate: string;
    status: string;
  }[];

  return (
    <>
      <PageHeader
        titulo={cliente.nome}
        subtitulo={`Cliente desde ${fmtData(cliente.criado_em.slice(0, 10))}`}
        acao={
          <a
            href={linkWhatsApp(cliente.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-xl bg-vc-bege px-4 font-semibold text-vc-texto"
          >
            Abrir WhatsApp
          </a>
        }
      />

      <div className="space-y-5">
        <Card titulo="Pessoas acompanhadas">
          {acompanhados.length === 0 ? (
            <p className="mb-3 text-sm text-vc-texto/60">
              Nenhuma pessoa cadastrada ainda.
            </p>
          ) : (
            <ul className="mb-4 space-y-3">
              {acompanhados.map((a) => (
                <li
                  key={a.id}
                  className="rounded-xl border border-vc-bege-escuro/60 bg-white p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {a.nome}
                        {a.apelido ? (
                          <span className="text-vc-texto/60"> ({a.apelido})</span>
                        ) : null}
                      </p>
                      <p className="text-sm text-vc-texto/70">{a.endereco}</p>
                      <p className="text-xs text-vc-texto/60">
                        {MOBILIDADE_LABEL[a.mobilidade]}
                        {a.telefone ? ` · ${a.telefone}` : ""}
                      </p>
                      {a.contato_emergencia_nome ? (
                        <p className="text-xs text-vc-texto/60">
                          Emergência: {a.contato_emergencia_nome}
                          {a.contato_emergencia_telefone
                            ? ` · ${a.contato_emergencia_telefone}`
                            : ""}
                        </p>
                      ) : null}
                      {a.preferencias ? (
                        <p className="mt-1 text-xs text-vc-texto/70">
                          <strong>Prefere:</strong> {a.preferencias}
                        </p>
                      ) : null}
                      {a.restricoes_declaradas ? (
                        <p className="text-xs text-vc-texto/70">
                          <strong>Restrições:</strong> {a.restricoes_declaradas}
                        </p>
                      ) : null}
                    </div>
                    <form action={excluirAcompanhado}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="cliente_id" value={id} />
                      <Button type="submit" variante="fantasma" tamanho="sm">
                        Excluir
                      </Button>
                    </form>
                  </div>
                  <div className="mt-2">
                    <FormAcompanhado
                      clienteId={id}
                      valores={{
                        id: a.id,
                        nome: a.nome,
                        apelido: a.apelido,
                        data_nascimento: a.data_nascimento,
                        endereco: a.endereco,
                        telefone: a.telefone,
                        contato_emergencia_nome: a.contato_emergencia_nome,
                        contato_emergencia_telefone:
                          a.contato_emergencia_telefone,
                        mobilidade: a.mobilidade,
                        preferencias: a.preferencias,
                        restricoes_declaradas: a.restricoes_declaradas,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <FormAcompanhado clienteId={id} aberto={acompanhados.length === 0} />
        </Card>

        <Card
          titulo="Pacotes"
          acao={
            <Link
              href={`/painel/pacotes/novo?cliente=${id}`}
              className="text-sm font-semibold text-vc-marrom underline underline-offset-2"
            >
              + vender pacote
            </Link>
          }
        >
          {pacotes.length === 0 ? (
            <p className="text-sm text-vc-texto/60">Nenhum pacote.</p>
          ) : (
            <ul className="space-y-3">
              {pacotes.map((p) => {
                const restantes =
                  Number(p.horas_contratadas) - Number(p.horas_usadas);
                return (
                  <li key={p.id}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold">
                        {fmtHoras(restantes)} de{" "}
                        {fmtHoras(Number(p.horas_contratadas))}
                      </span>
                      <Badge>
                        {p.status} · vence {fmtData(p.valido_ate)}
                      </Badge>
                    </div>
                    <Barra
                      valor={Number(p.horas_usadas)}
                      total={Number(p.horas_contratadas)}
                      alerta={restantes <= cfg.saldo_baixo_horas}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          titulo="Histórico de atendimentos"
          acao={
            <LinkButton
              href={`/painel/agenda/novo?cliente=${id}`}
              variante="fantasma"
              tamanho="sm"
            >
              + agendar
            </LinkButton>
          }
        >
          {atendimentos.length === 0 ? (
            <p className="text-sm text-vc-texto/60">
              Nenhum atendimento registrado.
            </p>
          ) : (
            <ul className="space-y-2">
              {atendimentos.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-vc-bege-escuro/60 bg-white px-3 py-2"
                >
                  <Link
                    href={`/painel/atendimentos/${a.id}`}
                    className="min-w-0 underline-offset-2 hover:underline"
                  >
                    <span className="font-semibold">
                      {fmtData(a.data)} {fmtHora(a.hora_prevista_inicio)}
                    </span>{" "}
                    <span className="text-sm text-vc-texto/70">
                      {TIPO_ATENDIMENTO_LABEL[a.tipo]} ·{" "}
                      {a.acompanhado?.nome ?? ""}
                    </span>
                  </Link>
                  <span className="flex items-center gap-2">
                    {a.horas_debitadas ? (
                      <span className="text-xs text-vc-texto/60">
                        {fmtHoras(Number(a.horas_debitadas))}
                      </span>
                    ) : null}
                    <BadgeStatus status={a.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <TimelineCliente clienteId={cliente.id} />

        <Card titulo="Dados do cliente">
          <FormCliente
            valores={{
              id: cliente.id,
              nome: cliente.nome,
              whatsapp: cliente.whatsapp,
              email: cliente.email,
              cpf: cliente.cpf,
              endereco_cobranca: cliente.endereco_cobranca,
              origem: cliente.origem,
              observacoes: cliente.observacoes,
              consentimento_lgpd_em: cliente.consentimento_lgpd_em,
            }}
          />
        </Card>
      </div>
    </>
  );
}
