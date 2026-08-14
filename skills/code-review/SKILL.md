---
name: code-review
description: Use antes de declarar qualquer funcionalidade "concluída" no dashboard/ERP 40º BPM/I, ou ao revisar mudança de outro agente. Define os critérios obrigatórios de conclusão e o princípio de que quem implementa não pode aprovar sozinho.
metadata:
  domain: erp-pm-40bpmi
  role: quality-gate
  scope: completion-criteria
  source: ERP_ENGINEERING_CONSTITUTION.md §12-13
  related-skills: erp-core, testing, security, business-rules
---

# Code Review / Critérios de Qualidade

## Princípio fundamental (não-negociável)

> **O agente que implementa uma funcionalidade NÃO possui autoridade para declarar sozinho que ela está concluída.**

A conclusão depende de verificação independente — outro agente/revisão dedicada, ou o usuário confirmando o resultado em uso real. Um agente pode e deve reportar "implementei e validei X, Y, Z" com evidência concreta do que validou — mas a palavra final de "está pronto para produção" não é dele.

## Nenhuma funcionalidade está concluída só porque "funciona"

Uma funcionalidade só pode ser considerada concluída quando:

1. Atende aos requisitos reais pedidos (não a uma versão simplificada/reinterpretada deles).
2. Atende a critérios de aceite explícitos — e se não existirem, os critérios implícitos foram confirmados com o usuário antes de declarar pronto.
3. Não viola os princípios arquiteturais (`architecture/SKILL.md`, `database/SKILL.md`, `security/SKILL.md`).
4. Não introduz vulnerabilidade conhecida (autorização ausente numa rota nova, dado sensível vazado em mensagem de erro, secret exposto).
5. Não quebra funcionalidade existente — em particular, não quebra tela(s) irmã(s) que compartilham o mesmo dado (ver `business-rules/SKILL.md`).
6. Possui tratamento adequado de erro (não deixa UI travada ou backend retornando 500 cru para caso previsível).
7. Possui verificação proporcional ao risco (`testing/SKILL.md`) — não exige suíte automatizada completa nesta fase do projeto, mas exige pelo menos uma validação deliberada contra dado real.
8. Passa por auditoria independente — este item.

## Checklist de revisão para uma mudança nesta base de código

- [ ] A regra de negócio nova foi calculada uma vez só (backend), não duplicada entre P1/UIS/P3? (`business-rules/SKILL.md`)
- [ ] Toda rota nova/alterada tem `requireAuth` + `requireRole`/`requireSectionNominal` correspondente ao nível de acesso real necessário? (`security/SKILL.md`)
- [ ] Se a mudança introduz automação sobre um dado que já tinha entrada manual, foi confirmada cobertura 100% antes de remover o caminho manual? (`database/SKILL.md`)
- [ ] Se a mudança altera schema, foi feita via migration nomeada, não edição ad hoc? (`database/SKILL.md`)
- [ ] Se a mudança toca `agente-sgp/agente.js`, o usuário foi lembrado de que precisa transferir o arquivo manualmente e reiniciar o processo? (`architecture/SKILL.md`)
- [ ] A lógica não-trivial foi validada contra dado real (script isolado, SQL, teste visual) antes de ser declarada pronta? (`testing/SKILL.md`)
- [ ] Mensagem de erro nova ao cliente é genérica, sem vazar detalhe interno? (`security/SKILL.md`)
- [ ] Nenhum arquivo não relacionado foi tocado sem justificativa?
- [ ] Nenhuma funcionalidade existente foi removida para simplificar, sem aprovação explícita?
- [ ] Suposições feitas pelo agente foram declaradas ao usuário, não só implícitas no código?

## Regras para agentes de IA (aplicam-se a quem implementa E a quem revisa)

- Não inventar requisitos — investigar ou perguntar quando ambíguo.
- Identificar ambiguidade explicitamente, em vez de escolher silenciosamente uma interpretação.
- Declarar suposições na resposta ao usuário.
- Analisar impacto antes de alteração estrutural (schema, contrato de API, remoção de campo/rota) — checar quem mais consome aquele dado, não só a tela que motivou a mudança.
- Não modificar arquivo não relacionado sem justificativa.
- Não remover funcionalidade existente para simplificar implementação sem aprovação explícita.
- Não ignorar erro pré-existente encontrado incidentalmente — reportar, mesmo fora do escopo da tarefa atual.
- Preferir solução simples e consistente com o padrão já existente à complexidade nova.
- Respeitar padrão já existente (nomenclatura PT-BR, `snake_case`, `data-foto-re`, coluna `origem`, delete+reinsert por escopo, middlewares de auth) antes de introduzir um paralelo.
