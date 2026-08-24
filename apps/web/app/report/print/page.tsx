import { PrintReport } from "../PrintReport";
import { loadReportPayload } from "../load";
import { defaultTitle } from "../types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Rota de impressão do relatório VIVO (recorte atual da tela). */
export default async function LivePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; from?: string; to?: string; campaign?: string; title?: string }>;
}) {
  const sp = await searchParams;
  const payload = await loadReportPayload({
    slug: sp.slug,
    from: sp.from,
    to: sp.to,
    campaign: sp.campaign,
  });

  if (!payload) {
    return <p className="p-8 text-sm">Sem dado para o recorte pedido.</p>;
  }

  return (
    <PrintReport
      payload={payload}
      title={
        sp.title?.trim() ||
        defaultTitle(payload.meta.accountName, payload.meta.periodStart, payload.meta.periodEnd)
      }
    />
  );
}
