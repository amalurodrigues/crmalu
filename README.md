# tego — painel de tráfego pago (Fase 1: ingestão CSV)

Implementação inicial real do que está especificado em `docs/` e `CLAUDE.md`.
Testado ponta a ponta com dado real do cliente Aluízio Paula (15–19/08/2026):
CSV → Postgres → `packages/metrics` → CPA por vertical, com idempotência
confirmada (mesmo arquivo importado 2x não duplica linha).

**Se você (ou uma sessão do Claude Code) está abrindo este repo pela
primeira vez:** o `CLAUDE.md` na raiz tem as regras não-negociáveis do
projeto (matemática de métrica, o que não construir ainda) e é lido
automaticamente pelo Claude Code. `docs/` tem a especificação completa por
área — comece por `docs/README.md`.

## O que existe agora

```
packages/db          schema Drizzle (subconjunto de docs/02 necessário p/ CSV)
packages/csv-import   parser + importer do export do Ads Manager
packages/metrics      SUM/SUM, divisão null-safe — única fonte de cálculo derivado
apps/web              Next.js: telas /import e /report
scripts/              CLIs: seed, import, report
```

Deliberadamente ainda **não existe**: autenticação, `packages/reports`
(payload + narrativa), tabelas específicas de API (`platform_credentials`,
`raw_api_responses`). Ver `docs/08-roadmap.md` para a sequência completa.

No ar em https://crmalu.vercel.app — Vercel Hobby + Neon Postgres, deploy
automático a cada push na `main`.

## Rodando local

Pré-requisito: um Postgres alcançável. Ou o Neon de produção (pegue a string
em Vercel → Settings → Environment Variables, ou `vercel env pull .env`), ou
um Postgres local em `postgres://postgres:postgres@localhost:5432/tego`.

Copie `.env.example` para `.env` e preencha o `DATABASE_URL`. Os scripts e o
`drizzle-kit` leem esse arquivo sozinhos — `scripts/*.ts` importam
`dotenv/config` na primeira linha, antes de `@tego/db`, que resolve a
connection string no topo do módulo. Sem `.env`, tudo cai no fallback
`localhost:5432` de `packages/db/src/client.ts` sem avisar.

```bash
npm install
cp .env.example .env   # e preencha DATABASE_URL

# aplicar schema
npx drizzle-kit generate
npx drizzle-kit migrate

# criar o cliente e a conta de anúncio (uma vez)
npx tsx scripts/seed-client.ts
# copie o AD_ACCOUNT_ID impresso

# importar um export do Ads Manager (idempotente — pode rodar de novo)
npx tsx scripts/import-csv.ts caminho/do/export.csv <AD_ACCOUNT_ID>

# ver o CPA por vertical, calculado via packages/metrics
npx tsx scripts/report-vertical.ts <AD_ACCOUNT_ID>

# subir a UI
npm run dev -w @tego/web
```

## Deploy — o mais simples e barato ($0/mês)

Stack: **Vercel Hobby** (grátis) + **Neon Postgres** (grátis, provisionado
dentro do próprio dashboard da Vercel — não precisa criar conta separada).

Nota sobre uso comercial: o plano Hobby da Vercel é formalmente para uso
pessoal/não-comercial; isso é ferramenta paga por cliente. A fiscalização é
inconsistente na prática, mas o risco é seu de assumir — ver conversa que
gerou este projeto. Migrar para o Pro ($20/mês) resolve isso a qualquer momento
sem mudar nada de código.

### 1. Subir o código pro GitHub

```bash
cd tego-app
git init
git add .
git commit -m "primeira versão: ingestão CSV + relatório de CPA"
```

Crie um repositório vazio em github.com/new (privado, sem README/gitignore —
já temos), copie os dois comandos que o GitHub mostra depois de criar:

```bash
git remote add origin https://github.com/SEU_USUARIO/tego.git
git push -u origin main
```

### 2. Importar na Vercel

1. vercel.com → **Add New → Project** → selecione o repositório.
2. Em **Root Directory**, clique em "Edit" e selecione `apps/web` (é um
   monorepo — a Vercel detecta o `workspaces` do `package.json` raiz sozinha
   e instala tudo certo a partir daqui).
3. Não precisa mexer em Build Command nem Install Command — os padrões do
   Next.js servem.
4. **Ainda não clique em Deploy** — primeiro o banco (próximo passo), senão o
   primeiro build falha por falta de `DATABASE_URL`.

### 3. Banco: Neon direto pelo dashboard da Vercel

1. Na página do projeto que você acabou de criar → aba **Storage** → **Create
   Database** → escolha **Neon** → **Create New Neon Account** (usa seu login
   da Vercel, sem cadastro separado, billing unificado).
2. Nome do banco: `tego`. Conecte ao projeto (marque Production + Preview +
   Development). Isso injeta `DATABASE_URL` automaticamente nas variáveis de
   ambiente do projeto — não precisa copiar/colar nada.
3. Agora sim, **Deploy**.

### 4. Aplicar o schema e criar o cliente (uma vez, da sua máquina)

Depois do primeiro deploy, ponha a `DATABASE_URL` do Neon no `.env` local
(Vercel → Settings → Environment Variables, ou `vercel env pull .env`) e rode:

```bash
npm install
npx drizzle-kit migrate
npx tsx scripts/seed-client.ts
```

Isso cria as 7 tabelas e o cliente/conta no banco de produção — o mesmo
processo que já validamos localmente, só apontando para o Neon em vez do
Postgres local.

Dois detalhes que custam tempo se passarem batido:

- A variável precisa se chamar exatamente `DATABASE_URL`. A integração do
  Neon às vezes cria só `POSTGRES_URL` e companhia; se `DATABASE_URL` não
  estiver na lista, adicione à mão.
- Variável de ambiente nova **não entra em deploy existente**. Depois de
  criar o banco, é obrigatório um Redeploy, senão `/report` continua
  respondendo 500 com `ECONNREFUSED 127.0.0.1:5432`.

### 5. Pronto

Acesse https://crmalu.vercel.app, vá em **Importar CSV**, suba um export do
Ads Manager, confira em **Relatório**.

## Próximos passos

1. Portar os testes do protótipo Python (`prototypes/`) para
   `packages/csv-import/__tests__` e `packages/metrics/__tests__`, incluindo
   o teste de reconciliação entre os dois formatos de export (0,5% de
   tolerância — ver `docs/09-qa-reconciliacao.md`).
2. Estender `packages/metrics` com CTR/CVR quando o export passar a incluir
   `link clicks` (ver lacuna documentada em `docs/03-ingestao-csv-meta-ads.md`).
3. `packages/reports`: payload congelado + narrativa (docs/05), a primeira
   peça de UI de verdade — antes disso, tudo roda por CLI.
4. Tela `/admin/import` para upload manual, substituindo o CLI.

## UI

Dashboard escuro com cartões de KPI (tipografia monoespaçada com tabular-nums
para os números — sinaliza precisão, coerente com as regras de cálculo do
projeto), gráfico de tendência de gasto diário por vertical, comparação de
CPA por vertical e uma seção de "Cobertura" (impressões → conversas) que
admite explicitamente a lacuna de CTR/cliques em vez de fabricar uma etapa
de funil que o CSV atual não sustenta.

Paleta e tokens em `apps/web/app/globals.css` (Tailwind v4, `@theme`).
Cores de gráfico espelhadas em `apps/web/lib/chart-colors.ts` (Recharts
recebe cor como string literal, não como classe Tailwind).
