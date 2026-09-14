"use client";

import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  iniciarAtendimento,
  mudarStatus,
} from "@/app/(painel)/_lib/acoes-atendimento";
import { Button } from "./ui";
import type { StatusAtendimento } from "@/lib/domain/types";

function Submeter({
  children,
  variante = "primario",
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

/** Ações rápidas de lista: confirmar, iniciar, finalizar (leva à tela). */
export default function BotoesRapidos({
  id,
  status,
}: {
  id: string;
  status: StatusAtendimento;
}) {
  if (status === "agendado" || status === "solicitado") {
    return (
      <>
        <form action={mudarStatus}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value="confirmado" />
          <Submeter variante="secundario">Confirmar</Submeter>
        </form>
        <form action={iniciarAtendimento}>
          <input type="hidden" name="id" value={id} />
          <Submeter>Iniciar</Submeter>
        </form>
      </>
    );
  }

  if (status === "confirmado") {
    return (
      <form action={iniciarAtendimento}>
        <input type="hidden" name="id" value={id} />
        <Submeter>Iniciar</Submeter>
      </form>
    );
  }

  if (status === "em_andamento") {
    return (
      <Link
        href={`/painel/atendimentos/${id}#finalizar`}
        className="inline-flex min-h-9 items-center justify-center rounded-xl bg-vc-marrom px-3 text-sm font-semibold text-vc-creme"
      >
        Finalizar
      </Link>
    );
  }

  if (status === "concluido") {
    return (
      <Link
        href={`/painel/atendimentos/${id}#relatorio`}
        className="inline-flex min-h-9 items-center justify-center rounded-xl bg-vc-verde px-3 text-sm font-semibold text-vc-creme"
      >
        Relatório
      </Link>
    );
  }

  return null;
}
