"use server";

import { parseMetaCsvContent, importParsedRows } from "@tego/csv-import";
import { db, adAccounts, clients, importRuns } from "@tego/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export interface ImportActionResult {
  ok: boolean;
  message: string;
  details?: string[];
}

/** Só existe 1 cliente por enquanto — busca a única conta cadastrada.
 * Quando houver mais de um cliente, isto vira um seletor na própria página. */
async function getSingleAdAccountId(): Promise<string | null> {
  const [account] = await db.select({ id: adAccounts.id }).from(adAccounts).limit(1);
  return account?.id ?? null;
}

export async function importCsvAction(formData: FormData): Promise<ImportActionResult> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, message: "Nenhum arquivo selecionado." };
  }

  const adAccountId = await getSingleAdAccountId();
  if (!adAccountId) {
    return {
      ok: false,
      message:
        "Nenhuma conta de anúncio cadastrada ainda. Rode o seed antes (ver README).",
    };
  }

  const content = await file.text();
  const parsed = parseMetaCsvContent(content);

  if (parsed.rows.length === 0) {
    return { ok: false, message: "Arquivo vazio ou não reconhecido.", details: parsed.warnings };
  }

  const summary = await importParsedRows(adAccountId, parsed);

  await db.insert(importRuns).values({
    adAccountId,
    sourceFile: file.name,
    templateVersion: parsed.templateVersion,
    rowsRead: parsed.rows.length,
    entitiesUpserted: summary.entitiesUpserted,
    insightRowsUpserted: summary.insightRowsUpserted,
    actionRowsUpserted: summary.actionRowsUpserted,
    warnings: summary.warnings,
  });

  revalidatePath("/report");

  return {
    ok: true,
    message: `${parsed.rows.length} linhas lidas (template ${parsed.templateVersion}). ` +
      `${summary.entitiesUpserted} entidades, ${summary.insightRowsUpserted} linhas de insight, ` +
      `${summary.actionRowsUpserted} linhas de conversão.`,
    details: [...parsed.warnings, ...summary.warnings],
  };
}
