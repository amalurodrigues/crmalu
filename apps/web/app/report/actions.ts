"use server";

import { db, adAccounts, reports } from "@tego/db";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadReportPayload } from "./load";
import { defaultTitle } from "./types";

/**
 * Congela o relatório atual em `reports.payload` (docs/05).
 *
 * O payload é recarregado aqui no servidor em vez de vir do cliente: o cliente
 * não é fonte confiável de número, e mandar o payload inteiro num campo oculto
 * seria caro e adulterável. A partir do insert o registro é imutável — nunca
 * recalcule um relatório salvo, é o que permite dizer "o relatório de agosto
 * dizia X" depois de o Meta reajustar o dado.
 */
export async function saveReport(formData: FormData) {
  const payload = await loadReportPayload();
  if (!payload) throw new Error("Não há dado suficiente para salvar um relatório.");

  const [account] = await db.select().from(adAccounts).limit(1);
  if (!account) throw new Error("Nenhuma conta de anúncio cadastrada.");

  const typed = String(formData.get("title") ?? "").trim();
  const title =
    typed ||
    defaultTitle(payload.meta.accountName, payload.meta.periodStart, payload.meta.periodEnd);

  const [row] = await db
    .insert(reports)
    .values({
      clientId: account.clientId,
      adAccountId: account.id,
      title,
      periodStart: payload.meta.periodStart,
      periodEnd: payload.meta.periodEnd,
      payload,
      status: "draft",
    })
    .returning();

  revalidatePath("/report/historico");
  redirect(`/report/${row.id}`);
}
