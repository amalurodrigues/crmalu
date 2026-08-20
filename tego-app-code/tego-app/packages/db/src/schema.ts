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

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  segment: text("segment"), // 'juridico','ecommerce','saas','institucional'
  funnelType: text("funnel_type").notNull(), // 'leadgen','ecommerce','app','institucional'
  status: text("status").notNull().default("active"),
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
