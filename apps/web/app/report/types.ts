/**
 * Forma do payload de relatório. É este objeto que vai congelado para
 * `reports.payload` (docs/02, docs/05) e é o mesmo que a UI renderiza — se as
 * duas formas divergirem, relatório salvo e relatório vivo passam a mostrar
 * coisas diferentes, que é exatamente o que o congelamento existe para evitar.
 *
 * Nenhuma métrica derivada é calculada no cliente. Tudo que é divisão vem
 * pronto daqui, calculado em packages/metrics (CLAUDE.md § 2.2).
 */
import type { RawTotals, DerivedMetrics, SampleVerdict } from "@tego/metrics";

/**
 * Dimensões pelas quais o relatório pode ser quebrado.
 *
 * As três primeiras são a hierarquia real do Meta, resolvida por
 * `parent_ext_id` em dim_entity. As três últimas são as tags
 * [Vertical][Canal][Temperatura] extraídas do nome do conjunto.
 */
export const DIMENSIONS = [
  "campanha",
  "conjunto",
  "criativo",
  "vertical",
  "canal",
  "temperatura",
] as const;
export type DimensionKey = (typeof DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  campanha: "Campanha",
  conjunto: "Conjunto",
  criativo: "Criativo",
  vertical: "Vertical",
  canal: "Canal",
  temperatura: "Temperatura",
};

/** Métricas plotáveis na série temporal. */
export const METRICS = ["spend", "conversions", "cpa"] as const;
export type MetricKey = (typeof METRICS)[number];

export const METRIC_LABELS: Record<MetricKey, string> = {
  spend: "Gasto",
  conversions: "Conversas",
  cpa: "CPA",
};

/** `money` formata como moeda; `count` como inteiro. */
export const METRIC_FORMAT: Record<MetricKey, "money" | "count"> = {
  spend: "money",
  conversions: "count",
  cpa: "money",
};

/** Estado de veiculação agregado de uma linha de quebra. */
export type DeliveryStatus = "active" | "inactive" | "misto";

export interface BreakdownRow {
  key: string;
  totals: RawTotals;
  metrics: DerivedMetrics;
  sample: SampleVerdict;
  /**
   * `misto` aparece quando a linha agrega entidades em estados diferentes —
   * um conjunto com metade dos criativos pausados, por exemplo. Colapsar isso
   * para "ativo" esconderia que metade da verba parou.
   */
  status: DeliveryStatus | null;
}

/** Um ponto por data; as chaves restantes são os valores de cada série. */
export interface SeriesPoint {
  date: string;
  [seriesKey: string]: string | number | null;
}

export interface DimensionSlice {
  keys: string[];
  rows: BreakdownRow[];
  /** série pronta por métrica — CPA já dividido no servidor */
  series: Record<MetricKey, SeriesPoint[]>;
}

export interface FunnelStage {
  key: string;
  label: string;
  /** null = etapa que o dado atual não sustenta */
  value: number | null;
  /** taxa em relação à etapa anterior disponível, já calculada */
  rateFromPrev: number | null;
  unavailableReason?: string;
}

export interface ReportPayload {
  meta: {
    accountName: string;
    clientName: string;
    clientSlug: string;
    currency: string;
    /** início do recorte exibido (pode ser um filtro, não o dado inteiro) */
    periodStart: string;
    periodEnd: string;
    periodDays: number;
    /** extremos do que existe no banco — alimentam os limites do filtro */
    dataStart: string;
    dataEnd: string;
    /** meta de CPA do cliente; null = sem meta, gráfico sem linha de referência */
    targetCpa: number | null;
    /** campanhas da conta, para o seletor de escopo */
    campaigns: Array<{ extId: string; name: string }>;
    /** campanha em escopo; null = conta inteira */
    campaignExtId: string | null;
    campaignName: string | null;
    generatedAt: string;
    /** avisos herdados do import — export sem coluna de ID, etc. */
    caveats: string[];
  };
  headline: {
    totals: RawTotals;
    metrics: DerivedMetrics;
    sample: SampleVerdict;
  };
  funnel: FunnelStage[];
  byDimension: Record<DimensionKey, DimensionSlice>;
}

/** Título padrão de um relatório novo, antes de o operador renomear. */
export function defaultTitle(accountName: string, start: string, end: string) {
  const br = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  return `${accountName} — ${br(start)} a ${br(end)}`;
}
