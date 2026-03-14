/**
 * trendAnalysis.js
 * trend_growth = (avaliado - anterior) / anterior
 *
 * Detecta tendências de crescimento criminal.
 * Valores positivos = crescimento (piora).
 * Valores negativos = redução (melhora).
 */

/**
 * Calcula variação percentual entre dois períodos.
 * @param {number} atual
 * @param {number} anterior
 * @returns {number|null}
 */
function calcTrendGrowth(atual, anterior) {
  if (!anterior || anterior === 0) return null;
  return (atual - anterior) / anterior;
}

/**
 * Enriquece todos os registros com trend_growth.
 * @param {Array} records
 * @returns {Array}
 */
function calcTrends(records) {
  return records.map(r => ({
    ...r,
    trend_growth: calcTrendGrowth(r.avaliado, r.anterior)
  }));
}

/**
 * Agrega tendência por município+crime.
 * @param {Array} records
 * @param {Object} filters  - { mes, crime, cia }
 * @returns {Array}         - ordenado por trend_growth desc (maiores crescimentos primeiro)
 */
function trendByCity(records, filters = {}) {
  const filtered = records.filter(r =>
    (!filters.mes   || r.mes   === filters.mes)   &&
    (!filters.crime || r.crime === filters.crime)  &&
    (!filters.cia   || r.cia   === filters.cia)
  );

  const agg = {};
  for (const r of filtered) {
    const key = `${r.mun}||${r.crime}`;
    if (!agg[key]) {
      agg[key] = { mun: r.mun, crime: r.crime, avaliado: 0, anterior: 0, meta: 0 };
    }
    agg[key].avaliado += r.avaliado;
    agg[key].anterior += r.anterior;
    agg[key].meta     += r.meta;
  }

  return Object.values(agg)
    .map(a => ({
      ...a,
      trend_growth: calcTrendGrowth(a.avaliado, a.anterior)
    }))
    .sort((a, b) => (b.trend_growth ?? -Infinity) - (a.trend_growth ?? -Infinity));
}

module.exports = { calcTrendGrowth, calcTrends, trendByCity };
