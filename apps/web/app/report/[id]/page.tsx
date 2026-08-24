import { db, reports } from "@tego/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ReportDashboard } from "../ReportDashboard";
import type { ReportPayload } from "../types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Relatório congelado. Renderiza `reports.payload` como foi salvo — nunca
 * reconsulta os fatos, senão o número muda debaixo do cliente e o histórico
 * deixa de servir para o que existe (docs/02, docs/05).
 */
export default async function SavedReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [row] = await db.select().from(reports).where(eq(reports.id, id));
  if (!row) notFound();

  return (
    <ReportDashboard
      payload={row.payload as ReportPayload}
      title={row.title}
      frozenAt={row.generatedAt.toISOString()}
    />
  );
}
