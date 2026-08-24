"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { PRINT_PALETTE, PRINT_COLORS } from "../../lib/chart-colors";
import { DIMENSION_LABELS, type DimensionKey, type ReportPayload } from "./types";

/**
 * Versão para papel. É a mesma fonte de números do painel — recebe o MESMO
 * payload — mas em tema claro e sem nada interativo: docs/06 diz que o padrão é
 * claro porque o PDF é claro, e CLAUDE.md manda gerar o PDF a partir de um print
 * desta rota, nunca de uma biblioteca de PDF separada (que divergiria do painel
 * em duas semanas).
 *
 * Os gráficos usam dimensão FIXA em pixels, não ResponsiveContainer, e animação
 * desligada. É a diferença entre ter gráfico no PDF e não ter: o
 * ResponsiveContainer mede o elemento pai depois da montagem e desenha no frame
 * seguinte, e o diálogo de impressão dispara antes disso — sai eixo cortado ou
 * área em branco. Com largura fixa, o SVG nasce completo no primeiro render.
 *
 * A impressão ainda espera as fontes carregarem e dois frames de layout, porque
 * fonte que assenta depois muda a métrica do texto e reflui a tabela no meio da
 * geração.
 */
export function PrintReport({
  payload,
  title,
  frozenAt,
  autoPrint = true,
}: {
  payload: ReportPayload;
  title: string;
  frozenAt?: string;
  autoPrint?: boolean;
}) {
  const { meta, headline, funnel, byDimension } = payload;

  /**
   * `pronto` gate SÓ a chamada de impressão, nunca a renderização do gráfico.
   *
   * Com dimensão fixa o Recharts desenha no servidor também, então o SVG já vem
   * completo no HTML — antes de qualquer hidratação. Condicionar o gráfico à
   * montagem no cliente reintroduziria exatamente a corrida que a dimensão fixa
   * elimina, e um PDF gerado antes da hidratação sairia com buracos.
   */
  const [pronto, setPronto] = useState(false);
  useEffect(() => setPronto(true), []);

  useEffect(() => {
    if (!autoPrint || !pronto) return;
    let cancelado = false;
    const imprimir = () => {
      if (cancelado) return;
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    };
    const fontes = document.fonts?.ready ?? Promise.resolve();
    fontes.then(() => setTimeout(imprimir, 250));
    return () => {
      cancelado = true;
    };
  }, [autoPrint, pronto]);

  const money = (v: number | null) =>
    v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: meta.currency });
  const count = (v: number | null | undefined) =>
    v === null || v === undefined ? "—" : v.toLocaleString("pt-BR");
  const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(2)}%`);
  const br = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  const dimensionsToPrint: DimensionKey[] = ["campanha", "conjunto", "criativo"];

  const LARGURA = 780; // cabe em A4 retrato com margem de 12mm

  /**
   * Quebra usada nos gráficos: criativo quando há mais de um, senão campanha.
   * Gráfico de uma série só não compara nada — se o recorte tem um criativo
   * apenas, a comparação útil passa a ser entre campanhas.
   */
  const dimensaoDoGrafico: DimensionKey =
    byDimension.criativo.keys.length > 1 ? "criativo" : "campanha";
  const sliceDoGrafico = byDimension[dimensaoDoGrafico];
  const serieDiaria = sliceDoGrafico.series.spend;

  return (
    <div className="print-root mx-auto max-w-4xl bg-white p-8 text-[#111] print:p-0">
      <style>{`
        .print-root { color-scheme: light; }
        .print-root table { width: 100%; border-collapse: collapse; }
        .print-root th, .print-root td { padding: 5px 8px; border-bottom: 1px solid #e3e7ec; }
        .print-root th { text-align: left; font-size: 9px; text-transform: uppercase;
                          letter-spacing: .06em; color: #5b6675; font-weight: 600; }
        .print-root td { font-size: 11px; }
        .print-root .num { text-align: right; font-variant-numeric: tabular-nums;
                           font-family: ui-monospace, monospace; }
      `}</style>

      <header className="print-block border-b-2 border-[#111] pb-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#5b6675]">
          Relatório de tráfego pago
        </p>
        <h1 className="font-display mt-1 text-3xl font-bold leading-tight">{title}</h1>
        <p className="mt-1 text-sm text-[#40474f]">
          {meta.clientName} · {meta.accountName}
          {meta.campaignName && <> · campanha {meta.campaignName}</>}
        </p>
        <p className="mt-0.5 text-sm text-[#40474f]">
          Período: <strong>{br(meta.periodStart)}</strong> a <strong>{br(meta.periodEnd)}</strong>{" "}
          ({meta.periodDays} dias)
        </p>
        <p className="mt-2 text-[10px] text-[#5b6675]">
          {frozenAt
            ? `Números congelados em ${new Date(frozenAt).toLocaleString("pt-BR")}. O Meta reajusta dado retroativamente; este relatório não acompanha o reajuste, de propósito.`
            : `Gerado em ${new Date(meta.generatedAt).toLocaleString("pt-BR")}.`}
        </p>
      </header>

      {/* KPIs */}
      <section className="print-block mt-6 grid grid-cols-4 gap-3">
        {[
          { label: "Gasto", value: money(headline.totals.spend) },
          { label: "Conversas iniciadas", value: count(headline.totals.conversions) },
          { label: "Custo por conversa", value: money(headline.metrics.cpa) },
          { label: "CPM", value: money(headline.metrics.cpm) },
        ].map((k) => (
          <div key={k.label} className="rounded border border-[#d5dae1] px-3 py-2">
            <div className="text-[9px] uppercase tracking-wider text-[#5b6675]">{k.label}</div>
            <div className="num mt-1 text-lg font-semibold">{k.value}</div>
          </div>
        ))}
      </section>

      {headline.sample.level !== "ok" && (
        <p className="print-block mt-2 rounded border border-[#e6d9a8] bg-[#fdf8e6] px-3 py-2 text-[10px] leading-snug text-[#6b5a1e]">
          <strong>Amostra:</strong> {headline.sample.reason}
        </p>
      )}

      {/* funil */}
      <section className="print-block mt-6">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider">Funil</h2>
        <table className="mt-2">
          <thead>
            <tr>
              <th>Etapa</th>
              <th style={{ textAlign: "right" }}>Volume</th>
              <th style={{ textAlign: "right" }}>Passagem</th>
              <th>Observação</th>
            </tr>
          </thead>
          <tbody>
            {funnel.map((s) => (
              <tr key={s.key}>
                <td>{s.label}</td>
                <td className="num">{count(s.value)}</td>
                <td className="num">{pct(s.rateFromPrev)}</td>
                <td className="text-[9px] text-[#5b6675]">{s.unavailableReason ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* gráficos — mesmos dados das tabelas, em dimensão fixa para o papel */}
      {serieDiaria.length > 0 && (
        <section className="print-block mt-6">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider">
            Gasto diário por {DIMENSION_LABELS[dimensaoDoGrafico].toLowerCase()}
          </h2>
          <LineChart
            width={LARGURA}
            height={200}
            data={serieDiaria}
            margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
          >
            <CartesianGrid stroke={PRINT_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => d.slice(8) + "/" + d.slice(5, 7)}
              tick={{ fill: PRINT_COLORS.axis, fontSize: 9 }}
              axisLine={{ stroke: PRINT_COLORS.grid }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: PRINT_COLORS.axis, fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={46}
            />
            {sliceDoGrafico.keys.map((k, i) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={PRINT_PALETTE[i % PRINT_PALETTE.length]}
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {sliceDoGrafico.keys.map((k, i) => (
              <span key={k} className="flex items-center gap-1.5 text-[9px] text-[#40474f]">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: PRINT_PALETTE[i % PRINT_PALETTE.length] }}
                />
                {k}
              </span>
            ))}
          </div>
        </section>
      )}

      {sliceDoGrafico.rows.length > 0 && (
        <section className="print-block mt-6">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider">
            Custo por conversa, por {DIMENSION_LABELS[dimensaoDoGrafico].toLowerCase()}
          </h2>
          <BarChart
            width={LARGURA}
            height={Math.max(sliceDoGrafico.rows.length * 26 + 30, 110)}
            data={sliceDoGrafico.rows.map((r) => ({ key: r.key, cpa: r.metrics.cpa }))}
            layout="vertical"
            margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke={PRINT_COLORS.grid} horizontal={false} />
            <XAxis type="number" tick={{ fill: PRINT_COLORS.axis, fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="key"
              tick={{ fill: PRINT_COLORS.axis, fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={140}
            />
            <Bar dataKey="cpa" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {sliceDoGrafico.rows.map((r, i) => (
                <Cell key={r.key} fill={PRINT_PALETTE[i % PRINT_PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </section>
      )}

      {/* quebras */}
      {dimensionsToPrint.map((dim) => {
        const slice = byDimension[dim];
        if (!slice || slice.rows.length === 0) return null;
        return (
          <section key={dim} className="print-block mt-6">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider">
              Por {DIMENSION_LABELS[dim].toLowerCase()}
            </h2>
            <table className="mt-2">
              <thead>
                <tr>
                  <th>{DIMENSION_LABELS[dim]}</th>
                  <th style={{ textAlign: "right" }}>Gasto</th>
                  <th style={{ textAlign: "right" }}>Impr.</th>
                  <th style={{ textAlign: "right" }}>Cliques</th>
                  <th style={{ textAlign: "right" }}>CTR</th>
                  <th style={{ textAlign: "right" }}>Conversas</th>
                  <th style={{ textAlign: "right" }}>CVR</th>
                  <th style={{ textAlign: "right" }}>Custo/conversa</th>
                </tr>
              </thead>
              <tbody>
                {slice.rows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      {/* no papel o estado vai em palavra, não em cor: cor
                          impressa em cinza não distingue verde de vermelho */}
                      {r.status && (
                        <span className="mr-1.5 text-[8px] uppercase text-[#5b6675]">
                          {r.status === "active"
                            ? "▶ veiculando"
                            : r.status === "inactive"
                              ? "■ pausado"
                              : "◆ misto"}
                        </span>
                      )}
                      {r.key}
                      {r.sample.level !== "ok" && (
                        <span className="ml-1.5 text-[8px] uppercase text-[#8a7326]">
                          amostra baixa
                        </span>
                      )}
                    </td>
                    <td className="num">{money(r.totals.spend)}</td>
                    <td className="num">{count(r.totals.impressions)}</td>
                    <td className="num">{count(r.totals.linkClicks ?? null)}</td>
                    <td className="num">{pct(r.metrics.ctr)}</td>
                    <td className="num">{count(r.totals.conversions)}</td>
                    <td className="num">{pct(r.metrics.cvr)}</td>
                    <td className="num">{money(r.metrics.cpa)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 600 }}>
                  <td>Total</td>
                  <td className="num">{money(headline.totals.spend)}</td>
                  <td className="num">{count(headline.totals.impressions)}</td>
                  <td className="num">{count(headline.totals.linkClicks ?? null)}</td>
                  <td className="num">{pct(headline.metrics.ctr)}</td>
                  <td className="num">{count(headline.totals.conversions)}</td>
                  <td className="num">{pct(headline.metrics.cvr)}</td>
                  <td className="num">{money(headline.metrics.cpa)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        );
      })}

      {meta.caveats.length > 0 && (
        <section className="print-block mt-6 border-t border-[#d5dae1] pt-3">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-[#5b6675]">
            Ressalvas do dado
          </h2>
          <ul className="mt-1 list-disc pl-4">
            {meta.caveats.map((c) => (
              <li key={c} className="text-[10px] leading-snug text-[#40474f]">
                {c}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div data-print-hide className="mt-8 border-t border-[#d5dae1] pt-4 text-center">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-[#111] px-4 py-2 text-xs font-medium text-white"
        >
          Imprimir / salvar como PDF
        </button>
        <p className="mt-2 text-[11px] text-[#5b6675]">
          No diálogo de impressão, escolha “Salvar como PDF”. Deixe “Gráficos de
          fundo” ligado.
        </p>
      </div>
    </div>
  );
}
