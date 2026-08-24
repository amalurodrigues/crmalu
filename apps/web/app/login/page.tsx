import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@tego/db";
import { AuthError } from "next-auth";
import { LogIn, ShieldCheck } from "lucide-react";
import { signIn } from "../../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function login(formData: FormData) {
  "use server";

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    /**
     * `signIn` sinaliza sucesso LANÇANDO um redirect do Next. Capturar tudo
     * aqui transformaria login bem-sucedido em erro genérico — daí o re-throw
     * de tudo que não for AuthError.
     */
    if (error instanceof AuthError) redirect("/login?erro=1");
    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; criado?: string }>;
}) {
  // Banco sem usuário nenhum: mandar para a criação em vez de mostrar um
  // formulário que não tem como aceitar ninguém.
  const contagem = await db.execute<{ n: number }>(sql`select count(*)::int as n from users`);
  const linhas =
    (contagem as unknown as { rows?: Array<{ n: number }> }).rows ??
    (contagem as unknown as Array<{ n: number }>);
  if (Number(linhas[0]?.n ?? 0) === 0) redirect("/setup");

  const { erro, criado } = await searchParams;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <div className="glass edge-glow rounded-2xl p-7">
        <div className="flex items-center gap-2 text-faint">
          <ShieldCheck size={15} strokeWidth={1.75} />
          <span className="font-display text-xs font-semibold uppercase tracking-wider">
            Acesso restrito
          </span>
        </div>

        <h1 className="font-display mt-3 text-2xl font-bold tracking-tight text-ink">
          tego
        </h1>
        <p className="mt-1 text-sm text-muted">
          Painel de tráfego pago. Dado de cliente — entre para continuar.
        </p>

        <form action={login} className="mt-6 space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-faint">E-mail</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              autoFocus
              className="mt-1 w-full rounded-md border border-white/10 bg-canvas/60 px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-faint">Senha</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-white/10 bg-canvas/60 px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
            />
          </label>

          {criado && (
            <p
              role="status"
              className="rounded-md border border-good/30 bg-good/10 px-3 py-2 text-xs text-good"
            >
              Conta criada. Entre com ela.
            </p>
          )}

          {erro && (
            /* mensagem única para e-mail inexistente e senha errada: distinguir
               os dois casos transformaria esta tela num verificador de contas */
            <p
              role="alert"
              className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad"
            >
              E-mail ou senha incorretos.
            </p>
          )}

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-canvas transition-opacity hover:opacity-90"
          >
            <LogIn size={14} strokeWidth={2} />
            Entrar
          </button>
        </form>
      </div>

      <p className="mt-4 px-2 text-center text-[11px] leading-snug text-faint">
        Senha definida pelo operador via{" "}
        <span className="font-mono">scripts/set-password.ts</span> — nunca por
        formulário público.
      </p>
    </div>
  );
}
