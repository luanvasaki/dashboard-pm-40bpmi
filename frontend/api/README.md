# Backend PHP — Dashboard 40º BPM/I

Porta em PHP do antigo `backend/server.js` (Node/Express). Roda no Apache/PHP
da intranet da PM — o **mesmo ambiente do phpMyAdmin** (`www9.intranet…`),
sem Node, sem Composer, sem build.

O frontend (`frontend/`) é servido como arquivo estático pelo Apache e chama
esta API em `<origin>/api/index.php/<rota>`.

## Estrutura

```
frontend/                     ← docroot (substitui o Vercel)
  index.html, login.html, css/, js/, images/
  api/
    index.php                 ← front controller (roteia por PATH_INFO)
    config.php                ← carrega secrets.php / .env
    secrets.php               ← credenciais (NÃO vai pro git) — criar a partir do .example
    .user.ini                 ← limites de upload (post_max_size etc.)
    .htaccess.example         ← opcional: URL limpa + hardening (só se AllowOverride permitir)
    lib/       db, jwt, http, auth, helpers, query, cache, ratelimit, router, prodmap
    analytics/ crime_pressure, trend_analysis, target_deviation, priority_score,
               city_ranking, insight_generator
    routes/    auth, users, rac, efetivo, fotos_vagas, prod, disque, uis, logs
```

## Requisitos no host

- PHP 8.1+ (o servidor da PM tem 8.3) com extensões **mysqli** e **mbstring**
  (ambas presentes — o phpMyAdmin usa mysqli). `openssl`/`hash` para o JWT já
  são padrão.
- MySQL/MariaDB acessível (no cluster: `mysql-svc.database.svc.cluster.local`).
- Um diretório gravável para cache (o PHP tenta `sys_get_temp_dir()` e
  `frontend/api/.cache/` automaticamente; ou defina `APP_CACHE_DIR`).

## Instalação

1. **Banco**: no phpMyAdmin, criar o banco e importar `../../schema_mysql.sql`
   (ver instruções no topo daquele arquivo). Criar o usuário admin (INSERT
   comentado no fim do schema; hash com
   `php -r "echo password_hash('SENHA', PASSWORD_BCRYPT, ['cost'=>10]);"`).

2. **Credenciais**: copiar `secrets.php.example` → `secrets.php` e preencher
   `MYSQL_*` e `JWT_SECRET` (gerar: `php -r "echo bin2hex(random_bytes(64));"`).
   Um `.php` pedido pelo navegador só executa (não imprime), então as
   credenciais não vazam mesmo sem `.htaccess`.

3. **Deploy**: subir a pasta `frontend/` inteira para o docroot (o mesmo lugar
   onde hoje ficam os arquivos estáticos — via WS_FTP). O `secrets.php` fica em
   `api/secrets.php`.

4. **Testar**: abrir `https://<host>/` (login.html deve carregar) e
   `https://<host>/api/index.php/status` autenticado deve responder JSON.

## Deploy real na PM (confirmado 2026-09)

- Servido por **nginx + PHP-FPM 8.3.23** (mesma máquina do phpMyAdmin, `www9`).
  Extensões presentes: mysqli, mbstring, curl, pdo_mysql.
- A pasta de rede `\\dados.intranet.policiamilitar.sp.gov.br\k8s.40bpmi` é
  publicada em `https://www9.intranet.policiamilitar.sp.gov.br/unidades/40bpmi/`.
  O sistema vai numa subpasta: **`.../unidades/40bpmi/sis40bpmi/`**.
- Banco MySQL: usuário `dba.40bpmi`, banco **`foo`** (único nome que o grant
  permite hoje — a TI pode trocar depois).

### Roteamento

O nginx da PM **não passa `PATH_INFO`** (`/api/index.php/x` dá 404) e **não tem
`try_files … /index.php`**. Então a rota vai por **query string**:

```
<base>api/index.php?__route=/<rota>&<demais params>
```

O `apiUrl()` em `frontend/js/auth.js` reescreve `${API}/<rota>?<query>` para esse
formato automaticamente — nenhuma outra chamada precisa mudar. `index.php` lê
`$_GET['__route']` primeiro; `PATH_INFO` e o sufixo de `REQUEST_URI` ficam como
fallback para hosts com rewrite.

### Subpasta

O frontend é "ciente da subpasta": `APP_BASE` (em `utils.js` / `login.html`) é
calculado de `location.pathname` no carregamento. Todos os assets já eram
relativos; só os redirects e a base da API precisaram do `APP_BASE`.

`.htaccess.example` **não serve** nesse host (é nginx, não Apache). O `.user.ini`
funciona (PHP-FPM lê por diretório) — mantém os limites de upload.

## Diferença de comportamento vs. Node

- **Cache do RAC PM**: o Node mantinha em memória (processo sempre ligado). Em
  PHP é um arquivo JSON em `APP_CACHE_DIR` com TTL de 5 min — cada request
  revalida. `POST /api/.../sync` força a atualização.
- **Rate limit de login**: 20/15 min por IP, estado em arquivo (era
  `express-rate-limit` em memória).
- Todo o resto (rotas, payloads, regras de autorização, parsing de CSV,
  analytics) é idêntico — os módulos de analytics batem byte a byte com o Node.

## Agente de sincronização

O `agente-sgp-php/` (WSSCPM / SGP-DP → MySQL) também é PHP CLI — ver o README de
lá. No deploy da PM ele fica como `frontend/api/agente.php` e o backend web o
dispara em background (`lib/agente.php` → `php agente.php --once`) sempre que
cria um job de sincronização. O dashboard funciona sem ele (só não recebe
atualização automática de efetivo/IAS/cursos/láureas).
