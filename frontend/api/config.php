<?php
/**
 * config.php — Carrega api/.env e define as constantes de ambiente.
 * ────────────────────────────────────────────────────────────────
 * Substitui o `require('dotenv').config()` do Node. Sem dependência externa.
 *
 * Variáveis usadas (ver api/.env.example):
 *   MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 *   JWT_SECRET      — string aleatória ≥ 64 chars (obrigatória)
 *   COOKIE_SECURE   — 'true' só se servido via HTTPS real
 *   ALLOWED_ORIGIN  — origem CORS permitida (vazio = mesma origem, libera tudo)
 *   TRUST_PROXY     — 'true' só se houver proxy reverso na frente
 *   APP_TZ_DISPLAY  — (informativo) fuso de exibição; o backend opera em UTC
 */

declare(strict_types=1);

// ── Carga da configuração ────────────────────────────────────────────────────
// Preferência: frontend/api/secrets.php  (um `return [ 'MYSQL_HOST' => ... ]`).
// Um .php pedido direto pelo navegador só executa e não imprime nada — os
// segredos não vazam mesmo sem .htaccess. O .env continua aceito como fallback
// (dev local) e as variáveis reais do ambiente têm prioridade sobre os dois.
(static function (): void {
    $apply = static function (string $key, string $val): void {
        $key = trim($key);
        if ($key === '' || getenv($key) !== false) {
            return; // env real do processo vence
        }
        putenv("$key=$val");
        $_ENV[$key] = $val;
    };

    $secrets = __DIR__ . '/secrets.php';
    if (is_file($secrets)) {
        $cfg = require $secrets;
        if (is_array($cfg)) {
            foreach ($cfg as $k => $v) {
                $apply((string) $k, (string) $v);
            }
        }
    }

    $envFile = __DIR__ . '/.env';
    if (is_file($envFile) && is_readable($envFile)) {
        foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                continue;
            }
            [$k, $v] = explode('=', $line, 2);
            $v = trim($v);
            if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && $v[-1] === $v[0]) {
                $v = substr($v, 1, -1);
            }
            $apply(trim($k), $v);
        }
    }
})();

// ── Constantes derivadas ─────────────────────────────────────────────────────
define('JWT_SECRET', (string) (getenv('JWT_SECRET') ?: ''));
define('COOKIE_SECURE', (getenv('COOKIE_SECURE') ?: 'false') === 'true');
define('TRUST_PROXY', (getenv('TRUST_PROXY') ?: 'false') === 'true');
define('ALLOWED_ORIGIN', (string) (getenv('ALLOWED_ORIGIN') ?: ''));

// Sessão JWT: 8 horas (igual ao Node).
define('JWT_TTL_SECONDS', 8 * 60 * 60);

// TTL do cache em arquivo da tabela RAC PM: 5 minutos (igual ao CACHE_TTL do Node).
define('CACHE_TTL_SECONDS', 5 * 60);

// Diretório de cache/estado (RAC PM, rate limiting). Fora do docroot se possível;
// senão, uma subpasta protegida por .htaccess dentro de api/.
define('CACHE_DIR', (function (): string {
    $candidates = [
        getenv('APP_CACHE_DIR') ?: null,
        sys_get_temp_dir() . '/dashboard_40bpmi',
        __DIR__ . '/.cache',
    ];
    foreach ($candidates as $dir) {
        if ($dir === null) {
            continue;
        }
        if (is_dir($dir) && is_writable($dir)) {
            return $dir;
        }
        if (!is_dir($dir) && @mkdir($dir, 0770, true) && is_writable($dir)) {
            return $dir;
        }
    }
    // Último recurso: temp do sistema (pode não persistir entre requests, mas não quebra).
    return sys_get_temp_dir();
})());

// O PHP roda toda a lógica de data em UTC (o MySQL também — ver db.php).
date_default_timezone_set('UTC');
