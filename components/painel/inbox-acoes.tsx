"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  converterConversaEmClienteAcao,
  liberarBotAcao,
  responderConversaAcao,
  type Estado,
} from "@/app/(painel)/_lib/acoes-inbox";
import { Alerta, Button, Input } from "./ui";

const INICIAL: Estado = {};

function Enviar({
  children,
  variante = "primario",
}: {
  children: React.ReactNode;
  variante?: "primario" | "secundario" | "fantasma" | "perigo";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tamanho="sm" variante={variante} disabled={pending}>
      {pending ? "…" : children}
    </Button>
  );
}

/** Caixa de resposta da conversa (envia por WhatsApp via lib/whatsapp/fluxo). */
export function CaixaResposta({
  conversaId,
  whatsapp,
}: {
  conversaId: string;
  whatsapp: string;
}) {
  const [estado, acao] = useActionState(responderConversaAcao, INICIAL);

  return (
    <form action={acao} className="mt-3">
      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}
      {estado.ok ? <Alerta tom="ok">{estado.ok}</Alerta> : null}
      <input type="hidden" name="conversa_id" value={conversaId} />
      <input type="hidden" name="whatsapp" value={whatsapp} />
      <label
        htmlFor="texto"
        className="mb-1 block text-sm font-semibold text-vc-texto/80"
      >
        Responder
      </label>
      <textarea
        id="texto"
        name="texto"
        rows={3}
        required
        placeholder="Escreva a resposta que a pessoa vai receber no WhatsApp…"
        className="min-h-24 w-full rounded-xl border border-vc-bege-escuro bg-white px-3 py-2 text-base leading-relaxed text-vc-texto placeholder:text-vc-texto/40 focus:border-vc-verde focus:ring-2 focus:ring-vc-verde/30 focus:outline-none"
      />
      <div className="mt-2 flex justify-end">
        <Enviar>Enviar no WhatsApp</Enviar>
      </div>
    </form>
  );
}

/** 🔓 Devolve a conversa ao bot. */
export function BotaoLiberarBot({
  conversaId,
  whatsapp,
}: {
  conversaId: string;
  whatsapp: string;
}) {
  const [estado, acao] = useActionState(liberarBotAcao, INICIAL);
  return (
    <form action={acao}>
      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}
      {estado.ok ? <Alerta tom="ok">{estado.ok}</Alerta> : null}
      <input type="hidden" name="conversa_id" value={conversaId} />
      <input type="hidden" name="whatsapp" value={whatsapp} />
      <Enviar variante="fantasma">🔓 Liberar bot</Enviar>
    </form>
  );
}

/** Cria o cliente a partir do número da conversa. */
export function ConverterEmCliente({
  conversaId,
  sugestaoNome,
}: {
  conversaId: string;
  sugestaoNome?: string;
}) {
  const [estado, acao] = useActionState(
    converterConversaEmClienteAcao,
    INICIAL,
  );
  return (
    <form action={acao} className="flex flex-wrap items-end gap-2">
      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}
      {estado.ok ? <Alerta tom="ok">{estado.ok}</Alerta> : null}
      <input type="hidden" name="conversa_id" value={conversaId} />
      <div className="min-w-48 flex-1">
        <Input
          id={`nome-${conversaId}`}
          name="nome"
          label="Nome do cliente"
          defaultValue={sugestaoNome ?? ""}
          placeholder="Como a pessoa se chama"
          className="mb-0"
        />
      </div>
      <div className="mb-4">
        <Enviar variante="secundario">Converter em cliente</Enviar>
      </div>
    </form>
  );
}
