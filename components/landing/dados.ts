/** Conteúdo da landing — textos, serviços, planos e FAQ. Fonte: docs/conversa-original.md */

export const WHATSAPP_NUMERO = process.env.NEXT_PUBLIC_WHATSAPP_EMPRESA ?? "";

export const MENSAGEM_PADRAO =
  "Olá! Vi o site do Vou Contigo e gostaria de saber mais sobre o acompanhamento.";

export function linkWhatsApp(mensagem: string = MENSAGEM_PADRAO): string {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensagem)}`;
}

export const INSTAGRAM_URL = "https://instagram.com/voucontigo";
export const INSTAGRAM_HANDLE = "@voucontigo";

export type Servico = { emoji: string; titulo: string; texto: string };

export const SERVICOS: Servico[] = [
  {
    emoji: "🩺",
    titulo: "Consultas e exames",
    texto:
      "Acompanhamos em consultas, exames e fisioterapia. Esperamos junto e ajudamos no que for preciso durante o compromisso.",
  },
  {
    emoji: "🚗",
    titulo: "Levar e buscar",
    texto:
      "Levamos e buscamos em compromissos marcados, sem pressa e com atenção no caminho de ida e de volta.",
  },
  {
    emoji: "🛒",
    titulo: "Mercado, farmácia e banco",
    texto:
      "Companhia para supermercado, farmácia, banco e compras — carregando sacolas, organizando filas e senhas.",
  },
  {
    emoji: "📄",
    titulo: "Pequenas demandas da rotina",
    texto:
      "Retirada de documentos, encomendas e medicamentos na farmácia, e outras resoluções do dia a dia.",
  },
  {
    emoji: "🌳",
    titulo: "Passeios e atividades",
    texto:
      "Acompanhamento em salão, igreja, eventos, caminhadas e passeios — presença para viver bem fora de casa.",
  },
  {
    emoji: "💬",
    titulo: "Relatório para a família",
    texto:
      "Depois de cada acompanhamento você recebe pelo WhatsApp um relatório do que aconteceu, com calma e clareza.",
  },
];

export type Passo = { numero: string; titulo: string; texto: string };

export const PASSOS: Passo[] = [
  {
    numero: "1",
    titulo: "Você chama no WhatsApp",
    texto:
      "Conta o que a sua família precisa. Uma mensagem já é suficiente para começar — sem formulário longo, sem burocracia.",
  },
  {
    numero: "2",
    titulo: "Combinamos data, local e tempo",
    texto:
      "Acertamos o dia, o endereço de saída, o destino e quanto tempo o compromisso deve levar. Tudo confirmado antes.",
  },
  {
    numero: "3",
    titulo: "Acompanhamos e você fica sabendo",
    texto:
      "Acompanhamos, esperamos, levamos e buscamos — e no fim mandamos o relatório do acompanhamento pelo WhatsApp.",
  },
];

export type Plano = {
  nome: string;
  destaque: string;
  preco: string;
  periodo?: string;
  descricao: string;
  itens: string[];
  precos?: { rotulo: string; valor: string }[];
  recomendado?: boolean;
};

export const PLANOS: Plano[] = [
  {
    nome: "Essencial",
    destaque: "2 horas",
    preco: "R$ 150",
    descricao: "Para saídas curtas e compromissos rápidos.",
    itens: ["Mercado", "Farmácia", "Banco e pequenas saídas", "Relatório no WhatsApp"],
  },
  {
    nome: "Consulta",
    destaque: "Até 4 horas",
    preco: "R$ 280",
    descricao: "Para compromissos com espera, do começo ao fim.",
    itens: [
      "Consulta médica e exames",
      "Fisioterapia",
      "Espera acompanhada",
      "Relatório no WhatsApp",
    ],
    recomendado: true,
  },
  {
    nome: "Frequente",
    destaque: "Pacote mensal",
    preco: "A partir de R$ 520",
    periodo: "por mês",
    descricao: "Para famílias que precisam de apoio recorrente.",
    itens: ["Horas usadas como a família precisar", "Prioridade na agenda", "Relatório a cada saída"],
    precos: [
      { rotulo: "8 horas / mês", valor: "R$ 520" },
      { rotulo: "12 horas / mês", valor: "R$ 750" },
      { rotulo: "20 horas / mês", valor: "R$ 1.180" },
    ],
  },
];

export const NAO_FAZEMOS: string[] = [
  "Cuidados médicos ou de enfermagem",
  "Administração de medicamentos",
  "Curativos, injeções ou qualquer procedimento de saúde",
  "Orientação ou decisão sobre tratamento",
];

export type PerguntaFaq = { pergunta: string; resposta: string };

export const FAQ: PerguntaFaq[] = [
  {
    pergunta: "E se a consulta atrasar? Como funciona a espera?",
    resposta:
      "A espera faz parte do acompanhamento: ficamos junto até o compromisso terminar. O tempo de espera entra na contagem das horas conforme combinado no agendamento, e qualquer tempo além do previsto é avisado a você antes de ser cobrado.",
  },
  {
    pergunta: "Posso cancelar ou remarcar?",
    resposta:
      "Pode. Imprevistos acontecem e a gente entende. Basta avisar pelo WhatsApp assim que souber — as condições de cancelamento e remarcação são combinadas na hora do agendamento, de forma clara e sem surpresa.",
  },
  {
    pergunta: "Qual é a região de atendimento?",
    resposta:
      "Atendemos a cidade e a região próxima, dentro do raio combinado no primeiro contato. Destinos mais distantes continuam possíveis, com o deslocamento especial acertado à parte antes do agendamento.",
  },
  {
    pergunta: "Como eu recebo o relatório?",
    resposta:
      "Pelo WhatsApp, logo depois do acompanhamento. Contamos como foi a saída, como a pessoa estava, o que foi resolvido e o que ficou combinado para a próxima vez. Nada de linguagem técnica: é uma conversa.",
  },
  {
    pergunta: "Como funciona o pagamento?",
    resposta:
      "Por PIX, conforme combinado no agendamento — avulso por acompanhamento ou pacote mensal de horas. Custos extras como estacionamento e pedágio, quando houver, são informados e cobrados à parte.",
  },
  {
    pergunta: "Quem vai acompanhar a minha família?",
    resposta:
      "Sempre uma acompanhante da nossa equipe, apresentada a você antes do primeiro atendimento. Presença discreta, paciente e respeitosa — a pessoa acompanhada continua decidindo o próprio dia.",
  },
];
