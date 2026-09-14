"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  converterLeadEmCliente,
  mudarStatusLead,
  type Estado,
} from "@/app/(painel)/_lib/acoes-comercial";
import { Alerta, Button } from "./ui";
import type { StatusLead } from "@/lib/domain/types";

const INICIAL: Estado = {};

function Submeter({
  children,
  variante = "fantasma",
}: {
  children: React.ReactNode;
  variante?: "primario" | "secundario" | "fantasma";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tamanho="sm" variante={variante} disabled={pending}>
      {pending ? "…" : children}
    </Button>
  );
}

const PROXIMO: Partial<Record<StatusLead, { valor: StatusLead; rotulo: string }[]>> =
  {
    novo: [
      { valor: "contatado", rotulo: "Marcar contatado" },
      { valor: "perdido", rotulo: "Perdido" },
    ],
    contatado: [
      { valor: "perdido", rotulo: "Perdido" },
      { valor: "novo", rotulo: "Voltar p/ novo" },
    ],
    perdido: [{ valor: "novo", rotulo: "Reabrir" }],
    convertido: [],
  };

export default function AcoesLead({
  id,
  status,
  jaCliente,
}: {
  id: string;
  status: StatusLead;
  jaCliente: boolean;
}) {
  const [estado, acao] = useActionState(converterLeadEmCliente, INICIAL);

  return (
    <div className="w-full">
      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}
      <div className="flex flex-wrap gap-2">
        {(PROXIMO[status] ?? []).map((p) => (
          <form key={p.valor} action={mudarStatusLead}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value={p.valor} />
            <Submeter>{p.rotulo}</Submeter>
          </form>
        ))}

        {!jaCliente ? (
          <form action={acao}>
            <input type="hidden" name="id" value={id} />
            <Submeter variante="primario">Converter em cliente</Submeter>
          </form>
        ) : null}
      </div>
    </div>
  );
}
