"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  marcarRelatorioEnviado,
  salvarRelatorio,
  type Estado,
} from "@/app/(painel)/_lib/acoes-atendimento";
import { Alerta, Button } from "./ui";

const INICIAL: Estado = {};

function Submeter({
  children,
  variante = "secundario",
}: {
  children: React.ReactNode;
  variante?: "primario" | "secundario" | "fantasma";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variante={variante} disabled={pending}>
      {pending ? "…" : children}
    </Button>
  );
}

export default function PainelRelatorio({
  id,
  textoInicial,
  whatsappCliente,
  enviadoEm,
}: {
  id: string;
  textoInicial: string;
  whatsappCliente: string;
  enviadoEm: string | null;
}) {
  const [texto, setTexto] = useState(textoInicial);
  const [copiado, setCopiado] = useState(false);
  const [estadoSalvar, acaoSalvar] = useActionState(salvarRelatorio, INICIAL);
  const [estadoEnviar, acaoEnviar] = useActionState(
    marcarRelatorioEnviado,
    INICIAL,
  );

  const estado = estadoEnviar.ok || estadoEnviar.erro ? estadoEnviar : estadoSalvar;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  const linkWa = `https://wa.me/${whatsappCliente.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;

  return (
    <div>
      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}
      {estado.ok ? <Alerta tom="ok">{estado.ok}</Alerta> : null}
      {enviadoEm ? (
        <Alerta tom="ok">
          Relatório enviado em{" "}
          {new Date(enviadoEm).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}
          .
        </Alerta>
      ) : null}

      <label
        htmlFor="relatorio_texto"
        className="mb-1 block text-sm font-semibold text-vc-texto/80"
      >
        Texto do relatório para a família
      </label>
      <textarea
        id="relatorio_texto"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={12}
        className="w-full rounded-xl border border-vc-bege-escuro bg-white px-3 py-2 text-base leading-relaxed text-vc-texto focus:border-vc-verde focus:outline-none focus:ring-2 focus:ring-vc-verde/30"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variante="primario" onClick={copiar}>
          {copiado ? "Copiado! ✓" : "Copiar para WhatsApp"}
        </Button>

        <a
          href={linkWa}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-vc-bege px-4 text-base font-semibold text-vc-texto hover:bg-vc-bege-escuro"
        >
          Abrir WhatsApp do cliente
        </a>

        <form action={acaoSalvar}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="relatorio_texto" value={texto} />
          <Submeter variante="fantasma">Salvar rascunho</Submeter>
        </form>

        <form action={acaoEnviar}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="relatorio_texto" value={texto} />
          <Submeter variante="primario">Marcar como enviado</Submeter>
        </form>
      </div>
    </div>
  );
}
