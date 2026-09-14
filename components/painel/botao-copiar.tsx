"use client";

import { useState } from "react";
import { Button } from "./ui";

/** Copia um texto para a área de transferência. */
export default function BotaoCopiar({
  texto,
  rotulo = "Copiar",
  variante = "secundario",
  tamanho = "sm",
}: {
  texto: string;
  rotulo?: string;
  variante?: "primario" | "secundario" | "fantasma";
  tamanho?: "sm" | "md" | "lg";
}) {
  const [copiado, setCopiado] = useState(false);

  return (
    <Button
      type="button"
      variante={variante}
      tamanho={tamanho}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2500);
        } catch {
          setCopiado(false);
        }
      }}
    >
      {copiado ? "Copiado! ✓" : rotulo}
    </Button>
  );
}
