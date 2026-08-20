import { ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <div className="max-w-lg">
      <p className="mb-1 text-xs uppercase tracking-wider text-faint">Fase 1</p>
      <h1 className="text-2xl font-semibold text-ink">Painel de tráfego pago</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Ingestão via CSV do Meta Ads Manager. Importe um export com IDs e
        quebra diária habilitados, depois acompanhe CPA por vertical com a
        mesma lógica de cálculo validada nos testes — SUM/SUM, nunca média de
        linha já derivada.
      </p>
      <a
        href="/import"
        className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas transition-opacity hover:opacity-90"
      >
        Importar CSV <ArrowRight size={15} />
      </a>
    </div>
  );
}
