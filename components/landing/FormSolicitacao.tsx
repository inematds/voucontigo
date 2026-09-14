"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { solicitarContato, type EstadoSolicitacao } from "@/app/(landing)/actions";
import { linkWhatsApp } from "./dados";

const ESTADO_INICIAL: EstadoSolicitacao = {
  ok: false,
  mensagem: null,
  erros: {},
};

function BotaoEnviar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-full bg-vc-verde px-6 py-4 text-base font-semibold text-vc-creme transition hover:bg-vc-verde-claro disabled:opacity-60"
    >
      {pending ? "Enviando…" : "Quero ser chamado no WhatsApp"}
    </button>
  );
}

const campo =
  "mt-1.5 w-full rounded-xl border border-vc-bege-escuro bg-vc-creme px-4 py-3 text-base text-vc-texto outline-none transition focus:border-vc-verde focus:ring-2 focus:ring-vc-verde/25";

export function FormSolicitacao() {
  const [estado, formAction] = useActionState(solicitarContato, ESTADO_INICIAL);

  return (
    <section id="solicitar" className="mx-auto max-w-3xl px-4 py-14 sm:py-20">
      <div className="rounded-3xl border border-vc-bege bg-white/70 p-6 sm:p-8">
        <h2 className="font-serif text-2xl text-vc-verde sm:text-3xl">
          Prefere que a gente te chame?
        </h2>
        <p className="mt-3 text-vc-texto/75">
          Deixe o seu nome e WhatsApp. A gente entra em contato para entender o
          que a sua família precisa — sem compromisso.
        </p>

        {estado.ok ? (
          <div
            role="status"
            className="mt-6 rounded-2xl border border-vc-verde/40 bg-vc-verde/10 p-5 text-vc-verde"
          >
            <p className="font-semibold">{estado.mensagem}</p>
            <a
              href={linkWhatsApp()}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-semibold text-vc-marrom underline underline-offset-4"
            >
              Se preferir, fale agora no WhatsApp
            </a>
          </div>
        ) : (
          <form action={formAction} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="nome" className="text-sm font-semibold text-vc-texto">
                Seu nome
              </label>
              <input
                id="nome"
                name="nome"
                type="text"
                autoComplete="name"
                required
                placeholder="Como podemos te chamar?"
                aria-invalid={Boolean(estado.erros.nome)}
                className={campo}
              />
              {estado.erros.nome && (
                <p className="mt-1 text-sm text-vc-marrom">{estado.erros.nome}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="whatsapp"
                className="text-sm font-semibold text-vc-texto"
              >
                Seu WhatsApp
              </label>
              <input
                id="whatsapp"
                name="whatsapp"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                placeholder="(51) 99999-9999"
                aria-invalid={Boolean(estado.erros.whatsapp)}
                className={campo}
              />
              {estado.erros.whatsapp && (
                <p className="mt-1 text-sm text-vc-marrom">
                  {estado.erros.whatsapp}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="precisa"
                className="text-sm font-semibold text-vc-texto"
              >
                Do que você precisa?{" "}
                <span className="font-normal text-vc-texto/60">(opcional)</span>
              </label>
              <textarea
                id="precisa"
                name="precisa"
                rows={4}
                placeholder="Ex.: minha mãe tem consulta na quinta de manhã e eu trabalho."
                aria-invalid={Boolean(estado.erros.precisa)}
                className={campo}
              />
              {estado.erros.precisa && (
                <p className="mt-1 text-sm text-vc-marrom">
                  {estado.erros.precisa}
                </p>
              )}
            </div>

            {estado.mensagem && (
              <p role="alert" className="text-sm font-medium text-vc-marrom">
                {estado.mensagem}
              </p>
            )}

            <BotaoEnviar />

            <p className="text-xs text-vc-texto/60">
              Usamos os seus dados só para entrar em contato sobre o
              acompanhamento. Veja a{" "}
              <a
                href="/politica-de-privacidade"
                className="underline underline-offset-2"
              >
                política de privacidade
              </a>
              .
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
