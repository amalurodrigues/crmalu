import "./globals.css";
import { LayoutDashboard, Upload, FileBarChart } from "lucide-react";

export const metadata = {
  title: "tego — painel de tráfego pago",
};

const navItems = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/import", label: "Importar CSV", icon: Upload },
  { href: "/report", label: "Relatório", icon: FileBarChart },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-canvas text-ink font-sans antialiased">
        <div className="flex min-h-screen">
          <aside className="hidden w-56 shrink-0 border-r border-hairline px-4 py-6 sm:block">
            <div className="mb-8 px-2">
              <span className="font-mono text-sm font-semibold tracking-tight text-ink">
                tego
              </span>
              <span className="ml-2 text-xs text-faint">tráfego pago</span>
            </div>
            <nav className="flex flex-col gap-1">
              {navItems.map(({ href, label, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-ink"
                >
                  <Icon size={16} strokeWidth={1.75} />
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          <div className="flex-1">
            <header className="flex items-center justify-between border-b border-hairline px-4 py-3 sm:hidden">
              <span className="font-mono text-sm font-semibold">tego</span>
              <nav className="flex gap-4 text-sm text-muted">
                <a href="/">Início</a>
                <a href="/import">Importar</a>
                <a href="/report">Relatório</a>
              </nav>
            </header>
            <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
