# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Instalar dependências
cd backend && npm install

# Rodar localmente (porta 3001)
cd backend && node server.js

# Configurar ambiente — copiar e preencher
cp .env.example backend/.env
```

O frontend é servido diretamente pelo Express (`express.static`), sem build step. Abrir `http://localhost:3001` após iniciar o servidor.

## Variáveis de ambiente obrigatórias

Arquivo `backend/.env` (nunca commitar):

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_KEY` | service_role key (não a anon) |
| `JWT_SECRET` | String aleatória ≥ 64 chars |
| `NODE_ENV` | `production` em produção (ativa cookies Secure) |
| `ALLOWED_ORIGIN` | Origem CORS permitida (vazio = libera tudo em dev) |

## Arquitetura

```
backend/
  server.js           ← API REST + auth JWT + todas as rotas (arquivo único)
  analytics/          ← módulos de cálculo chamados pelas rotas /api/analytics/*
    crimePressureIndex.js
    trendAnalysis.js
    priorityScore.js
    cityRanking.js
    targetDeviation.js
    insightGenerator.js
frontend/
  index.html          ← SPA principal (requer login)
  login.html          ← cadastro e autenticação
  js/app.js           ← toda a lógica, gráficos e chamadas à API
  css/style.css
raw_data.json         ← fallback local quando Supabase não está configurado
vercel.json           ← deploy: tudo roteia para backend/server.js
```

**Sem framework frontend** — HTML/CSS/JS puro com Chart.js, PapaParse e Lucide Icons via CDN.

**Cache em memória no backend** — `server.js` mantém `cache.data[]` sincronizado com Supabase a cada 5 min (TTL). Toda lógica de filtro opera sobre esse cache, não consulta o banco diretamente.

## Banco de dados (Supabase / PostgreSQL)

Todas as tabelas têm RLS habilitado; o backend usa `service_role key` que bypassa RLS.

| Tabela | Uso |
|---|---|
| `Base de Dados RAC PM` | Registros criminais (Ano, Mes, Cia, Municipio, Crime, Anterior, Meta, Avaliado, Tendencia) |
| `usuarios` | Autenticação própria (JWT + bcrypt) — campos: id, nome, posto, matricula, senha_hash, secao, role, status, reset_senha |
| `ocorrencias` | Dados InfoCrim importados via CSV |
| `efetivo_pm` | Efetivo P1 (opm, posto, re, nome, funcao, genero, nome_guerra, data_eap, possui_restricao, ...) |
| `afastamentos_pm` | Afastamentos (re, nome, opm, tipo_afastamento, n_dias, inicio, termino, ...) |
| `fotos_pm` | Fotos dos PMs em base64 (re TEXT PK, foto_base64 TEXT, updated_at) |
| `vagas_pm` | Efetivo fixado por OPM |
| `p1_quadro_fixado` | Quadro de pessoal fixado/existente por posto e OPM |
| `prod_ocorrencias` | Produtividade — ocorrências |
| `prod_pessoas_presas` | Produtividade — presos |
| `prod_armas` | Produtividade — armas apreendidas |
| `prod_veiculos` | Produtividade — veículos recuperados |
| `prod_entorpecentes` | Produtividade — entorpecentes |
| `prod_visita_solidaria` | Programa Visita Solidária |
| `prod_tempo_resposta` | Tempo de resposta de ocorrências urgentes |
| `indicadores_qualidade_p3` | Indicadores de qualidade P3 (manual + automático) |
| `disque_denuncia_registros` | Registros Disque Denúncia |
| `config_dashboard` | Configurações globais (chave/valor) |

## Autenticação e Roles

JWT em cookie `httpOnly` (`auth_token`), sessão de 8h. Middleware `requireAuth` + `requireRole(...roles)`.

| Role | Permissões |
|---|---|
| `admin` | Acesso total; protegido contra alteração/exclusão |
| `p3` | P3 + gerenciar usuários |
| `p1` | P1 + upload de fotos |
| `ti` | Técnico (acesso amplo sem ser admin) |
| `viewer`, `comandante`, `comandante_cia` | Somente leitura |

Cadastro cria role `p1` se seção = 'P1', senão `viewer`. Status `pending` até aprovação manual.

## Padrões de upload CSV

Todas as rotas de upload seguem o mesmo padrão:
1. Recebe `{ records: [...] }` no body (parseado pelo frontend via PapaParse)
2. Mapeia campos com busca **case-insensitive** (função `gf` / `get`)
3. **Apaga todos os registros dos anos presentes no CSV** antes de inserir (não é upsert puro)
4. Insere em batches de 500

## Deploy

Vercel (região `gru1`). Toda rota passa por `backend/server.js`. Variáveis de ambiente configuradas no painel Vercel → Settings → Environment Variables.

O arquivo `supabase_rls_enable.sql` e `create_prod_tempo_resposta.sql` são scripts avulsos para executar manualmente no SQL Editor do Supabase quando necessário.
