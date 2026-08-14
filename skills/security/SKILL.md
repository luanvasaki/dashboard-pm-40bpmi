---
name: security
description: Use ao mexer em autenticação, autorização, rotas novas, roles, secoes_acesso, secrets, ou qualquer dado sensível (saúde, restrição médica, dados pessoais) no dashboard/ERP 40º BPM/I. Regra central — interface escondida nunca é controle de acesso suficiente.
metadata:
  domain: erp-pm-40bpmi
  role: security
  scope: authn-authz-data-protection
  source: ERP_ENGINEERING_CONSTITUTION.md §6
  related-skills: erp-core, database, backend, code-review
---

# Segurança

## Autenticação

- JWT assinado com `JWT_SECRET` (validado obrigatório no boot — processo aborta se ausente), em cookie `httpOnly` (`auth_token`), `Secure` quando `NODE_ENV=production`. Fallback via header `Authorization: Bearer` existe, mas o padrão do frontend é cookie.
- Senha: `bcrypt`, mínimo 6 caracteres reforçado no backend — não confiar em validação client-side isolada.
- Rate limiting de login: 20 tentativas / 15 min por IP (`server.js`), depende de `trust proxy` correto para Vercel — testar após qualquer mudança de infraestrutura de proxy.

## Autorização

Modelo em duas camadas:
1. **Role global:** `admin`, `p3`, `p1`, `ti`, `viewer`, `comandante`, `comandante_cia`. `ti` é tratado como equivalente a `admin` na maioria das rotas — exceto exclusões/alterações críticas (conta `admin` é protegida contra edição/exclusão por qualquer role).
2. **`secoes_acesso` granular** (JSONB por seção, ex: `{"uis": "nominal"}`), níveis `viewer` (só números) / `nominal` / `editor`.

### Regra obrigatória e não-negociável

> Uma tela ou botão escondido no frontend **nunca** é, sozinho, controle de acesso suficiente.

Toda rota de API que expõe dado nominal, sensível ou destrutivo deve ter seu próprio `requireAuth` + `requireRole(...)`/`requireSectionNominal(...)` no backend — independente do que o frontend mostra ou esconde.

**Isso já falhou de verdade duas vezes neste projeto:**
1. `_checkSectionAccess` do frontend esqueceu o nível "nominal" do P1 — acesso indevido liberado só porque a tela não escondia o link.
2. `/api/uis/mapa` e `/api/ias/mapa` exigiam role clássico sem checar `secoes_acesso` — 403 pra usuário legítimo "Só números" (falha no sentido oposto, mesmo padrão de checagem hardcoded desatualizada).

**Ao adicionar um nível de acesso novo, auditar TODAS as rotas da seção afetada, não só a rota que motivou a mudança.**

Ao criar seção/nível de acesso novo: replicar `requireSectionNominal` (backend) + `xSomenteQuantitativo()` (frontend) — não inventar mecanismo paralelo.

## RLS e acesso direto ao banco

RLS não é a linha de defesa primária aqui — é a autorização do backend (ver `database/SKILL.md`). O frontend hoje **nunca** fala com Supabase diretamente (confirmado: nenhum `createClient`/`supabase` no diretório `frontend/`). Se isso mudar no futuro e alguma chave `anon`/`authenticated` passar a ser usada do cliente, as policies de RLS passam a ser a linha de defesa real e precisam do mesmo rigor do `requireRole`.

## Validação de entrada

Padrão: validação manual por rota (`if (!campo) return res.status(400)...`), sem lib de schema validation (zod/joi ausentes). Uploads em lote usam mapeamento case-insensitive de coluna, filtrando linha inválida antes do insert.

**Regra:** validar e rejeitar cedo com mensagem específica — não deixar o Postgres ser a única linha de validação.

## Exposição de dados sensíveis

**Gap real:** vários `catch` retornam `err.message` direto ao cliente, o que pode vazar detalhe interno (coluna, mensagem do driver). Não é vulnerabilidade crítica isolada (toda rota já exige autenticação antes), mas não expandir a prática.

**Regra para rota nova:** mensagem genérica ao cliente + `console.error` com detalhe completo no servidor.

Dado de saúde (restrição médica, IAS) e dado pessoal sensível (endereço, nascimento) já recebem minimização consciente — o agente SGP explicitamente não grava religião/estado civil/naturalidade mesmo quando disponíveis na fonte. **Manter esse princípio** ao integrar fonte de dado pessoal nova: só persistir o que tem uso real no dashboard.

## Secrets e variáveis de ambiente

- `.env` nunca commitado, `.env.example` documenta as chaves obrigatórias sem valor real.
- `SUPABASE_KEY` **deve ser a service_role key**, nunca a anon/publishable — ela bypassa RLS por completo e nunca deve ser exposta ao frontend.
- `JWT_SECRET`/`SUPABASE_URL`/`SUPABASE_KEY` validados no boot com `process.exit(1)` se ausentes — manter esse padrão fail-fast para qualquer variável de ambiente crítica nova.
