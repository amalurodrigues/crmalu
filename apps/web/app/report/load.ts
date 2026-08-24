import {
  db,
  clients,
  adAccounts,
  dimEntity,
  factInsightsDaily,
  factActionsDaily,
  importRuns,
} from "@tego/db";
import { sumTotals, computeMetrics, sampleVerdict, type RawTotals } from "@tego/metrics";
import { eq, inArray, desc, and, gte, lte, sql } from "drizzle-orm";
import {
  DIMENSIONS,
  METRICS,
  type DimensionKey,
  type DimensionSlice,
  type FunnelStage,
  type MetricKey,
  type ReportPayload,
  type SeriesPoint,
} from "./types";

/**
 * Chave de conversão primária. Quando `conversion_mappings` estiver populado
 * isto passa a sair de lá (is_primary); hoje a tabela está vazia e o destino
 * dominante é Click-to-WhatsApp (CLAUDE.md § 3).
 */
const PRIMARY_CONVERSION_KEY = "messaging_started";

const EMPTY: RawTotals = { impressions: 0, spend: 0, conversions: 0 };

/** Dimensões que vêm da hierarquia do Meta, não das tags do nome do conjunto. */
const ENTITY_DIMENSIONS = new Set<DimensionKey>(["campanha", "conjunto", "criativo"]);

const SEM_TAG = "(sem tag)";

/**
 * Diferença em dias entre duas datas 'YYYY-MM-DD'.
 * Usa Date.UTC sobre os componentes já separados — nunca `new Date(string)`
 * sobre uma data de insight, que aplicaria o fuso do servidor (CLAUDE.md § 2.5).
 */
function daysBetweenInclusive(start: string, end: string): number {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  return Math.round((Date.UTC(ye, me - 1, de) - Date.UTC(ys, ms - 1, ds)) / 86_400_000) + 1;
}

export interface LoadOptions {
  /** slug do cliente; ausente = primeiro cliente cadastrado */
  slug?: string;
  /** recorte de datas 'YYYY-MM-DD'; ausente = todo o período disponível */
  from?: string;
  to?: string;
  /**
   * external_id da campanha a isolar. Ausente = conta inteira.
   * Recorta TUDO — KPI, funil e todas as quebras — para que o relatório de uma
   * campanha seja um relatório completo dela, não um filtro parcial.
   */
  campaign?: string;
}

export async function loadReportPayload(opts: LoadOptions = {}): Promise<ReportPayload | null> {
  const [client] = opts.slug
    ? await db.select().from(clients).where(eq(clients.slug, opts.slug))
    : await db.select().from(clients).limit(1);
  if (!client) return null;

  const [account] = await db
    .select()
    .from(adAccounts)
    .where(eq(adAccounts.clientId, client.id))
    .limit(1);
  if (!account) return null;

  // Extremos do que existe, ANTES de aplicar o filtro — é o que define os
  // limites do seletor de datas na UI.
  const [bounds] = await db
    .select({
      min: sql<string | null>`min(${factInsightsDaily.date})::text`,
      max: sql<string | null>`max(${factInsightsDaily.date})::text`,
    })
    .from(factInsightsDaily)
    .where(eq(factInsightsDaily.adAccountId, account.id));

  if (!bounds?.min || !bounds?.max) return null;
  const dataStart = bounds.min;
  const dataEnd = bounds.max;

  const from = opts.from && opts.from >= dataStart ? opts.from : dataStart;
  const to = opts.to && opts.to <= dataEnd ? opts.to : dataEnd;

  const entities = await db
    .select()
    .from(dimEntity)
    .where(eq(dimEntity.adAccountId, account.id));
  if (entities.length === 0) return null;

  // Filtro de data aplicado no banco, não em memória: docs/03 prevê ~5 anos de
  // histórico por conta, e trazer tudo para recortar uma semana não escala.
  const insights = await db
    .select()
    .from(factInsightsDaily)
    .where(
      and(
        eq(factInsightsDaily.adAccountId, account.id),
        gte(factInsightsDaily.date, from),
        lte(factInsightsDaily.date, to)
      )
    );
  if (insights.length === 0) return null;

  const entityIds = entities.map((e) => e.id);
  const actions = await db
    .select()
    .from(factActionsDaily)
    .where(
      and(
        inArray(factActionsDaily.entityId, entityIds),
        gte(factActionsDaily.date, from),
        lte(factActionsDaily.date, to)
      )
    );

  // CLAUDE.md § 2.4: agregação com mais de uma moeda falha alto, não silencia.
  const currencies = [...new Set(insights.map((i) => i.currency))];
  if (currencies.length > 1) {
    throw new Error(
      `Conjunto tem ${currencies.length} moedas (${currencies.join(", ")}). ` +
        "Somar valores de moedas diferentes exige conversão explícita com taxa datada — " +
        "ver CLAUDE.md § 2.4."
    );
  }

  const entityById = new Map(entities.map((e) => [e.id, e]));
  const entityByExtId = new Map(entities.map((e) => [e.externalId, e]));

  /**
   * Rótulo do criativo, desambiguado.
   *
   * Nome de anúncio NÃO é único dentro de uma conta: dois conjuntos diferentes
   * podem ter um "Estático01" cada, e é comum — o operador nomeia por posição
   * na esteira de criativos, não por identidade global. Agrupar por nome cru
   * somaria dois anúncios distintos numa linha só e produziria um CPA que não
   * corresponde a nada.
   *
   * A chave de agrupamento é sempre a entidade; só o RÓTULO ganha um sufixo, e
   * apenas quando o nome de fato colide — pendurar o conjunto em todo criativo
   * poluiria a legenda do gráfico sem informar nada.
   */
  const adEntities = entities.filter((e) => e.level === "ad");
  const nameCount = new Map<string, number>();
  for (const e of adEntities) nameCount.set(e.name, (nameCount.get(e.name) ?? 0) + 1);

  const creativeLabelById = new Map<string, string>();
  for (const e of adEntities) {
    if ((nameCount.get(e.name) ?? 0) <= 1) {
      creativeLabelById.set(e.id, e.name);
      continue;
    }

    /**
     * Desambiguador mais curto que ainda separa. Nomes de conjunto costumam ser
     * a string de tags inteira (`[Maternidade][Whatsapp][Frio]`), que enche a
     * legenda do gráfico sem acrescentar informação — se a vertical já
     * distingue os homônimos, ela basta e cabe na tela.
     */
    const homonimos = adEntities.filter((o) => o.name === e.name);
    const verticaisDistintas = new Set(homonimos.map((o) => o.vertical ?? "")).size;
    const conjunto = e.parentExtId ? entityByExtId.get(e.parentExtId)?.name : undefined;

    const disambiguator =
      verticaisDistintas === homonimos.length && e.vertical
        ? e.vertical
        : conjunto ?? e.vertical ?? e.externalId.slice(-6);

    creativeLabelById.set(e.id, `${e.name} · ${disambiguator}`);
  }

  /**
   * Valor da dimensão para uma entidade de anúncio.
   *
   * Conjunto e campanha sobem a hierarquia por `parent_ext_id`. Quando o export
   * não trazia IDs, o importer gravou a chave pelo nome (`adset::<nome>`), então
   * isto funciona nos dois casos — só fica mais frágil a rename no segundo.
   */
  function dimensionValue(entityId: string, dimension: DimensionKey): string {
    const ad = entityById.get(entityId);
    if (!ad) return SEM_TAG;

    switch (dimension) {
      case "criativo":
        return creativeLabelById.get(ad.id) ?? ad.name;
      case "conjunto":
        return (ad.parentExtId && entityByExtId.get(ad.parentExtId)?.name) ?? "(sem conjunto)";
      case "campanha": {
        const adset = ad.parentExtId ? entityByExtId.get(ad.parentExtId) : undefined;
        const campaign = adset?.parentExtId ? entityByExtId.get(adset.parentExtId) : undefined;
        return campaign?.name ?? "(sem campanha)";
      }
      case "vertical":
        return ad.vertical ?? SEM_TAG;
      case "canal":
        return ad.canal ?? SEM_TAG;
      case "temperatura":
        return ad.temperatura ?? SEM_TAG;
    }
  }

  // (entityId, date) -> conversões da chave primária
  const conversionsByEntityDate = new Map<string, number>();
  for (const a of actions) {
    if (a.conversionKey !== PRIMARY_CONVERSION_KEY) continue;
    const k = `${a.entityId}|${a.date}`;
    conversionsByEntityDate.set(k, (conversionsByEntityDate.get(k) ?? 0) + Number(a.count));
  }

  /** Campanha de cada anúncio, subindo dois níveis pela hierarquia. */
  const campaignExtIdOfAd = new Map<string, string | null>();
  for (const ad of adEntities) {
    const adset = ad.parentExtId ? entityByExtId.get(ad.parentExtId) : undefined;
    campaignExtIdOfAd.set(ad.id, adset?.parentExtId ?? null);
  }

  const campaigns = entities
    .filter((e) => e.level === "campaign")
    .map((e) => ({ extId: e.externalId, name: e.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const scopedCampaign =
    opts.campaign && campaigns.some((c) => c.extId === opts.campaign) ? opts.campaign : null;

  // Grão base: uma célula RawTotals por (entidade, data). Tudo abaixo é soma disto.
  const cells = insights
    .filter((i) => !scopedCampaign || campaignExtIdOfAd.get(i.entityId) === scopedCampaign)
    .map((i) => ({
    entityId: i.entityId,
    date: i.date,
    totals: {
      impressions: i.impressions,
      spend: Number(i.spend),
      conversions: conversionsByEntityDate.get(`${i.entityId}|${i.date}`) ?? 0,
      // null = export sem a coluna; 0 = zero cliques. sumTotals preserva a diferença.
      clicks: i.clicks,
      linkClicks: i.linkClicks,
      outboundClicks: i.outboundClicks,
    } as RawTotals,
  }));

  if (cells.length === 0) return null;

  const dates = [...new Set(cells.map((c) => c.date))].sort();
  const periodStart = dates[0];
  const periodEnd = dates[dates.length - 1];
  const periodDays = daysBetweenInclusive(periodStart, periodEnd);

  const grandTotals = sumTotals(cells.map((c) => c.totals));
  const targetCpa = client.targetCpa === null ? null : Number(client.targetCpa);

  // ---- quebras por dimensão -------------------------------------------------
  const byDimension = {} as Record<DimensionKey, DimensionSlice>;

  for (const dimension of DIMENSIONS) {
    const totalsByKey = new Map<string, RawTotals>();
    const totalsByDateKey = new Map<string, Map<string, RawTotals>>();

    for (const cell of cells) {
      const key = dimensionValue(cell.entityId, dimension);

      totalsByKey.set(key, sumTotals([totalsByKey.get(key) ?? EMPTY, cell.totals]));

      if (!totalsByDateKey.has(cell.date)) totalsByDateKey.set(cell.date, new Map());
      const perDate = totalsByDateKey.get(cell.date)!;
      perDate.set(key, sumTotals([perDate.get(key) ?? EMPTY, cell.totals]));
    }

    /**
     * "Melhores no topo".
     *
     * Para dimensões de entidade (campanha/conjunto/criativo) isso é CPA
     * crescente: o que entrega resultado mais barato primeiro. Quem não teve
     * conversão nenhuma tem CPA null e vai para o fim — null aqui é "não dá
     * para ranquear", não "infinitamente ruim", mas no fim da lista é onde
     * o operador espera encontrar quem não performou.
     *
     * Para dimensões de tag a ordem é por gasto, porque a pergunta ali é
     * "onde foi parar a verba", não "qual venceu".
     */
    const keys = [...totalsByKey.keys()].sort((a, b) => {
      const ta = totalsByKey.get(a)!;
      const tb = totalsByKey.get(b)!;
      if (ENTITY_DIMENSIONS.has(dimension)) {
        const ca = computeMetrics(ta).cpa;
        const cb = computeMetrics(tb).cpa;
        if (ca === null && cb === null) return tb.spend - ta.spend;
        if (ca === null) return 1;
        if (cb === null) return -1;
        if (ca !== cb) return ca - cb;
      }
      return tb.spend - ta.spend;
    });

    const rows = keys.map((key) => {
      const totals = totalsByKey.get(key)!;
      return {
        key,
        totals,
        metrics: computeMetrics(totals),
        sample: sampleVerdict(totals, periodDays),
      };
    });

    // Série pronta por métrica. O CPA diário é dividido AQUI, no servidor, via
    // computeMetrics — o cliente nunca faz aritmética de métrica.
    const series = {} as Record<MetricKey, SeriesPoint[]>;
    for (const metric of METRICS) {
      series[metric] = dates.map((date) => {
        const point: SeriesPoint = { date };
        const perDate = totalsByDateKey.get(date);
        for (const key of keys) {
          const totals = perDate?.get(key) ?? EMPTY;
          if (metric === "spend") point[key] = totals.spend;
          else if (metric === "conversions") point[key] = totals.conversions;
          else point[key] = computeMetrics(totals).cpa; // null vira gap na linha
        }
        return point;
      });
    }

    byDimension[dimension] = { keys, rows, series };
  }

  // ---- funil ----------------------------------------------------------------
  // docs/05: impressões → cliques → conversas → leads qualificados.
  // A taxa de cada etapa é medida contra a última etapa DISPONÍVEL, não contra
  // a anterior na lista: se cliques não vierem no export, conversas/impressões
  // ainda é uma taxa verdadeira — só é uma taxa diferente, e o rótulo diz qual.
  const stages: Array<Omit<FunnelStage, "rateFromPrev">> = [
    { key: "impressions", label: "Impressões", value: grandTotals.impressions },
    {
      key: "link_clicks",
      label: "Cliques no link",
      value: grandTotals.linkClicks ?? null,
      unavailableReason:
        grandTotals.linkClicks === null || grandTotals.linkClicks === undefined
          ? "O export foi gerado sem a coluna 'Cliques no link'. Reexporte incluindo " +
            "essa métrica em 'Personalizar colunas' — ver docs/03-ingestao-csv-meta-ads.md."
          : undefined,
    },
    { key: "messaging_started", label: "Conversas iniciadas", value: grandTotals.conversions },
    {
      key: "qualified_leads",
      label: "Leads qualificados",
      value: null,
      unavailableReason:
        "Depende de dado de CRM, que não é ingerido nesta fase (docs/08-roadmap.md).",
    },
  ];

  let lastAvailable: number | null = null;
  const funnel: FunnelStage[] = stages.map((s) => {
    const rateFromPrev =
      s.value !== null && lastAvailable !== null && lastAvailable !== 0
        ? s.value / lastAvailable
        : null;
    if (s.value !== null) lastAvailable = s.value;
    return { ...s, rateFromPrev };
  });

  const [lastImport] = await db
    .select()
    .from(importRuns)
    .where(eq(importRuns.adAccountId, account.id))
    .orderBy(desc(importRuns.importedAt))
    .limit(1);

  return {
    meta: {
      accountName: account.name,
      clientName: client.name,
      clientSlug: client.slug,
      currency: account.currency,
      periodStart,
      periodEnd,
      periodDays,
      dataStart,
      dataEnd,
      targetCpa,
      campaigns,
      campaignExtId: scopedCampaign,
      campaignName: scopedCampaign
        ? campaigns.find((c) => c.extId === scopedCampaign)?.name ?? null
        : null,
      generatedAt: new Date().toISOString(),
      caveats: lastImport?.warnings ?? [],
    },
    headline: {
      totals: grandTotals,
      metrics: computeMetrics(grandTotals),
      sample: sampleVerdict(grandTotals, periodDays),
    },
    funnel,
    byDimension,
  };
}
