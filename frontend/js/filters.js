// ═══════════════════════════════════════════════════════════════════════════
// FILTROS POR PÁGINA — estado de escopo (CIA / município / batalhão)
// Cada página (visao, metas, evolucao) mantém seu próprio filtro independente.
// O filtro é lido pelas funções de render via scope(key) → {cia, mun ou {}}.
// Alterar o filtro da sidebar (sbSetScope) afeta apenas a visão geral;
// os dropdowns de cada página afetam somente aquela página.
// ═══════════════════════════════════════════════════════════════════════════

const pageFilters = {
  visao:    { type: 'btl', value: null },
  metas:    { type: 'btl', value: null, crime: '__all__' },
  evolucao: { type: 'btl', value: null },
};

// Retorna {cia: x} ou {mun: x} ou {} para uso em q()
function scope(key) {
  const f = pageFilters[key];
  if (f.type === 'cia') return { cia: f.value };
  if (f.type === 'mun') return { mun: f.value };
  return {};
}

// Sincroniza a barra de meses da Visão Geral com selMeses atual
function syncSidebarMes() {
  document.querySelectorAll('.pf-ano-sel').forEach(s => { s.value = selAno || ''; });
  document.querySelectorAll('.mes-btn-all').forEach(b => b.classList.toggle('on', selMeses.length === MESES.length));
  document.querySelectorAll('.mes-btn-vis').forEach(b => {
    b.classList.toggle('on', selMeses.includes(b.dataset.mes || b.textContent.trim()));
  });
  // Sincroniza selects de mês nas barras de filtro
  document.querySelectorAll('.pf-mes').forEach(s => {
    s.value = selMeses.length === MESES.length ? '__all__' : selMeses[0];
  });
}

// Constrói a barra de filtro de uma página com dropdowns
function buildPageFilter(containerId, key, renderFn, opts = {}) {
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
    ['Todos', '__all__'],
    ...MESES.map(m => [MES_ABREV[m] || m, m])
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
    const ciaVal   = sCia.value;
    const munVal   = sMun.value;
    const crimeVal = sCrime ? sCrime.value : '__all__';
    if (munVal !== '__all__') {
      pageFilters[key] = { type: 'mun', value: munVal, crime: crimeVal };
      btnBtl.classList.remove('on');
    } else if (ciaVal !== '__all__') {
      pageFilters[key] = { type: 'cia', value: ciaVal, crime: crimeVal };
      btnBtl.classList.remove('on');
    } else {
      pageFilters[key] = { type: 'btl', value: null, crime: crimeVal };
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
    pageFilters[key] = { type: 'btl', value: null, crime: sCrime ? sCrime.value : '__all__' };
    btnBtl.classList.add('on');
    renderFn();
  });

  // (opcional) Select de crime — exibido apenas quando opts.showCrime for true
  let sCrime = null;
  if (opts.showCrime) {
    const { wrap: wCrime, sel: _sCrime } = makeField('CRIME:', [
      ['Todos os crimes', '__all__'],
      ...CRIMES.map(c => [c, c])
    ]);
    sCrime = _sCrime;
    sCrime.addEventListener('change', () => {
      pageFilters[key].crime = sCrime.value;
      renderFn();
    });
  }

  const sep = document.createElement('span');
  sep.className = 'pf-sep';

  const row = document.createElement('div');
  row.className = 'pf-row';
  row.appendChild(btnBtl);
  row.appendChild(wMes);
  row.appendChild(sep);
  row.appendChild(wCia);
  row.appendChild(wMun);
  if (sCrime) row.appendChild(sCrime.parentElement);
  el.appendChild(row);
}

function buildPageFilters() {
  buildPageFilter('pf-metas',   'metas',    renderMetas, { showCrime: true });
  buildPageFilter('pf-evolucao','evolucao', renderEvolucao);
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS DE FILTRO E VISUALIZAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

// q(filtro) — filtra RAW pelo ano selecionado + campos extras
//   ex: q({ crime: 'Homicídio', mun: 'Votorantim', mes: ['Janeiro','Fevereiro'] })
const q    = f => RAW.filter(r => (!selAno || r.ano === selAno) && Object.entries(f).every(([k,v]) => Array.isArray(v) ? v.includes(r[k]) : r[k] === v));

// sf(arr, campo) — soma campo numérico dos registros filtrados (padrão: 'avaliado')
const sf   = (arr, field = 'avaliado') => arr.reduce((s, r) => s + (r[field] || 0), 0);

// pLbl(meses) — label amigável do período selecionado
const pLbl = m => m.length === MESES.length ? 'Todos os meses' : m.join(' + ');

// hcol(aval, meta, ant) — cor de fundo de célula por status vs meta e anterior
//   Verde  → dentro da meta
//   Laranja → acima da meta mas melhorando vs anterior
//   Vermelho → acima da meta e piorando
const hcol = (aval, meta, ant) => {
  if (aval === 0) return 'rgba(74,158,232,.10)';
  if (meta === 0) return aval <= ant ? 'rgba(191,122,61,.85)' : 'rgba(230,100,100,.80)';
  if (aval <= meta) return 'rgba(61,191,122,.70)';   // verde: dentro da meta
  if (aval <= ant)  return 'rgba(191,122,61,.85)';   // laranja: acima da meta, melhor que anterior
  return 'rgba(230,100,100,.80)';                       // vermelho: acima da meta
};
// mk(id, cfg) — cria/substitui instância Chart.js; destrói a anterior para evitar acúmulo
const mk  = (id, cfg) => { if (charts[id]) charts[id].destroy(); charts[id] = new Chart(document.getElementById(id), cfg); };
// cl(crime) — label de exibição abreviada (Homicídio → "Vítimas de Letalidade Violenta")
const cl  = c => c === 'Homicídio' ? 'Vítimas de Letalidade Violenta' : c.replace(' Vulnerável', ' Vuln.').replace(' Veículos', ' Veíc.');

// ═══════════════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO — carregamento de dados e bootstrap do dashboard
// Sequência de boot (chamada pelo init() ao carregar a página):
//   1. loadData()     → busca /api/meta + /api/registros → preenche RAW[]
//   2. Inicializa selAno, selMeses, hmMeses com o ano mais recente
//   3. Configura Chart.js (cores/fontes padrão)
//   4. Chama renderAll() → KPIs + Visão + Metas + Heatmap + Evolução
//   5. Chama renderHome() → painel inicial
// ═══════════════════════════════════════════════════════════════════════════

// Busca lista de crimes/municípios/CIAs/anos e todos os registros RAC do backend
async function loadData() {
  const [meta, registros] = await Promise.all([
    authFetch(`${API}/meta`).then(r => r.json()),
    authFetch(`${API}/registros`).then(r => r.json())
  ]);
  CRIMES = meta.crimes;
  MUNS   = meta.muns;
  CIAS   = meta.cias;
  ANOS   = (meta.anos || []).sort((a, b) => b - a);
  // Normaliza nomes de crime para forma canônica (resolve inconsistências de acento no upload)
  const _nCrime = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const CRIMES_CANONICAL = ['Homicídio','Estupro','Estupro de Vulnerável','Roubo','Furto','Roubo de Veículos','Furto de Veículos'];
  RAW = registros.map(r => ({
    ...r,
    crime: CRIMES_CANONICAL.find(c => _nCrime(c) === _nCrime(r.crime)) || r.crime
  }));
}

function getMesForAno(ano) {
  return [...new Set(RAW.filter(r => r.ano === ano).map(r => r.mes))]
    .sort((a, b) => MES_ORD.indexOf(a) - MES_ORD.indexOf(b));
}

async function updateSyncStatus() {
  // exibição gerenciada por loadDashboardConfig e registraUpload
}

// Força sincronização do cache do backend com o Supabase (POST /api/sync)
// e re-renderiza todos os componentes com os dados atualizados
async function forceSync() {
  const btn = document.getElementById('sync-btn');
  if (btn) { btn.textContent = '↻ Sincronizando...'; btn.disabled = true; btn.style.color = 'var(--gold2)'; }
  try {
    await authFetch(`${API}/sync`, { method: 'POST' });
    await loadData();
    selAno   = ANOS[0] || new Date().getFullYear();
    MESES    = getMesForAno(selAno);
    selMeses = [...MESES];
    hmMeses  = [...MESES];
    buildSbMes();
    buildHmFilter();
    renderAll();
    await updateSyncStatus();
    if (btn) { btn.textContent = '✓ Sincronizado'; btn.style.color = 'var(--green2)'; }
    setTimeout(() => { if (btn) { btn.textContent = '↻ Sincronizar'; btn.style.color = ''; } }, 3000);
  } catch (err) {
    if (btn) { btn.textContent = '✕ Erro ao sincronizar'; btn.style.color = 'var(--red2)'; }
    setTimeout(() => { if (btn) { btn.textContent = '↻ Sincronizar'; btn.style.color = ''; } }, 3000);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function init() {
  initUserBlock();

  // Etapa 1: carregar dados da API
  try {
    await loadData();
  } catch (err) {
    console.error('Erro ao carregar dados da API:', err);
    document.querySelector('main').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px;text-align:center;padding:20px">
        <div style="font-size:36px">⚠️</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;color:var(--tx)">Falha ao carregar dados</div>
        <div style="font-size:19px;color:var(--tx3);max-width:480px">Não foi possível conectar à API. Verifique sua conexão com a internet e tente novamente.</div>
        <button onclick="location.reload()" style="margin-top:8px;padding:12px 28px;background:rgba(61,122,191,.15);border:1px solid rgba(61,122,191,.3);color:#5a9de0;border-radius:6px;cursor:pointer;font-size:19px;font-weight:600">↻ Tentar novamente</button>
      </div>`;
    return;
  }

  // Etapa 2: inicializar e renderizar
  try {
    if (!window.Chart) throw new Error('Biblioteca de gráficos (Chart.js) não carregou. Verifique sua conexão e recarregue.');

    selAno   = ANOS[0] || new Date().getFullYear();
    MESES    = getMesForAno(selAno);
    selMeses = [...MESES];
    hmMeses  = [...MESES];

    Chart.defaults.color       = '#e0ecf8';
    Chart.defaults.borderColor = '#1c2235';
    Chart.defaults.font.family = "'DM Mono', monospace";
    Chart.defaults.font.size   = 22;

    buildSbMes();
    buildHmFilter();
    buildPageFilters();
    renderAll();
    updateSyncStatus();
    renderHome();
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Erro ao renderizar dashboard:', err);
    document.querySelector('main').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh;gap:16px;text-align:center;padding:20px">
        <div style="font-size:36px">⚠️</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;color:var(--tx)">Erro ao inicializar</div>
        <div style="font-size:19px;color:var(--tx3);max-width:480px">${err.message}</div>
        <button onclick="location.reload()" style="margin-top:8px;padding:12px 28px;background:rgba(61,122,191,.15);border:1px solid rgba(61,122,191,.3);color:#5a9de0;border-radius:6px;cursor:pointer;font-size:19px;font-weight:600">↻ Recarregar</button>
      </div>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR DE FILTROS — barra superior com seleção de ano, meses e escopo
// Renderizada nos elementos #vis-mes-bar e #vis-mes-bar-2.
// Ao trocar ano → sbSetAno() recarrega meses disponíveis e re-renderiza tudo.
// Ao clicar em mês → sbTog() alterna o mês; se "Todos" → sbAll().
// Ao trocar CIA/Cidade → sbSetScope() atualiza pageFilters.visao.
// ═══════════════════════════════════════════════════════════════════════════

// Constrói (ou reconstrói) a barra de filtros da Visão Geral
function buildSbMes() {
  const pf = pageFilters.visao;

  // Linha 1: Período + ANO + meses
  let row1 = `<div class="pf-row">`;
  row1 += `<span class="pf-label">Período</span>`;
  row1 += `<div class="pf-field"><span class="pf-label">ANO</span><select name="filtro-ano" autocomplete="off" class="pf-select pf-ano-sel" onchange="sbSetAno(this.value ? parseInt(this.value) : null)">`;
  row1 += `<option value="" ${!selAno ? 'selected' : ''}>Todos</option>`;
  ANOS.forEach(a => row1 += `<option value="${a}" ${a === selAno ? 'selected' : ''}>${a}</option>`);
  row1 += `</select></div>`;
  row1 += `<button class="pf-btn mes-btn-all" onclick="sbAll(this)">Todos</button>`;
  const _mComDados = new Set(MESES);
  MES_ORD.forEach(m => {
    const ok = _mComDados.has(m);
    row1 += `<button class="pf-btn mes-btn-vis" data-mes="${m}" onclick="sbTog('${m}',this)"${ok ? '' : ' style="opacity:.35" title="Sem dados"'}>${MES_ABREV[m] || m}</button>`;
  });
  row1 += `</div>`;

  // Linha 2: CIA + Cidade
  const munList = pf.type === 'cia' && pf.value ? MUNS.filter(m => RAW.some(r => r.mun === m && r.cia === pf.value)) : MUNS;
  let row2 = `<div class="pf-row">`;
  row2 += `<div class="pf-field"><span class="pf-label">CIA</span><select class="pf-select" name="sb-cia-sel" autocomplete="off" onchange="sbSetScope('cia',this.value)">`;
  row2 += `<option value="">Todas</option>`;
  CIAS.forEach(c => row2 += `<option value="${c}" ${pf.type==='cia'&&pf.value===c?'selected':''}>${c}</option>`);
  row2 += `</select></div>`;
  row2 += `<div class="pf-field"><span class="pf-label">Cidade</span><select class="pf-select" name="sb-mun-sel" autocomplete="off" onchange="sbSetScope('mun',this.value)">`;
  row2 += `<option value="">Todas</option>`;
  munList.forEach(m => row2 += `<option value="${m}" ${pf.type==='mun'&&pf.value===m?'selected':''}>${m}</option>`);
  row2 += `</select></div>`;
  row2 += `</div>`;

  ['vis-mes-bar', 'vis-mes-bar-2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = row1 + row2;
  });
  syncSidebarMes();
}

function sbSetScope(type, val) {
  if (!val) {
    pageFilters.visao = { type: 'btl', value: null };
  } else {
    pageFilters.visao = { type, value: val };
  }
  buildSbMes();
  renderKPIs();
  renderVisao();
}

function buildHmFilter() {
  const _mComDados = new Set(MESES);
  let h = `<button class="hm-mbtn on" onclick="hmAll(this)">Todos</button>`;
  MES_ORD.forEach(m => {
    const ok = _mComDados.has(m);
    h += `<button class="hm-mbtn" onclick="hmTog('${m}',this)"${ok ? '' : ' style="opacity:.35" title="Sem dados"'}>${m}</button>`;
  });
  document.getElementById('hm-filter-btns').innerHTML = h;
}

function sbAll(btn) {
  selMeses = [...MESES];
  syncSidebarMes();
  renderAll();
}

function sbSetAno(ano) {
  selAno   = ano;
  MESES    = ano ? getMesForAno(ano) : [...new Set(RAW.map(r => r.mes))].sort((a,b) => MES_ORD.indexOf(a) - MES_ORD.indexOf(b));
  selMeses = [...MESES];
  hmMeses  = [...MESES];
  buildSbMes();
  buildHmFilter();
  buildPageFilters();
  syncSidebarMes();
  renderAll();
}

function sbTog(mes) {
  if (selMeses.length === MESES.length) {
    // Saindo do "todos" — começa só com esse mês
    selMeses = [mes];
  } else {
    const idx = selMeses.indexOf(mes);
    if (idx >= 0) {
      selMeses.splice(idx, 1);
      if (selMeses.length === 0) selMeses = [...MESES]; // não deixa vazio
    } else {
      selMeses.push(mes);
      selMeses.sort((a, b) => MES_ORD.indexOf(a) - MES_ORD.indexOf(b));
    }
  }
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
  document.querySelectorAll('#hm-filter-btns .hm-mbtn').forEach(b => {
    b.classList.toggle('on', b.textContent.trim() !== 'Todos' && b.textContent.trim() === mes);
  });
  renderHeatmap();
}

