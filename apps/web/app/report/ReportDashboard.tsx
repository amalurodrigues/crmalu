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
  ReferenceLine,
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
  CalendarRange,
  FileDown,
  Layers,
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
  /** id do relatório salvo, para a rota de impressão */
  reportId?: string;
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
    <div className="glass rounded-xl px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-faint">
        <Icon size={13} strokeWidth={1.75} />
        <span className="font-display text-xs font-semibold uppercase tracking-wider">{label}</span>
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

/**
 * Funil com forma real.
 *
 * docs/06 proíbe "funil decorativo sem número" — o que ele proíbe é a ausência
 * do número, não a forma. Cada etapa carrega o valor absoluto e a taxa contra a
 * etapa anterior disponível.
 *
 * A largura usa escala LOGARÍTMICA e o rótulo diz isso. De 30.356 impressões
 * para 27 conversas há três ordens de grandeza: em escala linear as duas
 * últimas etapas virariam um fio de um pixel, e o gráfico deixaria de informar
 * exatamente onde está o vazamento. O número escrito em cima é o que carrega a
 * magnitude; a forma carrega a sequência.
 */
function Funnel({ stages }: { stages: ReportPayload["funnel"] }) {
  const base = stages.find((s) => s.value !== null)?.value ?? 1;
  const MIN = 16; // piso em %, para etapa indisponível ainda ter corpo clicável

  const widthOf = (v: number | null) =>
    v === null ? MIN : Math.max(MIN, (Math.log(v + 1) / Math.log(base + 1)) * 100);

  return (
    <div>
      <div className="space-y-1">
        {stages.map((s, i) => {
          const next = stages[i + 1];
          const wTop = widthOf(s.value);
          const wBottom = next ? widthOf(next.value) : wTop * 0.82;
          const available = s.value !== null;

          // trapézio: converge do topo para a base, centralizado
          const clip = `polygon(${(100 - wTop) / 2}% 0%, ${(100 + wTop) / 2}% 0%, ${
            (100 + wBottom) / 2
          }% 100%, ${(100 - wBottom) / 2}% 100%)`;

          const color = SERIES_PALETTE[i % SERIES_PALETTE.length];

          return (
            <div key={s.key}>
              <div className="relative h-[62px]">
                <div
                  className="absolute inset-0"
                  style={{
                    clipPath: clip,
                    background: available
                      ? `linear-gradient(180deg, ${color}55, ${color}22)`
                      : "repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 6px, transparent 6px 12px)",
                    border: available ? "none" : undefined,
                  }}
                />
                <div className="relative flex h-full flex-col items-center justify-center">
                  <span
                    className={
                      "tabular font-mono text-lg font-medium leading-none " +
                      (available ? "text-ink" : "text-faint")
                    }
                  >
                    {available ? count(s.value) : "—"}
                  </span>
                  <span className="mt-1 text-[11px] text-muted">{s.label}</span>
                </div>
              </div>

              {/* taxa de passagem, no estrangulamento entre as etapas */}
              {next && (
                <div className="flex items-center justify-center py-0.5">
                  {next.rateFromPrev !== null ? (
                    <span className="tabular rounded-full border border-white/10 bg-canvas/70 px-2 py-0.5 font-mono text-[10px] text-muted">
                      ↓ {pct(next.rateFromPrev)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-faint">↓</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {stages.some((s) => s.unavailableReason) && (
        <ul className="mt-3 space-y-1 border-t border-white/5 pt-3">
          {stages
            .filter((s) => s.unavailableReason)
            .map((s) => (
              <li key={s.key} className="text-[11px] leading-snug text-faint">
                <span className="text-muted">{s.label}:</span> {s.unavailableReason}
              </li>
            ))}
        </ul>
      )}

      <p className="mt-2 text-[10px] text-faint">
        Largura em escala logarítmica — os números é que carregam a magnitude.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ principal

export function ReportDashboard({
  payload,
  title,
  frozenAt,
  reportId,
  saveAction,
}: Props) {
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
  const [titleValue, setTitleValue] = useState(title);

  /**
   * Link de impressão. Relatório salvo imprime o snapshot pelo id; o vivo leva o
   * recorte inteiro na querystring para o papel sair igual à tela.
   */
  const printHref = reportId
    ? `/report/${reportId}/print`
    : "/report/print?" +
      new URLSearchParams({
        slug: meta.clientSlug,
        from: meta.periodStart,
        to: meta.periodEnd,
        ...(meta.campaignExtId ? { campaign: meta.campaignExtId } : {}),
        title: titleValue,
      }).toString();

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
            <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{title}</h1>
          ) : (
            <input
              name="title"
              form="save-report"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              aria-label="Título do relatório"
              className="w-full min-w-0 rounded border border-transparent bg-transparent px-1
                         font-display text-3xl font-bold tracking-tight text-ink outline-none
                         hover:border-white/15
                         focus:border-accent"
            />
          )}
          <p className="mt-1.5 text-sm text-muted">
            {meta.accountName} · {longDate(meta.periodStart)} – {longDate(meta.periodEnd)}
            <span className="text-faint"> ({meta.periodDays} dias)</span>
          </p>

          {/* Filtro de período por GET: o recorte vira URL, e URL se manda por
              mensagem. docs/06 — "todo estado de filtro na querystring". */}
          {!readOnly && (
            <form method="get" action="/report" className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="slug" value={meta.clientSlug} />

              {meta.campaigns.length > 0 && (
                <>
                  <Layers size={13} strokeWidth={1.75} className="text-faint" />
                  <select
                    name="campaign"
                    aria-label="Campanha"
                    defaultValue={meta.campaignExtId ?? ""}
                    className="max-w-[16rem] rounded-md border border-white/10 bg-canvas/60 px-2 py-1 text-xs text-muted outline-none focus:border-accent"
                  >
                    <option value="">Todas as campanhas</option>
                    {meta.campaigns.map((c) => (
                      <option key={c.extId} value={c.extId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <CalendarRange size={13} strokeWidth={1.75} className="text-faint" />
              <input
                type="date"
                name="from"
                aria-label="Início do período"
                defaultValue={meta.periodStart}
                min={meta.dataStart}
                max={meta.dataEnd}
                className="rounded-md border border-white/10 bg-canvas/60 px-2 py-1 text-xs text-muted outline-none focus:border-accent"
              />
              <span className="text-xs text-faint">até</span>
              <input
                type="date"
                name="to"
                aria-label="Fim do período"
                defaultValue={meta.periodEnd}
                min={meta.dataStart}
                max={meta.dataEnd}
                className="rounded-md border border-white/10 bg-canvas/60 px-2 py-1 text-xs text-muted outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/40 hover:text-ink"
              >
                Aplicar
              </button>
              {(meta.periodStart !== meta.dataStart || meta.periodEnd !== meta.dataEnd) && (
                <a
                  href={`/report?slug=${meta.clientSlug}`}
                  className="text-xs text-faint underline-offset-2 hover:text-ink hover:underline"
                >
                  período inteiro
                </a>
              )}
            </form>
          )}
          {frozenAt && (
            <p className="mt-1 text-xs text-faint">
              Números congelados em {new Date(frozenAt).toLocaleString("pt-BR")} — não recalculam.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <a
            href={printHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/40 hover:text-ink"
          >
            <FileDown size={13} strokeWidth={1.75} />
            PDF
          </a>
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
              <input type="hidden" name="slug" value={meta.clientSlug} />
              <input type="hidden" name="from" value={meta.periodStart} />
              <input type="hidden" name="to" value={meta.periodEnd} />
              <input type="hidden" name="campaign" value={meta.campaignExtId ?? ""} />
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
        <div className="glass mt-4 rounded-xl px-4 py-3">
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
        <div className="glass rounded-2xl p-4 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-ink">
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
                {/* docs/06: "gráfico sem referência não sustenta decisão".
                    Só aparece na série de CPA e só se o cliente tem meta. */}
                {metric === "cpa" && meta.targetCpa !== null && (
                  <ReferenceLine
                    y={meta.targetCpa}
                    stroke={CHART_COLORS.accentWarm}
                    strokeDasharray="5 4"
                    label={{
                      value: `meta ${money(meta.targetCpa, meta.currency)}`,
                      position: "insideTopRight",
                      fill: CHART_COLORS.accentWarm,
                      fontSize: 10,
                    }}
                  />
                )}
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

        <div className="glass rounded-2xl p-4 lg:col-span-2">
          <h2 className="font-display text-sm font-semibold text-ink">Funil</h2>
          <div className="mt-3">
            <Funnel stages={funnel} />
          </div>
        </div>
      </div>

      {/* CPA por chave da dimensão — barras ordenadas (docs/06) */}
      <div className="glass mt-4 rounded-2xl p-4">
        <h2 className="font-display text-sm font-semibold text-ink">
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
              {meta.targetCpa !== null && (
                <ReferenceLine
                  x={meta.targetCpa}
                  stroke={CHART_COLORS.accentWarm}
                  strokeDasharray="5 4"
                  label={{
                    value: "meta",
                    position: "top",
                    fill: CHART_COLORS.accentWarm,
                    fontSize: 10,
                  }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* tabela */}
      <div className="glass mt-4 overflow-x-auto rounded-2xl">
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
