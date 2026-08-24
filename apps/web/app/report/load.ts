import {
  db,
  clients,
  adAccounts,
  dimEntity,
  factInsightsDaily,
  factActionsDaily,
  importRuns,
} from "@tego/db";
import { sumTotals, computeMetrics, sampleVerdict, type RawTotals } from "@tego/metrics";
import { eq, inArray, desc } from "drizzle-orm";
import {
  DIMENSIONS,
  METRICS,
  type DimensionKey,
  type DimensionSlice,
  type FunnelStage,
  type MetricKey,
  type ReportPayload,
  type SeriesPoint,
} from "./types";

/**
 * Chave de conversão primária. Quando `conversion_mappings` estiver populado
 * isto passa a sair de lá (is_primary); hoje a tabela está vazia e o destino
 * dominante é Click-to-WhatsApp (CLAUDE.md § 3).
 */
const PRIMARY_CONVERSION_KEY = "messaging_started";

const EMPTY: RawTotals = { impressions: 0, spend: 0, conversions: 0 };

function addTotals(a: RawTotals, b: RawTotals): RawTotals {
  return sumTotals([a, b]);
}

/**
 * Diferença em dias entre duas datas 'YYYY-MM-DD'.
 * Usa Date.UTC sobre os componentes já separados — nunca `new Date(string)`
 * sobre uma data de insight, que aplicaria o fuso do servidor (CLAUDE.md § 2.5).
 */
function daysBetweenInclusive(start: string, end: string): number {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const ms_ = Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds);
  return Math.round(ms_ / 86_400_000) + 1;
}

/** Valor da dimensão para uma entidade. `criativo` é o nome do próprio anúncio. */
function dimensionValue(
  entity: { name: string; vertical: string | null; canal: string | null; temperatura: string | null },
  dimension: DimensionKey
): string {
  switch (dimension) {
    case "vertical":
      return entity.vertical ?? "(sem tag)";
    case "canal":
      return entity.canal ?? "(sem tag)";
    case "temperatura":
      return entity.temperatura ?? "(sem tag)";
    case "criativo":
      return entity.name;
  }
}

export async function loadReportPayload(): Promise<ReportPayload | null> {
  const [account] = await db.select().from(adAccounts).limit(1);
  if (!account) return null;

  const [client] = await db.select().from(clients).where(eq(clients.id, account.clientId));

  const entities = await db
    .select()
    .from(dimEntity)
    .where(eq(dimEntity.adAccountId, account.id));
  if (entities.length === 0) return null;

  const entityIds = entities.map((e) => e.id);

  // Duas queries no total, não duas por entidade.
  const insights = await db
    .select()
    .from(factInsightsDaily)
    .where(eq(factInsightsDaily.adAccountId, account.id));
  const actions = entityIds.length
    ? await db.select().from(factActionsDaily).where(inArray(factActionsDaily.entityId, entityIds))
    : [];

  if (insights.length === 0) return null;

  // CLAUDE.md § 2.4: agregação com mais de uma moeda falha alto, não silencia.
  const currencies = [...new Set(insights.map((i) => i.currency))];
  if (currencies.length > 1) {
    throw new Error(
      `Conjunto tem ${currencies.length} moedas (${currencies.join(", ")}). ` +
        "Somar valores de moedas diferentes exige conversão explícita com taxa datada — " +
        "ver CLAUDE.md § 2.4."
    );
  }

  const entityById = new Map(entities.map((e) => [e.id, e]));

  // (entityId, date) -> conversões da chave primária
  const conversionsByEntityDate = new Map<string, number>();
  for (const a of actions) {
    if (a.conversionKey !== PRIMARY_CONVERSION_KEY) continue;
    const k = `${a.entityId}|${a.date}`;
    conversionsByEntityDate.set(k, (conversionsByEntityDate.get(k) ?? 0) + Number(a.count));
  }

  // Grão base: uma célula RawTotals por (entidade, data). Tudo abaixo é soma disto.
  const cells = insights.map((i) => ({
    entityId: i.entityId,
    date: i.date,
    totals: {
      impressions: i.impressions,
      spend: Number(i.spend),
      conversions: conversionsByEntityDate.get(`${i.entityId}|${i.date}`) ?? 0,
      // null = export sem a coluna; 0 = zero cliques. sumTotals preserva a diferença.
      clicks: i.clicks,
      linkClicks: i.linkClicks,
      outboundClicks: i.outboundClicks,
    } as RawTotals,
  }));

  const dates = [...new Set(cells.map((c) => c.date))].sort();
  const periodStart = dates[0];
  const periodEnd = dates[dates.length - 1];
  const periodDays = daysBetweenInclusive(periodStart, periodEnd);

  const grandTotals = sumTotals(cells.map((c) => c.totals));

  // ---- quebras por dimensão -------------------------------------------------
  const byDimension = {} as Record<DimensionKey, DimensionSlice>;

  for (const dimension of DIMENSIONS) {
    // (valor da dimensão) -> RawTotals, e (valor, data) -> RawTotals
    const totalsByKey = new Map<string, RawTotals>();
    const totalsByKeyDate = new Map<string, Map<string, RawTotals>>();

    for (const cell of cells) {
      const entity = entityById.get(cell.entityId);
      if (!entity) continue;
      const key = dimensionValue(entity, dimension);

      totalsByKey.set(key, addTotals(totalsByKey.get(key) ?? EMPTY, cell.totals));

      if (!totalsByKeyDate.has(cell.date)) totalsByKeyDate.set(cell.date, new Map());
      const perDate = totalsByKeyDate.get(cell.date)!;
      perDate.set(key, addTotals(perDate.get(key) ?? EMPTY, cell.totals));
    }

    // ordena por gasto desc — docs/06 pede ranking, não ordem alfabética
    const keys = [...totalsByKey.keys()].sort(
      (a, b) => totalsByKey.get(b)!.spend - totalsByKey.get(a)!.spend
    );

    const rows = keys.map((key) => {
      const totals = totalsByKey.get(key)!;
      return {
        key,
        totals,
        metrics: computeMetrics(totals),
        sample: sampleVerdict(totals, periodDays),
      };
    });

    // Série pronta por métrica. O CPA diário é dividido AQUI, no servidor, via
    // computeMetrics — o cliente nunca faz aritmética de métrica.
    const series = {} as Record<MetricKey, SeriesPoint[]>;
    for (const metric of METRICS) {
      series[metric] = dates.map((date) => {
        const point: SeriesPoint = { date };
        const perDate = totalsByKeyDate.get(date);
        for (const key of keys) {
          const totals = perDate?.get(key) ?? EMPTY;
          if (metric === "spend") point[key] = totals.spend;
          else if (metric === "conversions") point[key] = totals.conversions;
          else point[key] = computeMetrics(totals).cpa; // null vira gap na linha
        }
        return point;
      });
    }

    byDimension[dimension] = { keys, rows, series };
  }

  // ---- funil ----------------------------------------------------------------
  // docs/05: impressões → cliques → conversas → leads qualificados.
  // A taxa de cada etapa é medida contra a última etapa DISPONÍVEL, não contra
  // a anterior na lista: se cliques não vierem no export, conversas/impressões
  // ainda é uma taxa verdadeira — só é uma taxa diferente, e o rótulo diz qual.
  const stages: Array<Omit<FunnelStage, "rateFromPrev">> = [
    { key: "impressions", label: "Impressões", value: grandTotals.impressions },
    {
      key: "link_clicks",
      label: "Cliques no link",
      value: grandTotals.linkClicks ?? null,
      unavailableReason:
        grandTotals.linkClicks === null || grandTotals.linkClicks === undefined
          ? "O export foi gerado sem a coluna 'Cliques no link'. Reexporte incluindo " +
            "essa métrica em 'Personalizar colunas' — ver docs/03-ingestao-csv-meta-ads.md."
          : undefined,
    },
    {
      key: "messaging_started",
      label: "Conversas iniciadas",
      value: grandTotals.conversions,
    },
    {
      key: "qualified_leads",
      label: "Leads qualificados",
      value: null,
      unavailableReason:
        "Depende de dado de CRM, que não é ingerido nesta fase (docs/08-roadmap.md).",
    },
  ];

  let lastAvailable: number | null = null;
  const funnel: FunnelStage[] = stages.map((s) => {
    const rateFromPrev =
      s.value !== null && lastAvailable !== null && lastAvailable !== 0
        ? s.value / lastAvailable
        : null;
    if (s.value !== null) lastAvailable = s.value;
    return { ...s, rateFromPrev };
  });

  // ---- caveats do último import --------------------------------------------
  const [lastImport] = await db
    .select()
    .from(importRuns)
    .where(eq(importRuns.adAccountId, account.id))
    .orderBy(desc(importRuns.importedAt))
    .limit(1);

  return {
    meta: {
      accountName: account.name,
      clientName: client?.name ?? account.name,
      currency: account.currency,
      periodStart,
      periodEnd,
      periodDays,
      generatedAt: new Date().toISOString(),
      caveats: lastImport?.warnings ?? [],
    },
    headline: {
      totals: grandTotals,
      metrics: computeMetrics(grandTotals),
      sample: sampleVerdict(grandTotals, periodDays),
    },
    funnel,
    byDimension,
  };
}
