# 10 — Nomenclatura de campanhas

O sistema **lê** nomenclatura para enriquecer análise. Isso só funciona se a
nomenclatura for disciplinada na origem, no Ads Manager. Padronize antes de
depender do parser.

## Padrão

Separador `|`, campos posicionais, sem espaço em volta do separador.

```
Campanha:  {CLIENTE}|{FUNIL}|{OBJETIVO}|{OFERTA}|{GEO}|{AAAA-MM}
Conjunto:  {PUBLICO_TIPO}|{PUBLICO_DETALHE}|{POSICIONAMENTO}|{OTIMIZACAO}
Anúncio:   {FORMATO}|{ANGULO}|{CONSCIENCIA}|{VARIACAO}
```

Exemplo:

```
ACME|TOFU|CONV|CONSULTA-GRATIS|RN-NATAL|2026-08
FRIO|INT-DIREITO-TRAB|ADV+|MSG
REEL|DOR|PROBLEMA-AWARE|V03
```

## Vocabulário controlado

| Campo | Valores |
|---|---|
| FUNIL | `TOFU` `MOFU` `BOFU` `RMKT` |
| OBJETIVO | `CONV` `TRAF` `ALC` `ENG` `LEAD` `VENDA` |
| PUBLICO_TIPO | `FRIO` `INT` (interesse) `LAL` `RMKT` `ABERTO` |
| POSICIONAMENTO | `ADV+` `AUTO` `FEED` `STORIES` `REELS` `MANUAL` |
| FORMATO | `REEL` `ESTATICO` `CARROSSEL` `VIDEO` `UGC` |
| ANGULO | `DOR` `DESEJO` `PROVA` `AUTORIDADE` `URGENCIA` `OBJECAO` `EDUCATIVO` |
| CONSCIENCIA | `UNAWARE` `PROBLEMA-AWARE` `SOLUCAO-AWARE` `PRODUTO-AWARE` `MAIS-AWARE` |

`ANGULO` e `CONSCIENCIA` são o que transforma o painel em ativo estratégico: com
6 meses de dado você responde "qual ângulo tem menor CPA neste segmento" com
número próprio, não com achismo.

## Parser

`packages/db/parsers/naming.ts` faz split por `|` e valida contra o vocabulário.

Comportamento em nome fora do padrão: **não falhe a ingestão**. Grave
`dim_entity` normalmente, deixe os campos derivados nulos, e liste a entidade em
`/admin/naming-issues` com botão de correção manual (mapeamento salvo em
`naming_overrides`). Campanhas legadas nunca vão ser renomeadas retroativamente
no Ads Manager — o sistema precisa conviver com isso.

## Consolidação vs. fragmentação

Regra que o painel deve tornar visível, não só documentar: um conjunto precisa de
volume para sair da learning phase. Exiba na tela de conjuntos a contagem de
conversões dos últimos 7 dias com badge:

- `< 15` → "sem sinal" (vermelho)
- `15–49` → "aprendizado" (amarelo)
- `>= 50` → "estável" (verde)

Conta com muitos conjuntos amarelos e vermelhos simultâneos é conta fragmentada
demais para o volume de conversão disponível. O painel deve mostrar isso na tela
da conta como razão `conjuntos ativos : conversões/semana`.
