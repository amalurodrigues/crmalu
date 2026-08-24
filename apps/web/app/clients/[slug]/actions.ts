"use server";

import { db, clients, clientNotes } from "@tego/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NOTE_KINDS, type NoteKind } from "./note-kinds";

function isNoteKind(v: string): v is NoteKind {
  return (NOTE_KINDS as readonly string[]).includes(v);
}

export async function addNote(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const happenedOn = String(formData.get("happenedOn") ?? "").trim();

  // Valida o discriminador contra a lista fechada: `kind` vem do formulário,
  // e uma string arbitrária aqui viraria uma seção fantasma que a UI nunca
  // renderiza e ninguém consegue apagar pela tela.
  if (!isNoteKind(kind)) throw new Error(`Tipo de anotação inválido: "${kind}"`);
  if (!title) return; // submit vazio: não grava linha em branco

  const [client] = await db.select().from(clients).where(eq(clients.slug, slug));
  if (!client) throw new Error(`Cliente não encontrado: ${slug}`);

  await db.insert(clientNotes).values({
    clientId: client.id,
    kind,
    title,
    body: body || null,
    happenedOn: happenedOn || null,
  });

  revalidatePath(`/clients/${slug}`);
}

export async function deleteNote(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const [client] = await db.select().from(clients).where(eq(clients.slug, slug));
  if (!client) throw new Error(`Cliente não encontrado: ${slug}`);

  // Escopo pelo cliente além do id: impede que um id de outro cliente,
  // vindo de um formulário adulterado, apague nota alheia.
  await db
    .delete(clientNotes)
    .where(and(eq(clientNotes.id, id), eq(clientNotes.clientId, client.id)));

  revalidatePath(`/clients/${slug}`);
}

/**
 * Edição da ficha do cliente. Campos numéricos vazios viram null, não zero:
 * "sem meta de CPA" e "meta de R$ 0,00" são coisas diferentes, e a segunda
 * faria todo gráfico desenhar uma linha de referência no chão.
 */
export async function updateClient(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const [client] = await db.select().from(clients).where(eq(clients.slug, slug));
  if (!client) throw new Error(`Cliente não encontrado: ${slug}`);

  const text = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || null;
  };
  const decimal = (k: string) => {
    const v = String(formData.get(k) ?? "").trim().replace(",", ".");
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(2) : null;
  };

  await db
    .update(clients)
    .set({
      niche: text("niche"),
      segment: text("segment"),
      website: text("website"),
      accentColor: text("accentColor"),
      monthlyBudget: decimal("monthlyBudget"),
      targetCpa: decimal("targetCpa"),
    })
    .where(eq(clients.id, client.id));

  revalidatePath(`/clients/${slug}`);
  revalidatePath("/");
}
