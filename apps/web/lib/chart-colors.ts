// Espelha os tokens de app/globals.css — Recharts recebe cor como string,
// não como classe utilitária, então os valores literais vivem aqui também.
export const CHART_COLORS = {
  accent: "#4c9aff",
  accentWarm: "#f2a65a",
  good: "#3dbe79",
  bad: "#e5675a",
  muted: "#8593a6",
  hairline: "#232933",
  ink: "#e8ecf1",
} as const;

/**
 * Ciclo de cores para séries dinâmicas (verticais, canais, criativos…).
 *
 * Oito matizes com luminância deliberadamente escalonada: docs/06 exige que
 * todo gráfico continue legível em escala de cinza, e o PDF é impresso. Cores
 * de mesma luminância viram a mesma faixa de cinza e o gráfico morre no papel.
 */
export const SERIES_PALETTE = [
  "#4c9aff", // azul
  "#f2a65a", // laranja
  "#7fd1b9", // verde-água claro
  "#c792ea", // roxo
  "#e5675a", // vermelho
  "#ffd166", // amarelo
  "#5b8def", // índigo
  "#2f9e8f", // verde-petróleo escuro
];
