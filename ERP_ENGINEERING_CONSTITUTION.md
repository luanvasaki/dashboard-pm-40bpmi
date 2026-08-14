# Constituição de Engenharia — Dashboard/ERP 40º BPM/I

**Status:** documento vivo. Baseado em inspeção direta do código, do schema do Supabase (via MCP) e do histórico real de bugs corrigidos neste projeto — não em suposições.
**Autoridade:** este documento tem precedência sobre preferências individuais de estilo de qualquer agente de IA que trabalhe neste repositório. Em caso de conflito com `CLAUDE.md`, o `CLAUDE.md` descreve *comandos e fatos operacionais*; esta Constituição descreve *princípios de decisão*. Os dois devem ser lidos juntos.

---

## 1. Objetivo

Este documento estabelece os princípios técnicos, de segurança e de processo que qualquer agente de IA (ou humano) deve seguir ao alterar este sistema. Ele não substitui o julgamento técnico — mas define os limites dentro dos quais esse julgamento deve operar.

O sistema administra dados reais de um batalhão da Polícia Militar: dados pessoais e funcionais de policiais (efetivo, saúde, restrições médicas, afastamentos), estatística criminal, produtividade operacional e controle de acesso por papel/seção. Erros aqui não são cosméticos — já causaram, na prática, perda silenciosa de dados de restrição médica de PMs (dois incidentes reais documentados abaixo) e exposição indevida de tela por falha de checagem de acesso.

---

## 2. Contexto do ERP

- **Domínio:** gestão administrativa de um batalhão da PM-SP (40º BPM/I) — efetivo (P1), inteligência/criminalidade (P3), indicadores de qualidade, produtividade operacional, UIS (restrições médicas codificadas por BG PM 166/2006) e IAS (Inspeção Anual de Saúde).
- **Usuários:** policiais militares com papéis diferentes (administração de efetivo, comando, seções técnicas, visualização restrita).
- **Dado sensível envolvido:** identificação pessoal (nome, RE, foto, endereço residencial), condição de saúde/restrição médica, histórico funcional. Isso classifica partes do sistema como dado sensível de RH/saúde, não apenas estatística agregada — **[A DEFINIR pelo proprietário]** se há exigência formal de tratamento (LGPD/normas internas da corporação) além do que já está implementado.
- **Múltiplos consumidores dos mesmos dados de origem:** dados de efetivo/restrição/curso alimentam simultaneamente o P1 (assentamento individual), a UIS e o P3 — mudanças em uma fonte têm efeito em cascata em telas que não são óbvias à primeira vista (já causou bugs reais, ver §11).

---

## 3. Stack identificada

Levantada por inspeção direta (`package.json`, estrutura de pastas, `server.js`, schema Supabase via MCP) — não é suposição.

| Camada | Tecnologia | Evidência |
|---|---|---|
| Backend | Node.js + Express, **arquivo único** `backend/server.js` (~118 KB / milhares de linhas) | `backend/package.json`, ausência de estrutura `routes/`/`controllers/` |
| Módulos auxiliares de backend | `backend/analytics/*.js` (6 módulos: `crimePressureIndex`, `trendAnalysis`, `priorityScore`, `cityRanking`, `targetDeviation`, `insightGenerator`) — única pasta de "domínio" separada da rota | `require('./analytics/...')` em `server.js` |
| Banco de dados | Supabase (Postgres gerenciado) | `SUPABASE_URL`/`SUPABASE_KEY` |
| Acesso ao banco | `@supabase/supabase-js` com **service_role key** (bypassa RLS) — tanto no backend quanto no agente standalone | `server.js:216-222`, `agente-sgp/agente.js` |
| Cache | Cache em memória no processo do backend (`let cache = {data:[], ...}`), TTL 5 min, sincronizado de `Base de Dados RAC PM` | `server.js:212,254` |
| Autenticação | JWT (`jsonwebtoken`) em cookie `httpOnly` `auth_token` (fallback: header `Authorization: Bearer`), senha com `bcryptjs` | `server.js:134-146` |
| Frontend | **Sem framework** — HTML/CSS/JS puro, sem build step, servido via `express.static` | `frontend/`, `CLAUDE.md` |
| Bibliotecas de frontend | Chart.js, PapaParse, Lucide Icons — via CDN | referenciadas em `index.html` |
| Módulos de frontend | Arquivos JS por domínio: `p1.js` (223 KB), `p3.js` (228 KB), `uis.js` (75 KB), `kpi.js`, `filters.js`, `modal-crime.js`, `users.js`, `upload.js`, `nav.js`, `intel.js`, `auth.js`, `utils.js`, `init.js` | `frontend/js/*` |
| Deploy | Vercel, região `gru1`, toda rota roteada para `backend/server.js` | `vercel.json` |
| Segurança HTTP | `helmet` (sem CSP — desativado para permitir CDNs), `cors` (origem restrita via `ALLOWED_ORIGIN` em produção), `compression`, `express-rate-limit` (só em `/api/auth/login`) | `server.js:225-244` |
| Integração externa 1 | WSSCPM (SOAP, HTTP puro, sem login) — efetivo, fotos, afastamentos | `agente-sgp/agente.js` |
| Integração externa 2 | SGP-DP (REST/JSON, requer sessão colada manualmente — HttpOnly, não scriptável) — IAS, cursos, restrição médica detalhada, dados pessoais | `agente-sgp/agente.js` |
| Processo standalone | `agente-sgp/agente.js` — roda **só no computador do batalhão**, fora do deploy Vercel, sem git instalado nesse computador | `CLAUDE.md`, memória do projeto |
| Migrations | **Não há arquivos de migration versionados no formato padrão.** Há um histórico de migrations no próprio Supabase (rastreável via MCP `list_migrations`) e alguns scripts `.sql` soltos na raiz do repo (`add_restricao_afastamentos_pm.sql`, `create_ias_registros.sql`, `create_sgp_dp_sessao.sql`, `create_sgp_sync_jobs.sql`) para execução manual — **inconsistente como fonte única de verdade** (ver §5 e §14). | inspeção da raiz + `mcp__supabase__list_migrations` |
| Testes automatizados | **Nenhum encontrado.** Sem framework de teste, sem `.github/workflows`, sem CI/CD. | busca por `*test*`, ausência de `.github/` |

---

## 4. Princípios arquiteturais

1. **Monólito consciente, não acidental.** O backend é um arquivo único por decisão histórica, não por ignorância — mas isso tem custo real: `server.js` já passa de 100 KB. **Regra:** ao adicionar uma rota nova de um domínio que já tem 3+ rotas relacionadas (ex: mais uma rota de "cursos"), agrupar fisicamente perto das rotas irmãs existentes, comentando a seção como já é feito hoje (`// ═══ ... ═══`). Não é necessário quebrar em múltiplos arquivos sem alinhar antes com o proprietário — mas se a extração de um módulo (ex: `routes/p1.js`) for proposta, ela deve preservar 100% do comportamento existente e ser feita como um commit isolado, nunca misturada com uma mudança de funcionalidade.
2. **`agente-sgp/agente.js` é uma zona arquitetural à parte.** Não faz parte do deploy Vercel, não é atualizado por git no computador onde roda, e é o único componente que fala com os sistemas internos da PM (WSSCPM/SGP-DP). Qualquer alteração nele exige lembrar o usuário de que a atualização precisa ser transferida manualmente e o processo reiniciado — um `git push` sozinho **não** propaga a mudança para produção real desse componente.
3. **Reutilização de código no frontend é por convenção, não por import.** Não há bundler; funções compartilhadas (`p1AvatarSVG`, `authFetch`, `escHtml` etc.) vivem em arquivos carregados via `<script>` em ordem específica no `index.html`. **Regra:** ao introduzir uma função utilitária nova, verificar primeiro se algo equivalente já existe em `utils.js`/`auth.js`/no arquivo de domínio mais próximo antes de duplicar — duplicação de lógica de negócio entre `p1.js` e `uis.js` já causou pelo menos dois bugs reais de dados divergentes (ver §11).
4. **Padrão de sincronização "delete + reinsert" é o padrão dominante**, não upsert incremental — usado em uploads de CSV (efetivo, afastamentos legado, quadro, produtividade, UIS) e nas sincronizações completas do agente SGP. Exceções deliberadas: `prod_cursos` (upsert por `id_crs_pm`) e `ias_registros` (upsert por RE), porque nesses casos o histórico completo por evento não é o que se quer preservar por linha. **Regra:** ao implementar uma nova sincronização, decidir explicitamente entre "delete+reinsert por chave de escopo" (ano, RE, etc.) vs "upsert por chave natural" — e documentar a escolha, porque ela tem implicação direta em §7 (histórico).
5. **Dívida técnica identificada deve ser registrada, não silenciada.** Se um agente encontrar um bug pré-existente fora do escopo da tarefa atual, ele deve reportá-lo ao usuário — não corrigi-lo sem pedir (pode ter efeito colateral não previsto) e não ignorá-lo silenciosamente.

---

## 5. Banco de dados

Baseado no schema real (28 tabelas em `public`, levantado via MCP Supabase em 2026-08).

### Padrões observados (a manter)
- **Chave primária:** predominantemente `id bigint` com `nextval(...)` ou `identity generation ALWAYS`. Exceções deliberadas de chave natural: `fotos_pm.re` (texto, RE do PM), `vagas_pm.opm`, `config_dashboard.chave`, `sgp_dp_sessao.id` (singleton, `CHECK id = 1`). Usar `id bigint` autoincrement como padrão para tabela nova, salvo caso claro de chave natural já única no domínio.
- **Nomenclatura:** `snake_case`, nomes de colunas e tabelas em português (domínio de negócio em PT-BR), exceto a tabela legada `"Base de Dados RAC PM"` (nome com espaços e capitalização mista — **não replicar esse padrão em tabelas novas**, é dívida histórica, precisa de aspas em toda query SQL).
- **Foreign keys:** **não há nenhuma FK declarada em todo o schema atual.** Relações (ex: `efetivo_pm.re` ↔ `afastamentos_pm.re` ↔ `uis_restricoes.re` ↔ `ias_registros.re` ↔ `prod_cursos.re_pm`) são mantidas por convenção de aplicação, não pelo banco. **Isso é uma decisão implícita já em vigor, não necessariamente a ideal** — `[A DEFINIR]`: se o proprietário quer que integridade referencial passe a ser reforçada por FK em tabelas novas relacionadas a `efetivo_pm`. Até essa decisão, agentes não devem adicionar FK isoladamente numa tabela sem avaliar o impacto nas rotinas de delete+reinsert (uma FK com `ON DELETE RESTRICT` quebraria o padrão dominante do §4.4).
- **Prevenção de duplicidade:** via `UNIQUE CONSTRAINT` simples (não índice parcial) — lição real documentada: um índice único parcial (`WHERE x IS NOT NULL`) quebra `ON CONFLICT`/`upsert` do `supabase-js`, porque o alvo do `ON CONFLICT` não pode ser parcial. `NULL` já não conflita nativamente com `NULL` numa constraint única do Postgres — não é necessário partir o índice para acomodar linhas com a chave nula. Ver `prod_cursos.id_crs_pm` como referência do padrão correto.
- **Coluna discriminadora `origem`:** padrão estabelecido em `prod_cursos` e `uis_restricoes` (`'manual' | 'interno' | 'externo' | 'sgp'`) para permitir que dados de fontes diferentes (upload manual vs. sincronização automática) coexistam na mesma tabela sem se apagarem mutuamente. **Regra obrigatória:** qualquer rotina de "apagar e reinserir" só pode apagar linhas da própria origem (`WHERE origem = 'X'`), nunca a tabela inteira, quando mais de uma origem alimenta a mesma tabela.
- **Migrations:** aplicadas via Supabase (rastreáveis com `mcp__supabase__list_migrations`), nome descritivo em snake_case (ex: `prod_cursos_id_crs_pm_unique_constraint`). **Gap real:** nem toda migration tem um arquivo `.sql` correspondente versionado no git — algumas foram aplicadas diretamente via MCP sem deixar rastro no repositório. **Regra daqui para frente:** toda alteração de schema deve ser aplicada via migration nomeada (MCP `apply_migration` ou script `.sql` datado), nunca via edição manual ad hoc no SQL Editor sem registro — e o nome/intenção da migration deve ser mencionado no commit relacionado do código que a usa.
- **RLS (Row Level Security):** habilitado em **todas** as 28 tabelas de `public`, mas **sem nenhuma policy** na esmagadora maioria delas (confirmado via `get_advisors`) — exceto `usuarios` e `efetivo_pm`, que têm policy explícita de *deny* (migration `explicit_deny_policies_usuarios_efetivo_pm`). **Isso significa, na prática:** RLS aqui funciona como uma rede de segurança "deny-by-default" contra uma eventual chave `anon`/`authenticated` vazada — mas **não é o mecanismo de autorização do sistema**. A autorização real é 100% da responsabilidade do backend (`server.js`, via JWT + `requireRole`/`requireSectionNominal`), porque tanto o backend quanto `agente-sgp/agente.js` usam a **service_role key**, que **bypassa RLS por completo**. **Regra:** nunca tratar "RLS está habilitado" como evidência de que os dados estão protegidos contra o próprio backend — RLS aqui protege só contra vazamento da chave errada, não contra lógica de autorização ausente numa rota.
- **Dados históricos:** nunca sobrescrever de forma que destrua rastreabilidade de eventos passados. Tabelas de histórico por natureza (`afastamentos_pm`, `uis_restricoes`, `prod_cursos`, `logs_acesso`) devem crescer, não ser truncadas globalmente — a exceção aceitável é "apagar e reinserir o **mesmo escopo temporal/pessoal** que está sendo re-enviado" (ex: reimportar o CSV do ano X substitui só o ano X), nunca "apagar tudo para simplificar a lógica de insert".

---

## 6. Segurança

### Autenticação
- JWT assinado com `JWT_SECRET` (validado obrigatório no boot — processo aborta se ausente), entregue em cookie `httpOnly` (não acessível via `document.cookie`, mitiga XSS de roubo de token), `Secure` ativado quando `NODE_ENV=production`. Fallback via header `Authorization: Bearer` existe mas o padrão do frontend é sempre cookie.
- Senha: `bcrypt` (hash, nunca texto puro), mínimo 6 caracteres reforçado no backend (`server.js:431`) — **não confiar em validação client-side isolada** para isso.
- Rate limiting de login: 20 tentativas / 15 min, por IP (depende de `trust proxy` configurado corretamente para Vercel — se isso quebrar, o limite vira efetivamente global e pode negar serviço a usuários legítimos; testar após qualquer mudança de infraestrutura de proxy).

### Autorização
- Modelo em duas camadas: **role global** (`admin`, `p3`, `p1`, `ti`, `viewer`, `comandante`, `comandante_cia`) + **`secoes_acesso` granular** (JSONB por seção, ex: `{"uis": "nominal"}`), com níveis `viewer`(só números)/`nominal`/`editor`.
- `ti` é tratado como equivalente a `admin` na maioria das rotas (`requireRole` deixa passar sempre) — **exceto** exclusões/alterações consideradas críticas (conta `admin` é protegida contra edição/exclusão por qualquer role, inclusive `admin`).
- **Regra obrigatória e não-negociável:** uma tela ou botão escondido no frontend **nunca** é, sozinho, controle de acesso suficiente. Toda rota de API que expõe dado nominal, sensível ou destrutivo deve ter seu próprio `requireAuth` + `requireRole(...)`/`requireSectionNominal(...)` no backend, independentemente do que o frontend mostra ou esconde. **Isso já falhou na prática duas vezes neste projeto**: (1) `_checkSectionAccess` do frontend esqueceu o nível "nominal" do P1, permitindo acesso indevido só porque a tela não escondia o link; (2) `/api/uis/mapa` e `/api/ias/mapa` exigiam role clássico sem checar `secoes_acesso`, causando 403 pra usuário legítimo "Só números" — o oposto do problema, mas evidência do mesmo padrão de checagem hardcoded desatualizada. **Todo agente que adicionar um nível de acesso novo deve auditar TODAS as rotas da seção afetada, não só a rota que motivou a mudança.**
- Ao adicionar uma seção/nível de acesso novo, replicar o padrão existente (`requireSectionNominal` em `server.js` + `xSomenteQuantitativo()` no frontend correspondente), não inventar um mecanismo paralelo.

### RLS e acesso direto ao banco
- Ver §5. RLS não é a linha de defesa primária aqui — é a autorização do backend. Se algum componente novo vier a usar a chave `anon`/`authenticated` do Supabase diretamente do frontend (hoje isso **não acontece** — confirmado, frontend nunca importa `@supabase/supabase-js` nem fala com Supabase diretamente, só via API própria), aí sim as policies de RLS passam a ser a linha de defesa real e precisam ser escritas com o mesmo rigor do `requireRole` do backend.

### Validação de entrada
- Padrão atual: validação manual por rota (`if (!campo) return res.status(400)...`), sem schema validation library (ex: zod/joi não estão presentes). Uploads em lote usam mapeamento case-insensitive de colunas (`gf`/`get` helper) com filtragem de linhas inválidas antes do insert. **Regra:** manter esse padrão de "validar e rejeitar cedo, com mensagem de erro específica" ao adicionar rota nova — não deixar o Postgres ser a única linha de validação (erros de constraint viram HTTP 500 genérico hoje, ver abaixo).

### Exposição de dados sensíveis
- **Gap real identificado:** vários `catch` retornam `err.message` diretamente ao cliente (`res.status(500).json({error: err.message})`), o que pode vazar detalhes internos (nome de coluna, mensagem do driver Postgres) para o frontend. Não é uma vulnerabilidade crítica isolada (o sistema já exige autenticação antes de qualquer rota de dado), mas é uma prática a não expandir. **Regra daqui para frente:** para rotas novas, preferir mensagens de erro genéricas ao cliente e `console.error` com o detalhe completo no servidor — não é necessário refatorar retroativamente todo `server.js` só por isso.
- Dados de saúde (restrição médica, IAS) e dados pessoais sensíveis (endereço residencial, data de nascimento) já recebem tratamento consciente de minimização: o agente SGP explicitamente **não** grava campos como religião, estado civil, naturalidade mesmo quando disponíveis na fonte (decisão documentada na integração SGP-DP). **Manter esse princípio de minimização** ao integrar novas fontes de dado pessoal — só persistir o que tem uso real no dashboard.

### Secrets e variáveis de ambiente
- `.env` nunca commitado (`.gitignore` correto), `.env.example` documenta as chaves obrigatórias sem valores reais.
- `SUPABASE_KEY` **deve ser a service_role key**, não a anon/publishable — isso já é documentado explicitamente no `.env.example` e no `CLAUDE.md`, mas é um ponto de risco alto se alguém trocar por engano: a service_role key nunca deve ser exposta ao frontend sob nenhuma circunstância (ela bypassa RLS por completo).
- `JWT_SECRET` e `SUPABASE_URL`/`SUPABASE_KEY` são validados no boot com `process.exit(1)` se ausentes — **manter esse padrão fail-fast** para qualquer nova variável de ambiente crítica, em vez de deixar o processo subir num estado inconsistente.

---

## 7. Regras de negócio

**Princípio central:** toda regra de negócio importante deve viver numa camada que não dependa exclusivamente da interface — hoje isso significa **o backend** (`server.js`/`analytics/*.js`) para regras que afetam integridade de dado ou autorização, e o frontend só deve conter lógica de **apresentação** derivada de dados já corretos vindos da API.

Isso hoje **não é 100% verdade na prática** — é um alvo, não um estado atual:
- Cálculos de KPI, deduplicação de restrição, ordenação por antiguidade e determinação de "afastado hoje" vivem hoje no **frontend** (`p1.js`), não no backend. Isso já causou divergência real entre o KPI de "IAS vencido" do P1 e da UIS (contavam registros órfãos de forma diferente) e entre contagens de restrição — corrigidas retroativamente centralizando a lógica de escopo (`reAtivosSet()`) no backend.
- **Regra para novas features:** sempre que uma regra de negócio precisar ser calculada em mais de uma tela (P1 e UIS já mostraram esse padrão), calculá-la **uma vez no backend** e expor via API, em vez de reimplementar a mesma lógica em dois arquivos de frontend. Se a regra já existe duplicada em dois lugares por herança histórica, um agente que for mexer em uma delas deve pelo menos declarar explicitamente ao usuário que a duplicata existe e não foi tocada — nunca presumir que corrigir uma corrige a outra.
- Nenhuma regra de autorização (quem pode ver o quê) deve depender só do frontend — ver §6.

---

## 8. Frontend

Padrões observados (a manter em código novo):

- **Componentes:** sem framework — "componente" aqui é uma função JS que retorna uma string HTML (template literal) e é injetada via `innerHTML`. Seguir esse padrão; não introduzir uma lib de componentização (React/Vue/etc.) sem decisão explícita do proprietário — mudaria a stack inteira.
- **Formulários:** validação client-side existe mas nunca é a única camada (backend sempre revalida).
- **Tabelas/listas grandes:** paginação de fato não é o padrão — o padrão é carregar tudo do cache/API e filtrar em memória no cliente (compatível com a escala atual, ~350 PMs / milhares de ocorrências). Se o volume crescer muito, isso precisa ser revisto — `[A DEFINIR]` critério de quando migrar para paginação real.
- **Filtros:** busca com highlight de termo (`p1SearchInput`), datalist pesquisável (`<input list>` + `<datalist>`) para seleção com muitas opções — padrão recém-estabelecido, preferir a ele em vez de `<select>` puro quando a lista tiver dezenas+ de itens.
- **Fotos/avatares:** padrão `data-foto-re="<re>"` + carregamento em lote sob demanda (`p1LoadFotosVisiveis()`, busca só o que está visível na tela) — nunca embutir a foto diretamente no HTML de uma lista grande (custo de payload); sempre usar o padrão lazy de lote existente.
- **Loading/empty/erro:** **sem padrão único e consistente identificado** — `[A DEFINIR]`: vale a pena um agente propor um padrão único de loading/empty state antes de continuar espalhando variações ad hoc?
- **Confirmações:** ações destrutivas (exclusão de usuário, reset de senha) já pedem confirmação no frontend hoje — manter esse padrão para toda ação irreversível nova, e sempre revalidar no backend também (nunca confiar só no `confirm()` do navegador).
- **Tooltips:** preferir tooltip customizado via CSS (`.restr-tt`/`.restr-tt-wrap`) em vez do atributo `title` nativo quando a informação for importante — o `title` nativo tem delay de hover que faz a informação passar despercebida (achado real desta sessão).
- **Responsividade/acessibilidade:** **não há evidência de tratamento sistemático** (sem media queries abrangentes revisadas, sem atributos ARIA identificados em varredura). `[A DEFINIR]` se isso é um requisito ativo do proprietário — o uso real hoje parece ser desktop (estação de trabalho do batalhão).
- **Feedback ao usuário:** mensagens de erro da API (`{error: "..."}`) devem ser exibidas de forma legível ao usuário, não só logadas no console — mas não há um helper central de toast/alerta identificado; `[A DEFINIR]` se vale padronizar isso.

---

## 9. Backend

- **Validação:** manual, por rota, cedo (fail fast com `400`) — manter.
- **Tratamento de erros:** `try/catch` por rota, `console.error` no servidor + resposta JSON `{error: mensagem}` ao cliente. Ver §6 sobre não vazar detalhe interno em rota nova.
- **Autorização:** sempre via middleware (`requireAuth`, depois `requireRole(...)`/`requireSectionNominal(...)`), nunca checagem de role inline dentro do handler como primeira linha de defesa — os middlewares existem exatamente para centralizar isso.
- **Respostas:** JSON puro, sem envelope padronizado (`{data: ...}` vs. retorno direto do array/objeto varia por rota) — **inconsistência real existente**, não introduzir um terceiro formato; se um agente notar isso ao mexer numa rota, seguir o formato que a rota já usava antes.
- **Logs:** `console.log`/`console.error` para operacional; `logs_acesso` (tabela, via `logAcesso()`, fire-and-forget — nunca bloqueia a resposta) para auditoria de: login/logout (sucesso e falha), toda operação administrativa sobre usuários, todo upload de dado (RAC, InfoCrim, efetivo, quadro, produtividade, PVS, indicadores P3, UIS, cursos), pedidos de sincronização SGP e atualização de sessão SGP-DP. **Regra:** toda rota nova que (a) altera dado em lote, (b) altera permissão/role de usuário, ou (c) é uma ação administrativa sensível deve chamar `logAcesso()` seguindo o mesmo padrão — é fire-and-forget, não deve nunca bloquear nem falhar a resposta principal.
- **Serviços:** a única separação real de "camada de serviço" hoje são os módulos de `backend/analytics/` — cálculos puros, sem acesso a banco, recebendo dados já carregados. Preferir esse padrão (função pura, testável, sem I/O) para lógica de cálculo nova, em vez de misturar cálculo com a query dentro do handler da rota.
- **Transações:** **não identificado uso de transação Postgres explícita** (`BEGIN`/`COMMIT`) em nenhum lugar — operações multi-tabela (ex: sincronizar restrição em `efetivo_pm` + `uis_restricoes`) são feitas como múltiplas chamadas sequenciais separadas via `supabase-js`, sem atomicidade garantida entre elas. **Isso é uma lacuna real:** se a segunda chamada falhar, a primeira já foi commitada, deixando o estado inconsistente. `[A DEFINIR]` se vale a pena introduzir transações (via `rpc`/função Postgres) para os fluxos mais críticos, ou se o risco atual é aceitável dado o volume/frequência de uso.

---

## 10. Testes

**Estado atual: não há testes automatizados no repositório.** A verificação de mudanças, na prática, tem sido feita por:
- Scripts Node isolados e descartáveis para validar lógica (regex, parsing, ordenação) contra dados reais antes de aplicar a mudança em produção.
- Consulta direta ao banco via MCP do Supabase para confirmar causa raiz e validar resultado pós-fix.
- Testes visuais manuais no navegador (screenshot/inspeção DOM) para mudanças de UI.
- O próprio usuário testando em produção real e reportando resultado.

Isso **funcionou até aqui**, mas não escala e não protege contra regressão silenciosa. Estabelecendo o padrão daqui para frente, sem impor uma migração retroativa completa:

- Para qualquer funcionalidade nova ou corrigida que envolva **regra de negócio não-trivial** (cálculo, parsing, ordenação, deduplicação), considerar:
  1. **Caminho feliz** — o caso comum funciona com dado real.
  2. **Entradas inválidas** — campo ausente, nulo, formato inesperado (datas, RE sem dígito verificador, acentuação NFD vs NFC — já foi causa real de bug).
  3. **Casos extremos** — lista vazia, registro órfão (pessoa que saiu do efetivo mas tem dado residual em outra tabela — já foi causa real de 2 bugs de contagem divergente).
  4. **Permissões** — a rota nova respeita todos os níveis de `role`/`secoes_acesso` relevantes, não só o caminho do usuário que pediu a feature.
  5. **Segurança** — a rota rejeita corretamente usuário não autenticado e usuário sem permissão, mesmo que o frontend nunca mostre o botão pra esse usuário.
  6. **Regressão** — a mudança não quebra o comportamento de tela(s) irmã(s) que dependem do mesmo dado (ver §7 sobre duplicação P1/UIS).
- `[A DEFINIR]`: se o proprietário quer introduzir formalmente um framework de teste automatizado (ex: `vitest`/`jest` para os módulos de `analytics/` e para lógica pura extraída do frontend) — hoje isso é zero, e seria a mudança de maior alavancagem em qualidade se priorizada.

---

## 11. Auditoria

- **Auditoria de acesso/ação administrativa:** tabela `logs_acesso`, cobertura descrita em §9. RLS habilitada, sem policy própria além do deny-by-default geral.
- **Auditoria de dado histórico funcional:** não existe uma tabela de "audit log" genérica por linha alterada (sem trigger de `before update` gravando versão anterior). O que existe é histórico por natureza do domínio: `afastamentos_pm`/`uis_restricoes`/`prod_cursos` acumulam registros ao longo do tempo em vez de manter só o "estado atual" — isso **é** a estratégia de auditoria de domínio deste sistema, mesmo sem ser chamada assim explicitamente.
- **Incidentes reais que motivam as regras de história/auditoria deste documento** (não hipotéticos — já aconteceram neste projeto):
  1. Reimportar a planilha de efetivo (rotina normal do P1, não relacionada a SGP) **zerava silenciosamente** `possui_restricao`/`tipos_restricao` de todo o efetivo, porque o `INSERT` do delete+reinsert não incluía esses campos vindos de outra fonte (SGP). Corrigido lendo o valor atual antes de apagar e reaplicando no insert.
  2. Ao automatizar sincronização de cursos via SGP-DP, o upload manual de cursos foi removido assumindo cobertura 100% pela automação — **estava errado**: nem todo curso está acessível via SGP-DP. Restaurado, e daí nasceu o padrão de coluna `origem` (§5) para as duas fontes coexistirem sem se destruir.
  3. Contagens de KPI (IAS vencido, restrição UIS) divergiam entre P1 e UIS porque cada tela filtrava registros órfãos (pessoa que saiu do efetivo) de forma diferente — corrigido centralizando o filtro de escopo no backend.
  - **Regra derivada, obrigatória:** antes de qualquer agente **remover** um caminho de entrada de dado (upload manual, rota antiga, campo legado) ao introduzir uma automação nova, ele deve **confirmar explicitamente com o usuário** que a automação cobre 100% dos casos que o caminho antigo cobria — nunca presumir substituição total.
- **Nenhuma informação histórica deve ser sobrescrita de forma destrutiva** quando isso apaga rastreabilidade necessária — ver critério de "mesmo escopo" em §5.

---

## 12. Regras para agentes de IA

Estas regras são vinculantes para qualquer agente (ou sessão) de IA que trabalhe neste repositório:

1. **Não inventar requisitos.** Se o pedido do usuário for ambíguo sobre um comportamento (ex: "corrige a busca" sem dizer qual busca), perguntar ou investigar o código antes de assumir — não preencher a lacuna com a opção mais fácil de implementar.
2. **Identificar ambiguidades explicitamente**, em vez de escolher silenciosamente uma interpretação e seguir.
3. **Declarar suposições.** Se uma decisão foi tomada sem confirmação explícita do usuário (ex: "assumi que restrição vencida ainda conta como ativa até nova avaliação"), isso deve aparecer na resposta ao usuário, não só no código.
4. **Analisar impacto antes de alteração estrutural** (schema, contrato de API, remoção de rota/campo) — checar quem mais consome aquele dado (grep no frontend inteiro, não só na tela que motivou a mudança). Ver incidentes reais em §11.
5. **Não modificar arquivos não relacionados sem justificativa** — um commit de bugfix não deve reformatar ou "limpar" código adjacente não tocado pela tarefa.
6. **Não remover funcionalidade existente para simplificar uma implementação** sem aprovação explícita — inclui não remover uploads manuais, campos legados ou rotas antigas "porque parecem redundantes" (ver incidente §11.2).
7. **Não ignorar erro pré-existente encontrado incidentalmente** — reportar ao usuário, mesmo fora do escopo da tarefa atual, em vez de silenciar.
8. **Preferir solução simples e consistente com o padrão já existente** à complexidade nova — antes de introduzir um padrão diferente (ex: uma nova forma de fazer upload, um novo formato de resposta de API), verificar como os casos análogos já existentes fazem e seguir o mesmo caminho, salvo razão explícita para divergir.
9. **Respeitar padrões já existentes antes de introduzir novos** — isso inclui nomenclatura em português, `snake_case` no banco, o padrão `data-foto-re`, o padrão de coluna `origem`, o padrão delete+reinsert por escopo, os middlewares de auth existentes. Não introduzir uma segunda convenção paralela para o mesmo problema.
10. **`agente-sgp/agente.js` exige tratamento especial**: qualquer edição nesse arquivo precisa ser entregue ao usuário para transferência manual (o ambiente de execução real não roda `git pull`) — nunca assumir que um `git push` colocou a mudança em produção para esse componente específico.
11. **Toda alteração de schema deve ir por migration nomeada**, nunca por edição ad hoc sem rastro (ver §5).
12. **Validar antes de entregar**: para mudança de lógica não-trivial, preferir validar contra dado real (script isolado, consulta SQL de confirmação, teste visual) antes de declarar a correção pronta — é o padrão que já vem sendo seguido com sucesso neste projeto e deve continuar.

---

## 13. Critérios de qualidade

Nenhuma funcionalidade deve ser considerada concluída apenas porque "funciona" no caminho feliz observado uma vez. Uma funcionalidade só pode ser considerada concluída quando:

1. Atende aos requisitos reais pedidos (não a uma versão simplificada/reinterpretada deles).
2. Atende a critérios de aceite explícitos, quando existirem — e se não existirem, os critérios implícitos foram confirmados com o usuário antes de declarar pronto.
3. Não viola os princípios arquiteturais desta Constituição (§4, §5, §6).
4. Não introduz vulnerabilidade conhecida (autorização ausente numa rota nova, dado sensível vazado em mensagem de erro, secret exposto, etc.).
5. Não quebra funcionalidade existente — em particular, não quebra a(s) tela(s) irmã(s) que compartilham o mesmo dado (P1/UIS/P3 frequentemente compartilham fonte).
6. Possui tratamento adequado de erro (não deixa a UI travada ou o backend retornando 500 cru para caso previsível).
7. Possui verificação proporcional ao risco (§10) — não exige suíte de teste automatizada completa nesta fase do projeto, mas exige pelo menos uma validação deliberada contra dado real antes de declarar pronto.
8. **Passa por auditoria independente** — ver §14, princípio fundamental.

### Princípio fundamental (não-negociável)

> **O agente que implementa uma funcionalidade NÃO possui autoridade para declarar sozinho que ela está concluída.**

A conclusão de uma funcionalidade depende de uma verificação independente — seja por outro agente/revisão dedicada, seja pelo usuário confirmando o resultado em uso real. Um agente pode (e deve) reportar "implementei e validei X, Y, Z" com evidência concreta do que validou — mas a palavra final de "está pronto para produção" não é dele.

---

## 14. Decisões ainda pendentes — `[A DEFINIR]` pelo proprietário

Pontos identificados durante esta análise que dependem de decisão do dono do sistema, não de engenharia:

1. **Tratamento formal de dado sensível (LGPD/normas internas):** o sistema já pratica minimização (não grava religião/estado civil vindos do SGP-DP), mas não há política formal documentada. Vale formalizar?
2. **Migrations como fonte única de verdade:** hoje o histórico real de schema vive parte no Supabase (via MCP), parte em scripts `.sql` soltos na raiz, nem sempre sincronizados. Vale adotar um único fluxo (ex: sempre `.sql` versionado + `apply_migration`, nunca só um dos dois)?
3. **Foreign keys:** o schema atual não tem nenhuma. Vale começar a introduzir FK em relações centrais (`efetivo_pm.re` como referência) para tabelas novas, aceitando o custo de ajustar o padrão delete+reinsert onde necessário?
4. **Transações multi-tabela:** operações que escrevem em mais de uma tabela (ex: sincronizar restrição) não são atômicas hoje. Vale o investimento de introduzir transação via função Postgres para os fluxos mais críticos?
5. **Teste automatizado:** zero hoje. Vale priorizar um framework mínimo (ex: cobrindo só `backend/analytics/*` e lógica pura de cálculo) como próximo investimento de qualidade?
6. **Padrão único de loading/empty/erro no frontend:** hoje é ad hoc por tela. Vale um agente propor e aplicar um padrão único?
7. **Responsividade/acessibilidade:** o uso real parece ser só desktop (estação do batalhão). Isso é uma restrição aceita permanentemente, ou é um requisito futuro?
8. **Camada de "regra de negócio" centralizada:** hoje regras de cálculo estão espalhadas entre backend e múltiplos arquivos de frontend (com duplicação real já causando bugs). Vale um esforço deliberado de migrar cálculo compartilhado para o backend, mesmo sem uma tarefa de feature que force isso?
9. **Mensagens de erro expostas ao cliente:** hoje `err.message` cru às vezes chega ao frontend. Vale padronizar para mensagem genérica + log detalhado só no servidor, de forma retroativa, ou só aplicar o padrão daqui para frente?

---

## Resumo executivo (para o proprietário)

**Principais regras estabelecidas:**
- RLS do Supabase **não é** a linha de defesa de autorização deste sistema — é o backend (JWT + roles + `secoes_acesso`), porque tanto o backend quanto o agente SGP usam a service_role key. Nenhuma tela escondida no frontend conta como controle de acesso.
- Todo dado histórico (afastamento, restrição, curso) deve crescer, nunca ser truncado globalmente — o padrão de coluna `origem` existe justamente para isso, e deve ser replicado sempre que uma automação nova coexistir com um caminho manual.
- Nenhuma automação deve remover um caminho manual de entrada de dado sem confirmação explícita de cobertura 100% — já causou dois incidentes reais.
- Regra de negócio compartilhada entre telas (P1/UIS/P3) deve ser calculada uma vez no backend, não duplicada — duplicação já causou divergência real de KPI.
- Nenhum agente de IA pode declarar sozinho uma funcionalidade "pronta" — exige verificação independente.
- `agente-sgp/agente.js` é uma zona de deploy manual à parte — nunca assumir que `git push` o atualiza em produção.

**Pontos críticos que precisam de decisão do proprietário (§14):** ausência total de foreign keys e de transações multi-tabela, ausência de testes automatizados, inconsistência de onde migrations "de verdade" vivem, e mensagens de erro internas às vezes vazando para o cliente. Nenhum desses é uma vulnerabilidade explorável hoje por si só (o sistema exige autenticação antes de qualquer rota sensível), mas são os quatro pontos onde uma decisão explícita de investimento traria mais redução de risco por esforço.
