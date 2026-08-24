import Link from "next/link";
import { ReportDashboard } from "./ReportDashboard";
import { loadReportPayload } from "./load";
import { saveReport, salvarResultados } from "./actions";
import { defaultTitle } from "./types";

export const runtime = "nodejs"; // precisa de Node (pg), não Edge
export const dynamic = "force-dynamic"; // sempre reconsulta — dado muda a cada import

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; from?: string; to?: string; campaign?: string }>;
}) {
  const sp = await searchParams;
  const payload = await loadReportPayload({
    slug: sp.slug,
    from: sp.from,
    to: sp.to,
    campaign: sp.campaign,
  });

  if (!payload) {
    return (
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Relatório</h1>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
          Nenhum dado importado para este recorte. Escolha um cliente na{" "}
          <Link href="/" className="text-accent underline-offset-2 hover:underline">
            carteira
          </Link>{" "}
          ou{" "}
          <Link href="/import" className="text-accent underline-offset-2 hover:underline">
            importe um CSV
          </Link>
          .
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
      resultadosAction={salvarResultados}
    />
  );
}
