<?php
/**
 * crime_pressure.php — Índice de Pressão Criminal.
 * Fórmula: pressure_index = (avaliado - meta) / meta   (null se meta = 0)
 * Porta de backend/analytics/crimePressureIndex.js.
 */

declare(strict_types=1);

/** Índice de pressão para um par avaliado/meta. null se meta = 0. */
function calc_pressure(float $avaliado, float $meta): ?float
{
    if ($meta == 0.0) {
        return null;
    }
    return ($avaliado - $meta) / $meta;
}

/**
 * Filtra (mes/crime/cia), agrega por município+crime somando avaliado/meta/anterior
 * e recalcula o índice sobre o total.
 * @return list<array{mun:string,crime:string,avaliado:float,meta:float,anterior:float,pressure_index:?float}>
 */
function pressure_by_city(array $records, array $filters = []): array
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
        $a['pressure_index'] = calc_pressure($a['avaliado'], $a['meta']);
        $out[] = $a;
    }
    return $out;
}
