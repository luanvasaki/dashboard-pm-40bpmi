---
name: business-rules
description: Use antes de implementar ou alterar cálculo/regra de negócio (KPI, ordenação, deduplicação, elegibilidade, restrição ativa etc.) no dashboard/ERP 40º BPM/I — especialmente se a mesma informação aparece em mais de uma tela (P1/UIS/P3). Cobre onde a regra deve viver e o histórico real de divergência por duplicação.
metadata:
  domain: erp-pm-40bpmi
  role: business-logic
  scope: rules-placement
  source: ERP_ENGINEERING_CONSTITUTION.md §7
  related-skills: erp-core, backend, frontend, testing
---

# Regras de Negócio

## Princípio central

Toda regra de negócio importante deve viver numa camada que **não** dependa exclusivamente da interface — hoje isso significa o **backend** (`server.js`/`analytics/*.js`) para regras que afetam integridade de dado ou autorização. O frontend deve conter só lógica de **apresentação** derivada de dado já correto vindo da API.

## Isso não é 100% verdade hoje na prática — é o alvo, não o estado atual

Cálculo de KPI, deduplicação de restrição, ordenação por antiguidade e determinação de "afastado hoje" vivem hoje no **frontend** (`p1.js`), não no backend. Isso já causou divergência real:

- KPI de "IAS vencido" do P1 vs. da UIS contavam registro órfão (pessoa fora do efetivo) de forma diferente — corrigido centralizando o filtro de escopo (`reAtivosSet()`) no backend.
- Contagem de restrição divergia entre P1 e UIS pelo mesmo motivo — mesmo fix aplicado.
- Restrição aparecia "triplicada" no assentamento porque 3 fontes (efetivo_pm + uis_restricoes origem=sgp + uis_restricoes origem=manual) descrevendo o mesmo período eram renderizadas sem dedup — corrigido com dedup por `codigos|inicio|termino` no frontend, mas é sintoma do mesmo problema raiz: múltiplas fontes da "mesma verdade" sem um único ponto de cálculo.

## Regra para feature nova

Sempre que uma regra de negócio precisar ser calculada em mais de uma tela (P1 e UIS já mostraram esse padrão, P3 compartilha as mesmas tabelas de origem), **calcular uma vez no backend e expor via API** — não reimplementar a mesma lógica em dois arquivos de frontend.

Se a regra já existe duplicada em dois lugares por herança histórica e a tarefa atual só toca uma delas: **declarar explicitamente ao usuário que a duplicata existe e não foi tocada** — nunca presumir que corrigir uma corrige a outra.

## Casos concretos de regra de negócio não-óbvia já resolvidos (referência)

- **Restrição médica "ativa":** decisão explícita do usuário (2026-08-14) — restrição expira pela data de retorno prevista, igual ao padrão já usado no WSSCPM. A regra é: pegar a avaliação mais recente por `dataCad` na `ListaCmed` do SGP-DP e só considerar "ativa" se ela tiver `rest` (restrição de verdade) E a data de retorno estiver em aberto (`termino` nulo) ou ainda não tiver passado (`termino >= hoje`). Se a data já passou, é apto — mesmo sem uma avaliação nova de alta. (Uma suposição anterior, baseada num único caso observado, tinha concluído o oposto — foi corrigida depois que o usuário esclareceu a regra real.)
- **LSV (Licença Sem Vencimento) com término em aberto:** `termino=null` significa "ainda em curso", não "inválido" — cálculos de "afastado hoje" devem tratar `(!termino || termino >= hoje)`, nunca só `termino >= hoje`.
- **Ordem de antiguidade de sargento:** RE crescente não é suficiente — 1º Sgt é mais antigo que 2º Sgt mesmo com RE maior; a hierarquia de posto precede a ordenação por RE dentro do mesmo posto.
- **Nem todo item de "Agregação"/afastamento é restrição médica de verdade** (ex: LSV aparecia classificado como restrição) — sempre checar o texto/motivo, não só a categoria geral do campo de origem.

Regra geral extraída desses casos: **nunca assumir que um campo de data ou uma categoria geral já captura a regra real do domínio — validar contra um caso real antes de codificar a interpretação mais óbvia.**
