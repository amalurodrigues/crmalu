import { ImportForm } from "./ImportForm";

export const runtime = "nodejs"; // precisa de Node (pg), não Edge

export default function ImportPage() {
  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-ink">Importar export</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Exporte no Ads Manager com <strong className="text-ink">Repartir por → Dia</strong> e
        IDs de campanha/conjunto/anúncio habilitados. Reimportar o mesmo
        arquivo é seguro — o upsert é idempotente, não duplica linha.
      </p>
      <div className="mt-6">
        <ImportForm />
      </div>
    </div>
  );
}
