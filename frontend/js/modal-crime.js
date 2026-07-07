// ═══════════════════════════════════════════════════════════════════════════
// MODAL DE DETALHES (#mo) — análise aprofundada de um crime
// Aberto por moOpen(crime, color) ao clicar em KPI card ou barra do gráfico.
// Contém:
//   • 4 mini-KPIs: total avaliado, % vs meta, municípios fora da meta, status
//   • Gráfico de barras por município (avaliado × meta)
//   • Gráfico de evolução mensal (linha)
//   • Painel de inteligência InfoCrim (heatmap dia/hora, tipo local, bairros)
//   • Seção de Feminicídio (somente para Homicídio)
// Estado: moCrime, moColor, moMeses, moScopeType, moScopeVal
// ⚠ CRÍTICO: moDestroy() deve ser chamado antes de recriar gráficos para
//   evitar vazamento de memória (Chart.js não destrói instâncias automaticamente)
// ═══════════════════════════════════════════════════════════════════════════

let moIntelChs = [];

// Destrói todas as instâncias Chart.js do modal antes de re-renderizar
function moDestroy() {
  moCh.forEach(c => c.destroy()); moCh = [];
  moIntelChs.forEach(c => c.destroy()); moIntelChs = [];
  if (moFemCh) { moFemCh.destroy(); moFemCh = null; }
}

function moOpen(crime, color, displayLabel) {
  moDestroy();
  moCrime = crime; moColor = color;
  moMeses = [...selMeses];
  // Herda o filtro de CIA/cidade ativo no painel de inteligência
  const _sc = scope('visao');
  if (_sc.cia)      { moScopeType = 'cia'; moScopeVal = _sc.cia; }
  else if (_sc.mun) { moScopeType = 'mun'; moScopeVal = _sc.mun; }
  else              { moScopeType = 'btl'; moScopeVal = null; }
  moOcorrAll = [];
  moFemData = [];
  const femSec = document.getElementById('mo-fem-section');
  if (femSec) femSec.style.display = 'none';
  const label = displayLabel || (Array.isArray(crime) ? crime.join(' + ') : crime === 'Homicídio' ? 'Vítimas de Letalidade Violenta' : crime);
  document.getElementById('mo-crime').textContent      = label.toUpperCase();
  document.getElementById('mo-accent').style.background = color;
  buildMoFilter();
  moRender();
  document.getElementById('mo').classList.add('on');
  document.body.style.overflow = 'hidden';
  loadMoOcorr();
}

function moQScope() {
  if (moScopeType === 'cia') return { cia: moScopeVal };
  if (moScopeType === 'mun') return { mun: moScopeVal };
  return {};
}

function moScopeMuns() {
  if (moScopeType === 'mun') return [moScopeVal];
  if (moScopeType === 'cia') return MUNS.filter(m => RAW.some(r => r.mun === m && r.cia === moScopeVal));
  return MUNS;
}

function buildMoFilter() {
  let h = '<span class="pf-label">Período</span>';
  h += `<button class="pf-btn ${moMeses.length === MESES.length ? 'on' : ''}" onclick="moSetAllMes()">${selAno || new Date().getFullYear()}</button>`;
  const _moComDados = new Set(MESES);
  MES_ORD.forEach(m => {
    const ok = _moComDados.has(m);
    h += `<button class="pf-btn ${moMeses.includes(m) ? 'on' : ''}" data-mes="${m}" onclick="moTogMes('${m}')"${ok ? '' : ' style="opacity:.6" title="Sem dados"'}>${MES_ABREV[m] || m}</button>`;
  });
  h += '<span class="pf-sep"></span>';
  h += `<button class="pf-btn ${moScopeType === 'btl' ? 'on' : ''}" onclick="moSetScope('btl',null)">Batalhão</button>`;
  h += '<div class="pf-field"><span class="pf-label">CIA</span><select name="mo-cia" autocomplete="off" class="pf-select" style="min-width:90px" onchange="moSetScope(\'cia\',this.value)"><option value="">—</option>';
  CIAS.forEach(c => h += `<option value="${c}" ${moScopeType==='cia'&&moScopeVal===c?'selected':''}>${c}</option>`);
  h += '</select></div>';
  const munListMo = moScopeType === 'cia' ? MUNS.filter(m => RAW.some(r => r.mun === m && normCiaKey(r.cia) === normCiaKey(moScopeVal))) : MUNS;
  h += '<div class="pf-field"><span class="pf-label">Município</span><select name="mo-mun" autocomplete="off" class="pf-select" style="min-width:130px" onchange="moSetScope(\'mun\',this.value)"><option value="">—</option>';
  munListMo.forEach(m => h += `<option value="${m}" ${moScopeType==='mun'&&moScopeVal===m?'selected':''}>${m}</option>`);
  h += '</select></div>';
  document.getElementById('mo-filter-bar').innerHTML = h;
}

function moSetAllMes() { moMeses = [...MESES]; buildMoFilter(); moRender(); }

function moTogMes(mes) {
  if (moMeses.length === MESES.length) { moMeses = [mes]; }
  else {
    const idx = moMeses.indexOf(mes);
    if (idx >= 0) { moMeses.splice(idx, 1); if (!moMeses.length) moMeses = [...MESES]; }
    else { moMeses.push(mes); moMeses.sort((a,b) => MESES.indexOf(a)-MESES.indexOf(b)); }
  }
  buildMoFilter(); moRender();
}

function moSetScope(type, val) {
  if (type === 'btl' || !val) { moScopeType = 'btl'; moScopeVal = null; }
  else { moScopeType = type; moScopeVal = val; }
  buildMoFilter(); moRender();
}

function moRender() {
  moDestroy();
  const crime = moCrime, color = moColor;
  const sc  = moQScope();
  const muns = moScopeMuns();

  const dbgTotal = q({ crime, mes: moMeses, ...sc }).length;
  document.getElementById('mo-sub').textContent = 'ANÁLISE DETALHADA — ' + pLbl(moMeses).toUpperCase() + ` (${dbgTotal} reg. RAC)`;

  const aval = sf(q({ crime, mes: moMeses, ...sc }));
  const meta = sf(q({ crime, mes: moMeses, ...sc }), 'meta');
  const ant  = sf(q({ crime, mes: moMeses, ...sc }), 'anterior');
  // % desvio em relação à meta (igual ao KPI card)
  const vp   = meta > 0 ? ((aval - meta) / meta * 100).toFixed(0) : (aval > 0 ? 100 : 0);

  const munDesvio   = muns.map(m => {
    const v  = sf(q({ crime, mun: m, mes: moMeses, ...sc }));
    const mt = sf(q({ crime, mun: m, mes: moMeses, ...sc }), 'meta');
    return { m: m || 'Btl/CIA', v, mt, desvio: mt > 0 ? (v - mt) / mt * 100 : -Infinity };
  });
  const acimaDoMeta = munDesvio.filter(x => x.mt > 0 && x.v > x.mt).sort((a,b) => b.desvio - a.desvio);
  const vc  = parseFloat(vp) <= 0 ? 'var(--green2)' : 'var(--red2)';
  const mok = meta > 0 && aval <= meta;

  const munCriticoHtml = acimaDoMeta.length === 0
    ? `<div class="mk-val" style="color:var(--green2);font-size:22px;padding-top:4px">✓ Todos na meta</div><div class="mk-sub" style="font-size:22px">Nenhum município acima</div>`
    : acimaDoMeta.map(x => `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><span style="font-size:22px;font-weight:700;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${x.m}</span><span style="font-family:'DM Mono',monospace;font-size:22px;color:#ffaaaa;margin-left:8px;flex-shrink:0">+${x.desvio.toFixed(0)}%</span></div>`).join('');

  document.getElementById('mo-kpis').innerHTML = `
    <div class="mk"><div class="mk-lbl">Total Avaliado</div><div class="mk-val" style="color:${color}">${aval}</div><div class="mk-sub">${pLbl(moMeses)}</div></div>
    <div class="mk"><div class="mk-lbl">Avaliado × Meta</div><div class="mk-val" style="color:${vc}">${parseFloat(vp) <= 0 ? '▼' : '▲'}${Math.abs(vp)}%</div><div class="mk-sub" style="font-size:22px">Meta: ${meta}</div></div>
    <div class="mk"><div class="mk-lbl">Municípios Fora da Meta (${acimaDoMeta.length})</div>${munCriticoHtml}</div>
    <div class="mk"><div class="mk-lbl">Status</div><div class="mk-val" style="color:${mok?'var(--green2)':'var(--red2)'};font-size:22px;padding-top:6px">${mok?'✓ Na meta':'✗ Acima'}</div><div class="mk-sub" style="font-size:22px">Meta: ${meta} | Real: ${aval}</div></div>
    `;
  if (crime === 'Homicídio') updateFemKpi();

  // Meta vs Avaliado — helper que renderiza um gráfico % desvio por município
  const renderMetaChart = (canvasId, crimeKey) => {
    const namedMuns  = muns.filter(m => m !== '');
    const emptyAval  = sf(q({ crime: crimeKey, mun: '', mes: moMeses }));
    const emptyMeta  = sf(q({ crime: crimeKey, mun: '', mes: moMeses }), 'meta');
    const emptyMant  = sf(q({ crime: crimeKey, mun: '', mes: moMeses }), 'anterior');
    const emptyMtnd  = sf(q({ crime: crimeKey, mun: '', mes: moMeses }), 'tend');
    const totalAval  = sf(q({ crime: crimeKey, mes: moMeses, ...sc }));
    const namedTotal = sf(q({ crime: crimeKey, mes: moMeses, ...sc }).filter(r => r.mun !== ''));
    const gapAval    = Math.max(0, totalAval - emptyAval - namedTotal);
    const chartMuns  = gapAval > 0
      ? [...namedMuns, '', '(Sem mun.)']
      : [...namedMuns, ...(emptyAval > 0 || emptyMeta > 0 ? [''] : [])];
    const munLabel = m => m === '' ? '(Btl/CIA)' : m ? m.split(' ')[0] : '(Sem mun.)';
    const mm   = chartMuns.map(m => m === '' ? emptyMeta  : m === '(Sem mun.)' ? 0       : sf(q({ crime: crimeKey, mun: m, mes: moMeses }), 'meta'));
    const ma   = chartMuns.map(m => m === '' ? emptyAval  : m === '(Sem mun.)' ? gapAval : sf(q({ crime: crimeKey, mun: m, mes: moMeses })));
    const mant = chartMuns.map(m => m === '' ? emptyMant  : m === '(Sem mun.)' ? 0       : sf(q({ crime: crimeKey, mun: m, mes: moMeses }), 'anterior'));
    const mtnd = chartMuns.map(m => m === '' ? emptyMtnd  : m === '(Sem mun.)' ? 0       : sf(q({ crime: crimeKey, mun: m, mes: moMeses }), 'tend'));

    // Calcula % desvio para cada município (igual tela principal)
    const devs = chartMuns.map((_, i) => {
      if (ma[i] === 0) return 0;
      if (mm[i] === 0) return ma[i] <= mant[i] ? -5 : 100;
      const d = parseFloat(((ma[i] - mm[i]) / mm[i] * 100).toFixed(1));
      return (ma[i] > 0 && d === 0) ? -5 : d;
    });
    const barColors = devs.map((d, i) => hcol(ma[i], mm[i], mant[i]));

    const zeroLinePlugin = {
      id: 'moZeroLine',
      afterDraw(chart) {
        const yScale = chart.scales.y;
        if (yScale.min > 0 || yScale.max < 0) return;
        const y = yScale.getPixelForValue(0);
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(chart.chartArea.left, y);
        ctx.lineTo(chart.chartArea.right, y);
        ctx.strokeStyle = 'rgba(255,255,255,.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    };

    const cvs = document.getElementById(canvasId);
    cvs.style.height = '780px';
    moCh.push(new Chart(cvs.getContext('2d'), {
      type: 'bar',
      plugins: [ciaSepPlugin(chartMuns), zeroLinePlugin],
      data: { labels: chartMuns.map(munLabel), datasets: [
        { label: 'Desvio vs Meta', data: devs, backgroundColor: barColors, borderRadius: 3 }
      ]},
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              boxWidth: 18, padding: 24, font: { size: 22 }, color: '#ffffff',
              generateLabels: () => [
                { text: 'Dentro da meta',                         fillStyle: 'rgba(61,191,122,.75)',  strokeStyle: 'rgba(61,191,122,.75)',  lineWidth: 0, hidden: false, fontColor: '#ffffff', color: '#ffffff', font: { size: 22 } },
                { text: 'Acima da meta, melhor que mês anterior', fillStyle: 'rgba(191,122,61,.85)', strokeStyle: 'rgba(191,122,61,.85)', lineWidth: 0, hidden: false, fontColor: '#ffffff', color: '#ffffff', font: { size: 22 } },
                { text: 'Acima da meta',                          fillStyle: 'rgba(230,100,100,.80)',  strokeStyle: 'rgba(230,100,100,.80)',  lineWidth: 0, hidden: false, fontColor: '#ffffff', color: '#ffffff', font: { size: 22 } }
              ]
            }
          },
          tooltip: {
            callbacks: {
              title: items => { const m = chartMuns[items[0].dataIndex]; return m === '' ? 'Btl/CIA (sem município)' : m; },
              label: () => '',
              afterBody: items => {
                const i = items[0].dataIndex;
                const dev = mm[i] > 0 ? ((ma[i] - mm[i]) / mm[i] * 100).toFixed(1) : '—';
                const status = ma[i] <= mm[i] ? '✓ Dentro da meta' : ma[i] < mant[i] ? '↗ Acima, melhorando' : '↘ Acima, piorando';
                return [
                  `Avaliado:   ${ma[i]}`,
                  `Meta:       ${mm[i] || '—'}`,
                  `Anterior:   ${mant[i]}`,
                  `Tendência:  ${mtnd[i] || '—'}`,
                  `Desvio:     ${mm[i] > 0 ? (dev > 0 ? '+' : '') + dev + '%' : '—'}`,
                  `Status:     ${status}`
                ];
              }
            }
          }
        },
        layout: { padding: { bottom: 40 } },
        scales: {
          x: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } } },
          y: { grid: GR, ticks: { callback: v => v + '%', color: '#ffffff', font: { size: 22 } }, suggestedMin: -20, suggestedMax: 20 }
        }
      }
    }));
  };

  // Monta HTML do wrapper e renderiza gráfico(s)
  const metaWrap = document.getElementById('mo-meta-wrap');
  const isVeicGroup = Array.isArray(crime) && crime.includes('Roubo de Veículos') && crime.includes('Furto de Veículos');
  if (isVeicGroup) {
    metaWrap.innerHTML =
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">` +
        `<div class="mo-card"><div class="mo-ct">Meta vs Avaliado — Roubo de Veículos</div><canvas id="mo-meta-rv"></canvas></div>` +
        `<div class="mo-card"><div class="mo-ct">Meta vs Avaliado — Furto de Veículos</div><canvas id="mo-meta-fv"></canvas></div>` +
      `</div>`;
    renderMetaChart('mo-meta-rv', 'Roubo de Veículos');
    renderMetaChart('mo-meta-fv', 'Furto de Veículos');
  } else {
    metaWrap.innerHTML = `<div class="mo-card"><div class="mo-ct">Meta vs Avaliado</div><canvas id="mo-meta"></canvas></div>`;
    renderMetaChart('mo-meta', crime);
  }

  // Evolução por Município (sempre todos os MESES no eixo X)
  const withOcc = muns.map(m => ({ m, v: sf(q({ crime, mun: m, mes: moMeses })) })).filter(x => x.v > 0).sort((a,b) => munCia(a.m).localeCompare(munCia(b.m)) || b.v - a.v);
  const MUN_PALETTE = ['#4a9ee8','#e84a6f','#4bc97d','#e8a84a','#a84ae8','#4ae8d8','#e84a4a','#a8e84a','#4a6fe8','#e8d84a','#e86c4a','#c84bc8'];
  moCh.push(new Chart(document.getElementById('mo-line').getContext('2d'), {
    type: 'line',
    data: { labels: MESES, datasets: withOcc.map(({m}, i) => {
      const col = MUN_PALETTE[i % MUN_PALETTE.length];
      return { label: m, data: MESES.map(mes => sf(q({ crime, mun: m, mes }))),
        borderColor: col, backgroundColor: 'transparent', tension: 0, pointRadius: 5, borderWidth: 2,
        borderDash: [], pointBackgroundColor: col };
    })},
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { boxWidth: 15, padding: 32, font: { size: 22 }, usePointStyle: true, color: '#ffffff' } },
        tooltip: {
          usePointStyle: true,
          callbacks: {
            afterLabel: ctx => {
              const m = withOcc[ctx.datasetIndex]?.m;
              if (!m) return [];
              const mes = MESES[ctx.dataIndex];
              const metaV = sf(q({ crime, mun: m, mes }), 'meta');
              const antV  = sf(q({ crime, mun: m, mes }), 'anterior');
              const tndV  = sf(q({ crime, mun: m, mes }), 'tend');
              const dev   = metaV > 0 ? ((ctx.parsed.y - metaV) / metaV * 100).toFixed(1) : null;
              return [
                `Meta:      ${metaV || '—'}`,
                `Anterior:  ${antV}`,
                `Tendência: ${tndV || '—'}`,
                dev !== null ? `Desvio:    ${dev > 0 ? '+' : ''}${dev}%` : `Desvio:    —`
              ];
            }
          }
        }
      },
      scales: { x: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } } }, y: { grid: GR, beginAtZero: true, ticks: { stepSize: 1, color: '#ffffff', font: { size: 22 } } } }
    }
  }));

  // ── Análise Temporal (só exibe quando há múltiplos anos) ──────────────────
  const temporal = document.getElementById('mo-temporal');
  if (temporal) {
    if (ANOS.length > 1) {
      temporal.style.display = '';
      const YR_COLORS = ['#5a9de0','#c8a84b','#e8b840','#4bc87a'];
      const sc = moQScope();
      const crimes = Array.isArray(moCrime) ? moCrime : [moCrime];

      // Helper: valor mensal por ano
      const yrVal = (ano, mes) => crimes.reduce((s, cr) =>
        s + RAW.filter(r => r.ano === ano && r.crime === cr && r.mes === mes
          && (!sc.cia || r.cia === sc.cia) && (!sc.mun || r.mun === sc.mun))
          .reduce((a, r) => a + (r.avaliado || 0), 0), 0);

      // Regressão linear simples → linha de tendência
      const lrTrend = vals => {
        const n = vals.length;
        const sx = n*(n-1)/2, sx2 = n*(n-1)*(2*n-1)/6;
        const sy = vals.reduce((a,b) => a+b, 0);
        const sxy = vals.reduce((s,v,i) => s + i*v, 0);
        const denom = n*sx2 - sx*sx;
        if (!denom) return vals.map(() => n > 0 ? sy/n : 0);
        const slope = (n*sxy - sx*sy) / denom;
        const intercept = (sy - slope*sx) / n;
        return vals.map((_,i) => Math.max(0, Math.round((intercept + slope*i)*10)/10));
      };

      // ── Gráfico 1: Comparação Ano a Ano + Projeção Sazonal ──────────────
      // null = mês não existe na base daquele ano (futuro/não importado)
      const mesExiste = (ano, mes) => RAW.some(r => r.ano === ano && r.mes === mes);

      const baseAno = ANOS[ANOS.length - 1]; // ano de referência (mais antigo)
      const compAno = ANOS[0];               // ano atual (mais recente)

      // Índice sazonal do ano de referência — base para calcular projeção
      const baseAnoVals  = MES_ORD.map(m => mesExiste(baseAno, m) ? yrVal(baseAno, m) : null);
      const baseAnoNum   = baseAnoVals.filter(v => v !== null);
      const avgBaseAno   = (baseAnoNum.length > 0 ? baseAnoNum.reduce((a,b) => a+b,0) / baseAnoNum.length : 0) || 1;
      const sazonIdxBase = MES_ORD.map((_, i) => baseAnoVals[i] !== null ? baseAnoVals[i] / avgBaseAno : null);

      const yrDatasets = [];
      ANOS.forEach((ano, i) => {
        const vals = MES_ORD.map(m => mesExiste(ano, m) ? yrVal(ano, m) : null);
        const col  = YR_COLORS[i % YR_COLORS.length];
        yrDatasets.push({ label: String(ano), data: vals,
          borderColor: col, backgroundColor: 'transparent',
          tension: 0, pointRadius: 5, borderWidth: 2, pointBackgroundColor: col,
          spanGaps: false });

        // Projeção sazonal: apenas ano mais recente, apenas se ainda tem meses sem dados
        if (ano === compAno) {
          const mesesReais   = MES_ORD.filter(m => mesExiste(compAno, m));
          const mesesFuturos = MES_ORD.filter(m => !mesExiste(compAno, m));
          if (mesesReais.length > 0 && mesesFuturos.length > 0) {
            const totalAtual  = mesesReais.reduce((s, m) => s + yrVal(compAno, m), 0);
            const avgAtual    = totalAtual / mesesReais.length;
            const lastRealIdx = MES_ORD.indexOf(mesesReais[mesesReais.length - 1]);
            const projData = MES_ORD.map((m, idx) => {
              if (idx < lastRealIdx) return null;
              if (idx === lastRealIdx) return yrVal(compAno, m); // ponto de conexão com dado real
              const sIdx = sazonIdxBase[idx];
              return sIdx !== null ? Math.max(0, Math.round(avgAtual * sIdx)) : null;
            });
            yrDatasets.push({
              label: `Projeção ${compAno}`,
              data: projData,
              borderColor: col, backgroundColor: 'transparent',
              borderDash: [8, 4], pointRadius: 3, borderWidth: 1.5,
              tension: 0.3, spanGaps: false
            });
          }
        }
        // Anos anteriores: sem linha de tendência (dados já completos)
      });
      const ch1 = Chart.getChart(document.getElementById('mo-year-comp'));
      if (ch1) ch1.destroy();
      moCh.push(new Chart(document.getElementById('mo-year-comp').getContext('2d'), {
        type: 'line',
        data: { labels: MES_ORD, datasets: yrDatasets },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { boxWidth: 15, padding: 28, font: { size: 22 }, color: '#ffffff' } },
            tooltip: { callbacks: { title: items => MES_ORD[items[0].dataIndex] } } },
          scales: { x: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } } }, y: { grid: GR, beginAtZero: true, ticks: { color: '#ffffff', font: { size: 22 } } } } }
      }));

      // Texto explicativo — Gráfico 1
      const totBase1 = MES_ORD.filter(m => mesExiste(ANOS[ANOS.length-1], m)).reduce((s,m) => s + yrVal(ANOS[ANOS.length-1], m), 0);
      const totComp1 = MES_ORD.filter(m => mesExiste(ANOS[0], m)).reduce((s,m) => s + yrVal(ANOS[0], m), 0);
      const mesesComuns = MES_ORD.filter(m => ANOS.every(a => mesExiste(a, m)));
      const totBase1c  = mesesComuns.reduce((s,m) => s + yrVal(ANOS[ANOS.length-1], m), 0);
      const totComp1c  = mesesComuns.reduce((s,m) => s + yrVal(ANOS[0], m), 0);
      const diffPct1   = totBase1c > 0 ? ((totComp1c - totBase1c) / totBase1c * 100).toFixed(1) : null;
      const hasProjFutura = MES_ORD.some(m => !mesExiste(compAno, m));
      const txt1 = mesesComuns.length > 0
        ? `Comparando os ${mesesComuns.length} meses disponíveis em ambos os anos: <b>${compAno}</b> registrou <b>${totComp1c}</b> ocorrências contra <b>${totBase1c}</b> em <b>${baseAno}</b> — variação de <b style="color:${diffPct1 > 0 ? '#e8b840' : '#4bc87a'}">${diffPct1 > 0 ? '+' : ''}${diffPct1}%</b>.${hasProjFutura ? ` A linha tracejada de <b>${compAno}</b> representa a <b>projeção dos meses seguintes</b>: média mensal atual de ${compAno} ajustada pelo padrão histórico de cada mês em ${baseAno} (sazonalidade). Não são dados reais.` : ''}`
        : 'Selecione um período com dados em ambos os anos para comparação.';
      const el1 = document.getElementById('mo-text-comp');
      if (el1) el1.innerHTML = txt1;

      // ── Cards: Sazonalidade e Projeção ───────────────────────────────────
      // baseAno / compAno já definidos acima (seção Gráfico 1)
      // Só usa meses que tenham dados em pelo menos um ano (ignora futuros zerados)
      const allVals = MES_ORD.map(m => {
        const anosComDados = ANOS.filter(a => mesExiste(a, m));
        return anosComDados.length > 0
          ? anosComDados.reduce((s, a) => s + yrVal(a, m), 0) / anosComDados.length
          : null;
      });
      const validVals = allVals.filter(v => v !== null);
      const avgTotal  = validVals.reduce((s,v) => s+v, 0) / (validVals.length || 1) || 1;
      const sazonIdx  = allVals.map(v => v !== null ? Math.round(v / avgTotal * 100) : null);
      const mesesComIdx = MES_ORD.filter((_, i) => sazonIdx[i] !== null);
      const peakMes   = [...mesesComIdx].sort((a,b) => sazonIdx[MES_ORD.indexOf(b)] - sazonIdx[MES_ORD.indexOf(a)]).slice(0,3);
      const lowMes    = [...mesesComIdx].sort((a,b) => sazonIdx[MES_ORD.indexOf(a)] - sazonIdx[MES_ORD.indexOf(b)]).slice(0,3);

      // Tendência geral (slope do ano mais recente, apenas meses com dados)
      const recentVals = MES_ORD.map(m => yrVal(compAno, m)).filter(v => v > 0);
      const trend = lrTrend(recentVals);
      const slopeDir = trend.length > 1 ? trend[trend.length-1] - trend[0] : 0;
      const trendTxt = slopeDir > 0.5 ? '↑ Tendência de alta em ' + compAno : slopeDir < -0.5 ? '↓ Tendência de queda em ' + compAno : '→ Estável em ' + compAno;
      const trendCol = slopeDir > 0.5 ? 'var(--red2)' : slopeDir < -0.5 ? '#4bc87a' : '#c8a84b';

      // Projeção: meses sem dados em compAno → estimativa com base no índice sazonal
      const compTotal = MES_ORD.reduce((s,m) => s + yrVal(compAno,m), 0);
      const mesesComDados = MES_ORD.filter(m => yrVal(compAno,m) > 0).length;
      const baseTotal = MES_ORD.reduce((s,m) => s + yrVal(baseAno,m), 0);
      const projTotal = mesesComDados > 0 && mesesComDados < 12
        ? Math.round((compTotal / mesesComDados) * 12) : null;

      const card = (title, body, color='#ffffff') =>
        `<div style="background:var(--s2);border:1px solid var(--bd2);border-radius:8px;padding:12px 14px">
          <div style="font-size:19px;letter-spacing:1.5px;text-transform:uppercase;color:#ffffff;margin-bottom:6px;font-weight:700">${title}</div>
          <div style="font-size:19px;color:#ffffff;line-height:1.7;font-weight:500">${body}</div>
        </div>`;

      const peakIdxs = peakMes.map(m => sazonIdx[MES_ORD.indexOf(m)]);
      const lowIdxs  = lowMes.map(m  => sazonIdx[MES_ORD.indexOf(m)]);
      const trendBody = slopeDir > 0.5
        ? `Os registros de ${compAno} mostram crescimento mês a mês. Atenção redobrada nos próximos períodos.`
        : slopeDir < -0.5
        ? `Os registros de ${compAno} mostram redução progressiva — as ações em curso parecem surtir efeito.`
        : `O volume de ${compAno} permanece estável, sem variação significativa entre os meses disponíveis.`;
      const peakBody = `Historicamente, <b>${peakMes[0]}</b> é o mês mais crítico (índice ${peakIdxs[0]}% da média), seguido de <b>${peakMes[1]}</b> (${peakIdxs[1]}%) e <b>${peakMes[2]}</b> (${peakIdxs[2]}%). Use esses períodos para antecipar reforços operacionais.`;
      const lowBody  = `Os meses de menor incidência são <b>${lowMes[0]}</b> (${lowIdxs[0]}%), <b>${lowMes[1]}</b> (${lowIdxs[1]}%) e <b>${lowMes[2]}</b> (${lowIdxs[2]}%). São janelas para reorganização e capacitação.`;
      const projBody = projTotal
        ? `Com ${mesesComDados} meses registrados (${compTotal} ocorrências), a projeção linear aponta para <b style="font-size:19px">${projTotal}</b> ocorrências ao fim de ${compAno}. Em ${baseAno} foram <b>${baseTotal}</b> no total — diferença estimada de <b style="color:${projTotal > baseTotal ? 'var(--red2)' : '#4bc87a'}">${projTotal > baseTotal ? '+' : ''}${projTotal - baseTotal}</b>.`
        : null;

      document.getElementById('mo-sazon').innerHTML =
        card('Tendência Geral', `${trendTxt}<br><span style="font-size:19px">${trendBody}</span>`, trendCol) +
        card('Pico Histórico — Sazonalidade', peakBody, '#e8b840') +
        card('Período de Menor Incidência', lowBody, '#4bc87a') +
        (projBody ? card('Projeção Anual ' + compAno, projBody, '#5a9de0') : '');

    } else {
      temporal.style.display = 'none';
    }
  }

  applyOcorrFilters();
}

function moClickOut(e) { if (e.target === document.getElementById('mo')) moClose(); }
function moClose() {
  document.getElementById('mo').classList.remove('on');
  document.body.style.overflow = '';
  setTimeout(moDestroy, 250);
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('mo')?.classList.contains('on')) moClose();
  else if (document.getElementById('prod-detail-mo')?.classList.contains('on')) closeProdDetail();
  else if (document.getElementById('dd-detail-mo')?.classList.contains('on')) closeDDDetail();
});

