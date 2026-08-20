# knowledge/

Base factual do operador. Esta pasta é lida pelo Claude Code e pelo gerador de
narrativa. É o que impede o sistema de inventar benchmark.

Regra única e absoluta: **todo número aqui tem origem declarada**.

- `[PRÓPRIO]` — extraído do próprio sistema. Traz período, conta e volume.
- `[CLIENTE]` — informado pelo cliente. Traz quem informou e quando.
- `[EXTERNO]` — benchmark de mercado. Traz fonte, data e por que é aplicável.
- `[ESTIMATIVA]` — palpite fundamentado. Traz o raciocínio.

Número sem tag não entra em relatório e não sustenta recomendação.

## Arquivos

| Arquivo | Alimenta | Prioridade |
|---|---|---|
| `benchmarks/historico-por-vertical.md` | diagnóstico, metas, `/plano` | **Alta — gerado pelo sistema a partir da Fase 2** |
| `icp/{slug}.md` | narrativa, ângulos criativos, `/criativos` | **Alta — sem isso, todo ângulo é chute** |
| `politicas/` | avisos de compliance na UI | Alta em nichos sensíveis |
| `tom-de-voz/{slug}.md` | prompt de narrativa, copy | Média |
| `testes/backlog.md` | evita repetir experimento perdido | Média, cresce com o tempo |
| `templates-relatorio/` | template_key do gerador | Média |

`benchmarks/historico-por-vertical.md` deve ser **gerado** pelo sistema, não
escrito à mão. Enquanto a Fase 2 não fecha, mantenha manual — mas marque tudo
como `[EXTERNO]` ou `[ESTIMATIVA]`, nunca como próprio.
