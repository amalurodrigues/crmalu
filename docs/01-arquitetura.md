# 01 — Arquitetura

## Fluxo de dados

```
Meta Marketing API
        │  (async insight jobs, batch diário + rejanela)
        ▼
  raw_api_responses          ← JSONB bruto, imutável, retenção 90d
        │  (adapter: normaliza, converte moeda/string, resolve action_type)
        ▼
  dim_* + fact_insights_daily + fact_actions_daily
        │  (packages/metrics: SUM/SUM, nunca coluna derivada)
        ▼
  report_payload (JSON congelado, versionado)
        │                             │
        ▼                             ▼
  UI do painel (Recharts)      LLM → narrativa (texto, zero aritmética)
        │
        ▼
  /report/[id]/print → Playwright → PDF
```

## Decisões estruturais e por quê

### Guardar a resposta bruta antes de normalizar

`raw_api_responses` armazena o JSON exato de cada chamada, com
`account_id`, `endpoint`, `params_hash`, `fetched_at`. Custa disco e vale cada
byte: quando o número do painel divergir do Ads Manager, você precisa saber se
o erro está na API, no adapter ou no cálculo. Sem o bruto, é impossível saber.
Retenção 90 dias, depois só o normalizado.

### Duas tabelas de fato, não uma

`fact_insights_daily` (grão diário) **não** consegue responder reach de período.
`fact_insights_period` guarda agregados de período que a API precisa calcular
(reach, frequency, unique_*). Isso é redundância deliberada, imposta pela
matemática da métrica, não preguiça de modelagem.

### Ações em formato longo

Conversões não viram colunas. `fact_actions_daily` é longa:
`(date, entity_id, action_type, attribution_window, count, value)`.
Motivo: o `action_type` relevante muda por cliente e por destino de conversão
(Click-to-WhatsApp usa um tipo, Lead Form usa outro, e-commerce usa outro), e o
Meta cria e renomeia tipos sem aviso. Coluna fixa quebra a cada cliente novo.

### Janela de atribuição é dimensão, não configuração global

Guarde o mesmo dia em múltiplas janelas (`7d_click_1d_view`, `7d_click`, `1d_click`).
Custa pouco e permite mostrar ao cliente por que o número mudou, além de comparar
com o Ads Manager dele (que pode estar em outra janela).

### Sem data warehouse

No volume projetado (~30 contas, ~5 anos), Postgres com índices corretos resolve.
Materialized views para os rollups mais consultados (mensal por conta, mensal por
campanha), refresh no fim do job de ingestão. dbt/BigQuery/Airflow aqui é custo de
manutenção sem retorno. Reabrir a decisão se: > 500M linhas, ou > 5 plataformas
com joins pesados, ou mais de um analista.

### Monorepo, não microserviços

`packages/metrics` precisa ser importado pelo web e pelo worker com garantia de
que é a mesma versão. Serviço separado introduz possibilidade de divergência de
cálculo entre painel e relatório — exatamente o bug que destrói confiança.

## Módulos e responsabilidade

| Pacote | Responsabilidade | O que NÃO faz |
|---|---|---|
| `packages/meta` | HTTP, auth, rate limit, retry, paginação, async jobs | Não normaliza, não calcula |
| `packages/db` | schema, migrations, queries base | Não calcula métrica derivada |
| `packages/metrics` | toda fórmula derivada, tipada | Não faz I/O |
| `packages/reports` | monta payload, versiona, chama LLM para narrativa | Não faz aritmética no LLM |
| `apps/worker` | agendamento, ingestão, rejanela, alertas | Não serve HTTP público |
| `apps/web` | painel, builder, rota de print | Não chama a API do Meta direto |

## Contrato de plataforma (o mínimo para Google entrar depois)

Uma interface, sem abstração especulativa:

```ts
interface PlatformConnector {
  platform: 'meta' | 'google';
  listAdAccounts(cred: Credential): Promise<AdAccountRef[]>;
  syncEntities(acc: AdAccount, since: Date): Promise<void>;   // dim_*
  syncDailyInsights(acc: AdAccount, range: DateRange): Promise<void>;
  syncPeriodInsights(acc: AdAccount, range: DateRange): Promise<void>;
  /** Mapeia nome de conversão da plataforma → conversion_key canônico */
  resolveConversionKey(raw: string): string | null;
}
```

Google Ads vai forçar mudanças (não tem `action_type`, tem
`conversion_action`; não tem `adset`, tem `ad_group`). O mapeamento de hierarquia
vive em `dim_entity.level` como enum canônico: `account | campaign | adgroup | ad`.
`adset` do Meta mapeia para `adgroup`. Faça isso desde já — renomear depois é caro.

## Ambientes

- `local`: Postgres em Docker, credenciais de uma conta de teste do Meta.
- `prod`: um host (Railway/Fly/VPS) + Postgres gerenciado + backup diário.
  Não precisa de Kubernetes. Se alguém sugerir, é ADR.
