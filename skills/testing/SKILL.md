---
name: testing
description: Use antes de declarar uma mudança pronta no dashboard/ERP 40º BPM/I — não há testes automatizados neste projeto, então esse skill define o que verificar manualmente (caminho feliz, entrada inválida, caso extremo, permissão, segurança, regressão) proporcional ao risco da mudança.
metadata:
  domain: erp-pm-40bpmi
  role: verification
  scope: manual-testing-standard
  source: ERP_ENGINEERING_CONSTITUTION.md §10
  related-skills: erp-core, business-rules, code-review
---

# Testes

## Estado atual: zero testes automatizados

Sem framework de teste, sem `.github/workflows`, sem CI/CD. Não presuma que existe suíte alguma para rodar.

## Como a verificação tem sido feita na prática (e funcionou)

- Script Node isolado e descartável para validar lógica (regex, parsing, ordenação) contra **dado real** antes de aplicar em produção.
- Consulta direta ao banco via MCP do Supabase (`mcp__supabase__execute_sql`) para confirmar causa raiz e validar resultado pós-fix.
- Teste visual manual no navegador (screenshot/inspeção DOM) para mudança de UI — inclusive construindo harness HTML isolado fora do login quando não há credencial disponível para o agente.
- O próprio usuário testando em produção real e reportando resultado.

**Continue usando esse padrão** — não é substituto de teste automatizado, mas é o que este projeto tem hoje, e tem raiz-causado bugs reais corretamente até aqui.

## Checklist proporcional ao risco (para mudança de regra de negócio não-trivial)

1. **Caminho feliz** — o caso comum funciona com dado real.
2. **Entradas inválidas** — campo ausente, nulo, formato inesperado (datas, RE sem dígito verificador, acentuação NFD vs. NFC — já foi causa real de bug de detecção de restrição via WSSCPM).
3. **Casos extremos** — lista vazia, registro órfão (pessoa que saiu do efetivo mas tem dado residual em outra tabela — já causou 2 bugs reais de contagem divergente entre P1 e UIS).
4. **Permissões** — a rota nova respeita todos os níveis de `role`/`secoes_acesso` relevantes, não só o caminho do usuário que pediu a feature.
5. **Segurança** — a rota rejeita corretamente usuário não autenticado e usuário sem permissão, mesmo que o frontend nunca mostre o botão pra esse usuário.
6. **Regressão** — a mudança não quebra tela(s) irmã(s) que dependem do mesmo dado (P1/UIS/P3 compartilham fonte com frequência — ver `business-rules/SKILL.md`).

Não é necessário aplicar os 6 itens com o mesmo rigor sempre — calibrar pelo risco real (uma mudança de texto de UI não precisa do mesmo tratamento que uma mudança de cálculo de restrição médica ativa).

## `[A DEFINIR]` pelo proprietário

Se vale priorizar introduzir um framework de teste mínimo (ex: cobrindo só `backend/analytics/*` e lógica pura de cálculo extraída do frontend) — hoje é zero, e seria provavelmente a mudança de maior alavancagem de qualidade se priorizada.
