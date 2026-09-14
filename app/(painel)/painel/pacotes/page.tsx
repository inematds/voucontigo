import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  Barra,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
} from "@/components/painel/ui";
import { exigirPerfil, lerConfigNumerica } from "../../_lib/dados";
import { fmtData } from "../../_lib/datas";
import { fmtHoras } from "../../_lib/dominio-local";
import type { StatusPacote } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

type LinhaPacote = {
  id: string;
  horas_contratadas: number;
  horas_usadas: number;
  valido_de: string;
  valido_ate: string;
  status: StatusPacote;
  cliente: { id: string; nome: string } | null;
  plano: { nome: string } | null;
};

export default async function PacotesPage() {
  await exigirPerfil();
  const supabase = await createClient();
  const { num: cfg } = await lerConfigNumerica();

  const { data } = await supabase
    .from("pacote")
    .select(
      "id, horas_contratadas, horas_usadas, valido_de, valido_ate, status, cliente:cliente_id(id, nome), plano:plano_id(nome)",
    )
    .order("status")
    .order("valido_ate", { ascending: false });

  const pacotes = (data ?? []) as unknown as LinhaPacote[];

  return (
    <>
      <PageHeader
        titulo="Pacotes"
        subtitulo="Horas contratadas, usadas e restantes por cliente."
        acao={
          <LinkButton href="/painel/pacotes/novo" variante="primario">
            + Vender pacote
          </LinkButton>
        }
      />

      {pacotes.length === 0 ? (
        <EmptyState
          titulo="Nenhum pacote vendido"
          descricao="Venda um pacote para controlar o saldo de horas do cliente."
          acao={
            <LinkButton href="/painel/pacotes/novo" variante="primario">
              Vender pacote
            </LinkButton>
          }
        />
      ) : (
        <ul className="space-y-3">
          {pacotes.map((p) => {
            const contratadas = Number(p.horas_contratadas);
            const usadas = Number(p.horas_usadas);
            const restantes = contratadas - usadas;
            const baixo = p.status === "ativo" && restantes <= cfg.saldo_baixo_horas;
            return (
              <li key={p.id}>
                <Card>
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-serif text-lg font-bold text-vc-verde">
                        {p.cliente ? (
                          <Link
                            href={`/painel/clientes/${p.cliente.id}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {p.cliente.nome}
                          </Link>
                        ) : (
                          "Cliente"
                        )}
                      </p>
                      <p className="text-sm text-vc-texto/70">
                        {p.plano?.nome ?? "Plano"} · {fmtData(p.valido_de)} a{" "}
                        {fmtData(p.valido_ate)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge>{p.status}</Badge>
                      {baixo ? (
                        <Badge className="border-vc-marrom/40 bg-vc-bege text-vc-marrom">
                          saldo baixo
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <Barra valor={usadas} total={contratadas} alerta={baixo} />
                  <p className="mt-1 text-sm text-vc-texto/70">
                    {fmtHoras(usadas)} usadas · <strong>{fmtHoras(restantes)} restantes</strong>{" "}
                    de {fmtHoras(contratadas)}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
