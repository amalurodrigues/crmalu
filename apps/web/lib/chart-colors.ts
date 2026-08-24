// Espelha os tokens de app/globals.css — Recharts recebe cor como string,
// não como classe utilitária, então os valores literais vivem aqui também.
export const CHART_COLORS = {
  accent: "#5aa9ff",
  accentWarm: "#f7a85c",
  good: "#3dbe79",
  bad: "#e5675a",
  muted: "#93a1b5",
  faint: "#7d8b9f",
  hairline: "#2a3240",
  ink: "#eef2f7",
  /** fundo do tooltip — nível 3 da escada de elevação */
  overlay: "#232a36",
} as const;

/**
 * Ciclo de cores para séries dinâmicas (campanhas, conjuntos, criativos…).
 *
 * Calibrada para fundo ESCURO: toda cor tem luminância suficiente para separar
 * de #141922. As mesmas cores pensadas para fundo claro ficam abafadas aqui —
 * tema escuro é contexto próprio, não uma variante do claro.
 *
 * A ordem é por distinção de matiz, e as quatro primeiras também têm luminância
 * bem separada, porque é o caso comum (poucas séries) e é o que sobrevive em
 * escala de cinza no PDF. Acima de quatro ou cinco séries, distinguir por cor
 * impressa em cinza deixa de ser confiável para qualquer paleta — por isso o
 * relatório impresso leva a tabela, não só o gráfico.
 *
 * Verde e vermelho da paleta de STATUS ficam de fora de propósito: ali eles
 * significam polaridade (bom/ruim), e reaproveitá-los como categoria faria
 * "acima da meta" e "terceira campanha" terem a mesma cor.
 */
export const SERIES_PALETTE = [
  "#5aa9ff", // azul
  "#ffd97d", // amarelo
  "#66d9c0", // verde-água
  "#c99bf5", // lavanda
  "#ff7a6b", // coral
  "#9fe870", // verde-limão
  "#f7a85c", // laranja
  "#ff9ecb", // rosa
];
