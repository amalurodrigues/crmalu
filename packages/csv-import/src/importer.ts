import { db, dimEntity, factInsightsDaily, factActionsDaily, conversionMappings } from "@tego/db";
import { and, eq } from "drizzle-orm";
import type { ParsedAdRow, ParseResult } from "./parser";

export interface ImportSummary {
  entitiesUpserted: number;
  insightRowsUpserted: number;
  actionRowsUpserted: number;
  warnings: string[];
}

/** Resolve (ou cria) a conversion_key canônica para um action_type cru.
 * Se o tipo nunca foi visto nesta conta, grava sem mapear e avisa —
 * nunca descarta silenciosamente. Ver docs/04-camada-de-metricas.md. */
async function resolveConversionKey(
  adAccountId: string,
  actionType: string
): Promise<string | null> {
  const existing = await db
    .select()
    .from(conversionMappings)
    .where(
      and(
        eq(conversionMappings.adAccountId, adAccountId),
        eq(conversionMappings.actionType, actionType)
      )
    )
    .limit(1);

  if (existing.length > 0) return existing[0].conversionKey;

  // seed conhecido: "Conversas por mensagem iniciadas" -> messaging_started
  // (ver tabela de mapeamento em docs/04-camada-de-metricas.md)
  const SEED: Record<string, string> = {
    "Conversas por mensagem iniciadas": "messaging_started",
  };
  const key = SEED[actionType] ?? null;

  if (key) {
    await db
      .insert(conversionMappings)
      .values({ adAccountId, actionType, conversionKey: key, isPrimary: true })
      .onConflictDoNothing();
  }
  return key;
}

export async function importParsedRows(
  adAccountId: string,
  parsed: ParseResult
): Promise<ImportSummary> {
  const warnings = [...parsed.warnings];
  let entitiesUpserted = 0;
  let insightRowsUpserted = 0;
  let actionRowsUpserted = 0;

  // cache local de external_id -> entity uuid, evita 1 SELECT por linha
  const entityCache = new Map<string, string>();

  /**
   * Upsert de uma entidade em qualquer nível da hierarquia, com cache local
   * para não fazer um SELECT por linha do CSV.
   */
  async function upsertEntity(e: {
    externalId: string;
    level: "campaign" | "adgroup" | "ad";
    parentExtId: string | null;
    name: string;
    status?: string;
    vertical?: string | null;
    canal?: string | null;
    temperatura?: string | null;
  }): Promise<string> {
    const cached = entityCache.get(e.externalId);
    if (cached) return cached;

    const upserted = await db
      .insert(dimEntity)
      .values({
        adAccountId,
        externalId: e.externalId,
        level: e.level,
        parentExtId: e.parentExtId,
        name: e.name,
        status: e.status,
        vertical: e.vertical ?? null,
        canal: e.canal ?? null,
        temperatura: e.temperatura ?? null,
      })
      .onConflictDoUpdate({
        target: [dimEntity.adAccountId, dimEntity.externalId],
        set: {
          name: e.name,
          status: e.status,
          parentExtId: e.parentExtId,
          vertical: e.vertical ?? null,
          canal: e.canal ?? null,
          temperatura: e.temperatura ?? null,
          lastSeenAt: new Date(),
        },
      })
      .returning({ id: dimEntity.id });

    entityCache.set(e.externalId, upserted[0].id);
    entitiesUpserted++;
    return upserted[0].id;
  }

  for (const row of parsed.rows) {
    /**
     * Chave natural por nível: o ID do Meta quando o export traz, o nome com
     * prefixo de nível quando não traz. O prefixo evita que a chave de um
     * conjunto colida com a de um anúncio dentro do mesmo (ad_account_id,
     * external_id) único.
     *
     * A chave do anúncio permanece `adsetName::adName` (row.naturalKey) para
     * não quebrar a idempotência das linhas já importadas — mudar a chave
     * agora criaria entidades novas em vez de atualizar as existentes.
     */
    const campaignKey =
      row.campaignId ?? (row.campaignName ? `campaign::${row.campaignName}` : null);
    const adsetKey = row.adsetId ?? `adset::${row.adsetName}`;
    const adKey = row.adId ?? row.naturalKey;

    if (campaignKey) {
      await upsertEntity({
        externalId: campaignKey,
        level: "campaign",
        parentExtId: null,
        name: row.campaignName ?? campaignKey,
      });
    }

    // As tags [Vertical][Canal][Temperatura] são extraídas do nome do conjunto,
    // então é aqui que elas moram de verdade. Ficam replicadas no anúncio
    // porque o relatório quebra por tag no grão de anúncio.
    await upsertEntity({
      externalId: adsetKey,
      level: "adgroup",
      parentExtId: campaignKey,
      name: row.adsetName,
      vertical: row.vertical,
      canal: row.canal,
      temperatura: row.temperatura,
    });

    const entityId = await upsertEntity({
      externalId: adKey,
      level: "ad",
      parentExtId: adsetKey,
      name: row.adName,
      status: row.status,
      vertical: row.vertical,
      canal: row.canal,
      temperatura: row.temperatura,
    });

    const date = row.date ?? row.periodStart; // fallback v1: usa início do período como "dia"

    // --- fact_insights_daily ---
    await db
      .insert(factInsightsDaily)
      .values({
        adAccountId,
        entityId,
        level: "ad",
        date,
        attributionWindow: row.attributionWindow,
        impressions: row.impressions,
        spend: row.spend.toFixed(6),
        clicks: row.clicks,
        linkClicks: row.linkClicks,
        outboundClicks: row.outboundClicks,
        reach: row.reach,
        currency: row.currency,
      })
      .onConflictDoUpdate({
        target: [factInsightsDaily.entityId, factInsightsDaily.date, factInsightsDaily.attributionWindow],
        set: {
          impressions: row.impressions,
          spend: row.spend.toFixed(6),
          clicks: row.clicks,
          linkClicks: row.linkClicks,
          outboundClicks: row.outboundClicks,
          reach: row.reach,
          fetchedAt: new Date(),
        },
      });
    insightRowsUpserted++;

    // --- fact_actions_daily (só se houve resultado no dia) ---
    if (row.resultType && row.results > 0) {
      const conversionKey = await resolveConversionKey(adAccountId, row.resultType);
      if (!conversionKey) {
        warnings.push(`action_type não mapeado: "${row.resultType}" (entidade ${adKey})`);
      }
      await db
        .insert(factActionsDaily)
        .values({
          entityId,
          date,
          attributionWindow: row.attributionWindow,
          actionType: row.resultType,
          conversionKey,
          count: String(row.results),
        })
        .onConflictDoUpdate({
          target: [
            factActionsDaily.entityId,
            factActionsDaily.date,
            factActionsDaily.attributionWindow,
            factActionsDaily.actionType,
          ],
          set: { count: String(row.results), conversionKey },
        });
      actionRowsUpserted++;
    }
  }

  return { entitiesUpserted, insightRowsUpserted, actionRowsUpserted, warnings };
}
