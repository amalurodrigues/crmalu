import "dotenv/config";
import { db, dimEntity, factInsightsDaily, factActionsDaily, pool } from "@tego/db";
import { sumTotals, computeMetrics, type RawTotals } from "@tego/metrics";
import { eq } from "drizzle-orm";

async function main() {
  const adAccountId = process.argv[2];
  if (!adAccountId) {
    console.error("Uso: tsx scripts/report-vertical.ts <ad_account_id>");
    process.exit(1);
  }

  // 1) puxar RawTotals por linha — nenhum cálculo derivado acontece aqui
  const entities = await db.select().from(dimEntity).where(eq(dimEntity.adAccountId, adAccountId));

  const rowsByVertical = new Map<string, RawTotals[]>();

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
    }
  }

  // 2) agregar com sumTotals (SUM/SUM) e só então derivar métrica
  console.log("\nCPA por vertical — calculado 100% via packages/metrics:\n");
  let grandTotal: RawTotals = { impressions: 0, spend: 0, conversions: 0 };

  for (const [vertical, rows] of rowsByVertical) {
    const totals = sumTotals(rows);
    const metrics = computeMetrics(totals);
    grandTotal = sumTotals([grandTotal, totals]);

    console.log(
      `  ${vertical.padEnd(20)} spend=R$ ${totals.spend.toFixed(2).padStart(8)} ` +
        `conversões=${String(totals.conversions).padStart(3)}  ` +
        `CPA=${metrics.cpa !== null ? "R$ " + metrics.cpa.toFixed(2) : "—"}`
    );
  }

  const grandMetrics = computeMetrics(grandTotal);
  console.log(
    `\n  ${"TOTAL".padEnd(20)} spend=R$ ${grandTotal.spend.toFixed(2).padStart(8)} ` +
      `conversões=${String(grandTotal.conversions).padStart(3)}  ` +
      `CPA=${grandMetrics.cpa !== null ? "R$ " + grandMetrics.cpa.toFixed(2) : "—"}`
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
