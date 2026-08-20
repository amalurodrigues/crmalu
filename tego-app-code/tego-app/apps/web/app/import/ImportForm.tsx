"use client";

import { useState, useTransition } from "react";
import { UploadCloud, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { importCsvAction, type ImportActionResult } from "./actions";

export function ImportForm() {
  const [result, setResult] = useState<ImportActionResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await importCsvAction(formData);
      setResult(res);
    });
  }

  return (
    <div>
      <form action={handleSubmit}>
        <label
          htmlFor="file"
          className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-hairline bg-surface px-6 py-10 text-center transition-colors hover:border-accent/50"
        >
          <UploadCloud size={22} className="text-faint" strokeWidth={1.5} />
          <span className="text-sm text-ink">
            {fileName ?? "Clique para escolher o arquivo .csv"}
          </span>
          <span className="text-xs text-faint">Export do Meta Ads Manager</span>
        </label>
        <input
          id="file"
          type="file"
          name="file"
          accept=".csv"
          required
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />

        <button
          type="submit"
          disabled={pending || !fileName}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "Importando..." : "Importar"}
          {!pending && <ArrowRight size={15} />}
        </button>
      </form>

      {result && (
        <div
          className={`mt-5 rounded-lg border px-4 py-3.5 text-sm ${
            result.ok
              ? "border-good/30 bg-good/10 text-ink"
              : "border-bad/30 bg-bad/10 text-ink"
          }`}
        >
          <div className="flex items-start gap-2">
            {result.ok ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-good" />
            ) : (
              <XCircle size={16} className="mt-0.5 shrink-0 text-bad" />
            )}
            <span>{result.message}</span>
          </div>
          {result.details && result.details.length > 0 && (
            <ul className="mt-2 space-y-1 pl-6 text-xs text-muted">
              {result.details.map((d, i) => (
                <li key={i}>⚠ {d}</li>
              ))}
            </ul>
          )}
          {result.ok && (
            <a
              href="/report"
              className="mt-2.5 inline-flex items-center gap-1 pl-6 text-sm text-accent hover:underline"
            >
              Ver relatório <ArrowRight size={13} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
