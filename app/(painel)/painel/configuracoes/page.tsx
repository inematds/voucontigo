import { createClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader } from "@/components/painel/ui";
import FormConfiguracao from "@/components/painel/form-configuracao";
import FormAcompanhante from "@/components/painel/form-acompanhante";
import { exigirGestora, lerConfiguracao } from "../../_lib/dados";
import type { Acompanhante } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  await exigirGestora();
  const valores = await lerConfiguracao();

  const supabase = await createClient();
  const { data } = await supabase
    .from("acompanhante")
    .select("*")
    .order("nome");
  const acompanhantes = (data ?? []) as Acompanhante[];

  return (
    <>
      <PageHeader
        titulo="Configurações"
        subtitulo="Regras de negócio e textos. Só a gestora vê esta tela."
      />

      <Card titulo="Acompanhantes" className="mb-5">
        {acompanhantes.length === 0 ? (
          <p className="mb-3 text-sm text-vc-texto/60">
            Nenhuma acompanhante cadastrada.
          </p>
        ) : (
          <ul className="mb-4 space-y-3">
            {acompanhantes.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-vc-bege-escuro/60 bg-white p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{a.nome}</p>
                    <p className="text-xs text-vc-texto/60">
                      {a.whatsapp}
                      {a.telegram_chat_id ? ` · TG ${a.telegram_chat_id}` : ""}
                    </p>
                  </div>
                  <Badge
                    className={
                      a.ativo
                        ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                        : "border-stone-300 bg-stone-200 text-stone-700"
                    }
                  >
                    {a.ativo ? "ativa" : "inativa"}
                  </Badge>
                </div>
                <div className="mt-2">
                  <FormAcompanhante
                    valores={{
                      id: a.id,
                      nome: a.nome,
                      whatsapp: a.whatsapp,
                      telegram_chat_id: a.telegram_chat_id,
                      ativo: a.ativo,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <FormAcompanhante aberto={acompanhantes.length === 0} />
      </Card>

      <FormConfiguracao valores={valores} />
    </>
  );
}
