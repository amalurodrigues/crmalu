import Link from "next/link";
import { ArrowUpRight, Users } from "lucide-react";
import { loadCarteira, type CarteiraRow } from "../lib/carteira";
import { SERIES_PALETTE } from "../lib/chart-colors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function money(v: number | null, currency: string) {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency });
}

function shortDate(iso: string | null) {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Duas letras a partir do nome — "Aluízio Paula (Advocacia)" vira "AP". */
function monogram(name: string) {
  const words = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0]);
  return (letters.join("") || name.slice(0, 2)).toUpperCase();
}

/**
 * Cor do cartão: a do cliente quando definida, senão uma da paleta por índice.
 * Determinística pelo índice, não aleatória — o operador aprende a reconhecer
 * o cliente pela cor, e ela mudar a cada render destruiria isso.
 */
function accentOf(row: CarteiraRow, index: number) {
  return row.accentColor ?? SERIES_PALETTE[index % SERIES_PALETTE.length];
}

function DeviationBadge({ deviation }: { deviation: number | null }) {
  if (deviation === null) return null;
  const over = deviation > 0;
  const pct = `${over ? "+" : ""}${(deviation * 100).toFixed(0)}%`;
  return (
    <span
      title={
        over
          ? "CPA acima da meta definida para este cliente"
          : "CPA abaixo da meta definida para este cliente"
      }
      className={
        "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide " +
        (over ? "bg-bad/15 text-bad" : "bg-good/15 text-good")
      }
    >
      {pct} vs meta
    </span>
  );
}

function ClientCard({ row, index }: { row: CarteiraRow; index: number }) {
  const accent = accentOf(row, index);
  return (
    <Link
      href={`/clients/${row.slug}`}
      className="glass glass-hover group flex flex-col rounded-2xl p-5"
    >
      <div className="flex items-start gap-4">
        <div
          className="grid h-14 w-14 shrink-0 place-items-center rounded-xl font-display text-lg font-bold"
          style={{
            background: `linear-gradient(150deg, ${accent}38, ${accent}12)`,
            border: `1px solid ${accent}55`,
            color: accent,
          }}
        >
          {monogram(row.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="truncate font-display text-lg font-semibold leading-tight text-ink">
              {row.name}
            </h2>
            <ArrowUpRight
              size={16}
              className="mt-0.5 shrink-0 text-faint transition-colors group-hover:text-ink"
            />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {row.niche ?? row.segment ?? "sem nicho definido"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/5 pt-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-faint">Gasto</div>
          <div className="tabular mt-0.5 font-mono text-sm text-ink">
            {money(row.totals.spend, row.currency)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-faint">Conversas</div>
          <div className="tabular mt-0.5 font-mono text-sm text-ink">
            {row.totals.conversions.toLocaleString("pt-BR")}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-faint">CPA</div>
          <div className="tabular mt-0.5 font-mono text-sm text-ink">
            {money(row.metrics.cpa, row.currency)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-faint">
          {row.dataStart ? `dados ${shortDate(row.dataStart)} – ${shortDate(row.dataEnd)}` : "sem dado importado"}
        </span>
        <DeviationBadge deviation={row.cpaDeviation} />
      </div>
    </Link>
  );
}

export default async function CarteiraPage() {
  const rows = await loadCarteira();

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs uppercase tracking-wider text-faint">Carteira</p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Clientes</h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
            Ordenado por pior desvio de CPA contra a meta — quem está fora do
            alvo aparece primeiro, não quem vem primeiro no alfabeto.
          </p>
        </div>
        <span className="tabular hidden font-mono text-sm text-faint sm:block">
          {rows.length} {rows.length === 1 ? "cliente" : "clientes"}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="glass mt-8 rounded-2xl px-6 py-12 text-center">
          <Users size={22} strokeWidth={1.5} className="mx-auto text-faint" />
          <p className="mt-3 text-sm text-muted">Nenhum cliente cadastrado.</p>
          <p className="mt-1 text-xs text-faint">
            Rode <span className="font-mono">npx tsx scripts/seed-client.ts</span> para criar o
            primeiro.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row, i) => (
            <ClientCard key={row.id} row={row} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
