import type { Metadata } from "next";
import FormularioLogin from "@/components/painel/formulario-login";

export const metadata: Metadata = {
  title: "Entrar — Vou Contigo",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string; erro?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <p className="font-serif text-3xl font-bold text-vc-verde">
          Vou Contigo
        </p>
        <p className="mt-1 text-sm text-vc-texto/70">
          Painel da equipe. Entre para ver a agenda do dia.
        </p>
      </div>

      <FormularioLogin
        proximo={sp.proximo ?? "/painel"}
        erroInicial={
          sp.erro === "link"
            ? "O link expirou ou já foi usado. Peça um novo."
            : undefined
        }
      />
    </main>
  );
}
