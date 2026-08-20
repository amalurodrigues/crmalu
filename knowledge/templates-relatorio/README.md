# Templates de relatório

Um arquivo por `template_key`, descrevendo seções, tom e particularidades. O
gerador lê `report_definitions.config` (JSON no banco); estes arquivos são a
especificação humana correspondente e o que o LLM recebe como instrução de tom.

Templates previstos: `freelance_mensal`, `institucional`, `interno`,
`produto_proprio`. Ver `docs/05-relatorios.md`.

Ao criar um template novo, cole aqui um relatório real que você já entregou e
considerou bom. O gerador imita o que existe; sem exemplo, ele produz o genérico
de agência.
