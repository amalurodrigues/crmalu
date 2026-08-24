import "./globals.css";
import { League_Spartan, Montserrat } from "next/font/google";
import { Users, Upload, FileBarChart, LogOut } from "lucide-react";
import { auth, signOut } from "../auth";

/**
 * next/font baixa e auto-hospeda os arquivos no build. Isso importa por dois
 * motivos: nenhuma requisição a fonts.gstatic.com em runtime (uma coisa a menos
 * para falhar no meio de uma reunião com cliente) e sem flash de fonte, porque
 * o Next injeta o @font-face com `display: swap` e o preload.
 */
const leagueSpartan = League_Spartan({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-league-spartan",
  display: "swap",
});

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata = {
  title: "tego — painel de tráfego pago",
};

const navItems = [
  { href: "/", label: "Carteira", icon: Users },
  { href: "/import", label: "Importar CSV", icon: Upload },
  { href: "/report", label: "Relatório", icon: FileBarChart },
];

async function sair() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // A navegação some para quem não está autenticado: a tela de login não deve
  // anunciar quais rotas existem do outro lado.
  const session = await auth();
  const logado = !!session?.user;

  return (
    <html lang="pt-BR" className={`${leagueSpartan.variable} ${montserrat.variable}`}>
      <body className="min-h-screen text-ink font-sans antialiased">
        <div className="flex min-h-screen">
          {logado && (
            <aside className="hidden w-56 shrink-0 flex-col border-r border-white/5 px-4 py-6 sm:flex">
              <div className="mb-8 px-2">
                <span className="font-display text-base font-bold tracking-tight text-ink">
                  tego
                </span>
                <span className="ml-2 text-xs text-faint">tráfego pago</span>
              </div>

              <nav className="flex flex-col gap-1">
                {navItems.map(({ href, label, icon: Icon }) => (
                  <a
                    key={href}
                    href={href}
                    className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-ink"
                  >
                    <Icon size={16} strokeWidth={1.75} />
                    {label}
                  </a>
                ))}
              </nav>

              <div className="mt-auto border-t border-white/5 pt-4">
                <p className="truncate px-2 text-[11px] text-faint" title={session.user?.email ?? ""}>
                  {session.user?.email}
                </p>
                <form action={sair}>
                  <button
                    type="submit"
                    className="mt-1.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted transition-colors hover:bg-white/5 hover:text-ink"
                  >
                    <LogOut size={13} strokeWidth={1.75} />
                    Sair
                  </button>
                </form>
              </div>
            </aside>
          )}

          {/* min-w-0: um flex item tem min-width:auto e não encolhe abaixo do
              min-content do filho. Sem isto, a tabela larga do relatório empurra
              o layout inteiro e a página ganha scroll horizontal em vez de a
              tabela rolar dentro do próprio overflow-x-auto. */}
          <div className="min-w-0 flex-1">
            {logado && (
              <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 sm:hidden">
                <span className="font-display text-sm font-bold">tego</span>
                <nav className="flex items-center gap-4 text-sm text-muted">
                  <a href="/">Carteira</a>
                  <a href="/import">Importar</a>
                  <a href="/report">Relatório</a>
                  <form action={sair}>
                    <button type="submit" aria-label="Sair" className="flex items-center">
                      <LogOut size={14} strokeWidth={1.75} />
                    </button>
                  </form>
                </nav>
              </header>
            )}
            <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
