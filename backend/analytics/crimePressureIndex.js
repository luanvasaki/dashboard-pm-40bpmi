/**
 * crimePressureIndex.js
 *
 * Calcula o Índice de Pressão Criminal — métrica central do dashboard.
 *
 * Fórmula: pressure_index = (avaliado - meta) / meta
 *
 * Interpretação:
 *  +0.20  → 20% acima da meta  (situação crítica, requer atenção operacional)
 *   0.00  → exatamente na meta
 *  -0.15  → 15% abaixo da meta (resultado positivo)
 *
 * Usado por:
 *  - insightGenerator.js   → insights automáticos de pressão
 *  - cityRanking.js        → ranking de cidades mais críticas
 *  - priorityScore.js      → um dos três fatores do score de prioridade
 *  - rota GET /api/analytics/pressure (server.js)
 */

// ── CÁLCULO UNITÁRIO ──────────────────────────────────────────────────────────

/**
 * Calcula o índice de pressão para um único par avaliado/meta.
 * Retorna null quando não há meta definida (evita divisão por zero).
 *
 * @param {number} avaliado  - ocorrências registradas no período avaliado
 * @param {number} meta      - meta SSP fixada para o período
 * @returns {number|null}    - índice proporcional; null se meta = 0
 */
function calcPressure(avaliado, meta) {
  // Meta zero significa que a SSP não fixou um alvo — índice incalculável
  if (!meta || meta === 0) return null;
  return (avaliado - meta) / meta;
}

// ── ENRIQUECIMENTO EM LOTE ────────────────────────────────────────────────────

/**
 * Enriquece todos os registros do cache com o campo pressure_index.
 * Usado quando se quer o índice por linha (antes de qualquer agregação).
 *
 * @param {Array} records  - registros no formato interno { mun, crime, mes, avaliado, meta, ... }
 * @returns {Array}        - mesmos registros com pressure_index adicionado
 */
function calcPressureIndex(records) {
  return records.map(r => ({
    ...r,                                        // preserva todos os campos originais
    pressure_index: calcPressure(r.avaliado, r.meta)
  }));
}

// ── AGREGAÇÃO POR CIDADE ──────────────────────────────────────────────────────

/**
 * Filtra, agrega por município+crime (somando avaliado e meta de todos os meses)
 * e recalcula o índice de pressão sobre o total — útil para visão anual consolidada.
 *
 * A chave de agregação usa '||' como separador porque esse par de caracteres
 * não ocorre em nomes de município ou crime do banco da SSP.
 *
 * @param {Array}  records          - todos os registros do cache
 * @param {Object} filters          - filtros opcionais
 * @param {string} [filters.mes]    - nome do mês (ex: 'Janeiro')
 * @param {string} [filters.crime]  - nome do crime (ex: 'Homicídio')
 * @param {string} [filters.cia]    - código/nome da CIA
 * @returns {Array}                 - um objeto por par município+crime com pressure_index
 */
function pressureByCity(records, filters = {}) {
  // ── 1. Aplica filtros opcionais ───────────────────────────────────────────
  const filtered = records.filter(r =>
    (!filters.mes   || r.mes   === filters.mes)   &&
    (!filters.crime || r.crime === filters.crime)  &&
    (!filters.cia   || r.cia   === filters.cia)
  );

  // ── 2. Agrega somando avaliado, meta e anterior por município+crime ───────
  const agg = {};
  for (const r of filtered) {
    const key = `${r.mun}||${r.crime}`;
    if (!agg[key]) {
      // Inicializa o acumulador para este par na primeira ocorrência
      agg[key] = { mun: r.mun, crime: r.crime, avaliado: 0, meta: 0, anterior: 0 };
    }
    agg[key].avaliado += r.avaliado;
    agg[key].meta     += r.meta;
    agg[key].anterior += r.anterior;
  }

  // ── 3. Recalcula pressure_index sobre os totais acumulados ────────────────
  return Object.values(agg).map(a => ({
    ...a,
    pressure_index: calcPressure(a.avaliado, a.meta)
  }));
}

module.exports = { calcPressure, calcPressureIndex, pressureByCity };
