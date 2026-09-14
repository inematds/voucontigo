"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  entrarComSenha,
  enviarLinkMagico,
  type EstadoLogin,
} from "@/app/(painel)/login/actions";
import { Alerta, Button, Card, Input } from "./ui";

function BotaoEnviar({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" tamanho="lg" className="w-full" disabled={pending}>
      {pending ? "Aguarde…" : children}
    </Button>
  );
}

const INICIAL: EstadoLogin = {};

export default function FormularioLogin({
  proximo,
  erroInicial,
}: {
  proximo: string;
  erroInicial?: string;
}) {
  const [modo, setModo] = useState<"senha" | "magico">("senha");
  const [estadoSenha, acaoSenha] = useActionState(entrarComSenha, INICIAL);
  const [estadoMagico, acaoMagico] = useActionState(enviarLinkMagico, INICIAL);

  const estado = modo === "senha" ? estadoSenha : estadoMagico;

  return (
    <Card>
      {erroInicial ? <Alerta tom="erro">{erroInicial}</Alerta> : null}
      {estado.erro ? <Alerta tom="erro">{estado.erro}</Alerta> : null}
      {estado.ok ? <Alerta tom="ok">{estado.ok}</Alerta> : null}

      {modo === "senha" ? (
        <form action={acaoSenha} noValidate>
          <input type="hidden" name="proximo" value={proximo} />
          <Input
            id="email"
            name="email"
            type="email"
            label="E-mail"
            autoComplete="email"
            inputMode="email"
            required
          />
          <Input
            id="senha"
            name="senha"
            type="password"
            label="Senha"
            autoComplete="current-password"
            required
          />
          <BotaoEnviar>Entrar</BotaoEnviar>
        </form>
      ) : (
        <form action={acaoMagico} noValidate>
          <Input
            id="email-magico"
            name="email"
            type="email"
            label="E-mail"
            autoComplete="email"
            inputMode="email"
            dica="Enviamos um link. Basta clicar nele para entrar."
            required
          />
          <BotaoEnviar>Enviar link de acesso</BotaoEnviar>
        </form>
      )}

      <button
        type="button"
        onClick={() => setModo(modo === "senha" ? "magico" : "senha")}
        className="mt-4 w-full text-center text-sm font-semibold text-vc-marrom underline underline-offset-4"
      >
        {modo === "senha"
          ? "Prefiro entrar por link no e-mail"
          : "Prefiro entrar com senha"}
      </button>
    </Card>
  );
}
