"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  aprovarSolicitacaoAcao,
  recusarSolicitacaoAcao,
  type Estado,
} from "@/app/(painel)/_lib/acoes-inbox";
import { Alerta, Button, LinkButton } from "./ui";

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

/** ✅ Aprovar · ✏️ Ajustar · ❌ Recusar — mesmas ações dos botões do Telegram. */
export default function AcoesSolicitacao({ id }: { id: string }) {
  const [aprovado, aprovar] = useActionState(aprovarSolicitacaoAcao, INICIAL);
  const [recusado, recusar] = useActionState(recusarSolicitacaoAcao, INICIAL);
  const [pedindoMotivo, setPedindoMotivo] = useState(false);

  const estado = aprovado.erro || aprovado.ok ? aprovado : recusado;

  return (
    <div className="mt-3">
      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}
      {estado.ok ? <Alerta tom="ok">{estado.ok}</Alerta> : null}

      <div className="flex flex-wrap items-center gap-2">
        <form action={aprovar}>
          <input type="hidden" name="id" value={id} />
          <Enviar>✅ Aprovar</Enviar>
        </form>

        <LinkButton
          href={`/painel/agenda/${id}/editar`}
          tamanho="sm"
          variante="secundario"
        >
          ✏️ Ajustar
        </LinkButton>

        {pedindoMotivo ? (
          <form action={recusar} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={id} />
            <input
              name="motivo"
              placeholder="Motivo (opcional)"
              className="min-h-9 rounded-xl border border-vc-bege-escuro bg-white px-3 text-sm"
            />
            <Enviar variante="perigo">Confirmar recusa</Enviar>
            <Button
              type="button"
              tamanho="sm"
              variante="fantasma"
              onClick={() => setPedindoMotivo(false)}
            >
              Cancelar
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            tamanho="sm"
            variante="fantasma"
            onClick={() => setPedindoMotivo(true)}
          >
            ❌ Recusar
          </Button>
        )}
      </div>
    </div>
  );
}
