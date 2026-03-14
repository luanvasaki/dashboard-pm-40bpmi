/**
 * targetDeviation.js
 * Mantém as comparações existentes de meta vs avaliado.
 *
 * Funções:
 *  - desvioAbsoluto   : avaliado - meta
 *  - desvioPercentual : (avaliado - meta) / meta  (igual ao pressure_index)
 *  - situacao         : classifica como 'acima_meta', 'na_meta', 'abaixo_meta'
 */

/**
 * @param {number} avaliado
 * @param {number} meta
 * @returns {{ absoluto: number, percentual: number|null, situacao: string }}
 */
function desvio(avaliado, meta) {
  const absoluto   = avaliado - meta;
  const percentual = meta !== 0 ? absoluto / meta : null;

  let situacao;
  if (percentual === null) {
    situacao = 'sem_meta';
  } else if (Math.abs(percentual) < 0.02) {
    // tolerância de ±2 %
    situacao = 'na_meta';
  } else if (absoluto > 0) {
    situacao = 'acima_meta';
  } else {
    situacao = 'abaixo_meta';
  }

  return { absoluto, percentual, situacao };
}

/**
 * Enriquece cada registro com informações de desvio de meta.
 * @param {Array} records
 * @returns {Array}
 */
function calcTargetDeviation(records) {
  return records.map(r => ({
    ...r,
    desvio: desvio(r.avaliado, r.meta)
  }));
}

/**
 * Resumo de desvio agregado por cidade.
 * @param {Array} records
 * @param {Object} filters  - { mes, crime, cia }
 * @returns {Array}
 */
function deviationSummaryByCity(records, filters = {}) {
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
    ...desvio(a.avaliado, a.meta)
  }));
}

module.exports = { desvio, calcTargetDeviation, deviationSummaryByCity };
