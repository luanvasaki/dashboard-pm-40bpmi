---
name: backend
description: Use ao adicionar/alterar rota em backend/server.js ou módulo em backend/analytics/ no dashboard/ERP 40º BPM/I. Cobre validação, tratamento de erro, autorização, formato de resposta, logs de auditoria (logs_acesso) e a lacuna real de transações multi-tabela.
metadata:
  domain: erp-pm-40bpmi
  role: backend
  scope: api-implementation
  source: ERP_ENGINEERING_CONSTITUTION.md §9
  related-skills: erp-core, security, database, business-rules
---

# Backend

## Validação

Manual, por rota, cedo (fail fast com `400`). Manter — não introduzir lib de schema validation isoladamente numa rota sem padronizar para todas.

## Tratamento de erros

`try/catch` por rota. `console.error` no servidor + resposta JSON `{error: mensagem}` ao cliente. Ver `security/SKILL.md` sobre não vazar detalhe interno em rota nova.

## Autorização

Sempre via middleware (`requireAuth`, depois `requireRole(...)`/`requireSectionNominal(...)`) — nunca checagem de role inline dentro do handler como primeira linha de defesa. Os middlewares existem exatamente para centralizar isso. Ver `security/SKILL.md` para o histórico de falhas quando isso não foi seguido.

## Respostas

JSON puro, sem envelope padronizado (`{data: ...}` vs. retorno direto do array/objeto varia por rota) — inconsistência real e conhecida. **Não introduzir um terceiro formato**; ao mexer numa rota existente, seguir o formato que ela já usava.

## Logs / auditoria

- Operacional: `console.log`/`console.error`.
- Auditoria: tabela `logs_acesso` via helper `logAcesso()` — **fire-and-forget, nunca bloqueia a resposta principal**.
- Cobertura atual confirmada: login/logout (sucesso e falha), toda operação administrativa sobre usuário (editar/excluir/resetar senha/alterar posto), todo upload em lote (RAC, InfoCrim, efetivo, quadro, produtividade, PVS, indicadores P3, UIS, cursos), pedidos de sincronização SGP, atualização de sessão SGP-DP.

**Regra:** toda rota nova que (a) altera dado em lote, (b) altera permissão/role de usuário, ou (c) é ação administrativa sensível deve chamar `logAcesso()` seguindo o mesmo padrão.

## Serviços

`backend/analytics/*.js` é a única separação real de camada de serviço — cálculo puro, sem I/O, recebendo dado já carregado. Preferir esse padrão para lógica de cálculo nova em vez de misturar cálculo com query dentro do handler da rota.

## Transações

**Lacuna real:** nenhuma transação Postgres explícita (`BEGIN`/`COMMIT`) identificada em lugar nenhum. Operações multi-tabela (ex: sincronizar restrição em `efetivo_pm` + `uis_restricoes`) são múltiplas chamadas sequenciais via `supabase-js`, sem atomicidade garantida — se a segunda falhar, a primeira já foi commitada, deixando estado inconsistente.

`[A DEFINIR]` pelo proprietário se vale introduzir transação (via `rpc`/função Postgres) para os fluxos mais críticos. Até lá: ao escrever um fluxo multi-tabela novo, pelo menos ordenar as escritas de forma que uma falha parcial deixe o sistema num estado "seguro" (preferir escrever primeiro o que é menos crítico se falhar sozinho) e mencionar essa limitação ao usuário se o fluxo for sensível.

## Middlewares existentes (referência rápida)

- `requireAuth` — JWT via cookie `auth_token` ou header `Bearer`.
- `requireRole(...roles)` — libera se `role === 'ti'` ou role está na lista.
- `requireSectionNominal(secao)` — libera role privilegiado OU `secoes_acesso[secao]` em `['nominal','editor']`.

Reutilizar estes três antes de escrever qualquer checagem de acesso nova.
