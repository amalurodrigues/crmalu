import { db, reports } from "@tego/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PrintReport } from "../../PrintReport";
import type { ReportPayload } from "../../types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rota de impressão do relatório CONGELADO. É esta rota que o Playwright deve
 * consumir quando a geração de PDF virar server-side (CLAUDE.md § 4) — um só
 * código para tela e papel.
 */
export default async function SavedPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { id } = await params;
  const { preview } = await searchParams;
  const [row] = await db.select().from(reports).where(eq(reports.id, id));
  if (!row) notFound();

  return (
    <PrintReport
      payload={row.payload as ReportPayload}
      title={row.title}
      frozenAt={row.generatedAt.toISOString()}
      autoPrint={preview !== "1"}
    />
  );
}
