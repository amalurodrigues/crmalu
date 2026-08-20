# Painel de tráfego pago — documentação

Documentação-base para desenvolvimento com Claude Code.

## Como usar

1. Este material já está na raiz de `crmalu` (junto com o código em `apps/`
   e `packages/`). Não precisa copiar nada.
2. Abra o Claude Code na raiz. Ele lê `CLAUDE.md` automaticamente.
3. Caminho atual: ingestão via **CSV manual** (`docs/03-ingestao-csv-meta-ads.md`).
   A Fase 0 de acesso à API (`docs/03-alt-ingestao-api-meta-ads.md`) fica em
   espera até a carteira crescer o bastante para justificar o esforço — ver
   `docs/08-roadmap.md`.
4. Preencha `knowledge/icp/{cliente}.md` para pelo menos um cliente antes de
   chegar na Fase 2. Sem isso o gerador de narrativa não tem o que dizer.

## Ordem de leitura

| Quando | Leia |
|---|---|
| Sempre, antes de qualquer tarefa | `CLAUDE.md` |
| Antes de modelar ou migrar | `docs/02-modelo-de-dados.md` |
| Antes de escrever o parser de CSV | `docs/03-ingestao-csv-meta-ads.md` |
| Antes de escrever qualquer fórmula | `docs/04-camada-de-metricas.md` |
| Antes de construir relatório | `docs/05-relatorios.md` |
| Quando o número não bater | `docs/09-qa-reconciliacao.md` |

## Índice

```
CLAUDE.md                        regras de projeto (o Claude Code lê sempre)
docs/00-produto-escopo.md        problema, não-objetivos, critérios de sucesso
docs/01-arquitetura.md           fluxo de dados, stack, decisões estruturais
docs/02-modelo-de-dados.md       DDL Postgres, grão de cada fato
docs/03-ingestao-csv-meta-ads.md ingestão via export CSV (caminho atual)
docs/03-alt-ingestao-api-meta-ads.md  API Meta — referência para quando escalar
docs/04-camada-de-metricas.md    fórmulas canônicas, conversion_key, significância
docs/05-relatorios.md            payload, narrativa, PDF, anti-padrões
docs/06-ui-telas.md              telas, regras de exibição, gráficos
docs/07-lgpd-seguranca.md        classificação de dado, tokens, políticas de anúncio
docs/08-roadmap.md               fases com critério de saída
docs/09-qa-reconciliacao.md      como provar que bate com o Ads Manager
docs/10-nomenclatura.md          padrão de nome e parser
docs/adr/                        registro de decisões
knowledge/                       base factual do operador
```

## Os três erros que este projeto existe para evitar

1. Somar `reach` (não é aditivo) — número inflado que ninguém percebe.
2. Média de média em CPA/CTR/ROAS — erro que cresce com o recorte.
3. LLM fazendo aritmética no relatório — erro silencioso na frente do cliente.

Todos os três estão cobertos por teste automatizado. Ver `docs/09`.
