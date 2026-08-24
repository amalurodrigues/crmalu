import type { NextAuthConfig } from "next-auth";

/**
 * Rotas que respondem sem sessão. Lista fechada e curta: os endpoints da
 * própria autenticação (sem eles não haveria como logar), o favicon, e a tela
 * de primeiro acesso — que é pública porque precisa ser, e se fecha sozinha no
 * instante em que o primeiro usuário existe (ver app/setup/page.tsx).
 *
 * Casamento por segmento, não por prefixo de string: `startsWith("/api/auth")`
 * também liberaria `/api/authorized-secreto`. Aqui `/api/auth-falso` não passa.
 */
const ROTAS_PUBLICAS = ["/api/auth", "/favicon.ico", "/setup"];

function ehPublica(pathname: string): boolean {
  return ROTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

/**
 * Metade da configuração que roda no EDGE.
 *
 * O middleware do Next roda em Edge Runtime, onde não existe `node:crypto` nem
 * socket TCP — ou seja, nem scrypt nem `pg`. Se o provider de credenciais
 * (que precisa dos dois) morasse aqui, o build quebraria ao tentar empacotar o
 * driver do Postgres para o Edge.
 *
 * Então o arquivo é dividido: aqui fica só o que decide ROTA (nenhum acesso a
 * banco), e `auth.ts` acrescenta o provider que de fato verifica a senha e roda
 * em Node. É o padrão de "split config" do Auth.js v5.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },

  // Sessão em JWT: com um operador, guardar sessão no banco custaria uma
  // consulta por request sem ganhar nada. Ver comentário em `users`.
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },

  callbacks: {
    /**
     * Portaria. Roda no middleware, antes de qualquer página renderizar — é
     * isto que garante que uma rota nova nasça protegida em vez de nascer
     * aberta e alguém lembrar de trancar depois.
     */
    authorized({ auth, request }) {
      const logado = !!auth?.user;
      const { pathname } = request.nextUrl;

      // Já logado não fica na tela de login.
      if (pathname === "/login") {
        return logado ? Response.redirect(new URL("/", request.nextUrl)) : true;
      }

      // Únicas rotas públicas. Comparação de prefixo em código, não em regex:
      // ver o comentário sobre `/report/historico` em middleware.ts.
      if (ehPublica(pathname)) return true;

      return logado;
    },

    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "operator";
        token.clientId = (user as { clientId?: string | null }).clientId ?? null;
      }
      return token;
    },

    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        (session.user as { role?: string }).role = (token.role as string) ?? "operator";
        (session.user as { clientId?: string | null }).clientId =
          (token.clientId as string | null) ?? null;
      }
      return session;
    },
  },

  providers: [], // preenchido em auth.ts, que roda em Node
} satisfies NextAuthConfig;
