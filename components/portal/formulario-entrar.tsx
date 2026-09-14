"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { enviarLinkFamiliar, type EstadoEntrar } from "@/app/(portal)/entrar/actions";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-vc-verde px-6 py-4 text-base font-semibold text-vc-creme shadow-sm transition hover:bg-vc-verde-claro disabled:opacity-60"
    >
      {pending ? "Enviando…" : "Receber link por e-mail"}
    </button>
  );
}

export default function FormularioEntrar({ erroInicial }: { erroInicial?: string }) {
  const [estado, acao] = useActionState<EstadoEntrar, FormData>(enviarLinkFamiliar, {
    erro: erroInicial,
  });

  return (
    <div className="rounded-3xl border border-vc-bege-escuro bg-white/70 p-6 shadow-sm">
      <form action={acao} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-vc-texto/80">Seu e-mail</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="voce@exemplo.com"
            className="w-full rounded-2xl border border-vc-bege-escuro bg-vc-creme px-4 py-4 text-lg text-vc-texto outline-none focus:border-vc-verde"
          />
        </label>

        <Botao />
      </form>

      {estado.ok && (
        <p className="mt-4 rounded-2xl bg-vc-verde/10 px-4 py-3 text-sm text-vc-verde">
          {estado.ok}
        </p>
      )}
      {estado.erro && (
        <p className="mt-4 rounded-2xl bg-vc-marrom/10 px-4 py-3 text-sm text-vc-marrom">
          {estado.erro}
        </p>
      )}

      <p className="mt-6 border-t border-vc-bege-escuro pt-4 text-sm text-vc-texto/60">
        Receber código por WhatsApp —{" "}
        <span className="font-semibold text-vc-marrom">em breve</span>.
      </p>
    </div>
  );
}
