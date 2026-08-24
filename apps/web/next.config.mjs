import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * O Next só lê `.env` a partir da raiz do app (`apps/web`), mas o monorepo
 * mantém um único `.env` na raiz do repositório — o mesmo que `drizzle-kit` e
 * os scripts de `scripts/` usam. Sem isto, `npm run dev` cai no fallback
 * `localhost:5432` e a página de relatório dá 500 só em desenvolvimento.
 *
 * Em produção a Vercel injeta as variáveis no processo antes do build, e o
 * arquivo não existe — daí o no-op silencioso e o `??=`, que nunca sobrescreve
 * uma variável já definida pela plataforma.
 */
function loadRootEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, "../../.env");

  let raw;
  try {
    raw = readFileSync(envPath, "utf-8");
  } catch {
    return; // sem .env local: Vercel, CI, container
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // pacotes do monorepo são TS puro, não pré-compilado — Next precisa transpilar
  transpilePackages: ["@tego/db", "@tego/metrics", "@tego/csv-import"],
};
export default nextConfig;
