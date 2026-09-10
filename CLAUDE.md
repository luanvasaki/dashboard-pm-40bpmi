# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Backend web = PHP** (roda no Apache/PHP da PM, mesmo ambiente do phpMyAdmin).
Sem Node, sem Composer, sem build. Ver `frontend/api/README.md` para o passo a passo.

```bash
# Configurar credenciais — copiar e preencher (MYSQL_*, JWT_SECRET)
cp frontend/api/secrets.php.example frontend/api/secrets.php

# Rodar localmente (PHP 8.1+, extensões mysqli + mbstring)
php -S localhost:8080 -t frontend
# → abrir http://localhost:8080  (a API fica em /api/index.php/<rota>)

# Gerar hash bcrypt do admin / segredo JWT
php -r "echo password_hash('SENHA', PASSWORD_BCRYPT, ['cost'=>10]).PHP_EOL;"
php -r "echo bin2hex(random_bytes(64)).PHP_EOL;"

# Criar o schema no MySQL (phpMyAdmin → Importar)
mysql -h <host> -u <user> -p <database> < schema_mysql.sql
```

O agente de sincronização (`agente-sgp-php/`) também é PHP CLI — sem Node.
Roda dentro da intranet da PM (no próprio www9): `php agente.php` (loop) ou
`php agente.php --once` (1 rodada, p/ cron / disparo pelo backend web).

## Variáveis de ambiente / configuração

**Backend web**: `frontend/api/secrets.php` (um `return [ 'CHAVE' => 'valor' ]`,
nunca commitado; `.env` no mesmo diretório também é aceito). Variáveis reais do
ambiente (`getenv`) têm prioridade.

| Variável | Descrição |
|---|---|
| `MYSQL_HOST` | Host do MySQL da PM (`mysql-svc.database.svc.cluster.local` dentro do cluster) |
| `MYSQL_PORT` | Porta (padrão 3306) |
| `MYSQL_USER` / `MYSQL_PASSWORD` | Credenciais do banco dedicado |
| `MYSQL_DATABASE` | Nome do banco (ex: `dashboard_40bpmi`) |
| `JWT_SECRET` | String aleatória ≥ 64 chars (obrigatória) |
| `COOKIE_SECURE` | `true` só se servido via HTTPS real; HTTP puro → `false` |
| `TRUST_PROXY` | `true` só se houver proxy/ingress na frente; direto → `false` |
| `ALLOWED_ORIGIN` | Origem CORS permitida (vazio = mesma origem) |
| `APP_CACHE_DIR` | (opcional) diretório gravável p/ cache do RAC PM + rate limiter |

Limites de upload em `frontend/api/.user.ini` (`post_max_size` etc.).

O `agente-sgp-php/` usa `agente-sgp-php/secrets.php` (ou `.env`) com as MESMAS
variáveis `MYSQL_*`. No deploy da PM ele fica ao lado do backend
(`frontend/api/agente.php`) e reaproveita o `frontend/api/secrets.php`.
`SGPDP_CA_CERT_PATH` (ou `certs/sgp-dp-ca.pem`) — CA interna do SGP-DP, só p/
IAS/cursos/láureas (HTTPS); o WSSCPM é HTTP puro e não precisa.

## Arquitetura

```
frontend/                     ← docroot servido pelo Apache (substitui o Vercel)
  index.html / login.html     ← SPA + tela de login
  js/*.js  css/style.css       ← lógica, gráficos, chamadas à API
  api/                         ← BACKEND PHP (porta do antigo Node backend/server.js)
    index.php                  ← front controller — roteia por PATH_INFO
    config.php                 ← carrega secrets.php / .env
    secrets.php                ← credenciais (não versionado)
    lib/     db · jwt · http · auth · helpers · query · cache · ratelimit · router · prodmap · agente
    analytics/  crime_pressure · trend_analysis · target_deviation ·
                priority_score · city_ranking · insight_generator
    routes/  auth · users · rac · efetivo · fotos_vagas · prod · disque · uis · logs
    agente.php                 ← (no deploy) cópia de agente-sgp-php/agente.php
agente-sgp-php/                ← AGENTE PHP CLI — WSSCPM/SGP-DP → MySQL; roda no www9,
                                 disparado pelo backend web (lib/agente.php) e/ou por cron
schema_mysql.sql              ← DDL de todas as tabelas (rodar 1x no phpMyAdmin) — fonte da verdade
```

**Sem framework frontend** — HTML/CSS/JS puro com Chart.js, PapaParse e Lucide Icons via CDN.

**Backend PHP** (`frontend/api/`) — sem framework, sem Composer. `index.php` é o
front controller: o frontend chama `<origin>/api/index.php/<rota>` e a rota sai
do `PATH_INFO`. Autorização por JWT em cookie httpOnly (`lib/auth.php`), igual ao
Node. Ver `frontend/api/README.md`.

**Banco de dados: MySQL 8 / MariaDB** (servidor da PM, phpMyAdmin). Toda query
passa por `frontend/api/lib/db.php` (**mysqli** — pdo_mysql pode não existir no
host). Converte na leitura: `TINYINT(1)`→bool, `DATE`→`'YYYY-MM-DD'`,
`DATETIME`→ISO UTC, `JSON`→array, `DECIMAL`→string. Helpers idênticos ao antigo
`db.js`: `select/selectOne/count/insert/insertMany/upsert/upsertMany/update/remove`.

**Cache do RAC PM** — o Node mantinha em memória; em PHP é um arquivo JSON em
`APP_CACHE_DIR` (`lib/cache.php`) com TTL de 5 min, revalidado a cada request.
`POST /api/.../sync` força a atualização. As demais tabelas são consultadas
direto no banco a cada request.

**Migração Supabase → MySQL → PHP** (2026-09): o projeto usava Supabase
(PostgreSQL) + Node. Trocado por MySQL da PM e todo o código reescrito em PHP
(a TI não libera Node na infra) — backend web **e** o agente de sincronização
(`agente-sgp-php/`, validado em produção: bulk de 354 PMs sem erro nas 4 filas
WSSCPM/IAS/cursos/láureas). Os módulos de analytics PHP batem byte a byte com os
do Node original. Índice único parcial do `sgp_sync_jobs` virou coluna gerada
`bulk_lock` + UNIQUE; sem RLS (autorização 100% na aplicação via JWT). O código
Node antigo (`backend/`, `agente-sgp/`), o `vercel.json` e os `.sql` avulsos da
raiz (PostgreSQL) foram removidos — `schema_mysql.sql` é a fonte da verdade.

## Banco de dados (MySQL 8 — servidor da PM)

Schema completo em `schema_mysql.sql`. Tabela RAC PM mantém o nome com espaços
(`Base de Dados RAC PM`) e colunas capitalizadas (`Ano`, `Mes`, …) — a app usa crases.

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
| `prod_cursos` | Cursos institucionais por PM (manual + SGP-DP) |
| `prod_laureas` | Láureas do Mérito Pessoal (SGP-DP) |
| `prod_conseg` | CONSEG por município/mês |
| `pvs` | Programa de Vigilância Solidária |
| `uis_restricoes` | Restrições médicas (CSV `manual` + SGP-DP `sgp`) |
| `ias_registros` | Inspeção Anual de Saúde (SGP-DP) |
| `sgp_sync_jobs` | Fila de sincronização processada pelo agente-sgp |
| `sgp_dp_sessao` | Cookie de sessão do SGP-DP (1 linha) |
| `logs_acesso` | Auditoria de acesso |

## Autenticação e Roles

JWT em cookie `httpOnly` (`auth_token`), sessão de 8h. Em PHP: `require_auth()` +
`require_role($user, ...roles)` + `require_section_nominal($user, ...secoes)`
(`frontend/api/lib/auth.php`). O JWT é HS256 feito à mão (`lib/jwt.php`) —
compatível com os tokens que o Node emitia. Senhas: `password_hash`/`password_verify`
(aceita hashes `$2a$`/`$2b$` do bcryptjs antigo).

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
2. Mapeia campos com busca **case-insensitive** (`csv_get` / helpers locais em `lib/helpers.php` e `lib/prodmap.php`)
3. **Apaga todos os registros dos anos presentes no CSV** antes de inserir (não é upsert puro)
4. Insere em batches de 500

## Deploy

**Backend PHP no Apache da PM** (mesmo ambiente do phpMyAdmin —
`www9.intranet.policiamilitar.sp.gov.br`, cluster). Banco: MySQL da PM
(`mysql-svc.database.svc.cluster.local`). Passo a passo completo em
`frontend/api/README.md`.

Checklist:
1. Criar o banco no phpMyAdmin e importar `schema_mysql.sql`.
2. Criar o usuário admin (INSERT no fim do `schema_mysql.sql`; hash com
   `php -r "echo password_hash('SENHA', PASSWORD_BCRYPT, ['cost'=>10]);"`).
3. `frontend/api/secrets.php` preenchido (`MYSQL_*`, `JWT_SECRET`);
   `COOKIE_SECURE`/`TRUST_PROXY` só `true` com HTTPS/proxy real.
4. Subir a pasta `frontend/` inteira para o docroot (via WS_FTP, no lugar dos
   arquivos estáticos atuais). Conferir diretório de cache gravável.
5. `agente-sgp-php/` roda no próprio www9 (alcança WSSCPM/SGP-DP + MySQL).
   Deploy: copiar `agente-sgp-php/agente.php` para `frontend/api/agente.php` e a
   CA do SGP-DP para `frontend/api/certs/sgp-dp-ca.pem`. O backend web dispara
   `php agente.php --once` em background quando cria um job (`lib/agente.php`).
   Cron recomendado: `--once` a cada minuto (rede de segurança) + `--diario`
   às 5h (enfileira só o bulk do WSSCPM — não precisa de cookie).
   IAS/cursos/láureas: a sessão do SGP-DP (cookie) dura ~1–4h, então às 5h
   estaria vencida — o usuário dispara essas pela tela P1 ("salvar cookie +
   sincronizar IAS/cursos/láureas agora"), com o cookie recém-colado.
