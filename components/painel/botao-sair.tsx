"use client";

import { sair } from "@/app/(painel)/login/actions";
import { Button } from "./ui";

export default function BotaoSair({ largo }: { largo?: boolean }) {
  return (
    <form action={sair}>
      <Button
        type="submit"
        variante="fantasma"
        tamanho="sm"
        className={largo ? "w-full" : undefined}
      >
        Sair
      </Button>
    </form>
  );
}
