# 03 — Ingestão Meta Ads

Este é o documento mais denso e o mais fácil de errar. Leia inteiro antes de
escrever a primeira chamada.

## 0. Pré-requisito que não é código

Nada disso funciona sem acesso liberado. Abra em paralelo ao desenvolvimento:

1. App no Meta for Developers, tipo **Business**.
2. **Business Verification** do seu Business Manager.
3. **App Review** para `ads_read` (leitura). `ads_management` só se um dia for
   escrever — não peça agora, aumenta o escrutínio da revisão.
4. **System User** no Business Manager, com token de longa duração e acesso de
   parceiro às contas dos clientes. Token de usuário pessoal expira e quebra em
   produção; System User token não expira.
5. Cada cliente precisa conceder acesso de parceiro ao seu BM (Configurações →
   Parceiros → adicionar por ID do BM), com permissão de **visualizar
   desempenho** na conta de anúncio.

Enquanto a revisão não sai, o app em modo Dev funciona com contas do seu próprio
BM — suficiente para desenvolver, insuficiente para atender cliente.

**Fixe uma versão da Graph API** em constante (`META_API_VERSION`) e valide no
changelog antes de subir. Versões ficam obsoletas em ~2 anos e campos mudam
entre elas; nunca use a URL sem versão.

## 1. Ordem de sincronização

```
1. entities   → campanhas, adsets, ads, criativos (barato, roda 1x/dia)
2. daily      → insights com time_increment=1 (o volume)
3. period     → reach/frequency por período fechado (só quando o relatório pede)
4. rewindow   → refaz os últimos N dias (ver seção 5)
```

`entities` primeiro sempre, senão `fact_*` fica com FK órfã.

## 2. Entidades

```
GET /{version}/act_{id}/campaigns
  fields=id,name,status,effective_status,objective,buying_type,
         daily_budget,lifetime_budget,special_ad_categories,created_time,updated_time
  filtering=[{"field":"updated_time","operator":"GREATER_THAN","value":<unix>}]
  limit=500
```

Análogo para `/adsets` (adicione `optimization_goal,bid_strategy,billing_event,
targeting,campaign_id`) e `/ads` (`adset_id,campaign_id,creative{...}`).

Pontos de atenção:

- **Não filtre por `effective_status` ativo.** Anúncio pausado ontem gerou gasto
  ontem. Traga tudo e marque status.
- `special_ad_categories` importa muito para clientes de **jurídico trabalhista,
  emprego, crédito, habitação e política**. Categoria especial restringe
  segmentação (raio mínimo, sem idade/gênero/CEP) e explica CPM alto. Exiba isso
  na UI da conta como badge — evita diagnóstico errado.
- `daily_budget` vem em **unidade mínima da moeda** (centavos). Divida por 100 no
  adapter, uma vez só. `spend` de insights, ao contrário, vem em unidade decimal.
  Essa inconsistência é do Meta e já derrubou muito relatório.
- Criativo: `thumbnail_url` e `image_url` são URLs assinadas que **expiram**.
  Baixe e guarde o binário, ou aceite thumbnail quebrada no PDF de 3 meses atrás.

## 3. Insights diários

```
POST /{version}/act_{id}/insights
  level=ad
  time_range={"since":"2026-07-01","until":"2026-07-31"}
  time_increment=1
  action_attribution_windows=["7d_click","1d_view","7d_click_1d_view","1d_click"]
  action_report_time=conversion        # ver nota abaixo
  fields=date_start,date_stop,account_id,campaign_id,adset_id,ad_id,
         impressions,spend,clicks,inline_link_clicks,outbound_clicks,
         actions,action_values,cost_per_action_type,
         video_thruplay_watched_actions,video_p25_watched_actions,
         video_p50_watched_actions,video_p75_watched_actions,
         video_p100_watched_actions,quality_ranking,engagement_rate_ranking,
         conversion_rate_ranking
```

`POST` (não `GET`) dispara **job assíncrono** e devolve `report_run_id`.
Depois: `GET /{report_run_id}` até `async_status = "Job Completed"`, então
`GET /{report_run_id}/insights?limit=500` + paginação por cursor.

Faça sempre assíncrono para janelas > 3 dias ou nível `ad`. Chamada síncrona em
conta grande estoura timeout e queima cota.

Notas que economizam dias de debug:

- **`action_report_time`**: `impression` atribui a conversão ao dia do clique/
  impressão; `conversion` atribui ao dia em que a conversão aconteceu. O Ads
  Manager usa `impression` por padrão. Se você escolher diferente, seus números
  não vão bater e você vai procurar bug onde não tem. Padronize e documente.
- **`quality_ranking` e afins** só vêm no nível `ad` e só com volume mínimo de
  impressões; abaixo disso vem `UNKNOWN`. Não é bug.
- **`actions` é array aninhado.** Cada item tem `action_type`, `value`, e —
  quando você pede múltiplas janelas — chaves por janela (`"7d_click": "12"`).
  Explodir isso em `fact_actions_daily` é o trabalho principal do adapter.
- **Contagens podem ser fracionárias.** Meta faz estimativa. Use `numeric`, não
  `int`, ou você vai truncar conversão.
- **`clicks` ≠ `inline_link_clicks`.** `clicks` inclui curtida, comentário e
  expandir foto. CTR calculado sobre `clicks` é métrica de vaidade. Use
  `link_clicks` como padrão e deixe o outro disponível.
- Não peça breakdowns na mesma chamada dos dados-base. Rode chamadas separadas
  com `breakdown_key` distinto, senão você não tem o total limpo.
- Breakdowns incompatíveis entre si: `publisher_platform + platform_position +
  impression_device` funcionam juntos; `age + gender` funcionam juntos; misturar
  os dois grupos ou combinar com `action_type` retorna erro. Mantenha uma
  allowlist de combinações válidas no código.

## 4. Reach e frequency

Chamada **separada**, sem `time_increment`, por período fechado:

```
POST /{version}/act_{id}/insights
  level=campaign
  time_range={"since":"2026-07-01","until":"2026-07-31"}
  fields=reach,frequency,impressions
```

Grava em `fact_insights_period`. Se o relatório precisa de reach semanal e
mensal, são duas chamadas. Não há atalho — é assim que deduplicação de pessoas
funciona.

## 5. Rejanela (o item que mais gera reclamação de cliente)

Dado do Meta **muda depois de publicado**. Duas causas: janela de atribuição
(uma conversão de hoje pode ser creditada a um clique de 7 dias atrás) e
reprocessamento interno da Meta.

Política:

| Quando | O que refaz |
|---|---|
| Todo dia, 06:00 (fuso da conta) | D-1 completo |
| Todo dia | **rejanela de D-2 a D-28** — reingere e faz upsert |
| Dia 1 a 3 de cada mês | mês anterior inteiro |
| Sob demanda, antes de gerar relatório | período do relatório inteiro |

28 dias é folgado de propósito. Com janela `7d_click_1d_view` a maior parte
estabiliza em ~8 dias, mas restatements da Meta aparecem depois disso. O custo
de rejanela é cota de API, não risco.

Consequência de produto: **todo relatório mostra `generated_at`** e o payload é
congelado. Se o cliente comparar com o Ads Manager semanas depois e der
diferente, a resposta é a data de corte, não um erro seu.

## 6. Rate limit

O Meta responde com o header `X-Business-Use-Case-Usage` (JSON por business ID):
`call_count`, `total_cputime`, `total_time` — todos em percentual de 0 a 100 — e
`estimated_time_to_regain_access` em minutos quando você é bloqueado.

Regras de implementação:

- Faça o parse do header em **toda** resposta e persista o pico por conta.
- Acima de **75%** em qualquer contador, entre em modo lento (serializa, 1 req/s).
- Acima de **90%**, pare a conta e reagende para o próximo ciclo.
- Erro `code 17` (limite de usuário), `code 4` (limite de app), `code 613`
  (limite custom): backoff exponencial com jitter, base 60s, máximo 6 tentativas.
- Erro `code 1` ou `code 2` (transitório do Meta): retry sem contar como falha.
- **Nunca paralelize contas do mesmo BM sem limite.** Concorrência máxima 3.
- Job assíncrono não conta como chamada pesada — prefira sempre.

## 7. Idempotência

Todo insight entra por upsert na chave natural
`(entity_id, date, attribution_window, breakdown_key)`. Rodar a ingestão de julho
cinco vezes deve produzir exatamente o mesmo estado da primeira. Isso é testado:
`packages/meta/__tests__/idempotency.test.ts` roda o mesmo fixture duas vezes e
compara `count(*)` e checksum de `sum(spend)`.

## 8. Ordem de implementação sugerida

1. Cliente HTTP + parse de rate limit + retry (sem nada de negócio)
2. `syncEntities` para 1 conta, gravando em `raw_api_responses` e `dim_entity`
3. Adapter de `actions` → `fact_actions_daily` (a parte chata; teste com fixture)
4. `syncDailyInsights` nível `ad`, 7 dias, 1 conta
5. Reconciliação contra export manual do Ads Manager (ver `09-qa-reconciliacao.md`)
6. Só depois: múltiplas contas, agendamento, rejanela, breakdowns
