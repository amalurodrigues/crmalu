/**
 * Única fonte de cálculo de métrica derivada. Ver docs/04-camada-de-metricas.md.
 *
 * Regra não-negociável: toda métrica derivada é SUM(numerador)/SUM(denominador)
 * sobre o conjunto filtrado. Nunca média de linhas já derivadas.
 * Divisão por zero devolve null, não 0 — null renderiza "—" na UI.
 */

export interface RawTotals {
  impressions: number;
  spend: number;
  conversions: number;
  /** presente só quando os totais vieram de fact_insights_period; nunca some entre entidades */
  reach?: number;
}

export interface DerivedMetrics {
  cpm: number | null;
  cpa: number | null;
  frequency: number | null;
}

function safeDivide(numerator: number, denominator: number): number | null {
  if (!denominator || denominator === 0) return null;
  return numerator / denominator;
}

export function computeMetrics(t: RawTotals): DerivedMetrics {
  return {
    cpm: safeDivide(t.spend, t.impressions) === null
      ? null
      : (t.spend / t.impressions) * 1000,
    cpa: safeDivide(t.spend, t.conversions),
    frequency: t.reach !== undefined ? safeDivide(t.impressions, t.reach) : null,
  };
}

/** Soma RawTotals de várias linhas — é a ÚNICA forma correta de agregar. */
export function sumTotals(rows: RawTotals[]): RawTotals {
  return rows.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      spend: acc.spend + r.spend,
      conversions: acc.conversions + r.conversions,
      // reach deliberadamente NÃO acumulado — não é aditivo entre entidades
    }),
    { impressions: 0, spend: 0, conversions: 0 }
  );
}

/**
 * Guarda-corpo em runtime: se alguém tentar aggregar tirando média de CPAs já
 * calculados, isto detecta o padrão e falha alto, em vez de produzir número
 * silenciosamente errado. Uso: chamar em qualquer função de agregação nova
 * antes de aceitar um array de "métricas" como entrada.
 */
export function assertNotAlreadyDerived(rows: unknown[]): void {
  for (const r of rows) {
    if (r && typeof r === "object" && ("cpa" in r || "ctr" in r || "roas" in r)) {
      throw new Error(
        "assertNotAlreadyDerived: recebi um objeto com métrica derivada " +
          "(cpa/ctr/roas). Agregação deve receber RawTotals, nunca DerivedMetrics. " +
          "Ver docs/04-camada-de-metricas.md — proibido média de média."
      );
    }
  }
}
