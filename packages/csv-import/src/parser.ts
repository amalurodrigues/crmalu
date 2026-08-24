/**
 * Parser do export CSV do Meta Ads Manager. Port em TypeScript do protótipo
 * validado em Python (prototypes/parse_meta_csv.py na raiz da doc).
 *
 * Detecta automaticamente o template:
 *   v1: período único, sem ID de campanha/conjunto/anúncio
 *   v2: com IDs + quebra diária (coluna "Dia")  ← template atual, use este
 *
 * Ver docs/03-ingestao-csv-meta-ads.md para a especificação completa.
 */
import { parse as parseCsvSync } from "csv-parse/sync";
import { readFileSync } from "node:fs";

const NULL_MARKERS = new Set(["–", "-", "", "N/A", "n/a"]);

function toNull(v: string | undefined): string | null {
  if (v === undefined) return null;
  return NULL_MARKERS.has(v.trim()) ? null : v.trim();
}

function toNumber(v: string | undefined): number | null {
  const s = toNull(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

const ATTRIBUTION_MAP: Record<string, string> = {
  "Clique de 7 dias ou visualização de 1 dia": "7d_click_1d_view",
  "Clique de 7 dias": "7d_click",
  "Clique de 1 dia": "1d_click",
};

function normalizeAttribution(raw: string): string {
  return ATTRIBUTION_MAP[raw.trim()] ?? raw.trim();
}

function extractCurrency(headers: string[]): string {
  const col = headers.find((h) => /^Valor gasto \(\w{3}\)$/.test(h));
  const m = col?.match(/\((\w{3})\)/);
  if (!m) {
    throw new Error(
      "Não encontrei a coluna 'Valor gasto (XXX)' — cabeçalho do export mudou?"
    );
  }
  return m[1];
}

function extractTags(adsetName: string): string[] {
  const matches = [...adsetName.matchAll(/\[(.*?)\]/g)];
  return matches.map((m) => m[1]);
}

/**
 * Colunas de clique. O Ads Manager varia o rótulo conforme o idioma e a versão
 * do "Personalizar colunas", então cada métrica aceita uma lista de apelidos.
 * Coluna ausente vira `null` (não 0) — ver RawTotals em packages/metrics.
 */
const CLICK_COLUMNS = {
  linkClicks: ["Cliques no link", "Cliques em links", "Link clicks"],
  clicks: ["Cliques (todos)", "Cliques", "Clicks (all)"],
  outboundClicks: ["Cliques de saída", "Cliques em links de saída", "Outbound clicks"],
} as const;

function findHeader(headers: string[], candidates: readonly string[]): string | null {
  const norm = (s: string) => s.trim().toLowerCase();
  for (const c of candidates) {
    const hit = headers.find((h) => norm(h) === norm(c));
    if (hit) return hit;
  }
  return null;
}

const REQUIRED_ID_COLS = [
  "Identificação da campanha",
  "Identificação do conjunto de anúncios",
  "Identificação do anúncio",
] as const;

export interface ParsedAdRow {
  adId: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adName: string;
  adsetName: string;
  naturalKey: string; // adId quando disponível, senão adsetName::adName
  date: string | null; // null se o export for período único (v1)
  status: string;
  resultType: string | null;
  results: number;
  spend: number;
  impressions: number;
  /** null = coluna ausente no export; 0 = houve zero cliques */
  clicks: number | null;
  linkClicks: number | null;
  outboundClicks: number | null;
  reach: number; // não somar entre linhas — públicos se sobrepõem
  attributionWindow: string;
  currency: string;
  hookRate: number | null;
  vertical: string | null;
  canal: string | null;
  temperatura: string | null;
  periodStart: string;
  periodEnd: string;
}

export interface ParseResult {
  rows: ParsedAdRow[];
  templateVersion: "v2_id_dia" | "v1_periodo_unico";
  warnings: string[];
}

/** Núcleo do parser — recebe o CONTEÚDO do CSV (string), não um caminho.
 * Usado tanto pelo CLI (que lê o arquivo primeiro) quanto pela rota de
 * upload do app web (que recebe o conteúdo direto do formulário, sem
 * tocar em disco — necessário porque função serverless não tem
 * filesystem persistente para receber upload). */
export function parseMetaCsvContent(rawContent: string): ParseResult {
  // strip BOM (utf-8-sig equivalente)
  const content = rawContent.charCodeAt(0) === 0xfeff ? rawContent.slice(1) : rawContent;

  const records: Record<string, string>[] = parseCsvSync(content, {
    columns: true,
    skip_empty_lines: true,
  });

  if (records.length === 0) {
    return { rows: [], templateVersion: "v1_periodo_unico", warnings: ["arquivo vazio"] };
  }

  const headers = Object.keys(records[0]);
  const currency = extractCurrency(headers);
  const spendCol = headers.find((h) => h.startsWith("Valor gasto"))!;
  const hasIds = REQUIRED_ID_COLS.every((c) => headers.includes(c));
  const hasDay = headers.includes("Dia");
  const templateVersion = hasIds && hasDay ? "v2_id_dia" : "v1_periodo_unico";

  const clickCols = {
    clicks: findHeader(headers, CLICK_COLUMNS.clicks),
    linkClicks: findHeader(headers, CLICK_COLUMNS.linkClicks),
    outboundClicks: findHeader(headers, CLICK_COLUMNS.outboundClicks),
  };

  const warnings: string[] = [];
  if (!clickCols.linkClicks) {
    warnings.push(
      "Export sem a coluna 'Cliques no link' — sem CTR, CPC e CVR, e o funil " +
        "fica sem a etapa entre impressão e conversa. Adicione em " +
        "'Personalizar colunas' no Ads Manager (docs/03-ingestao-csv-meta-ads.md)."
    );
  }
  if (!hasIds) {
    warnings.push(
      "Export sem colunas de ID — chave natural cai para (adset::ad), " +
        "frágil a rename e a criativos reaproveitados entre conjuntos."
    );
  }
  if (!hasDay) {
    warnings.push(
      "Export sem coluna 'Dia' — sem série temporal, sem pacing diário."
    );
  }

  const rows: ParsedAdRow[] = records.map((r) => {
    const tags = extractTags(r["Nome do conjunto de anúncios"] ?? "");
    const adId = hasIds ? toNull(r["Identificação do anúncio"]) : null;
    const adsetName = r["Nome do conjunto de anúncios"];
    const adName = r["Nome do anúncio"];

    return {
      adId,
      campaignId: hasIds ? toNull(r["Identificação da campanha"]) : null,
      adsetId: hasIds ? toNull(r["Identificação do conjunto de anúncios"]) : null,
      adName,
      adsetName,
      naturalKey: adId ?? `${adsetName}::${adName}`,
      date: hasDay ? toNull(r["Dia"]) : null,
      status: r["Status de veiculação"],
      resultType: toNull(r["Tipo de resultado"]),
      results: toNumber(r["Resultados"]) ?? 0,
      spend: toNumber(r[spendCol]) ?? 0,
      impressions: toNumber(r["Impressões"]) ?? 0,
      clicks: clickCols.clicks ? toNumber(r[clickCols.clicks]) ?? 0 : null,
      linkClicks: clickCols.linkClicks ? toNumber(r[clickCols.linkClicks]) ?? 0 : null,
      outboundClicks: clickCols.outboundClicks
        ? toNumber(r[clickCols.outboundClicks]) ?? 0
        : null,
      reach: toNumber(r["Alcance"]) ?? 0,
      attributionWindow: normalizeAttribution(r["Configuração de atribuição"]),
      currency,
      hookRate: toNumber(r["Hook"]),
      vertical: tags[0] ?? null,
      canal: tags[1] ?? null,
      temperatura: tags[2] ?? null,
      periodStart: r["Início dos relatórios"],
      periodEnd: r["Encerramento dos relatórios"],
    };
  });

  // idempotência: (naturalKey, date) precisa ser única para o upsert não colidir
  if (hasDay) {
    const seen = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.naturalKey}::${row.date}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const dupCount = [...seen.values()].filter((v) => v > 1).length;
    if (dupCount > 0) {
      warnings.push(
        `${dupCount} combinações (entidade, dia) duplicadas no arquivo — ` +
          "upsert vai colidir. Investigar antes de importar."
      );
    }
  }

  return { rows, templateVersion, warnings };
}

/** Wrapper para uso via CLI: lê o arquivo do disco e delega ao núcleo acima. */
export function parseMetaCsv(path: string): ParseResult {
  const raw = readFileSync(path, "utf-8");
  return parseMetaCsvContent(raw);
}
