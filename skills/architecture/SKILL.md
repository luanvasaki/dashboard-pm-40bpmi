---
name: architecture
description: Use ao decidir onde colocar código novo, avaliar se um arquivo deve ser dividido, tocar em agente-sgp/agente.js, ou reutilizar/duplicar lógica entre módulos do dashboard/ERP 40º BPM/I. Cobre organização do projeto, separação de responsabilidades, dependências entre módulos e dívida técnica.
metadata:
  domain: erp-pm-40bpmi
  role: architecture
  scope: decision
  source: ERP_ENGINEERING_CONSTITUTION.md §4
  related-skills: erp-core, backend, frontend, database
---

# Arquitetura

Carregue `erp-core/SKILL.md` primeiro se ainda não tiver o contexto geral do projeto.

## 1. Monólito consciente, não acidental

O backend é um arquivo único (`backend/server.js`, ~118 KB) por decisão histórica, não por ignorância — mas já tem custo real de navegabilidade.

**Regra:** ao adicionar rota nova de um domínio que já tem 3+ rotas relacionadas (ex: mais uma de "cursos"), agrupar fisicamente perto das rotas irmãs, comentando a seção como já é feito (`// ═══ ... ═══`). Extrair um módulo (ex: `routes/p1.js`) exige alinhar antes com o usuário — nunca misturar extração estrutural com mudança de funcionalidade no mesmo commit.

`backend/analytics/*.js` é a única separação real de "camada de domínio" hoje — funções puras, sem I/O, recebendo dados já carregados. É o padrão a seguir para cálculo novo, em vez de misturar cálculo com query dentro do handler.

## 2. `agente-sgp/agente.js` é uma zona arquitetural à parte

Não faz parte do deploy Vercel. Roda só no computador do batalhão, sem git instalado lá. É o único componente que fala com WSSCPM (SOAP) e SGP-DP (REST, sessão colada manualmente).

**Regra:** qualquer alteração nesse arquivo precisa ser entregue ao usuário para transferência manual (pendrive/arquivo) e reinício do processo — `git push` sozinho **não** propaga a mudança para produção real desse componente. Sempre lembrar o usuário disso ao editar o arquivo.

## 3. Reutilização de código no frontend é por convenção, não por import

Sem bundler — "componente" é uma função JS que retorna string HTML, carregada via `<script>` em ordem específica no `index.html`.

**Regra:** antes de escrever uma função utilitária nova, verificar se algo equivalente já existe em `utils.js`/`auth.js`/no arquivo de domínio mais próximo (`p1.js`, `uis.js`, `p3.js`). Duplicação de lógica de negócio entre `p1.js` e `uis.js` já causou pelo menos dois bugs reais de dados divergentes entre telas — ver `business-rules/SKILL.md`.

## 4. Padrão de sincronização dominante: delete + reinsert

Usado em uploads de CSV (efetivo, afastamentos legado, quadro, produtividade, UIS) e nas sincronizações completas do agente SGP. Exceções deliberadas: `prod_cursos` (upsert por `id_crs_pm`) e `ias_registros` (upsert por RE) — porque nesses casos não se quer um registro por evento histórico.

**Regra:** ao implementar sincronização nova, decidir explicitamente entre "delete+reinsert por chave de escopo" (ano, RE) vs. "upsert por chave natural" — e documentar a escolha, porque ela tem implicação direta em preservação de histórico (ver `database/SKILL.md`).

## 5. Dívida técnica: registrar, não silenciar

Se encontrar um bug pré-existente fora do escopo da tarefa atual: reportar ao usuário. Não corrigir sem pedir (efeito colateral não previsto) e não ignorar silenciosamente.
