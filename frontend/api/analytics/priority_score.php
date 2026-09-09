<?php
/**
 * priority_score.php — Score de Prioridade Operacional.
 * score = (volume_norm × 0.5) + (pressure_index × 0.3) + (trend_growth × 0.2)
 * Porta de backend/analytics/priorityScore.js. null em pressure/trend = 0 (neutro).
 */

declare(strict_types=1);

require_once __DIR__ . '/crime_pressure.php';
require_once __DIR__ . '/trend_analysis.php';

function calc_score(float $volumeNorm, ?float $pressure, ?float $trend): float
{
    return ($volumeNorm * 0.5) + (($pressure ?? 0.0) * 0.3) + (($trend ?? 0.0) * 0.2);
}

/**
 * Agrega por município+crime, calcula os 3 componentes e devolve o ranking
 * completo ordenado do mais crítico ao menos crítico, com `rank` 1-based.
 * @return list<array<string,mixed>>
 */
function priority_ranking(array $records, array $filters = []): array
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

    $items = [];
    foreach ($agg as $a) {
        $a['pressure_index'] = calc_pressure($a['avaliado'], $a['meta']);
        $a['trend_growth']   = calc_trend_growth($a['avaliado'], $a['anterior']);
        $items[] = $a;
    }

    $maxVol = 1.0;
    foreach ($items as $i) {
        if ($i['avaliado'] > $maxVol) {
            $maxVol = $i['avaliado'];
        }
    }

    $result = [];
    foreach ($items as $i) {
        $i['volume_norm']    = $i['avaliado'] / $maxVol;
        $i['priority_score'] = calc_score($i['volume_norm'], $i['pressure_index'], $i['trend_growth']);
        $result[] = $i;
    }

    usort($result, static fn ($a, $b) => $b['priority_score'] <=> $a['priority_score']);

    foreach ($result as $idx => &$item) {
        $item['rank'] = $idx + 1;
    }
    unset($item);

    return $result;
}
