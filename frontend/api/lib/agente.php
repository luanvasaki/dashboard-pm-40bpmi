<?php
/**
 * agente.php — dispara o agente-sgp em background quando um job é criado.
 *
 * No deploy da PM o agente (api/agente.php) roda no próprio www9, que alcança
 * o WSSCPM/SGP-DP e o MySQL. Este helper faz um `php agente.php --once`
 * detached; o agente pega o lock, processa a fila e sai. Se o agente não
 * estiver ao lado do backend (ex: dev local), não faz nada — a fila fica
 * pendente pra quem for processá-la (cron, agente em loop, etc.).
 */

declare(strict_types=1);

function agente_kick(): void
{
    $agente = __DIR__ . '/../agente.php';
    if (!is_file($agente)) {
        return;
    }
    $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
    if (in_array('exec', $disabled, true) || !function_exists('exec')) {
        error_log('[dashboard] agente_kick: exec() indisponível — job fica pendente.');
        return;
    }

    $php = getenv('PHP_BIN') ?: (PHP_BINARY && str_ends_with(PHP_BINARY, 'php') ? PHP_BINARY : '/usr/bin/php');
    $log = sys_get_temp_dir() . '/agente-sgp-' . gmdate('Ymd') . '.log';
    $cmd = escapeshellarg($php) . ' ' . escapeshellarg($agente) . ' --once >> ' . escapeshellarg($log) . ' 2>&1 &';
    @exec($cmd);
}
