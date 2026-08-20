# 05 — Relatórios

## Princípio central

O relatório é montado em duas etapas separadas e não negociáveis:

1. **Payload determinístico.** Código calcula tudo. Números, deltas, rankings,
   status de meta. Vira JSON, é congelado em `reports.payload`.
2. **Narrativa.** O LLM recebe o payload pronto e escreve texto. **Não calcula
   nada.** Não recebe dado bruto. Não recebe permissão para inferir número.

Se o LLM somar spend, algum dia ele vai somar errado e você vai levar isso para a
reunião. A separação elimina a classe inteira de erro.

## Estrutura do payload

```ts
interface ReportPayload {
  meta: {
    clientId: string; clientName: string;
    periodStart: string; periodEnd: string;
    comparisonStart: string; comparisonEnd: string;
    attributionWindow: string;
    currency: string;
    generatedAt: string;
    dataFreshness: string;      // último dia com dado íntegro
    caveats: string[];          // ex: "conta em categoria especial de anúncio"
  };
  headline: MetricWithDelta[];        // 4 a 6 cartões, no máximo
  goal: {
    budget: number; spent: number; pacing: number;   // spent / (budget * diasDecorridos/diasTotais)
    targetCpa: number | null; actualCpa: number | null;
    targetConversions: number | null; actualConversions: number;
    projection: number;                              // projeção linear até o fim do período
  } | null;
  funnel: FunnelStage[];               // impressões → cliques → conversas → leads qual. → vendas
  series: { key: string; points: {date: string; value: number}[] }[];
  breakdowns: {
    byCampaign: RankedRow[];
    byPlacement: RankedRow[];
    byCreative: RankedRow[];           // com thumbnail, ângulo, awareness stage
    byDemographic?: RankedRow[];       // ausente em conta de categoria especial
  };
  anomalies: Anomaly[];                // detectadas por regra, não por LLM
  actionsTaken: ActionLog[];           // o que o operador fez no período
  nextPeriod: PlannedAction[];         // preenchido pelo operador
}
```

Dois campos merecem destaque porque são o que separa relatório de printscreen:

- **`actionsTaken`**: log do que foi feito (pausou criativo X, subiu orçamento
  do conjunto Y em 20% no dia 12). Alimentado por uma tela simples de anotação
  durante o mês. Sem isso o relatório vira boletim meteorológico.
- **`anomalies`**: detectadas por regra determinística, não por LLM. Ex.: gasto
  zerado por > 24h, frequency > limiar, CPA acima da meta por 3 dias seguidos,
  queda de CTR > 30% semana contra semana.

## Estrutura narrativa (a mesma em todo template)

Quatro blocos, nesta ordem. É a estrutura que responde à pergunta que o cliente
realmente faz:

| Bloco | Pergunta que responde | Fonte |
|---|---|---|
| O que aconteceu | "como foi o mês?" | `headline` + `goal` |
| Por que aconteceu | "por que caiu / subiu?" | `funnel` + `breakdowns` + `anomalies` |
| O que foi feito | "você fez o quê com meu dinheiro?" | `actionsTaken` |
| O que vem a seguir | "e agora?" | `nextPeriod` |

Regras de linguagem, aplicadas no prompt e revisadas na UI:

- Linguagem de negócio, não de plataforma. "Conversas iniciadas no WhatsApp",
  não "onsite_conversion.messaging_conversation_started_7d".
- **Proibido celebrar métrica de vaidade.** Alcance, impressões e CTR isolado
  nunca aparecem como resultado — só como diagnóstico dentro do bloco "por quê".
- Sem superlativo vazio. Toda afirmação de causa aponta uma etapa do funil e uma
  magnitude.
- Quando o dado não sustenta conclusão, o texto diz isso explicitamente.

## Prompt de narrativa (esqueleto)

```
Você escreve a seção "{secao}" de um relatório mensal de tráfego pago para o
cliente {clientName}, segmento {segment}, funil {funnelType}.

REGRAS ABSOLUTAS
- Use SOMENTE os números presentes no JSON abaixo. É proibido calcular,
  somar, dividir, estimar ou arredondar qualquer valor novo.
- Se um número necessário não está no JSON, escreva que o dado não está
  disponível. Nunca preencha.
- Não afirme causa sem apontar a etapa do funil correspondente no JSON.
- Não use alcance, impressões ou CTR como resultado — apenas como diagnóstico.
- Não prometa resultado futuro. Projeção só se `goal.projection` existir, e
  rotulada como projeção linear.
- Português do Brasil, tom de {tone}. 2 a 4 parágrafos. Sem bullet decorativo.

CONTEXTO DO CLIENTE
{knowledge/icp/{slug}.md — oferta, ICP, restrições}

DADOS
{JSON do payload, apenas a fatia relevante para esta seção}
```

Validação pós-geração, automática: extraia todo número do texto gerado com regex
e confirme que cada um existe no payload (com tolerância de formatação). Número
órfão → rejeita e regenera. Este checador é obrigatório, não opcional.

## Templates

`report_definitions.template_key` seleciona seções e tom:

| Template | Seções | Tom | Particularidade |
|---|---|---|---|
| `freelance_mensal` | as 4, completas | consultivo, direto | PDF com marca do cliente |
| `institucional` | as 4 + prestação de contas | formal, impessoal | campo de nota de empenho, sem linguagem promocional |
| `interno` | headline + anomalias + criativos | telegráfico | sem narrativa gerada; só dado |
| `produto_proprio` | headline + coorte + LTV | analítico | inclui métricas pós-clique próprias |

## PDF

Rota `/report/[id]/print` renderiza o mesmo React com CSS de impressão
(`@page { size: A4; margin: 12mm }`, `break-inside: avoid` nos cards).
Playwright faz `page.pdf({ printBackground: true })`.

Uma base de código para tela e papel. Bibliotecas de PDF separadas divergem do
painel em duas semanas.

## Anti-padrões proibidos no gerador

- Relatório que abre com alcance e impressões
- Gráfico de CTR isolado como destaque
- Comparação mês a mês sem normalizar por dias corridos ou por verba
- Recomendação de escalar sem checar a conversão a jusante do funil
- Qualquer número no texto que não exista no payload
