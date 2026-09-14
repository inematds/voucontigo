"use client";

import { useFormStatus } from "react-dom";
import { sairDoPortal } from "@/app/(portal)/_lib/acoes";

function Botao({ rotulo, largo }: { rotulo: string; largo?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-full border border-vc-bege-escuro px-4 py-2 text-sm font-semibold text-vc-texto/80 transition hover:bg-vc-bege/40 disabled:opacity-60 ${
        largo ? "w-full" : ""
      }`}
    >
      {pending ? "Saindo…" : rotulo}
    </button>
  );
}

export default function BotaoSair({
  rotulo = "Sair",
  largo,
}: {
  rotulo?: string;
  largo?: boolean;
}) {
  return (
    <form action={sairDoPortal}>
      <Botao rotulo={rotulo} largo={largo} />
    </form>
  );
}
