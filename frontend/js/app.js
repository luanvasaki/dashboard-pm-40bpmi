/**
 * app.js — Frontend do Dashboard 40 BPM/I
 * Busca os dados via API REST (backend Node.js + SQLite).
 */

const API = 'http://localhost:3001/api';

// Paleta de cores por crime (mesma ordem da API)
const PAL = ['#c84b4b','#bf7a3d','#c8a84b','#3d7abf','#e8c96a','#3dbf7a','#7a4bbf'];
const GR  = { color: 'rgba(255,255,255,.04)' };

// Ordem canônica dos meses
const MES_ORD = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Estado global preenchido após o fetch inicial
let RAW      = [];
let CRIMES   = [];
let MESES    = [];
let MUNS     = [];
let CIAS     = [];

let selMeses = [];
let hmMeses  = [];
let charts   = {};
let moCh     = [];

// ---------------------------------------------------------------------------
// Filtros por página
// ---------------------------------------------------------------------------

const pageFilters = {
  visao:    { type: 'btl', value: null },
  metas:    { type: 'btl', value: null },
  cia:      { type: 'btl', value: null },
  insights: { type: 'btl', value: null },
};

// Retorna {cia: x} ou {mun: x} ou {} para uso em q()
function scope(key) {
  const f = pageFilters[key];
  if (f.type === 'cia') return { cia: f.value };
  if (f.type === 'mun') return { mun: f.value };
  return {};
}

// Sincroniza o sidebar de meses com selMeses atual
function syncSidebarMes() {
  document.querySelectorAll('#sb-mes .mes-btn').forEach((b, i) => {
    if (i === 0) b.classList.toggle('on', selMeses.length === MESES.length);
    else         b.classList.toggle('on', selMeses.length === 1 && selMeses[0] === MESES[i - 1]);
  });
  // Sincroniza selects de mês nas barras de filtro
  document.querySelectorAll('.pf-mes').forEach(s => {
    s.value = selMeses.length === MESES.length ? '__all__' : selMeses[0];
  });
}

// Constrói a barra de filtro de uma página com dropdowns
function buildPageFilter(containerId, key, renderFn) {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = '';

  // Botão Batalhão
  const btnBtl = document.createElement('button');
  btnBtl.className = 'pf-btn on';
  btnBtl.textContent = 'Batalhão';

  // Helper: cria campo label + select
  const makeField = (label, opts) => {
    const wrap = document.createElement('div');
    wrap.className = 'pf-field';
    const lbl = document.createElement('span');
    lbl.className = 'pf-label';
    lbl.textContent = label;
    const sel = document.createElement('select');
    sel.className = 'pf-select';
    opts.forEach(([txt, val]) => {
      const o = document.createElement('option');
      o.value = val; o.textContent = txt;
      sel.appendChild(o);
    });
    wrap.appendChild(lbl);
    wrap.appendChild(sel);
    return { wrap, sel };
  };

  // Select de mês
  const { wrap: wMes, sel: sMes } = makeField('MÊS:', [
    ['Todos os meses', '__all__'],
    ...MESES.map(m => [m, m])
  ]);
  sMes.className += ' pf-mes';
  sMes.value = selMeses.length === MESES.length ? '__all__' : selMeses[0];

  // Select de CIA
  const { wrap: wCia, sel: sCia } = makeField('CIA:', [
    ['Todas as CIAs', '__all__'],
    ...CIAS.map(c => [c.replace(' PM', ''), c])
  ]);

  // Select de cidade (atualizado ao trocar CIA)
  const { wrap: wMun, sel: sMun } = makeField('CIDADE:', [
    ['Todos os municípios', '__all__'],
    ...MUNS.map(m => [m, m])
  ]);

  function repopulateMuns(muns) {
    const prev = sMun.value;
    sMun.innerHTML = '<option value="__all__">Todos os municípios</option>';
    muns.forEach(m => {
      const o = document.createElement('option');
      o.value = m; o.textContent = m;
      sMun.appendChild(o);
    });
    sMun.value = muns.includes(prev) ? prev : '__all__';
  }

  function applyFilter() {
    const ciaVal = sCia.value;
    const munVal = sMun.value;
    if (munVal !== '__all__') {
      pageFilters[key] = { type: 'mun', value: munVal };
      btnBtl.classList.remove('on');
    } else if (ciaVal !== '__all__') {
      pageFilters[key] = { type: 'cia', value: ciaVal };
      btnBtl.classList.remove('on');
    } else {
      pageFilters[key] = { type: 'btl', value: null };
      btnBtl.classList.add('on');
    }
    renderFn();
  }

  sMes.addEventListener('change', () => {
    selMeses = sMes.value === '__all__' ? [...MESES] : [sMes.value];
    syncSidebarMes();
    renderAll();
  });

  sCia.addEventListener('change', () => {
    const muns = sCia.value === '__all__' ? MUNS : MUNS.filter(m => RAW.some(r => r.mun === m && r.cia === sCia.value));
    repopulateMuns(muns);
    applyFilter();
  });

  sMun.addEventListener('change', applyFilter);

  btnBtl.addEventListener('click', () => {
    sCia.value = '__all__';
    repopulateMuns(MUNS);
    sMun.value = '__all__';
    pageFilters[key] = { type: 'btl', value: null };
    btnBtl.classList.add('on');
    renderFn();
  });

  const sep = document.createElement('span');
  sep.className = 'pf-sep';

  el.appendChild(btnBtl);
  el.appendChild(wMes);
  el.appendChild(sep);
  el.appendChild(wCia);
  el.appendChild(wMun);
}

function buildPageFilters() {
  buildPageFilter('pf-visao',    'visao',    renderVisao);
  buildPageFilter('pf-metas',   'metas',    renderMetas);
  buildPageFilter('pf-cia',     'cia',      renderCIA);
  buildPageFilter('pf-insights','insights', renderInsights);
}

// ---------------------------------------------------------------------------
// Utilitários (idênticos ao original)
// ---------------------------------------------------------------------------

const q    = f => RAW.filter(r => Object.entries(f).every(([k,v]) => Array.isArray(v) ? v.includes(r[k]) : r[k] === v));
const sf   = (arr, field = 'avaliado') => arr.reduce((s, r) => s + (r[field] || 0), 0);
const pLbl = m => m.length === MESES.length ? 'Todos os meses' : m.join(' + ');
const hcol = (v, max) => {
  if (v === 0) return 'rgba(74,158,232,.12)';
  const r = v / max;
  if (r < 0.15) return 'rgba(200,168,75,.22)';
  if (r < 0.35) return 'rgba(200,168,75,.5)';
  if (r < 0.6)  return 'rgba(200,168,75,.75)';
  if (r < 0.8)  return '#c8a84b';
  return '#c84b4b';
};
const mk  = (id, cfg) => { if (charts[id]) charts[id].destroy(); charts[id] = new Chart(document.getElementById(id), cfg); };
const cl  = c => c.replace(' Vulnerável', 'Vuln.').replace(' Veículos', 'Veíc.');

// ---------------------------------------------------------------------------
// Inicialização — busca dados da API
// ---------------------------------------------------------------------------

async function loadData() {
  const [meta, registros] = await Promise.all([
    fetch(`${API}/meta`).then(r => r.json()),
    fetch(`${API}/registros`).then(r => r.json())
  ]);
  CRIMES = meta.crimes;
  MESES  = meta.meses;
  MUNS   = meta.muns;
  CIAS   = meta.cias;
  RAW    = registros;
}

async function updateSyncStatus() {
  try {
    const s = await fetch(`${API}/status`).then(r => r.json());
    const elTime  = document.getElementById('sync-time');
    const elFonte = document.getElementById('lbl-fonte');
    if (elTime && s.lastSync) {
      const d = new Date(s.lastSync);
      elTime.textContent = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    if (elFonte) {
      const labels = {
        supabase: 'Banco de Dados RAC - Supabase',
        sheets:   'Banco de Dados RAC - Google Sheets',
        local:    'Arquivo Local'
      };
      elFonte.textContent = labels[s.source] || 'Banco de Dados RAC';
    }
  } catch (_) {}
}

async function forceSync() {
  const btn = document.getElementById('sync-btn');
  if (btn) { btn.textContent = '↻ Sincronizando...'; btn.disabled = true; }
  try {
    await fetch(`${API}/sync`);
    await loadData();
    selMeses = [...MESES];
    hmMeses  = [...MESES];
    buildSbMes();
    buildHmFilter();
    renderAll();
    await updateSyncStatus();
  } catch (err) {
    alert('Erro ao sincronizar: ' + err.message);
  } finally {
    if (btn) { btn.textContent = '↻ Sincronizar'; btn.disabled = false; }
  }
}

async function init() {
  try {
    await loadData();

    selMeses = [...MESES];
    hmMeses  = [...MESES];

    Chart.defaults.color       = '#4a5568';
    Chart.defaults.borderColor = '#1c2235';
    Chart.defaults.font.family = "'DM Mono', monospace";
    Chart.defaults.font.size   = 11;

    buildSbMes();
    buildHmFilter();
    buildPageFilters();
    renderAll();
    updateSyncStatus();

  } catch (err) {
    console.error('Erro ao carregar dados da API:', err);
    alert('Não foi possível conectar à API. Certifique-se de que o backend está rodando em http://localhost:3001');
  }
}

// ---------------------------------------------------------------------------
// Sidebar de meses
// ---------------------------------------------------------------------------

function buildSbMes() {
  let h = `<button class="mes-btn on" onclick="sbAll(this)">Todos os meses</button>`;
  MESES.forEach(m => h += `<button class="mes-btn" onclick="sbTog('${m}',this)">${m}</button>`);
  document.getElementById('sb-mes').innerHTML = h;
}

function buildHmFilter() {
  let h = `<button class="hm-mbtn on" onclick="hmAll(this)">Todos</button>`;
  MESES.forEach(m => h += `<button class="hm-mbtn" onclick="hmTog('${m}',this)">${m}</button>`);
  document.getElementById('hm-filter-btns').innerHTML = h;
}

function sbAll(btn) {
  selMeses = [...MESES];
  syncSidebarMes();
  renderAll();
}

function sbTog(mes, btn) {
  selMeses = [mes];
  syncSidebarMes();
  renderAll();
}

function hmAll(btn) {
  hmMeses = [...MESES];
  document.querySelectorAll('#hm-filter-btns .hm-mbtn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  renderHeatmap();
}

function hmTog(mes, btn) {
  hmMeses = [mes];
  const btns = document.querySelectorAll('#hm-filter-btns .hm-mbtn');
  btns.forEach((b, i) => b.classList.toggle('on', i === 0 ? false : MESES[i - 1] === mes));
  renderHeatmap();
}

// ---------------------------------------------------------------------------
// Render geral
// ---------------------------------------------------------------------------

function renderAll() {
  const p = pLbl(selMeses);
  ['lbl-p1','lbl-p2','lbl-p3','lbl-p5'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = p;
  });
  document.getElementById('sb-periodo').textContent  = p;
  document.getElementById('metas-badge').textContent = p;
  renderKPIs();
  renderVisao();
  renderMetas();
  renderCIA();
  renderHeatmap();
  renderInsights();
  renderEvolucao();
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

function renderKPIs() {
  document.getElementById('kpi-row').innerHTML = CRIMES.map((c, i) => {
    const aval = sf(q({ crime: c, mes: selMeses }));
    const ant  = sf(q({ crime: c, mes: selMeses }), 'anterior');
    const vp   = ant > 0 ? ((aval - ant) / ant * 100).toFixed(0) : 0;
    const up   = parseFloat(vp) > 0;
    return `<div class="kpi" onclick="moOpen('${c}','${PAL[i]}')" title="Clique para detalhes">
      <div class="kpi-top" style="background:${PAL[i]}"></div>
      <div class="kpi-lbl">${cl(c)}</div>
      <div class="kpi-val" style="color:${PAL[i]}">${aval}</div>
      <div class="kpi-row2">
        <div class="kpi-sub">ant: ${ant}</div>
        <div class="tag ${up ? 'tbad' : 'tok'}">${up ? '▲' : '▼'}${Math.abs(vp)}%</div>
      </div>
      <div class="kpi-hint">▸ clique p/ detalhes</div>
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Visão Geral
// ---------------------------------------------------------------------------

function renderVisao() {
  const sc  = scope('visao');

  // Popula o dropdown de crime na primeira vez
  const sel = document.getElementById('evol-mun-crime');
  if (sel && !sel.options.length) {
    CRIMES.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
  }
  renderEvolMuns();

  mk('c-crimes', {
    type: 'bar',
    data: {
      labels: CRIMES.map(cl),
      datasets: [
        { label: 'Avaliado', data: CRIMES.map(c => sf(q({ crime: c, mes: selMeses, ...sc }))), backgroundColor: PAL.map(p => p + 'cc'), borderRadius: 4 },
        { label: 'Meta',     data: CRIMES.map(c => sf(q({ crime: c, mes: selMeses, ...sc }), 'meta')), backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 4 }
      ]
    },
    options: { responsive: true, plugins: { legend: { labels: { boxWidth: 9 } } }, scales: { x: { grid: GR }, y: { grid: GR, beginAtZero: true } } }
  });

  mk('c-meta', {
    type: 'bar',
    data: {
      labels: CRIMES.map(cl),
      datasets: [
        { label: 'Meta', data: CRIMES.map(c => sf(q({ crime: c, mes: selMeses, ...sc }), 'meta')), backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 4 },
        {
          label: 'Avaliado',
          data: CRIMES.map(c => sf(q({ crime: c, mes: selMeses, ...sc }))),
          backgroundColor: CRIMES.map(c => {
            const a = sf(q({ crime: c, mes: selMeses, ...sc })), m = sf(q({ crime: c, mes: selMeses, ...sc }), 'meta');
            return a <= m ? 'rgba(61,191,122,.75)' : 'rgba(200,75,75,.75)';
          }),
          borderRadius: 4
        }
      ]
    },
    options: { responsive: true, plugins: { legend: { labels: { boxWidth: 9 } } }, scales: { x: { grid: GR }, y: { grid: GR, beginAtZero: true } } }
  });

  // Variação vs Meta: ((avaliado - meta) / meta) * 100
  // Verde  → avaliado ≤ meta (dentro ou abaixo da meta, inclui -100%)
  // Laranja → avaliado > meta E avaliado < anterior (acima da meta mas melhorando)
  // Vermelho → avaliado > meta E avaliado ≥ anterior (acima da meta e piorando)
  const vmData = CRIMES.map(c => {
    const a = sf(q({ crime: c, mes: selMeses, ...sc }));
    const m = sf(q({ crime: c, mes: selMeses, ...sc }), 'meta');
    if (m === 0) return a === 0 ? 0 : 100;
    return parseFloat(((a - m) / m * 100).toFixed(1));
  });
  const vmColors = CRIMES.map(c => {
    const a   = sf(q({ crime: c, mes: selMeses, ...sc }));
    const m   = sf(q({ crime: c, mes: selMeses, ...sc }), 'meta');
    const ant = sf(q({ crime: c, mes: selMeses, ...sc }), 'anterior');
    if (a <= m)         return 'rgba(61,191,122,.80)';   // verde — dentro da meta
    if (a < ant)        return 'rgba(191,122,61,.85)';   // laranja — acima da meta mas melhorando
    return 'rgba(200,75,75,.80)';                        // vermelho — acima da meta e piorando
  });
  mk('c-var', {
    type: 'bar',
    data: {
      labels: CRIMES.map(cl),
      datasets: [{
        label: 'Desvio vs Meta (%)',
        data: vmData,
        backgroundColor: vmColors,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.raw;
              return v <= 0 ? `${v}% (dentro da meta)` : `+${v}% (acima da meta)`;
            }
          }
        }
      },
      scales: {
        x: { grid: GR },
        y: { grid: GR, ticks: { callback: v => v + '%' } }
      }
    }
  });
}

function renderEvolMuns() {
  const sel = document.getElementById('evol-mun-crime');
  if (!sel) return;
  const crime = sel.value || CRIMES[0];
  const sc    = scope('visao');

  const LC = ['#c8a84b','#3d7abf','#c84b4b','#3dbf7a','#bf7a3d','#7a4bbf','#4bbfbf','#e06060','#5ae09a'];

  // Municípios no escopo atual
  const muns = sc.mun ? [sc.mun]
             : sc.cia ? MUNS.filter(m => RAW.some(r => r.mun === m && r.cia === sc.cia))
             : MUNS;

  // Apenas municípios com pelo menos uma ocorrência no período
  const withOcc = muns
    .map(m => ({ m, total: MESES.reduce((s, mes) => s + sf(q({ crime, mun: m, mes })), 0) }))
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total);

  mk('c-evol-muns', {
    type: 'line',
    data: {
      labels: MESES,
      datasets: withOcc.map(({ m }, i) => ({
        label: m,
        data: MESES.map(mes => sf(q({ crime, mun: m, mes }))),
        borderColor: LC[i % LC.length],
        backgroundColor: 'transparent',
        tension: 0.3,
        pointRadius: 5,
        borderWidth: 2,
        borderDash: i % 2 === 1 ? [5, 3] : [],
        pointStyle: i % 2 === 1 ? 'triangle' : 'circle',
        pointBackgroundColor: LC[i % LC.length]
      }))
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 8, padding: 10, font: { size: 10 }, usePointStyle: true } }
      },
      scales: {
        x: { grid: GR },
        y: { grid: GR, beginAtZero: true, ticks: { stepSize: 1 } }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------

function renderMetas() {
  const pf   = pageFilters.metas;
  const muns = pf.type === 'mun' ? [pf.value]
             : pf.type === 'cia' ? MUNS.filter(m => RAW.some(r => r.mun === m && r.cia === pf.value))
             : MUNS;

  let h = '<thead><tr><th>Município</th><th>CIA</th><th>Crime</th><th>Anterior</th><th>Meta</th><th>Avaliado</th><th>Var%</th><th>Status</th></tr></thead><tbody>';
  muns.forEach(mun => CRIMES.forEach(crime => {
    const rows = q({ crime, mun, mes: selMeses });
    if (!rows.length) return;
    const ant = sf(rows, 'anterior'), meta = sf(rows, 'meta'), aval = sf(rows), cia = rows[0].cia;
    const vp = ant > 0 ? ((aval - ant) / ant * 100).toFixed(0) : '—';
    const vc = parseFloat(vp) > 0 ? 'var(--red2)' : parseFloat(vp) < 0 ? 'var(--green2)' : 'var(--tx3)';
    const vt = vp !== '—' ? (parseFloat(vp) > 0 ? '▲' : '▼') + Math.abs(vp) + '%' : vp;
    let pc, pt;
    if (meta > 0) {
      if (aval <= meta * 0.8) { pc = 'p-ok'; pt = 'Ótimo'; }
      else if (aval <= meta)  { pc = 'p-warn'; pt = 'Na Meta'; }
      else                    { pc = 'p-bad'; pt = 'Acima'; }
    } else {
      if (aval === 0)       { pc = 'p-ok';   pt = 'Zero'; }
      else if (aval < ant)  { pc = 'p-evol'; pt = 'Em Evolução'; }
      else                  { pc = 'p-warn'; pt = 'Sem Meta'; }
    }
    h += `<tr><td style="font-weight:600">${mun}</td><td style="color:var(--tx3);font-size:11px">${cia}</td><td>${crime}</td><td class="num">${ant}</td><td class="num">${meta}</td><td class="num" style="font-weight:700">${aval}</td><td class="num" style="color:${vc}">${vt}</td><td><span class="pill ${pc}">${pt}</span></td></tr>`;
  }));
  document.getElementById('tbl-metas').innerHTML = h + '</tbody>';
}

// ---------------------------------------------------------------------------
// Desempenho por CIA
// ---------------------------------------------------------------------------

function renderCIA() {
  const pf        = pageFilters.cia;
  const sc        = scope('cia');
  const isBtl     = pf.type === 'btl';
  const ciaColors = ['#c8a84b', '#3d7abf', '#c84b4b'];

  const titleEl = document.getElementById('cia-main-title');
  if (titleEl) titleEl.textContent = isBtl ? 'META VS AVALIADO — BATALHÃO' : `META VS AVALIADO — ${pf.value?.toUpperCase()}`;

  let datasets;
  if (isBtl) {
    // Batalhão: Meta global + barra por CIA
    const meta = CRIMES.map(c => sf(q({ crime: c, mes: selMeses }), 'meta'));
    datasets = [
      { label: 'Meta', data: meta, backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 4 },
      ...CIAS.map((cia, i) => ({
        label: cia,
        data: CRIMES.map(c => sf(q({ crime: c, cia, mes: selMeses }))),
        backgroundColor: ciaColors[i] + 'cc',
        borderRadius: 4
      }))
    ];
  } else {
    // CIA ou Município: Meta vs Avaliado
    const aval = CRIMES.map(c => sf(q({ crime: c, mes: selMeses, ...sc })));
    const meta = CRIMES.map(c => sf(q({ crime: c, mes: selMeses, ...sc }), 'meta'));
    datasets = [
      { label: 'Meta',     data: meta, backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 4 },
      { label: 'Avaliado', data: aval, backgroundColor: aval.map((v, j) => meta[j] > 0 && v <= meta[j] ? 'rgba(61,191,122,.75)' : 'rgba(200,75,75,.75)'), borderRadius: 4 }
    ];
  }

  mk('c-cia-main', {
    type: 'bar',
    data: { labels: CRIMES.map(cl), datasets },
    options: {
      responsive: true,
      plugins: { legend: { labels: { boxWidth: 9 } } },
      scales: { x: { grid: GR }, y: { grid: GR, beginAtZero: true } }
    }
  });
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

function renderHeatmap() {
  const p = pLbl(hmMeses);
  document.getElementById('lbl-p4').textContent  = p;
  document.getElementById('hm-badge').textContent = p;
  const maxes = CRIMES.map(c => Math.max(...MUNS.map(m => sf(q({ crime: c, mun: m, mes: hmMeses }))), 1));
  let h = '<thead><tr><th>Município</th>' + CRIMES.map(c => `<th>${cl(c)}</th>`).join('') + '<th>Total</th></tr></thead><tbody>';
  MUNS.forEach(mun => {
    const vals  = CRIMES.map(c => sf(q({ crime: c, mun, mes: hmMeses })));
    const total = vals.reduce((a, b) => a + b, 0);
    h += `<tr><td class="hm-city">${mun}</td>`;
    vals.forEach((v, i) => {
      const bg = hcol(v, maxes[i]), tc = v / maxes[i] > 0.6 ? '#000' : 'var(--tx)';
      h += `<td><div class="hm-cell" style="background:${bg};color:${tc}">${v}</div></td>`;
    });
    h += `<td><div class="hm-cell" style="background:rgba(255,255,255,.07);color:var(--tx);font-weight:700">${total}</div></td></tr>`;
  });
  document.getElementById('hm-tbl').innerHTML = h + '</tbody>';
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

function renderInsights() {
  const pf   = pageFilters.insights;
  const sc   = scope('insights');
  const lbl  = pf.type === 'btl' ? 'Batalhão' : pf.value;
  const muns = pf.type === 'cia' ? MUNS.filter(m => RAW.some(r => r.mun === m && r.cia === pf.value)) : MUNS;
  const qsc  = f => q({ ...f, mes: selMeses, ...sc });

  // --- Pré-cálculos genéricos ---

  // Variação geral: total avaliado vs total anterior
  const totalAval = CRIMES.reduce((s, c) => s + sf(qsc({ crime: c })), 0);
  const totalAnt  = CRIMES.reduce((s, c) => s + sf(qsc({ crime: c }), 'anterior'), 0);
  const varGeral  = totalAnt > 0 ? parseFloat(((totalAval - totalAnt) / totalAnt * 100).toFixed(0)) : 0;

  // Crime mais crítico: maior desvio positivo acima da meta
  const crimesDesvio = CRIMES.map(c => {
    const a = sf(qsc({ crime: c })), m = sf(qsc({ crime: c }), 'meta');
    return { c, a, m, desvio: m > 0 ? ((a - m) / m * 100) : -Infinity };
  });
  const crimeCritico = [...crimesDesvio].sort((a, b) => b.desvio - a.desvio)[0];

  // Crime melhor desempenho: maior desvio negativo (mais abaixo da meta)
  const crimeMelhor = crimesDesvio
    .filter(x => x.m > 0 && x.a <= x.m)
    .sort((a, b) => a.desvio - b.desvio)[0];

  // Contagens de meta
  const acima   = crimesDesvio.filter(x => x.m > 0 && x.a > x.m).length;
  const ok      = crimesDesvio.filter(x => x.m > 0 && x.a <= x.m).length;
  const emEvol  = crimesDesvio.filter(x => {
    const ant = sf(qsc({ crime: x.c }), 'anterior');
    return x.a > x.m && x.a < ant;
  }).length;

  // Município com mais crimes acima da meta
  const munAlerta = muns.map(m => ({
    m,
    acima: CRIMES.filter(c => {
      const a = sf(q({ crime: c, mun: m, mes: selMeses, ...sc }));
      const mt = sf(q({ crime: c, mun: m, mes: selMeses, ...sc }), 'meta');
      return mt > 0 && a > mt;
    }).length
  })).sort((a, b) => b.acima - a.acima)[0] || { m: '—', acima: 0 };

  // Município destaque: mais crimes dentro da meta
  const munDestaque = muns.map(m => ({
    m,
    ok: CRIMES.filter(c => {
      const a = sf(q({ crime: c, mun: m, mes: selMeses, ...sc }));
      const mt = sf(q({ crime: c, mun: m, mes: selMeses, ...sc }), 'meta');
      return mt > 0 && a <= mt;
    }).length
  })).sort((a, b) => b.ok - a.ok)[0] || { m: '—', ok: 0 };

  // --- Cards ---
  const ins = [
    // 1. Tendência geral
    {
      t: varGeral > 0 ? 'red' : 'green',
      v: `${varGeral > 0 ? '▲' : '▼'}${Math.abs(varGeral)}%`,
      title: `Tendência geral — ${lbl}`,
      body: `Total de ${totalAval} ocorrências no período vs ${totalAnt} no anterior. ${varGeral > 0 ? 'Aumento requer atenção.' : varGeral < 0 ? 'Queda é um bom sinal.' : 'Estável em relação ao anterior.'}`
    },
    // 2. Crime mais crítico
    crimeCritico.desvio > 0
      ? { t: 'red', v: `+${crimeCritico.desvio.toFixed(0)}%`, title: `Crítico — ${crimeCritico.c}`, body: `${crimeCritico.a} ocorrências contra meta de ${crimeCritico.m}. Desvio de ${crimeCritico.desvio.toFixed(0)}% acima do permitido.` }
      : { t: 'green', v: '✓', title: 'Todos dentro da meta', body: `Nenhum crime está acima da meta no período selecionado. Excelente desempenho.` },
    // 3. Melhor desempenho
    crimeMelhor
      ? { t: 'green', v: `${Math.abs(crimeMelhor.desvio).toFixed(0)}%`, title: `Destaque — ${crimeMelhor.c}`, body: `${crimeMelhor.a} ocorrências contra meta de ${crimeMelhor.m}. ${Math.abs(crimeMelhor.desvio).toFixed(0)}% abaixo da meta.` }
      : { t: '', v: '—', title: 'Nenhum crime abaixo da meta', body: 'Todos os crimes com meta definida estão no limite ou acima.' },
    // 4. Resumo de metas
    {
      t: acima > 0 ? 'red' : 'green',
      v: `${ok}/${CRIMES.length}`,
      title: 'Crimes dentro da meta',
      body: `${ok} crimes dentro da meta, ${acima} acima${emEvol > 0 ? ` e ${emEvol} acima mas em evolução (melhorando vs anterior)` : ''}.`
    },
    // 5. Município em alerta
    {
      t: munAlerta.acima > 0 ? 'red' : 'green',
      v: munAlerta.m,
      title: 'Município em alerta',
      body: munAlerta.acima > 0
        ? `${munAlerta.m} possui ${munAlerta.acima} crime(s) acima da meta. Requer atenção prioritária.`
        : `Nenhum município com crimes acima da meta. Bom desempenho geral.`
    },
    // 6. Município destaque
    {
      t: 'green',
      v: munDestaque.m,
      title: 'Município destaque',
      body: `${munDestaque.m} tem ${munDestaque.ok} crime(s) dentro ou abaixo da meta no período. Melhor desempenho do escopo.`
    },
  ];

  document.getElementById('ins-grid').innerHTML = ins.map(i =>
    `<div class="ins ${i.t}"><div class="ins-val">${i.v}</div><div class="ins-title">${i.title}</div><div class="ins-body">${i.body}</div></div>`
  ).join('');

  // Gráfico de cumprimento por CIA (ou por crime quando filtrado)
  const insTitle = document.getElementById('ins-chart-title');
  if (pf.type === 'btl') {
    if (insTitle) insTitle.textContent = 'CUMPRIMENTO DE METAS POR CIA';
    const pct = CIAS.map(cia => {
      const ok = CRIMES.filter(c => {
        const a = sf(q({ crime: c, cia, mes: selMeses }));
        const m = sf(q({ crime: c, cia, mes: selMeses }), 'meta');
        return m > 0 && a <= m;
      }).length;
      return parseFloat((ok / CRIMES.length * 100).toFixed(1));
    });
    mk('c-cia-ins', {
      type: 'bar',
      data: { labels: CIAS, datasets: [{ label: '% dentro da Meta', data: pct, backgroundColor: pct.map(v => v >= 70 ? 'rgba(61,191,122,.75)' : v >= 40 ? 'rgba(200,168,75,.75)' : 'rgba(200,75,75,.75)'), borderRadius: 4 }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: GR }, y: { grid: GR, beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } } }
    });
  } else {
    if (insTitle) insTitle.textContent = `AVALIADO VS META — ${pf.value?.toUpperCase()}`;
    const aval = CRIMES.map(c => sf(qsc({ crime: c })));
    const meta = CRIMES.map(c => sf(qsc({ crime: c }), 'meta'));
    mk('c-cia-ins', {
      type: 'bar',
      data: {
        labels: CRIMES.map(cl),
        datasets: [
          { label: 'Meta',     data: meta, backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 4 },
          { label: 'Avaliado', data: aval, backgroundColor: aval.map((v, j) => meta[j] > 0 && v <= meta[j] ? 'rgba(61,191,122,.75)' : 'rgba(200,75,75,.75)'), borderRadius: 4 }
        ]
      },
      options: { responsive: true, plugins: { legend: { labels: { boxWidth: 9 } } }, scales: { x: { grid: GR }, y: { grid: GR, beginAtZero: true } } }
    });
  }
}

// ---------------------------------------------------------------------------
// Evolução
// ---------------------------------------------------------------------------

function renderEvolucao() {
  const sel = document.getElementById('evol-crime-sel');
  if (sel && !sel.options.length) {
    CRIMES.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
  }
  const crime = sel?.value || CRIMES[0];

  // Gráfico de linhas: Avaliado · Meta · Anterior · Tendência
  mk('c-evol-main', {
    type: 'line',
    data: {
      labels: MESES,
      datasets: [
        {
          label: 'Avaliado',
          data: MESES.map(m => sf(q({ crime, mes: m }))),
          borderColor: '#c8a84b', backgroundColor: 'rgba(200,168,75,.08)',
          tension: .4, fill: true, pointRadius: 5, pointBackgroundColor: '#c8a84b', borderWidth: 2
        },
        {
          label: 'Meta',
          data: MESES.map(m => sf(q({ crime, mes: m }), 'meta')),
          borderColor: 'rgba(61,191,122,.6)', backgroundColor: 'transparent',
          tension: .4, borderDash: [6, 3], pointRadius: 3, borderWidth: 1.5
        },
        {
          label: 'Anterior',
          data: MESES.map(m => sf(q({ crime, mes: m }), 'anterior')),
          borderColor: 'rgba(255,255,255,.18)', backgroundColor: 'transparent',
          tension: .4, borderDash: [3, 4], pointRadius: 2, borderWidth: 1
        },
        {
          label: 'Tendência',
          data: MESES.map(m => sf(q({ crime, mes: m }), 'tend')),
          borderColor: '#3d7abf', backgroundColor: 'transparent',
          tension: .4, borderDash: [8, 4], pointRadius: 3, borderWidth: 1.5
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { boxWidth: 9 } } },
      scales: { x: { grid: GR }, y: { grid: GR, beginAtZero: true } }
    }
  });

  // Tabela: municípios × meses para o crime selecionado
  const tblTitle = document.getElementById('evol-tbl-title');
  if (tblTitle) tblTitle.textContent = `${crime} — Avaliado por Município × Mês`;

  let h = '<thead><tr><th>Município</th><th>CIA</th>' + MESES.map(m => `<th>${m}</th>`).join('') + '<th>Total</th></tr></thead><tbody>';
  MUNS.forEach(mun => {
    const rows = q({ crime, mun });
    if (!rows.length) return;
    const cia  = rows[0]?.cia || '—';
    const vals = MESES.map(m => sf(q({ crime, mun, mes: m })));
    const tot  = vals.reduce((a, b) => a + b, 0);
    h += `<tr><td style="font-weight:600">${mun}</td><td style="color:var(--tx3);font-size:11px">${cia}</td>${vals.map(v => `<td class="num">${v}</td>`).join('')}<td class="num" style="font-weight:700">${tot}</td></tr>`;
  });
  document.getElementById('tbl-evol').innerHTML = h + '</tbody>';
}

// ---------------------------------------------------------------------------
// Modal de detalhes
// ---------------------------------------------------------------------------

function moDestroy() { moCh.forEach(c => c.destroy()); moCh = []; }

function moOpen(crime, color) {
  moDestroy();
  document.getElementById('mo-crime').textContent     = crime.toUpperCase();
  document.getElementById('mo-accent').style.background = color;
  document.getElementById('mo-sub').textContent       = 'ANÁLISE DETALHADA — ' + pLbl(selMeses).toUpperCase();

  const aval = sf(q({ crime, mes: selMeses }));
  const meta = sf(q({ crime, mes: selMeses }), 'meta');
  const ant  = sf(q({ crime, mes: selMeses }), 'anterior');
  const vp   = ant > 0 ? ((aval - ant) / ant * 100).toFixed(0) : 0;
  const topM = MUNS.map(m => ({ m, v: sf(q({ crime, mun: m, mes: selMeses })) })).sort((a, b) => b.v - a.v)[0];
  const vc   = parseFloat(vp) <= 0 ? 'var(--green2)' : 'var(--red2)';
  const mok  = meta > 0 && aval <= meta;

  document.getElementById('mo-kpis').innerHTML = `
    <div class="mk"><div class="mk-lbl">Total Avaliado</div><div class="mk-val" style="color:${color}">${aval}</div><div class="mk-sub">${pLbl(selMeses)}</div></div>
    <div class="mk"><div class="mk-lbl">Var vs Anterior</div><div class="mk-val" style="color:${vc}">${parseFloat(vp) <= 0 ? '▼' : '▲'}${Math.abs(vp)}%</div><div class="mk-sub">Ant: ${ant}</div></div>
    <div class="mk"><div class="mk-lbl">Município Crítico</div><div class="mk-val" style="color:${color};font-size:16px;padding-top:6px">${topM.m}</div><div class="mk-sub">${topM.v} casos</div></div>
    <div class="mk"><div class="mk-lbl">Meta</div><div class="mk-val" style="color:${mok ? 'var(--green2)' : 'var(--red2)'};font-size:16px;padding-top:6px">${mok ? '✓ Ok' : '✗ Acima'}</div><div class="mk-sub">Meta:${meta} | Real:${aval}</div></div>`;

  const munVals   = MUNS.map(m => sf(q({ crime, mun: m, mes: selMeses })));
  const munMetas  = MUNS.map(m => sf(q({ crime, mun: m, mes: selMeses }), 'meta'));
  const munAnts   = MUNS.map(m => sf(q({ crime, mun: m, mes: selMeses }), 'anterior'));
  const munColors = munVals.map((a, i) => {
    const m = munMetas[i], ant = munAnts[i];
    if (m > 0 && a <= m)  return 'rgba(61,191,122,.80)';   // verde — dentro da meta
    if (a < ant)           return 'rgba(191,122,61,.85)';   // laranja — acima da meta mas melhorando
    return 'rgba(200,75,75,.80)';                           // vermelho — acima da meta e piorando
  });
  const ctx1 = document.getElementById('mo-bar').getContext('2d');
  moCh.push(new Chart(ctx1, {
    type: 'bar',
    data: { labels: MUNS.map(m => m.split(' ')[0]), datasets: [{ label: 'Avaliado', data: munVals, backgroundColor: munColors, borderRadius: 3 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: GR }, y: { grid: GR, beginAtZero: true, ticks: { stepSize: 1 } } } }
  }));

  const withOcc = MUNS.map(m => ({ m, v: sf(q({ crime, mun: m, mes: selMeses })) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const lc2     = ['#c8a84b','#3d7abf','#c84b4b','#3dbf7a','#bf7a3d','#7a4bbf','#4bbfbf','#e06060','#5ae09a'];
  const ctx2    = document.getElementById('mo-line').getContext('2d');
  moCh.push(new Chart(ctx2, {
    type: 'line',
    data: {
      labels: MESES,
      datasets: withOcc.map(({ m }, i) => ({
        label: m,
        data: MESES.map(mes => sf(q({ crime, mun: m, mes }))),
        borderColor: lc2[i % lc2.length], backgroundColor: 'transparent', tension: 0, pointRadius: 5, borderWidth: 2,
        borderDash: i % 2 === 1 ? [5, 3] : [], pointStyle: i % 2 === 1 ? 'triangle' : 'circle', pointBackgroundColor: lc2[i % lc2.length]
      }))
    },
    options: { responsive: true, plugins: { legend: { labels: { boxWidth: 8, padding: 8, font: { size: 10 }, usePointStyle: true } } }, scales: { x: { grid: GR }, y: { grid: GR, beginAtZero: true, ticks: { stepSize: 1 } } } }
  }));

  const mm   = MUNS.map(m => sf(q({ crime, mun: m, mes: selMeses }), 'meta'));
  const ma   = MUNS.map(m => sf(q({ crime, mun: m, mes: selMeses })));
  const ctx3 = document.getElementById('mo-meta').getContext('2d');
  moCh.push(new Chart(ctx3, {
    type: 'bar',
    data: {
      labels: MUNS.map(m => m.split(' ')[0]),
      datasets: [
        { label: 'Meta',     data: mm, backgroundColor: 'rgba(255,255,255,.09)', borderRadius: 3 },
        { label: 'Avaliado', data: ma, backgroundColor: ma.map((v, i) => mm[i] > 0 && v <= mm[i] ? 'rgba(61,191,122,.75)' : 'rgba(200,75,75,.75)'), borderRadius: 3 }
      ]
    },
    options: { responsive: true, plugins: { legend: { labels: { boxWidth: 8 } } }, scales: { x: { grid: GR }, y: { grid: GR, beginAtZero: true } } }
  }));

  const cv   = CIAS.map(c => sf(q({ crime, cia: c, mes: selMeses })));
  const ctx4 = document.getElementById('mo-donut').getContext('2d');
  moCh.push(new Chart(ctx4, {
    type: 'doughnut',
    data: { labels: ['1ª CIA','2ª CIA','3ª CIA'], datasets: [{ data: cv, backgroundColor: ['#c8a84b','#3d7abf','#c84b4b'], borderWidth: 0, hoverOffset: 5 }] },
    options: { responsive: true, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, padding: 10, font: { size: 10 } } } } }
  }));

  const sorted = MUNS.map(m => {
    const rows = q({ crime, mun: m, mes: selMeses });
    return { m, cia: rows[0]?.cia || '—', aval: sf(rows), meta: sf(rows, 'meta'), ant: sf(rows, 'anterior') };
  }).sort((a, b) => b.aval - a.aval);

  let tbl = '<thead><tr><th>#</th><th>Município</th><th>CIA</th><th>Ant</th><th>Meta</th><th>Aval</th><th>Var%</th><th>Status</th></tr></thead><tbody>';
  sorted.forEach((row, i) => {
    const vp2 = row.ant > 0 ? ((row.aval - row.ant) / row.ant * 100).toFixed(0) : '—';
    const vc2 = parseFloat(vp2) > 0 ? 'var(--red2)' : parseFloat(vp2) < 0 ? 'var(--green2)' : 'var(--tx3)';
    const vt2 = vp2 !== '—' ? (parseFloat(vp2) > 0 ? '▲' : '▼') + Math.abs(vp2) + '%' : vp2;
    let st, sc;
    if (row.meta > 0) {
      if (row.aval <= row.meta)        { st = '✓ Meta';       sc = 'var(--green2)'; }
      else if (row.aval < row.ant)     { st = '↗ Em Evolução'; sc = '#e8965a'; }
      else                             { st = '✗ Acima';      sc = 'var(--red2)'; }
    } else {
      if (row.aval === 0)              { st = '✓ Zero';       sc = 'var(--green2)'; }
      else if (row.aval < row.ant)     { st = '↗ Em Evolução'; sc = '#e8965a'; }
      else                             { st = 'Sem Meta';     sc = 'var(--tx3)'; }
    }
    tbl += `<tr><td style="font-family:'DM Mono',monospace;color:var(--tx3);font-size:10px">${i + 1}</td><td style="font-weight:600">${row.m}</td><td style="color:var(--tx3);font-size:11px">${row.cia}</td><td class="num" style="color:var(--tx3)">${row.ant}</td><td class="num">${row.meta || '—'}</td><td class="num" style="font-weight:700;color:${color}">${row.aval}</td><td class="num" style="color:${vc2}">${vt2}</td><td style="font-family:'DM Mono',monospace;font-size:10px;color:${sc}">${st}</td></tr>`;
  });
  document.getElementById('mo-tbl').innerHTML = tbl + '</tbody>';
  document.getElementById('mo').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function moClickOut(e) { if (e.target === document.getElementById('mo')) moClose(); }
function moClose() {
  document.getElementById('mo').classList.remove('on');
  document.body.style.overflow = '';
  setTimeout(moDestroy, 250);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') moClose(); });

// ---------------------------------------------------------------------------
// Upload CSV → Supabase
// ---------------------------------------------------------------------------

let uploadData = null;

function openUploadModal() {
  uploadData = null;
  document.getElementById('upl-file').value = '';
  document.getElementById('upl-preview').classList.remove('on');
  const msg = document.getElementById('upl-msg');
  msg.className = 'upl-msg';
  document.getElementById('upl-confirm').classList.remove('on');
  document.getElementById('upl-confirm').disabled = false;
  document.getElementById('upl-confirm').textContent = 'Importar';
  document.getElementById('upl-mo').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeUploadModal() {
  document.getElementById('upl-mo').classList.remove('on');
  document.body.style.overflow = '';
}

function uplClickOut(e) {
  if (e.target === document.getElementById('upl-mo')) closeUploadModal();
}

function showUplMsg(txt, type) {
  const el = document.getElementById('upl-msg');
  el.textContent = txt;
  el.className = 'upl-msg on ' + (type || '');
}

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  showUplMsg('Lendo arquivo...', 'info');
  uploadData = null;
  document.getElementById('upl-preview').classList.remove('on');
  document.getElementById('upl-confirm').classList.remove('on');

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
    complete: (results) => {
      if (!results.data.length) {
        showUplMsg('Arquivo vazio ou sem registros válidos.', 'err');
        return;
      }

      const required = ['Ano', 'Mes', 'Cia', 'Municipio', 'Crime', 'Anterior', 'Meta', 'Avaliado'];
      const headers  = Object.keys(results.data[0]);
      const missing  = required.filter(r => !headers.some(h => h.toLowerCase() === r.toLowerCase()));

      if (missing.length) {
        showUplMsg(`Colunas ausentes: ${missing.join(', ')}`, 'err');
        return;
      }

      // Normaliza chaves (trim) e filtra linhas válidas
      uploadData = results.data
        .map(row => { const n = {}; Object.entries(row).forEach(([k, v]) => { n[k.trim()] = (v || '').trim(); }); return n; })
        .filter(r => r.Mes && r.Crime);

      const meses = [...new Set(uploadData.map(r => r.Mes))].filter(Boolean);
      const anos  = [...new Set(uploadData.map(r => r.Ano))].filter(Boolean);

      document.getElementById('upl-fn').textContent     = file.name;
      document.getElementById('upl-rows').textContent   = uploadData.length;
      document.getElementById('upl-period').textContent = `${anos.join(', ')} — ${meses.join(', ')}`;
      document.getElementById('upl-preview').classList.add('on');
      document.getElementById('upl-confirm').classList.add('on');
      showUplMsg(`${uploadData.length} registros prontos para importar.`, 'info');
    },
    error: (err) => {
      showUplMsg('Erro ao ler o arquivo: ' + err.message, 'err');
    }
  });
}

async function confirmUpload() {
  if (!uploadData?.length) return;
  const btn = document.getElementById('upl-confirm');
  btn.disabled = true;
  btn.textContent = 'Importando...';
  showUplMsg('Enviando para o Supabase...', 'info');

  try {
    const res  = await fetch(`${API}/upload`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ records: uploadData })
    });
    const json = await res.json();

    if (!res.ok || !json.ok) throw new Error(json.error || 'Erro desconhecido');

    showUplMsg(`✓ ${json.uploaded} registros importados. Total na base: ${json.total}.`, 'ok');
    btn.classList.remove('on');

    // Recarrega o dashboard com os novos dados
    await loadData();
    selMeses = [...MESES];
    hmMeses  = [...MESES];
    buildSbMes();
    buildHmFilter();
    buildPageFilters();
    renderAll();
    await updateSyncStatus();

  } catch (err) {
    showUplMsg('✗ ' + err.message, 'err');
    btn.disabled = false;
    btn.textContent = 'Importar';
  }
}

// ---------------------------------------------------------------------------
// Navegação entre páginas
// ---------------------------------------------------------------------------

function goPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('on'));
  document.getElementById('page-' + id).classList.add('on');
  btn.classList.add('on');
}

// ---------------------------------------------------------------------------
// Inicia a aplicação
// ---------------------------------------------------------------------------

init();
