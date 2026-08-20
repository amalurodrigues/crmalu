# 07 — LGPD, segurança e políticas

## Classificação do dado

| Categoria | Exemplos | Tratamento |
|---|---|---|
| Agregado, sem titular | spend, impressões, cliques, conversões por dia | Livre. É o grosso do sistema. |
| Agregado com atributo demográfico | breakdown por idade/gênero/região | Agregado, sem titular identificado. Suprimir célula com N < 25. |
| **PII de lead** | nome, telefone, e-mail de lead form | **Fora de escopo. Não ingerir.** |
| Segredo | tokens, credenciais de cliente | Cifrado em repouso, nunca em log |

## A decisão de escopo mais importante

**Não puxe dados de Lead Ads (`/leads`) para dentro deste sistema.** Isso traria
PII de titulares que não têm relação com você, criaria papel de operador sob a
LGPD, exigiria base legal, contrato de tratamento com cada cliente, política de
retenção e resposta a titular. O ganho — ver nome do lead no painel — não paga
esse custo.

O sistema trabalha com **contagem** de leads, não com leads. Se um dia precisar
de qualificação, ela entra como número agregado via `offline_results`, informado
pelo cliente.

Se essa decisão for revertida, é ADR obrigatório com: base legal definida,
contrato de operador com cada cliente, retenção máxima, cifragem em coluna,
trilha de acesso e fluxo de exclusão a pedido do titular.

## Públicos personalizados e Custom Audiences

Se o sistema um dia fizer upload de lista para Custom Audience:

- A base legal é do **cliente** (controlador), não sua. Registre no cadastro do
  cliente quem é o controlador e qual a base legal declarada.
- Hash SHA-256 client-side antes de qualquer envio; o dado em claro nunca toca
  seu banco nem seu log.
- Guarde só o **registro do envio** (quando, quantos registros, qual audiência),
  nunca o conteúdo.
- Isto está fora de escopo até a Fase 4.

## Segurança operacional

- Tokens em `platform_credentials.access_token_enc`, cifrados com chave em
  variável de ambiente (libsodium sealed box ou pgcrypto). Nunca em texto puro,
  nunca em `.env` commitado, nunca em log — inclusive log de erro de HTTP.
- Redator de log obrigatório: filtro que substitui qualquer string com
  `access_token`, `Bearer `, ou padrão de token do Meta.
- `raw_api_responses` pode conter dado sensível de configuração de conta;
  retenção 90 dias com job de expurgo.
- Acesso de cliente ao relatório (Fase 4): link assinado com expiração, escopo
  restrito ao próprio `client_id`, sem listagem. Nunca ID sequencial.
- Backup diário do Postgres, com teste de restore trimestral. Backup não testado
  não é backup.

## Políticas de anúncio que o sistema deve sinalizar

O painel não aprova anúncio, mas deve **avisar antes**, não depois da reprovação:

| Sinal detectado | Aviso na UI |
|---|---|
| `special_ad_categories` não vazio | Segmentação restrita: sem idade/gênero/CEP, raio mínimo ampliado. CPM tende a ser maior; não diagnostique como problema de criativo. |
| Cliente com `segment = 'juridico'` | Publicidade advocatícia tem restrições próprias (OAB, Provimento 205/2021): checar titularidade da conta e destino do lead antes de subir. |
| Cliente com `segment` em saúde, finanças, emagrecimento | Categoria sensível: revisar promessa de resultado e uso de atributo pessoal na copy. |
| Copy contendo atributo pessoal em 2ª pessoa ("você que…") | Possível violação de atributos pessoais do Meta, inclusive em post impulsionado. |

A última regra é um linter simples de copy sobre `dim_creative.body`, rodando na
ingestão. Detecção por heurística de padrão, com falso positivo tolerado — o
custo de um aviso a mais é zero, o de uma reprovação é um dia de campanha.
