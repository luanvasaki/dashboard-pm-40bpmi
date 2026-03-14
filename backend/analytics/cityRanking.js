/**
 * cityRanking.js
 *
 * Gera rankings de cidades baseados em:
 *  - pressure_index (índice de pressão criminal)
 *  - priority_score (score de prioridade operacional)
 */

const { pressureByCity }  = require('./crimePressureIndex');
const { priorityRanking } = require('./priorityScore');

/**
 * Ranking de cidades por maior índice de pressão (acima da meta).
 * @param {Array}  records
 * @param {Object} filters  - { mes, crime, cia }
 * @param {number} top      - quantos retornar (default: 10)
 * @returns {Array}
 */
function rankingByPressure(records, filters = {}, top = 10) {
  return pressureByCity(records, filters)
    .filter(i => i.pressure_index !== null)
    .sort((a, b) => b.pressure_index - a.pressure_index)
    .slice(0, top)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));
}

/**
 * Ranking de cidades por score de prioridade operacional.
 * @param {Array}  records
 * @param {Object} filters  - { mes, crime, cia }
 * @param {number} top      - quantos retornar (default: 10)
 * @returns {Array}
 */
function rankingByPriority(records, filters = {}, top = 10) {
  return priorityRanking(records, filters).slice(0, top);
}

/**
 * Ranking combinado: retorna ambos os rankings em um único objeto.
 * @param {Array}  records
 * @param {Object} filters
 * @param {number} top
 * @returns {{ byPressure: Array, byPriority: Array }}
 */
function fullRanking(records, filters = {}, top = 10) {
  return {
    byPressure: rankingByPressure(records, filters, top),
    byPriority: rankingByPriority(records, filters, top)
  };
}

module.exports = { rankingByPressure, rankingByPriority, fullRanking };
