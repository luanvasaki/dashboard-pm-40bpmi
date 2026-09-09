<?php
/**
 * target_deviation.php — Desvio absoluto/percentual + rótulo de situação.
 * Porta de backend/analytics/targetDeviation.js. Tolerância de ±2% = 'na_meta'.
 */

declare(strict_types=1);

/**
 * @return array{absoluto:float,percentual:?float,situacao:string}
 *   situacao ∈ 'acima_meta' | 'na_meta' | 'abaixo_meta' | 'sem_meta'
 */
function desvio(float $avaliado, float $meta): array
{
    $absoluto   = $avaliado - $meta;
    $percentual = $meta != 0.0 ? $absoluto / $meta : null;

    if ($percentual === null) {
        $situacao = 'sem_meta';
    } elseif (abs($percentual) < 0.02) {
        $situacao = 'na_meta';
    } elseif ($absoluto > 0) {
        $situacao = 'acima_meta';
    } else {
        $situacao = 'abaixo_meta';
    }

    return ['absoluto' => $absoluto, 'percentual' => $percentual, 'situacao' => $situacao];
}

/**
 * Filtra, agrega por município+crime e aplica desvio() sobre os totais.
 * @return list<array<string,mixed>>
 */
function deviation_summary_by_city(array $records, array $filters = []): array
{
    $mes   = $filters['mes']   ?? null;
    $crime = $filters['crime'] ?? null;
    $cia   = $filters['cia']   ?? null;

    $agg = [];
    foreach ($records as $r) {
        if (($mes && $r['mes'] !== $mes) || ($crime && $r['crime'] !== $crime) || ($cia && $r['cia'] !== $cia)) {
            continue;
        }
        $key = $r['mun'] . '||' . $r['crime'];
        if (!isset($agg[$key])) {
            $agg[$key] = ['mun' => $r['mun'], 'crime' => $r['crime'], 'avaliado' => 0.0, 'meta' => 0.0, 'anterior' => 0.0];
        }
        $agg[$key]['avaliado'] += $r['avaliado'];
        $agg[$key]['meta']     += $r['meta'];
        $agg[$key]['anterior'] += $r['anterior'];
    }

    $out = [];
    foreach ($agg as $a) {
        $out[] = array_merge($a, desvio($a['avaliado'], $a['meta']));
    }
    return $out;
}
