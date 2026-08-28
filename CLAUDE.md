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
| `NODE_ENV` | `production` em produção |
| `COOKIE_SECURE` | `true` só se servido via HTTPS real; servidor local em HTTP puro deve deixar `false` (senão o cookie de login é descartado pelo navegador) |
| `TRUST_PROXY` | `true` só se houver um proxy reverso na frente (Vercel/nginx/IIS); servidor local direto deve deixar `false` (senão o rate limiter de login pode ser burlado via header forjado) |
| `PORT` | Porta do servidor (padrão 3001) |
| `ALLOWED_ORIGIN` | Origem CORS permitida (vazio = libera tudo, ok em LAN fechada) |

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

**Servidor local dedicado (LAN do batalhão)** — não usa mais Vercel. Um PC sempre ligado, IP fixo `10.42.142.33`, roda `node backend/server.js` como serviço do Windows (recomendado: NSSM), acessível pelas outras máquinas via `http://10.42.142.33:3001`. O Supabase continua sendo o banco (na nuvem) — só o processo Node/frontend saiu do Vercel.

Checklist ao montar o servidor:
1. Node.js LTS instalado na máquina dedicada.
2. `backend/.env` preenchido (ver tabela acima) — **`COOKIE_SECURE=false`** e **`TRUST_PROXY=false`**, a menos que exista HTTPS/proxy real na frente.
3. IP local fixo: `10.42.142.33` (já reservado no roteador).
4. Liberar a porta (padrão 3001) no Firewall do Windows para o perfil de rede privada/local.
5. Rodar como serviço do Windows (NSSM ou equivalente) com reinício automático em caso de crash e no boot da máquina — não deixar dependendo de um usuário logado com terminal aberto.

`vercel.json` ficou obsoleto e pode ser removido quando a migração for confirmada.

O arquivo `supabase_rls_enable.sql` e `create_prod_tempo_resposta.sql` são scripts avulsos para executar manualmente no SQL Editor do Supabase quando necessário.
