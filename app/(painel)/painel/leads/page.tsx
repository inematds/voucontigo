import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  cn,
} from "@/components/painel/ui";
import AcoesLead from "@/components/painel/acoes-lead";
import {
  exigirPerfil,
  lerConfiguracao,
  linkWhatsApp,
} from "../../_lib/dados";
import { fmtDataHoraTZ } from "../../_lib/datas";
import { renderTemplate } from "../../_lib/dominio-local";
import type { OrigemLead, StatusLead } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

const TEMPLATE_LEAD_PADRAO =
  "Oi, {nome}! Aqui é do Vou Contigo. Vi que você pediu informações sobre acompanhamento. Me conta um pouco: para quem é e que tipo de compromisso? 💚";

const STATUS_COR: Record<StatusLead, string> = {
  novo: "border-amber-300 bg-amber-100 text-amber-900",
  contatado: "border-sky-300 bg-sky-100 text-sky-900",
  convertido: "border-emerald-300 bg-emerald-100 text-emerald-900",
  perdido: "border-stone-300 bg-stone-200 text-stone-700",
};

type LinhaLead = {
  id: string;
  nome: string;
  whatsapp: string;
  mensagem: string | null;
  origem: OrigemLead;
  status: StatusLead;
  cliente_id: string | null;
  criado_em: string;
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await exigirPerfil();
  const sp = await searchParams;
  const filtro = (
    ["novo", "contatado", "convertido", "perdido"] as string[]
  ).includes(sp.status ?? "")
    ? sp.status!
    : "todos";

  const supabase = await createClient();
  const cfg = await lerConfiguracao();

  let consulta = supabase
    .from("lead")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(100);
  if (filtro !== "todos") consulta = consulta.eq("status", filtro);

  const { data } = await consulta;
  const leads = (data ?? []) as LinhaLead[];

  const abas = ["todos", "novo", "contatado", "convertido", "perdido"];

  return (
    <>
      <PageHeader
        titulo="Leads"
        subtitulo="Pedidos de contato vindos da landing e das redes."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {abas.map((a) => (
          <Link
            key={a}
            href={a === "todos" ? "/painel/leads" : `/painel/leads?status=${a}`}
            className={cn(
              "rounded-xl border px-3 py-2 text-sm font-semibold capitalize",
              filtro === a
                ? "border-vc-verde bg-vc-verde text-vc-creme"
                : "border-vc-bege-escuro bg-white text-vc-texto/70",
            )}
          >
            {a}
          </Link>
        ))}
      </div>

      {leads.length === 0 ? (
        <EmptyState titulo="Nenhum lead neste filtro" />
      ) : (
        <ul className="space-y-3">
          {leads.map((l) => (
            <li key={l.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-serif text-lg font-bold text-vc-verde">
                      {l.nome}
                    </p>
                    <p className="text-sm text-vc-texto/80">
                      {l.mensagem || "Sem mensagem."}
                    </p>
                    <p className="text-xs text-vc-texto/60">
                      {l.origem} · {fmtDataHoraTZ(l.criado_em)}
                    </p>
                    {l.cliente_id ? (
                      <Link
                        href={`/painel/clientes/${l.cliente_id}`}
                        className="text-xs font-semibold text-vc-marrom underline underline-offset-2"
                      >
                        Ver cliente
                      </Link>
                    ) : null}
                  </div>
                  <Badge className={STATUS_COR[l.status]}>{l.status}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={linkWhatsApp(
                      l.whatsapp,
                      renderTemplate(
                        cfg.template_resposta_lead || TEMPLATE_LEAD_PADRAO,
                        { nome: l.nome },
                      ),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center rounded-xl bg-vc-bege px-3 text-sm font-semibold text-vc-texto"
                  >
                    Abrir WhatsApp
                  </a>
                  <AcoesLead
                    id={l.id}
                    status={l.status}
                    jaCliente={Boolean(l.cliente_id)}
                  />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
