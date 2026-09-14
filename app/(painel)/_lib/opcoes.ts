import { createClient } from "@/lib/supabase/server";
import { fmtData } from "./datas";
import { fmtHoras } from "./dominio-local";
import type {
  OpcaoAcompanhado,
  OpcaoAcompanhante,
  OpcaoCliente,
  OpcaoPacote,
} from "@/components/painel/form-atendimento";

/** Carrega as listas necessárias para o formulário de atendimento. */
export async function carregarOpcoesAtendimento(): Promise<{
  clientes: OpcaoCliente[];
  acompanhados: OpcaoAcompanhado[];
  pacotes: OpcaoPacote[];
  acompanhantes: OpcaoAcompanhante[];
}> {
  const supabase = await createClient();

  const [cli, aco, pac, acp] = await Promise.all([
    supabase.from("cliente").select("id, nome").order("nome"),
    supabase.from("acompanhado").select("id, cliente_id, nome").order("nome"),
    supabase
      .from("pacote")
      .select("id, cliente_id, horas_contratadas, horas_usadas, valido_ate")
      .eq("status", "ativo")
      .order("valido_ate"),
    supabase
      .from("acompanhante")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome"),
  ]);

  const pacotes: OpcaoPacote[] = (
    (pac.data ?? []) as {
      id: string;
      cliente_id: string;
      horas_contratadas: number;
      horas_usadas: number;
      valido_ate: string;
    }[]
  ).map((p) => ({
    id: p.id,
    cliente_id: p.cliente_id,
    rotulo: `${fmtHoras(
      Number(p.horas_contratadas) - Number(p.horas_usadas),
    )} restantes · vence ${fmtData(p.valido_ate)}`,
  }));

  return {
    clientes: (cli.data ?? []) as OpcaoCliente[],
    acompanhados: (aco.data ?? []) as OpcaoAcompanhado[],
    pacotes,
    acompanhantes: (acp.data ?? []) as OpcaoAcompanhante[],
  };
}
