/**
 * Subconjunto de docs/02-modelo-de-dados.md necessário para o caminho de
 * ingestão via CSV (docs/03-ingestao-csv-meta-ads.md).
 *
 * Deliberadamente OMITIDO neste primeiro corte, porque são específicos do
 * caminho de API (docs/03-alt-ingestao-api-meta-ads.md) e não fazem sentido
 * sem token/credencial:
 *   - platform_credentials
 *   - raw_api_responses
 *   - sync_runs
 * Adicionar quando (e se) a Fase 0/API for retomada.
 */
import {
  pgTable,
  uuid,
  text,
  date,
  numeric,
  bigint,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";

/**
 * Contas de acesso ao painel.
 *
 * `role` já nasce com dois valores porque a Fase 4 prevê acesso read-only do
 * cliente ao próprio relatório (CLAUDE.md § 3) — `client_id` é o escopo desse
 * acesso, e fica nulo para o operador, que enxerga a carteira inteira. Só o
 * papel `operator` é emitido hoje; `client` existe para o dia em que a Fase 4
 * abrir, sem exigir migration nova naquele momento.
 *
 * Sessão é JWT, então não há tabela de sessions: com um operador, guardar
 * sessão no banco só adicionaria uma consulta por request sem ganhar nada.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  /** formato "scrypt$N$r$p$salt$hash" — ver packages/db/src/password.ts */
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("operator"), // 'operator' | 'client'
  clientId: uuid("client_id"),
  status: text("status").notNull().default("active"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  segment: text("segment"), // 'juridico','ecommerce','saas','institucional'
  funnelType: text("funnel_type").notNull(), // 'leadgen','ecommerce','app','institucional'
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

  // --- ficha do cliente, exibida no topo da área dele ---
  /** nicho em texto livre; `segment` é a taxonomia fechada, isto é a descrição */
  niche: text("niche"),
  website: text("website"),
  /** cor do cartão na carteira — hex; null cai na paleta por índice */
  accentColor: text("accent_color"),
  monthlyBudget: numeric("monthly_budget", { precision: 18, scale: 2 }),
  /**
   * Meta de CPA. Existe para virar linha de referência nos gráficos: docs/06
   * diz que "gráfico sem referência não sustenta decisão". Null = sem meta
   * definida, e aí o gráfico simplesmente não desenha a linha.
   */
  targetCpa: numeric("target_cpa", { precision: 18, scale: 2 }),
});

/**
 * Anotações do operador sobre o cliente: histórico do que já foi feito,
 * estratégias em curso, ideias para depois, notas soltas.
 *
 * Uma tabela com discriminador em vez de quatro tabelas quase idênticas — os
 * quatro tipos têm exatamente os mesmos campos e a mesma vida útil, e separá-los
 * só produziria quatro queries onde uma resolve.
 *
 * `historico` e `ideia` são a semente de `actionsTaken` e `nextPeriod` do
 * payload de relatório (docs/05) — é o que separa relatório de printscreen.
 *
 * LGPD (docs/07): campo de texto livre do operador sobre a CONTA. Não gravar
 * aqui dado pessoal de lead.
 */
export const clientNotes = pgTable("client_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  kind: text("kind").notNull(), // 'historico' | 'estrategia' | 'ideia' | 'nota'
  title: text("title").notNull(),
  body: text("body"),
  /** data do fato, quando o operador quer datar a ação; null = só createdAt */
  happenedOn: date("happened_on"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adAccounts = pgTable("ad_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  platform: text("platform").notNull().default("meta"),
  externalId: text("external_id"), // pode ficar nulo até termos a conta oficial via API
  name: text("name").notNull(),
  currency: text("currency").notNull(), // char(3) na doc; text é suficiente aqui
  timezoneName: text("timezone_name").notNull().default("America/Sao_Paulo"),
  status: text("status").notNull().default("active"),
  lastImportedAt: timestamp("last_imported_at", { withTimezone: true }),
});

/** Hierarquia de entidades: account | campaign | adgroup | ad */
export const dimEntity = pgTable(
  "dim_entity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id").notNull().references(() => adAccounts.id),
    externalId: text("external_id").notNull(), // ad_id / adset_id / campaign_id do Meta
    level: text("level").notNull(), // 'campaign'|'adgroup'|'ad'
    parentExtId: text("parent_ext_id"),
    name: text("name").notNull(),
    status: text("status"),
    // tags extraídas do padrão [Vertical][Canal][Temperatura] no nome do adset
    vertical: text("vertical"),
    canal: text("canal"),
    temperatura: text("temperatura"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqExternal: unique().on(t.adAccountId, t.externalId),
  })
);

/** GRÃO: 1 linha por (entidade, dia). NUNCA guardar reach/frequency aqui. */
export const factInsightsDaily = pgTable(
  "fact_insights_daily",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    adAccountId: uuid("ad_account_id").notNull().references(() => adAccounts.id),
    entityId: uuid("entity_id").notNull().references(() => dimEntity.id),
    level: text("level").notNull(),
    date: date("date").notNull(), // no fuso da conta
    attributionWindow: text("attribution_window").notNull(),

    impressions: bigint("impressions", { mode: "number" }).notNull().default(0),
    spend: numeric("spend", { precision: 18, scale: 6 }).notNull().default("0"),
    reach: bigint("reach", { mode: "number" }), // só informativo por linha; NUNCA somar entre entidades

    /**
     * Cliques. Desvio consciente de docs/02, que os define `not null default 0`:
     * aqui são NULL-áveis porque `null` ("o export não trazia a coluna") e `0`
     * ("houve zero cliques") são fatos diferentes, e tratá-los igual faz o CTR
     * do relatório exibir 0,00% quando a verdade é "não sei" — exatamente o erro
     * que CLAUDE.md § 2.3 proíbe para divisão por zero.
     */
    clicks: bigint("clicks", { mode: "number" }), // all clicks
    linkClicks: bigint("link_clicks", { mode: "number" }), // inline_link_clicks
    outboundClicks: bigint("outbound_clicks", { mode: "number" }),

    currency: text("currency").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqGrain: unique().on(t.entityId, t.date, t.attributionWindow),
  })
);

/** GRÃO: 1 linha por (entidade, dia, action_type, janela). */
export const factActionsDaily = pgTable(
  "fact_actions_daily",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    entityId: uuid("entity_id").notNull().references(() => dimEntity.id),
    date: date("date").notNull(),
    attributionWindow: text("attribution_window").notNull(),
    actionType: text("action_type").notNull(), // string crua ("Conversas por mensagem iniciadas")
    conversionKey: text("conversion_key"), // canônico, via conversion_mappings
    count: numeric("count", { precision: 18, scale: 4 }).notNull().default("0"),
  },
  (t) => ({
    uniqGrain: unique().on(t.entityId, t.date, t.attributionWindow, t.actionType),
  })
);

export const conversionMappings = pgTable(
  "conversion_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adAccountId: uuid("ad_account_id").notNull().references(() => adAccounts.id),
    actionType: text("action_type").notNull(),
    conversionKey: text("conversion_key").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => ({
    uniqMapping: unique().on(t.adAccountId, t.actionType),
  })
);

/**
 * Relatório salvo. `payload` é CONGELADO na geração (docs/02, docs/05): é o que
 * permite responder "o relatório de agosto dizia X" mesmo depois de o Meta
 * reajustar o dado retroativamente. Nunca recalcule um relatório salvo.
 *
 * Desvios conscientes de docs/02-modelo-de-dados.md:
 *   - `definition_id` omitido: `report_definitions` ainda não existe neste corte.
 *   - `ad_account_id` adicionado: hoje o relatório é por conta, não por cliente.
 *   - `title` adicionado: o operador renomeia o relatório antes de salvar.
 */
export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  adAccountId: uuid("ad_account_id").notNull().references(() => adAccounts.id),
  title: text("title").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  payload: jsonb("payload").notNull(),
  narrative: jsonb("narrative"),
  status: text("status").notNull().default("draft"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

export const importRuns = pgTable("import_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  adAccountId: uuid("ad_account_id").notNull().references(() => adAccounts.id),
  sourceFile: text("source_file").notNull(),
  templateVersion: text("template_version").notNull(), // 'v1_periodo_unico' | 'v2_id_dia'
  rowsRead: integer("rows_read").notNull(),
  entitiesUpserted: integer("entities_upserted").notNull(),
  insightRowsUpserted: integer("insight_rows_upserted").notNull(),
  actionRowsUpserted: integer("action_rows_upserted").notNull(),
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});
