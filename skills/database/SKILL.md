---
name: database
description: Use ao criar/alterar tabela, migration, índice, constraint ou lógica de upload/sincronização no Supabase do dashboard/ERP 40º BPM/I. Cobre padrão de PK/FK, nomenclatura, prevenção de duplicidade, RLS real vs. autorização, e como não destruir dado histórico.
metadata:
  domain: erp-pm-40bpmi
  role: database
  scope: schema-and-data
  source: ERP_ENGINEERING_CONSTITUTION.md §5
  related-skills: erp-core, security, backend, business-rules
---

# Banco de Dados

Baseado no schema real (28 tabelas em `public`, projeto Supabase `lhdmqqmvpaeanblqiodr`). Verificar sempre via MCP (`mcp__supabase__list_tables`/`list_migrations`) antes de assumir estado — o schema muda com frequência.

## Chave primária

Padrão: `id bigint` com `nextval(...)` ou `identity generation ALWAYS`. Exceções deliberadas de chave natural: `fotos_pm.re`, `vagas_pm.opm`, `config_dashboard.chave`, `sgp_dp_sessao.id` (singleton, `CHECK id = 1`).

**Use `id bigint` autoincrement como padrão para tabela nova**, salvo chave natural já claramente única no domínio.

## Nomenclatura

`snake_case`, nomes em português (domínio de negócio em PT-BR). Exceção legada: `"Base de Dados RAC PM"` (nome com espaços/capitalização mista, exige aspas em toda query) — **não replicar esse padrão em tabela nova**.

## Foreign keys

**Não há nenhuma FK declarada em todo o schema atual.** Relações (ex: `efetivo_pm.re` ↔ `afastamentos_pm.re` ↔ `uis_restricoes.re` ↔ `ias_registros.re` ↔ `prod_cursos.re_pm`) são mantidas só por convenção de aplicação.

Isso é o estado atual, não necessariamente o ideal — `[A DEFINIR]` pelo proprietário se FK deve passar a ser reforçada em tabelas novas ligadas a `efetivo_pm`. Até essa decisão: **não adicionar FK isoladamente numa tabela sem avaliar o impacto no padrão delete+reinsert** — uma FK com `ON DELETE RESTRICT` quebra esse padrão.

## Prevenção de duplicidade

Via `UNIQUE CONSTRAINT` simples, **nunca índice único parcial** (`WHERE x IS NOT NULL`). Lição real: índice parcial quebra `ON CONFLICT`/`upsert` do `supabase-js`, porque o alvo do `ON CONFLICT` não pode ser parcial. `NULL` já não conflita com `NULL` numa constraint única normal do Postgres — não é preciso partir o índice para acomodar linhas com a chave nula. Referência de padrão correto: `prod_cursos.id_crs_pm`.

## Coluna discriminadora `origem`

Padrão estabelecido em `prod_cursos` e `uis_restricoes` (`'manual' | 'interno' | 'externo' | 'sgp'`) para fontes diferentes (upload manual vs. sincronização automática) coexistirem na mesma tabela sem se apagarem.

**Regra obrigatória:** qualquer rotina de "apagar e reinserir" só pode apagar linhas da própria origem (`WHERE origem = 'X'`), nunca a tabela inteira, quando mais de uma origem alimenta a mesma tabela.

## Migrations

Aplicadas via Supabase (rastreáveis com `mcp__supabase__list_migrations`), nome descritivo em snake_case (ex: `prod_cursos_id_crs_pm_unique_constraint`).

**Gap real:** nem toda migration tem `.sql` versionado no git — algumas foram aplicadas direto via MCP sem deixar rastro no repositório, e há scripts `.sql` soltos na raiz (`add_restricao_afastamentos_pm.sql`, `create_ias_registros.sql`, `create_sgp_dp_sessao.sql`, `create_sgp_sync_jobs.sql`) para execução manual, nem sempre sincronizados com o histórico real do banco.

**Regra:** toda alteração de schema deve ir por migration nomeada (MCP `apply_migration` ou script `.sql` datado) — nunca edição ad hoc sem registro. Mencionar o nome/intenção da migration no commit relacionado.

## RLS — não é a linha de defesa de autorização aqui

Habilitado em todas as 28 tabelas de `public`, mas **sem policy** na esmagadora maioria (confirmado via `get_advisors`) — exceto `usuarios`/`efetivo_pm`, que têm deny explícito. Backend e `agente-sgp` usam a **service_role key**, que **bypassa RLS por completo**.

**Regra:** nunca tratar "RLS habilitado" como evidência de dado protegido contra o próprio backend. A autorização real vive 100% em `server.js` (JWT + `requireRole`/`requireSectionNominal`) — ver `security/SKILL.md`. RLS aqui só protege contra vazamento de uma chave `anon`/`authenticated` (que hoje o frontend nunca usa).

## Dado histórico

Nunca sobrescrever de forma que destrua rastreabilidade de evento passado. Tabelas de histórico por natureza (`afastamentos_pm`, `uis_restricoes`, `prod_cursos`, `logs_acesso`) devem crescer, não ser truncadas globalmente. Exceção aceitável: apagar e reinserir o **mesmo escopo temporal/pessoal** que está sendo reenviado (ex: reimportar CSV do ano X substitui só o ano X) — nunca "apagar tudo para simplificar o insert".

## Incidentes reais que fundamentam essas regras

1. Reimportar a planilha de efetivo (rotina normal, não relacionada a SGP) zerava silenciosamente `possui_restricao`/`tipos_restricao`, porque o `INSERT` do delete+reinsert não incluía campos vindos de outra fonte. Corrigido lendo o valor atual antes de apagar e reaplicando no insert.
2. Automatizar sincronização de cursos via SGP-DP quase removeu o upload manual, assumindo cobertura 100% — estava errado (nem todo curso é acessível via SGP-DP). Daí nasceu o padrão `origem`.
3. Contagens de KPI (IAS vencido, restrição UIS) divergiam entre telas porque cada uma filtrava registro órfão (pessoa fora do efetivo) de forma diferente — corrigido centralizando o filtro de escopo no backend.

**Regra derivada:** antes de remover um caminho de entrada de dado (upload manual, rota antiga, campo legado) ao introduzir automação nova, confirmar explicitamente com o usuário que a automação cobre 100% dos casos — nunca presumir substituição total.
