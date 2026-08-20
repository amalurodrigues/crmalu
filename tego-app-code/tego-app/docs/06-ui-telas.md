# 06 — UI: telas e regras de exibição

## Mapa de telas (ordem de construção)

| # | Tela | Rota | Responde |
|---|---|---|---|
| 1 | Carteira | `/` | Qual cliente está fora da meta hoje |
| 2 | Conta | `/clients/[slug]` | Como está o mês desta conta |
| 3 | Drill-down | `/clients/[slug]/campaigns` | Qual campanha/conjunto puxa o CPA |
| 4 | Criativos | `/clients/[slug]/creatives` | Qual ângulo está funcionando |
| 5 | Builder de relatório | `/clients/[slug]/reports/new` | Montar e revisar a entrega |
| 6 | Relatório publicado | `/report/[id]` + `/report/[id]/print` | Entrega |
| 7 | Saúde da ingestão | `/admin/sync` | Alguma conta parou de sincronizar |

Construa nesta ordem. A tela 7 parece secundária e é a primeira que você vai
querer quando algo quebrar em silêncio.

## Carteira — a tela mais usada

Uma linha por cliente. Colunas: verba do mês, gasto, pacing, conversões, CPA vs
meta, tendência 7d, status de sincronização. Ordenação padrão: **pior desvio de
CPA primeiro**, não alfabética.

`pacing = gasto / (verba * diasDecorridos / diasTotais)`. Abaixo de 0,85 ou acima
de 1,15 é sinal. Verba subutilizada é problema tão sério quanto estourada — em
cliente freelance, sobra de verba no fim do mês é conversa ruim.

## Regras de exibição inegociáveis

1. **`null` renderiza `—`, nunca `0` nem `-`.** Zero conversões com gasto é uma
   informação; CPA indefinido é outra.
2. Toda métrica derivada mostra o **denominador em tooltip**. "CPA R$ 42,10"
   com tooltip "R$ 3.789 / 90 conversas iniciadas". Isso ganha discussão em reunião.
3. **Badge de amostra** em toda comparação com volume baixo. Ver `04`.
4. **Badge de categoria especial** na conta quando `special_ad_categories` não
   estiver vazio, com texto explicando a restrição de segmentação.
5. **Selo de frescor**: "dados até 10/08, atualizados há 4h". Se a última
   sincronização falhou, banner vermelho na tela inteira, não ícone discreto.
6. Cor só carrega significado para métricas com polaridade definida. CPM e
   frequency não ficam vermelhos por subir — recebem faixa.
7. Moeda sempre com código quando a carteira tem mais de uma. `R$ 1.200` vira
   `R$ 1.200 (BRL)` em telas consolidadas.

## Gráficos

| Pergunta | Gráfico | Não use |
|---|---|---|
| Evolução de gasto e conversões | linha dupla com eixo secundário | pizza |
| Composição do gasto por campanha | barra empilhada 100% | pizza com 9 fatias |
| Funil | barras horizontais com taxa entre etapas | funil decorativo sem número |
| Distribuição de CPA por criativo | barras ordenadas + linha da meta | scatter sem rótulo |
| Comparação período a período | barras lado a lado | duas linhas sobrepostas |

Todo gráfico de série temporal recebe uma **linha de referência da meta** quando
a meta existe. Gráfico sem referência não sustenta decisão.

Impressão: todos os gráficos precisam funcionar em escala de cinza. Teste antes
de fechar a Fase 2.

## Design

Antes de estilizar, leia a skill de frontend design do ambiente. Restrições
próprias deste projeto:

- Densidade alta. Esta é ferramenta de operador, não landing page. Padding
  generoso desperdiça a tela em que você vai passar 5 minutos por dia.
- Tabela é cidadã de primeira classe: sticky header, ordenação por coluna,
  filtro persistido na URL.
- Todo estado de filtro na querystring. Você vai querer mandar link.
- Tema claro é o padrão (o PDF é claro). Tema escuro é opcional e não pode
  divergir do print.
