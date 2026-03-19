/**
 * app.js — Frontend do Dashboard 40 BPM/I
 * Busca os dados via API REST (backend Node.js + SQLite).
 */

const API = `${window.location.origin}/api`;

// ---------------------------------------------------------------------------
// Autenticação — helpers
// ---------------------------------------------------------------------------
function authFetch(url, options = {}) {
  const token = localStorage.getItem('auth_token');
  options.headers = { ...options.headers, ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
  return fetch(url, options).then(r => {
    if (r.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      window.location.replace('/login.html');
      throw new Error('Sessão expirada');
    }
    return r;
  });
}

function doLogout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  window.location.replace('/login.html');
}

function toggleSidebar() {
  const aside = document.querySelector('aside');
  const overlay = document.querySelector('.sidebar-overlay');
  const open = aside.classList.toggle('open');
  overlay.style.display = open ? 'block' : 'none';
}

function initUserBlock() {
  try {
    const u = JSON.parse(localStorage.getItem('auth_user') || '{}');
    const ROLE_LABEL = { comandante: 'Cmt Batalhão', comandante_cia: 'Cmt de Cia', p1: 'Seção P1', p3: 'Seção P3', viewer: 'Visualizador' };
    document.getElementById('user-nome').textContent = u.nome || '—';
    document.getElementById('user-info').textContent = `${u.secao || '—'} · ${ROLE_LABEL[u.role] || u.role || '—'}`;
    if (['admin', 'p3'].includes(u.role)) {
      document.getElementById('btn-admin').style.display = 'block';
      checkPendingUsers();
      // Mostra botões de editar período e fonte apenas para P3/admin
      const btnEdit = document.getElementById('btn-edit-periodo');
      if (btnEdit) btnEdit.style.display = 'inline-block';
      const btnFonte = document.getElementById('btn-edit-fonte');
      if (btnFonte) btnFonte.style.display = 'inline-block';
    }
    // Restaura período salvo no label
    const periodoSalvo = localStorage.getItem('periodo_texto');
    const inp = document.getElementById('inp-periodo');
    if (periodoSalvo && inp) inp.value = periodoSalvo;
    // Restaura fonte salva
    const fonteSalva = localStorage.getItem('fonte_texto');
    const inpF = document.getElementById('inp-fonte');
    if (inpF) {
      inpF.value = fonteSalva || 'Banco de Dados RAC';
      const lblF = document.getElementById('lbl-fonte');
      if (lblF && fonteSalva) lblF.textContent = fonteSalva;
    }
  } catch (_) {}
}

function toggleEditPeriodo() {
  const inp  = document.getElementById('inp-periodo');
  const lbl  = document.getElementById('lbl-p1');
  const btn  = document.getElementById('btn-edit-periodo');
  const open = inp.style.display === 'none' || inp.style.display === '';
  inp.style.display = open ? 'inline-block' : 'none';
  lbl.style.display = open ? 'none' : 'inline-block';
  btn.textContent   = open ? '✔ Salvar' : '✎ Editar';
  if (!open) {
    const val = inp.value.trim();
    localStorage.setItem('periodo_texto', val);
    lbl.textContent = val || pLbl(selMeses);
  }
}

function savePeriodo(val) {
  const lbl = document.getElementById('lbl-p1');
  if (lbl) lbl.textContent = val || pLbl(selMeses);
}

function toggleEditFonte() {
  const inp = document.getElementById('inp-fonte');
  const lbl = document.getElementById('lbl-fonte');
  const btn = document.getElementById('btn-edit-fonte');
  const open = inp.style.display === 'none' || inp.style.display === '';
  inp.style.display = open ? 'inline-block' : 'none';
  lbl.style.display = open ? 'none' : 'inline-block';
  btn.textContent   = open ? '✔ Salvar' : '✎ Editar';
  if (!open) {
    const val = inp.value.trim();
    localStorage.setItem('fonte_texto', val);
    lbl.textContent = val || 'Banco de Dados RAC';
  }
}

function saveFonte(val) {
  const lbl = document.getElementById('lbl-fonte');
  if (lbl) lbl.textContent = val || 'Banco de Dados RAC';
}

async function checkPendingUsers() {
  try {
    const users   = await authFetch(`${API}/admin/users`).then(r => r.json());
    const pending = Array.isArray(users) ? users.filter(u => u.status === 'pending').length : 0;
    const badge   = document.getElementById('pending-badge');
    if (pending > 0) {
      badge.textContent = pending;
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Modal de administração de usuários
// ---------------------------------------------------------------------------
function admClickOut(e) { if (e.target.id === 'adm-mo') closeAdminModal(); }
function closeAdminModal() { document.getElementById('adm-mo').style.display = 'none'; }

async function openAdminModal() {
  document.getElementById('adm-mo').style.display = 'block';
  document.getElementById('adm-msg').style.display = 'none';
  const badge = document.getElementById('pending-badge');
  if (badge) badge.style.display = 'none';
  document.getElementById('adm-users').innerHTML = '<div style="color:#4a5568;font-size:12px;padding:10px 0">Carregando...</div>';
  document.getElementById('adm-pending').innerHTML = '';
  document.getElementById('adm-pending-section').style.display = 'none';

  try {
    const data = await authFetch(`${API}/admin/users`).then(r => r.json());
    if (!Array.isArray(data)) throw new Error(data?.error || 'Resposta inesperada da API.');
    renderAdminUsers(data);
  } catch (err) {
    document.getElementById('adm-users').innerHTML = `<div style="color:#e06060;font-size:12px">${err.message}</div>`;
  }
}

function renderAdminUsers(users) {
  const me = JSON.parse(localStorage.getItem('auth_user') || '{}');
  const pending = users.filter(u => u.status === 'pending');
  const others  = users.filter(u => u.status !== 'pending');

  if (pending.length) {
    document.getElementById('adm-pending-section').style.display = 'block';
    document.getElementById('adm-pending').innerHTML = buildUserTable(pending, me);
  }
  document.getElementById('adm-users').innerHTML = buildUserTable(others, me);
}

function buildUserTable(users, me) {
  // Oculta usuários com role 'admin' — protegidos contra alteração
  users = users.filter(u => u.role !== 'admin');
  if (!users.length) return '<div style="color:#4a5568;font-size:12px;padding:6px 0">Nenhum registro.</div>';
  const ROLE_LABEL = { comandante: 'Cmt Batalhão', comandante_cia: 'Cmt de Cia', p1: 'P1', p3: 'P3', viewer: 'Visualizador' };
  const STATUS_STYLE = {
    pending:  'background:rgba(200,168,75,.15);color:#e8c96a',
    approved: 'background:rgba(61,191,122,.1);color:#5ae09a',
    rejected: 'background:rgba(200,75,75,.1);color:#e06060'
  };
  const STATUS_LABEL = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Recusado' };

  let h = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr>
      <th style="text-align:left;padding:7px 8px;border-bottom:1px solid #1c2235;font-family:'DM Mono',monospace;font-size:9px;color:#4a5568;letter-spacing:1px">NOME</th>
      <th style="text-align:left;padding:7px 8px;border-bottom:1px solid #1c2235;font-family:'DM Mono',monospace;font-size:9px;color:#4a5568;letter-spacing:1px">POSTO/GRAD.</th>
      <th style="text-align:left;padding:7px 8px;border-bottom:1px solid #1c2235;font-family:'DM Mono',monospace;font-size:9px;color:#4a5568;letter-spacing:1px">RE</th>
      <th style="text-align:left;padding:7px 8px;border-bottom:1px solid #1c2235;font-family:'DM Mono',monospace;font-size:9px;color:#4a5568;letter-spacing:1px">FUNÇÃO</th>
      <th style="text-align:left;padding:7px 8px;border-bottom:1px solid #1c2235;font-family:'DM Mono',monospace;font-size:9px;color:#4a5568;letter-spacing:1px">STATUS</th>
      <th style="text-align:left;padding:7px 8px;border-bottom:1px solid #1c2235;font-family:'DM Mono',monospace;font-size:9px;color:#4a5568;letter-spacing:1px">NÍVEL</th>
      <th style="padding:7px 8px;border-bottom:1px solid #1c2235"></th>
    </tr></thead><tbody>`;

  const SECAO_OPTS = ['Comandante de Batalhão','Subcomandante de Batalhão','CoordOp','Comandante de Cia','CFP','Sargentante','P1','P2','P3','P4','P5','P1 de Cia','P3 de Cia','P4 de Cia','P5 de Cia','CGP','1ª Cia Operacional','2ª Cia Operacional','3ª Cia Operacional','Força Tatica Operacional'];

  users.forEach(u => {
    const sStyle = STATUS_STYLE[u.status] || '';
    const canEditRole = ['admin', 'p3'].includes(me.role);
    const roleOpts = canEditRole
      ? ['viewer','p3'].map(r =>
          `<option value="${r}" ${u.role===r?'selected':''}>${ROLE_LABEL[r]||r}</option>`).join('')
      : `<option>${ROLE_LABEL[u.role]||u.role}</option>`;
    const secaoOpts = canEditRole
      ? SECAO_OPTS.map(s => `<option value="${s}" ${u.secao===s?'selected':''}>${s}</option>`).join('')
      : `<option>${u.secao}</option>`;

    let actions = '';
    if (u.status === 'pending') {
      actions = `<button onclick="admAction('${u.id}','approved')" style="padding:4px 10px;background:rgba(61,191,122,.15);border:1px solid rgba(61,191,122,.3);color:#5ae09a;border-radius:4px;cursor:pointer;font-size:11px;margin-right:4px">✓ Aprovar</button>
                 <button onclick="admAction('${u.id}','rejected')" style="padding:4px 10px;background:rgba(200,75,75,.1);border:1px solid rgba(200,75,75,.25);color:#e06060;border-radius:4px;cursor:pointer;font-size:11px">✕ Recusar</button>`;
    } else if (u.status === 'approved') {
      actions = `<button onclick="admAction('${u.id}','rejected')" style="padding:4px 10px;background:rgba(200,75,75,.08);border:1px solid rgba(200,75,75,.2);color:#e06060;border-radius:4px;cursor:pointer;font-size:11px">Revogar</button>
                 <button onclick="admResetSenha('${u.id}','${u.nome}')" style="padding:4px 10px;background:rgba(200,168,75,.08);border:1px solid rgba(200,168,75,.25);color:#e8c96a;border-radius:4px;cursor:pointer;font-size:11px;margin-left:4px" title="Senha temporária = matrícula do usuário">🔑 Redefinir Senha</button>`;
    } else {
      actions = `<button onclick="admAction('${u.id}','approved')" style="padding:4px 10px;background:rgba(61,191,122,.1);border:1px solid rgba(61,191,122,.25);color:#5ae09a;border-radius:4px;cursor:pointer;font-size:11px">Reativar</button>`;
    }

    h += `<tr>
      <td style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.03);color:#d8dce8">${u.nome}</td>
      <td style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.03);color:#8090a8">${u.posto||'—'}</td>
      <td style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.03);font-family:'DM Mono',monospace;color:#8090a8">${u.matricula}</td>
      <td style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.03)">
        <select onchange="admChangeSecao('${u.id}',this.value)" ${!canEditRole?'disabled':''} style="background:#121620;border:1px solid #252d40;color:#d8dce8;padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;${!canEditRole?'opacity:.6':''}">${secaoOpts}</select>
      </td>
      <td style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.03)"><span style="padding:2px 8px;border-radius:20px;font-family:'DM Mono',monospace;font-size:10px;${sStyle}">${STATUS_LABEL[u.status]||u.status}</span></td>
      <td style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.03)">
        <select onchange="admChangeRole('${u.id}',this.value)" ${!canEditRole?'disabled':''} style="background:#121620;border:1px solid #252d40;color:#d8dce8;padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;${!canEditRole?'opacity:.6':''}">${roleOpts}</select>
      </td>
      <td style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.03);white-space:nowrap">
        ${actions}
        <button onclick="admDelete('${u.id}','${u.nome}')" style="padding:4px 8px;background:transparent;border:1px solid rgba(200,75,75,.2);color:#4a5568;border-radius:4px;cursor:pointer;font-size:11px;margin-left:4px" title="Excluir usuário">🗑</button>
      </td>
    </tr>`;
  });

  h += '</tbody></table>';
  return h;
}

async function admAction(id, status) {
  try {
    const res = await authFetch(`${API}/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await openAdminModal();
  } catch (err) {
    showAdmMsg(err.message, 'err');
  }
}

async function admDelete(id, nome) {
  if (!confirm(`Excluir definitivamente o usuário "${nome}"? Esta ação não pode ser desfeita.`)) return;
  try {
    const res = await authFetch(`${API}/admin/users/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); alert(d.error || 'Erro ao excluir.'); return; }
    openAdminModal();
  } catch (err) {
    alert('Erro de conexão.');
  }
}

async function admChangeRole(id, role) {
  try {
    const res = await authFetch(`${API}/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showAdmMsg('Nível de acesso atualizado.', 'ok');
  } catch (err) {
    showAdmMsg(err.message, 'err');
  }
}

async function admChangeSecao(id, secao) {
  try {
    const res = await authFetch(`${API}/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secao })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showAdmMsg('Função atualizada.', 'ok');
  } catch (err) {
    showAdmMsg(err.message, 'err');
  }
}

async function admResetSenha(id, nome) {
  if (!confirm(`Redefinir a senha de "${nome}"?\n\nA senha temporária será a própria matrícula do usuário.\nNa próxima vez que entrar, ele será obrigado a criar uma nova senha.`)) return;
  try {
    const res  = await authFetch(`${API}/admin/users/${id}/reset-senha`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showAdmMsg(`Senha redefinida. Senha temporária: matrícula ${data.matricula}`, 'ok');
  } catch (err) {
    showAdmMsg(err.message, 'err');
  }
}

function showAdmMsg(text, type) {
  const el = document.getElementById('adm-msg');
  el.textContent = text;
  el.style.cssText = type === 'ok'
    ? 'display:block;padding:10px 14px;border-radius:6px;font-size:13px;background:rgba(61,191,122,.1);border:1px solid rgba(61,191,122,.25);color:#5ae09a;margin-top:14px'
    : 'display:block;padding:10px 14px;border-radius:6px;font-size:13px;background:rgba(200,75,75,.1);border:1px solid rgba(200,75,75,.25);color:#e06060;margin-top:14px';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// Paleta de cores por crime (mesma ordem da API)
const PAL = ['#c84b4b','#bf7a3d','#c8a84b','#3d7abf','#e8c96a','#3dbf7a','#7a4bbf'];

// Crimes agrupados num único card na visão geral
const CRIME_GROUPS = [
  { label: 'Veículos', crimes: ['Roubo de Veículos', 'Furto de Veículos'], color: '#5a9de0' }
];
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
let moCrime  = '';
let moColor  = '';
let moMeses  = [];
let moScopeType = 'btl';
let moScopeVal  = null;

// ---------------------------------------------------------------------------
// Filtros por página
// ---------------------------------------------------------------------------

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
  const allBtn = document.getElementById('mes-btn-all');
  if (allBtn) allBtn.classList.toggle('on', selMeses.length === MESES.length);
  document.querySelectorAll('.mes-btn-vis').forEach((b, i) => {
    b.classList.toggle('on', selMeses.includes(MESES[i]));
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

  el.appendChild(btnBtl);
  el.appendChild(wMes);
  el.appendChild(sep);
  el.appendChild(wCia);
  el.appendChild(wMun);
  if (sCrime) el.appendChild(sCrime.parentElement);
}

function buildPageFilters() {
  buildPageFilter('pf-metas',   'metas',    renderMetas, { showCrime: true });
  buildPageFilter('pf-evolucao','evolucao', renderEvolucao);
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
const cl  = c => c.replace(' Vulnerável', ' Vuln.').replace(' Veículos', ' Veíc.');

// ---------------------------------------------------------------------------
// Inicialização — busca dados da API
// ---------------------------------------------------------------------------

async function loadData() {
  const [meta, registros] = await Promise.all([
    authFetch(`${API}/meta`).then(r => r.json()),
    authFetch(`${API}/registros`).then(r => r.json())
  ]);
  CRIMES = meta.crimes;
  MESES  = meta.meses;
  MUNS   = meta.muns;
  CIAS   = meta.cias;
  RAW    = registros;
}

async function updateSyncStatus() {
  try {
    const s = await authFetch(`${API}/status`).then(r => r.json());
    const elTime  = document.getElementById('sync-time');
    const elFonte = document.getElementById('lbl-fonte');
    if (elTime && s.lastSync) {
      const d = new Date(s.lastSync);
      elTime.textContent = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    if (elFonte && !localStorage.getItem('fonte_texto')) {
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
    await authFetch(`${API}/sync`);
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
        <div style="font-size:13px;color:var(--tx3);max-width:380px">Não foi possível conectar à API. Verifique sua conexão com a internet e tente novamente.</div>
        <button onclick="location.reload()" style="margin-top:8px;padding:10px 28px;background:rgba(61,122,191,.15);border:1px solid rgba(61,122,191,.3);color:#5a9de0;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600">↻ Tentar novamente</button>
      </div>`;
    return;
  }

  // Etapa 2: inicializar e renderizar (erros aqui não bloqueiam a página)
  try {
    selMeses = [...MESES];
    hmMeses  = [...MESES];

    Chart.defaults.color       = '#e0ecf8';
    Chart.defaults.borderColor = '#1c2235';
    Chart.defaults.font.family = "'DM Mono', monospace";
    Chart.defaults.font.size   = 17;

    buildSbMes();
    buildHmFilter();
    buildPageFilters();
    renderAll();
    updateSyncStatus();
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Erro ao renderizar dashboard:', err);
  }
}

// ---------------------------------------------------------------------------
// Sidebar de meses
// ---------------------------------------------------------------------------

function buildSbMes() {
  const ano = new Date().getFullYear();
  const pf  = pageFilters.visao;
  let h = `<span class="pf-label">Período</span>`;
  h += `<button class="pf-btn on" id="mes-btn-all" onclick="sbAll(this)">${ano}</button>`;
  MESES.forEach(m => h += `<button class="pf-btn mes-btn-vis" onclick="sbTog('${m}',this)">${m}</button>`);

  // Espaço separador
  h += `<div style="flex:1"></div>`;

  // Select CIA
  h += `<div class="pf-field"><span class="pf-label">CIA</span><select class="pf-select" id="sb-cia-sel" onchange="sbSetScope('cia',this.value)">`;
  h += `<option value="">Todas</option>`;
  CIAS.forEach(c => h += `<option value="${c}" ${pf.type==='cia'&&pf.value===c?'selected':''}>${c}</option>`);
  h += `</select></div>`;

  // Select Cidade
  const munList = pf.type === 'cia' && pf.value ? MUNS.filter(m => RAW.some(r => r.mun === m && r.cia === pf.value)) : MUNS;
  h += `<div class="pf-field"><span class="pf-label">Cidade</span><select class="pf-select" id="sb-mun-sel" onchange="sbSetScope('mun',this.value)">`;
  h += `<option value="">Todas</option>`;
  munList.forEach(m => h += `<option value="${m}" ${pf.type==='mun'&&pf.value===m?'selected':''}>${m}</option>`);
  h += `</select></div>`;

  const el = document.getElementById('vis-mes-bar');
  if (el) el.innerHTML = h;
  syncSidebarMes();
}

function sbSetScope(type, val) {
  if (!val) {
    pageFilters.visao = { type: 'btl', value: null };
  } else {
    pageFilters.visao = { type, value: val };
    // ao trocar CIA, repopula cidades e reseta município
    if (type === 'cia') {
      const munSel = document.getElementById('sb-mun-sel');
      if (munSel) {
        const muns = MUNS.filter(m => RAW.some(r => r.mun === m && r.cia === val));
        munSel.innerHTML = '<option value="">Todas</option>';
        muns.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; munSel.appendChild(o); });
      }
    }
  }
  renderVisaoAndInsights();
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
      selMeses.sort((a, b) => MESES.indexOf(a) - MESES.indexOf(b));
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
  const btns = document.querySelectorAll('#hm-filter-btns .hm-mbtn');
  btns.forEach((b, i) => b.classList.toggle('on', i === 0 ? false : MESES[i - 1] === mes));
  renderHeatmap();
}

// ---------------------------------------------------------------------------
// Render geral
// ---------------------------------------------------------------------------

function renderAll() {
  const p = pLbl(selMeses);
  ['lbl-p2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = p;
  });
  // Período da Visão Geral: usa texto manual se salvo, senão usa seleção de meses
  const periodoSalvo = localStorage.getItem('periodo_texto');
  const lblP1 = document.getElementById('lbl-p1');
  if (lblP1) lblP1.textContent = periodoSalvo || p;
  document.getElementById('metas-badge').textContent = p;
  renderKPIs();
  renderVisaoAndInsights();
  renderMetas();
  renderHeatmap();
  renderEvolucao();
}

function renderVisaoAndInsights() {
  renderVisao();
  renderInsights();
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

function renderKPIs() {
  const groupedCrimes = CRIME_GROUPS.flatMap(g => g.crimes);
  let html = '';

  // Cards individuais (pula os que fazem parte de um grupo)
  CRIMES.forEach((c, i) => {
    if (groupedCrimes.includes(c)) return;
    const aval = sf(q({ crime: c, mes: selMeses }));
    const ant  = sf(q({ crime: c, mes: selMeses }), 'anterior');
    const vp   = ant > 0 ? ((aval - ant) / ant * 100).toFixed(0) : 0;
    const up   = parseFloat(vp) > 0;
    html += `<div class="kpi" onclick="moOpen('${c}','${PAL[i]}')" title="Clique para detalhes">
      <div class="kpi-top" style="background:${PAL[i]}"></div>
      <div class="kpi-lbl">${cl(c)}</div>
      <div class="kpi-val" style="color:${PAL[i]}">${aval}</div>
      <div class="kpi-row2">
        <div class="kpi-sub">ant: ${ant}</div>
        <div class="tag ${up ? 'tbad' : 'tok'}">${up ? '▲' : '▼'}${Math.abs(vp)}%</div>
      </div>
      <div class="kpi-hint">▸ clique p/ detalhes</div>
    </div>`;
  });

  // Cards agrupados
  CRIME_GROUPS.forEach(g => {
    const aval = sf(q({ crime: g.crimes, mes: selMeses }));
    const ant  = sf(q({ crime: g.crimes, mes: selMeses }), 'anterior');
    const vp   = ant > 0 ? ((aval - ant) / ant * 100).toFixed(0) : 0;
    const up   = parseFloat(vp) > 0;
    html += `<div class="kpi" onclick="moOpenGroup('${g.label}')" title="Clique para detalhes">
      <div class="kpi-top" style="background:${g.color}"></div>
      <div class="kpi-lbl">${g.label}</div>
      <div class="kpi-val" style="color:${g.color}">${aval}</div>
      <div class="kpi-row2">
        <div class="kpi-sub">ant: ${ant}</div>
        <div class="tag ${up ? 'tbad' : 'tok'}">${up ? '▲' : '▼'}${Math.abs(vp)}%</div>
      </div>
      <div class="kpi-hint">▸ clique p/ detalhes</div>
    </div>`;
  });

  document.getElementById('kpi-row').innerHTML = html;
}

function moOpenGroup(label) {
  const g = CRIME_GROUPS.find(g => g.label === label);
  if (g) moOpen(g.crimes, g.color, g.label);
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

  // Desvio vs Meta: ((avaliado - meta) / meta) * 100
  // Verde  → avaliado ≤ meta  |  Laranja → acima mas melhorando  |  Vermelho → acima e piorando
  const vmDetails = CRIMES.map(c => {
    const aval  = sf(q({ crime: c, mes: MESES, ...sc }));
    const meta  = sf(q({ crime: c, mes: MESES, ...sc }), 'meta');
    const ant   = sf(q({ crime: c, mes: MESES, ...sc }), 'anterior');
    const tendV = sf(q({ crime: c, mes: MESES, ...sc }), 'tend');
    const dev   = meta === 0 ? (aval === 0 ? 0 : 100) : parseFloat(((aval - meta) / meta * 100).toFixed(1));
    const devT  = tendV === 0 ? null : meta === 0 ? 100 : parseFloat(((tendV - meta) / meta * 100).toFixed(1));
    const tendS = aval <= meta ? '✓ Dentro da meta' : aval < ant ? '↗ Acima da meta, melhorando' : '↘ Acima da meta, piorando';
    return { aval, meta, ant, tendV, dev, devT, tendS };
  });
  mk('c-var', {
    type: 'bar',
    data: {
      labels: CRIMES.map(cl),
      datasets: [
        {
          label: 'Desvio vs Meta (%)',
          data: vmDetails.map(d => d.dev),
          backgroundColor: vmDetails.map(d =>
            d.aval <= d.meta ? 'rgba(61,191,122,.80)' :
            d.aval < d.ant   ? 'rgba(191,122,61,.85)' :
                               'rgba(200,75,75,.80)'
          ),
          borderRadius: 4,
          order: 1
        },
        {
          label: 'Tendência (%)',
          data: vmDetails.map(d => d.devT),
          backgroundColor: 'rgba(180,200,220,.45)',
          borderColor: 'rgba(180,200,220,.70)',
          borderWidth: 1,
          borderRadius: 4,
          order: 2
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          labels: { boxWidth: 16, font: { size: 16 } }
        },
        tooltip: {
          callbacks: {
            title: ctx => CRIMES[ctx[0].dataIndex],
            label: ctx => {
              const d = vmDetails[ctx.dataIndex];
              if (ctx.datasetIndex === 1) {
                return [
                  `Tendência (proj.): ${d.devT > 0 ? '+' : ''}${d.devT}% vs meta`,
                  `Valor tendência:   ${d.tendV}`
                ];
              }
              return [
                `Desvio vs Meta: ${d.dev > 0 ? '+' : ''}${d.dev}%`,
                `Avaliado:       ${d.aval}`,
                `Mês Anterior:   ${d.ant}`,
                `Meta:           ${d.meta || '—'}`,
                `Status:         ${d.tendS}`
              ];
            }
          }
        }
      },
      scales: {
        x: { grid: GR },
        y: { grid: GR, ticks: { callback: v => v + '%' } }
      },
      onClick: (evt, elements) => {
        if (elements.length) moOpen(CRIMES[elements[0].index], PAL[elements[0].index]);
      },
      onHover: (evt, elements) => {
        evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      }
    },
    plugins: [{
      id: 'zeroLine',
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
    }]
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
        legend: { position: 'bottom', labels: { boxWidth: 15, padding: 12, font: { size: 16 }, usePointStyle: true } }
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

function ciaSepRow(cia, cols) {
  return `<tr><td colspan="${cols}" style="padding:6px 10px;background:rgba(61,122,191,.08);border-top:2px solid rgba(61,122,191,.3);border-bottom:1px solid rgba(61,122,191,.2);font-family:'DM Mono',monospace;font-size:10px;letter-spacing:2px;color:#5a9de0;font-weight:700">${cia.toUpperCase()}</td></tr>`;
}

function munCia(mun) {
  return RAW.find(r => r.mun === mun)?.cia || '';
}

function renderMetas() {
  const pf      = pageFilters.metas;
  const isBtl   = pf.type === 'btl';
  const muns    = pf.type === 'mun' ? [pf.value]
                : pf.type === 'cia' ? MUNS.filter(m => RAW.some(r => r.mun === m && r.cia === pf.value))
                : MUNS;
  const crimes  = (pf.crime && pf.crime !== '__all__') ? [pf.crime] : CRIMES;

  let h = '<thead><tr><th>Município</th><th>CIA</th><th>Crime</th><th>Anterior</th><th>Meta</th><th>Avaliado</th><th style="cursor:help;white-space:nowrap" title="Variação percentual do valor avaliado em relação ao mês anterior. Positivo = aumento de ocorrências. Negativo = redução.">Var% vs Ant. ⓘ</th><th>Status</th></tr></thead><tbody>';
  let lastCia = null;
  muns.forEach(mun => {
    if (isBtl) {
      const cia = munCia(mun);
      if (cia !== lastCia) { h += ciaSepRow(cia, 8); lastCia = cia; }
    }
    crimes.forEach(crime => {
      const rows = q({ crime, mun, mes: selMeses });
      if (!rows.length) return;
      const ant = sf(rows, 'anterior'), meta = sf(rows, 'meta'), aval = sf(rows), cia = rows[0].cia;
      const vp = ant > 0 ? ((aval - ant) / ant * 100).toFixed(0) : (aval === 0 ? '0' : 'inf');
      const vc = vp === 'inf' ? 'var(--red2)' : parseFloat(vp) > 0 ? 'var(--red2)' : parseFloat(vp) < 0 ? 'var(--green2)' : 'var(--tx3)';
      const vt = vp === 'inf' ? '▲∞%' : parseFloat(vp) === 0 ? '0%' : (parseFloat(vp) > 0 ? '▲' : '▼') + Math.abs(vp) + '%';
      let pc, pt;
      if (meta > 0) {
        if (aval <= meta * 0.8) { pc = 'p-ok'; pt = 'Ótimo'; }
        else if (aval <= meta)  { pc = 'p-warn'; pt = 'Na Meta'; }
        else if (aval < ant)    { pc = 'p-evol'; pt = 'Em Evolução'; }
        else                    { pc = 'p-bad'; pt = 'Acima'; }
      } else {
        if (aval === 0)       { pc = 'p-ok';   pt = 'Meta'; }
        else if (aval < ant)  { pc = 'p-evol'; pt = 'Em Evolução'; }
        else                  { pc = 'p-bad';  pt = 'Acima'; }
      }
      h += `<tr><td style="font-weight:600">${mun}</td><td style="color:var(--tx3)">${cia}</td><td>${crime}</td><td class="num">${ant}</td><td class="num">${meta}</td><td class="num" style="font-weight:700">${aval}</td><td class="num" style="color:${vc}">${vt}</td><td><span class="pill ${pc}">${pt}</span></td></tr>`;
    });
  });
  document.getElementById('tbl-metas').innerHTML = h + '</tbody>';
}

// ---------------------------------------------------------------------------
// Desempenho por CIA
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

function renderHeatmap() {
  const p = pLbl(hmMeses);
  document.getElementById('lbl-p4').textContent  = p;
  document.getElementById('hm-badge').textContent = p;
  const maxes = CRIMES.map(c => Math.max(...MUNS.map(m => sf(q({ crime: c, mun: m, mes: hmMeses }))), 1));
  const hmCols = CRIMES.length + 2;
  let h = '<thead><tr><th>Município</th>' + CRIMES.map(c => `<th>${cl(c)}</th>`).join('') + '<th>Total</th></tr></thead><tbody>';
  let lastHmCia = null;
  MUNS.forEach(mun => {
    const cia = munCia(mun);
    if (cia !== lastHmCia) { h += ciaSepRow(cia, hmCols); lastHmCia = cia; }
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
  const pf   = pageFilters.visao;
  const sc   = scope('visao');
  const lbl  = pf.type === 'btl' ? 'Batalhão' : pf.value;
  const muns = pf.type === 'cia' ? MUNS.filter(m => RAW.some(r => r.mun === m && r.cia === pf.value)) : MUNS;
  const qsc  = f => q({ ...f, mes: selMeses, ...sc });

  // --- Pré-cálculos genéricos ---

  // Crime com maior crescimento percentual vs anterior (somente crimes com vol > 0)
  const crimesVar = CRIMES.map(c => {
    const a = sf(qsc({ crime: c })), ant = sf(qsc({ crime: c }), 'anterior');
    const varP = ant > 0 ? parseFloat(((a - ant) / ant * 100).toFixed(0)) : (a > 0 ? 100 : 0);
    return { c, a, ant, varP };
  }).filter(x => x.a > 0 || x.ant > 0);
  const crimeMaisCresceu = [...crimesVar].sort((a, b) => b.varP - a.varP)[0];
  const crimeMaisReduciu = [...crimesVar].sort((a, b) => a.varP - b.varP)[0];

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
    // 1. Crime com maior crescimento vs anterior
    crimeMaisCresceu && crimeMaisCresceu.varP > 0
      ? { t: 'red',   v: `▲${crimeMaisCresceu.varP}%`, title: `Maior crescimento — ${crimeMaisCresceu.c}`, body: `Passou de ${crimeMaisCresceu.ant} para ${crimeMaisCresceu.a} ocorrências vs período anterior. Crime com maior alta percentual no escopo selecionado.` }
      : crimeMaisReduciu
        ? { t: 'green', v: `▼${Math.abs(crimeMaisReduciu.varP)}%`, title: `Maior redução — ${crimeMaisReduciu.c}`, body: `Passou de ${crimeMaisReduciu.ant} para ${crimeMaisReduciu.a} ocorrências. Nenhum crime em alta no período — destaque para a maior queda.` }
        : { t: '', v: '—', title: 'Sem variação', body: 'Não há dados suficientes para calcular variação entre períodos.' },
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
  const sc    = scope('evolucao');
  const pf    = pageFilters.evolucao;

  // Municípios no escopo
  const muns = pf.type === 'mun' ? [pf.value]
             : pf.type === 'cia' ? MUNS.filter(m => RAW.some(r => r.mun === m && r.cia === pf.value))
             : MUNS;

  // Gráfico de linhas: Avaliado · Meta · Anterior · Tendência (agregado no escopo)
  mk('c-evol-main', {
    type: 'line',
    data: {
      labels: MESES,
      datasets: [
        {
          label: 'Avaliado',
          data: MESES.map(m => sf(q({ crime, mes: m, ...sc }))),
          borderColor: '#c8a84b', backgroundColor: 'rgba(200,168,75,.08)',
          tension: .4, fill: true, pointRadius: 5, pointBackgroundColor: '#c8a84b', borderWidth: 2
        },
        {
          label: 'Meta',
          data: MESES.map(m => sf(q({ crime, mes: m, ...sc }), 'meta')),
          borderColor: 'rgba(61,191,122,.6)', backgroundColor: 'transparent',
          tension: .4, borderDash: [6, 3], pointRadius: 3, borderWidth: 1.5
        },
        {
          label: 'Anterior',
          data: MESES.map(m => sf(q({ crime, mes: m, ...sc }), 'anterior')),
          borderColor: 'rgba(255,255,255,.18)', backgroundColor: 'transparent',
          tension: .4, borderDash: [3, 4], pointRadius: 2, borderWidth: 1
        },
        {
          label: 'Tendência',
          data: MESES.map(m => sf(q({ crime, mes: m, ...sc }), 'tend')),
          borderColor: '#3d7abf', backgroundColor: 'transparent',
          tension: .4, borderDash: [8, 4], pointRadius: 3, borderWidth: 1.5
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { boxWidth: 15, font: { size: 16 } } } },
      scales: { x: { grid: GR }, y: { grid: GR, beginAtZero: true } }
    }
  });

  // Tabela: municípios no escopo × meses
  const tblTitle = document.getElementById('evol-tbl-title');
  if (tblTitle) tblTitle.textContent = `${crime} — Avaliado por Município × Mês`;

  const evolCols = MESES.length + 4;
  let h = '<thead><tr><th>Município</th><th>CIA</th>' + MESES.map(m => `<th>${m}</th>`).join('') + '<th>Total</th><th>Status</th></tr></thead><tbody>';
  let lastEvolCia = null;
  muns.forEach(mun => {
    if (pf.type === 'btl') {
      const cia = munCia(mun);
      if (cia !== lastEvolCia) { h += ciaSepRow(cia, evolCols); lastEvolCia = cia; }
    }
    const rows = q({ crime, mun });
    if (!rows.length) return;
    const cia   = rows[0]?.cia || '—';
    const avals = MESES.map(m => sf(q({ crime, mun, mes: m })));
    const metas = MESES.map(m => sf(q({ crime, mun, mes: m }), 'meta'));
    const ants  = MESES.map(m => sf(q({ crime, mun, mes: m }), 'anterior'));
    const tot     = avals.reduce((a, b) => a + b, 0);
    const totMeta = metas.reduce((a, b) => a + b, 0);
    const totAnt  = ants.reduce((a, b) => a + b, 0);

    let pc, pt;
    if (tot <= totMeta)      { pc = 'p-ok';   pt = 'Na Meta'; }
    else if (tot < totAnt)   { pc = 'p-evol'; pt = 'Em Evolução'; }
    else                     { pc = 'p-bad';  pt = 'Acima'; }

    const cells = avals.map((a, i) => {
      const mt = metas[i], ant = ants[i];
      let color;
      if (a <= mt)      color = 'var(--green2)';
      else if (a < ant) color = '#e8965a';
      else              color = 'var(--red2)';
      const hasRec = q({ crime, mun, mes: MESES[i] }).length > 0;
      return `<td style="text-align:center;padding:6px 8px">
        ${hasRec ? `<div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:${color}">${a}</div>
        <div style="font-family:'DM Mono',monospace;font-size:12px;font-weight:500;color:var(--tx3);margin-top:2px">meta: ${mt}</div>` : '<div style="color:var(--tx3)">—</div>'}
      </td>`;
    }).join('');

    h += `<tr style="border-top:1px solid var(--bd)">
      <td style="font-weight:600">${mun}</td>
      <td style="color:var(--tx3);font-size:13px;font-weight:500">${cia}</td>
      ${cells}
      <td style="text-align:center;padding:6px 8px">
        <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:700">${tot}</div>
        <div style="font-family:'DM Mono',monospace;font-size:12px;font-weight:500;color:var(--tx3);margin-top:2px">meta: ${totMeta}</div>
      </td>
      <td><span class="pill ${pc}">${pt}</span></td>
    </tr>`;
  });
  document.getElementById('tbl-evol').innerHTML = h + '</tbody>';
}

// ---------------------------------------------------------------------------
// Modal de detalhes
// ---------------------------------------------------------------------------

let moIntelChs = [];
function moDestroy() {
  moCh.forEach(c => c.destroy()); moCh = [];
  moIntelChs.forEach(c => c.destroy()); moIntelChs = [];
}

function moOpen(crime, color, displayLabel) {
  moDestroy();
  moCrime = crime; moColor = color;
  moMeses = [...selMeses];
  moScopeType = 'btl'; moScopeVal = null;
  moOcorrAll = []; moOcorrCiaFilter = null;
  const label = displayLabel || (Array.isArray(crime) ? crime.join(' + ') : crime);
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
  const ano = new Date().getFullYear();
  let h = '<span class="pf-label">Período</span>';
  h += `<button class="pf-btn ${moMeses.length === MESES.length ? 'on' : ''}" onclick="moSetAllMes()">${ano}</button>`;
  MESES.forEach(m => h += `<button class="pf-btn ${moMeses.includes(m) ? 'on' : ''}" onclick="moTogMes('${m}')">${m}</button>`);
  h += '<span class="pf-sep"></span>';
  h += `<button class="pf-btn ${moScopeType === 'btl' ? 'on' : ''}" onclick="moSetScope('btl',null)">Batalhão</button>`;
  h += '<div class="pf-field"><span class="pf-label">CIA</span><select class="pf-select" style="min-width:90px" onchange="moSetScope(\'cia\',this.value)"><option value="">—</option>';
  CIAS.forEach(c => h += `<option value="${c}" ${moScopeType==='cia'&&moScopeVal===c?'selected':''}>${c}</option>`);
  h += '</select></div>';
  h += '<div class="pf-field"><span class="pf-label">Município</span><select class="pf-select" style="min-width:130px" onchange="moSetScope(\'mun\',this.value)"><option value="">—</option>';
  MUNS.forEach(m => h += `<option value="${m}" ${moScopeType==='mun'&&moScopeVal===m?'selected':''}>${m}</option>`);
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

  document.getElementById('mo-sub').textContent = 'ANÁLISE DETALHADA — ' + pLbl(moMeses).toUpperCase();

  const aval = sf(q({ crime, mes: moMeses, ...sc }));
  const meta = sf(q({ crime, mes: moMeses, ...sc }), 'meta');
  const ant  = sf(q({ crime, mes: moMeses, ...sc }), 'anterior');
  const vp   = ant > 0 ? ((aval - ant) / ant * 100).toFixed(0) : 0;

  const munDesvio   = muns.map(m => {
    const v  = sf(q({ crime, mun: m, mes: moMeses }));
    const mt = sf(q({ crime, mun: m, mes: moMeses }), 'meta');
    return { m, v, mt, desvio: mt > 0 ? (v - mt) / mt * 100 : -Infinity };
  });
  const acimaDoMeta = munDesvio.filter(x => x.mt > 0 && x.v > x.mt).sort((a,b) => b.desvio - a.desvio);
  const vc  = parseFloat(vp) <= 0 ? 'var(--green2)' : 'var(--red2)';
  const mok = meta > 0 && aval <= meta;

  const munCriticoHtml = acimaDoMeta.length === 0
    ? `<div class="mk-val" style="color:var(--green2);font-size:15px;padding-top:4px">✓ Todos na meta</div><div class="mk-sub">Nenhum município acima</div>`
    : acimaDoMeta.map(x => `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px"><span style="font-size:13px;font-weight:600;color:var(--tx)">${x.m}</span><span style="font-family:'DM Mono',monospace;font-size:12px;color:var(--red2);margin-left:8px">+${x.desvio.toFixed(0)}%</span></div>`).join('');

  document.getElementById('mo-kpis').innerHTML = `
    <div class="mk"><div class="mk-lbl">Total Avaliado</div><div class="mk-val" style="color:${color}">${aval}</div><div class="mk-sub">${pLbl(moMeses)}</div></div>
    <div class="mk"><div class="mk-lbl">Var vs Anterior</div><div class="mk-val" style="color:${vc}">${parseFloat(vp) <= 0 ? '▼' : '▲'}${Math.abs(vp)}%</div><div class="mk-sub">Ant: ${ant}</div></div>
    <div class="mk" style="grid-column:span 1"><div class="mk-lbl">Municípios Fora da Meta (${acimaDoMeta.length})</div>${munCriticoHtml}</div>
    <div class="mk"><div class="mk-lbl">Meta</div><div class="mk-val" style="color:${mok?'var(--green2)':'var(--red2)'};font-size:16px;padding-top:6px">${mok?'✓ Ok':'✗ Acima'}</div><div class="mk-sub">Meta:${meta} | Real:${aval}</div></div>`;

  // Breakdown para crimes agrupados
  const breakdownEl = document.getElementById('mo-breakdown');
  const breakdownCtx = document.getElementById('mo-breakdown-chart')?.getContext('2d');
  if (Array.isArray(crime) && breakdownEl && breakdownCtx) {
    breakdownEl.style.display = 'block';
    const bAval = crime.map(c => sf(q({ crime: c, mes: moMeses, ...sc })));
    const bMeta = crime.map(c => sf(q({ crime: c, mes: moMeses, ...sc }), 'meta'));
    const bAnt  = crime.map(c => sf(q({ crime: c, mes: moMeses, ...sc }), 'anterior'));
    const bColors = ['rgba(61,122,191,.75)', 'rgba(61,191,122,.75)'];
    moCh.push(new Chart(breakdownCtx, {
      type: 'bar',
      data: { labels: crime.map(cl), datasets: [
        { label: 'Avaliado',  data: bAval, backgroundColor: bColors, borderRadius: 4 },
        { label: 'Meta',      data: bMeta, backgroundColor: 'rgba(255,255,255,.09)', borderRadius: 4 },
        { label: 'Anterior',  data: bAnt,  backgroundColor: 'rgba(255,255,255,.05)', borderRadius: 4 }
      ]},
      options: { responsive: true, plugins: { legend: { labels: { boxWidth: 14, font: { size: 13 } } } }, scales: { x: { grid: GR }, y: { grid: GR, beginAtZero: true } } }
    }));
  } else if (breakdownEl) {
    breakdownEl.style.display = 'none';
  }

  // Meta vs Avaliado
  const mm  = muns.map(m => sf(q({ crime, mun: m, mes: moMeses }), 'meta'));
  const ma  = muns.map(m => sf(q({ crime, mun: m, mes: moMeses })));
  moCh.push(new Chart(document.getElementById('mo-meta').getContext('2d'), {
    type: 'bar',
    data: { labels: muns.map(m => m.split(' ')[0]), datasets: [
      { label: 'Meta',     data: mm, backgroundColor: 'rgba(255,255,255,.09)', borderRadius: 3 },
      { label: 'Avaliado', data: ma, backgroundColor: ma.map((v,i) => mm[i]>0&&v<=mm[i]?'rgba(61,191,122,.75)':'rgba(200,75,75,.75)'), borderRadius: 3 }
    ]},
    options: { responsive: true, plugins: { legend: { labels: { boxWidth: 15, font: { size: 16 } } } }, scales: { x: { grid: GR }, y: { grid: GR, beginAtZero: true } } }
  }));

  // Evolução por Município (sempre todos os MESES no eixo X)
  const withOcc = muns.map(m => ({ m, v: sf(q({ crime, mun: m, mes: moMeses })) })).filter(x => x.v > 0).sort((a,b) => b.v - a.v);
  const lc2 = ['#c8a84b','#3d7abf','#c84b4b','#3dbf7a','#bf7a3d','#7a4bbf','#4bbfbf','#e06060','#5ae09a'];
  moCh.push(new Chart(document.getElementById('mo-line').getContext('2d'), {
    type: 'line',
    data: { labels: MESES, datasets: withOcc.map(({m},i) => ({
      label: m, data: MESES.map(mes => sf(q({ crime, mun: m, mes }))),
      borderColor: lc2[i%lc2.length], backgroundColor: 'transparent', tension: 0, pointRadius: 5, borderWidth: 2,
      borderDash: i%2===1?[5,3]:[], pointStyle: i%2===1?'triangle':'circle', pointBackgroundColor: lc2[i%lc2.length]
    }))},
    options: { responsive: true, plugins: { legend: { labels: { boxWidth: 15, padding: 10, font: { size: 16 }, usePointStyle: true } } }, scales: { x: { grid: GR }, y: { grid: GR, beginAtZero: true, ticks: { stepSize: 1 } } } }
  }));

  // Distribuição por CIA
  const cv = CIAS.map(c => sf(q({ crime, cia: c, mes: moMeses })));
  moCh.push(new Chart(document.getElementById('mo-donut').getContext('2d'), {
    type: 'doughnut',
    data: { labels: CIAS, datasets: [{ data: cv, backgroundColor: ['#c8a84b','#3d7abf','#c84b4b'], borderWidth: 0, hoverOffset: 8 }] },
    options: {
      responsive: true, cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 15, padding: 12, font: { size: 16 } } },
        tooltip: {
          callbacks: {
            title: (items) => items[0].label,
            label: () => '',
            afterBody: (items) => {
              const cia = CIAS[items[0].dataIndex];
              const filtered = moOcorrAll.filter(r => {
                if (normCiaKey(r.cia) !== normCiaKey(cia)) return false;
                if (!r.data_ocorrencia) return true;
                const m = parseInt(r.data_ocorrencia.split('-')[1]) - 1;
                return moMeses.includes(MES_ORD[m]);
              });
              if (!filtered.length) return ['  Sem ocorrências registradas'];
              const counts = {};
              filtered.forEach(r => { const rub = r.rubrica || 'Não informado'; counts[rub] = (counts[rub] || 0) + 1; });
              return Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .map(([rub, cnt]) => `  ${rub}: ${cnt}`);
            }
          }
        }
      },
      onClick(evt, items) {
        if (!items.length) return;
        setOcorrCia(CIAS[items[0].index]);
      }
    }
  }));

  applyOcorrFilters();
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
    const res  = await authFetch(`${API}/upload`, {
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
// Upload de Ocorrências InfoCrim
// ---------------------------------------------------------------------------

let ocorrData = null;
let moOcorrAll = [];
let moOcorrCiaFilter = null;

function openOcorrModal() {
  ocorrData = null;
  document.getElementById('ocorr-file').value = '';
  document.getElementById('ocorr-preview').style.display = 'none';
  document.getElementById('ocorr-confirm').disabled = true;
  document.getElementById('ocorr-confirm').textContent = 'Importar';
  showOcorrMsg('', '');
  document.getElementById('ocorr-upl-mo').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeOcorrModal() {
  document.getElementById('ocorr-upl-mo').classList.remove('on');
  document.body.style.overflow = '';
}

function ocorrClickOut(e) {
  if (e.target === document.getElementById('ocorr-upl-mo')) closeOcorrModal();
}

function showOcorrMsg(txt, type) {
  const el = document.getElementById('ocorr-msg');
  el.textContent = txt;
  el.style.display = txt ? 'block' : 'none';
  el.style.color = type === 'err' ? '#e06060' : type === 'ok' ? '#5ae09a' : '#5a9de0';
}

function handleOcorrFile(input) {
  const file = input.files[0];
  if (!file) return;
  showOcorrMsg('Lendo arquivo...', 'info');
  ocorrData = null;
  document.getElementById('ocorr-preview').style.display = 'none';
  document.getElementById('ocorr-confirm').disabled = true;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
    complete: (results) => {
      if (!results.data.length) { showOcorrMsg('Arquivo vazio ou sem registros válidos.', 'err'); return; }

      const required = ['DataOcorrencia', 'Rubrica', 'CompanhiaCircunscricao', 'MunicipioCircunscricao'];
      const headers  = Object.keys(results.data[0]);
      const missing  = required.filter(r => !headers.some(h => h.toLowerCase() === r.toLowerCase()));
      if (missing.length) { showOcorrMsg(`Colunas ausentes: ${missing.join(', ')}`, 'err'); return; }

      ocorrData = results.data
        .map(row => { const n = {}; Object.entries(row).forEach(([k, v]) => { n[k.trim()] = (v || '').trim(); }); return n; })
        .filter(r => r.DataOcorrencia && r.Rubrica);

      document.getElementById('ocorr-fn').textContent   = file.name;
      document.getElementById('ocorr-rows').textContent = ocorrData.length;
      document.getElementById('ocorr-preview').style.display = 'block';
      document.getElementById('ocorr-confirm').disabled = false;
      showOcorrMsg(`${ocorrData.length} registros prontos para importar.`, 'info');
    },
    error: (err) => { showOcorrMsg('Erro ao ler o arquivo: ' + err.message, 'err'); }
  });
}

async function confirmOcorrUpload() {
  if (!ocorrData?.length) return;
  const btn = document.getElementById('ocorr-confirm');
  btn.disabled = true;
  btn.textContent = 'Importando...';
  showOcorrMsg('Enviando para o Supabase...', 'info');

  try {
    const res  = await authFetch(`${API}/upload/ocorrencias`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ records: ocorrData })
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || 'Erro desconhecido');
    showOcorrMsg(`✓ ${json.inserted} registros importados com sucesso.`, 'ok');
    btn.textContent = 'Importar';
  } catch (err) {
    showOcorrMsg('✗ ' + err.message, 'err');
    btn.disabled = false;
    btn.textContent = 'Importar';
  }
}

// ---------------------------------------------------------------------------
// Ocorrências InfoCrim no Modal de Crime
// ---------------------------------------------------------------------------

// Extrai o número da CIA para comparação fuzzy (ex: "1ª CIA PM" e "1ª CIA" → "1")
function normCiaKey(s) {
  const m = (s || '').match(/(\d+)/);
  return m ? m[1] : (s || '').toLowerCase().trim();
}

async function loadMoOcorr() {
  const el = document.getElementById('mo-ocorr-table');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--tx3);font-size:12px;padding:8px 0">Carregando ocorrências...</div>';
  const filtersEl = document.getElementById('mo-ocorr-filters');
  if (filtersEl) filtersEl.innerHTML = '';

  try {
    const rubricaQuery = Array.isArray(moCrime) ? 'Veículo' : moCrime;
    const params = new URLSearchParams({ rubrica: rubricaQuery, limit: '2000' });
    const res  = await authFetch(`${API}/ocorrencias?${params}`);
    const data = await res.json();
    moOcorrAll = Array.isArray(data) ? data : [];
    applyOcorrFilters();
  } catch (err) {
    if (el) el.innerHTML = `<div style="color:#e06060;font-size:12px;padding:8px 0">Erro ao carregar ocorrências: ${err.message}</div>`;
  }
}

function applyOcorrFilters() {
  let filtered = moOcorrAll.filter(r => {
    if (!r.data_ocorrencia) return true;
    const m = parseInt(r.data_ocorrencia.split('-')[1]) - 1;
    return moMeses.includes(MES_ORD[m]);
  });
  if (moOcorrCiaFilter) filtered = filtered.filter(r => normCiaKey(r.cia) === normCiaKey(moOcorrCiaFilter));
  renderMoOcorrFilters();
  renderOcorrTable(filtered);
  renderMoIntel(filtered);
}

function setOcorrCia(cia) {
  moOcorrCiaFilter = moOcorrCiaFilter === cia ? null : cia;
  applyOcorrFilters();
}

function renderMoOcorrFilters() {
  const el = document.getElementById('mo-ocorr-filters');
  if (!el) return;
  let h = '';
  if (moOcorrAll.length) {
    h += `<span style="font-size:11px;color:var(--tx3)">${moOcorrAll.length} registro(s) total</span>`;
  }
  if (moOcorrCiaFilter) {
    h += `<button onclick="setOcorrCia('${moOcorrCiaFilter}')" style="margin-left:8px;padding:3px 10px;border-radius:12px;border:1px solid rgba(200,75,75,.4);background:rgba(200,75,75,.1);color:#e06060;cursor:pointer;font-size:11px">✕ ${moOcorrCiaFilter}</button>`;
  }
  el.innerHTML = h;
}

function renderOcorrTable(data) {
  const el = document.getElementById('mo-ocorr-table');
  if (!el) return;
  if (!data.length) {
    el.innerHTML = '<div style="color:var(--tx3);font-size:12px;padding:8px 0">Nenhuma ocorrência encontrada para os filtros selecionados.</div>';
    return;
  }
  const th = s => `<th style="padding:6px 8px;border-bottom:1px solid var(--bd);font-family:'DM Mono',monospace;font-size:9px;color:#4a5568;letter-spacing:1px;text-align:left;white-space:nowrap">${s}</th>`;
  const td = (s, mono) => `<td style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.03);color:var(--tx2);white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis${mono?';font-family:\'DM Mono\',monospace;font-size:11px':''}" title="${(s||'').replace(/"/g,'&quot;')}">${s||'—'}</td>`;
  let h = `<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>
    ${th('DATA')}${th('HORA')}${th('PERÍODO')}${th('DIA')}${th('FLAGRANTE')}${th('CONDUTA')}${th('BAIRRO')}${th('TIPO LOCAL')}${th('MUNICÍPIO')}${th('CIA')}
  </tr></thead><tbody>`;
  data.forEach(r => {
    const df = r.data_ocorrencia ? r.data_ocorrencia.split('-').reverse().join('/') : '—';
    const flag = r.flagrante === true ? 'Sim' : r.flagrante === false ? 'Não' : (r.flagrante || '—');
    h += `<tr>${td(df,true)}${td(r.hora_ocorrencia)}${td(r.periodo)}${td(r.dia_semana)}${td(flag)}${td(r.conduta)}${td(r.bairro)}${td(r.tipo_local)}${td(r.municipio)}${td(r.cia)}</tr>`;
  });
  h += '</tbody></table>';
  el.innerHTML = h;
}

// ---------------------------------------------------------------------------
// Inteligência Operacional — InfoCrim
// ---------------------------------------------------------------------------

function normDia(s) {
  const key = (s || '').toLowerCase().replace(/-feira/, '').trim();
  const MAP = { domingo:'Dom', segunda:'Seg', 'terça':'Ter', terca:'Ter', quarta:'Qua', quinta:'Qui', sexta:'Sex', 'sábado':'Sáb', sabado:'Sáb' };
  return MAP[key] || s;
}

function horaBlock(h) {
  if (!h) return null;
  const hr = parseInt((h || '').split(':')[0]);
  if (isNaN(hr)) return null;
  if (hr < 6) return 0;
  if (hr < 12) return 1;
  if (hr < 18) return 2;
  return 3;
}

function renderMoIntel(data) {
  moIntelChs.forEach(c => c.destroy()); moIntelChs = [];
  const sec = document.getElementById('mo-intel');
  if (!sec) return;
  if (!data.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  renderOcorrHeatmap(data);
  renderTipoLocal(data);
  renderBairros(data);
  renderRubrica(data);
  renderReincidencia(data);
}

function renderOcorrHeatmap(data) {
  const el = document.getElementById('mo-heatmap');
  if (!el) return;
  const DIAS   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const BLOCOS = ['Madrugada<br>00–05','Manhã<br>06–11','Tarde<br>12–17','Noite<br>18–23'];
  const matrix = {};
  DIAS.forEach(d => { matrix[d] = [0,0,0,0]; });
  let maxVal = 0;
  data.forEach(r => {
    const dia   = normDia(r.dia_semana);
    const bloco = horaBlock(r.hora_ocorrencia);
    if (DIAS.includes(dia) && bloco !== null) {
      matrix[dia][bloco]++;
      if (matrix[dia][bloco] > maxVal) maxVal = matrix[dia][bloco];
    }
  });
  if (maxVal === 0) { el.innerHTML = '<div style="color:var(--tx3);font-size:12px">Sem dados de horário disponíveis.</div>'; return; }
  const cellStyle = count => {
    const i = count / maxVal;
    const a = (0.08 + i * 0.88).toFixed(2);
    return `background:rgba(200,75,75,${a});color:${i > 0.45 ? '#fff' : 'var(--tx3)'};font-weight:${count ? 600 : 400}`;
  };
  let h = `<table style="width:100%;border-collapse:separate;border-spacing:3px;font-size:11px"><thead><tr>
    <th style="padding:4px 6px;color:var(--tx3);font-family:'DM Mono',monospace;font-size:9px;text-align:left"></th>`;
  BLOCOS.forEach(b => h += `<th style="padding:4px;color:var(--tx3);font-family:'DM Mono',monospace;font-size:9px;text-align:center">${b}</th>`);
  h += '</tr></thead><tbody>';
  DIAS.forEach(dia => {
    h += `<tr><td style="padding:4px 8px;color:var(--tx3);font-family:'DM Mono',monospace;font-size:9px;white-space:nowrap">${dia}</td>`;
    matrix[dia].forEach(cnt => h += `<td style="padding:7px 4px;border-radius:4px;text-align:center;${cellStyle(cnt)}">${cnt || ''}</td>`);
    h += '</tr>';
  });
  el.innerHTML = h + '</tbody></table>';
}

function renderTipoLocal(data) {
  const counts = {};
  data.forEach(r => { const t = r.tipo_local || 'Não informado'; counts[t] = (counts[t]||0)+1; });
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
  const top = sorted.slice(0,7);
  const outros = sorted.slice(7).reduce((s,[,v]) => s+v, 0);
  if (outros > 0) top.push(['Outros', outros]);
  const ctx = document.getElementById('mo-tipolocal')?.getContext('2d');
  if (!ctx) return;
  const colors = ['#c8a84b','#3d7abf','#c84b4b','#3dbf7a','#bf7a3d','#7a4bbf','#4bbfbf','#808080'];
  moIntelChs.push(new Chart(ctx, {
    type: 'doughnut',
    data: { labels: top.map(([k])=>k), datasets: [{ data: top.map(([,v])=>v), backgroundColor: colors.slice(0,top.length), borderWidth:0 }] },
    options: { responsive:true, cutout:'60%', plugins:{ legend:{ position:'bottom', labels:{ boxWidth:12, font:{size:11}, padding:8 } } } }
  }));
}

function renderBairros(data) {
  const counts = {};
  const muns   = {};
  data.forEach(r => {
    if (!r.bairro) return;
    const key = r.bairro;
    counts[key] = (counts[key] || 0) + 1;
    if (!muns[key] && r.municipio) muns[key] = r.municipio;
  });
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,10);
  if (!sorted.length) return;
  const ctx = document.getElementById('mo-bairros')?.getContext('2d');
  if (!ctx) return;
  const labels = sorted.map(([k]) => muns[k] ? [muns[k], k] : k);
  moIntelChs.push(new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label:'Ocorrências', data: sorted.map(([,v])=>v), backgroundColor:'rgba(200,75,75,.7)', borderRadius:4 }] },
    options: { indexAxis:'y', responsive:true, plugins:{ legend:{display:false} }, scales:{ x:{ grid:GR, ticks:{stepSize:1} }, y:{ grid:GR } } }
  }));
}

function renderRubrica(data) {
  const counts = {};
  data.forEach(r => { const rub = r.rubrica||'Não informado'; counts[rub]=(counts[rub]||0)+1; });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if (!sorted.length) return;
  const ctx = document.getElementById('mo-rubrica')?.getContext('2d');
  if (!ctx) return;
  const colors = ['#c84b4b','#bf7a3d','#c8a84b','#3d7abf','#3dbf7a','#7a4bbf','#4bbfbf','#e06060','#5ae09a'];
  moIntelChs.push(new Chart(ctx, {
    type: 'bar',
    data: { labels: sorted.map(([k])=>k), datasets: [{ label:'Ocorrências', data: sorted.map(([,v])=>v), backgroundColor: sorted.map((_,i)=>colors[i%colors.length]), borderRadius:4 }] },
    options: { indexAxis:'y', responsive:true, plugins:{ legend:{display:false} }, scales:{ x:{ grid:GR, ticks:{stepSize:1} }, y:{ grid:GR } } }
  }));
}

function renderReincidencia(data) {
  const el = document.getElementById('mo-reincidencia');
  if (!el) return;
  const bd = {};
  data.forEach(r => {
    if (!r.bairro) return;
    if (!bd[r.bairro]) bd[r.bairro] = { meses: new Set(), total: 0 };
    bd[r.bairro].total++;
    if (r.data_ocorrencia) bd[r.bairro].meses.add(r.data_ocorrencia.substring(0,7));
  });
  const lista = Object.entries(bd)
    .filter(([,d]) => d.meses.size >= 2)
    .sort((a,b) => b[1].meses.size - a[1].meses.size || b[1].total - a[1].total)
    .slice(0,10);
  if (!lista.length) { el.innerHTML = '<div style="color:var(--tx3);font-size:12px">Nenhum bairro com ocorrências em múltiplos meses.</div>'; return; }
  const maxM = lista[0][1].meses.size;
  el.innerHTML = lista.map(([bairro,d]) => {
    const pct = (d.meses.size / maxM * 100).toFixed(0);
    return `<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:12px;font-weight:600;color:var(--tx)">${bairro}</span>
        <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--tx3)">${d.meses.size} mês(es) · ${d.total} ocorr.</span>
      </div>
      <div style="height:5px;background:var(--s3);border-radius:3px">
        <div style="height:5px;width:${pct}%;background:#c84b4b;border-radius:3px"></div>
      </div>
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Navegação entre páginas
// ---------------------------------------------------------------------------

let currentP3Page = 'visao';

function closeSidebarMobile() {
  const aside = document.querySelector('aside');
  if (aside.classList.contains('open')) {
    aside.classList.remove('open');
    document.querySelector('.sidebar-overlay').style.display = 'none';
  }
}

function goSection(id, btn) {
  closeSidebarMobile();
  document.querySelectorAll('.sec-btn').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  const isP3 = id === 'p3';
  document.getElementById('p3-submenu').style.display = isP3 ? '' : 'none';
  if (isP3) {
    // Sempre retorna para Visão Geral ao entrar no P3
    currentP3Page = 'visao';
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('on'));
    const visaoBtn = document.querySelector('.nav-btn[onclick*="visao"]');
    if (visaoBtn) visaoBtn.classList.add('on');
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.getElementById(isP3 ? 'page-visao' : 'page-' + id).classList.add('on');
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
}

function goPage(id, btn) {
  closeSidebarMobile();
  currentP3Page = id;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('on'));
  document.getElementById('page-' + id).classList.add('on');
  btn.classList.add('on');
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
}

// ---------------------------------------------------------------------------
// Inicia a aplicação
// ---------------------------------------------------------------------------

init();
