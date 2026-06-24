/**
 * targetDeviation.js
 *
 * Calcula e classifica o desvio entre o valor avaliado e a meta SSP.
 * Complementa o crimePressureIndex com uma visão mais descritiva:
 * além do índice proporcional, fornece o desvio absoluto e um rótulo
 * semântico de situação (acima_meta / na_meta / abaixo_meta / sem_meta).
 *
 * Relação com crimePressureIndex:
 *  - desvio.percentual  é matematicamente idêntico ao pressure_index
 *  - desvio.absoluto    informa quantas ocorrências a mais/menos em números brutos
 *  - desvio.situacao    é o rótulo textual usado nos cards e filtros do frontend
 *
 * Tolerância de ±2%:
 *  Registros com variação menor que 2% são classificados como 'na_meta' para
 *  evitar que diferenças de arredondamento ou ajustes mínimos gerem alertas.
 *
 * Usado pela rota GET /api/analytics/deviation (server.js) e pelos
 * cards de KPI individuais do dashboard.
 */

// ── CÁLCULO UNITÁRIO ──────────────────────────────────────────────────────────

/**
 * Calcula o desvio absoluto, percentual e classificação de situação
 * para um par avaliado/meta.
 *
 * @param {number} avaliado  - ocorrências registradas no período avaliado
 * @param {number} meta      - meta SSP fixada para o período
 * @returns {{ absoluto: number, percentual: number|null, situacao: string }}
 *   absoluto   → diferença em números de ocorrências (pode ser negativo)
 *   percentual → diferença proporcional à meta (null se meta = 0)
 *   situacao   → 'acima_meta' | 'na_meta' | 'abaixo_meta' | 'sem_meta'
 */
function desvio(avaliado, meta) {
  const absoluto   = avaliado - meta;
  const percentual = meta !== 0 ? absoluto / meta : null;

  let situacao;
  if (percentual === null) {
    // Meta zero → SSP não fixou alvo para este crime/período
    situacao = 'sem_meta';
  } else if (Math.abs(percentual) < 0.02) {
    // Variação menor que ±2% é considerada "dentro da meta" (tolerância operacional)
    situacao = 'na_meta';
  } else if (absoluto > 0) {
    // Avaliado maior que a meta → mais crimes do que o permitido
    situacao = 'acima_meta';
  } else {
    // Avaliado menor que a meta → resultado positivo de redução criminal
    situacao = 'abaixo_meta';
  }

  return { absoluto, percentual, situacao };
}

// ── ENRIQUECIMENTO EM LOTE ────────────────────────────────────────────────────

/**
 * Enriquece cada registro com o objeto `desvio` calculado.
 * O resultado aninhado permite acessar r.desvio.situacao no frontend.
 *
 * @param {Array} records  - registros do cache com avaliado e meta
 * @returns {Array}        - mesmos registros com campo desvio adicionado
 */
function calcTargetDeviation(records) {
  return records.map(r => ({
    ...r,
    desvio: desvio(r.avaliado, r.meta)
  }));
}

// ── AGREGAÇÃO POR CIDADE ──────────────────────────────────────────────────────

/**
 * Filtra, agrega por município+crime e aplica desvio() sobre os totais.
 * O spread (...desvio()) coloca absoluto, percentual e situacao direto no objeto.
 *
 * @param {Array}  records          - registros do cache
 * @param {Object} filters          - filtros opcionais
 * @param {string} [filters.mes]    - nome do mês
 * @param {string} [filters.crime]  - nome do crime
 * @param {string} [filters.cia]    - código/nome da CIA
 * @returns {Array}                 - um objeto por par município+crime com campos de desvio
 */
function deviationSummaryByCity(records, filters = {}) {
  // ── 1. Aplica filtros ─────────────────────────────────────────────────────
  const filtered = records.filter(r =>
    (!filters.mes   || r.mes   === filters.mes)   &&
    (!filters.crime || r.crime === filters.crime)  &&
    (!filters.cia   || r.cia   === filters.cia)
  );

  // ── 2. Agrega por município+crime ─────────────────────────────────────────
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

  // ── 3. Aplica desvio() sobre os totais e espalha os campos no objeto ──────
  return Object.values(agg).map(a => ({
    ...a,
    ...desvio(a.avaliado, a.meta)    // adiciona absoluto, percentual, situacao diretamente
  }));
}

module.exports = { desvio, calcTargetDeviation, deviationSummaryByCity };
