// uis.js — Seção UIS: restrições médicas/odontológicas dos PMs
// Ref: BG PM 166, de 30 de agosto de 2006

// ═══════════════════════════════════════════════════════════════
// TABELA DE CÓDIGOS DE RESTRIÇÃO (BG PM 166/2006, item 4.1)
// grupo:
//   'admin_only'       → somente serviços administrativos (itens 5.2.2 e 5.2.5)
//   'admin_apoio'      → administrativo/apoio, sem atendimento ao público (itens 5.2.6, 5.2.7)
//   'diurno'           → trabalho somente diurno (item 5.2.3)
//   'operacional'      → operacional com condições adaptadas / guarda / admin (item 5.2.1)
//   'policiamento'     → policiamento ostensivo preferencial (item 5.2.4)
//   'policiamento_obt' → deve trabalhar em policiamento ostensivo (item 5.2.8)
// ═══════════════════════════════════════════════════════════════
const UIS_CODIGOS = {
  AU: { desc: 'Audição seja primordial',          grupo: 'admin_only' },
  BS: { desc: 'Busca e salvamento',               grupo: 'operacional' },
  CB: { desc: 'Corte de barba',                   grupo: 'admin_apoio' },
  CC: { desc: 'Corte de cabelo',                  grupo: 'admin_apoio' },
  CI: { desc: 'Correr para incêndio',             grupo: 'operacional' },
  DG: { desc: 'Datilografia e Digitação',         grupo: 'policiamento_obt' },
  DV: { desc: 'Dirigir veículo',                  grupo: 'operacional' },
  EF: { desc: 'Educação Física',                  grupo: 'operacional' },
  EM: { desc: 'Escrever a mão',                   grupo: 'policiamento_obt' },
  EP: { desc: 'Equilíbrio seja primordial',       grupo: 'admin_only' },
  ES: { desc: 'Exposição ao sol',                 grupo: 'admin_only' },
  FO: { desc: 'Formatura',                        grupo: 'operacional' },
  FP: { desc: 'Função policial restrita',         grupo: 'operacional' },
  IS: { desc: 'Tocar instrumento de sopro',       grupo: 'operacional' },
  LP: { desc: 'Longa permanência em pé',          grupo: 'operacional' },
  LR: { desc: 'Locais ruidosos',                  grupo: 'admin_only' },
  LS: { desc: 'Longa permanência sentado',        grupo: 'policiamento_obt' },
  MA: { desc: 'Manuseio com animais',             grupo: 'operacional' },
  MC: { desc: 'Montar a cavalo',                  grupo: 'operacional' },
  MG: { desc: 'Mergulho',                         grupo: 'operacional' },
  MP: { desc: 'Manipulação de pó',               grupo: 'policiamento_obt' },
  OU: { desc: 'Ordem unida',                      grupo: 'operacional' },
  PO: { desc: 'Policiamento',                     grupo: 'operacional' },
  PQ: { desc: 'Serviços com produtos químicos',   grupo: 'operacional' },
  PT: { desc: 'Prática de tiro',                  grupo: 'admin_only' },
  SA: { desc: 'Serviços aquáticos',               grupo: 'operacional' },
  SB: { desc: 'Serviços burocráticos',            grupo: 'policiamento_obt' },
  SE: { desc: 'Serviços externos',                grupo: 'operacional' },
  SG: { desc: 'Serviço de guarda',                grupo: 'policiamento' },
  SH: { desc: 'Serviços em altura',               grupo: 'operacional' },
  SI: { desc: 'Serviços internos',                grupo: 'policiamento_obt' },
  SM: { desc: 'Serviços manuais',                 grupo: 'operacional' },
  SN: { desc: 'Serviços noturnos',                grupo: 'diurno' },
  SP: { desc: 'Serviços pesados',                 grupo: 'operacional' },
  ST: { desc: 'Serviços de telefonia',            grupo: 'policiamento_obt' },
  UA: { desc: 'Uso de arma',                      grupo: 'admin_only' },
  UB: { desc: 'Uso de botas',                     grupo: 'admin_apoio' },
  UC: { desc: 'Uso de calçado esportivo',         grupo: 'admin_apoio' },
  US: { desc: 'Uso de sapatos',                   grupo: 'admin_apoio' },
  UU: { desc: 'Uso de uniformes',                 grupo: 'admin_apoio' },
  VP: { desc: 'Visão seja primordial',            grupo: 'admin_only' },
  // Códigos especiais detectados por padrão de texto
  GESTANTE: { desc: 'Licença Gestante',           grupo: 'admin_only' },
  NAPS:     { desc: 'NAPS / Apoio Psicossocial',  grupo: 'admin_only' },
};

// Rótulo e cor de cada grupo (do mais restritivo ao menos)
const UIS_GRUPOS = {
  admin_only:       { label: 'SOMENTE SERVIÇOS ADMINISTRATIVOS',         cor: '#f07878', bg: 'rgba(240,120,120,0.12)', item: '5.2.2 / 5.2.5' },
  admin_apoio:      { label: 'ADMINISTRATIVO / APOIO (sem atend. público)', cor: '#c8a84b', bg: 'rgba(200,168,75,0.12)',  item: '5.2.6 / 5.2.7' },
  diurno:           { label: 'SOMENTE TURNO DIURNO',                      cor: '#e0965a', bg: 'rgba(224,150,90,0.12)',  item: '5.2.3' },
  policiamento:     { label: 'POLICIAMENTO OSTENSIVO (preferencial)',      cor: '#5a9de0', bg: 'rgba(90,158,224,0.12)', item: '5.2.4' },
  operacional:      { label: 'OPERACIONAL COM RESTRIÇÕES / GUARDA / ADM', cor: '#5ae09a', bg: 'rgba(90,224,154,0.12)', item: '5.2.1' },
  policiamento_obt: { label: 'DEVE TRABALHAR NO POLICIAMENTO OSTENSIVO',  cor: '#5ae09a', bg: 'rgba(90,224,154,0.12)', item: '5.2.8' },
};

// Prioridade de exibição: quanto menor o índice, mais restritivo
const UIS_PRIO = ['admin_only','admin_apoio','diurno','policiamento','operacional','policiamento_obt'];

// Dado um array de códigos, retorna o grupo mais restritivo
function uisGrupoMaisRestritivo(codigos) {
  let melhor = null;
  for (const cod of codigos) {
    const info = UIS_CODIGOS[cod.trim().toUpperCase()];
    if (!info) continue;
    const idx = UIS_PRIO.indexOf(info.grupo);
    if (melhor === null || idx < melhor) melhor = idx;
  }
  return melhor !== null ? UIS_PRIO[melhor] : null;
}

// Extrai array de códigos de um campo texto (ex: "EF,LP, OU" → ['EF','LP','OU'])
// Também detecta padrões de texto livre como LICENCA-GESTANTE e NAPS.
function uisExtrairCodigos(codigos_str) {
  const upper = (codigos_str || '').toUpperCase();
  const extra = [];
  if (/LICEN[CÇ]A[\s-]*GESTANTE|GESTANTE/.test(upper)) extra.push('GESTANTE');
  if (/NAPS/.test(upper)) extra.push('NAPS');
  const fromSplit = upper.split(/[,\s]+/).map(c => c.trim()).filter(c => /^[A-Z]{2,3}$/.test(c));
  return [...new Set([...extra, ...fromSplit])];
}

// ═══════════════════════════════════════════════════════════════
// SEÇÃO UIS — estado, filtros e renderização principal
// ═══════════════════════════════════════════════════════════════

let _uisFiltroIdx = -1;  // -1 = batalhão, 0+ = índice CIA em CIA_STRUCT
let _uisDetTipo   = null; // 'uis-ativas'|'uis-adm'|...|'ias-total'|'ias-aptos'|...
let _uisDetSub    = null; // sub-filtro de status dentro do modal IAS
let _uisDetCia    = -1;   // filtro CIA dentro do modal IAS (-1 = todas)

function uisSetFiltro(idx) {
  _uisFiltroIdx = idx;
  renderUisFiltroBar();
  renderUisPage();
}

function openUisDetail(tipo) {
  _uisDetTipo = tipo;
  _uisDetSub  = null;
  _uisDetCia  = -1;
  renderUisDetail();
  document.getElementById('uis-detail-mo').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeUisDetail() {
  if (window._iasDonutChart) { window._iasDonutChart.destroy(); window._iasDonutChart = null; }
  document.getElementById('uis-detail-mo').classList.remove('on');
  document.body.style.overflow = '';
}

function uisDetailClickOut(e) {
  if (e.target === document.getElementById('uis-detail-mo')) closeUisDetail();
}

function uisDetSubFiltroSet(key) {
  _uisDetSub = _uisDetSub === key ? null : key;
  renderUisDetail();
}

function uisDetCiaSet(idx) {
  _uisDetCia = idx;
  renderUisDetail();
}

function _uisOpmPassFilter(opm) {
  if (_uisFiltroIdx < 0 || typeof CIA_STRUCT === 'undefined') return true;
  const cia = CIA_STRUCT[_uisFiltroIdx];
  if (!cia) return true;
  return typeof _opmMatch === 'function' ? _opmMatch(opm || '', cia.units.flatMap(u => u.keys)) : true;
}

function _uisFilteredRestMap() {
  if (!_uisRestMap) return {};
  if (_uisFiltroIdx < 0) return _uisRestMap;
  const result = {};
  for (const [re, recs] of Object.entries(_uisRestMap)) {
    const f = recs.filter(r => _uisOpmPassFilter(r.opm));
    if (f.length) result[re] = f;
  }
  return result;
}

function _uisFilteredIasMap() {
  if (!_iasMap) return {};
  if (_uisFiltroIdx < 0) return _iasMap;
  const result = {};
  for (const [re, rec] of Object.entries(_iasMap)) {
    if (_uisOpmPassFilter(rec.opm)) result[re] = rec;
  }
  return result;
}

function _iasStatusFromRec(rec) {
  if (!rec) return null;
  if (!rec.data_vencimento) return 'vencido';
  const today = new Date().toISOString().slice(0, 10);
  const em30  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  if (rec.data_vencimento < today) return 'vencido';
  if (rec.data_vencimento <= em30) return 'vencendo';
  return 'apto';
}

function _iasAnivMes(aniv) {
  if (!aniv) return null;
  const s = String(aniv);
  const slash = s.split('/');
  if (slash.length >= 2) return slash[0].length <= 2 && parseInt(slash[0]) > 12 ? slash[1].padStart(2,'0') : slash[0].padStart(2,'0');
  const dash = s.split('-');
  if (dash.length >= 3) return dash[1].padStart(2,'0');
  return null;
}

function renderUisFiltroBar() {
  const el = document.getElementById('uis-filtro-bar');
  if (!el || typeof CIA_STRUCT === 'undefined') return;
  el.innerHTML =
    `<button class="pf-btn${_uisFiltroIdx === -1 ? ' on' : ''}" onclick="uisSetFiltro(-1)">Batalhão</button>` +
    CIA_STRUCT.map((cia, i) =>
      `<button class="pf-btn${_uisFiltroIdx === i ? ' on' : ''}" onclick="uisSetFiltro(${i})" style="${_uisFiltroIdx===i?`color:${cia.color};border-color:${cia.color}55`:''}">${cia.label}</button>`
    ).join('');
}

async function loadUisSection() {
  const content = document.getElementById('uis-content');
  if (content) content.innerHTML = '<div style="color:var(--tx3);font-size:17px;padding:20px">Carregando...</div>';
  try {
    await Promise.all([loadUisRestricoes(), loadIasMapa()]);
    renderUisFiltroBar();
    renderUisPage();
  } catch (e) {
    if (content) content.innerHTML = `<div style="color:#f07878;font-size:17px">Erro ao carregar UIS: ${e.message}</div>`;
  }
}

// Mapeia OPM para a cor da CIA correspondente (usa CIA_COR de users.js).
// Usa extração do dígito antes de "cia" para lidar com "1ª CIA", "1 CIA", "1CIA", etc.
function uisCiaColor(opm) {
  const s = (opm || '').toLowerCase();
  // Extrai o dígito antes de "cia" (com qualquer char entre, ex: "1ª cia", "1 cia", "1.cia")
  const m = s.match(/(\d)\s*.?\s*cia/);
  if (m && CIA_COR[m[1]]) return CIA_COR[m[1]];
  // Fallback por município-sede
  if (s.includes('alumin') || s.includes('votorantim')) return CIA_COR['1'];
  if (s.includes('ibiun') || s.includes('pied') || s.includes('tapir')) return CIA_COR['2'];
  if (s.includes('salto') || s.includes('aracoiab') || s.includes('pilar') || s.includes('ipero')) return CIA_COR['3'];
  if (/\bft\b|forca|forca tatica/.test(s)) return CIA_COR.ft;
  return '#ffffff';
}

// ─── Tooltip custom (estilo dashboard) para o gráfico por CIA/OPM ──────────
let _uisTipEl = null;

function _uisTipGet() {
  if (_uisTipEl) return _uisTipEl;
  _uisTipEl = document.createElement('div');
  _uisTipEl.id = 'uis-bar-tip';
  Object.assign(_uisTipEl.style, {
    position: 'fixed', pointerEvents: 'none', zIndex: '9999',
    display: 'none', maxWidth: '340px',
    background: '#0f1319', border: '1px solid rgba(255,255,255,.15)',
    borderRadius: '8px', padding: '12px 16px',
    boxShadow: '0 8px 32px rgba(0,0,0,.6)',
    fontFamily: "'DM Mono',monospace", fontSize: '13px', lineHeight: '1.6',
  });
  document.body.appendChild(_uisTipEl);
  return _uisTipEl;
}

function _uisTipShow(e, opm, cor, topCods) {
  const tip = _uisTipGet();
  // Para OPMs sem CIA (cor branco), usa rgba visível como cor de texto secundário
  const descCor = '#ffffff';
  const codsHtml = topCods.map(([cod, cnt, desc]) => `
    <div style="display:flex;align-items:baseline;gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.07)">
      <span style="font-weight:700;color:${cor};min-width:34px;font-size:16px">${cod}</span>
      <span style="color:${descCor};flex:1;font-size:15px">${desc}</span>
      <span style="font-weight:700;color:#ffffff;margin-left:10px;font-size:16px">${cnt}×</span>
    </div>`).join('');
  tip.innerHTML = `
    <div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;color:${cor};letter-spacing:.5px;margin-bottom:10px;text-transform:uppercase">${escHtml(opm)}</div>
    <div style="font-size:13px;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">Códigos mais frequentes</div>
    ${codsHtml || '<div style="color:rgba(255,255,255,.35);font-size:15px">Sem detalhes</div>'}`;
  tip.style.display = 'block';
  _uisTipMove(e);
}

function _uisTipMove(e) {
  const tip = _uisTipEl; if (!tip) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const tw = tip.offsetWidth || 300, th = tip.offsetHeight || 140;
  let x = e.clientX + 18, y = e.clientY - 20;
  if (x + tw > vw - 10) x = e.clientX - tw - 10;
  if (y + th > vh - 10) y = vh - th - 10;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}

function _uisTipHide() {
  if (_uisTipEl) _uisTipEl.style.display = 'none';
}
window.addEventListener('blur', _uisTipHide);
document.addEventListener('mouseleave', _uisTipHide);

function uisTipGenShow(e, html) {
  const tip = _uisTipGet();
  tip.innerHTML = html;
  tip.style.display = 'block';
  _uisTipMove(e);
}

function uisTipPmOver(e, re) {
  if (!_uisRestMap) return;
  const recs = (_uisRestMap[uisNormRE(re)] || []);
  if (!recs.length) return;
  const allCods = [...new Set(recs.flatMap(r => uisExtrairCodigos(r.codigos)))];
  const grupo = uisGrupoMaisRestritivo(allCods);
  const gInfo = grupo ? UIS_GRUPOS[grupo] : null;
  const cor = gInfo ? gInfo.cor : '#c8a84b';
  const codLines = allCods.map(c => {
    const inf = UIS_CODIGOS[c];
    return `<div style="display:flex;align-items:baseline;gap:10px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.07)">
      <span style="font-weight:700;color:${cor};min-width:34px;font-size:16px">${c}</span>
      <span style="color:#ffffff;flex:1;font-size:15px">${inf ? inf.desc : '—'}</span>
    </div>`;
  }).join('');
  uisTipGenShow(e,
    `<div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;color:${cor};letter-spacing:.5px;margin-bottom:10px;text-transform:uppercase">${gInfo ? gInfo.label : 'RESTRIÇÃO UIS'}</div>` +
    `<div style="font-size:13px;color:#ffffff;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">Códigos UIS</div>` +
    (codLines || `<div style="color:rgba(255,255,255,.35);font-size:15px">Sem detalhes</div>`)
  );
}

function renderUisPorOpm(porOpm, porOpmCodigos) {
  const entries = Object.entries(porOpm).sort((a,b) => b[1]-a[1]);
  const container = document.getElementById('uis-por-opm');
  if (!entries.length) { container.innerHTML = '<div style="color:#ffffff;font-size:17px;padding:8px">Sem dados</div>'; return; }
  const max = entries[0][1];

  // Pré-processa os dados de tooltip por OPM (armazena no elemento via dataset)
  const tipData = {};
  entries.forEach(([opm]) => {
    const codMap = (porOpmCodigos || {})[opm] || {};
    tipData[opm] = Object.entries(codMap).sort((a,b) => b[1]-a[1]).slice(0,6)
      .map(([cod, cnt]) => { const info = UIS_CODIGOS[cod]; return [cod, cnt, info ? info.desc : '—']; });
  });

  container.innerHTML = entries.map(([opm, n]) => {
    const cor  = uisCiaColor(opm);
    const hasTip = tipData[opm]?.length > 0;
    return `
    <div data-uis-opm="${escHtml(opm)}" style="display:flex;align-items:center;gap:12px;margin-bottom:10px;${hasTip ? 'cursor:pointer' : ''}">
      <div style="width:160px;font-size:22px;color:${cor};font-weight:700;flex-shrink:0;font-family:'Barlow Condensed',sans-serif;letter-spacing:.5px;line-height:1.2">${escHtml(opm)}</div>
      <div style="flex:1;background:var(--s3);border-radius:5px;height:26px;overflow:hidden">
        <div style="height:100%;width:${Math.round(n/max*100)}%;background:${cor};border-radius:5px;transition:width .4s;opacity:.85"></div>
      </div>
      <div style="width:38px;text-align:right;font-size:20px;font-weight:700;color:${cor}">${n}</div>
    </div>`;
  }).join('');

  // Delegação de eventos para o tooltip custom
  container.onmouseover = e => {
    const row = e.target.closest('[data-uis-opm]');
    if (!row) return;
    const opm = row.dataset.uisOpm;
    const cor = uisCiaColor(opm);
    _uisTipShow(e, opm, cor, tipData[opm] || []);
  };
  container.onmousemove = e => { if (e.target.closest('[data-uis-opm]')) _uisTipMove(e); };
  container.onmouseout  = e => { if (!e.relatedTarget?.closest('[data-uis-opm]')) _uisTipHide(); };
}

function renderUisPorCodigo(porCodigo) {
  const entries = Object.entries(porCodigo).sort((a,b) => b[1]-a[1]).slice(0,15);
  if (!entries.length) { document.getElementById('uis-por-codigo').innerHTML = '<div style="color:#ffffff;font-size:17px;padding:8px">Sem dados</div>'; return; }
  const max = entries[0][1];
  document.getElementById('uis-por-codigo').innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 0">${
    entries.map(([cod, n]) => {
      const info  = UIS_CODIGOS[cod];
      const grupo = info ? UIS_GRUPOS[info.grupo] : null;
      const cor   = grupo ? grupo.cor : '#aaa';
      return `<div title="${info ? info.desc : cod}" style="background:var(--s2);border:1px solid ${cor}44;border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:10px;cursor:default">
        <span style="font-family:'DM Mono',monospace;font-size:17px;font-weight:700;color:${cor}">${cod}</span>
        <span style="font-size:17px;color:#ffffff">${info ? info.desc : '—'}</span>
        <span style="font-size:22px;font-weight:800;color:#ffffff;margin-left:4px">${n}</span>
      </div>`;
    }).join('')
  }</div>`;
}

function renderUisTabelaCodigos() {
  const grupos = Object.entries(UIS_GRUPOS);
  let html = `<table class="tbl" style="font-size:15px"><thead><tr><th>Código</th><th>Descrição</th><th>Tipo de Emprego (BG PM 166/2006)</th><th>Item</th></tr></thead><tbody>`;
  for (const [grupo, gInfo] of grupos) {
    const codigos = Object.entries(UIS_CODIGOS).filter(([,v]) => v.grupo === grupo);
    for (const [cod, info] of codigos) {
      html += `<tr>
        <td><span style="font-family:'DM Mono',monospace;font-weight:700;color:${gInfo.cor}">${cod}</span></td>
        <td style="color:var(--tx)">${info.desc}</td>
        <td><span style="color:${gInfo.cor};font-size:11px;font-weight:600">${gInfo.label}</span></td>
        <td style="color:var(--tx3);white-space:nowrap">${gInfo.item}</td>
      </tr>`;
    }
  }
  html += '</tbody></table>';
  document.getElementById('uis-tabela-codigos').innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
// MODAL DE UPLOAD UIS
// ═══════════════════════════════════════════════════════════════

let _uisData = null;

function openUisModal() {
  _uisData = null;
  document.getElementById('uis-file').value = '';
  document.getElementById('uis-preview').style.display = 'none';
  document.getElementById('uis-confirm').disabled = true;
  document.getElementById('uis-confirm').textContent = 'Importar';
  showUisMsg('', '');
  document.getElementById('uis-upl-mo').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeUisModal() {
  document.getElementById('uis-upl-mo').classList.remove('on');
  document.body.style.overflow = '';
}

function showUisMsg(txt, type) {
  const el = document.getElementById('uis-msg');
  el.textContent = txt;
  el.style.display = txt ? 'block' : 'none';
  el.style.color = type === 'err' ? '#f07878' : type === 'ok' ? '#5ae09a' : '#c8a84b';
}

function handleUisFile(input) {
  const file = input.files[0];
  if (!file) return;
  showUisMsg('Lendo arquivo...', 'info');
  Papa.parse(file, {
    header: true, skipEmptyLines: true, transformHeader: h => h.trim(),
    complete: results => {
      if (!results.data.length) { showUisMsg('Arquivo vazio.', 'err'); return; }
      const headers = Object.keys(results.data[0]);
      const hasRE   = headers.some(h => h.toLowerCase().trim() === 're');
      if (!hasRE) { showUisMsg('Coluna RE não encontrada. Verifique o arquivo.', 'err'); return; }
      _uisData = results.data.map(row => { const n={}; Object.entries(row).forEach(([k,v])=>{n[k.trim()]=String(v||'').trim();}); return n; })
        .filter(r => r.RE || r.re);
      document.getElementById('uis-fn').textContent   = file.name;
      document.getElementById('uis-rows').textContent = _uisData.length;
      document.getElementById('uis-preview').style.display = 'block';
      document.getElementById('uis-confirm').disabled = false;
      showUisMsg(`${_uisData.length} registros prontos para importar.`, 'ok');
    },
    error: err => showUisMsg('Erro ao ler: ' + err.message, 'err')
  });
}

async function confirmUisUpload() {
  if (!_uisData?.length) return;
  const btn = document.getElementById('uis-confirm');
  btn.disabled = true; btn.textContent = 'Importando...';
  showUisMsg('Enviando...', 'info');
  try {
    const res  = await authFetch(`${API}/upload/uis-restricoes`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ records: _uisData }) });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || 'Erro desconhecido');
    showUisMsg(`✓ ${json.inserted} registros importados com sucesso.`, 'ok');
    btn.textContent = 'Importar';
    loadUisSection();
  } catch (err) {
    showUisMsg('✗ ' + err.message, 'err');
    btn.disabled = false; btn.textContent = 'Importar';
  }
}

// ═══════════════════════════════════════════════════════════════
// MODAL DE RESTRIÇÕES DE UM PM (aberto ao clicar no PM no P1)
// ═══════════════════════════════════════════════════════════════

async function openUisPmModal(re, nomePm) {
  document.getElementById('uis-pm-nome').textContent = `RE ${re}${nomePm ? ' · ' + nomePm : ''}`;
  document.getElementById('uis-pm-content').innerHTML = '<div style="color:var(--tx3);font-size:13px">Carregando...</div>';
  document.getElementById('uis-pm-mo').classList.add('on');
  document.body.style.overflow = 'hidden';
  try {
    const data = await authFetch(`${API}/uis/restricoes/${re}`).then(r => r.json());
    document.getElementById('uis-pm-content').innerHTML = renderUisPmContent(data);
  } catch (e) {
    document.getElementById('uis-pm-content').innerHTML = `<div style="color:#f07878">Erro: ${e.message}</div>`;
  }
}

function closeUisPmModal() {
  document.getElementById('uis-pm-mo').classList.remove('on');
  document.body.style.overflow = '';
}

// Renderiza as restrições de um PM no modal, com alertas e o tipo de emprego permitido
function renderUisPmContent(restricoes) {
  if (!restricoes?.length) return '<div style="color:var(--tx3);font-size:13px;padding:8px">Nenhuma restrição encontrada para este RE.</div>';

  // Exibe apenas a restrição mais recente (maior data de início)
  const ultima = [...restricoes].sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''))[0];
  const today = new Date().toISOString().slice(0,10);
  let html = '';

  for (const r of [ultima]) {
    const codigos = uisExtrairCodigos(r.codigos);
    const textoLivre = (r.codigos || '').replace(/[A-Z]{2,3}[,\s]*/g,'').trim(); // texto não-código
    const grupo = uisGrupoMaisRestritivo(codigos);
    const gInfo = grupo ? UIS_GRUPOS[grupo] : null;

    const vencida  = r.termino && r.termino < today;
    const diasRest = r.termino ? Math.ceil((new Date(r.termino) - new Date(today)) / 86400000) : null;
    const vencendo = diasRest !== null && diasRest >= 0 && diasRest <= 30;

    // Cabeçalho do bloco de restrição
    let alertaBadge = '';
    if (vencida)       alertaBadge = `<span style="background:#f0787822;color:#f07878;border:1px solid #f07878;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">VENCIDA</span>`;
    else if (vencendo) alertaBadge = `<span style="background:#c8a84b22;color:#c8a84b;border:1px solid #c8a84b;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">VENCE EM ${diasRest} DIAS — REGULARIZE</span>`;

    html += `<div style="background:var(--s2);border:1px solid ${vencida ? '#f07878' : vencendo ? '#c8a84b' : 'var(--bd)'};border-radius:8px;padding:14px;margin-bottom:10px">`;

    // Datas
    html += `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <div style="font-size:15px;color:#ffffff">Início: <b style="color:var(--tx)">${r.inicio ? r.inicio.split('-').reverse().join('/') : '—'}</b></div>
      <div style="font-size:15px;color:#ffffff">Término: <b style="color:${vencida?'#f07878':vencendo?'#c8a84b':'var(--tx)'}">${r.termino ? r.termino.split('-').reverse().join('/') : '—'}</b></div>
      ${r.dias ? `<div style="font-size:15px;color:#ffffff">Dias: <b style="color:var(--tx)">${r.dias}</b></div>` : ''}
      ${r.opm ? `<div style="font-size:15px;color:#ffffff">OPM: <b style="color:var(--tx)">${escHtml(r.opm)}</b></div>` : ''}
      ${alertaBadge}
    </div>`;

    // Códigos de restrição com chip colorido
    if (codigos.length) {
      html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">`;
      for (const cod of codigos) {
        const info  = UIS_CODIGOS[cod];
        const gCod  = info ? UIS_GRUPOS[info.grupo] : null;
        const cor   = gCod ? gCod.cor : '#aaa';
        html += `<div title="${info ? info.desc : cod}" style="background:${cor}18;border:1px solid ${cor}55;border-radius:5px;padding:3px 10px;display:flex;gap:6px;align-items:center">
          <span style="font-family:'DM Mono',monospace;font-size:12px;font-weight:700;color:${cor}">${cod}</span>
          ${info ? `<span style="font-size:13px;color:#ffffff">${info.desc}</span>` : ''}
        </div>`;
      }
      html += `</div>`;
    }

    // Texto livre (ex: "LICENCA-GESTANTE", "NAPS NÍVEL III")
    if (textoLivre) {
      html += `<div style="font-size:15px;color:#ffffff;margin-bottom:10px;font-style:italic">${escHtml(textoLivre)}</div>`;
    }

    // Bloco de emprego permitido (destaque em vermelho se admin_only)
    if (gInfo && !vencida) {
      html += `<div style="background:${gInfo.bg};border:1px solid ${gInfo.cor}55;border-radius:6px;padding:10px 14px">
        <div style="font-family:'DM Mono',monospace;font-size:10px;color:${gInfo.cor};letter-spacing:1.5px;margin-bottom:4px">EMPREGO PERMITIDO · BG PM 166/2006 · Item ${gInfo.item}</div>
        <div style="font-size:17px;font-weight:700;color:${gInfo.cor}">${gInfo.label}</div>
      </div>`;
    }

    html += `</div>`;
  }

  return html;
}

// ═══════════════════════════════════════════════════════════════
// BADGE DE RESTRIÇÃO para a lista do P1
// Retorna HTML do badge se o PM tiver restrição ativa, ou '' se não tiver.
// O backend já filtra somente registros com termino >= hoje.
// ═══════════════════════════════════════════════════════════════
let _uisRestMap = null; // cache: { reNorm → array de restrições ATIVAS }

// Normaliza RE para chave de lookup — cobre todos os formatos do PM-SP:
//   "180673-4"  (6 dígitos + hífen + dígito verificador) → "180673"
//   "1806734"   (7 dígitos sem hífen = base + verificador) → "180673"
//   "180673"    (6 dígitos sem verificador)               → "180673"
//   "98098-3"   (5 dígitos + hífen + verificador)         → "98098"
//   "98098"     (5 dígitos sem verificador)               → "98098"
function uisNormRE(re) {
  const s = String(re || '');
  if (s.includes('-')) return s.split('-')[0].replace(/\D/g, '');
  const d = s.replace(/\D/g, '');
  return d.length === 7 ? d.slice(0, 6) : d; // 7 dígitos = base(6) + verificador(1)
}

async function loadUisRestricoes() {
  _uisRestMap = {};
  try {
    const resp = await authFetch(`${API}/uis/mapa`);
    if (!resp.ok) { console.warn('[UIS] /mapa status:', resp.status); return; }
    const allRecs = await resp.json();
    if (!Array.isArray(allRecs)) { console.warn('[UIS] /mapa não retornou array:', allRecs); return; }
    console.log(`[UIS] /mapa: ${allRecs.length} restrições ativas`);
    for (const r of allRecs) {
      const key = uisNormRE(r.re);
      if (!key) continue;
      if (!_uisRestMap[key]) _uisRestMap[key] = [];
      _uisRestMap[key].push(r);
    }
    const total = Object.keys(_uisRestMap).length;
    console.log(`[UIS] mapa pronto: ${total} PMs. Chaves:`, Object.keys(_uisRestMap).slice(0, 8));
  } catch (e) { console.warn('[UIS] loadUisRestricoes erro:', e.message); }
}

// Diagnóstico completo: chame debugUis() no console do browser
window.debugUis = async function() {
  console.log('=== DEBUG UIS ===');
  console.log('_uisRestMap:', _uisRestMap === null ? 'null (não carregado)' : `${Object.keys(_uisRestMap).length} chaves`);
  if (_uisRestMap === null || Object.keys(_uisRestMap).length === 0) {
    console.log('Recarregando...');
    await loadUisRestricoes();
  }
  const uisKeys = Object.keys(_uisRestMap || {});
  console.log('Chaves UIS (primeiras 10):', uisKeys.slice(0,10));

  const dados = typeof p1Data !== 'undefined' ? p1Data : [];
  console.log('p1Data:', dados.length, 'PMs');
  if (!dados.length) { console.warn('p1Data vazio — navegue para P1 primeiro'); return; }

  console.log('Primeiros 10 REs do efetivo (RE → normKey → achou?):');
  dados.slice(0,10).forEach(r => {
    const mk = uisNormRE(r.re);
    const recs = _uisRestMap[mk];
    const terminos = recs ? recs.map(x=>x.termino).join(', ') : '—';
    console.log(`  "${r.re}" → "${mk}" → ${recs ? `✓ ${recs.length} reg, termino: ${terminos}` : '✗'}`);
  });

  const comBadge = dados.filter(r => uisBadge(r.re));
  console.log(`\nCom badge ativo: ${comBadge.length} de ${dados.length}`);
  if (comBadge.length) console.log('Exemplos:', comBadge.slice(0,5).map(r=>`${r.re} (${r.nome_guerra||r.nome})`));
  else {
    const comKey = dados.filter(r => !!_uisRestMap[uisNormRE(r.re)]);
    console.log(`PMs com RE no mapa mas sem badge: ${comKey.length} (verificar datas de término)`);
    comKey.slice(0,5).forEach(r => {
      console.log('  ', r.re, '→ normKey:', uisNormRE(r.re), '→ terminos:', _uisRestMap[uisNormRE(r.re)]?.map(x=>x.termino));
    });
  }
  console.log('=== FIM DEBUG ===');
};

// Retorna badge HTML para um RE ('' se sem restrição ativa).
// Usa uisNormRE para normalizar o RE do efetivo antes de buscar no mapa.
function uisBadge(re) {
  if (!_uisRestMap || !re) return '';
  const matchKey = uisNormRE(re);
  const recs = _uisRestMap[matchKey];
  if (!recs?.length) return '';
  const codigos = recs.flatMap(r => uisExtrairCodigos(r.codigos));
  const grupo = uisGrupoMaisRestritivo(codigos);
  const gInfo = grupo ? UIS_GRUPOS[grupo] : null;
  const cor = gInfo ? gInfo.cor : '#c8a84b';
  const today = new Date().toISOString().slice(0,10);
  const diasMin = Math.min(...recs.filter(r=>r.termino).map(r => Math.ceil((new Date(r.termino)-new Date(today))/86400000)));
  const alerta = isFinite(diasMin) && diasMin <= 30 ? ` ⚠ ${diasMin}d` : '';
  return `<span onclick="event.stopPropagation();openUisPmModal('${matchKey}')" title="Restrição UIS — clique para ver" style="cursor:pointer;display:inline-flex;align-items:center;gap:3px;background:${cor}18;border:1px solid ${cor}55;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:700;color:${cor};margin-left:6px">🏥 UIS${alerta}</span>`;
}

// ═══════════════════════════════════════════════════════════════
// IAS — INSPEÇÃO ANUAL DE SAÚDE
// Validade: 1 ano a partir do vencimento (campo data_vencimento).
// RE normalizado sem dígito verificador (igual ao UIS).
// ═══════════════════════════════════════════════════════════════

let _iasMap = null; // cache: { reNorm → registro IAS }

// Mesma lógica de normalização do UIS
function iasNormRE(re) { return uisNormRE(re); }

// Carrega mapa IAS para badges no P1
async function loadIasMapa() {
  _iasMap = {};
  try {
    const resp = await authFetch(`${API}/ias/mapa`);
    if (!resp.ok) { console.warn('[IAS] /mapa status:', resp.status); return; }
    const all = await resp.json();
    if (!Array.isArray(all)) { console.warn('[IAS] /mapa não retornou array'); return; }
    for (const r of all) {
      const key = iasNormRE(r.re);
      if (key) _iasMap[key] = r;
    }
    console.log(`[IAS] mapa pronto: ${Object.keys(_iasMap).length} PMs`);
  } catch (e) { console.warn('[IAS] loadIasMapa erro:', e.message); }
}

// Retorna status IAS de um RE: 'apto' | 'vencendo' | 'vencido' | null (sem registro)
function iasStatus(re) {
  if (!_iasMap || !re) return null;
  const rec = _iasMap[iasNormRE(re)];
  if (!rec) return null;
  if (!rec.data_vencimento) return 'vencido';
  const today = new Date().toISOString().slice(0, 10);
  const em30  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  if (rec.data_vencimento < today) return 'vencido';
  if (rec.data_vencimento <= em30) return 'vencendo';
  return 'apto';
}

// Badge IAS para lista do P1 (mostra somente se vencido ou vencendo)
function iasBadge(re) {
  const status = iasStatus(re);
  if (!status || status === 'apto') return '';
  const key = iasNormRE(re);
  if (status === 'vencido') {
    return `<span onclick="event.stopPropagation();openIasPmModal('${key}')" title="IAS vencida — clique para ver" style="cursor:pointer;display:inline-flex;align-items:center;gap:3px;background:#e0555518;border:1px solid #e0555555;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:700;color:#e05555;margin-left:6px">💉 IAS VENCIDA</span>`;
  }
  const rec = _iasMap[key];
  const today = new Date().toISOString().slice(0, 10);
  const dias = rec?.data_vencimento ? Math.ceil((new Date(rec.data_vencimento) - new Date(today)) / 86400000) : null;
  return `<span onclick="event.stopPropagation();openIasPmModal('${key}')" title="IAS vencendo — clique para ver" style="cursor:pointer;display:inline-flex;align-items:center;gap:3px;background:#c8a84b18;border:1px solid #c8a84b55;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:700;color:#c8a84b;margin-left:6px">💉 IAS ⚠ ${dias}d</span>`;
}

// ─── IAS section load (unificado em loadUisSection) ────────────
async function loadIasSection() {
  if (_iasMap !== null && _uisRestMap !== null) renderUisPage();
}

// ─── Modal de upload IAS ───────────────────────────────────────
let _iasData = null;

function openIasModal() {
  _iasData = null;
  document.getElementById('ias-file').value = '';
  document.getElementById('ias-preview').style.display = 'none';
  document.getElementById('ias-confirm').disabled = true;
  document.getElementById('ias-confirm').textContent = 'Importar';
  showIasMsg('', '');
  document.getElementById('ias-upl-mo').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeIasModal() {
  document.getElementById('ias-upl-mo').classList.remove('on');
  document.body.style.overflow = '';
}

function showIasMsg(txt, type) {
  const el = document.getElementById('ias-msg');
  el.textContent = txt;
  el.style.display = txt ? 'block' : 'none';
  el.style.color = type === 'err' ? '#f07878' : type === 'ok' ? '#5ae09a' : '#c8a84b';
}

function handleIasFile(input) {
  const file = input.files[0];
  if (!file) return;
  showIasMsg('Lendo arquivo...', 'info');
  Papa.parse(file, {
    header: true, skipEmptyLines: true, transformHeader: h => h.trim(),
    complete: results => {
      if (!results.data.length) { showIasMsg('Arquivo vazio.', 'err'); return; }
      const headers = Object.keys(results.data[0]).map(h => h.toLowerCase());
      const hasRE   = headers.some(h => h === 're');
      if (!hasRE) { showIasMsg('Coluna RE não encontrada. Verifique o arquivo.', 'err'); return; }
      _iasData = results.data.map(row => { const n={}; Object.entries(row).forEach(([k,v])=>{n[k.trim()]=String(v||'').trim();}); return n; })
        .filter(r => r.RE || r.re);
      document.getElementById('ias-fn').textContent   = file.name;
      document.getElementById('ias-rows').textContent = _iasData.length;
      document.getElementById('ias-preview').style.display = 'block';
      document.getElementById('ias-confirm').disabled = false;
      showIasMsg(`${_iasData.length} registros prontos para importar.`, 'ok');
    },
    error: err => showIasMsg('Erro ao ler: ' + err.message, 'err')
  });
}

async function confirmIasUpload() {
  if (!_iasData?.length) return;
  const btn = document.getElementById('ias-confirm');
  btn.disabled = true; btn.textContent = 'Importando...';
  showIasMsg('Enviando...', 'info');
  try {
    const res  = await authFetch(`${API}/upload/ias`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ records: _iasData }) });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || 'Erro desconhecido');
    showIasMsg(`✓ ${json.inserted} registros importados com sucesso.`, 'ok');
    btn.textContent = 'Importar';
    await loadIasMapa();
    renderUisPage();
  } catch (err) {
    showIasMsg('✗ ' + err.message, 'err');
    btn.disabled = false; btn.textContent = 'Importar';
  }
}

// ─── Modal individual: IAS de um PM ───────────────────────────
async function openIasPmModal(re, nomePm) {
  const el = document.getElementById('ias-pm-nome');
  if (el) el.textContent = `RE ${re}${nomePm ? ' · ' + nomePm : ''}`;
  const ct = document.getElementById('ias-pm-content');
  if (ct) ct.innerHTML = '<div style="color:var(--tx3);font-size:13px">Carregando...</div>';
  document.getElementById('ias-pm-mo').classList.add('on');
  document.body.style.overflow = 'hidden';
  try {
    const data = await authFetch(`${API}/ias/${re}`).then(r => r.json());
    if (ct) ct.innerHTML = renderIasPmContent(data);
  } catch (e) {
    if (ct) ct.innerHTML = `<div style="color:#f07878">Erro: ${e.message}</div>`;
  }
}

function closeIasPmModal() {
  document.getElementById('ias-pm-mo').classList.remove('on');
  document.body.style.overflow = '';
}

function renderIasPmContent(rec) {
  if (!rec) return '<div style="color:var(--tx3);font-size:13px;padding:8px">Nenhum registro IAS encontrado para este PM.</div>';
  const today = new Date().toISOString().slice(0, 10);
  const venc  = rec.data_vencimento;
  const vencida  = venc && venc < today;
  const diasRest = venc ? Math.ceil((new Date(venc) - new Date(today)) / 86400000) : null;
  const vencendo = diasRest !== null && diasRest >= 0 && diasRest <= 30;
  const fmtD = s => s ? s.split('-').reverse().join('/') : '—';

  let alertaBadge = '';
  if (vencida)       alertaBadge = `<span style="background:#f0787822;color:#f07878;border:1px solid #f07878;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">VENCIDA</span>`;
  else if (vencendo) alertaBadge = `<span style="background:#c8a84b22;color:#c8a84b;border:1px solid #c8a84b;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">VENCE EM ${diasRest} DIAS</span>`;
  else if (venc)     alertaBadge = `<span style="background:#4bc87a22;color:#4bc87a;border:1px solid #4bc87a;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700">VÁLIDA</span>`;

  const borderCor = vencida ? '#f07878' : vencendo ? '#c8a84b' : venc ? '#4bc87a' : 'var(--bd)';
  const corVal    = vencida ? '#f07878' : vencendo ? '#c8a84b' : '#4bc87a';

  return `<div style="background:var(--s2);border:1px solid ${borderCor};border-radius:8px;padding:14px;margin-bottom:10px">
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
      <div style="font-size:15px;color:#ffffff">Vencimento: <b style="color:${corVal};font-size:17px">${fmtD(venc)}</b></div>
      <div style="font-size:15px;color:#ffffff">Médico: <b style="color:var(--tx)">${fmtD(rec.data_medico)}</b></div>
      <div style="font-size:15px;color:#ffffff">Dentista: <b style="color:var(--tx)">${fmtD(rec.data_dentista)}</b></div>
      ${rec.data_aniversario ? `<div style="font-size:15px;color:#ffffff">Aniversário: <b style="color:var(--tx)">${rec.data_aniversario}</b></div>` : ''}
      ${alertaBadge}
    </div>
    <div style="background:${vencida?'rgba(240,120,120,0.1)':vencendo?'rgba(200,168,75,0.1)':'rgba(75,200,122,0.1)'};border:1px solid ${borderCor}55;border-radius:6px;padding:10px 14px">
      <div style="font-family:'DM Mono',monospace;font-size:10px;color:${corVal};letter-spacing:1.5px;margin-bottom:4px">SITUAÇÃO IAS · INSPEÇÃO ANUAL DE SAÚDE</div>
      <div style="font-size:17px;font-weight:700;color:${corVal}">${vencida ? 'IAS VENCIDA — Regularizar para TAF/TAT' : vencendo ? `IAS vence em ${diasRest} dias — Regularizar em breve` : venc ? 'IAS VÁLIDA — Apto para TAF/TAT' : 'Data de vencimento não informada'}</div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// RENDERIZAÇÃO PRINCIPAL DA PÁGINA UIS
// ═══════════════════════════════════════════════════════════════

function _iasEnrichOpmFromP1() {
  if (!_iasMap || typeof p1Data === 'undefined' || !p1Data.length) return;
  const lookup = {};
  p1Data.forEach(pm => { if (pm.re) lookup[uisNormRE(pm.re)] = pm.opm || ''; });
  for (const [re, rec] of Object.entries(_iasMap)) {
    if (!rec.opm) rec.opm = lookup[re] || '';
  }
}

function renderUisPage() {
  const el = document.getElementById('uis-content');
  if (!el) return;

  _iasEnrichOpmFromP1();

  const today = new Date().toISOString().slice(0, 10);
  const em30  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const em60  = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const em90  = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const restMap  = _uisFilteredRestMap();
  const iasMapF  = _uisFilteredIasMap();
  const restEntries = Object.entries(restMap);
  const iasVals     = Object.entries(iasMapF);

  // ── UIS stats ──────────────────────────────────────────────
  const restAtivas  = restEntries.length;
  const restAdm     = restEntries.filter(([,recs]) => recs.some(r => uisExtrairCodigos(r.codigos).some(c => UIS_CODIGOS[c]?.grupo === 'admin_only'))).length;
  const restVenc30  = restEntries.filter(([,recs]) => recs.some(r => r.termino && r.termino >= today && r.termino <= em30)).length;
  const restVencida = restEntries.filter(([,recs]) => recs.some(r => r.termino && r.termino < today)).length;

  // ── IAS stats ──────────────────────────────────────────────
  const iasTotal   = iasVals.length;
  const iasAptos   = iasVals.filter(([,r]) => _iasStatusFromRec(r) === 'apto').length;
  const iasVenc30  = iasVals.filter(([,r]) => _iasStatusFromRec(r) === 'vencendo').length;
  const iasVencida = iasVals.filter(([,r]) => _iasStatusFromRec(r) === 'vencido').length;

  // ── Capacity bar ───────────────────────────────────────────
  let capacidadeHtml = '';
  const totalPmsRaw = (typeof p1Data !== 'undefined' && p1Data.length) ? p1Data : [];
  if (totalPmsRaw.length > 0) {
    let pmsF = totalPmsRaw;
    if (_uisFiltroIdx >= 0 && typeof CIA_STRUCT !== 'undefined') {
      const cia = CIA_STRUCT[_uisFiltroIdx];
      pmsF = totalPmsRaw.filter(r => _opmMatch(r.opm || '', cia.units.flatMap(u => u.keys)));
    }
    if (pmsF.length > 0) {
      const comRest = new Set(pmsF.filter(r => !!restMap[uisNormRE(r.re)]?.length).map(r => r.re));
      const comIasV = new Set(pmsF.filter(r => _iasStatusFromRec(iasMapF[uisNormRE(r.re)]) === 'vencido').map(r => r.re));
      const pendSet = new Set([...comRest, ...comIasV]);
      const plenos  = pmsF.length - pendSet.size;
      const pct     = Math.round(plenos / pmsF.length * 100);
      const cor     = pct >= 90 ? '#4bc87a' : pct >= 75 ? '#c8a84b' : '#e05555';
      capacidadeHtml = `
        <div style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid ${cor};border-radius:10px;padding:18px 20px;margin-bottom:18px">
          <div style="font-family:'DM Mono',monospace;font-size:11px;color:${cor};letter-spacing:1.5px;margin-bottom:10px">CAPACIDADE OPERACIONAL PLENA · SEM PENDÊNCIAS UIS/IAS</div>
          <div style="display:flex;align-items:center;gap:16px">
            <div style="flex:1;background:rgba(255,255,255,.06);border-radius:6px;height:10px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${cor};border-radius:6px;transition:width .5s"></div>
            </div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:48px;font-weight:800;color:${cor};line-height:1">${plenos}</div>
            <div style="font-family:'DM Mono',monospace;font-size:16px;color:#ffffff">de ${pmsF.length} PMs<br>${pct}%</div>
          </div>
        </div>`;
    }
  }

  // ── UIS agrupamento por grupo (para gráfico + modal) ──────
  const porGrupoUis = {};
  restEntries.forEach(([re, recs]) => {
    const allCods = [...new Set(recs.flatMap(r => uisExtrairCodigos(r.codigos)))];
    const grupo   = uisGrupoMaisRestritivo(allCods) || 'outros';
    if (!porGrupoUis[grupo]) porGrupoUis[grupo] = [];
    porGrupoUis[grupo].push([re, recs]);
  });
  const grupoMaxN = Math.max(...Object.values(porGrupoUis).map(a => a.length), 1);
  const pctAptos  = iasTotal > 0 ? Math.round(iasAptos / iasTotal * 100) : 100;

  // ── UIS por OPM/código (computa do restMap) ────────────────
  const porOpm = {}, porOpmCodigos = {}, porCodigo = {};
  restEntries.forEach(([, recs]) => {
    const opm = recs[0]?.opm || 'Sem OPM';
    porOpm[opm] = (porOpm[opm]||0) + 1;
    if (!porOpmCodigos[opm]) porOpmCodigos[opm] = {};
    recs.forEach(r => uisExtrairCodigos(r.codigos).forEach(c => {
      porOpmCodigos[opm][c] = (porOpmCodigos[opm][c]||0) + 1;
      porCodigo[c] = (porCodigo[c]||0) + 1;
    }));
  });

  // ── IAS Timeline 30/60/90 dias ─────────────────────────────
  const tlVencidas = iasVals.filter(([,r]) => r.data_vencimento && r.data_vencimento < today).length;
  const tl30       = iasVals.filter(([,r]) => r.data_vencimento && r.data_vencimento >= today && r.data_vencimento <= em30).length;
  const tl60       = iasVals.filter(([,r]) => r.data_vencimento && r.data_vencimento > em30 && r.data_vencimento <= em60).length;
  const tl90       = iasVals.filter(([,r]) => r.data_vencimento && r.data_vencimento > em60 && r.data_vencimento <= em90).length;
  const tlMax      = Math.max(tlVencidas, tl30, tl60, tl90, 1);
  const tlBar = (label, count, cor, sub) => count > 0 ? `
    <div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div><div style="font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:700;color:#ffffff">${label}</div><div style="font-family:'DM Mono',monospace;font-size:15px;color:#ffffff;margin-top:3px">${sub}</div></div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:52px;font-weight:800;color:${cor};line-height:1">${count}</div>
      </div>
      <div style="background:rgba(255,255,255,.07);border-radius:4px;height:10px">
        <div style="height:100%;width:${Math.round(count/tlMax*100)}%;background:${cor};border-radius:4px"></div>
      </div>
    </div>` : '';
  const iasTimelineHtml = (tlVencidas+tl30+tl60+tl90) > 0 ? `
    <div style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid #5a9de0;border-radius:10px;padding:20px 24px;margin-bottom:14px">
      <div style="font-family:'DM Mono',monospace;font-size:14px;color:#5a9de0;letter-spacing:1.5px;margin-bottom:18px">IAS · VENCIMENTOS POR PERÍODO</div>
      ${tlBar('Já vencidas', tlVencidas, '#f07878', 'regularizar imediatamente')}
      ${tlBar('Vencem em 30 dias', tl30, '#c8a84b', 'ação urgente')}
      ${tlBar('Vencem em 31–60 dias', tl60, '#e0a030', 'atenção')}
      ${tlBar('Vencem em 61–90 dias', tl90, '#5a9de0', 'planejamento')}
    </div>` : '';

  // ── IAS por OPM ────────────────────────────────────────────
  const iasPorOpm = {};
  iasVals.forEach(([,r]) => {
    const opm = r.opm || 'Sem OPM';
    if (!iasPorOpm[opm]) iasPorOpm[opm] = { total:0, aptos:0, venc30:0, vencida:0 };
    iasPorOpm[opm].total++;
    const s = _iasStatusFromRec(r);
    if (s === 'apto')     iasPorOpm[opm].aptos++;
    if (s === 'vencendo') iasPorOpm[opm].venc30++;
    if (s === 'vencido')  iasPorOpm[opm].vencida++;
  });
  const iasPorOpmEntries = Object.entries(iasPorOpm).sort((a,b) => b[1].total - a[1].total);
  const iasPorOpmHtml = iasPorOpmEntries.length > 0 ? `
    <div style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid #5ae09a;border-radius:10px;padding:20px 24px;margin-bottom:14px">
      <div style="font-family:'DM Mono',monospace;font-size:14px;color:#5ae09a;letter-spacing:1.5px;margin-bottom:18px">IAS · SITUAÇÃO POR OPM</div>
      ${iasPorOpmEntries.map(([opm, s]) => {
        const cor    = uisCiaColor(opm);
        const pctA   = s.total > 0 ? Math.round(s.aptos/s.total*100) : 0;
        const pctV30 = s.total > 0 ? Math.round(s.venc30/s.total*100) : 0;
        const pctVc  = s.total > 0 ? Math.round(s.vencida/s.total*100) : 0;
        const subStats = [
          s.aptos>0  ? `<span style="color:#4bc87a">${s.aptos} aptos</span>` : '',
          s.venc30>0 ? `<span style="color:#c8a84b">${s.venc30} vencendo</span>` : '',
          s.vencida>0? `<span style="color:#f07878">${s.vencida} vencida</span>` : '',
        ].filter(Boolean).join(' · ');
        return `<div style="margin-bottom:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div>
              <div style="font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:700;color:${cor}">${escHtml(opm)}</div>
              <div style="font-family:'DM Mono',monospace;font-size:15px;color:#ffffff;margin-top:3px">${subStats}</div>
            </div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:52px;font-weight:800;color:#ffffff;line-height:1">${s.total}</div>
          </div>
          <div style="display:flex;height:10px;border-radius:4px;overflow:hidden;background:rgba(255,255,255,.07)">
            ${s.aptos>0   ?`<div style="width:${pctA}%;background:#4bc87a" title="Aptos: ${s.aptos}"></div>`:''}
            ${s.venc30>0  ?`<div style="width:${pctV30}%;background:#c8a84b" title="Vencendo: ${s.venc30}"></div>`:''}
            ${s.vencida>0 ?`<div style="width:${pctVc}%;background:#f07878" title="Vencidas: ${s.vencida}"></div>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>` : '';

  // ── IAS agendar este mês / próximo ─────────────────────────
  const mesAtual = today.slice(5,7);
  const mesProx  = String((parseInt(mesAtual)%12)+1).padStart(2,'0');
  const agendarPms = iasVals.filter(([,r]) => { const m = _iasAnivMes(r.data_aniversario); return m === mesAtual || m === mesProx; });
  const agendarPorOpm = {};
  agendarPms.forEach(([,r]) => { const o = r.opm||'Sem OPM'; agendarPorOpm[o] = (agendarPorOpm[o]||0)+1; });
  const iasAgendarHtml = agendarPms.length > 0 ? `
    <div style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid #c8a84b;border-radius:10px;padding:18px 20px;margin-bottom:14px">
      <div style="font-family:'DM Mono',monospace;font-size:11px;color:#c8a84b;letter-spacing:1.5px;margin-bottom:14px">IAS · AGENDAR INSPEÇÃO — MÊS ATUAL E PRÓXIMO</div>
      <div style="font-size:19px;color:#ffffff;margin-bottom:16px">A IAS é realizada no mês de aniversário — <b style="color:#c8a84b">${agendarPms.length} PM${agendarPms.length!==1?'s':''}</b> precisam agendar em breve.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
        ${Object.entries(agendarPorOpm).sort((a,b)=>b[1]-a[1]).map(([opm,cnt]) => {
          const cor = uisCiaColor(opm);
          return `<div style="background:rgba(200,168,75,.08);border:1px solid rgba(200,168,75,.25);border-left:3px solid ${cor};border-radius:6px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;color:${cor}">${escHtml(opm)}</div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:40px;font-weight:800;color:#c8a84b;line-height:1">${cnt}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  // ── Alerta duplo (UIS ativa + IAS vencida) ─────────────────
  const duplos = Object.entries(restMap).filter(([re]) => _iasStatusFromRec(iasMapF[re]) === 'vencido');
  const duplosPorOpm = {};
  duplos.forEach(([re, recs]) => {
    const opm = recs[0]?.opm || iasMapF[re]?.opm || 'Sem OPM';
    duplosPorOpm[opm] = (duplosPorOpm[opm]||0) + 1;
  });
  const alertasHtml = duplos.length > 0 ? `
    <div style="background:var(--s2);border:1px solid #f0787844;border-top:3px solid #f07878;border-radius:10px;padding:18px 20px;margin-bottom:14px">
      <div style="font-family:'DM Mono',monospace;font-size:11px;color:#f07878;letter-spacing:1.5px;margin-bottom:14px">⚠ ALERTA — PENDÊNCIA DUPLA (UIS + IAS VENCIDA)</div>
      <div style="font-size:19px;color:#ffffff;margin-bottom:16px"><b style="color:#f07878">${duplos.length} PM${duplos.length!==1?'s':''}</b> com restrição UIS ativa <b>e</b> IAS vencida simultaneamente.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
        ${Object.entries(duplosPorOpm).sort((a,b)=>b[1]-a[1]).map(([opm,cnt]) => {
          const cor = uisCiaColor(opm);
          return `<div style="background:rgba(240,120,120,.07);border:1px solid #f0787833;border-left:3px solid ${cor};border-radius:6px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;color:${cor}">${escHtml(opm)}</div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:40px;font-weight:800;color:#f07878;line-height:1">${cnt}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  // ── Cor status UIS/IAS ────────────────────────────────────
  const restCampo = Object.entries(porGrupoUis).filter(([g]) => g !== 'admin_only').reduce((s,[,a])=>s+a.length,0);
  const pctCampo  = restAtivas > 0 ? Math.round(restCampo / restAtivas * 100) : 0;
  const uisCor    = restAtivas === 0 ? '#4bc87a' : pctCampo > 50 ? '#f07878' : '#c8a84b';
  const iasCor    = pctAptos >= 90 ? '#4bc87a' : pctAptos >= 75 ? '#c8a84b' : '#f07878';

  // ── KPI helper ─────────────────────────────────────────────
  const kpi = (tipo, cor, lbl, val, sub) => `
    <div class="kpi" onclick="openUisDetail('${tipo}')" title="Clique para detalhes">
      <div class="kpi-top" style="background:${cor}"></div>
      <div class="kpi-lbl">${lbl}</div>
      <div class="kpi-val" style="color:${cor}">${val}</div>
      ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
      <div class="kpi-hint">▸ clique p/ detalhes</div>
    </div>`;

  // ── Render final ───────────────────────────────────────────
  el.innerHTML = `
    ${capacidadeHtml}

    <div style="font-family:'DM Mono',monospace;font-size:11px;color:#5ae09a;letter-spacing:1.5px;margin-bottom:10px">RESTRIÇÕES MÉDICAS · BG PM 166/2006</div>
    <div class="kpi-row" style="margin-bottom:24px">
      ${kpi('uis-ativas',  uisCor,    'COM RESTRIÇÃO ATIVA',    restAtivas,  `${pctCampo}% de campo`)}
      ${kpi('uis-adm',     '#c8a84b', 'SOMENTE ADMINISTRATIVO', restAdm,     null)}
      ${kpi('uis-venc30',  '#c8a84b', 'VENCENDO EM 30 DIAS',    restVenc30,  null)}
      ${kpi('uis-vencida', '#f07878', 'RESTRIÇÃO VENCIDA',       restVencida, null)}
    </div>

    <div style="font-family:'DM Mono',monospace;font-size:11px;color:#5a9de0;letter-spacing:1.5px;margin-bottom:10px">INSPEÇÃO ANUAL DE SAÚDE · IAS</div>
    <div class="kpi-row" style="margin-bottom:24px">
      ${kpi('ias-total',   '#5a9de0', 'TOTAL REGISTROS IAS',   iasTotal,   null)}
      ${kpi('ias-aptos',   '#4bc87a', 'APTOS · IAS VÁLIDA',    iasAptos,   `${pctAptos}% aptos`)}
      ${kpi('ias-venc30',  '#c8a84b', 'VENCENDO EM 30 DIAS',   iasVenc30,  null)}
      ${kpi('ias-vencida', '#f07878', 'IAS VENCIDA',           iasVencida, null)}
    </div>

    ${iasTimelineHtml}
    ${iasPorOpmHtml}
    ${iasAgendarHtml}
    ${alertasHtml}
  `;

  if (window.lucide) lucide.createIcons();
}

// ═══════════════════════════════════════════════════════════════
// MODAL DE DETALHE UIS/IAS
// ═══════════════════════════════════════════════════════════════

function renderUisDetail() {
  if (!_uisDetTipo) return;

  _iasEnrichOpmFromP1();

  const today = new Date().toISOString().slice(0, 10);
  const em30  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const restMap     = _uisFilteredRestMap();
  const iasMapF     = _uisFilteredIasMap();
  const restEntries = Object.entries(restMap);
  const iasVals     = Object.entries(iasMapF);

  const thS = 'padding:14px 18px;font-family:"DM Mono",monospace;font-size:16px;color:var(--tx3);letter-spacing:1px;border-bottom:2px solid var(--bd2);text-align:left;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  const tdS = 'padding:14px 18px;font-size:19px;color:var(--tx);border-bottom:1px solid var(--bd);vertical-align:middle';
  const fmtD = s => s ? s.split('-').reverse().join('/') : '—';

  const META = {
    'uis-ativas':  { cor: '#5ae09a', lbl: 'COM RESTRIÇÃO ATIVA' },
    'uis-adm':     { cor: '#c8a84b', lbl: 'SOMENTE ADMINISTRATIVO' },
    'uis-venc30':  { cor: '#c8a84b', lbl: 'VENCENDO EM 30 DIAS' },
    'uis-vencida': { cor: '#f07878', lbl: 'RESTRIÇÃO VENCIDA' },
    'ias-total':   { cor: '#5a9de0', lbl: 'TOTAL REGISTROS IAS' },
    'ias-aptos':   { cor: '#4bc87a', lbl: 'APTOS · IAS VÁLIDA' },
    'ias-venc30':  { cor: '#c8a84b', lbl: 'VENCENDO EM 30 DIAS' },
    'ias-vencida': { cor: '#f07878', lbl: 'IAS VENCIDA' },
  };
  const meta = META[_uisDetTipo] || { cor: '#ffffff', lbl: _uisDetTipo };

  document.getElementById('ud-accent').style.background = meta.cor;
  document.getElementById('ud-title').textContent = meta.lbl;

  const isUis = _uisDetTipo.startsWith('uis-');

  if (isUis) {
    // ── Filtrar restEntries pelo tipo de KPI ─────────────────
    const baseRows = (() => {
      if (_uisDetTipo === 'uis-ativas')  return restEntries;
      if (_uisDetTipo === 'uis-adm')     return restEntries.filter(([,recs]) => recs.some(r => uisExtrairCodigos(r.codigos).some(c => UIS_CODIGOS[c]?.grupo === 'admin_only')));
      if (_uisDetTipo === 'uis-venc30')  return restEntries.filter(([,recs]) => recs.some(r => r.termino && r.termino >= today && r.termino <= em30));
      if (_uisDetTipo === 'uis-vencida') return restEntries.filter(([,recs]) => recs.some(r => r.termino && r.termino < today));
      return [];
    })();

    // Agrupamento por grupo para sub-filtros
    const porGrupo = {};
    baseRows.forEach(([re, recs]) => {
      const allCods = [...new Set(recs.flatMap(r => uisExtrairCodigos(r.codigos)))];
      const grupo   = uisGrupoMaisRestritivo(allCods) || 'outros';
      if (!porGrupo[grupo]) porGrupo[grupo] = [];
      porGrupo[grupo].push([re, recs]);
    });
    const grupoMaxN = Math.max(...Object.values(porGrupo).map(a => a.length), 1);

    // Sub-filtro buttons
    const subBtns = Object.entries(porGrupo).sort((a,b) => b[1].length-a[1].length).map(([grupo, arr]) => {
      const gInfo  = UIS_GRUPOS[grupo];
      const cor    = gInfo ? gInfo.cor : '#aaa';
      const active = _uisDetSub === grupo;
      return `<button onclick="uisDetSubFiltroSet('${grupo}')" style="padding:8px 16px;background:${active?cor+'22':'var(--s2)'};border:1px solid ${active?cor:cor+'44'};color:${cor};border-radius:6px;cursor:pointer;font-family:'DM Mono',monospace;font-size:13px;font-weight:600;transition:all .15s">
        ${escHtml(gInfo ? gInfo.label : grupo)}<span style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;margin-left:8px">${arr.length}</span>
      </button>`;
    }).join('');

    // Rows filtradas
    const filtRows = (_uisDetSub ? (porGrupo[_uisDetSub] || []) : baseRows)
      .slice().sort((a,b) => (a[1][0]?.opm||'').localeCompare(b[1][0]?.opm||''));
    const rowsHtml = filtRows.map(([re, recs]) => {
      const allCods  = [...new Set(recs.flatMap(r => uisExtrairCodigos(r.codigos)))];
      const grupo    = uisGrupoMaisRestritivo(allCods);
      const gInfo    = grupo ? UIS_GRUPOS[grupo] : null;
      const cor      = gInfo ? gInfo.cor : '#c8a84b';
      const codsHtml = allCods.slice(0,5).map(c => {
        const lbl = UIS_CODIGOS[c]?.desc && c.length > 3 ? UIS_CODIGOS[c].desc : c;
        return `<span style="font-family:'DM Mono',monospace;font-size:15px;font-weight:700;color:${cor};background:${cor}12;border:1px solid ${cor}33;border-radius:3px;padding:3px 8px">${escHtml(lbl)}</span>`;
      }).join(' ');
      const termino  = recs.reduce((min,r) => r.termino && (!min||r.termino<min) ? r.termino : min, null);
      return `<tr>
        <td style="${tdS};font-family:'DM Mono',monospace;font-size:17px">${re}</td>
        <td style="${tdS}">${escHtml(recs[0]?.opm||'—')}</td>
        <td style="${tdS}">${codsHtml}</td>
        <td style="${tdS};font-family:'DM Mono',monospace;font-size:17px;color:${termino&&termino<today?'#f07878':termino&&termino<=em30?'#c8a84b':'var(--tx)'}">${fmtD(termino)}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--tx3);font-size:17px">Nenhum registro</td></tr>`;

    // Gráfico de barras por grupo
    const barHtml = Object.entries(porGrupo).sort((a,b)=>b[1].length-a[1].length).map(([grupo, arr]) => {
      const gInfo = UIS_GRUPOS[grupo];
      const cor   = gInfo ? gInfo.cor : '#aaa';
      const pct   = Math.round(arr.length / grupoMaxN * 100);
      return `<div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;color:${cor}">${escHtml(gInfo ? gInfo.label : grupo)}</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:30px;font-weight:800;color:${cor};line-height:1">${arr.length}</div>
        </div>
        <div style="background:rgba(255,255,255,.07);border-radius:4px;height:8px">
          <div style="height:100%;width:${pct}%;background:${cor};border-radius:4px"></div>
        </div>
      </div>`;
    }).join('');

    document.getElementById('ud-content').innerHTML = `
      <div style="margin-bottom:16px;display:flex;flex-wrap:wrap;gap:8px">${subBtns}</div>
      <div class="mo-g2" style="margin-bottom:16px">
        <div class="mo-card">
          <div class="mo-ct">POR GRUPO</div>
          ${barHtml || '<div style="color:var(--tx3);font-size:17px">Sem dados</div>'}
        </div>
        <div class="mo-card">
          <div class="mo-ct">${filtRows.length} PM${filtRows.length!==1?'s':''}</div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;min-width:420px;table-layout:fixed">
              <colgroup><col style="width:18%"><col style="width:30%"><col style="width:35%"><col style="width:17%"></colgroup>
              <thead><tr><th style="${thS}">RE</th><th style="${thS}">OPM</th><th style="${thS}">CÓDIGOS</th><th style="${thS}">TÉRMINO</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>`;

  } else {
    // ── IAS ──────────────────────────────────────────────────
    const mesAtual = today.slice(5, 7);
    const mesProx  = String((parseInt(mesAtual) % 12) + 1).padStart(2, '0');

    // Pool inicial baseado no tipo de KPI clicado
    const pool = (() => {
      if (_uisDetTipo === 'ias-aptos')   return iasVals.filter(([,r]) => _iasStatusFromRec(r) === 'apto');
      if (_uisDetTipo === 'ias-venc30')  return iasVals.filter(([,r]) => _iasStatusFromRec(r) === 'vencendo');
      if (_uisDetTipo === 'ias-vencida') return iasVals.filter(([,r]) => _iasStatusFromRec(r) === 'vencido');
      return iasVals; // ias-total
    })();

    // Filtro CIA dentro do modal
    const ciaPassModal = ([, r]) => {
      if (_uisDetCia < 0 || typeof CIA_STRUCT === 'undefined') return true;
      const cia = CIA_STRUCT[_uisDetCia];
      if (!cia) return true;
      return typeof _opmMatch === 'function' ? _opmMatch(r.opm || '', cia.units.flatMap(u => u.keys)) : true;
    };
    const poolCia = pool.filter(ciaPassModal);

    // Contagens para botões (sobre pool pós-CIA)
    const cntVencida  = poolCia.filter(([,r]) => _iasStatusFromRec(r) === 'vencido').length;
    const cntAniv     = poolCia.filter(([,r]) => { const m = _iasAnivMes(r.data_aniversario); return m === mesAtual || m === mesProx; }).length;
    const cntApto     = poolCia.filter(([,r]) => _iasStatusFromRec(r) === 'apto').length;

    // Aplicar sub-filtro de status
    const displayRows = (() => {
      if (_uisDetSub === 'vencida')  return poolCia.filter(([,r]) => _iasStatusFromRec(r) === 'vencido');
      if (_uisDetSub === 'aniv')     return poolCia.filter(([,r]) => { const m = _iasAnivMes(r.data_aniversario); return m === mesAtual || m === mesProx; });
      if (_uisDetSub === 'apto')     return poolCia.filter(([,r]) => _iasStatusFromRec(r) === 'apto');
      return poolCia;
    })().slice().sort((a,b) => (a[1].data_vencimento||'').localeCompare(b[1].data_vencimento||''));

    // Botões de status (sempre visíveis)
    const statusBtns = [
      { key: 'vencida', label: 'VENCIDA',              val: cntVencida, cor: '#f07878' },
      { key: 'aniv',    label: 'MÊS DE ANIVERSÁRIO',   val: cntAniv,    cor: '#c8a84b' },
      { key: 'apto',    label: 'APTO',                  val: cntApto,    cor: '#4bc87a' },
    ].map(f => {
      const active = _uisDetSub === f.key;
      return `<button onclick="uisDetSubFiltroSet('${f.key}')" style="padding:9px 18px;background:${active?f.cor+'22':'var(--s2)'};border:1px solid ${active?f.cor:f.cor+'44'};color:${f.cor};border-radius:6px;cursor:pointer;font-family:'DM Mono',monospace;font-size:13px;font-weight:600;transition:all .15s">
        ${f.label}<span style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;margin-left:8px">${f.val}</span>
      </button>`;
    }).join('');

    // Botões CIA
    const ciaBtns = typeof CIA_STRUCT !== 'undefined' ? [
      `<button onclick="uisDetCiaSet(-1)" style="padding:7px 14px;background:${_uisDetCia===-1?'rgba(255,255,255,.12)':'transparent'};border:1px solid ${_uisDetCia===-1?'rgba(255,255,255,.4)':'var(--bd)'};color:#ffffff;border-radius:6px;cursor:pointer;font-family:'DM Mono',monospace;font-size:12px;font-weight:600;transition:all .15s">Todas as CIAs</button>`,
      ...CIA_STRUCT.map((cia, i) => {
        const active = _uisDetCia === i;
        return `<button onclick="uisDetCiaSet(${i})" style="padding:7px 14px;background:${active?cia.color+'22':'transparent'};border:1px solid ${active?cia.color:cia.color+'44'};color:${cia.color};border-radius:6px;cursor:pointer;font-family:'DM Mono',monospace;font-size:12px;font-weight:600;transition:all .15s">${cia.label}</button>`;
      })
    ].join('') : '';

    // Contagens globais (sem filtro CIA) para o donut
    const iasTotal   = iasVals.length;
    const iasAptos   = iasVals.filter(([,r]) => _iasStatusFromRec(r) === 'apto').length;
    const iasVenc30  = iasVals.filter(([,r]) => _iasStatusFromRec(r) === 'vencendo').length;
    const iasVencida = iasVals.filter(([,r]) => _iasStatusFromRec(r) === 'vencido').length;

    const rowsHtml = displayRows.map(([re, r]) => {
      const s    = _iasStatusFromRec(r);
      const cor  = s === 'vencido' ? '#f07878' : s === 'vencendo' ? '#c8a84b' : '#4bc87a';
      const anivM = _iasAnivMes(r.data_aniversario);
      const anivLabel = anivM === mesAtual ? '🎂 este mês' : anivM === mesProx ? '🎂 próximo mês' : '';
      return `<tr>
        <td style="${tdS};font-family:'DM Mono',monospace;font-size:17px">${re}</td>
        <td style="${tdS}">${escHtml(r.opm||'—')}</td>
        <td style="${tdS};font-family:'DM Mono',monospace;font-size:17px;color:${cor}">${fmtD(r.data_vencimento)}</td>
        <td style="${tdS};font-size:15px;color:#c8a84b">${anivLabel}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--tx3);font-size:17px">Nenhum registro</td></tr>`;

    document.getElementById('ud-content').innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">${statusBtns}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid var(--bd)">${ciaBtns}</div>
      <div class="mo-g2" style="margin-bottom:16px">
        <div class="mo-card" style="display:flex;flex-direction:column;align-items:center">
          <div class="mo-ct" style="align-self:flex-start">SITUAÇÃO GERAL</div>
          ${iasTotal > 0 ? `<canvas id="ias-donut-chart" width="240" height="240" style="max-width:100%;margin-top:8px"></canvas>` : '<div style="color:var(--tx3);font-size:17px;margin-top:16px">Sem dados</div>'}
        </div>
        <div class="mo-card">
          <div class="mo-ct">${displayRows.length} PM${displayRows.length!==1?'s':''}</div>
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;min-width:380px;table-layout:fixed">
              <colgroup><col style="width:18%"><col style="width:38%"><col style="width:22%"><col style="width:22%"></colgroup>
              <thead><tr><th style="${thS}">RE</th><th style="${thS}">OPM</th><th style="${thS}">VENCIMENTO</th><th style="${thS}">ANIVERSÁRIO</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    // Inicializa donut
    const donutCanvas = document.getElementById('ias-donut-chart');
    if (donutCanvas && iasTotal > 0) {
      if (window._iasDonutChart) { window._iasDonutChart.destroy(); window._iasDonutChart = null; }
      window._iasDonutChart = new Chart(donutCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Aptos', 'Vencendo', 'Vencidas'],
          datasets: [{ data: [iasAptos, iasVenc30, iasVencida], backgroundColor: ['#4bc87a','#c8a84b','#f07878'], borderWidth: 0, hoverOffset: 6 }]
        },
        options: {
          responsive: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#ffffff', font: { size: 15 }, padding: 14, boxWidth: 14 } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} PMs (${Math.round(ctx.raw/iasTotal*100)}%)` } }
          },
          cutout: '62%'
        }
      });
    }
  }

  if (window.lucide) lucide.createIcons();
}
