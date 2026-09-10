<?php
/**
 * config.php — carrega agente-sgp-php/.env (ou secrets.php) e define constantes.
 * Mesmas variáveis MYSQL_* do backend web + POLL_INTERVAL_MS / CALL_DELAY_MS /
 * SGPDP_CA_CERT_PATH.
 */

declare(strict_types=1);

(static function (): void {
    $apply = static function (string $key, string $val): void {
        $key = trim($key);
        if ($key === '' || getenv($key) !== false) {
            return;
        }
        putenv("$key=$val");
        $_ENV[$key] = $val;
    };

    $secrets = __DIR__ . '/../secrets.php';
    if (is_file($secrets)) {
        $cfg = require $secrets;
        if (is_array($cfg)) {
            foreach ($cfg as $k => $v) {
                $apply((string) $k, (string) $v);
            }
        }
    }

    $envFile = __DIR__ . '/../.env';
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

define('POLL_INTERVAL_MS', (int) (getenv('POLL_INTERVAL_MS') ?: 60000));
define('CALL_DELAY_MS', (int) (getenv('CALL_DELAY_MS') ?: 1500));
define('SGPDP_CA_CERT_PATH', getenv('SGPDP_CA_CERT_PATH') ?: (__DIR__ . '/../certs/sgp-dp-ca.pem'));

date_default_timezone_set('UTC');
