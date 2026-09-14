import Link from "next/link";
import BotaoSair from "@/components/painel/botao-sair";
import { Card, PageHeader } from "@/components/painel/ui";
import { exigirPerfil } from "../../_lib/dados";

export const dynamic = "force-dynamic";

export default async function MaisPage() {
  const { perfil, email } = await exigirPerfil();
  const ehGestora = perfil.papel === "gestora";

  const itens = [
    { href: "/painel/leads", rotulo: "Leads", icone: "📥" },
    ...(ehGestora
      ? [
          { href: "/painel/metricas", rotulo: "Métricas de validação", icone: "📊" },
          { href: "/painel/configuracoes", rotulo: "Configurações", icone: "⚙️" },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        titulo="Mais"
        subtitulo={`${perfil.nome || email || "Equipe"} · ${ehGestora ? "gestora" : "acompanhante"}`}
      />

      <Card className="mb-5">
        <ul className="divide-y divide-vc-bege-escuro/50">
          {itens.map((i) => (
            <li key={i.href}>
              <Link
                href={i.href}
                className="flex min-h-14 items-center gap-3 font-semibold"
              >
                <span aria-hidden>{i.icone}</span>
                {i.rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <BotaoSair largo />
    </>
  );
}
