import "dotenv/config";
import { parseMetaCsv, importParsedRows } from "@tego/csv-import";
import { db, importRuns, pool } from "@tego/db";

async function main() {
  const filePath = process.argv[2];
  const adAccountId = process.argv[3];

  if (!filePath || !adAccountId) {
    console.error("Uso: tsx scripts/import-csv.ts <arquivo.csv> <ad_account_id>");
    process.exit(1);
  }

  console.log(`Lendo ${filePath}...`);
  const parsed = parseMetaCsv(filePath);
  console.log(
    `${parsed.rows.length} linhas | template detectado: ${parsed.templateVersion}`
  );
  if (parsed.warnings.length > 0) {
    console.log("Avisos do parser:");
    parsed.warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  }

  const summary = await importParsedRows(adAccountId, parsed);

  await db.insert(importRuns).values({
    adAccountId,
    sourceFile: filePath,
    templateVersion: parsed.templateVersion,
    rowsRead: parsed.rows.length,
    entitiesUpserted: summary.entitiesUpserted,
    insightRowsUpserted: summary.insightRowsUpserted,
    actionRowsUpserted: summary.actionRowsUpserted,
    warnings: summary.warnings,
  });

  console.log("\nImportação concluída:");
  console.log(`  entidades (upsert): ${summary.entitiesUpserted}`);
  console.log(`  linhas de insight (upsert): ${summary.insightRowsUpserted}`);
  console.log(`  linhas de ação/conversão (upsert): ${summary.actionRowsUpserted}`);
  if (summary.warnings.length > 0) {
    console.log("  avisos:");
    summary.warnings.forEach((w) => console.log(`    ⚠ ${w}`));
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
