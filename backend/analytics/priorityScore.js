/**
 * priorityScore.js
 *
 * priority_score = (volume * 0.5) + (pressure_index * 0.3) + (trend_growth * 0.2)
 *
 * Identifica automaticamente as cidades que exigem prioridade operacional.
 * O volume é normalizado em relação ao maior valor do conjunto para garantir
 * que os pesos sejam comparáveis entre si.
 */

const { calcPressure } = require('./crimePressureIndex');
const { calcTrendGrowth } = require('./trendAnalysis');

/**
 * Calcula o score de prioridade para um item já com pressure_index e trend_growth.
 * @param {number} volumeNorm   - volume normalizado [0,1]
 * @param {number|null} pressure
 * @param {number|null} trend
 * @returns {number}
 */
function calcScore(volumeNorm, pressure, trend) {
  const p = pressure ?? 0;
  const t = trend    ?? 0;
  return (volumeNorm * 0.5) + (p * 0.3) + (t * 0.2);
}

/**
 * Gera ranking de prioridade operacional por cidade/crime.
 * @param {Array} records  - registros no formato interno
 * @param {Object} filters - { mes, crime, cia }
 * @returns {Array}        - ordenado por priority_score desc
 */
function priorityRanking(records, filters = {}) {
  const filtered = records.filter(r =>
    (!filters.mes   || r.mes   === filters.mes)   &&
    (!filters.crime || r.crime === filters.crime)  &&
    (!filters.cia   || r.cia   === filters.cia)
  );

  // Agrega por município + crime
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

  const items = Object.values(agg).map(a => ({
    ...a,
    pressure_index: calcPressure(a.avaliado, a.meta),
    trend_growth:   calcTrendGrowth(a.avaliado, a.anterior)
  }));

  // Normaliza o volume (avaliado) em relação ao máximo do conjunto
  const maxVol = Math.max(...items.map(i => i.avaliado), 1);
  const result = items.map(i => ({
    ...i,
    volume_norm:    i.avaliado / maxVol,
    priority_score: calcScore(i.avaliado / maxVol, i.pressure_index, i.trend_growth)
  }));

  // Ordena por score desc e adiciona posição
  result.sort((a, b) => b.priority_score - a.priority_score);
  return result.map((item, idx) => ({ ...item, rank: idx + 1 }));
}

module.exports = { calcScore, priorityRanking };
