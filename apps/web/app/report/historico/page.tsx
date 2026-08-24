import { db, reports } from "@tego/db";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft, FileClock } from "lucide-react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function br(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default async function HistoricoPage() {
  const rows = await db.select().from(reports).orderBy(desc(reports.generatedAt));

  return (
    <div>
      <Link
        href="/report"
        className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={13} strokeWidth={1.75} />
        Relatório atual
      </Link>

      <h1 className="mt-3 text-2xl font-semibold text-ink">Histórico</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
        Cada item guarda os números como estavam no momento em que foi salvo. O
        Meta reajusta dado retroativamente — um relatório salvo não acompanha
        esse reajuste, de propósito.
      </p>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
          <FileClock size={20} strokeWidth={1.5} className="mx-auto text-faint" />
          <p className="mt-2 text-sm text-muted">Nenhum relatório salvo ainda.</p>
          <p className="mt-1 text-xs text-faint">
            Abra o relatório atual, ajuste o título e clique em “Salvar no histórico”.
          </p>
        </div>
      ) : (
        <div className="glass mt-6 overflow-hidden rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-4 py-2.5 font-normal">Título</th>
                <th className="px-4 py-2.5 font-normal">Período</th>
                <th className="px-4 py-2.5 text-right font-normal">Salvo em</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/report/${r.id}`}
                      className="text-ink underline-offset-2 hover:underline"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="tabular px-4 py-2.5 font-mono text-xs text-muted">
                    {br(r.periodStart)} – {br(r.periodEnd)}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right font-mono text-xs text-muted">
                    {r.generatedAt.toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
