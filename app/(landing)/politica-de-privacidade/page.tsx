import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/landing/Header";
import { Rodape } from "@/components/landing/Rodape";
import { INSTAGRAM_HANDLE, linkWhatsApp } from "@/components/landing/dados";

const TITULO = "Política de privacidade — Vou Contigo";
const DESCRICAO =
  "Como o Vou Contigo coleta, usa, guarda e exclui os dados de quem entra em contato pelo site. Dados mínimos, consentimento e exclusão a pedido (LGPD).";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://voucontigo.vercel.app",
  ),
  title: TITULO,
  description: DESCRICAO,
  alternates: { canonical: "/politica-de-privacidade" },
  openGraph: {
    type: "article",
    locale: "pt_BR",
    siteName: "Vou Contigo",
    title: TITULO,
    description: DESCRICAO,
  },
};

export default function PoliticaDePrivacidadePage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <h1 className="font-serif text-3xl text-vc-verde sm:text-4xl">
          Política de privacidade
        </h1>
        <p className="mt-3 text-sm text-vc-texto/60">
          Última atualização: setembro de 2026.
        </p>

        <div className="mt-8 space-y-8 text-vc-texto/85">
          <section>
            <h2 className="font-serif text-xl text-vc-verde">
              1. Quem trata os seus dados
            </h2>
            <p className="mt-2">
              O <strong>Vou Contigo</strong> é um serviço de companhia e apoio à
              rotina. Somos nós que tratamos os dados informados neste site e no
              WhatsApp, e não vendemos nem cedemos essas informações a
              terceiros.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-vc-verde">
              2. Quais dados coletamos
            </h2>
            <p className="mt-2">
              Coletamos o <strong>mínimo necessário</strong> para responder e
              organizar o acompanhamento:
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li>nome e número de WhatsApp de quem entra em contato;</li>
              <li>
                a mensagem que você escreve no formulário (o que a sua família
                precisa);
              </li>
              <li>
                quando o serviço é contratado: dados de contato, endereços de
                saída e destino e preferências da pessoa acompanhada.
              </li>
            </ul>
            <p className="mt-3">
              <strong>Não coletamos dados de saúde.</strong> Não guardamos
              prontuário, diagnóstico, receita nem informação sobre medicação —
              o Vou Contigo não presta serviços de saúde.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-vc-verde">
              3. Para que usamos
            </h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>responder ao seu contato e montar um orçamento;</li>
              <li>agendar, confirmar e lembrar dos acompanhamentos;</li>
              <li>enviar o relatório do acompanhamento à família;</li>
              <li>controlar pagamentos e saldo de horas contratadas.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl text-vc-verde">4. Consentimento</h2>
            <p className="mt-2">
              Ao enviar o formulário ou nos chamar no WhatsApp, você concorda que
              a gente entre em contato e registre esses dados para esse fim. O
              consentimento pode ser retirado a qualquer momento, sem
              justificativa.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-vc-verde">
              5. Por quanto tempo guardamos
            </h2>
            <p className="mt-2">
              Guardamos os dados enquanto durar o atendimento e pelo prazo
              necessário para obrigações legais e fiscais. Depois disso, são
              apagados ou anonimizados.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-vc-verde">
              6. Com quem compartilhamos
            </h2>
            <p className="mt-2">
              Apenas com a acompanhante responsável pelo seu atendimento e com os
              serviços de tecnologia que hospedam o site e o banco de dados, sob
              contrato. Nunca com anunciantes, listas ou terceiros comerciais.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-vc-verde">
              7. Seus direitos (LGPD)
            </h2>
            <p className="mt-2">
              Você pode pedir a qualquer momento: confirmação do tratamento,
              acesso aos dados, correção, portabilidade,{" "}
              <strong>exclusão dos dados</strong> e revogação do consentimento.
              Basta pedir no WhatsApp — atendemos sem custo e sem burocracia.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-vc-verde">8. Segurança</h2>
            <p className="mt-2">
              Os dados ficam em ambiente com acesso restrito à equipe do Vou
              Contigo, protegido por senha e controle de permissões. Fotos da
              pessoa acompanhada só são guardadas com consentimento expresso da
              família.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl text-vc-verde">9. Como falar conosco</h2>
            <p className="mt-2">
              Para qualquer pedido relacionado aos seus dados, fale com a gente
              pelo{" "}
              <a
                href={linkWhatsApp(
                  "Olá! Gostaria de falar sobre os meus dados no Vou Contigo.",
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-vc-marrom underline underline-offset-4"
              >
                WhatsApp
              </a>{" "}
              ou pelo Instagram {INSTAGRAM_HANDLE}.
            </p>
          </section>
        </div>

        <Link
          href="/"
          className="mt-10 inline-block rounded-full border border-vc-marrom/40 px-6 py-3 text-sm font-semibold text-vc-marrom transition hover:bg-vc-bege/40"
        >
          ← Voltar para a página inicial
        </Link>
      </main>
      <Rodape />
    </>
  );
}
