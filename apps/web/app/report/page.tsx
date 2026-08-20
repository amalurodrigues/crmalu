import { db, dimEntity, factInsightsDaily, factActionsDaily, adAccounts } from "@tego/db";
import { sumTotals, computeMetrics, type RawTotals } from "@tego/metrics";
import { eq } from "drizzle-orm";
import { ReportDashboard, type VerticalRow, type SeriesPoint } from "./ReportDashboard";

export const runtime = "nodejs"; // precisa de Node (pg), não Edge
export const dynamic = "force-dynamic"; // sempre reconsulta — dado muda a cada import

async function loadReport() {
  const [account] = await db.select().from(adAccounts).limit(1);
  if (!account) return null;

  const entities = await db
    .select()
    .from(dimEntity)
    .where(eq(dimEntity.adAccountId, account.id));

  const rowsByVertical = new Map<string, RawTotals[]>();
  // date -> vertical -> spend, para o gráfico de tendência
  const dailyByVerticalDate = new Map<string, Map<string, number>>();

  for (const entity of entities) {
    const insights = await db
      .select()
      .from(factInsightsDaily)
      .where(eq(factInsightsDaily.entityId, entity.id));
    const actions = await db
      .select()
      .from(factActionsDaily)
      .where(eq(factActionsDaily.entityId, entity.id));

    const conversionsByDate = new Map<string, number>();
    for (const a of actions) {
      if (a.conversionKey === "messaging_started") {
        conversionsByDate.set(a.date, (conversionsByDate.get(a.date) ?? 0) + Number(a.count));
      }
    }

    const vertical = entity.vertical ?? "(sem tag)";
    if (!rowsByVertical.has(vertical)) rowsByVertical.set(vertical, []);

    for (const i of insights) {
      rowsByVertical.get(vertical)!.push({
        impressions: i.impressions,
        spend: Number(i.spend),
        conversions: conversionsByDate.get(i.date) ?? 0,
      });

      if (!dailyByVerticalDate.has(i.date)) dailyByVerticalDate.set(i.date, new Map());
      const byVertical = dailyByVerticalDate.get(i.date)!;
      byVertical.set(vertical, (byVertical.get(vertical) ?? 0) + Number(i.spend));
    }
  }

  const verticalKeys = [...rowsByVertical.keys()];

  const byVertical: VerticalRow[] = verticalKeys.map((vertical) => {
    const rows = rowsByVertical.get(vertical)!;
    const totals = sumTotals(rows);
    const metrics = computeMetrics(totals);
    return { vertical, spend: totals.spend, conversions: totals.conversions, cpa: metrics.cpa };
  });

  const grandTotal = sumTotals(byVertical.map((v) => ({
    impressions: 0, // não usado no total exibido aqui além do CPM abaixo
    spend: v.spend,
    conversions: v.conversions,
  })));
  // impressions do total precisa vir das linhas originais, não do byVertical (que não carrega)
  const allRows = [...rowsByVertical.values()].flat();
  const grandTotalsFull = sumTotals(allRows);
  const grandMetrics = computeMetrics(grandTotalsFull);

  const series: SeriesPoint[] = [...dailyByVerticalDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, byVertical]) => {
      const point: SeriesPoint = { date };
      for (const v of verticalKeys) point[v] = byVertical.get(v) ?? 0;
      return point;
    });

  return {
    accountName: account.name,
    byVertical,
    verticalKeys,
    series,
    grandTotal: grandTotalsFull,
    grandMetrics,
  };
}

export default async function ReportPage() {
  const data = await loadReport();

  if (!data) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-ink">Relatório</h1>
        <p className="mt-2 text-sm text-muted">
          Nenhuma conta cadastrada ainda. Rode o seed e importe um CSV
          primeiro (ver README).
        </p>
      </div>
    );
  }

  return <ReportDashboard {...data} />;
}
