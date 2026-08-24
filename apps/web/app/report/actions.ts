"use server";

import { db, clients, adAccounts, reports } from "@tego/db";
import { eq } from "drizzle-orm";
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

  const payload = await loadReportPayload({ slug, from, to });
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
