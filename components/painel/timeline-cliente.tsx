import { admin } from "@/lib/telegram/dados";
import { exigirPerfil } from "@/app/(painel)/_lib/dados";
import { fmtDataHoraTZ } from "@/app/(painel)/_lib/datas";
import { Badge, Card } from "./ui";
import type { CanalEvento, Evento } from "@/lib/domain/types";

const CANAL_COR: Record<CanalEvento, string> = {
  painel: "border-sky-300 bg-sky-100 text-sky-900",
  telegram: "border-indigo-300 bg-indigo-100 text-indigo-900",
  whatsapp: "border-emerald-300 bg-emerald-100 text-emerald-900",
  sistema: "border-stone-300 bg-stone-200 text-stone-700",
};

const TIPO_LABEL: Record<string, string> = {
  "atendimento.criado": "Atendimento agendado",
  "atendimento.iniciado": "Atendimento iniciado",
  "atendimento.finalizado": "Atendimento concluído",
  "atendimento.cancelado": "Atendimento cancelado",
  "solicitacao.aprovada": "Solicitação aprovada",
  "solicitacao.recusada": "Solicitação recusada",
  "relatorio.enviado": "Relatório enviado",
  "conversa.respondida": "Resposta no WhatsApp",
  "conversa.liberada": "Conversa devolvida ao bot",
  "conversa.convertida": "Conversa virou cliente",
  "lead.novo": "Novo lead",
  "pagamento.criado": "Cobrança gerada",
  "pagamento.pago": "Pagamento confirmado",
};

/** Resumo curto e legível do payload (no máximo 4 campos). */
function resumirPayload(payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  const partes: string[] = [];
  for (const [chave, valor] of Object.entries(payload)) {
    if (valor === null || valor === undefined || valor === "") continue;
    if (typeof valor === "object") continue;
    partes.push(`${chave.replace(/_/g, " ")}: ${String(valor)}`);
    if (partes.length === 4) break;
  }
  return partes.join(" · ");
}

export default async function TimelineCliente({
  clienteId,
  limite = 40,
}: {
  clienteId: string;
  limite?: number;
}) {
  // `evento` só tem policy de leitura para a gestora (0002_rls.sql); a
  // acompanhante também precisa ver a linha do tempo, então lemos com service
  // role depois de confirmar que há sessão.
  await exigirPerfil();
  const { data } = await admin()
    .from("evento")
    .select("id, tipo, canal, payload, criado_em, atendimento_id")
    .eq("cliente_id", clienteId)
    .order("criado_em", { ascending: false })
    .limit(limite);

  const eventos = (data ?? []) as unknown as Evento[];

  return (
    <Card titulo="Linha do tempo">
      {eventos.length === 0 ? (
        <p className="text-sm text-vc-texto/60">
          Nada registrado ainda para este cliente.
        </p>
      ) : (
        <ol className="relative space-y-4 border-l border-vc-bege-escuro pl-5">
          {eventos.map((e) => {
            const detalhe = resumirPayload(e.payload);
            return (
              <li key={e.id} className="relative">
                <span
                  aria-hidden
                  className="absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full bg-vc-verde"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-vc-texto">
                    {TIPO_LABEL[e.tipo] ?? e.tipo}
                  </p>
                  <Badge className={CANAL_COR[e.canal] ?? CANAL_COR.sistema}>
                    {e.canal}
                  </Badge>
                </div>
                <p className="text-xs text-vc-texto/60">
                  {fmtDataHoraTZ(e.criado_em)}
                </p>
                {detalhe ? (
                  <p className="mt-0.5 text-sm break-words text-vc-texto/70">
                    {detalhe}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
