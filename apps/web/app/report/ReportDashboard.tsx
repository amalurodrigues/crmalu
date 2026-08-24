"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Wallet,
  MessageCircle,
  Target,
  Eye,
  Save,
  History,
  TriangleAlert,
} from "lucide-react";
import { CHART_COLORS, SERIES_PALETTE } from "../../lib/chart-colors";
import {
  DIMENSIONS,
  DIMENSION_LABELS,
  METRICS,
  METRIC_FORMAT,
  METRIC_LABELS,
  type DimensionKey,
  type MetricKey,
  type ReportPayload,
} from "./types";

interface Props {
  payload: ReportPayload;
  /** título inicial; editável só quando não é snapshot */
  title: string;
  /** snapshot salvo — sem edição, com carimbo de quando foi congelado */
  frozenAt?: string;
  saveAction?: (formData: FormData) => void;
}

// ---------------------------------------------------------------- formatação

function money(v: number | null, currency: string) {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency });
}

function count(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR");
}

function pct(v: number | null, digits = 2) {
  if (v === null) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function longDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ------------------------------------------------------------------ pedaços

function SampleBadge({ level, reason }: { level: string; reason: string }) {
  if (level === "ok") return null;
  const label = level === "aprendizado" ? "aprendizado" : "amostra baixa";
  return (
    <span
      title={reason}
      className="inline-flex cursor-help items-center gap-1 rounded border border-hairline
                 bg-canvas px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-faint"
    >
      <TriangleAlert size={10} strokeWidth={2} />
      {label}
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  denominator,
  badge,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  /** docs/06 § 2: toda métrica derivada mostra o denominador */
  denominator?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-faint">
        <Icon size={13} strokeWidth={1.75} />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <div className="tabular mt-1.5 font-mono text-xl font-medium text-ink">{value}</div>
      {denominator && <div className="mt-1 text-[11px] text-faint">{denominator}</div>}
      {badge && <div className="mt-1.5">{badge}</div>}
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<T, string>;
}) {
  return (
    <div className="inline-flex rounded-md border border-hairline bg-canvas p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={
            "rounded px-2.5 py-1 text-xs transition-colors " +
            (o === value ? "bg-surface text-ink" : "text-muted hover:text-ink")
          }
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

/** Funil em barras horizontais com taxa entre etapas — docs/06. */
function Funnel({ stages }: { stages: ReportPayload["funnel"] }) {
  const max = Math.max(...stages.map((s) => s.value ?? 0), 1);
  return (
    <div className="space-y-2.5">
      {stages.map((s) => {
        const available = s.value !== null;
        const widthPct = available ? Math.max((s.value! / max) * 100, 1.5) : 100;
        return (
          <div key={s.key}>
            <div className="flex items-baseline justify-between text-xs">
              <span className={available ? "text-ink" : "text-faint"}>{s.label}</span>
              <span className="tabular font-mono text-ink">
                {available ? count(s.value) : "—"}
                {s.rateFromPrev !== null && (
                  <span className="ml-2 text-faint">{pct(s.rateFromPrev)}</span>
                )}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-sm bg-canvas">
              {available ? (
                <div
                  className="h-full rounded-sm"
                  style={{ width: `${widthPct}%`, background: CHART_COLORS.accent }}
                />
              ) : (
                <div
                  className="h-full w-full rounded-sm border border-dashed border-hairline"
                  title={s.unavailableReason}
                />
              )}
            </div>
            {!available && (
              <p className="mt-1 text-[11px] leading-snug text-faint">{s.unavailableReason}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ principal

export function ReportDashboard({ payload, title, frozenAt, saveAction }: Props) {
  const { meta, headline, funnel, byDimension } = payload;
  const readOnly = !saveAction;

  // Estado de filtro na querystring (docs/06: "você vai querer mandar link").
  // Lido via window em vez de useSearchParams para não exigir Suspense boundary.
  const initial = <T extends string>(param: string, allowed: readonly T[], fallback: T): T => {
    if (typeof window === "undefined") return fallback;
    const v = new URLSearchParams(window.location.search).get(param) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  };

  // Default é "criativo": é onde mora a variação que sustenta decisão. Com um
  // cliente de vertical única, quebrar por vertical desenha uma linha só.
  const [dimension, setDimension] = useState<DimensionKey>(() =>
    initial("dim", DIMENSIONS, "criativo")
  );
  const [metric, setMetric] = useState<MetricKey>(() => initial("m", METRICS, "spend"));

  const syncUrl = (next: Record<string, string>) => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(next)) p.set(k, v);
    window.history.replaceState(null, "", `${window.location.pathname}?${p}`);
  };

  const slice = byDimension[dimension];
  const colorFor = (k: string) => SERIES_PALETTE[slice.keys.indexOf(k) % SERIES_PALETTE.length];
  const fmt = (v: number | null) =>
    METRIC_FORMAT[metric] === "money" ? money(v, meta.currency) : count(v);

  const tooltipStyle = {
    background: "#12161d",
    border: `1px solid ${CHART_COLORS.hairline}`,
    borderRadius: 8,
    fontSize: 12,
  };

  return (
    <div>
      {/* cabeçalho: título editável + período explícito + ações */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs uppercase tracking-wider text-faint">
            {frozenAt ? "Relatório salvo" : "Relatório"}
          </p>
          {readOnly ? (
            <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          ) : (
            <input
              name="title"
              form="save-report"
              defaultValue={title}
              aria-label="Título do relatório"
              className="w-full min-w-0 rounded border border-transparent bg-transparent px-1
                         text-2xl font-semibold text-ink outline-none hover:border-hairline
                         focus:border-accent"
            />
          )}
          <p className="mt-1.5 text-sm text-muted">
            {meta.accountName} · {longDate(meta.periodStart)} – {longDate(meta.periodEnd)}
            <span className="text-faint"> ({meta.periodDays} dias)</span>
          </p>
          {frozenAt && (
            <p className="mt-1 text-xs text-faint">
              Números congelados em {new Date(frozenAt).toLocaleString("pt-BR")} — não recalculam.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/report/historico"
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline
                       px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink"
          >
            <History size={13} strokeWidth={1.75} />
            Histórico
          </a>
          {!readOnly && (
            <form id="save-report" action={saveAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5
                           text-xs font-medium text-canvas transition-opacity hover:opacity-90"
              >
                <Save size={13} strokeWidth={2} />
                Salvar no histórico
              </button>
            </form>
          )}
        </div>
      </div>

      {/* avisos herdados do import */}
      {meta.caveats.length > 0 && (
        <div className="mt-4 rounded-lg border border-hairline bg-surface px-4 py-3">
          <div className="flex items-center gap-1.5 text-faint">
            <TriangleAlert size={13} strokeWidth={1.75} />
            <span className="text-xs uppercase tracking-wide">Ressalvas do dado</span>
          </div>
          <ul className="mt-2 space-y-1">
            {meta.caveats.map((c) => (
              <li key={c} className="text-xs leading-snug text-muted">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard icon={Wallet} label="Gasto" value={money(headline.totals.spend, meta.currency)} />
        <KpiCard
          icon={MessageCircle}
          label="Conversas"
          value={count(headline.totals.conversions)}
        />
        <KpiCard
          icon={Target}
          label="CPA"
          value={money(headline.metrics.cpa, meta.currency)}
          denominator={`${money(headline.totals.spend, meta.currency)} / ${headline.totals.conversions} conversas`}
          badge={
            <SampleBadge level={headline.sample.level} reason={headline.sample.reason} />
          }
        />
        <KpiCard
          icon={Eye}
          label="CPM"
          value={money(headline.metrics.cpm, meta.currency)}
          denominator={`${count(headline.totals.impressions)} impressões`}
        />
      </div>

      {/* controles de quebra */}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs uppercase tracking-wide text-faint">Quebrar por</span>
        <Segmented
          options={DIMENSIONS}
          value={dimension}
          onChange={(d) => {
            setDimension(d);
            syncUrl({ dim: d });
          }}
          labels={DIMENSION_LABELS}
        />
      </div>

      {/* série temporal + funil */}
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="rounded-lg border border-hairline bg-surface p-4 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-ink">
              {METRIC_LABELS[metric]} diário por {DIMENSION_LABELS[dimension].toLowerCase()}
            </h2>
            <Segmented
              options={METRICS}
              value={metric}
              onChange={(m) => {
                setMetric(m);
                syncUrl({ m });
              }}
              labels={METRIC_LABELS}
            />
          </div>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={slice.series[metric]}
                margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid stroke={CHART_COLORS.hairline} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                  axisLine={{ stroke: CHART_COLORS.hairline }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(l) => (typeof l === "string" ? shortDate(l) : String(l ?? ""))}
                  formatter={(v) => (typeof v === "number" ? fmt(v) : "—")}
                />
                {slice.keys.map((k) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={k}
                    stroke={colorFor(k)}
                    strokeWidth={2}
                    dot={false}
                    // CPA de um dia sem conversão é null (não zero) — a linha
                    // corta em vez de mentir que o custo despencou.
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {slice.keys.map((k) => (
              <span key={k} className="flex items-center gap-1.5 text-xs text-muted">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: colorFor(k) }}
                />
                {k}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-hairline bg-surface p-4 lg:col-span-2">
          <h2 className="text-sm font-medium text-ink">Funil</h2>
          <div className="mt-3">
            <Funnel stages={funnel} />
          </div>
        </div>
      </div>

      {/* CPA por chave da dimensão — barras ordenadas (docs/06) */}
      <div className="mt-4 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">
          CPA por {DIMENSION_LABELS[dimension].toLowerCase()}
        </h2>
        <div className="mt-3" style={{ height: Math.max(slice.rows.length * 34 + 24, 120) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={slice.rows.map((r) => ({ key: r.key, cpa: r.metrics.cpa }))}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke={CHART_COLORS.hairline} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="key"
                tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={110}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v) => (typeof v === "number" ? money(v, meta.currency) : "—")}
              />
              <Bar dataKey="cpa" radius={[0, 4, 4, 0]}>
                {slice.rows.map((r) => (
                  <Cell key={r.key} fill={colorFor(r.key)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* tabela */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-hairline bg-surface">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-faint">
              <th className="px-4 py-2.5 font-normal">{DIMENSION_LABELS[dimension]}</th>
              <th className="px-3 py-2.5 text-right font-normal">Gasto</th>
              <th className="px-3 py-2.5 text-right font-normal">Impressões</th>
              <th className="px-3 py-2.5 text-right font-normal">Cliques</th>
              <th className="px-3 py-2.5 text-right font-normal">CTR</th>
              <th className="px-3 py-2.5 text-right font-normal">CPC</th>
              <th className="px-3 py-2.5 text-right font-normal">Conversas</th>
              <th className="px-3 py-2.5 text-right font-normal">CVR</th>
              <th className="px-3 py-2.5 text-right font-normal">CPA</th>
              <th className="px-3 py-2.5 text-right font-normal">CPM</th>
            </tr>
          </thead>
          <tbody>
            {slice.rows.map((r) => (
              <tr key={r.key} className="border-b border-hairline last:border-0">
                <td className="px-4 py-2.5 text-ink">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: colorFor(r.key) }}
                    />
                    <span className="truncate">{r.key}</span>
                    <SampleBadge level={r.sample.level} reason={r.sample.reason} />
                  </div>
                </td>
                <td className="tabular px-3 py-2.5 text-right font-mono text-ink">
                  {money(r.totals.spend, meta.currency)}
                </td>
                <td className="tabular px-3 py-2.5 text-right font-mono text-muted">
                  {count(r.totals.impressions)}
                </td>
                <td className="tabular px-3 py-2.5 text-right font-mono text-muted">
                  {count(r.totals.linkClicks ?? null)}
                </td>
                <td
                  className="tabular px-3 py-2.5 text-right font-mono text-muted"
                  title={`${count(r.totals.linkClicks ?? null)} cliques / ${count(r.totals.impressions)} impressões`}
                >
                  {pct(r.metrics.ctr)}
                </td>
                <td className="tabular px-3 py-2.5 text-right font-mono text-muted">
                  {money(r.metrics.cpc, meta.currency)}
                </td>
                <td className="tabular px-3 py-2.5 text-right font-mono text-ink">
                  {count(r.totals.conversions)}
                </td>
                <td
                  className="tabular px-3 py-2.5 text-right font-mono text-muted"
                  title={`${r.totals.conversions} conversas / ${count(r.totals.linkClicks ?? null)} cliques`}
                >
                  {pct(r.metrics.cvr)}
                </td>
                <td
                  className="tabular px-3 py-2.5 text-right font-mono text-ink"
                  title={`${money(r.totals.spend, meta.currency)} / ${r.totals.conversions} conversas`}
                >
                  {money(r.metrics.cpa, meta.currency)}
                </td>
                <td className="tabular px-3 py-2.5 text-right font-mono text-muted">
                  {money(r.metrics.cpm, meta.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-hairline font-medium">
              <td className="px-4 py-2.5 text-ink">Total</td>
              <td className="tabular px-3 py-2.5 text-right font-mono text-ink">
                {money(headline.totals.spend, meta.currency)}
              </td>
              <td className="tabular px-3 py-2.5 text-right font-mono text-muted">
                {count(headline.totals.impressions)}
              </td>
              <td className="tabular px-3 py-2.5 text-right font-mono text-muted">
                {count(headline.totals.linkClicks ?? null)}
              </td>
              <td className="tabular px-3 py-2.5 text-right font-mono text-muted">
                {pct(headline.metrics.ctr)}
              </td>
              <td className="tabular px-3 py-2.5 text-right font-mono text-muted">
                {money(headline.metrics.cpc, meta.currency)}
              </td>
              <td className="tabular px-3 py-2.5 text-right font-mono text-ink">
                {count(headline.totals.conversions)}
              </td>
              <td className="tabular px-3 py-2.5 text-right font-mono text-muted">
                {pct(headline.metrics.cvr)}
              </td>
              <td className="tabular px-3 py-2.5 text-right font-mono text-ink">
                {money(headline.metrics.cpa, meta.currency)}
              </td>
              <td className="tabular px-3 py-2.5 text-right font-mono text-muted">
                {money(headline.metrics.cpm, meta.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
