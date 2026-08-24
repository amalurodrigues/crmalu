import Link from "next/link";
import { notFound } from "next/navigation";
import { db, clients, adAccounts, clientNotes, reports } from "@tego/db";
import { desc, eq } from "drizzle-orm";
import {
  ArrowLeft,
  FileBarChart,
  Upload,
  Plus,
  Trash2,
  CalendarDays,
} from "lucide-react";
import { loadCarteira } from "../../../lib/carteira";
import { NOTE_SECTIONS } from "./note-kinds";
import { addNote, deleteNote, updateClient } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function money(v: number | null, currency = "BRL") {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency });
}

function br(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className="mt-0.5 text-sm text-ink">{value}</div>
    </div>
  );
}

function FormField({
  name,
  label,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-faint">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-white/10 bg-canvas/60 px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
      />
    </label>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-xl px-4 py-3">
      <div className="font-display text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className="tabular mt-1 font-mono text-lg font-medium text-ink">{value}</div>
    </div>
  );
}

export default async function ClientPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [client] = await db.select().from(clients).where(eq(clients.slug, slug));
  if (!client) notFound();

  const [account] = await db
    .select()
    .from(adAccounts)
    .where(eq(adAccounts.clientId, client.id))
    .limit(1);

  const carteira = await loadCarteira();
  const row = carteira.find((r) => r.slug === slug);

  const notes = await db
    .select()
    .from(clientNotes)
    .where(eq(clientNotes.clientId, client.id))
    .orderBy(desc(clientNotes.createdAt));

  const savedReports = await db
    .select()
    .from(reports)
    .where(eq(reports.clientId, client.id))
    .orderBy(desc(reports.generatedAt));

  const currency = row?.currency ?? account?.currency ?? "BRL";

  return (
    <div>
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={13} strokeWidth={1.75} />
        Carteira
      </Link>

      {/* ficha */}
      <div className="glass edge-glow mt-3 rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
              {client.name}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {client.niche ?? client.segment ?? "sem nicho definido"}
              {account && <span className="text-faint"> · {account.name}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/report?slug=${client.slug}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-canvas transition-opacity hover:opacity-90"
            >
              <FileBarChart size={13} strokeWidth={2} />
              Abrir relatório
            </Link>
            <Link
              href="/import"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-xs text-muted transition-colors hover:text-ink"
            >
              <Upload size={13} strokeWidth={1.75} />
              Importar CSV
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/5 pt-5 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Segmento" value={client.segment ?? "—"} />
          <Field label="Funil" value={client.funnelType} />
          <Field
            label="Site"
            value={
              client.website ? (
                <a
                  href={client.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  {client.website.replace(/^https?:\/\//, "")}
                </a>
              ) : (
                "—"
              )
            }
          />
          <Field
            label="Verba mensal"
            value={
              <span className="tabular font-mono">
                {money(client.monthlyBudget === null ? null : Number(client.monthlyBudget), currency)}
              </span>
            }
          />
          <Field
            label="Meta de CPA"
            value={
              <span className="tabular font-mono">
                {money(client.targetCpa === null ? null : Number(client.targetCpa), currency)}
              </span>
            }
          />
          <Field
            label="Dados"
            value={
              <span className="tabular font-mono text-xs">
                {row?.dataStart ? `${br(row.dataStart)} – ${br(row.dataEnd)}` : "—"}
              </span>
            }
          />
        </div>

        <details className="group mt-5 border-t border-white/5 pt-4">
          <summary className="cursor-pointer list-none text-xs text-faint transition-colors hover:text-ink">
            <span className="group-open:hidden">Editar ficha ▾</span>
            <span className="hidden group-open:inline">Fechar ▴</span>
          </summary>
          <form
            action={updateClient}
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <input type="hidden" name="slug" value={slug} />
            <FormField name="niche" label="Nicho" defaultValue={client.niche ?? ""} placeholder="Advocacia previdenciária" />
            <FormField name="segment" label="Segmento" defaultValue={client.segment ?? ""} placeholder="juridico" />
            <FormField name="website" label="Site" defaultValue={client.website ?? ""} placeholder="https://…" />
            <FormField
              name="monthlyBudget"
              label={`Verba mensal (${currency})`}
              defaultValue={client.monthlyBudget === null ? "" : String(client.monthlyBudget)}
              placeholder="3000,00"
            />
            <FormField
              name="targetCpa"
              label={`Meta de CPA (${currency})`}
              defaultValue={client.targetCpa === null ? "" : String(client.targetCpa)}
              placeholder="20,00"
            />
            <FormField
              name="accentColor"
              label="Cor na carteira"
              defaultValue={client.accentColor ?? ""}
              placeholder="#4c9aff"
            />
            <div className="sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-canvas transition-opacity hover:opacity-90"
              >
                Salvar ficha
              </button>
              <span className="ml-3 text-[11px] text-faint">
                Meta de CPA vazia = sem linha de referência nos gráficos.
              </span>
            </div>
          </form>
        </details>
      </div>

      {/* consolidado */}
      {row && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Gasto" value={money(row.totals.spend, currency)} />
          <Kpi label="Conversas" value={row.totals.conversions.toLocaleString("pt-BR")} />
          <Kpi label="CPA" value={money(row.metrics.cpa, currency)} />
          <Kpi label="CPM" value={money(row.metrics.cpm, currency)} />
        </div>
      )}

      {/* relatórios salvos */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-ink">Relatórios salvos</h2>
        {savedReports.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nenhum ainda. Abra o relatório, ajuste o título e salve — os números
            ficam congelados como estavam no dia.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {savedReports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/report/${r.id}`}
                  className="glass glass-hover flex items-center justify-between gap-4 rounded-xl px-4 py-3"
                >
                  <span className="min-w-0 truncate text-sm text-ink">{r.title}</span>
                  <span className="tabular shrink-0 font-mono text-xs text-faint">
                    {br(r.periodStart)} – {br(r.periodEnd)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* anotações */}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {NOTE_SECTIONS.map((section) => {
          const items = notes.filter((n) => n.kind === section.kind);
          return (
            <section key={section.kind} className="glass rounded-2xl p-5">
              <h2 className="font-display text-base font-semibold text-ink">{section.label}</h2>
              <p className="mt-1 text-[11px] leading-snug text-faint">{section.hint}</p>

              <ul className="mt-4 space-y-2">
                {items.length === 0 && (
                  <li className="text-xs text-faint">Nada registrado ainda.</li>
                )}
                {items.map((n) => (
                  <li
                    key={n.id}
                    className="group rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm text-ink">{n.title}</div>
                        {n.body && (
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-snug text-muted">
                            {n.body}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-faint">
                          <CalendarDays size={10} strokeWidth={2} />
                          {n.happenedOn
                            ? br(n.happenedOn)
                            : n.createdAt.toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                      <form action={deleteNote}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="id" value={n.id} />
                        <button
                          type="submit"
                          aria-label={`Apagar “${n.title}”`}
                          className="rounded p-1 text-faint opacity-0 transition-opacity hover:text-bad focus:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 size={13} strokeWidth={1.75} />
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>

              <form action={addNote} className="mt-4 space-y-2 border-t border-white/5 pt-4">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="kind" value={section.kind} />
                <input
                  name="title"
                  required
                  placeholder={section.placeholder}
                  aria-label={`Novo item em ${section.label}`}
                  className="w-full rounded-md border border-white/10 bg-canvas/60 px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
                />
                <textarea
                  name="body"
                  rows={2}
                  placeholder="Detalhe (opcional)"
                  aria-label="Detalhe"
                  className="w-full resize-y rounded-md border border-white/10 bg-canvas/60 px-3 py-2 text-xs text-ink outline-none placeholder:text-faint focus:border-accent"
                />
                <div className="flex items-center gap-2">
                  {section.dated && (
                    <input
                      type="date"
                      name="happenedOn"
                      aria-label="Data do fato"
                      className="rounded-md border border-white/10 bg-canvas/60 px-2 py-1.5 text-xs text-muted outline-none focus:border-accent"
                    />
                  )}
                  <button
                    type="submit"
                    className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/40 hover:text-ink"
                  >
                    <Plus size={12} strokeWidth={2} />
                    Adicionar
                  </button>
                </div>
              </form>
            </section>
          );
        })}
      </div>
    </div>
  );
}
