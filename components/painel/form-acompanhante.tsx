"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  salvarAcompanhante,
  type Estado,
} from "@/app/(painel)/_lib/acoes-comercial";
import { Alerta, Button, Input } from "./ui";

const INICIAL: Estado = {};

export type ValoresAcompanhante = {
  id?: string;
  nome?: string;
  whatsapp?: string;
  telegram_chat_id?: string | null;
  ativo?: boolean;
};

function Submeter({ novo }: { novo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tamanho="sm" disabled={pending}>
      {pending ? "Salvando…" : novo ? "Cadastrar" : "Salvar"}
    </Button>
  );
}

export default function FormAcompanhante({
  valores = {},
  aberto = false,
}: {
  valores?: ValoresAcompanhante;
  aberto?: boolean;
}) {
  const novo = !valores.id;
  const [mostrar, setMostrar] = useState(aberto);
  const [estado, acao] = useActionState(salvarAcompanhante, INICIAL);

  if (!mostrar) {
    return (
      <Button
        type="button"
        variante="fantasma"
        tamanho="sm"
        onClick={() => setMostrar(true)}
      >
        {novo ? "+ Nova acompanhante" : "Editar"}
      </Button>
    );
  }

  const sufixo = valores.id ?? "novo";

  return (
    <form action={acao} noValidate className="mt-2">
      {valores.id ? <input type="hidden" name="id" value={valores.id} /> : null}
      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}
      {estado.ok ? <Alerta tom="ok">{estado.ok}</Alerta> : null}

      <Input
        id={`ac-nome-${sufixo}`}
        name="nome"
        label="Nome"
        required
        defaultValue={valores.nome ?? ""}
      />
      <Input
        id={`ac-wa-${sufixo}`}
        name="whatsapp"
        label="WhatsApp"
        required
        inputMode="tel"
        placeholder="5551999998888"
        defaultValue={valores.whatsapp ?? ""}
      />
      <Input
        id={`ac-tg-${sufixo}`}
        name="telegram_chat_id"
        label="Telegram chat ID"
        defaultValue={valores.telegram_chat_id ?? ""}
      />

      <label className="mb-4 flex items-center gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          name="ativo"
          defaultChecked={valores.ativo ?? true}
          className="h-5 w-5 accent-[var(--vc-verde)]"
        />
        Ativa
      </label>

      <div className="flex gap-2">
        <Submeter novo={novo} />
        <Button
          type="button"
          variante="fantasma"
          tamanho="sm"
          onClick={() => setMostrar(false)}
        >
          Fechar
        </Button>
      </div>
    </form>
  );
}
