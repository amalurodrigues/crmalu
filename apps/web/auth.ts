import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db, users, verifyPassword } from "@tego/db";
import { eq } from "drizzle-orm";
import { authConfig } from "./auth.config";

/**
 * Metade que roda em NODE: aqui há acesso a banco e a `node:crypto`.
 *
 * CLAUDE.md § 4 pede "Auth.js, credentials + magic link, operador único, não
 * overengineer". Magic link fica de fora por ora porque exige um remetente de
 * e-mail configurado (SMTP ou serviço), e infraestrutura que ninguém montou não
 * protege ninguém — credenciais fecham o buraco hoje e o provider de e-mail
 * entra sem reescrever nada quando houver remetente.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },

      async authorize(creds) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;

        const [user] = await db.select().from(users).where(eq(users.email, email));

        /**
         * Usuário inexistente e senha errada devolvem o MESMO null, sem
         * mensagem distinta. Dizer "e-mail não encontrado" transforma a tela de
         * login num verificador de quem tem conta aqui.
         *
         * Quando o usuário não existe, ainda assim gastamos o custo de um
         * scrypt contra um hash descartável: sem isso, "não existe" responderia
         * em milissegundos e "senha errada" em ~100ms, e a diferença de tempo
         * entregaria a mesma informação que a mensagem entregaria.
         */
        if (!user) {
          verifyPassword(password, DUMMY_HASH);
          return null;
        }
        if (user.status !== "active") return null;
        if (!verifyPassword(password, user.passwordHash)) return null;

        await db
          .update(users)
          .set({ lastLoginAt: new Date() })
          .where(eq(users.id, user.id));

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email,
          role: user.role,
          clientId: user.clientId,
        };
      },
    }),
  ],
});

/**
 * Hash fixo e inútil, só para o caminho "usuário não existe" consumir o mesmo
 * tempo do caminho "senha errada". Não corresponde a senha nenhuma utilizável.
 */
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "Y0hZbUZzYzJVZ2FHRnphQ0IwYnlCaWRYSnVJSFJwYldVZ2IyNXNlUUFBQUFBQUFBQUFBQUFBQUE9PQ==";
