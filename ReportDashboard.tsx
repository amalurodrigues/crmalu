"use client";

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
import { Wallet, MessageCircle, Target, Eye, ArrowRight } from "lucide-react";
import { CHART_COLORS, SERIES_PALETTE } from "../../lib/chart-colors";
import type { RawTotals, DerivedMetrics } from "@tego/metrics";

export interface VerticalRow {
  vertical: string;
  spend: number;
  conversions: number;
  cpa: number | null;
}
export interface SeriesPoint {
  date: string;
  [vertical: string]: string | number;
}

interface Props {
  accountName: string;
  byVertical: VerticalRow[];
  verticalKeys: string[];
  series: SeriesPoint[];
  grandTotal: RawTotals;
  grandMetrics: DerivedMetrics;
}

function money(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function moneyTooltip(value: unknown): string {
  return typeof value === "number" ? money(value) : "—";
}

function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function shortDateLabel(label: React.ReactNode) {
  return typeof label === "string" ? shortDate(label) : String(label ?? "");
}

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-faint">
        <Icon size={13} strokeWidth={1.75} />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <div className="tabular mt-1.5 font-mono text-xl font-medium text-ink">{value}</div>
    </div>
  );
}

export function ReportDashboard({
  accountName,
  byVertical,
  verticalKeys,
  series,
  grandTotal,
  grandMetrics,
}: Props) {
  const colorFor = (v: string) => SERIES_PALETTE[verticalKeys.indexOf(v) % SERIES_PALETTE.length];

  const conversionRatePct =
    grandTotal.impressions > 0 ? (grandTotal.conversions / grandTotal.impressions) * 100 : null;

  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wider text-faint">Relatório</p>
      <h1 className="text-2xl font-semibold text-ink">{accountName}</h1>

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard icon={Wallet} label="Gasto" value={money(grandTotal.spend)} />
        <KpiCard icon={MessageCircle} label="Conversas" value={String(grandTotal.conversions)} />
        <KpiCard icon={Target} label="CPA" value={money(grandMetrics.cpa)} />
        <KpiCard icon={Eye} label="CPM" value={money(grandMetrics.cpm)} />
      </div>

      {/* tendência + comparação */}
      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <div className="rounded-lg border border-hairline bg-surface p-4 lg:col-span-3">
          <h2 className="text-sm font-medium text-ink">Gasto diário por vertical</h2>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
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
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: CHART_COLORS.ink === "#e8ecf1" ? "#12161d" : "#12161d",
                    border: `1px solid ${CHART_COLORS.hairline}`,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={shortDateLabel}
                  formatter={moneyTooltip}
                />
                {verticalKeys.map((v) => (
                  <Line
                    key={v}
                    type="monotone"
                    dataKey={v}
                    name={v}
                    stroke={colorFor(v)}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {verticalKeys.map((v) => (
              <span key={v} className="flex items-center gap-1.5 text-xs text-muted">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: colorFor(v) }}
                />
                {v}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-hairline bg-surface p-4 lg:col-span-2">
          <h2 className="text-sm font-medium text-ink">CPA por vertical</h2>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={byVertical}
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
                  dataKey="vertical"
                  tick={{ fill: CHART_COLORS.muted, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    background: "#12161d",
                    border: `1px solid ${CHART_COLORS.hairline}`,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={moneyTooltip}
                />
                <Bar dataKey="cpa" radius={[0, 4, 4, 0]}>
                  {byVertical.map((row) => (
                    <Cell key={row.vertical} fill={colorFor(row.vertical)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* cobertura — 2 estágios que o CSV atual sustenta, sem inventar etapa */}
      <div className="mt-4 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-medium text-ink">Cobertura</h2>
        <div className="mt-3 flex items-center gap-4 text-sm">
          <div>
            <div className="tabular font-mono text-lg text-ink">
              {grandTotal.impressions.toLocaleString("pt-BR")}
            </div>
            <div className="text-xs text-faint">impressões</div>
          </div>
          <ArrowRight size={14} className="text-faint" />
          <div>
            <div className="tabular font-mono text-lg text-ink">{grandTotal.conversions}</div>
            <div className="text-xs text-faint">conversas iniciadas</div>
          </div>
          <div className="ml-auto text-right">
            <div className="tabular font-mono text-lg text-ink">
              {conversionRatePct !== null ? `${conversionRatePct.toFixed(2)}%` : "—"}
            </div>
            <div className="text-xs text-faint">impressão → conversa</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-faint">
          CTR e cliques aparecem aqui assim que o export incluir essas
          colunas — ver docs/03-ingestao-csv-meta-ads.md.
        </p>
      </div>

      {/* tabela */}
      <div className="mt-4 overflow-hidden rounded-lg border border-hairline bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-faint">
              <th className="px-4 py-2.5 font-normal">Vertical</th>
              <th className="px-4 py-2.5 text-right font-normal">Gasto</th>
              <th className="px-4 py-2.5 text-right font-normal">Conversões</th>
              <th className="px-4 py-2.5 text-right font-normal">CPA</th>
            </tr>
          </thead>
          <tbody>
            {byVertical.map((v) => (
              <tr key={v.vertical} className="border-b border-hairline last:border-0">
                <td className="flex items-center gap-2 px-4 py-2.5 text-ink">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: colorFor(v.vertical) }}
                  />
                  {v.vertical}
                </td>
                <td className="tabular px-4 py-2.5 text-right font-mono text-ink">
                  {money(v.spend)}
                </td>
                <td className="tabular px-4 py-2.5 text-right font-mono text-ink">
                  {v.conversions}
                </td>
                <td className="tabular px-4 py-2.5 text-right font-mono text-ink">
                  {money(v.cpa)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-hairline font-medium">
              <td className="px-4 py-2.5 text-ink">Total</td>
              <td className="tabular px-4 py-2.5 text-right font-mono text-ink">
                {money(grandTotal.spend)}
              </td>
              <td className="tabular px-4 py-2.5 text-right font-mono text-ink">
                {grandTotal.conversions}
              </td>
              <td className="tabular px-4 py-2.5 text-right font-mono text-ink">
                {money(grandMetrics.cpa)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
