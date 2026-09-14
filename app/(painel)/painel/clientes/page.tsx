import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
} from "@/components/painel/ui";
import { exigirPerfil, linkWhatsApp } from "../../_lib/dados";

export const dynamic = "force-dynamic";

type LinhaCliente = {
  id: string;
  nome: string;
  whatsapp: string;
  consentimento_lgpd_em: string | null;
  acompanhado: { id: string; nome: string }[] | null;
};

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await exigirPerfil();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const supabase = await createClient();
  let consulta = supabase
    .from("cliente")
    .select("id, nome, whatsapp, consentimento_lgpd_em, acompanhado(id, nome)")
    .order("nome");
  if (q) consulta = consulta.ilike("nome", `%${q}%`);

  const { data } = await consulta;
  const clientes = (data ?? []) as unknown as LinhaCliente[];

  return (
    <>
      <PageHeader
        titulo="Clientes"
        subtitulo="Quem contrata o serviço e quem é acompanhado."
        acao={
          <LinkButton href="/painel/clientes/novo" variante="primario">
            + Novo cliente
          </LinkButton>
        }
      />

      <form className="mb-5" action="/painel/clientes">
        <label htmlFor="q" className="sr-only">
          Buscar cliente
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="Buscar pelo nome…"
          className="w-full min-h-11 rounded-xl border border-vc-bege-escuro bg-white px-3 py-2 text-base"
        />
      </form>

      {clientes.length === 0 ? (
        <EmptyState
          titulo={q ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
          descricao={
            q ? undefined : "Cadastre o primeiro cliente para começar a agendar."
          }
          acao={
            <LinkButton href="/painel/clientes/novo" variante="primario">
              Cadastrar cliente
            </LinkButton>
          }
        />
      ) : (
        <ul className="space-y-3">
          {clientes.map((c) => (
            <li key={c.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/painel/clientes/${c.id}`}
                      className="font-serif text-lg font-bold text-vc-verde underline-offset-2 hover:underline"
                    >
                      {c.nome}
                    </Link>
                    <p className="text-sm text-vc-texto/70">
                      Acompanha:{" "}
                      {(c.acompanhado ?? []).map((a) => a.nome).join(", ") ||
                        "ninguém cadastrado"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {c.consentimento_lgpd_em ? null : (
                      <Badge className="border-amber-300 bg-amber-100 text-amber-900">
                        sem consentimento
                      </Badge>
                    )}
                    <a
                      href={linkWhatsApp(c.whatsapp)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-vc-marrom underline underline-offset-2"
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
