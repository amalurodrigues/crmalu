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
  /**
   * Cliques. `null` significa "o export não trazia a coluna", que é diferente
   * de `0` ("houve zero cliques"). Métrica que depende de um contador nulo
   * devolve `null`, não zero — senão o relatório mostra CTR 0,00% quando a
   * resposta honesta é "não sei".
   */
  clicks?: number | null;
  linkClicks?: number | null;
  outboundClicks?: number | null;
  /** presente só quando os totais vieram de fact_insights_period; nunca some entre entidades */
  reach?: number;
}

export interface DerivedMetrics {
  cpm: number | null;
  cpa: number | null;
  /** sobre linkClicks */
  cpc: number | null;
  /** sobre clicks (all) */
  cpcAll: number | null;
  /** linkClicks / impressions */
  ctr: number | null;
  ctrAll: number | null;
  /** conversions / linkClicks — nunca sobre clicks (docs/04) */
  cvr: number | null;
  frequency: number | null;
}

function safeDivide(numerator: number, denominator: number): number | null {
  if (!denominator || denominator === 0) return null;
  return numerator / denominator;
}

/** Divisão em que o numerador ausente (null) propaga null em vez de virar 0. */
function safeDivideNullable(
  numerator: number | null | undefined,
  denominator: number | null | undefined
): number | null {
  if (numerator === null || numerator === undefined) return null;
  if (denominator === null || denominator === undefined) return null;
  return safeDivide(numerator, denominator);
}

export function computeMetrics(t: RawTotals): DerivedMetrics {
  return {
    cpm: safeDivide(t.spend * 1000, t.impressions),
    cpa: safeDivide(t.spend, t.conversions),
    cpc: safeDivideNullable(t.spend, t.linkClicks),
    cpcAll: safeDivideNullable(t.spend, t.clicks),
    ctr: safeDivideNullable(t.linkClicks, t.impressions),
    ctrAll: safeDivideNullable(t.clicks, t.impressions),
    cvr: safeDivideNullable(t.conversions, t.linkClicks),
    frequency: t.reach !== undefined ? safeDivide(t.impressions, t.reach) : null,
  };
}

/** Soma dois contadores que podem ser "não ingerido". null + null continua null. */
function addNullable(
  a: number | null | undefined,
  b: number | null | undefined
): number | null {
  if ((a === null || a === undefined) && (b === null || b === undefined)) return null;
  return (a ?? 0) + (b ?? 0);
}

/** Soma RawTotals de várias linhas — é a ÚNICA forma correta de agregar. */
export function sumTotals(rows: RawTotals[]): RawTotals {
  return rows.reduce<RawTotals>(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      spend: acc.spend + r.spend,
      conversions: acc.conversions + r.conversions,
      clicks: addNullable(acc.clicks, r.clicks),
      linkClicks: addNullable(acc.linkClicks, r.linkClicks),
      outboundClicks: addNullable(acc.outboundClicks, r.outboundClicks),
      // reach deliberadamente NÃO acumulado — não é aditivo entre entidades
    }),
    {
      impressions: 0,
      spend: 0,
      conversions: 0,
      clicks: null,
      linkClicks: null,
      outboundClicks: null,
    }
  );
}

/**
 * Significância operacional — docs/04-camada-de-metricas.md § "Significância".
 *
 * Limiares são heurística de operação, NÃO teste estatístico. Existem para
 * impedir que o operador declare vencedor com amostra que não sustenta a
 * decisão. Na UI aparecem como badge, nunca como bloqueio.
 */
export type SampleLevel = "ok" | "baixa" | "aprendizado";

export interface SampleVerdict {
  level: SampleLevel;
  /** quantas conversões faltam para sair de "amostra baixa" */
  conversionsNeeded: number;
  reason: string;
}

const MIN_CONVERSIONS_ACIONAVEL = 50;
const MIN_CONVERSIONS_LEARNING_7D = 50;

/** Badge de amostra de um braço isolado (um criativo, um público). */
export function sampleVerdict(totals: RawTotals, periodDays?: number): SampleVerdict {
  const c = totals.conversions;

  if (periodDays !== undefined && periodDays <= 7 && c < MIN_CONVERSIONS_LEARNING_7D) {
    return {
      level: "aprendizado",
      conversionsNeeded: MIN_CONVERSIONS_LEARNING_7D - c,
      reason:
        `${c} conversões em ${periodDays} dias — abaixo de ${MIN_CONVERSIONS_LEARNING_7D}/7d, ` +
        "provavelmente ainda em learning phase. Comparação não é confiável.",
    };
  }

  if (c < MIN_CONVERSIONS_ACIONAVEL) {
    return {
      level: "baixa",
      conversionsNeeded: MIN_CONVERSIONS_ACIONAVEL - c,
      reason:
        `${c} conversões — abaixo de ${MIN_CONVERSIONS_ACIONAVEL}. ` +
        `Faltam ${MIN_CONVERSIONS_ACIONAVEL - c} para o número sustentar decisão.`,
    };
  }

  return { level: "ok", conversionsNeeded: 0, reason: `${c} conversões — amostra suficiente.` };
}

export interface ReadinessVerdict {
  ready: boolean;
  reason: string;
  conversionsNeeded: number;
}

/**
 * Compara dois braços e diz se dá para declarar vencedor.
 * Recebe RawTotals (nunca métrica já derivada) — ver assertNotAlreadyDerived.
 */
export function decisionReadiness(
  a: RawTotals,
  b: RawTotals,
  periodDays?: number
): ReadinessVerdict {
  if (periodDays !== undefined && periodDays < 7) {
    return {
      ready: false,
      reason: `Período de ${periodDays} dias — menos de 7 dias corridos não permite marcar vencedor.`,
      conversionsNeeded: 0,
    };
  }

  const winner = a.conversions >= b.conversions ? a : b;
  const loser = winner === a ? b : a;

  if (winner.conversions < MIN_CONVERSIONS_ACIONAVEL) {
    return {
      ready: false,
      reason: `Braço vencedor tem ${winner.conversions} conversões — amostra baixa.`,
      conversionsNeeded: MIN_CONVERSIONS_ACIONAVEL - winner.conversions,
    };
  }

  const cpaWinner = computeMetrics(winner).cpa;
  const cpaLoser = computeMetrics(loser).cpa;
  if (cpaWinner === null || cpaLoser === null) {
    return {
      ready: false,
      reason: "Um dos braços não tem CPA definido (zero conversões).",
      conversionsNeeded: 0,
    };
  }

  const diff = Math.abs(cpaWinner - cpaLoser) / Math.max(cpaWinner, cpaLoser);
  if (diff < 0.2 && Math.min(a.conversions, b.conversions) < 100) {
    return {
      ready: false,
      reason:
        `Diferença de CPA de ${(diff * 100).toFixed(1)}% com menos de 100 conversões ` +
        "por braço — inconclusivo.",
      conversionsNeeded: 100 - Math.min(a.conversions, b.conversions),
    };
  }

  return {
    ready: true,
    reason: `Diferença de CPA de ${(diff * 100).toFixed(1)}% com amostra suficiente.`,
    conversionsNeeded: 0,
  };
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
