<?php
/**
 * index.php — Front controller da API do Dashboard 40º BPM/I.
 * ─────────────────────────────────────────────────────────────
 * Substitui backend/server.js. Roda em Apache/PHP (mesmo ambiente do phpMyAdmin
 * da PM). O frontend continua servido como arquivos estáticos pelo Apache.
 *
 * Roteamento sem depender de mod_rewrite: o frontend chama
 *   <origin>/api/index.php/<rota>?<query>
 * e este script lê PATH_INFO (ou ?__route= como último recurso).
 * Se mod_rewrite estiver disponível, o .htaccess opcional deixa a URL limpa
 * (<origin>/api/<rota>) — o código abaixo aceita as duas formas.
 *
 * Acesso ao banco: tudo via lib/db.php (PDO). Schema: ../../schema_mysql.sql
 */

declare(strict_types=1);

require __DIR__ . '/config.php';

require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/jwt.php';
require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/helpers.php';
require __DIR__ . '/lib/query.php';
require __DIR__ . '/lib/cache.php';
require __DIR__ . '/lib/ratelimit.php';
require __DIR__ . '/lib/router.php';
require __DIR__ . '/lib/agente.php';

mb_internal_encoding('UTF-8');

// Warnings/notices vão pro log do servidor, nunca pro cliente (que sempre
// recebe JSON). Erros de verdade e exceptions caem no handler abaixo.
ini_set('display_errors', '0');
error_reporting(E_ALL);

// ── Erros → JSON (nunca vaza HTML/stack pro cliente) ─────────────────────────
set_exception_handler(function (Throwable $e): void {
    error_log('[dashboard] ' . $e);
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
    exit;
});
register_shutdown_function(function (): void {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        error_log('[dashboard] fatal: ' . $e['message'] . ' @ ' . $e['file'] . ':' . $e['line']);
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Erro interno do servidor'], JSON_UNESCAPED_UNICODE);
        }
    }
});

// ── CORS ────────────────────────────────────────────────────────────────────
// Mesma origem no deploy da PM; mantém suporte a ALLOWED_ORIGIN por precaução.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $allow = ALLOWED_ORIGIN === '' ? $origin : (($origin === ALLOWED_ORIGIN) ? $origin : '');
    if ($allow !== '') {
        header('Access-Control-Allow-Origin: ' . $allow);
        header('Vary: Origin');
        header('Access-Control-Allow-Credentials: true');
    }
}
if (Req::method() === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Max-Age: 600');
    Res::noContent(204);
}

if (JWT_SECRET === '') {
    Res::error('Servidor sem JWT_SECRET configurado (api/.env).', 500);
}

// ── Resolve a rota ──────────────────────────────────────────────────────────
// Ordem: ?__route= (usado no deploy da PM — nginx sem PATH_INFO) → PATH_INFO
// (hosts com rewrite) → sufixo depois de "/api/" no REQUEST_URI.
$routePath = (static function (): string {
    if (isset($_GET['__route']) && $_GET['__route'] !== '') {
        return '/' . trim((string) $_GET['__route'], '/');
    }
    $p = $_SERVER['PATH_INFO'] ?? '';
    if ($p === '') {
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $script = $_SERVER['SCRIPT_NAME'] ?? '';
        if ($script !== '' && str_starts_with($uri, $script)) {
            $p = substr($uri, strlen($script));
        } elseif (($i = strrpos($uri, '/api/')) !== false) {
            $p = substr($uri, $i + strlen('/api'));
        }
    }
    return '/' . trim($p, '/');
})();

// ── Registra rotas e despacha ───────────────────────────────────────────────
$router = new Router();
foreach ([
    'auth', 'users', 'rac', 'efetivo', 'fotos_vagas',
    'prod', 'disque', 'uis', 'logs',
] as $group) {
    (require __DIR__ . "/routes/$group.php")($router);
}

$router->dispatch(Req::method(), $routePath);
