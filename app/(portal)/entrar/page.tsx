import type { Metadata } from "next";
import Link from "next/link";
import FormularioEntrar from "@/components/portal/formulario-entrar";
import { linkWhatsApp } from "@/components/landing/dados";

export const metadata: Metadata = {
  title: "Entrar — Vou Contigo",
  description: "Acesse a sua conta para ver as próximas visitas, o saldo e os relatórios.",
  robots: { index: false, follow: false },
};

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const sp = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <Link href="/" className="font-serif text-3xl font-bold text-vc-verde">
          Vou Contigo
        </Link>
        <p className="mt-2 text-base text-vc-texto/75">
          Entre na sua conta para ver as próximas visitas, o saldo de horas e os relatórios.
        </p>
      </div>

      <FormularioEntrar
        erroInicial={
          sp.erro === "link"
            ? "O link expirou ou já foi usado. Peça um novo aqui embaixo."
            : undefined
        }
      />

      <p className="mt-8 text-center text-sm text-vc-texto/70">
        Prefere falar com uma pessoa?{" "}
        <a
          href={linkWhatsApp("Olá! Quero acessar a minha conta no Vou Contigo.")}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-vc-marrom underline underline-offset-4"
        >
          Chame no WhatsApp
        </a>
      </p>
    </main>
  );
}
