# prototypes/

Protótipo de validação em Python, feito para confirmar a estrutura real do
export do Ads Manager antes de escrever o adapter definitivo em TypeScript
(`packages/csv-import`). Não é o código de produção — é a especificação
executável que o adapter TS deve replicar.

## Uso

```
python3 parse_meta_csv.py fixtures/export-v2-com-id-e-dia.csv
```

## O que valida

- Detecção automática do template v1 (período único, sem ID) vs v2 (com ID +
  quebra diária) pela presença das colunas de ID no cabeçalho
- Chave natural: `ad_id` quando disponível, fallback `adset_name::ad_name`
- Unicidade de (entidade, dia) — pré-condição para upsert idempotente
- Extração de moeda do texto do cabeçalho ("Valor gasto (BRL)")
- Extração das tags de nomenclatura `[Vertical][Canal][Temperatura]`
- CPA correto por SUM(spend)/SUM(resultados), nunca média de "Custo por resultado"
- Aviso de que `Alcance` não pode ser somado entre anúncios

## fixtures/

Os dois exports reais que geraram este protótipo — mesmo cliente, mesmo
período (15–19/08/2026), dois templates de exportação diferentes. Servem
como fixture de teste de reconciliação quando o adapter TS for escrito
(`docs/09-qa-reconciliacao.md`): a soma diária do v2 deve reconciliar com o
agregado nativo do v1 dentro de 0,5%.
