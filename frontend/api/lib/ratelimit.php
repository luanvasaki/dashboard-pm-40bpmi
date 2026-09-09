<?php
/**
 * ratelimit.php — Limitador de tentativas de login (porta do express-rate-limit).
 * 20 tentativas por IP a cada 15 min. Estado em arquivo (CACHE_DIR/ratelimit/).
 */

declare(strict_types=1);

const LOGIN_RL_WINDOW = 15 * 60;
const LOGIN_RL_MAX     = 20;

/**
 * Conta a tentativa e diz se ainda está dentro do limite.
 * Retorna true se pode prosseguir, false se deve bloquear (429).
 */
function login_rate_ok(?string $ip): bool
{
    $ip = $ip ?: 'unknown';
    $dir = CACHE_DIR . '/ratelimit';
    if (!is_dir($dir)) {
        @mkdir($dir, 0770, true);
    }
    if (!is_writable($dir)) {
        return true; // sem onde persistir: não bloqueia (fail-open, igual a não ter limiter)
    }

    $file = $dir . '/login_' . hash('sha256', $ip) . '.json';
    $now  = time();

    $fh = @fopen($file, 'c+');
    if ($fh === false) {
        return true;
    }
    try {
        flock($fh, LOCK_EX);
        $raw = stream_get_contents($fh);
        $state = json_decode($raw ?: '[]', true);
        if (!is_array($state) || !isset($state['resetAt']) || $now >= (int) $state['resetAt']) {
            $state = ['count' => 0, 'resetAt' => $now + LOGIN_RL_WINDOW];
        }
        $state['count']++;
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($state));
        fflush($fh);
        return $state['count'] <= LOGIN_RL_MAX;
    } finally {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}
