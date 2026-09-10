<?php
/**
 * city_ranking.php — Fachada que combina os rankings por Pressão e por Prioridade.
 * Porta de backend/analytics/cityRanking.js.
 */

declare(strict_types=1);

require_once __DIR__ . '/crime_pressure.php';
require_once __DIR__ . '/priority_score.php';

/** `top` cidades com maior índice de pressão (mais acima da meta). rank 1-based. */
function ranking_by_pressure(array $records, array $filters = [], int $top = 10): array
{
    $items = array_values(array_filter(
        pressure_by_city($records, $filters),
        static fn ($i) => $i['pressure_index'] !== null
    ));
    usort($items, static fn ($a, $b) => $b['pressure_index'] <=> $a['pressure_index']);
    $items = array_slice($items, 0, $top);
    foreach ($items as $idx => &$item) {
        $item['rank'] = $idx + 1;
    }
    unset($item);
    return $items;
}

/** `top` cidades com maior score de prioridade operacional. */
function ranking_by_priority(array $records, array $filters = [], int $top = 10): array
{
    return array_slice(priority_ranking($records, $filters), 0, $top);
}

/** Os dois rankings numa chamada só. */
function full_ranking(array $records, array $filters = [], int $top = 10): array
{
    return [
        'byPressure' => ranking_by_pressure($records, $filters, $top),
        'byPriority' => ranking_by_priority($records, $filters, $top),
    ];
}
