import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { KeyRound, ShieldCheck } from "lucide-react";
import { db, hashPassword } from "@tego/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Primeiro acesso: cria o operador inicial quando o banco ainda não tem
 * nenhum usuário.
 *
 * A rota é pública porque precisa ser — não há como logar antes de existir um
 * login. O que a torna segura é ela se FECHAR sozinha: no instante em que o
 * primeiro usuário existe, tanto esta página quanto a ação redirecionam para
 * /login e não há mais como criar conta por aqui.
 *
 * A criação é UM comando SQL, com `where not exists`, e não um "conta os
 * usuários, depois insere". Dois envios simultâneos na leitura-depois-escrita
 * poderiam ambos ver zero e ambos criar conta; no insert condicional o banco
 * decide, e o segundo simplesmente não afeta linha nenhuma.
 */
async function contarUsuarios(): Promise<number> {
  const r = await db.execute<{ n: number }>(sql`select count(*)::int as n from users`);
  const linhas = (r as unknown as { rows?: Array<{ n: number }> }).rows ?? (r as unknown as Array<{ n: number }>);
  return Number(linhas[0]?.n ?? 0);
}

async function criarOperador(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("password") ?? "");
  const confirma = String(formData.get("confirm") ?? "");

  if (!email.includes("@")) redirect("/setup?erro=email");
  if (senha.length < 12) redirect("/setup?erro=curta");
  if (senha !== confirma) redirect("/setup?erro=confere");

  const hash = hashPassword(senha);

  const r = await db.execute(sql`
    insert into users (email, name, password_hash, role)
    select ${email}, ${email.split("@")[0]}, ${hash}, 'operator'
    where not exists (select 1 from users)
    returning id
  `);
  const linhas = (r as unknown as { rows?: unknown[] }).rows ?? (r as unknown as unknown[]);

  // zero linhas = alguém chegou primeiro; a porta já fechou
  if (linhas.length === 0) redirect("/login");

  redirect("/login?criado=1");
}

const MENSAGENS: Record<string, string> = {
  email: "E-mail inválido.",
  curta: "A senha precisa de pelo menos 12 caracteres.",
  confere: "As senhas não conferem.",
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  if ((await contarUsuarios()) > 0) redirect("/login");

  const { erro } = await searchParams;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <div className="glass edge-glow rounded-2xl p-7">
        <div className="flex items-center gap-2 text-faint">
          <ShieldCheck size={15} strokeWidth={1.75} />
          <span className="font-display text-xs font-semibold uppercase tracking-wider">
            Primeiro acesso
          </span>
        </div>

        <h1 className="font-display mt-3 text-2xl font-bold tracking-tight text-ink">
          Criar operador
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          O banco ainda não tem nenhum usuário. Crie o seu — esta tela some
          assim que a primeira conta existir.
        </p>

        <form action={criarOperador} className="mt-6 space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-faint">E-mail</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              autoFocus
              className="mt-1 w-full rounded-md border border-white/10 bg-canvas/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-faint">
              Senha (mínimo 12 caracteres)
            </span>
            <input
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-white/10 bg-canvas/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-faint">
              Repita a senha
            </span>
            <input
              name="confirm"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-white/10 bg-canvas/60 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>

          {erro && (
            <p
              role="alert"
              className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad"
            >
              {MENSAGENS[erro] ?? "Não foi possível criar a conta."}
            </p>
          )}

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-canvas transition-opacity hover:opacity-90"
          >
            <KeyRound size={14} strokeWidth={2} />
            Criar e ir para o login
          </button>
        </form>
      </div>

      <p className="mt-4 px-2 text-center text-[11px] leading-snug text-faint">
        Para trocar a senha depois, ou criar outros usuários, use{" "}
        <span className="font-mono">scripts/set-password.ts</span>.
      </p>
    </div>
  );
}
