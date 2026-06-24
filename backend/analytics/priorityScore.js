/**
 * priorityScore.js
 *
 * Gera o Score de Prioridade Operacional — índice composto que combina
 * volume de ocorrências, pressão sobre a meta e tendência de crescimento
 * para identificar automaticamente onde o batalhão deve concentrar esforços.
 *
 * Fórmula:
 *   priority_score = (volume_norm × 0.5) + (pressure_index × 0.3) + (trend_growth × 0.2)
 *
 * Pesos e justificativa:
 *   50% volume     → cidades com mais crimes absolutos exigem mais recursos,
 *                    independentemente de meta ou tendência
 *   30% pressão    → estar acima da meta SSP é o segundo fator mais crítico
 *   20% tendência  → crescimento recente indica piora estrutural
 *
 * O volume é normalizado [0,1] em relação ao maior do conjunto para que os
 * três componentes sejam comparáveis (todos na mesma escala proporcional).
 *
 * Usado por:
 *  - cityRanking.js      → ranking de prioridade do batalhão
 *  - insightGenerator.js → insight da cidade com maior score
 *  - rota GET /api/analytics/priority (server.js)
 */

const { calcPressure }    = require('./crimePressureIndex');
const { calcTrendGrowth } = require('./trendAnalysis');

// ── CÁLCULO DO SCORE ──────────────────────────────────────────────────────────

/**
 * Aplica a fórmula ponderada para um item já calculado.
 * null em pressure ou trend é tratado como 0 (neutro) — não penaliza nem beneficia.
 *
 * @param {number}      volumeNorm  - volume normalizado [0,1] em relação ao máximo do conjunto
 * @param {number|null} pressure    - pressure_index do crimePressureIndex
 * @param {number|null} trend       - trend_growth do trendAnalysis
 * @returns {number}                - score final (sem limite superior definido)
 */
function calcScore(volumeNorm, pressure, trend) {
  // ?? 0 → dados ausentes não distorcem o ranking; cidade sem histórico fica neutra
  const p = pressure ?? 0;
  const t = trend    ?? 0;
  return (volumeNorm * 0.5) + (p * 0.3) + (t * 0.2);
}

// ── RANKING DE PRIORIDADE ─────────────────────────────────────────────────────

/**
 * Agrega registros por município+crime, calcula os três componentes do score
 * e devolve o ranking completo ordenado do mais crítico ao menos crítico.
 *
 * @param {Array}  records          - registros do cache (Base de Dados RAC PM)
 * @param {Object} filters          - filtros opcionais
 * @param {string} [filters.mes]    - nome do mês
 * @param {string} [filters.crime]  - nome do crime
 * @param {string} [filters.cia]    - código/nome da CIA
 * @returns {Array}                 - itens com rank, priority_score, volume_norm,
 *                                    pressure_index, trend_growth e totais
 */
function priorityRanking(records, filters = {}) {
  // ── 1. Aplica filtros opcionais ───────────────────────────────────────────
  const filtered = records.filter(r =>
    (!filters.mes   || r.mes   === filters.mes)   &&
    (!filters.crime || r.crime === filters.crime)  &&
    (!filters.cia   || r.cia   === filters.cia)
  );

  // ── 2. Agrega por município+crime (soma todos os meses do período) ────────
  const agg = {};
  for (const r of filtered) {
    const key = `${r.mun}||${r.crime}`;
    if (!agg[key]) {
      agg[key] = { mun: r.mun, crime: r.crime, avaliado: 0, meta: 0, anterior: 0 };
    }
    agg[key].avaliado += r.avaliado;
    agg[key].meta     += r.meta;
    agg[key].anterior += r.anterior;
  }

  // ── 3. Calcula pressure_index e trend_growth sobre os totais ─────────────
  const items = Object.values(agg).map(a => ({
    ...a,
    pressure_index: calcPressure(a.avaliado, a.meta),
    trend_growth:   calcTrendGrowth(a.avaliado, a.anterior)
  }));

  // ── 4. Normaliza volume em relação ao maior do conjunto ───────────────────
  // Math.max(..., 1) evita divisão por zero quando todos os avaliados são 0
  const maxVol = Math.max(...items.map(i => i.avaliado), 1);
  const result = items.map(i => ({
    ...i,
    volume_norm:    i.avaliado / maxVol,
    priority_score: calcScore(i.avaliado / maxVol, i.pressure_index, i.trend_growth)
  }));

  // ── 5. Ordena por score desc e adiciona posição 1-based ──────────────────
  result.sort((a, b) => b.priority_score - a.priority_score);
  return result.map((item, idx) => ({ ...item, rank: idx + 1 }));
}

module.exports = { calcScore, priorityRanking };
