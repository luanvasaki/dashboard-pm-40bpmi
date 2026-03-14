/**
 * crimePressureIndex.js
 * pressure_index = (avaliado - meta) / meta
 *
 * Retorna índice de pressão criminal por município/crime.
 * Valores positivos = acima da meta (ruim).
 * Valores negativos = abaixo da meta (bom).
 */

/**
 * Calcula o índice de pressão para um único registro.
 * @param {number} avaliado  - valor avaliado (atual)
 * @param {number} meta      - valor da meta
 * @returns {number|null}
 */
function calcPressure(avaliado, meta) {
  if (!meta || meta === 0) return null;
  return (avaliado - meta) / meta;
}

/**
 * Calcula o índice de pressão para todos os registros fornecidos.
 * @param {Array} records  - registros no formato interno { mun, crime, mes, avaliado, meta, ... }
 * @returns {Array}        - registros enriquecidos com pressure_index
 */
function calcPressureIndex(records) {
  return records.map(r => ({
    ...r,
    pressure_index: calcPressure(r.avaliado, r.meta)
  }));
}

/**
 * Agrega por município+crime (soma avaliado e meta, depois recalcula pressão).
 * Útil para visão consolidada por cidade.
 * @param {Array} records
 * @param {Object} filters  - { mes, crime, cia }
 * @returns {Array}
 */
function pressureByCity(records, filters = {}) {
  const filtered = records.filter(r =>
    (!filters.mes   || r.mes   === filters.mes)   &&
    (!filters.crime || r.crime === filters.crime)  &&
    (!filters.cia   || r.cia   === filters.cia)
  );

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

  return Object.values(agg).map(a => ({
    ...a,
    pressure_index: calcPressure(a.avaliado, a.meta)
  }));
}

module.exports = { calcPressure, calcPressureIndex, pressureByCity };
