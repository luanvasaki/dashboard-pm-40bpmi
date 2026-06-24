/**
 * cityRanking.js
 *
 * Módulo de fachada (facade) que combina os dois rankings principais do dashboard:
 *
 *  1. Por Pressão   → cidades mais acima da meta SSP (pior relação avaliado/meta)
 *  2. Por Prioridade → cidades com maior score composto (volume + pressão + tendência)
 *
 * Diferença entre os dois rankings:
 *  - Pressão pura identifica quem está mais fora da meta, mas ignora volume e tendência.
 *    Útil para cobranças de meta da SSP.
 *  - Prioridade considera os três fatores ponderados e indica onde alocar recursos
 *    operacionais (patrulhamento, operações especiais, etc.).
 *
 * Usado pela rota GET /api/analytics/ranking (server.js).
 * O frontend exibe os dois rankings lado a lado na aba de análise.
 */

const { pressureByCity }  = require('./crimePressureIndex');
const { priorityRanking } = require('./priorityScore');

// ── RANKING POR PRESSÃO ───────────────────────────────────────────────────────

/**
 * Retorna as `top` cidades com maior índice de pressão (mais acima da meta).
 * Cidades sem meta definida (pressure_index = null) são excluídas.
 *
 * @param {Array}  records          - registros do cache
 * @param {Object} filters          - { mes, crime, cia }
 * @param {number} [top=10]         - número máximo de resultados
 * @returns {Array}                 - itens com rank, mun, crime, pressure_index, avaliado, meta
 */
function rankingByPressure(records, filters = {}, top = 10) {
  return pressureByCity(records, filters)
    .filter(i => i.pressure_index !== null)       // exclui crimes sem meta SSP
    .sort((a, b) => b.pressure_index - a.pressure_index)
    .slice(0, top)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));
}

// ── RANKING POR PRIORIDADE ────────────────────────────────────────────────────

/**
 * Retorna as `top` cidades com maior score de prioridade operacional.
 * O ranking completo já vem ordenado de priorityRanking — apenas fatia.
 *
 * @param {Array}  records          - registros do cache
 * @param {Object} filters          - { mes, crime, cia }
 * @param {number} [top=10]         - número máximo de resultados
 * @returns {Array}                 - itens com rank, priority_score e componentes
 */
function rankingByPriority(records, filters = {}, top = 10) {
  return priorityRanking(records, filters).slice(0, top);
}

// ── RANKING COMBINADO ─────────────────────────────────────────────────────────

/**
 * Conveniência: calcula os dois rankings em uma única chamada.
 * Usado pela rota /api/analytics/ranking para retornar ambos ao frontend.
 *
 * @param {Array}  records
 * @param {Object} filters
 * @param {number} [top=10]
 * @returns {{ byPressure: Array, byPriority: Array }}
 */
function fullRanking(records, filters = {}, top = 10) {
  return {
    byPressure: rankingByPressure(records, filters, top),
    byPriority: rankingByPriority(records, filters, top)
  };
}

module.exports = { rankingByPressure, rankingByPriority, fullRanking };
