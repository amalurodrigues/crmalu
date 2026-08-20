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

// Ciclo de cores para séries dinâmicas (verticais, campanhas, etc.)
export const SERIES_PALETTE = ["#4c9aff", "#f2a65a", "#7fd1b9", "#c792ea", "#e5675a"];
