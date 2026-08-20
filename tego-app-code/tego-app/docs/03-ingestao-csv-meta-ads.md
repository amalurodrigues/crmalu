# 03 — Ingestão via CSV (Meta Ads)

Substitui a ingestão por API enquanto houver 1 cliente e o acesso via Marketing
API não estiver resolvido. Ver `docs/03-alt-ingestao-api-meta-ads.md` para o
caminho de API, mantido como referência para quando o volume justificar.

## Por que CSV serve agora

Com 1 conta, você é o agendador: exporta manualmente, o sistema absorve. Isso
elimina rate limit, token, App Review, retry e job assíncrono — toda a
complexidade do documento de API existia para resolver "múltiplas contas, todo
dia, sem humano no loop". Não é o seu problema hoje.

## Estrutura do export (template definitivo, validado com dado real)

Duas versões já confirmadas com arquivos reais do cliente:

- **v1 (período único, sem ID):** o primeiro export testado. Funciona, mas
  tem os dois problemas abaixo. Documentado como fallback.
- **v2 (com IDs + quebra diária):** o template a partir de agora. Resolve os
  dois problemas do v1. Use este daqui para frente.

Colunas do v2 — em "Personalizar colunas", adicionar **Identificação da
campanha / do conjunto / do anúncio** (seção Configuração → IDs), e em
"Repartir por" escolher **Dia**:

```
Nome do anúncio | Objetivo | Identificação da campanha |
Identificação do conjunto de anúncios | Identificação do anúncio | Dia |
Status de veiculação | Nível de veiculação | Tipo de resultado | Resultados |
Custo por resultado | Valor gasto (BRL) | Impressões | Alcance |
Configuração de atribuição | Classificação de qualidade | Classificação da
taxa de engajamento | Classificação da taxa de conversão | Nome do
conjunto de anúncios | Hook | Início dos relatórios | Encerramento dos relatórios
```

Encoding: UTF-8 com BOM (`utf-8-sig`). Nulo de ranking representado por `–`
(en dash); ausência de resultado no dia é **string vazia**, não `–` — são dois
marcadores de nulo diferentes, o parser trata os dois.

Grão confirmado: **1 linha por (`Identificação do anúncio`, `Dia`)**, único —
validado com `pnpm reconcile`-equivalente no protótipo (`prototypes/parse_meta_csv.py`),
35 linhas, 35 combinações únicas, zero duplicata.

## Chave: agora é o `ad_id`, não mais nome

Com o v2, `natural_key = Identificação do anúncio`. Resolve de raiz o problema
do v1: no primeiro export, `Estático01`, `Estático02` e `Vídeo-01` apareciam
cada um em dois conjuntos diferentes (`Maternidade` e `EstágioProbatório`) —
criativo reaproveitado entre nichos, prática legítima que quebrava "nome do
anúncio" como chave isolada. Com ID, a colisão desaparece e o histórico
sobrevive a rename de conjunto ou de anúncio no Ads Manager.

**Fallback v1** (só se um export vier sem as colunas de ID):

```ts
const naturalKey = adId ?? `${adsetName}::${adName}`;
```

O parser detecta a presença das colunas de ID e alterna automaticamente —
ver `has_ids` em `prototypes/parse_meta_csv.py`.

## O que ainda falta (menor prioridade que ID/dia, já resolvidos)

| Lacuna | Efeito | Correção |
|---|---|---|
| Sem `link clicks` / `CTR` / `CPC` | Impossível localizar gargalo de funil (impressão→clique→conversão) | Adicionar essas colunas em "Personalizar colunas" |
| Sem nome de campanha (só o ID) | Hierarquia legível exige join manual com o ID | Adicionar coluna "Nome da campanha", ou resolver por lookup na primeira sincronização de entidades |

Nenhuma das duas bloqueia o pipeline atual — a reconciliação já valida com o
que se tem.

## Nomenclatura observada (difere do padrão especulativo do doc 10)

O padrão real em uso é:

```
[Vertical][Canal][Temperatura de público]
```

Exemplos reais: `[EstágioProbatório][Whatsapp][Frio]`,
`[Maternidade][Whatsapp][Frio]`.

Mais enxuto que o padrão de `docs/10-nomenclatura.md` (que especulava também
formato, ângulo e estágio de consciência no nome do **anúncio**, não do
conjunto). O parser extrai por regex `\[(.*?)\]` e preenche
`vertical / canal / temperatura` como as três primeiras tags — os campos de
`ângulo` e `estágio de consciência` ficam nulos até você decidir se valem o
esforço de manter no nome do criativo ou se preenche via UI depois da
importação (`dim_creative.angle`, `dim_creative.awareness_stage`).

## Mapeamento de colunas → modelo

| Coluna CSV | Campo | Nota |
|---|---|---|
| Nome do anúncio | `dim_entity.name` (level=ad) | não é chave sozinho |
| Nome do conjunto de anúncios | `dim_entity.name` (level=adset) | contém as tags de nomenclatura |
| Status de veiculação | `dim_entity.status` | |
| Tipo de resultado | `fact_actions_daily.action_type` (bruto, em PT) | mapear para `conversion_key` via `conversion_mappings`, igual à ingestão por API |
| Resultados | `fact_actions_daily.count` | |
| Valor gasto (BRL) | `spend` | **moeda vem no texto do cabeçalho**, não em coluna — se a conta mudar de moeda, o parser quebra em `extract_currency()` e isso é o comportamento correto (falha alto, não silencioso) |
| Custo por resultado | **descartar na ingestão** | é `spend/results` já calculado pelo Meta; se importado e depois agregado por média, produz o erro de média-de-médias. Ver demonstração abaixo. |
| Impressões | `impressions` | |
| Alcance | `reach`, mas **só válido por linha, nunca somado entre anúncios** — públicos se sobrepõem. Vai para `fact_insights_period`, não para agregação de conta. |
| Configuração de atribuição | `attribution_window`, mapear texto → chave canônica (`"Clique de 7 dias ou visualização de 1 dia"` → `7d_click_1d_view`) |
| Classificação de qualidade / engajamento / conversão | `quality_ranking` etc — frequentemente `–` (sem volume suficiente), igual ao comportamento via API |
| Hook | `hookRate` — **já vem como razão pronta** (ex. `0.236`), não como contagem bruta de `video_3s`. Diferente da API, que devolve contagem. Armazenar como veio; não recalcular, não tem os componentes. |
| Início/Encerramento dos relatórios | `period_start` / `period_end` — igual em todas as linhas quando não há repartição por dia |

## Prova de por que "Custo por resultado" não pode ser usado direto

No primeiro arquivo real (8 linhas, período único), tirar a média da coluna
"Custo por resultado" por vertical em vez de somar gasto e dividir por soma de
resultados já produz **12,5% de erro** em um dos dois verticais. Amostra
pequena amplifica o efeito, mas a direção do erro não desaparece com volume —
só fica mais difícil de perceber. Ver `packages/csv-import/__tests__` (a
portar do protótipo Python de validação).

## Prova de que soma diária reconcilia com o agregado nativo do Meta

Reconstruindo o gasto do período por soma das 5 linhas diárias de cada anúncio
(export v2) e comparando com o valor que o próprio Meta agregou no export v1
para o mesmo anúncio e período: diferença de 0,13% a 0,21%, dentro da
tolerância de 0,5% definida em `docs/09-qa-reconciliacao.md`. É arredondamento
interno do Meta, não bug do pipeline — o teste de reconciliação deve esperar
exatamente esse tipo de divergência residual, não zero absoluto, em `spend`.

## Fluxo de ingestão

```
Export manual (Ads Manager) → upload na tela /admin/import → parser →
staging table (raw, com natural_key) → resolução de dim_entity (upsert por
natural_key) → fact_actions_daily / fact_insights_period → recalcular
materialized views
```

Sem cron, sem rejanela automática: **antes de gerar um relatório**, reexporte
o período inteiro do zero (não incremente sobre exports antigos) e faça upsert
— isso já resolve a questão de "dado muda retroativamente" sem precisar de
lógica de rejanela agendada.

## O que NÃO dá para fazer só com CSV (documentar como limitação conhecida)

- Alerta em tempo quase real (frescor = data do último export manual)
- Todos os `action_type` de uma entidade — o export só traz o "Tipo de
  resultado" primário escolhido pela otimização do conjunto
- Reach agregado de período no nível conta/campanha, sem exportação adicional
  dedicada (`level=campaign`, sem `time_increment`, só quando o relatório
  precisar)
- Breakdown por posicionamento/idade/gênero na mesma exportação — pedem
  relatório à parte, mesma regra da API

Nenhuma dessas é bloqueante para o `freelance_mensal` de 1 cliente. Revisitar
quando a carteira crescer o suficiente para o export manual virar gargalo de
tempo — nesse ponto, `docs/03-alt-ingestao-api-meta-ads.md` volta à mesa.
