import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Portaria única do painel.
 *
 * Usa SÓ `auth.config` (sem provider), porque roda em Edge Runtime, onde não há
 * `node:crypto` nem socket de banco. O middleware não verifica senha — só lê o
 * cookie de sessão e decide se a rota passa. A senha é verificada uma vez, no
 * /api/auth, que roda em Node.
 *
 * O matcher aqui é DELIBERADAMENTE burro: exclui apenas os assets internos do
 * Next, sem escapes nem âncoras. A lista de rotas públicas de verdade vive em
 * `auth.config.ts`, como código.
 *
 * O motivo é cicatriz. A primeira versão trazia a lista de exceções dentro do
 * regex do matcher, com `\\.(?:svg|png|…|ico)$` para isentar imagens. Uma barra
 * invertida se perdeu na escrita do arquivo e o padrão virou `.(?:…|ico)$`, em
 * que o ponto casa com QUALQUER caractere — e `/report/historico`, que termina
 * em "ico", passou a ser tratado como arquivo de imagem e ficou fora do
 * middleware, servindo dado de cliente sem sessão.
 *
 * Regex silencioso não avisa quando afrouxa. Condição em código, sim.
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
