<?php
/**
 * trend_analysis.php — Tendência de crescimento/redução criminal.
 * Fórmula: trend_growth = (avaliado - anterior) / anterior   (null se anterior = 0)
 * Porta de backend/analytics/trendAnalysis.js.
 */

declare(strict_types=1);

/** Variação proporcional entre período atual e anterior. null se anterior = 0. */
function calc_trend_growth(float $atual, float $anterior): ?float
{
    if ($anterior == 0.0) {
        return null;
    }
    return ($atual - $anterior) / $anterior;
}

/**
 * Filtra, agrega por município+crime e calcula trend_growth sobre os totais.
 * Ordenado por trend_growth desc (null fica no fim).
 * @return list<array{mun:string,crime:string,avaliado:float,anterior:float,meta:float,trend_growth:?float}>
 */
function trend_by_city(array $records, array $filters = []): array
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
            $agg[$key] = ['mun' => $r['mun'], 'crime' => $r['crime'], 'avaliado' => 0.0, 'anterior' => 0.0, 'meta' => 0.0];
        }
        $agg[$key]['avaliado'] += $r['avaliado'];
        $agg[$key]['anterior'] += $r['anterior'];
        $agg[$key]['meta']     += $r['meta'];
    }

    $out = [];
    foreach ($agg as $a) {
        $a['trend_growth'] = calc_trend_growth($a['avaliado'], $a['anterior']);
        $out[] = $a;
    }

    usort($out, static function ($a, $b) {
        $av = $a['trend_growth'] ?? -INF;
        $bv = $b['trend_growth'] ?? -INF;
        return $bv <=> $av;
    });
    return $out;
}
