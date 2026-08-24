"use server";

import { db, clients, adAccounts, reports, offlineResults } from "@tego/db";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadReportPayload } from "./load";
import { defaultTitle } from "./types";

/**
 * Congela o relatório atual em `reports.payload` (docs/05).
 *
 * O payload é recarregado aqui no servidor em vez de vir do cliente: o cliente
 * não é fonte confiável de número, e mandar o payload inteiro num campo oculto
 * seria caro e adulterável. O recorte (cliente + intervalo de datas) vem do
 * formulário para que o snapshot congele exatamente o que estava na tela — sem
 * isso, salvar um recorte de uma semana gravaria o período inteiro.
 *
 * A partir do insert o registro é imutável — nunca recalcule um relatório
 * salvo, é o que permite dizer "o relatório de agosto dizia X" depois de o
 * Meta reajustar o dado.
 */
export async function saveReport(formData: FormData) {
  const slug = String(formData.get("slug") ?? "") || undefined;
  const from = String(formData.get("from") ?? "") || undefined;
  const to = String(formData.get("to") ?? "") || undefined;
  const campaign = String(formData.get("campaign") ?? "") || undefined;

  const payload = await loadReportPayload({ slug, from, to, campaign });
  if (!payload) throw new Error("Não há dado suficiente para salvar um relatório.");

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.slug, payload.meta.clientSlug));
  if (!client) throw new Error("Cliente não encontrado.");

  const [account] = await db
    .select()
    .from(adAccounts)
    .where(eq(adAccounts.clientId, client.id))
    .limit(1);
  if (!account) throw new Error("Nenhuma conta de anúncio para este cliente.");

  const typed = String(formData.get("title") ?? "").trim();
  const title =
    typed ||
    defaultTitle(payload.meta.accountName, payload.meta.periodStart, payload.meta.periodEnd);

  const [row] = await db
    .insert(reports)
    .values({
      clientId: client.id,
      adAccountId: account.id,
      title,
      periodStart: payload.meta.periodStart,
      periodEnd: payload.meta.periodEnd,
      payload,
      status: "draft",
    })
    .returning();

  revalidatePath(`/clients/${client.slug}`);
  redirect(`/report/${row.id}`);
}

/**
 * Grava os resultados de negócio de uma campanha para o período em tela.
 *
 * Campo vazio APAGA a linha em vez de gravar zero. "Não informado" e "informado
 * zero" são fatos diferentes: com null o funil mostra a etapa como pendente e o
 * CPL qualificado fica "—"; com zero ele diz que nenhuma das conversas virou
 * lead, que é um diagnóstico e tanto. Escrever zero por engano transformaria
 * silêncio em má notícia.
 *
 * A data usada é o primeiro dia do período exibido — o número se refere ao
 * intervalo inteiro, e o relatório soma tudo que cai dentro da janela.
 */
export async function salvarResultados(formData: FormData) {
  const slug = String(formData.get("slug") ?? "") || undefined;
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "") || undefined;
  const campaignParam = String(formData.get("campaignExtId") ?? "");
  const campaignExtId = campaignParam === "" ? null : campaignParam;

  const [client] = slug
    ? await db.select().from(clients).where(eq(clients.slug, slug))
    : await db.select().from(clients).limit(1);
  if (!client) throw new Error("Cliente não encontrado.");

  const numero = (campo: string): number | null => {
    const bruto = String(formData.get(campo) ?? "").trim().replace(",", ".");
    if (bruto === "") return null;
    const n = Number(bruto);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  for (const [campo, metricKey] of [
    ["qualifiedLeads", "qualified_leads"],
    ["closedDeals", "closed_deals"],
  ] as const) {
    const valor = numero(campo);

    if (valor === null) {
      await db
        .delete(offlineResults)
        .where(
          and(
            eq(offlineResults.clientId, client.id),
            campaignExtId === null
              ? isNull(offlineResults.campaignExtId)
              : eq(offlineResults.campaignExtId, campaignExtId),
            eq(offlineResults.date, from),
            eq(offlineResults.metricKey, metricKey)
          )
        );
      continue;
    }

    await db
      .insert(offlineResults)
      .values({
        clientId: client.id,
        campaignExtId,
        date: from,
        metricKey,
        value: String(valor),
        source: "informado_reuniao",
      })
      .onConflictDoUpdate({
        target: [
          offlineResults.clientId,
          offlineResults.campaignExtId,
          offlineResults.date,
          offlineResults.metricKey,
        ],
        set: { value: String(valor), source: "informado_reuniao" },
      });
  }

  const params = new URLSearchParams();
  if (slug) params.set("slug", slug);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  redirect(`/report?${params}`);
}
