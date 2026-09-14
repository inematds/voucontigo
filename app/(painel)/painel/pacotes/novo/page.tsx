import { createClient } from "@/lib/supabase/server";
import {
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
} from "@/components/painel/ui";
import FormPacote from "@/components/painel/form-pacote";
import { exigirPerfil } from "../../../_lib/dados";
import { hojeISO, somarDiasISO } from "../../../_lib/datas";
import { centavosParaReais, fmtHoras } from "../../../_lib/dominio-local";

export const dynamic = "force-dynamic";

export default async function NovoPacotePage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>;
}) {
  await exigirPerfil();
  const sp = await searchParams;
  const supabase = await createClient();

  const [cli, pla] = await Promise.all([
    supabase.from("cliente").select("id, nome").order("nome"),
    supabase
      .from("plano")
      .select("id, nome, horas, valor_centavos")
      .eq("ativo", true)
      .order("ordem"),
  ]);

  const clientes = (cli.data ?? []) as { id: string; nome: string }[];
  const planos = (
    (pla.data ?? []) as {
      id: string;
      nome: string;
      horas: number;
      valor_centavos: number;
    }[]
  ).map((p) => ({
    id: p.id,
    rotulo: `${p.nome} — ${fmtHoras(Number(p.horas))} · ${centavosParaReais(p.valor_centavos)}`,
  }));

  const hoje = hojeISO();

  return (
    <>
      <PageHeader
        titulo="Vender pacote"
        subtitulo="Horas pré-pagas com validade."
      />
      <Card>
        {clientes.length === 0 || planos.length === 0 ? (
          <EmptyState
            titulo={
              clientes.length === 0
                ? "Cadastre um cliente primeiro"
                : "Nenhum plano ativo no catálogo"
            }
            descricao={
              planos.length === 0
                ? "Cadastre os planos na tabela `plano` para poder vender pacotes."
                : undefined
            }
            acao={
              clientes.length === 0 ? (
                <LinkButton href="/painel/clientes/novo" variante="primario">
                  Cadastrar cliente
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <FormPacote
            clientes={clientes}
            planos={planos}
            clienteInicial={sp.cliente}
            validoDe={hoje}
            validoAte={somarDiasISO(hoje, 30)}
          />
        )}
      </Card>
    </>
  );
}
