/**
 * insightGenerator.js
 *
 * Gera insights automáticos em linguagem natural a partir dos dados analíticos.
 * Exemplos de saída:
 *  - "Roubo aumentou em relação ao mês anterior."
 *  - "Homicídio está acima da meta em Votorantim."
 *  - "Votorantim possui o maior score de prioridade operacional."
 */

const { pressureByCity }  = require('./crimePressureIndex');
const { trendByCity }     = require('./trendAnalysis');
const { priorityRanking } = require('./priorityScore');

const PCT = v => `${(v * 100).toFixed(1)}%`;

/**
 * Gera lista de insights textuais.
 * @param {Array}  records  - dados em cache
 * @param {Object} filters  - { mes, crime, cia } (opcional)
 * @returns {string[]}
 */
function generateInsights(records, filters = {}) {
  const insights = [];

  // ── 1. Tendências de crescimento ──────────────────────────────────────────
  const trends = trendByCity(records, filters);
  const growing = trends.filter(t => t.trend_growth !== null && t.trend_growth > 0.05);
  const falling = trends.filter(t => t.trend_growth !== null && t.trend_growth < -0.05);

  for (const t of growing.slice(0, 5)) {
    insights.push(
      `${t.crime} aumentou ${PCT(t.trend_growth)} em relação ao período anterior em ${t.mun}.`
    );
  }
  for (const t of falling.slice(0, 3)) {
    insights.push(
      `${t.crime} reduziu ${PCT(Math.abs(t.trend_growth))} em relação ao período anterior em ${t.mun}.`
    );
  }

  // ── 2. Municípios acima da meta ───────────────────────────────────────────
  const pressure = pressureByCity(records, filters);
  const aboveMeta = pressure
    .filter(p => p.pressure_index !== null && p.pressure_index > 0)
    .sort((a, b) => b.pressure_index - a.pressure_index);

  for (const p of aboveMeta.slice(0, 5)) {
    insights.push(
      `${p.crime} está ${PCT(p.pressure_index)} acima da meta em ${p.mun} ` +
      `(avaliado: ${p.avaliado}, meta: ${p.meta}).`
    );
  }

  const belowMeta = pressure
    .filter(p => p.pressure_index !== null && p.pressure_index < -0.1)
    .sort((a, b) => a.pressure_index - b.pressure_index);

  for (const p of belowMeta.slice(0, 3)) {
    insights.push(
      `${p.crime} está ${PCT(Math.abs(p.pressure_index))} abaixo da meta em ${p.mun} — resultado positivo.`
    );
  }

  // ── 3. Prioridade operacional ─────────────────────────────────────────────
  const ranking = priorityRanking(records, filters);
  if (ranking.length > 0) {
    const top = ranking[0];
    insights.push(
      `${top.mun} possui o maior score de prioridade operacional` +
      (filters.crime ? ` para ${top.crime}` : ` (${top.crime})`) +
      ` — score: ${top.priority_score.toFixed(3)}.`
    );
  }
  if (ranking.length > 1) {
    const second = ranking[1];
    insights.push(
      `${second.mun} aparece em 2º lugar no ranking de prioridade operacional` +
      ` (${second.crime}) — score: ${second.priority_score.toFixed(3)}.`
    );
  }

  // ── 4. Crimes sem meta definida ───────────────────────────────────────────
  const semMeta = pressure.filter(p => p.meta === 0 && p.avaliado > 0);
  if (semMeta.length > 0) {
    const unicos = [...new Set(semMeta.map(s => s.crime))];
    insights.push(
      `Atenção: ${unicos.join(', ')} sem meta definida em alguns municípios — pressão não calculável.`
    );
  }

  return insights;
}

module.exports = { generateInsights };
