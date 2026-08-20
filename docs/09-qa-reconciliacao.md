# 09 — QA e reconciliação

O sistema só tem valor se o número bate com o Ads Manager. Este documento
descreve como provar isso e como manter provado.

## Reconciliação inicial (critério de saída da Fase 1)

1. No Ads Manager, exporte 1 conta, 1 mês fechado, nível anúncio, colunas:
   `spend, impressions, clicks, link clicks, results, reach, frequency`.
   Anote explicitamente: **janela de atribuição**, **fuso da conta** e
   **`action_report_time`** usados no export.
2. Salve como fixture em `packages/meta/__fixtures__/reconciliation/`.
3. Rode a ingestão do mesmo período com **exatamente** os mesmos parâmetros.
4. Compare com script `pnpm reconcile --account=X --month=2026-07`.

## Tolerâncias

| Métrica | Tolerância | Se estourar, causa provável |
|---|---|---|
| `spend` | 0,5% | Fuso diferente; período com corte em dia diferente |
| `impressions` | 0,5% | Idem |
| `link_clicks` | 0,5% | Confusão entre `clicks` e `inline_link_clicks` |
| conversões | **0** | Janela de atribuição diferente, ou `action_type` errado, ou dupla contagem |
| `reach` | 2% | Deduplicação; período não idêntico |
| CPA / CPM / CTR | derivadas | Se as bases batem e a derivada não, o bug está na camada de métricas |

Divergência em conversão com tolerância zero é deliberada: é o número que o
cliente cobra. Qualquer diferença ali é bug, não ruído.

## Ordem de investigação quando não bate

Siga nesta ordem — a maioria dos casos morre nos três primeiros:

1. **Fuso e período.** `date` está no fuso da conta? O export cobre exatamente
   o mesmo intervalo?
2. **Janela de atribuição.** Está comparando `7d_click_1d_view` com `7d_click`?
3. **`action_report_time`.** `impression` vs `conversion` desloca conversões
   entre dias e muda o total do mês nas bordas.
4. **Métrica trocada.** `clicks` vs `link_clicks`; `reach` somado.
5. **Dupla contagem de `action_type`.** Dois tipos mapeados para o mesmo
   `conversion_key` com `is_primary`.
6. **Entidade faltando.** Anúncio deletado não veio no `syncEntities` e o
   insight ficou órfão.

## Testes automatizados obrigatórios

```
packages/metrics/__tests__/
  no-average-of-averages.test.ts   # agrega 3 dias, confere SUM/SUM
  null-not-zero.test.ts            # denominador 0 → null
  currency-mismatch.test.ts        # moedas distintas → throw
packages/meta/__tests__/
  idempotency.test.ts              # rodar 2x = mesmo estado
  actions-explode.test.ts          # fixture real de `actions` aninhado
  rate-limit-parse.test.ts         # header X-Business-Use-Case-Usage
packages/reports/__tests__/
  orphan-number.test.ts            # número na narrativa ausente do payload → reject
```

O teste `no-average-of-averages` é o guardião do projeto. Se ele passar a
falhar, alguém introduziu coluna derivada em algum lugar.

## Monitoramento contínuo

Job diário de sanidade, resultado na tela `/admin/sync`:

- Conta com `spend = 0` por > 24h, tendo tido gasto nos 7 dias anteriores → alerta
- `sync_run` com `status != 'ok'` → alerta
- Variação de `spend` do dia > 3σ da média de 28 dias → aviso (pode ser real)
- `action_type` novo, sem `conversion_key` → aviso
- Rate limit acima de 75% em qualquer conta → aviso
- Reconciliação amostral automática: 1 conta aleatória, mês anterior, semanal
