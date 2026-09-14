import { Card, PageHeader } from "@/components/painel/ui";
import FormCliente from "@/components/painel/form-cliente";
import { exigirPerfil } from "../../../_lib/dados";

export const dynamic = "force-dynamic";

export default async function NovoClientePage() {
  await exigirPerfil();
  return (
    <>
      <PageHeader
        titulo="Novo cliente"
        subtitulo="O familiar que contrata e paga o serviço."
      />
      <Card>
        <FormCliente />
      </Card>
    </>
  );
}
