# 04 — Camada de métricas

`packages/metrics` é a **única** fonte de cálculo derivado. UI, relatório, alerta
e export importam daqui. Nenhuma fórmula duplicada em SQL de tela.

## Contrato

```ts
/** Totais brutos e aditivos. Só isto vem do banco. */
export interface RawTotals {
  impressions: number;
  spend: number;
  clicks: number;
  linkClicks: number;
  outboundClicks: number;
  videoThruplay: number;
  videoP100: number;
  conversions: number;        // soma de fact_actions_daily p/ o conversion_key primário
  conversionValue: number;
  currency: string;
  /** só presente se veio de fact_insights_period; NUNCA somado */
  reach?: number;
}

export interface DerivedMetrics {
  cpm: number | null;
  cpc: number | null;            // sobre linkClicks
  cpcAll: number | null;         // sobre clicks
  ctr: number | null;            // linkClicks / impressions
  ctrAll: number | null;
  cpa: number | null;
  cvr: number | null;            // conversions / linkClicks
  roas: number | null;
  frequency: number | null;      // só se reach presente
  hookRate: number | null;       // video3s / impressions
  holdRate: number | null;       // videoP100 / video3s
  thruplayRate: number | null;
}
```

## Fórmulas canônicas

| Métrica | Fórmula | Nota |
|---|---|---|
| CPM | `spend / impressions * 1000` | |
| CPC | `spend / linkClicks` | link, não all |
| CTR | `linkClicks / impressions` | |
| CPA | `spend / conversions` | conversão = `conversion_key` primário do cliente |
| CVR | `conversions / linkClicks` | não use `clicks` |
| ROAS | `conversionValue / spend` | só onde há valor; leadgen retorna `null` |
| Frequency | `impressions / reach` | reach do MESMO período |
| Hook rate | `video3s / impressions` | diagnóstico de criativo |
| Hold rate | `videoP100 / video3s` | |
| CPL qualificado | `spend / offline_results.qualified_leads` | precisa dado do cliente |
| CAC real | `spend / offline_results.closed_deals` | |

**Regra de agregação:** para qualquer recorte (período, campanha, plataforma,
criativo), some numerador e denominador **do recorte inteiro** e divida uma vez.
Jamais tire média das taxas das linhas.

```ts
// CERTO
const cpa = totals.conversions > 0 ? totals.spend / totals.conversions : null;

// ERRADO — média de média
const cpa = rows.reduce((a, r) => a + r.cpa, 0) / rows.length;
```

## Mapeamento de conversão (`conversion_key`)

O `action_type` cru do Meta é instável e específico do destino. A camada canônica
traduz. A tabela abaixo é **ponto de partida** — o mapeamento definitivo é por
conta, configurável na UI, porque o Meta renomeia tipos.

| Destino | `action_type` provável | `conversion_key` |
|---|---|---|
| Click-to-WhatsApp | `onsite_conversion.messaging_conversation_started_7d` | `messaging_started` |
| Click-to-WhatsApp (nova conexão) | `onsite_conversion.total_messaging_connection` | `messaging_connection` |
| Lead form nativo | `lead` / `onsite_conversion.lead_grouped` | `lead` |
| Lead via Pixel | `offsite_conversion.fb_pixel_lead` | `lead` |
| Compra | `offsite_conversion.fb_pixel_purchase` / `purchase` | `purchase` |
| Add to cart | `offsite_conversion.fb_pixel_add_to_cart` | `add_to_cart` |
| Landing page view | `landing_page_view` | `lpv` |
| Instalação de app | `mobile_app_install` | `app_install` |

Regras:

1. **Nunca hardcode.** Tabela `conversion_mappings (ad_account_id, action_type,
   conversion_key, is_primary)`, com seed a partir da tabela acima.
2. Ao ingerir um `action_type` **não mapeado**, grave em `fact_actions_daily` com
   `conversion_key = null` e crie um alerta na UI: "novo tipo de conversão
   detectado na conta X". Nunca descarte silenciosamente.
3. **Evite dupla contagem.** Em CTWA, `messaging_conversation_started_7d` e
   `total_messaging_connection` medem coisas diferentes e se sobrepõem. Só um
   pode ter `is_primary = true` por conta. O CPA do relatório usa o primário.
4. Cliente com mais de um destino (ex.: WhatsApp + formulário) precisa de
   `conversion_key` primário definido por **campanha**, não por conta. Suporte
   isso desde o schema (`conversion_mappings.campaign_ext_id` nullable).

## Comparações e deltas

Toda métrica exibida em relatório carrega comparação. Padrão:

```ts
interface MetricWithDelta {
  key: string;
  value: number | null;
  previous: number | null;      // período anterior de mesma duração
  deltaAbs: number | null;
  deltaPct: number | null;
  direction: 'up' | 'down' | 'flat';
  isGood: boolean | null;       // CPA subindo = ruim; CVR subindo = bom
  goalValue: number | null;     // de client_goals
  goalStatus: 'above' | 'below' | 'on_track' | null;
}
```

`isGood` é atributo da métrica, não do sinal. Guarde a polaridade num registry:
`{ cpa: 'lower_is_better', roas: 'higher_is_better', frequency: 'context' }`.
Métrica com polaridade `context` (frequency, CPM) **não recebe cor** de bom/ruim
na UI — recebe faixa de alerta.

## Significância: quando o número pode virar decisão

O sistema não deve deixar o operador declarar vencedor com amostra insuficiente.
Implemente um helper que roda em toda comparação de criativo/público:

```ts
/** Retorna quantas conversões faltam para a comparação ser acionável. */
function decisionReadiness(a: Variant, b: Variant): {
  ready: boolean;
  reason: string;
  conversionsNeeded: number;
}
```

Regras práticas embutidas na UI, exibidas como badge, não como bloqueio:

- Menos de **50 conversões** no braço vencedor → badge "amostra baixa".
- Diferença de CPA **< 20%** com menos de 100 conversões por braço → "inconclusivo".
- Conjunto com menos de **~50 conversões em 7 dias** provavelmente não saiu da
  learning phase → badge "aprendizado", e a comparação é rotulada como não confiável.
- Período com menos de **7 dias** corridos → não permitir marcar vencedor.

Estes limiares são heurísticas de operação, não teste estatístico formal. Se
quiser rigor, use proporção de conversão com intervalo de confiança de Wilson
sobre `conversions / linkClicks` — mas o badge heurístico já evita 90% dos erros.

## O que a camada de métricas NÃO faz

- Não busca dado (recebe `RawTotals`)
- Não formata (formatação é da UI; a métrica devolve número puro + moeda)
- Não interpreta ("CPA alto" é regra de alerta, não métrica)
