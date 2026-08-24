import {
  db,
  clients,
  adAccounts,
  factInsightsDaily,
  factActionsDaily,
  dimEntity,
} from "@tego/db";
import { computeMetrics, sumTotals, type DerivedMetrics, type RawTotals } from "@tego/metrics";
import { eq, inArray, sql } from "drizzle-orm";

const PRIMARY_CONVERSION_KEY = "messaging_started";

export interface CarteiraRow {
  id: string;
  name: string;
  slug: string;
  segment: string | null;
  niche: string | null;
  accentColor: string | null;
  monthlyBudget: number | null;
  targetCpa: number | null;
  accountName: string | null;
  currency: string;
  totals: RawTotals;
  metrics: DerivedMetrics;
  dataStart: string | null;
  dataEnd: string | null;
  /** (cpa - meta) / meta. null se não há meta ou não há CPA. Negativo é bom. */
  cpaDeviation: number | null;
}

/**
 * Uma linha por cliente com o consolidado de todo o período disponível.
 *
 * Ordenação padrão: pior desvio de CPA contra a meta primeiro (docs/06 — "não
 * alfabética"). Cliente sem meta definida não tem desvio calculável e cai
 * depois dos que têm, ordenado por gasto: sem meta, o proxy de atenção é
 * quanto dinheiro está passando ali.
 */
export async function loadCarteira(): Promise<CarteiraRow[]> {
  const clientRows = await db.select().from(clients);
  if (clientRows.length === 0) return [];

  const accounts = await db.select().from(adAccounts);
  const accountByClient = new Map(accounts.map((a) => [a.clientId, a]));
  const accountIds = accounts.map((a) => a.id);

  // Um agregado para todas as contas de uma vez, em vez de uma query por cliente.
  const insightAgg = accountIds.length
    ? await db
        .select({
          adAccountId: factInsightsDaily.adAccountId,
          impressions: sql<string>`coalesce(sum(${factInsightsDaily.impressions}), 0)::text`,
          spend: sql<string>`coalesce(sum(${factInsightsDaily.spend}), 0)::text`,
          linkClicks: sql<string | null>`sum(${factInsightsDaily.linkClicks})::text`,
          minDate: sql<string | null>`min(${factInsightsDaily.date})::text`,
          maxDate: sql<string | null>`max(${factInsightsDaily.date})::text`,
        })
        .from(factInsightsDaily)
        .where(inArray(factInsightsDaily.adAccountId, accountIds))
        .groupBy(factInsightsDaily.adAccountId)
    : [];

  // Conversões vivem em fact_actions_daily, que não carrega ad_account_id —
  // a ponte é dim_entity.
  const conversionAgg = accountIds.length
    ? await db
        .select({
          adAccountId: dimEntity.adAccountId,
          conversions: sql<string>`coalesce(sum(${factActionsDaily.count}), 0)::text`,
        })
        .from(factActionsDaily)
        .innerJoin(dimEntity, eq(dimEntity.id, factActionsDaily.entityId))
        .where(eq(factActionsDaily.conversionKey, PRIMARY_CONVERSION_KEY))
        .groupBy(dimEntity.adAccountId)
    : [];

  const insightByAccount = new Map(insightAgg.map((r) => [r.adAccountId, r]));
  const conversionsByAccount = new Map(
    conversionAgg.map((r) => [r.adAccountId, Number(r.conversions)])
  );

  const rows: CarteiraRow[] = clientRows.map((c) => {
    const account = accountByClient.get(c.id);
    const agg = account ? insightByAccount.get(account.id) : undefined;
    const conversions = account ? conversionsByAccount.get(account.id) ?? 0 : 0;

    const totals = sumTotals([
      {
        impressions: agg ? Number(agg.impressions) : 0,
        spend: agg ? Number(agg.spend) : 0,
        conversions,
        linkClicks: agg?.linkClicks == null ? null : Number(agg.linkClicks),
      },
    ]);

    const metrics = computeMetrics(totals);
    const targetCpa = c.targetCpa === null ? null : Number(c.targetCpa);
    const cpaDeviation =
      targetCpa && targetCpa > 0 && metrics.cpa !== null
        ? (metrics.cpa - targetCpa) / targetCpa
        : null;

    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      segment: c.segment,
      niche: c.niche,
      accentColor: c.accentColor,
      monthlyBudget: c.monthlyBudget === null ? null : Number(c.monthlyBudget),
      targetCpa,
      accountName: account?.name ?? null,
      currency: account?.currency ?? "BRL",
      totals,
      metrics,
      dataStart: agg?.minDate ?? null,
      dataEnd: agg?.maxDate ?? null,
      cpaDeviation,
    };
  });

  return rows.sort((a, b) => {
    if (a.cpaDeviation !== null && b.cpaDeviation !== null) return b.cpaDeviation - a.cpaDeviation;
    if (a.cpaDeviation !== null) return -1;
    if (b.cpaDeviation !== null) return 1;
    return b.totals.spend - a.totals.spend;
  });
}
