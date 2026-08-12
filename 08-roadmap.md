# 08 — Roadmap por fases

Cada fase tem um critério de saída objetivo. Não comece a próxima sem bater o
critério — especialmente a Fase 1, cujo critério é o que dá confiança ao resto.

## Fase 0 — Destravar acesso (paralelo, começa hoje)

Não é código. É pré-requisito de tudo.

- [ ] App Business criado no Meta for Developers
- [ ] Business Verification submetida
- [ ] App Review de `ads_read` submetida
- [ ] System User criado, token de longa duração gerado e guardado cifrado
- [ ] Ao menos 1 cliente concedeu acesso de parceiro ao seu BM
- [ ] Export manual do Ads Manager de 1 mês de 1 conta, salvo como fixture de teste

**Saída:** token válido lendo insights de pelo menos uma conta real.

## Fase 1 — Ingestão confiável (o coração)

Sem UI bonita. Terminal e SQL bastam.

- [ ] `packages/meta`: HTTP, rate limit, retry, async jobs, paginação
- [ ] `packages/db`: schema completo de `02-modelo-de-dados.md`
- [ ] `syncEntities` + `syncDailyInsights` + `syncPeriodInsights`
- [ ] Adapter de `actions` → `fact_actions_daily` com `conversion_key`
- [ ] Teste de idempotência passando
- [ ] Reconciliação contra o export manual da Fase 0

**Saída (o critério que importa):** divergência de `spend` < 0,5% e divergência
de contagem de conversão = 0 contra o Ads Manager, em 1 mês, nos 4 níveis.
Enquanto não bater, não avance. Todo trabalho posterior assenta sobre isso.

## Fase 2 — Painel e relatório

- [ ] `packages/metrics` completo e testado
- [ ] Telas 1, 2, 7 (carteira, conta, saúde da ingestão)
- [ ] Agendamento diário + rejanela de 28 dias
- [ ] Payload de relatório + builder + narrativa com validação de número órfão
- [ ] Rota de print + geração de PDF
- [ ] Template `freelance_mensal`

**Saída:** um relatório mensal real, entregue a um cliente real, produzido em
menos de 15 minutos.

## Fase 3 — Escala e segunda plataforma

- [ ] Telas 3 e 4 (drill-down, criativos com ângulo/awareness)
- [ ] Alertas por regra + notificação
- [ ] Backlog de testes: registro de experimento e resultado
- [ ] Templates `institucional` e `interno`
- [ ] `PlatformConnector` para Google Ads (Search + PMax primeiro)
- [ ] Consolidação multi-plataforma por cliente

Google Ads exige remapear hierarquia (`ad_group`), conversões
(`conversion_action`) e o fato de que PMax não expõe granularidade de
segmentação. Reserve tempo para isso; não é "só mais um conector".

## Fase 4 — Opcional, conforme necessidade

- Acesso read-only do cliente com link assinado
- Métricas de produto próprio (coorte, LTV, retenção)
- TikTok / LinkedIn
- Análise de incrementalidade

## Regra de sequenciamento

Se em qualquer momento surgir a tentação de pular para "fazer o dashboard bonito"
antes da Fase 1 fechar: não. Painel com número errado é pior que planilha manual,
porque a planilha você confere e o painel você acredita.
