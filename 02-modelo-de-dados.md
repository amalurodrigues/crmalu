# 02 — Modelo de dados

Postgres. DDL abaixo é a fonte da verdade; migrations em `packages/db/migrations`
devem refletir exatamente isto.

## Princípios

- Grão explícito em cada tabela de fato, documentado no comentário.
- Chave natural com `UNIQUE` em toda tabela de fato → habilita upsert idempotente.
- Zero coluna derivada. Se você quer gravar `cpa`, você está errado.
- Toda dimensão de entidade é SCD tipo 2 leve: guarda `name` histórico via
  `dim_entity_version`, porque cliente pergunta "por que a campanha mudou de nome".

## Núcleo

```sql
-- ============ Clientes e contas ============

create table clients (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  segment         text,                 -- 'juridico','ecommerce','saas','institucional'
  funnel_type     text not null,        -- 'leadgen','ecommerce','app','institucional'
  status          text not null default 'active',
  brand_primary   text,                 -- hex, usado no PDF
  logo_url        text,
  notes           text,
  created_at      timestamptz not null default now()
);

create table platform_credentials (
  id                 uuid primary key default gen_random_uuid(),
  platform           text not null,          -- 'meta'
  label              text not null,
  -- token cifrado em repouso (libsodium sealed box / pgcrypto). NUNCA em texto puro.
  access_token_enc   bytea not null,
  token_type         text not null,          -- 'system_user' preferencial
  expires_at         timestamptz,            -- null para system user token
  scopes             text[] not null,
  last_validated_at  timestamptz,
  status             text not null default 'ok',  -- ok | expired | revoked
  created_at         timestamptz not null default now()
);

create table ad_accounts (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id),
  credential_id     uuid not null references platform_credentials(id),
  platform          text not null,             -- 'meta'
  external_id       text not null,             -- 'act_123456789'
  name              text not null,
  currency          char(3) not null,          -- account_currency
  timezone_name     text not null,             -- ex 'America/Sao_Paulo'
  attribution_setting text,                    -- setting da conta, para referência
  status            text not null default 'active',
  first_synced_at   timestamptz,
  last_synced_at    timestamptz,
  unique (platform, external_id)
);

-- ============ Hierarquia de entidades ============

create table dim_entity (
  id             uuid primary key default gen_random_uuid(),
  ad_account_id  uuid not null references ad_accounts(id),
  external_id    text not null,
  level          text not null,   -- 'account'|'campaign'|'adgroup'|'ad'
  parent_ext_id  text,            -- external_id do nível acima
  name           text not null,
  status         text,            -- effective_status
  objective      text,            -- campaign
  buying_type    text,
  optimization_goal text,         -- adset/adgroup
  bid_strategy   text,
  daily_budget   numeric(18,6),
  lifetime_budget numeric(18,6),
  special_ad_categories text[],   -- CRÍTICO p/ jurídico, emprego, crédito, habitação
  created_time   timestamptz,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  unique (ad_account_id, external_id)
);
create index on dim_entity (ad_account_id, level);
create index on dim_entity (parent_ext_id);

-- histórico de nome/status: responde "por que mudou"
create table dim_entity_version (
  id          bigserial primary key,
  entity_id   uuid not null references dim_entity(id),
  observed_on date not null,
  name        text not null,
  status      text,
  daily_budget numeric(18,6),
  unique (entity_id, observed_on)
);

create table dim_creative (
  id             uuid primary key default gen_random_uuid(),
  ad_entity_id   uuid not null references dim_entity(id),
  external_id    text not null,
  title          text,
  body           text,
  cta_type       text,
  thumbnail_url  text,           -- expira; re-resolver ou cachear binário
  object_type    text,           -- VIDEO, IMAGE, CAROUSEL
  permalink      text,
  -- tags do operador, alimentam a análise de ângulo criativo
  angle          text,           -- 'dor','prova social','autoridade','urgencia'
  awareness_stage text,          -- Schwartz: unaware..most_aware
  format         text,           -- 'reel','estatico','carrossel','video_feed'
  unique (ad_entity_id, external_id)
);

-- ============ Fatos ============

-- GRÃO: 1 linha por (entidade, dia, janela de atribuição, chave de breakdown)
create table fact_insights_daily (
  id                bigserial primary key,
  ad_account_id     uuid not null references ad_accounts(id),
  entity_id         uuid not null references dim_entity(id),
  level             text not null,
  date              date not null,              -- no fuso da CONTA
  attribution_window text not null,             -- '7d_click_1d_view' etc
  breakdown_key     text not null default '-',  -- '-' = sem breakdown
  breakdown_json    jsonb,                      -- {"publisher_platform":"instagram",...}

  impressions       bigint not null default 0,
  spend             numeric(18,6) not null default 0,
  clicks            bigint not null default 0,          -- all clicks
  link_clicks       bigint not null default 0,          -- inline_link_clicks
  outbound_clicks   bigint not null default 0,
  video_3s          bigint not null default 0,
  video_thruplay    bigint not null default 0,
  video_p25         bigint not null default 0,
  video_p50         bigint not null default 0,
  video_p75         bigint not null default 0,
  video_p100        bigint not null default 0,
  quality_ranking   text,
  engagement_ranking text,
  conversion_ranking text,

  currency          char(3) not null,
  fetched_at        timestamptz not null default now(),
  unique (entity_id, date, attribution_window, breakdown_key)
);
create index on fact_insights_daily (ad_account_id, date);
create index on fact_insights_daily (level, date);

comment on table fact_insights_daily is
  'NUNCA guardar reach/frequency aqui. Não são aditivos. Ver fact_insights_period.';

-- GRÃO: 1 linha por (entidade, período fechado, janela). Só métricas não-aditivas.
create table fact_insights_period (
  id                bigserial primary key,
  entity_id         uuid not null references dim_entity(id),
  period_start      date not null,
  period_end        date not null,
  attribution_window text not null,
  reach             bigint not null default 0,
  frequency         numeric(10,4),
  unique (entity_id, period_start, period_end, attribution_window)
);

-- GRÃO: 1 linha por (entidade, dia, action_type, janela)
create table fact_actions_daily (
  id                bigserial primary key,
  entity_id         uuid not null references dim_entity(id),
  date              date not null,
  attribution_window text not null,
  action_type       text not null,       -- string CRUA do Meta
  conversion_key    text,                -- canônico; ver 04-camada-de-metricas.md
  count             numeric(18,4) not null default 0,   -- Meta devolve fracionário
  value             numeric(18,6) not null default 0,
  unique (entity_id, date, attribution_window, action_type)
);
create index on fact_actions_daily (conversion_key, date);

-- ============ Metas e contexto de negócio ============

create table client_goals (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id),
  period_start   date not null,
  period_end     date not null,
  media_budget   numeric(18,6) not null,     -- verba de mídia, sem fee
  mgmt_fee       numeric(18,6),
  target_conversions int,
  target_cpa     numeric(18,6),
  target_roas    numeric(10,4),
  avg_ticket     numeric(18,6),
  close_rate     numeric(6,4),               -- lead → venda, informado pelo cliente
  notes          text,
  unique (client_id, period_start, period_end)
);

-- resultados de negócio que a plataforma não vê (venda fechada, lead qualificado)
create table offline_results (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id),
  date          date not null,
  metric_key    text not null,   -- 'qualified_leads','closed_deals','revenue'
  value         numeric(18,6) not null,
  source        text,            -- 'planilha_cliente','crm','informado_reuniao'
  unique (client_id, date, metric_key)
);

-- ============ Operação ============

create table raw_api_responses (
  id            bigserial primary key,
  ad_account_id uuid references ad_accounts(id),
  platform      text not null,
  endpoint      text not null,
  params_hash   text not null,
  params        jsonb not null,
  response      jsonb not null,
  http_status   int,
  fetched_at    timestamptz not null default now()
);
create index on raw_api_responses (ad_account_id, fetched_at desc);

create table sync_runs (
  id             uuid primary key default gen_random_uuid(),
  ad_account_id  uuid references ad_accounts(id),
  kind           text not null,      -- 'entities','daily','period','creative','rewindow'
  range_start    date,
  range_end      date,
  status         text not null,      -- running|ok|failed|partial
  rows_upserted  int,
  error          text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create table report_definitions (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid references clients(id),
  template_key text not null,        -- 'freelance_mensal','institucional','interno'
  config       jsonb not null,       -- seções, métricas, comparações
  created_at   timestamptz not null default now()
);

create table reports (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id),
  definition_id uuid references report_definitions(id),
  period_start  date not null,
  period_end    date not null,
  payload       jsonb not null,     -- CONGELADO. números como estavam na geração
  narrative     jsonb,              -- textos por seção
  status        text not null default 'draft',
  generated_at  timestamptz not null default now(),
  published_at  timestamptz
);
```

`reports.payload` congelado é o que permite responder ao cliente "o relatório de
março dizia X" mesmo depois de o Meta ter reajustado o dado retroativamente.
Isso não é bug, é feature — mas exige que a UI mostre a data de geração.

## Views materializadas (criar só quando a query doer)

```sql
create materialized view mv_account_monthly as
select ad_account_id,
       date_trunc('month', date)::date as month,
       attribution_window,
       sum(spend) as spend,
       sum(impressions) as impressions,
       sum(link_clicks) as link_clicks
from fact_insights_daily
where level = 'account' and breakdown_key = '-'
group by 1,2,3;
```

Refresh no fim de cada `sync_run` bem-sucedido, nunca em cron independente.
