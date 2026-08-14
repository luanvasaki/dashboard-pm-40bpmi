---
name: erp-core
description: Ponto de entrada obrigatório antes de qualquer tarefa de engenharia neste repositório (dashboard/ERP administrativo do 40º BPM/I). Use sempre no início de uma tarefa para carregar objetivo, contexto do domínio, stack real e o princípio fundamental de conclusão — antes de arquitetura, banco, segurança, backend, frontend, regras de negócio, testes ou code-review.
metadata:
  domain: erp-pm-40bpmi
  role: index
  scope: orientation
  source: ERP_ENGINEERING_CONSTITUTION.md
  related-skills: architecture, database, security, backend, frontend, business-rules, testing, code-review
---

# ERP Core — Ponto de Entrada

Este skill é o índice da **Constituição de Engenharia** do dashboard/ERP administrativo do 40º BPM/I (Polícia Militar de São Paulo). O documento completo, com toda a evidência levantada por inspeção real do código e do schema, vive em `ERP_ENGINEERING_CONSTITUTION.md` na raiz do repositório — este skill resume o essencial e aponta para onde aprofundar.

## Objetivo

Estabelecer os princípios técnicos, de segurança e de processo que qualquer agente de IA (ou humano) deve seguir ao alterar este sistema. Não substitui julgamento técnico — define os limites dentro dos quais esse julgamento deve operar.

## Contexto do domínio

- **O que é:** gestão administrativa de um batalhão da PM-SP — efetivo (P1), inteligência/criminalidade (P3), indicadores de qualidade, produtividade operacional, UIS (restrições médicas codificadas por BG PM 166/2006) e IAS (Inspeção Anual de Saúde).
- **Dado sensível envolvido:** identificação pessoal (nome, RE, foto, endereço residencial), condição de saúde/restrição médica, histórico funcional. Trate como dado sensível de RH/saúde, não como estatística agregada.
- **Efeito cascata:** dados de efetivo/restrição/curso alimentam simultaneamente P1, UIS e P3 ao mesmo tempo. Uma mudança "isolada" numa fonte raramente é isolada de verdade — já causou bugs reais de divergência de KPI entre telas.

## Stack real (não suponha, isto já foi verificado)

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Express, arquivo único `backend/server.js` |
| Módulos de domínio backend | `backend/analytics/*.js` — únicos módulos separados da rota |
| Banco | Supabase (Postgres), acessado com **service_role key** (bypassa RLS) |
| Auth | JWT em cookie `httpOnly`, bcrypt, `requireAuth`/`requireRole`/`requireSectionNominal` |
| Frontend | Sem framework — HTML/CSS/JS puro, sem build step, Chart.js/PapaParse/Lucide via CDN |
| Deploy | Vercel (`vercel.json`), toda rota → `backend/server.js` |
| Processo à parte | `agente-sgp/agente.js` — roda só no computador do batalhão, **fora** do deploy Vercel, sem git nesse ambiente |
| Testes | Nenhum automatizado. Sem CI/CD. |
| Migrations | Sem arquivo-fonte único — histórico vive parte no Supabase, parte em `.sql` soltos na raiz |

## Os 9 skills desta pasta

Carregue o skill específico do que você está fazendo — não precisa ler a Constituição inteira toda vez:

- `architecture/` — organização do projeto, separação de responsabilidades, dependências entre módulos, dívida técnica.
- `database/` — padrão de tabelas, PK/FK, migrations, RLS, prevenção de duplicidade, dado histórico.
- `security/` — autenticação, autorização, menor privilégio, RLS vs. autorização real, secrets.
- `backend/` — validação, erro, autorização, logs, serviços, transações.
- `frontend/` — componentes, formulários, filtros, loading/erro, fotos/avatares, tooltips.
- `business-rules/` — onde regra de negócio deve viver, duplicação P1/UIS conhecida.
- `testing/` — o que verificar antes de declarar algo pronto, dado zero de teste automatizado.
- `code-review/` — critérios de "concluído", checklist de revisão, o princípio fundamental abaixo.

## Princípio fundamental (não-negociável)

> **O agente que implementa uma funcionalidade NÃO possui autoridade para declarar sozinho que ela está concluída.**

A conclusão depende de verificação independente (outro agente/revisão, ou o usuário confirmando em uso real). Ver `code-review/SKILL.md`.

## Regras gerais para agentes de IA (resumo — detalhe completo em `code-review/SKILL.md`)

1. Não inventar requisitos — investigar ou perguntar quando ambíguo.
2. Declarar suposições explicitamente na resposta ao usuário, não só no código.
3. Analisar impacto antes de alteração estrutural (schema, contrato de API, remoção de campo/rota).
4. Não modificar arquivos não relacionados sem justificativa.
5. Não remover funcionalidade existente para simplificar, sem aprovação explícita.
6. Não ignorar erro pré-existente encontrado incidentalmente — reportar.
7. Preferir solução simples e consistente com o padrão já existente.
8. `agente-sgp/agente.js` exige entrega manual ao usuário — `git push` não o atualiza em produção.

## Fonte completa

Para o raciocínio completo, evidências, incidentes reais que motivaram cada regra e a lista de decisões pendentes do proprietário (`[A DEFINIR]`), ler `ERP_ENGINEERING_CONSTITUTION.md` na raiz do repositório.
