<?php
/**
 * insight_generator.php — Insights automáticos em português.
 * Porta de backend/analytics/insightGenerator.js. Limiares: tendência ±5%,
 * pressão > 0 (acima) / < -10% (abaixo). Limites de itens por categoria mantidos.
 */

declare(strict_types=1);

require_once __DIR__ . '/crime_pressure.php';
require_once __DIR__ . '/trend_analysis.php';
require_once __DIR__ . '/priority_score.php';

/** 0.185 → "18.5%" */
function _pct(float $v): string
{
    return number_format($v * 100, 1, '.', '') . '%';
}

/** Formata número "à la JS": inteiro sem casas, senão com as casas que tiver. */
function _numstr(float $v): string
{
    if (floor($v) == $v) {
        return (string) (int) $v;
    }
    return rtrim(rtrim(number_format($v, 3, '.', ''), '0'), '.');
}

/** @return list<string> */
function generate_insights(array $records, array $filters = []): array
{
    $insights = [];

    // ── 1. Tendências (limiar ±5%) ───────────────────────────────────────────
    $trends  = trend_by_city($records, $filters);
    $growing = array_values(array_filter($trends, static fn ($t) => $t['trend_growth'] !== null && $t['trend_growth'] > 0.05));
    $falling = array_values(array_filter($trends, static fn ($t) => $t['trend_growth'] !== null && $t['trend_growth'] < -0.05));

    foreach (array_slice($growing, 0, 5) as $t) {
        $insights[] = "{$t['crime']} aumentou " . _pct($t['trend_growth']) . " em relação ao período anterior em {$t['mun']}.";
    }
    foreach (array_slice($falling, 0, 3) as $t) {
        $insights[] = "{$t['crime']} reduziu " . _pct(abs($t['trend_growth'])) . " em relação ao período anterior em {$t['mun']}.";
    }

    // ── 2. Acima / abaixo da meta ────────────────────────────────────────────
    $pressure = pressure_by_city($records, $filters);

    $above = array_values(array_filter($pressure, static fn ($p) => $p['pressure_index'] !== null && $p['pressure_index'] > 0));
    usort($above, static fn ($a, $b) => $b['pressure_index'] <=> $a['pressure_index']);
    foreach (array_slice($above, 0, 5) as $p) {
        $insights[] = "{$p['crime']} está " . _pct($p['pressure_index']) . " acima da meta em {$p['mun']} "
            . "(avaliado: " . _numstr($p['avaliado']) . ", meta: " . _numstr($p['meta']) . ").";
    }

    $below = array_values(array_filter($pressure, static fn ($p) => $p['pressure_index'] !== null && $p['pressure_index'] < -0.1));
    usort($below, static fn ($a, $b) => $a['pressure_index'] <=> $b['pressure_index']);
    foreach (array_slice($below, 0, 3) as $p) {
        $insights[] = "{$p['crime']} está " . _pct(abs($p['pressure_index'])) . " abaixo da meta em {$p['mun']} — resultado positivo.";
    }

    // ── 3. Ranking de prioridade (1º e 2º) ───────────────────────────────────
    $ranking = priority_ranking($records, $filters);
    if (count($ranking) > 0) {
        $topItem = $ranking[0];
        $suffix = !empty($filters['crime']) ? " para {$topItem['crime']}" : " ({$topItem['crime']})";
        $insights[] = "{$topItem['mun']} possui o maior score de prioridade operacional" . $suffix
            . " — score: " . number_format($topItem['priority_score'], 3, '.', '') . ".";
    }
    if (count($ranking) > 1) {
        $second = $ranking[1];
        $insights[] = "{$second['mun']} aparece em 2º lugar no ranking de prioridade operacional"
            . " ({$second['crime']}) — score: " . number_format($second['priority_score'], 3, '.', '') . ".";
    }

    // ── 4. Alerta agregado de crimes sem meta ────────────────────────────────
    $semMeta = array_values(array_filter($pressure, static fn ($p) => $p['meta'] == 0.0 && $p['avaliado'] > 0));
    if (count($semMeta) > 0) {
        $unicos = array_values(array_unique(array_map(static fn ($s) => $s['crime'], $semMeta)));
        $insights[] = "Atenção: " . implode(', ', $unicos) . " sem meta definida em alguns municípios — pressão não calculável.";
    }

    return $insights;
}
