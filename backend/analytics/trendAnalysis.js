/**
 * trendAnalysis.js
 *
 * Detecta e mede tendências de crescimento/redução criminal entre períodos.
 *
 * Fórmula: trend_growth = (avaliado - anterior) / anterior
 *
 * Interpretação:
 *  +0.30  → cresceu 30% em relação ao período anterior (piora)
 *   0.00  → estável
 *  -0.20  → reduziu 20% em relação ao período anterior (melhora)
 *
 * "anterior" refere-se ao campo Anterior da tabela "Base de Dados RAC PM",
 * que representa o mesmo período do ano anterior (comparação homóloga SSP).
 *
 * Usado por:
 *  - insightGenerator.js → insights de tendência (limiar de ±5% para gerar alerta)
 *  - priorityScore.js    → componente de tendência no score (peso 20%)
 *  - rota GET /api/analytics/trend (server.js)
 */

// ── CÁLCULO UNITÁRIO ──────────────────────────────────────────────────────────

/**
 * Calcula variação percentual entre o período atual e o anterior.
 * Retorna null quando não há dado anterior (evita divisão por zero).
 *
 * @param {number} atual     - ocorrências do período avaliado
 * @param {number} anterior  - ocorrências do mesmo período no ano anterior
 * @returns {number|null}    - variação proporcional; null se anterior = 0
 */
function calcTrendGrowth(atual, anterior) {
  // Sem referência histórica não é possível calcular variação
  if (!anterior || anterior === 0) return null;
  return (atual - anterior) / anterior;
}

// ── ENRIQUECIMENTO EM LOTE ────────────────────────────────────────────────────

/**
 * Enriquece todos os registros do cache com o campo trend_growth.
 * Usado antes de qualquer agregação, quando o crescimento por linha é necessário.
 *
 * @param {Array} records  - registros do cache com campos avaliado e anterior
 * @returns {Array}        - mesmos registros com trend_growth adicionado
 */
function calcTrends(records) {
  return records.map(r => ({
    ...r,
    trend_growth: calcTrendGrowth(r.avaliado, r.anterior)
  }));
}

// ── AGREGAÇÃO POR CIDADE ──────────────────────────────────────────────────────

/**
 * Filtra, agrega por município+crime e calcula trend_growth sobre os totais.
 * Ordenado decrescente para que os maiores crescimentos (mais críticos) venham primeiro.
 *
 * @param {Array}  records          - todos os registros do cache
 * @param {Object} filters          - filtros opcionais
 * @param {string} [filters.mes]    - nome do mês
 * @param {string} [filters.crime]  - nome do crime
 * @param {string} [filters.cia]    - código/nome da CIA
 * @returns {Array}                 - ordenado por trend_growth desc; null fica no fim
 */
function trendByCity(records, filters = {}) {
  // ── 1. Aplica filtros opcionais ───────────────────────────────────────────
  const filtered = records.filter(r =>
    (!filters.mes   || r.mes   === filters.mes)   &&
    (!filters.crime || r.crime === filters.crime)  &&
    (!filters.cia   || r.cia   === filters.cia)
  );

  // ── 2. Agrega somando avaliado, anterior e meta por município+crime ───────
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

  // ── 3. Recalcula trend_growth e ordena — null recebe -Infinity para ir ao fim ──
  return Object.values(agg)
    .map(a => ({
      ...a,
      trend_growth: calcTrendGrowth(a.avaliado, a.anterior)
    }))
    // ?? -Infinity garante que itens sem dado anterior não bloqueiem o sort
    .sort((a, b) => (b.trend_growth ?? -Infinity) - (a.trend_growth ?? -Infinity));
}

module.exports = { calcTrendGrowth, calcTrends, trendByCity };
