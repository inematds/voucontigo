"use client";

import { useState } from "react";

export default function CopiarPix({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={copiar}
        className="rounded-full bg-vc-verde px-5 py-2 text-sm font-semibold text-vc-creme transition hover:bg-vc-verde-claro"
      >
        {copiado ? "Copiado!" : "Copiar código PIX"}
      </button>
      <p className="mt-2 break-all rounded-xl bg-vc-bege/30 px-3 py-2 font-mono text-xs text-vc-texto/70">
        {codigo}
      </p>
    </div>
  );
}
