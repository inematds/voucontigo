import Link from "next/link";
import { admin } from "@/lib/telegram/dados";
import {
  listarConversas,
  ultimaMensagemPorConversa,
} from "@/lib/telegram/conversas";
import { Badge, Card, EmptyState, PageHeader, cn } from "@/components/painel/ui";
import { exigirPerfil, linkWhatsApp } from "../../_lib/dados";
import { fmtDataHoraTZ } from "../../_lib/datas";
import type { EstadoConversa } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

const ESTADO_LABEL: Partial<Record<EstadoConversa, string>> = {
  menu: "No menu do bot",
  humano: "Aguardando humano",
  encerrada: "Encerrada",
};

function rotuloEstado(e: EstadoConversa): string {
  return ESTADO_LABEL[e] ?? `Agendando (${e.replace(/^agendar_|^cancelar_/, "")})`;
}

const ESTADO_COR: Partial<Record<EstadoConversa, string>> = {
  humano: "border-amber-300 bg-amber-100 text-amber-900",
  encerrada: "border-stone-300 bg-stone-200 text-stone-700",
};

/** "há 5 min" / "há 2 h" / "há 3 d". */
function desde(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / (60 * 24))} d`;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  await exigirPerfil();
  const sp = await searchParams;
  const soHumano = sp.filtro === "humano";

  const db = admin();
  const [conversas, leadsRes] = await Promise.all([
    listarConversas({ apenasHumano: soHumano, db, limite: 100 }),
    db
      .from("lead")
      .select("id, nome, whatsapp, mensagem, origem, criado_em")
      .eq("status", "novo")
      .order("criado_em", { ascending: false })
      .limit(10),
  ]);

  const ultimas = await ultimaMensagemPorConversa(
    conversas.map((c) => c.id),
    db,
  );

  const leads = (leadsRes.data ?? []) as {
    id: string;
    nome: string;
    whatsapp: string;
    mensagem: string | null;
    origem: string;
    criado_em: string;
  }[];

  return (
    <>
      <PageHeader
        titulo="Inbox"
        subtitulo="Conversas de WhatsApp e leads novos em um lugar só."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { href: "/painel/inbox", rotulo: "Todas", on: !soHumano },
          {
            href: "/painel/inbox?filtro=humano",
            rotulo: "Aguardando humano",
            on: soHumano,
          },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className={cn(
              "rounded-xl border px-3 py-2 text-sm font-semibold",
              a.on
                ? "border-vc-verde bg-vc-verde text-vc-creme"
                : "border-vc-bege-escuro bg-white text-vc-texto/70",
            )}
          >
            {a.rotulo}
          </Link>
        ))}
      </div>

      {leads.length > 0 ? (
        <Card titulo={`Leads novos (${leads.length})`} className="mb-5">
          <ul className="grid gap-2 sm:grid-cols-2">
            {leads.map((l) => (
              <li
                key={l.id}
                className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2"
              >
                <p className="font-semibold text-vc-texto">{l.nome}</p>
                <p className="text-xs text-vc-texto/70">
                  {l.origem} · {fmtDataHoraTZ(l.criado_em)}
                </p>
                {l.mensagem ? (
                  <p className="mt-1 line-clamp-2 text-sm text-vc-texto/80">
                    “{l.mensagem}”
                  </p>
                ) : null}
                <a
                  href={linkWhatsApp(l.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs font-semibold text-vc-marrom underline underline-offset-2"
                >
                  Abrir WhatsApp
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {conversas.length === 0 ? (
        <EmptyState
          titulo={
            soHumano
              ? "Ninguém aguardando atendimento humano"
              : "Nenhuma conversa ainda"
          }
          descricao="As conversas aparecem aqui assim que alguém escreve no WhatsApp."
        />
      ) : (
        <ul className="space-y-2">
          {conversas.map((c) => (
            <li key={c.id}>
              <Link
                href={`/painel/inbox/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-vc-bege-escuro/60 bg-white/80 px-4 py-3 hover:bg-vc-bege/30"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-vc-texto">
                    {c.cliente?.nome ?? `+${c.whatsapp}`}
                  </span>
                  <span className="block truncate text-sm text-vc-texto/70">
                    {ultimas.get(c.id)
                      ? `${ultimas.get(c.id)!.direcao === "saida" ? "Você: " : ""}${ultimas.get(c.id)!.corpo}`
                      : "Sem mensagens."}
                  </span>
                  <span className="block text-xs text-vc-texto/60">
                    {c.whatsapp} · {desde(c.ultima_mensagem_em)}
                  </span>
                </span>
                <Badge className={ESTADO_COR[c.estado]}>
                  {rotuloEstado(c.estado)}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
