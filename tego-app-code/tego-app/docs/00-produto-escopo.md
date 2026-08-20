# 00 — Produto e escopo

## Problema

Hoje o relatório de cliente é montado manualmente: exportar do Ads Manager,
colar em planilha, montar gráfico, escrever análise. Isso custa horas por cliente
por mês, erra número, e o formato varia entre entregas. Não existe visão
consolidada de carteira (todos os clientes, um lugar), nem histórico próprio de
performance — o que obriga a usar benchmark de mercado onde deveria haver dado
próprio.

## O que o sistema resolve, em ordem de valor

1. **Histórico próprio confiável.** Base de CPA/CPL/CTR/CVR real por vertical,
   por cliente, por ângulo criativo. É o ativo mais valioso do sistema; o
   dashboard é consequência dele.
2. **Relatório em minutos, não horas.** Payload calculado + narrativa assistida +
   PDF gerado do próprio painel.
3. **Visão de carteira.** Uma tela que responde: qual cliente está fora da meta
   hoje, e o quanto.
4. **Alerta antes do cliente perceber.** Regras simples sobre dado diário
   (CPA acima da meta por N dias, spend parado, frequency estourando).

## Não-objetivos

- Não é ferramenta de gestão de campanha. Compra de mídia continua no Ads Manager.
- Não é CRM. Qualificação de lead acontece fora.
- Não é produto para vender. É ferramenta interna. Se virar produto um dia,
  isso é uma decisão nova com requisitos novos (billing, multi-tenant, suporte).

## Personas de uso

| Quem | Frequência | Tela principal |
|---|---|---|
| Operador (você), rotina diária | diária, 5 min | Carteira + alertas |
| Operador, análise | semanal | Drill-down por conta → campanha → criativo |
| Operador, entrega | mensal | Builder de relatório + export PDF |
| Cliente (Fase 4, opcional) | mensal | Relatório read-only, link com expiração |

## Critérios de sucesso (mensuráveis)

| Métrica | Baseline hoje | Alvo |
|---|---|---|
| Tempo para produzir relatório mensal de 1 cliente | manual, horas | < 15 min |
| Divergência entre número do painel e Ads Manager | n/a | < 0,5% em spend, 0 em conversões contadas |
| Contas com ingestão íntegra nas últimas 24h | n/a | 100%, com alerta em falha |
| Meses de histórico próprio consultável | 0 | 12+ até o fim da Fase 3 |

O critério de divergência é o mais importante. Se o painel não bate com o Ads
Manager, ninguém confia nele e o projeto morre. Ver `docs/09-qa-reconciliacao.md`.

## Frentes de uso e como afetam o escopo

O operador atua em três frentes, e elas têm requisitos diferentes:

| Frente | Impacto no sistema |
|---|---|
| Clientes freelance | Precisa de relatório defensável em reunião, linguagem de negócio, PDF com marca. Prioridade máxima na Fase 1. |
| Produtos próprios (games, SaaS) | Tolera mais experimentação; precisa de análise de coorte e LTV, não só CPA. Fase 3+. |
| Institucional / setor público | Restrições de linguagem, prestação de contas por empenho, relatório com formato rígido. Exige template próprio e campo de nota de empenho. Fase 3. |

Não misture os três no mesmo template de relatório. `report_templates` é
tabela, não constante.
