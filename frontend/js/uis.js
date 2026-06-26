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
function uisExtrairCodigos(codigos_str) {
  return (codigos_str || '').split(/[,\s]+/).map(c => c.trim().toUpperCase()).filter(c => /^[A-Z]{2,3}$/.test(c));
}

// ═══════════════════════════════════════════════════════════════
// SEÇÃO UIS — renderização dos KPI cards e breakdowns
// ═══════════════════════════════════════════════════════════════

async function loadUisSection() {
  try {
    const stats = await authFetch(`${API}/uis/stats`).then(r => r.json());
    renderUisKpis(stats);
    renderUisPorOpm(stats.por_opm || {}, stats.por_opm_codigos || {});
    renderUisPorCodigo(stats.por_codigo || {});
  } catch (e) {
    document.getElementById('uis-kpis').innerHTML = `<div style="color:#f07878;font-size:13px">Erro ao carregar dados UIS: ${e.message}</div>`;
  }

  const role = currentRole();
  const wrap = document.getElementById('uis-upload-btn-wrap');
  if (wrap && ['admin','p1','ti'].includes(role)) {
    wrap.innerHTML = `<button onclick="openUisModal()" style="margin-bottom:14px;padding:8px 20px;background:rgba(46,138,94,.12);border:1px solid rgba(46,138,94,.35);color:#5ae09a;border-radius:6px;cursor:pointer;font-size:19px;font-weight:600">↑ Importar Restrições UIS</button>`;
  }
}

function renderUisKpis(stats) {
  const cards = [
    { label: 'COM RESTRIÇÃO ATIVA',    val: stats.total_ativas,    cor: '#5ae09a' },
    { label: 'SOMENTE ADMINISTRATIVO', val: stats.total_admin_only, cor: '#f07878' },
    { label: 'VENCENDO EM 30 DIAS',    val: stats.total_vencendo,   cor: '#c8a84b' },
    { label: 'RESTRIÇÃO VENCIDA',      val: stats.total_vencidas,   cor: '#e05555' },
  ];
  const el = document.getElementById('uis-kpis');
  el.style.gridTemplateColumns = 'repeat(auto-fill,minmax(210px,1fr))';
  el.innerHTML = cards.map(c => `
    <div class="kpi" style="cursor:default">
      <div class="kpi-top" style="background:${c.cor}"></div>
      <div class="kpi-lbl">${c.label}</div>
      <div class="kpi-val" style="color:${c.cor}">${c.val ?? '—'}</div>
    </div>`).join('');
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
  const descCor = cor === '#ffffff' ? '#ffffff' : 'rgba(255,255,255,.75)';
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
    return `<div style="display:flex;gap:8px;align-items:baseline;padding:2px 0">
      <span style="font-family:'DM Mono',monospace;font-size:11px;color:${cor};font-weight:700;min-width:26px">${c}</span>
      <span style="font-size:11px;color:#ddd">${inf ? inf.desc : '—'}</span>
    </div>`;
  }).join('');
  uisTipGenShow(e,
    `<div style="font-weight:700;color:${cor};font-size:11px;margin-bottom:6px;letter-spacing:.5px">${gInfo ? gInfo.label : 'RESTRIÇÃO UIS'}</div>` +
    codLines
  );
}

function renderUisPorOpm(porOpm, porOpmCodigos) {
  const entries = Object.entries(porOpm).sort((a,b) => b[1]-a[1]);
  const container = document.getElementById('uis-por-opm');
  if (!entries.length) { container.innerHTML = '<div style="color:var(--tx3);font-size:13px;padding:8px">Sem dados</div>'; return; }
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
      <div style="width:32px;text-align:right;font-size:17px;font-weight:700;color:${cor}">${n}</div>
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
  if (!entries.length) { document.getElementById('uis-por-codigo').innerHTML = '<div style="color:var(--tx3);font-size:13px;padding:8px">Sem dados</div>'; return; }
  const max = entries[0][1];
  document.getElementById('uis-por-codigo').innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 0">${
    entries.map(([cod, n]) => {
      const info  = UIS_CODIGOS[cod];
      const grupo = info ? UIS_GRUPOS[info.grupo] : null;
      const cor   = grupo ? grupo.cor : '#aaa';
      return `<div title="${info ? info.desc : cod}" style="background:var(--s2);border:1px solid ${cor}44;border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:10px;cursor:default">
        <span style="font-family:'DM Mono',monospace;font-size:17px;font-weight:700;color:${cor}">${cod}</span>
        <span style="font-size:14px;color:var(--tx)">${info ? info.desc : '—'}</span>
        <span style="font-size:18px;font-weight:800;color:var(--tx);margin-left:4px">${n}</span>
      </div>`;
    }).join('')
  }</div>`;
}

function renderUisTabelaCodigos() {
  const grupos = Object.entries(UIS_GRUPOS);
  let html = `<table class="tbl" style="font-size:12px"><thead><tr><th>Código</th><th>Descrição</th><th>Tipo de Emprego (BG PM 166/2006)</th><th>Item</th></tr></thead><tbody>`;
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

  const today = new Date().toISOString().slice(0,10);
  let html = '';

  for (const r of restricoes) {
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
      <div style="font-size:12px;color:var(--tx3)">Início: <b style="color:var(--tx)">${r.inicio ? r.inicio.split('-').reverse().join('/') : '—'}</b></div>
      <div style="font-size:12px;color:var(--tx3)">Término: <b style="color:${vencida?'#f07878':vencendo?'#c8a84b':'var(--tx)'}">${r.termino ? r.termino.split('-').reverse().join('/') : '—'}</b></div>
      ${r.dias ? `<div style="font-size:12px;color:var(--tx3)">Dias: <b style="color:var(--tx)">${r.dias}</b></div>` : ''}
      ${r.opm ? `<div style="font-size:12px;color:var(--tx3)">OPM: <b style="color:var(--tx)">${escHtml(r.opm)}</b></div>` : ''}
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
          ${info ? `<span style="font-size:11px;color:var(--tx3)">${info.desc}</span>` : ''}
        </div>`;
      }
      html += `</div>`;
    }

    // Texto livre (ex: "LICENCA-GESTANTE", "NAPS NÍVEL III")
    if (textoLivre) {
      html += `<div style="font-size:12px;color:var(--tx3);margin-bottom:10px;font-style:italic">${escHtml(textoLivre)}</div>`;
    }

    // Bloco de emprego permitido (destaque em vermelho se admin_only)
    if (gInfo && !vencida) {
      html += `<div style="background:${gInfo.bg};border:1px solid ${gInfo.cor}55;border-radius:6px;padding:10px 14px">
        <div style="font-family:'DM Mono',monospace;font-size:10px;color:${gInfo.cor};letter-spacing:1.5px;margin-bottom:4px">EMPREGO PERMITIDO · BG PM 166/2006 · Item ${gInfo.item}</div>
        <div style="font-size:13px;font-weight:700;color:${gInfo.cor}">${gInfo.label}</div>
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
