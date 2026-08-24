import { ReportDashboard } from "./ReportDashboard";
import { loadReportPayload } from "./load";
import { saveReport } from "./actions";
import { defaultTitle } from "./types";

export const runtime = "nodejs"; // precisa de Node (pg), não Edge
export const dynamic = "force-dynamic"; // sempre reconsulta — dado muda a cada import

export default async function ReportPage() {
  const payload = await loadReportPayload();

  if (!payload) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-ink">Relatório</h1>
        <p className="mt-2 text-sm text-muted">
          Nenhuma conta com dado importado ainda. Rode o seed e importe um CSV
          primeiro (ver README).
        </p>
      </div>
    );
  }

  return (
    <ReportDashboard
      payload={payload}
      title={defaultTitle(
        payload.meta.accountName,
        payload.meta.periodStart,
        payload.meta.periodEnd
      )}
      saveAction={saveReport}
    />
  );
}
