import Link from "next/link";
import { notFound } from "next/navigation";
import { admin } from "@/lib/telegram/dados";
import { buscarConversa, mensagensDaConversa } from "@/lib/telegram/conversas";
import { Badge, Card, PageHeader, cn } from "@/components/painel/ui";
import {
  BotaoLiberarBot,
  CaixaResposta,
  ConverterEmCliente,
} from "@/components/painel/inbox-acoes";
import { exigirPerfil, linkWhatsApp } from "../../../_lib/dados";
import { fmtDataHoraTZ } from "../../../_lib/datas";

export const dynamic = "force-dynamic";

export default async function ConversaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirPerfil();

  const db = admin();
  const conversa = await buscarConversa(id, db);
  if (!conversa) notFound();

  const mensagens = await mensagensDaConversa(conversa.id, db);
  const titulo = conversa.cliente?.nome ?? `+${conversa.whatsapp}`;

  return (
    <>
      <PageHeader
        titulo={titulo}
        subtitulo={`WhatsApp ${conversa.whatsapp} · estado ${conversa.estado}`}
        acao={
          <a
            href={linkWhatsApp(conversa.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-xl bg-vc-bege px-4 font-semibold text-vc-texto"
          >
            Abrir no WhatsApp
          </a>
        }
      />

      <p className="mb-4">
        <Link
          href="/painel/inbox"
          className="text-sm font-semibold text-vc-marrom underline underline-offset-2"
        >
          ← Voltar para a inbox
        </Link>
      </p>

      {conversa.cliente_id ? (
        <Card className="mb-4">
          <Link
            href={`/painel/clientes/${conversa.cliente_id}`}
            className="font-semibold text-vc-verde underline underline-offset-2"
          >
            Ver ficha de {conversa.cliente?.nome ?? "cliente"}
          </Link>
        </Card>
      ) : (
        <Card titulo="Ainda não é cliente" className="mb-4">
          <ConverterEmCliente conversaId={conversa.id} />
        </Card>
      )}

      <Card titulo="Conversa">
        {mensagens.length === 0 ? (
          <p className="text-sm text-vc-texto/60">Nenhuma mensagem ainda.</p>
        ) : (
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {mensagens.map((m) => {
              const saida = m.direcao === "saida";
              return (
                <li
                  key={m.id}
                  className={cn("flex", saida ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2",
                      saida
                        ? "bg-vc-verde text-vc-creme"
                        : "border border-vc-bege-escuro bg-white text-vc-texto",
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap">{m.corpo}</p>
                    <p
                      className={cn(
                        "mt-0.5 text-[11px]",
                        saida ? "text-vc-creme/70" : "text-vc-texto/50",
                      )}
                    >
                      {fmtDataHoraTZ(m.criado_em)}
                      {m.template ? ` · ${m.template}` : ""} · {m.status}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <CaixaResposta conversaId={conversa.id} whatsapp={conversa.whatsapp} />

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-vc-bege-escuro/60 pt-3">
          <Badge>{conversa.estado}</Badge>
          <BotaoLiberarBot
            conversaId={conversa.id}
            whatsapp={conversa.whatsapp}
          />
        </div>
      </Card>
    </>
  );
}
