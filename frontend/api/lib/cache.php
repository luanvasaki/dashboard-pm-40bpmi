<?php
/**
 * cache.php — Cache em arquivo da tabela "Base de Dados RAC PM".
 * ────────────────────────────────────────────────────────────
 * O Node mantinha a tabela RAC PM inteira em memória, sincronizada a cada 5 min.
 * Em PHP cada request é isolado, então o cache vira um arquivo JSON em CACHE_DIR
 * com TTL de 5 min (CACHE_TTL_SECONDS). Toda a lógica de KPIs/gráficos/analytics
 * opera sobre esse array, sem tocar no banco.
 *
 * Estrutura do arquivo: { data:[...registros...], lastSync:ISO, source:'mysql'|'local' }
 */

declare(strict_types=1);

const RAC_TABLE_NAME = 'Base de Dados RAC PM';

/** Converte uma linha bruta do banco para o formato interno do cache. */
function rac_from_db_row(array $r): array
{
    $idx = [];
    foreach ($r as $k => $v) {
        $idx[mb_strtolower((string) $k)] = $v;
    }
    $get = static function (string ...$names) use ($idx) {
        foreach ($names as $n) {
            $key = mb_strtolower($n);
            if (array_key_exists($key, $idx) && $idx[$key] !== null) {
                return $idx[$key];
            }
        }
        return null;
    };
    $num = static function (string ...$names) use ($get): float {
        $v = jsFloat((string) ($get(...$names) ?? ''));
        return is_nan($v) ? 0.0 : $v;
    };
    $canon = static function (string $raw): string {
        $n = nk($raw);
        foreach (CRIMES_ORD as $c) {
            if (nk($c) === $n) {
                return $c;
            }
        }
        return $raw;
    };

    return [
        'ano'      => jsInt((string) ($get('Ano') ?? '')),
        'mes'      => (string) ($get('Mes') ?? ''),
        'cia'      => (string) ($get('Cia') ?? ''),
        'mun'      => (string) ($get('Municipio') ?? ''),
        'crime'    => $canon((string) ($get('Crime') ?? '')),
        'anterior' => $num('Anterior'),
        'meta'     => $num('Meta'),
        'avaliado' => $num('Avaliado'),
        'tend'     => $num('Tendencia', 'Tendência'),
        'variacao' => (string) ($get('Variação', 'Variacao') ?? ''),
    ];
}

function rac_cache_file(): string
{
    return CACHE_DIR . '/rac_pm.json';
}

/**
 * Recarrega o cache a partir do banco. Retorna o estado novo ou lança.
 * @return array{data:list<array>,lastSync:string,source:string}
 */
function rac_refresh_from_db(): array
{
    $rows = DB::select(RAC_TABLE_NAME);
    if (count($rows) === 0) {
        throw new RuntimeException('Nenhum registro encontrado na tabela RAC PM');
    }
    $state = [
        'data'     => array_map('rac_from_db_row', $rows),
        'lastSync' => iso_now(),
        'source'   => 'mysql',
    ];
    @file_put_contents(rac_cache_file(), json_encode($state, JSON_UNESCAPED_UNICODE), LOCK_EX);
    return $state;
}

/** Fallback local: raw_data.json na raiz do projeto (opcional). */
function rac_local_fallback(): array
{
    foreach ([__DIR__ . '/../../../raw_data.json', __DIR__ . '/../raw_data.json'] as $p) {
        if (is_file($p)) {
            $data = json_decode((string) file_get_contents($p), true);
            if (is_array($data)) {
                return ['data' => $data, 'lastSync' => iso_now(), 'source' => 'local'];
            }
        }
    }
    return ['data' => [], 'lastSync' => iso_now(), 'source' => 'local'];
}

/**
 * Estado do cache RAC PM (recarrega se estiver velho). Nunca lança:
 * em erro, devolve o arquivo antigo ou o fallback local.
 * @return array{data:list<array>,lastSync:?string,source:?string,error:?string}
 */
function rac_cache(bool $forceRefresh = false): array
{
    $file = rac_cache_file();
    $fresh = is_file($file) && (time() - filemtime($file) < CACHE_TTL_SECONDS);

    if (!$forceRefresh && $fresh) {
        $state = json_decode((string) file_get_contents($file), true);
        if (is_array($state) && isset($state['data'])) {
            $state['error'] = null;
            return $state;
        }
    }

    if (!db_ready()) {
        return rac_stale_or_local('Banco de dados não configurado');
    }

    try {
        $state = rac_refresh_from_db();
        $state['error'] = null;
        return $state;
    } catch (Throwable $e) {
        error_log('[dashboard] rac_cache: ' . $e->getMessage());
        return rac_stale_or_local($e->getMessage());
    }
}

/** @return array{data:list<array>,lastSync:?string,source:?string,error:?string} */
function rac_stale_or_local(string $error): array
{
    $file = rac_cache_file();
    if (is_file($file)) {
        $state = json_decode((string) file_get_contents($file), true);
        if (is_array($state) && !empty($state['data'])) {
            $state['error'] = $error;
            return $state;
        }
    }
    $local = rac_local_fallback();
    $local['error'] = $error;
    return $local;
}

/** Só o array de registros do cache. */
function rac_data(): array
{
    return rac_cache()['data'] ?? [];
}

/**
 * Força a sincronização imediata (rota POST /api/sync).
 * @return array{ok:bool,lastSync:?string,source:?string,records:int,error:?string}
 */
function rac_sync_now(): array
{
    if (!db_ready()) {
        return ['ok' => false, 'lastSync' => null, 'source' => null, 'records' => 0, 'error' => 'Banco de dados não configurado'];
    }
    try {
        $state = rac_refresh_from_db();
        return [
            'ok'       => true,
            'lastSync' => $state['lastSync'],
            'source'   => $state['source'],
            'records'  => count($state['data']),
            'error'    => null,
        ];
    } catch (Throwable $e) {
        $stale = rac_stale_or_local($e->getMessage());
        return [
            'ok'       => false,
            'lastSync' => $stale['lastSync'] ?? null,
            'source'   => $stale['source'] ?? null,
            'records'  => count($stale['data'] ?? []),
            'error'    => $e->getMessage(),
        ];
    }
}

/**
 * Filtra o cache pelos parâmetros (mes/crime/mun/cia). Omitidos são ignorados (AND).
 */
function rac_filter(array $data, array $f): array
{
    $mes   = $f['mes']   ?? null;
    $crime = $f['crime'] ?? null;
    $mun   = $f['mun']   ?? null;
    $cia   = $f['cia']   ?? null;
    return array_values(array_filter($data, static function ($r) use ($mes, $crime, $mun, $cia) {
        return (!$mes   || $r['mes']   === $mes)
            && (!$crime || $r['crime'] === $crime)
            && (!$mun   || $r['mun']   === $mun)
            && (!$cia   || $r['cia']   === $cia);
    }));
}
