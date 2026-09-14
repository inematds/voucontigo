import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Alerta,
  Badge,
  BadgeStatus,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
} from "@/components/painel/ui";
import {
  exigirPerfil,
  lerConfigNumerica,
  linkWhatsApp,
} from "../_lib/dados";
import { fmtDataLonga, fmtHora, hojeISO } from "../_lib/datas";
import { fmtHoras } from "../_lib/dominio-local";
import { TIPO_ATENDIMENTO_LABEL } from "@/lib/domain/types";
import type { StatusAtendimento, TipoAtendimento } from "@/lib/domain/types";
import BotoesRapidos from "@/components/painel/botoes-rapidos";

export const dynamic = "force-dynamic";

type LinhaHoje = {
  id: string;
  tipo: TipoAtendimento;
  status: StatusAtendimento;
  hora_prevista_inicio: string;
  endereco_destino: string;
  cliente: { id: string; nome: string; whatsapp: string } | null;
  acompanhado: { nome: string; apelido: string | null } | null;
};

export default async function HojePage() {
  const { perfil } = await exigirPerfil();
  const supabase = await createClient();
  const hoje = hojeISO();
  const { num: cfg } = await lerConfigNumerica();

  const [atendimentosRes, leadsRes, pacotesRes, pendentesRes] =
    await Promise.all([
      supabase
        .from("atendimento")
        .select(
          "id, tipo, status, hora_prevista_inicio, endereco_destino, cliente:cliente_id(id, nome, whatsapp), acompanhado:acompanhado_id(nome, apelido)",
        )
        .eq("data", hoje)
        .order("hora_prevista_inicio", { ascending: true }),
      supabase
        .from("lead")
        .select("id, nome, whatsapp, mensagem, criado_em")
        .eq("status", "novo")
        .order("criado_em", { ascending: false })
        .limit(5),
      supabase
        .from("pacote")
        .select(
          "id, horas_contratadas, horas_usadas, cliente:cliente_id(id, nome)",
        )
        .eq("status", "ativo"),
      supabase
        .from("atendimento")
        .select("id, data, acompanhado:acompanhado_id(nome)")
        .eq("status", "concluido")
        .is("relatorio_enviado_em", null)
        .order("data", { ascending: true })
        .limit(10),
    ]);

  const atendimentos = (atendimentosRes.data ?? []) as unknown as LinhaHoje[];
  const leads = (leadsRes.data ?? []) as {
    id: string;
    nome: string;
    whatsapp: string;
    mensagem: string | null;
    criado_em: string;
  }[];
  const pacotes = (pacotesRes.data ?? []) as unknown as {
    id: string;
    horas_contratadas: number;
    horas_usadas: number;
    cliente: { id: string; nome: string } | null;
  }[];
  const pendentes = (pendentesRes.data ?? []) as unknown as {
    id: string;
    data: string;
    acompanhado: { nome: string } | null;
  }[];

  const saldoBaixo = pacotes
    .map((p) => ({
      ...p,
      restantes: Number(p.horas_contratadas) - Number(p.horas_usadas),
    }))
    .filter((p) => p.restantes <= cfg.saldo_baixo_horas)
    .sort((a, b) => a.restantes - b.restantes);

  return (
    <>
      <PageHeader
        titulo="Hoje"
        subtitulo={`${fmtDataLonga(hoje)} · olá, ${perfil.nome || "equipe"}`}
        acao={
          <LinkButton href="/painel/agenda/novo" variante="primario">
            + Novo atendimento
          </LinkButton>
        }
      />

      {pendentes.length > 0 ? (
        <Alerta tom="aviso">
          <strong>{pendentes.length}</strong>{" "}
          {pendentes.length === 1
            ? "atendimento concluído sem relatório enviado."
            : "atendimentos concluídos sem relatório enviado."}{" "}
          <Link
            href="/painel/agenda"
            className="font-semibold underline underline-offset-2"
          >
            Ver na agenda
          </Link>
        </Alerta>
      ) : null}

      <div className="space-y-5">
        <Card titulo="Agenda do dia">
          {atendimentos.length === 0 ? (
            <EmptyState
              titulo="Nenhum atendimento hoje"
              descricao="Aproveite para organizar a semana ou cadastrar um novo cliente."
              acao={
                <LinkButton href="/painel/agenda/novo" variante="primario">
                  Agendar atendimento
                </LinkButton>
              }
            />
          ) : (
            <ul className="space-y-3">
              {atendimentos.map((a) => (
                <li
                  key={a.id}
                  className="rounded-xl border border-vc-bege-escuro/60 bg-white p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-serif text-lg font-bold text-vc-verde">
                        {fmtHora(a.hora_prevista_inicio)} ·{" "}
                        {a.acompanhado?.apelido || a.acompanhado?.nome || "—"}
                      </p>
                      <p className="text-sm text-vc-texto/70">
                        {TIPO_ATENDIMENTO_LABEL[a.tipo]} · {a.endereco_destino}
                      </p>
                      <p className="text-xs text-vc-texto/60">
                        Cliente: {a.cliente?.nome ?? "—"}
                      </p>
                    </div>
                    <BadgeStatus status={a.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <BotoesRapidos id={a.id} status={a.status} />
                    <LinkButton
                      href={`/painel/atendimentos/${a.id}`}
                      variante="fantasma"
                      tamanho="sm"
                    >
                      Abrir
                    </LinkButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          titulo="Leads novos"
          acao={
            <Link
              href="/painel/leads"
              className="text-sm font-semibold text-vc-marrom underline underline-offset-2"
            >
              Ver todos
            </Link>
          }
        >
          {leads.length === 0 ? (
            <p className="text-sm text-vc-texto/60">
              Nenhum lead novo no momento.
            </p>
          ) : (
            <ul className="space-y-2">
              {leads.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-vc-bege-escuro/60 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{l.nome}</p>
                    <p className="truncate text-xs text-vc-texto/60">
                      {l.mensagem || "Sem mensagem"}
                    </p>
                  </div>
                  <a
                    href={linkWhatsApp(l.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-vc-marrom underline underline-offset-2"
                  >
                    WhatsApp
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          titulo="Saldo baixo"
          acao={
            <Link
              href="/painel/pacotes"
              className="text-sm font-semibold text-vc-marrom underline underline-offset-2"
            >
              Ver pacotes
            </Link>
          }
        >
          {saldoBaixo.length === 0 ? (
            <p className="text-sm text-vc-texto/60">
              Todos os pacotes ativos estão com saldo acima de{" "}
              {fmtHoras(cfg.saldo_baixo_horas)}.
            </p>
          ) : (
            <ul className="space-y-2">
              {saldoBaixo.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-vc-bege-escuro/60 bg-white px-3 py-2"
                >
                  <span className="font-semibold">
                    {p.cliente?.nome ?? "Cliente"}
                  </span>
                  <Badge className="border-vc-marrom/40 bg-vc-bege text-vc-marrom">
                    resta {fmtHoras(p.restantes)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
