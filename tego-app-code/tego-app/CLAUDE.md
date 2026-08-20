# CLAUDE.md

Leia este arquivo antes de qualquer tarefa. Ele tem precedência sobre suposições
gerais sobre "como se faz um dashboard".

## 1. O que é este projeto

Painel interno de gestão de tráfego pago e geração de relatórios para clientes.
Operador único (media buyer), múltiplos clientes, múltiplas contas de anúncio.

**Fase 1 (única em escopo até segunda ordem): Meta Ads.**
Google Ads, TikTok e LinkedIn entram depois. O modelo de dados já nasce
multi-plataforma; o código de ingestão, não. Não escreva abstração especulativa
para plataformas que ainda não existem no projeto — escreva a interface mínima
descrita em `docs/02-modelo-de-dados.md` e pare.

## 2. Regras inegociáveis de correção numérica

Estas regras existem porque violá-las produz relatório errado que passa
despercebido. Toda PR que toca em número é revisada contra esta lista.

1. **`reach` e `frequency` NÃO são aditivos.** Nunca some reach diário para obter
   reach do período. Se o relatório precisa de reach de 30 dias, faça uma
   chamada separada à API com `time_range` de 30 dias e `time_increment` ausente.
   Reach agregado vive em tabela própria (`fact_insights_period`), não em
   `fact_insights_daily`. `frequency` do período = `impressions_periodo / reach_periodo`.
2. **Nunca média de média.** CPA, CPC, CPM, CTR, CVR, ROAS e frequency são
   sempre `SUM(numerador) / SUM(denominador)` sobre o conjunto filtrado. É
   proibido armazenar métrica derivada em coluna. Elas são calculadas em
   `packages/metrics` e em nenhum outro lugar.
3. **Divisão por zero retorna `null`, não `0`.** `null` renderiza como `—` na UI.
   Um CPA de R$ 0,00 é uma mentira; um CPA vazio é a verdade.
4. **Nunca some valores de moedas diferentes** sem conversão explícita e taxa
   datada. Se o conjunto tem mais de uma `account_currency`, a agregação falha
   com erro, não silencia.
5. **Fuso horário é o da conta de anúncio**, não o do servidor nem o do browser.
   Toda data em `fact_*` é `DATE` no fuso da conta. Guarde
   `ad_accounts.timezone_name` e nunca faça `new Date()` sobre uma data de insight.
6. **O LLM não faz aritmética.** A geração de narrativa recebe um payload JSON
   com números, variações e deltas já calculados. O prompt proíbe cálculo novo.
   Ver `docs/05-relatorios.md`.
7. **Dado do Meta muda retroativamente.** Nunca trate um dia já ingerido como
   imutável. Ver política de rejanela em `docs/03-ingestao-meta-ads.md`.

## 3. Premissas do produto (mudar aqui se mudarem)

- Operador: 1. Clientes com acesso read-only ao próprio painel: opcional, Fase 4.
- Volume esperado: até ~30 contas de anúncio, ~5 anos de histórico.
  Isso cabe em Postgres single-node. **Não** proponha data warehouse, dbt,
  BigQuery ou Airflow neste volume. Se passar de ~500M linhas, reabrir.
- Destino de conversão dominante nos clientes atuais: Click-to-WhatsApp.
  O evento de conversão primário **não é** `lead` nem `purchase`. Ver
  `docs/04-camada-de-metricas.md`.
- Relatórios são entregues como painel web + PDF. PDF é gerado por print do
  próprio painel (Playwright), não por biblioteca de PDF separada.

## 4. Stack

| Camada | Escolha | Por quê |
|---|---|---|
| App | Next.js (App Router) + TypeScript | Um repo, server actions, rota de print para PDF |
| DB | Postgres 15+ | JSONB para payloads brutos, window functions para deltas |
| ORM | Drizzle | Migrations em SQL legível, sem runtime pesado |
| Jobs | Node worker + cron (BullMQ se precisar de fila) | Ingestão é batch diária, não streaming |
| UI | Tailwind + shadcn/ui | Ver `docs/06-ui-relatorio.md` antes de estilizar |
| Gráficos | Recharts | Suficiente e imprime bem. Não trocar sem ADR |
| PDF | Playwright `page.pdf()` sobre `/report/[id]/print` | Um só código para tela e papel |
| Auth | Auth.js, credentials + magic link | Operador único, não overengineer |

Mudança de qualquer linha dessa tabela exige ADR em `docs/adr/`.

## 5. Estrutura do repositório

```
apps/web            painel + rotas de relatório + rota /print
apps/worker         ingestão, agendamento, rejanela
packages/db         schema Drizzle, migrations, seeds
packages/metrics    ÚNICA fonte de cálculo de métrica derivada
packages/meta       cliente da Marketing API, tipagem, rate limit, retry
packages/reports    montagem do payload + prompts de narrativa
docs/               especificações (leia antes de implementar)
knowledge/          base factual do operador (benchmarks, ICP, políticas)
```

## 6. Convenções

- Dinheiro: `numeric(18,6)` no banco. Nunca `float`. Nunca centavos como inteiro
  (o Meta devolve string decimal; converta uma vez, no adapter).
- IDs externos: sempre `text`, nunca `bigint`. IDs do Meta estouram `int` e
  mudam de formato.
- Nomes de coluna em `snake_case`; TypeScript em `camelCase`; a tradução vive
  só no Drizzle schema.
- Todo job de ingestão é **idempotente**. Rodar duas vezes o mesmo dia produz o
  mesmo estado. Upsert por chave natural, nunca insert cego.
- Log estruturado com `account_id`, `date_range`, `level`, `request_id`.

## 7. Antes de considerar uma tarefa pronta

- [ ] Nenhuma métrica derivada foi calculada fora de `packages/metrics`
- [ ] Nenhuma soma de `reach` ou `frequency`
- [ ] Job roda duas vezes sem duplicar linha
- [ ] Datas respeitam o fuso da conta
- [ ] Erro de API tem retry com backoff e não corrompe estado parcial
- [ ] Nada que grave PII de lead sem passar por `docs/07-lgpd-seguranca.md`

## 8. O que NÃO construir (por ora)

Recusar estas ideias, mesmo que pareçam boas — elas custam semanas e não
resolvem o problema atual:

- Editor visual de campanha / criação de anúncio pelo painel (use o Ads Manager)
- Alteração de orçamento via API (risco alto, ganho baixo com 1 operador)
- Multi-tenant com billing
- Real-time / websockets. Dado de anúncio é batch diário.
- Modelo de atribuição próprio (MMM, incrementalidade) antes da Fase 4
