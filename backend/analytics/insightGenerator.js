/**
 * insightGenerator.js
 *
 * Traduz os índices analíticos em frases em português para exibição no dashboard.
 * Os insights são gerados automaticamente a cada requisição com base nos dados
 * filtrados do cache — sem texto fixo, tudo é calculado em tempo real.
 *
 * Exemplos de saída:
 *  - "Roubo aumentou 18.5% em relação ao período anterior em Votorantim."
 *  - "Homicídio está 23.0% acima da meta em Sorocaba (avaliado: 12, meta: 10)."
 *  - "Sorocaba possui o maior score de prioridade operacional (Roubo) — score: 0.847."
 *  - "Atenção: Tráfico sem meta definida em alguns municípios — pressão não calculável."
 *
 * Limiares utilizados (ajustáveis aqui se a operação mudar de critério):
 *  - trend_growth > +5%   → insight de crescimento (alerta)
 *  - trend_growth < -5%   → insight de redução (positivo)
 *  - pressure_index > 0   → qualquer extrapolação de meta gera insight
 *  - pressure_index < -10% → redução expressiva gera insight positivo
 *
 * Limites de itens por categoria (evita texto longo demais no dashboard):
 *  - Até 5 insights de crescimento
 *  - Até 3 insights de redução
 *  - Até 5 insights de pressão acima da meta
 *  - Até 3 insights de pressão abaixo da meta
 *  - Top 2 do ranking de prioridade
 *  - 1 alerta agregado de crimes sem meta
 *
 * Usado pela rota GET /api/analytics/insights (server.js).
 */

const { pressureByCity }  = require('./crimePressureIndex');
const { trendByCity }     = require('./trendAnalysis');
const { priorityRanking } = require('./priorityScore');

// Formata número decimal como percentual com 1 casa: 0.185 → "18.5%"
const PCT = v => `${(v * 100).toFixed(1)}%`;

// ── GERAÇÃO DE INSIGHTS ───────────────────────────────────────────────────────

/**
 * Gera lista de frases de insight em português sobre os dados filtrados.
 * A ordem dos insights reflete a prioridade: tendência → pressão → ranking → alertas.
 *
 * @param {Array}  records          - todos os registros do cache (Base de Dados RAC PM)
 * @param {Object} filters          - filtros opcionais passados pela rota
 * @param {string} [filters.mes]    - nome do mês
 * @param {string} [filters.crime]  - nome do crime
 * @param {string} [filters.cia]    - código/nome da CIA
 * @returns {string[]}              - array de frases prontas para exibição
 */
function generateInsights(records, filters = {}) {
  const insights = [];

  // ── 1. Tendências de crescimento e redução ────────────────────────────────
  // Limiar ±5%: variações menores são ruído estatístico e não geram insight
  const trends  = trendByCity(records, filters);
  const growing = trends.filter(t => t.trend_growth !== null && t.trend_growth > 0.05);
  const falling = trends.filter(t => t.trend_growth !== null && t.trend_growth < -0.05);

  // Crescimento: os 5 maiores são os mais críticos (já vêm ordenados desc por trendByCity)
  for (const t of growing.slice(0, 5)) {
    insights.push(
      `${t.crime} aumentou ${PCT(t.trend_growth)} em relação ao período anterior em ${t.mun}.`
    );
  }
  // Redução: os 3 maiores (em valor absoluto) — boas notícias em destaque
  for (const t of falling.slice(0, 3)) {
    insights.push(
      `${t.crime} reduziu ${PCT(Math.abs(t.trend_growth))} em relação ao período anterior em ${t.mun}.`
    );
  }

  // ── 2. Municípios acima e abaixo da meta SSP ──────────────────────────────
  const pressure = pressureByCity(records, filters);

  // Qualquer extrapolação da meta (> 0%) é considerada relevante
  const aboveMeta = pressure
    .filter(p => p.pressure_index !== null && p.pressure_index > 0)
    .sort((a, b) => b.pressure_index - a.pressure_index);

  for (const p of aboveMeta.slice(0, 5)) {
    insights.push(
      `${p.crime} está ${PCT(p.pressure_index)} acima da meta em ${p.mun} ` +
      `(avaliado: ${p.avaliado}, meta: ${p.meta}).`
    );
  }

  // Apenas reduções expressivas (> 10%) geram insight positivo — evita ruído
  const belowMeta = pressure
    .filter(p => p.pressure_index !== null && p.pressure_index < -0.1)
    .sort((a, b) => a.pressure_index - b.pressure_index);   // mais negativo primeiro

  for (const p of belowMeta.slice(0, 3)) {
    insights.push(
      `${p.crime} está ${PCT(Math.abs(p.pressure_index))} abaixo da meta em ${p.mun} — resultado positivo.`
    );
  }

  // ── 3. Ranking de prioridade operacional ──────────────────────────────────
  // Destaca o 1º e 2º colocados para orientar o planejamento do batalhão
  const ranking = priorityRanking(records, filters);
  if (ranking.length > 0) {
    const top = ranking[0];
    insights.push(
      `${top.mun} possui o maior score de prioridade operacional` +
      // Quando há filtro de crime, o nome do crime está implícito; senão exibe entre parênteses
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

  // ── 4. Alerta de crimes sem meta definida ─────────────────────────────────
  // Agrupado em um único insight para não poluir o painel com um alerta por crime
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
