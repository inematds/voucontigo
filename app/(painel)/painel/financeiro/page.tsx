import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  BadgePagamento,
  Button,
  Card,
  EmptyState,
  Metrica,
  PageHeader,
  cn,
} from "@/components/painel/ui";
import FormCobranca from "@/components/painel/form-cobranca";
import BotaoCopiar from "@/components/painel/botao-copiar";
import { exigirPerfil, lerConfiguracao } from "../../_lib/dados";
import { fmtData, hojeISO } from "../../_lib/datas";
import {
  centavosParaReais,
  fmtHoras,
  renderTemplate,
} from "../../_lib/dominio-local";
import { cancelarCobranca, marcarPago } from "../../_lib/acoes-comercial";
import { TIPO_ATENDIMENTO_LABEL } from "@/lib/domain/types";
import type { StatusPagamento, TipoAtendimento } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

const TEMPLATE_PIX_PADRAO =
  "Oi, {nome}! Segue a cobrança de {valor} referente a {descricao}. Chave PIX: {chave_pix}. Assim que pagar é só me mandar o comprovante. 💚";

type LinhaPagamento = {
  id: string;
  valor_centavos: number;
  meio: string;
  status: StatusPagamento;
  vencimento: string | null;
  pago_em: string | null;
  descricao: string | null;
  criado_em: string;
  cliente: { id: string; nome: string } | null;
};

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  await exigirPerfil();
  const sp = await searchParams;
  const filtro =
    sp.filtro === "pago" || sp.filtro === "pendente" ? sp.filtro : "todos";

  const supabase = await createClient();
  const cfg = await lerConfiguracao();
  const hoje = hojeISO();
  const inicioMes = `${hoje.slice(0, 7)}-01`;

  let consulta = supabase
    .from("pagamento")
    .select(
      "id, valor_centavos, meio, status, vencimento, pago_em, descricao, criado_em, cliente:cliente_id(id, nome)",
    )
    .order("criado_em", { ascending: false })
    .limit(100);
  if (filtro !== "todos") consulta = consulta.eq("status", filtro);

  const [pagamentosRes, totalMesRes, totalPendenteRes, cli, pac, atd] =
    await Promise.all([
    consulta,
    supabase
      .from("pagamento")
      .select("valor_centavos")
      .eq("status", "pago")
      .gte("pago_em", `${inicioMes}T00:00:00-03:00`),
    supabase
      .from("pagamento")
      .select("valor_centavos")
      .eq("status", "pendente"),
    supabase.from("cliente").select("id, nome").order("nome"),
    supabase
      .from("pacote")
      .select("id, cliente_id, horas_contratadas, valido_ate")
      .order("valido_ate", { ascending: false })
      .limit(50),
    supabase
      .from("atendimento")
      .select("id, cliente_id, data, tipo")
      .order("data", { ascending: false })
      .limit(50),
    ]);

  const pagamentos = (pagamentosRes.data ?? []) as unknown as LinhaPagamento[];

  const soma = (linhas: { valor_centavos: number }[] | null) =>
    (linhas ?? []).reduce((s, p) => s + Number(p.valor_centavos), 0);
  const totalMes = soma(totalMesRes.data);
  const totalPendente = soma(totalPendenteRes.data);

  const clientes = (cli.data ?? []) as { id: string; nome: string }[];
  const pacotes = (
    (pac.data ?? []) as {
      id: string;
      cliente_id: string;
      horas_contratadas: number;
      valido_ate: string;
    }[]
  ).map((p) => ({
    id: p.id,
    cliente_id: p.cliente_id,
    rotulo: `${fmtHoras(Number(p.horas_contratadas))} · vence ${fmtData(p.valido_ate)}`,
  }));
  const atendimentos = (
    (atd.data ?? []) as {
      id: string;
      cliente_id: string;
      data: string;
      tipo: TipoAtendimento;
    }[]
  ).map((a) => ({
    id: a.id,
    cliente_id: a.cliente_id,
    rotulo: `${fmtData(a.data)} · ${TIPO_ATENDIMENTO_LABEL[a.tipo]}`,
  }));

  const abas = [
    { valor: "todos", rotulo: "Todos" },
    { valor: "pendente", rotulo: "Pendentes" },
    { valor: "pago", rotulo: "Pagos" },
  ];

  return (
    <>
      <PageHeader
        titulo="Financeiro"
        subtitulo="Cobranças manuais (PIX, dinheiro, cartão)."
      />

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Metrica
          rotulo="Recebido no mês"
          valor={centavosParaReais(totalMes)}
          detalhe={`desde ${fmtData(inicioMes)}`}
        />
        <Metrica
          rotulo="Em aberto"
          valor={centavosParaReais(totalPendente)}
          detalhe="cobranças pendentes"
        />
      </div>

      <Card className="mb-5">
        <FormCobranca
          clientes={clientes}
          pacotes={pacotes}
          atendimentos={atendimentos}
        />
      </Card>

      <div className="mb-4 inline-flex overflow-hidden rounded-xl border border-vc-bege-escuro">
        {abas.map((a) => (
          <Link
            key={a.valor}
            href={`/painel/financeiro?filtro=${a.valor}`}
            className={cn(
              "px-4 py-2 text-sm font-semibold",
              filtro === a.valor
                ? "bg-vc-verde text-vc-creme"
                : "bg-white text-vc-texto/70",
            )}
          >
            {a.rotulo}
          </Link>
        ))}
      </div>

      {pagamentos.length === 0 ? (
        <EmptyState titulo="Nenhuma cobrança neste filtro" />
      ) : (
        <ul className="space-y-3">
          {pagamentos.map((p) => {
            const textoPix = renderTemplate(
              cfg.template_cobranca_pix || TEMPLATE_PIX_PADRAO,
              {
                nome: p.cliente?.nome ?? "",
                valor: centavosParaReais(p.valor_centavos),
                descricao: p.descricao ?? "serviço Vou Contigo",
                chave_pix: cfg.chave_pix ?? "(defina a chave em Configurações)",
                vencimento: p.vencimento ? fmtData(p.vencimento) : "",
              },
            );

            return (
              <li key={p.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-serif text-lg font-bold text-vc-verde">
                        {centavosParaReais(p.valor_centavos)}
                      </p>
                      <p className="text-sm">
                        {p.cliente ? (
                          <Link
                            href={`/painel/clientes/${p.cliente.id}`}
                            className="underline underline-offset-2"
                          >
                            {p.cliente.nome}
                          </Link>
                        ) : (
                          "—"
                        )}{" "}
                        · {p.meio}
                      </p>
                      <p className="text-xs text-vc-texto/60">
                        {p.descricao ?? "sem descrição"}
                        {p.vencimento ? ` · vence ${fmtData(p.vencimento)}` : ""}
                      </p>
                    </div>
                    <BadgePagamento status={p.status} />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.meio === "pix" ? (
                      <BotaoCopiar texto={textoPix} rotulo="Copiar cobrança PIX" />
                    ) : null}
                    {p.status === "pendente" ? (
                      <>
                        <form action={marcarPago}>
                          <input type="hidden" name="id" value={p.id} />
                          <Button type="submit" tamanho="sm" variante="primario">
                            Marcar como pago
                          </Button>
                        </form>
                        <form action={cancelarCobranca}>
                          <input type="hidden" name="id" value={p.id} />
                          <Button type="submit" tamanho="sm" variante="fantasma">
                            Cancelar
                          </Button>
                        </form>
                      </>
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
