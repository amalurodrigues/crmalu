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

  for (const row of parsed.rows) {
    // --- dim_entity (nível ad; adset fica implícito em vertical/canal/temperatura) ---
    const externalId = row.adId ?? row.naturalKey;
    let entityId = entityCache.get(externalId);

    if (!entityId) {
      const upserted = await db
        .insert(dimEntity)
        .values({
          adAccountId,
          externalId,
          level: "ad",
          parentExtId: row.adsetId,
          name: row.adName,
          status: row.status,
          vertical: row.vertical,
          canal: row.canal,
          temperatura: row.temperatura,
        })
        .onConflictDoUpdate({
          target: [dimEntity.adAccountId, dimEntity.externalId],
          set: {
            name: row.adName,
            status: row.status,
            vertical: row.vertical,
            canal: row.canal,
            temperatura: row.temperatura,
            lastSeenAt: new Date(),
          },
        })
        .returning({ id: dimEntity.id });

      entityId = upserted[0].id;
      entityCache.set(externalId, entityId);
      entitiesUpserted++;
    }

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
        warnings.push(`action_type não mapeado: "${row.resultType}" (entidade ${externalId})`);
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
