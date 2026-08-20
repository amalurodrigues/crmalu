# Backlog de testes

Registro de todo experimento rodado. Existe para impedir repetir teste perdido e
para acumular aprendizado transferível entre clientes.

## Formato

### T-{n} — {título}
- **Cliente / conta:** 
- **Hipótese:** se {mudança}, então {métrica} melhora, porque {mecanismo}
- **Variável isolada:** (uma só)
- **Métrica de decisão:** 
- **Amostra mínima definida a priori:** conversões por braço
- **Período:** de __/__ a __/__
- **Resultado:** vencedor / inconclusivo / perdedor
- **Volume atingido:** conversões por braço
- **Decisão tomada:** 
- **Transferível para outros clientes?** sim / não / talvez — por quê

## Regra de encerramento
Teste que não atingiu a amostra mínima é registrado como **inconclusivo**, nunca
como vencedor. Inconclusivo é resultado válido e evita que a mesma ideia volte
como "aquilo funcionou uma vez".

## Índice
| ID | Cliente | Variável | Resultado | Data |
|---|---|---|---|---|
