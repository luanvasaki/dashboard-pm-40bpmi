// ═══════════════════════════════════════════════════════════════════════════
// GERENCIAMENTO DE USUÁRIOS
// adm-mo: lista de usuários (clique no nome → adm-user-mo)
// adm-user-mo: edição individual — posto, seção, acesso por seção, ações
// P1 e P3 podem gerenciar; exclusão restrita a P3/admin.
// ═══════════════════════════════════════════════════════════════════════════

function admClickOut(e) { if (e.target.id === 'adm-mo') closeAdminModal(); }
function closeAdminModal() { document.getElementById('adm-mo').style.display = 'none'; }
function admUserMoClickOut(e) { if (e.target.id === 'adm-user-mo') closeUserEditModal(); }
function closeUserEditModal() { document.getElementById('adm-user-mo').style.display = 'none'; _editingUserId = null; }

let _admAllUsers   = [];
let _admUsersById  = {};
let _editingUserId = null;
let _editingSecoes = {};

const POSTO_ORDER = ['Sd PM','Cb PM','3º Sgt PM','2º Sgt PM','1º Sgt PM','Subten PM','Asp Of PM','2º Ten PM','1º Ten PM','Cap PM','Maj PM','Ten Cel PM','Cel PM'];
function _postoRank(posto) { const i = POSTO_ORDER.indexOf(posto||''); return i === -1 ? -1 : i; }
function _sortHierarquia(users) {
  return [...users].sort((a, b) => {
    const dr = _postoRank(b.posto) - _postoRank(a.posto);
    if (dr !== 0) return dr;
    const ma = parseInt((a.matricula||'').replace(/\D/g,'')) || 999999;
    const mb = parseInt((b.matricula||'').replace(/\D/g,'')) || 999999;
    return ma - mb;
  });
}

function admSearch(q) {
  const me = JSON.parse(localStorage.getItem('auth_user') || '{}');
  const term = (q||'').toLowerCase().trim();
  const filtered = !term ? _admAllUsers : _admAllUsers.filter(u =>
    (u.nome    ||'').toLowerCase().includes(term) ||
    (u.matricula||'').toLowerCase().includes(term) ||
    (u.posto   ||'').toLowerCase().includes(term) ||
    (u.secao   ||'').toLowerCase().includes(term)
  );
  document.getElementById('adm-users').innerHTML = buildUserTable(filtered, me);
}

async function openAdminModal() {
  document.getElementById('adm-mo').style.display = 'block';
  document.getElementById('adm-msg').style.display = 'none';
  const badge = document.getElementById('pending-badge');
  if (badge) badge.style.display = 'none';
  const searchEl = document.getElementById('adm-search');
  if (searchEl) searchEl.value = '';
  _admAllUsers = [];
  _admUsersById = {};
  const btnLogs = document.getElementById('adm-btn-logs');
  if (btnLogs) {
    btnLogs.style.display = 'none';
    authFetch(`${API}/logs/acesso?limit=1`).then(r => {
      if (btnLogs) btnLogs.style.display = r.ok ? 'inline-block' : 'none';
    }).catch(() => {});
  }
  document.getElementById('adm-users').innerHTML = '<div style="color:var(--tx3);font-size:13px;padding:10px 0">Carregando...</div>';
  document.getElementById('adm-pending').innerHTML = '';
  document.getElementById('adm-pending-section').style.display = 'none';
  try {
    const data = await authFetch(`${API}/admin/users`).then(r => r.json());
    if (!Array.isArray(data)) throw new Error(data?.error || 'Resposta inesperada da API.');
    renderAdminUsers(data);
  } catch (err) {
    document.getElementById('adm-users').innerHTML = `<div style="color:#f07878;font-size:13px">${err.message}</div>`;
  }
}

function renderAdminUsers(users) {
  const me = JSON.parse(localStorage.getItem('auth_user') || '{}');
  const pending = _sortHierarquia(users.filter(u => u.status === 'pending'));
  const others  = _sortHierarquia(users.filter(u => u.status !== 'pending'));
  _admAllUsers = others;
  _admUsersById = {};
  users.forEach(u => { _admUsersById[u.id] = u; });
  if (pending.length) {
    document.getElementById('adm-pending-section').style.display = 'block';
    document.getElementById('adm-pending').innerHTML = buildUserTable(pending, me);
  }
  document.getElementById('adm-users').innerHTML = buildUserTable(others, me);
}

function buildUserTable(users, me) {
  users = users.filter(u => u.role !== 'admin');
  if (!users.length) return '<div style="color:var(--tx3);font-size:13px;padding:6px 0">Nenhum registro.</div>';
  const STATUS_STYLE = {
    pending:  'background:rgba(200,168,75,.15);color:#e8c96a',
    approved: 'background:rgba(61,191,122,.1);color:#5ae09a',
    rejected: 'background:rgba(230,100,100,.1);color:#f07878'
  };
  const STATUS_LABEL = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Recusado' };
  const thS = 'text-align:left;padding:9px 8px;border-bottom:1px solid var(--bd);font-family:"DM Mono",monospace;font-size:11px;color:var(--tx3);letter-spacing:1px';
  const tdS = 'padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.03);font-size:13px';
  let h = `<table style="width:100%;border-collapse:collapse">
    <thead><tr>
      <th style="${thS}">NOME</th>
      <th style="${thS}">POSTO/GRAD.</th>
      <th style="${thS}">RE</th>
      <th style="${thS}">FUNÇÃO</th>
      <th style="${thS}">STATUS</th>
      <th style="${thS}"></th>
    </tr></thead><tbody>`;
  users.forEach(u => {
    const sStyle = STATUS_STYLE[u.status] || '';
    let quickActions = '';
    if (u.status === 'pending') {
      quickActions = `
        <button onclick="event.stopPropagation();admAction('${u.id}','approved')" style="padding:4px 10px;background:rgba(61,191,122,.15);border:1px solid rgba(61,191,122,.3);color:#5ae09a;border-radius:4px;cursor:pointer;font-size:12px;margin-right:4px">✓</button>
        <button onclick="event.stopPropagation();admAction('${u.id}','rejected')" style="padding:4px 10px;background:rgba(230,100,100,.1);border:1px solid rgba(230,100,100,.25);color:#f07878;border-radius:4px;cursor:pointer;font-size:12px">✕</button>`;
    }
    h += `<tr onclick="openUserEditModal('${u.id}')" style="cursor:pointer;transition:background .12s" onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background=''">
      <td style="${tdS};color:#5a9de0;font-weight:600">${escHtml(u.nome)}</td>
      <td style="${tdS};font-family:'DM Mono',monospace;font-size:11px;color:var(--tx3)">${escHtml(u.posto||'—')}</td>
      <td style="${tdS};font-family:'DM Mono',monospace;font-size:11px;color:var(--tx3)">${escHtml(u.matricula)}</td>
      <td style="${tdS};font-size:12px;color:var(--tx3)">${escHtml(u.secao||'—')}</td>
      <td style="${tdS}"><span style="padding:2px 10px;border-radius:20px;font-family:'DM Mono',monospace;font-size:11px;${sStyle}">${STATUS_LABEL[u.status]||u.status}</span></td>
      <td style="${tdS};white-space:nowrap">${quickActions}</td>
    </tr>`;
  });
  h += '</tbody></table>';
  return h;
}

// Seções disponíveis para controle de acesso por usuário
const SECOES_ACESSO_DEF = [
  { key: 'p1',  label: 'P1 · Seção de Pessoal',   cor: '#5a9de0' },
  { key: 'uis', label: 'UIS · Restrições Médicas', cor: '#9b59b6' },
  { key: 'p3',  label: 'P3 · Painel Operacional',  cor: '#4bc87a' },
];

function _secBtn(key, val, active, cor) {
  const on = val === active;
  const labels = { none: 'Sem acesso', viewer: 'Visualizador', editor: 'Editor' };
  const s = on
    ? `background:${cor}33;border:1px solid ${cor}88;color:${cor};font-weight:600`
    : `background:transparent;border:1px solid rgba(255,255,255,.1);color:var(--tx3);font-weight:400`;
  return `<button onclick="admSetSecAccess('${key}','${val}',this)" data-sec="${key}" data-val="${val}" style="padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;transition:all .12s;${s}">${labels[val]}</button>`;
}

function admSetSecAccess(key, val, btn) {
  _editingSecoes[key] = val;
  const def = SECOES_ACESSO_DEF.find(s => s.key === key);
  const cor = def ? def.cor : '#5a9de0';
  document.querySelectorAll(`[data-sec="${key}"]`).forEach(b => {
    const on = b.dataset.val === val;
    b.style.background = on ? `${cor}33` : 'transparent';
    b.style.border = on ? `1px solid ${cor}88` : '1px solid rgba(255,255,255,.1)';
    b.style.color = on ? cor : 'var(--tx3)';
    b.style.fontWeight = on ? '600' : '400';
  });
}

function openUserEditModal(id) {
  const u = _admUsersById[id];
  if (!u) return;
  _editingUserId = id;
  _editingSecoes = {};
  const me = JSON.parse(localStorage.getItem('auth_user') || '{}');
  const canDelete = ['admin', 'p3', 'ti'].includes(me.role);

  document.getElementById('admu-re').textContent   = `RE ${u.matricula}`;
  document.getElementById('admu-nome').textContent = u.nome;

  const SS = { pending: 'background:rgba(200,168,75,.15);color:#e8c96a', approved: 'background:rgba(61,191,122,.1);color:#5ae09a', rejected: 'background:rgba(230,100,100,.1);color:#f07878' };
  const SL = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Recusado' };
  const badge = document.getElementById('admu-status-badge');
  badge.textContent = SL[u.status] || u.status;
  badge.style.cssText = `display:inline-block;margin-top:5px;padding:2px 10px;border-radius:20px;font-family:'DM Mono',monospace;font-size:11px;${SS[u.status]||''}`;

  document.getElementById('admu-posto-sel').value = u.posto || '';
  document.getElementById('admu-secao-sel').value = u.secao || '';

  const sa = u.secoes_acesso || {};
  SECOES_ACESSO_DEF.forEach(({ key }) => { _editingSecoes[key] = sa[key] || 'none'; });

  document.getElementById('admu-secoes').innerHTML = SECOES_ACESSO_DEF.map(({ key, label, cor }) => {
    const cur = sa[key] || 'none';
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,.025);border-radius:6px">
      <div style="flex:1;font-size:13px;color:var(--tx);font-weight:600">${label}</div>
      <div style="display:flex;gap:4px">${['none','viewer','editor'].map(v => _secBtn(key, v, cur, cor)).join('')}</div>
    </div>`;
  }).join('');

  let statusHtml = '';
  if (u.status === 'pending') {
    statusHtml = `<button onclick="admStatusFromModal('approved')" style="padding:5px 12px;background:rgba(61,191,122,.15);border:1px solid rgba(61,191,122,.3);color:#5ae09a;border-radius:4px;cursor:pointer;font-size:12px;margin-right:4px">✓ Aprovar</button>
                  <button onclick="admStatusFromModal('rejected')" style="padding:5px 12px;background:rgba(230,100,100,.1);border:1px solid rgba(230,100,100,.25);color:#f07878;border-radius:4px;cursor:pointer;font-size:12px">✕ Recusar</button>`;
  } else if (u.status === 'approved') {
    statusHtml = `<button onclick="admStatusFromModal('rejected')" style="padding:5px 12px;background:rgba(230,100,100,.08);border:1px solid rgba(230,100,100,.2);color:#f07878;border-radius:4px;cursor:pointer;font-size:12px">Revogar acesso</button>`;
  } else {
    statusHtml = `<button onclick="admStatusFromModal('approved')" style="padding:5px 12px;background:rgba(61,191,122,.1);border:1px solid rgba(61,191,122,.25);color:#5ae09a;border-radius:4px;cursor:pointer;font-size:12px">Reativar</button>`;
  }
  document.getElementById('admu-status-actions').innerHTML = statusHtml;
  document.getElementById('admu-btn-del').style.display = canDelete ? 'inline-block' : 'none';
  document.getElementById('admu-msg').textContent = '';
  document.getElementById('adm-user-mo').style.display = 'flex';
}

async function admSaveUserEdit() {
  const id = _editingUserId; if (!id) return;
  const posto = document.getElementById('admu-posto-sel').value;
  const secao = document.getElementById('admu-secao-sel').value;
  const secoes_acesso = { ..._editingSecoes };
  try {
    if (posto) {
      const r1 = await authFetch(`${API}/admin/users/${id}/posto`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posto })
      });
      if (!r1.ok) throw new Error((await r1.json()).error);
    }
    const r2 = await authFetch(`${API}/admin/users/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secao, secoes_acesso })
    });
    if (!r2.ok) throw new Error((await r2.json()).error);
    if (_admUsersById[id]) { Object.assign(_admUsersById[id], { posto, secao, secoes_acesso }); }
    const me = JSON.parse(localStorage.getItem('auth_user') || '{}');
    document.getElementById('adm-users').innerHTML = buildUserTable(_admAllUsers, me);
    showAdmuMsg('Salvo com sucesso.', 'ok');
  } catch (err) { showAdmuMsg(err.message, 'err'); }
}

async function admStatusFromModal(status) {
  const id = _editingUserId; if (!id) return;
  try {
    const res = await authFetch(`${API}/admin/users/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (_admUsersById[id]) _admUsersById[id].status = status;
    const me = JSON.parse(localStorage.getItem('auth_user') || '{}');
    document.getElementById('adm-users').innerHTML = buildUserTable(_admAllUsers, me);
    // Re-abre o modal com dados atualizados
    openUserEditModal(id);
    showAdmuMsg('Status atualizado.', 'ok');
  } catch (err) { showAdmuMsg(err.message, 'err'); }
}

async function admResetSenhaFromModal() {
  const id = _editingUserId; if (!id) return;
  const u = _admUsersById[id];
  if (!confirm(`Redefinir a senha de "${u?.nome}"?\n\nA senha temporária será a matrícula do usuário.\nEle será obrigado a criar uma nova senha no próximo login.`)) return;
  try {
    const res  = await authFetch(`${API}/admin/users/${id}/reset-senha`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showAdmuMsg(`Senha redefinida. Temporária: matrícula ${data.matricula}`, 'ok');
  } catch (err) { showAdmuMsg(err.message, 'err'); }
}

async function admDeleteFromModal() {
  const id = _editingUserId; if (!id) return;
  const u = _admUsersById[id];
  if (!confirm(`Excluir definitivamente "${u?.nome}"? Esta ação não pode ser desfeita.`)) return;
  try {
    const res = await authFetch(`${API}/admin/users/${id}`, { method: 'DELETE' });
    if (!res.ok) { showAdmuMsg((await res.json()).error || 'Erro ao excluir.', 'err'); return; }
    closeUserEditModal();
    openAdminModal();
  } catch (err) { showAdmuMsg('Erro de conexão.', 'err'); }
}

async function admAction(id, status) {
  try {
    const res = await authFetch(`${API}/admin/users/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await openAdminModal();
  } catch (err) { showAdmMsg(err.message, 'err'); }
}

function showAdmMsg(text, type) {
  const el = document.getElementById('adm-msg');
  el.textContent = text;
  el.style.cssText = type === 'ok'
    ? 'display:block;padding:10px 14px;border-radius:6px;font-size:13px;background:rgba(61,191,122,.1);border:1px solid rgba(61,191,122,.25);color:#5ae09a;margin-top:14px'
    : 'display:block;padding:10px 14px;border-radius:6px;font-size:13px;background:rgba(230,100,100,.1);border:1px solid rgba(230,100,100,.25);color:#f07878;margin-top:14px';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function showAdmuMsg(text, type) {
  const el = document.getElementById('admu-msg');
  el.textContent = text;
  el.style.color = type === 'ok' ? '#5ae09a' : '#f07878';
  setTimeout(() => { el.textContent = ''; }, 4000);
}

// Paleta de cores por crime (mesma ordem da API)
const PAL = ['#e05555','#bf7a3d','#c8a84b','#3d7abf','#e8c96a','#3dbf7a','#7a4bbf'];

// Crimes agrupados num único card na visão geral
const CRIME_GROUPS = [
  { label: 'Roubo / Furto Veículos', crimes: ['Roubo de Veículos', 'Furto de Veículos'], color: '#5a9de0' }
];
const GR  = { color: 'rgba(255,255,255,.08)' };

// Paleta padrão por CIA — 1ª Rosa · 2ª Verde · 3ª Azul · FT Amarelo · Total Branco
const CIA_COR = { '1': '#e05a8a', '2': '#4bc87a', '3': '#5a9de0', 'ft': '#c8a84b', 'total': '#f4f6fc' };
function ciaCorByName(name) {
  const n = (name||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  if (/\bft\b|forca|tatica/.test(n)) return CIA_COR.ft;
  const d = n.match(/(\d)/);
  return d ? (CIA_COR[d[1]] || '#aaaaaa') : '#aaaaaa';
}

// Cores fixas por CIA (extraída pelo número)
const CIA_COLORS = { '1': '#e05a8a', '2': '#4bc87a', '3': '#5a9de0', 'ft': '#c8a84b' };
function ciaColor(mun) {
  const key = normCiaKey(munCia(mun));
  return CIA_COLORS[key] || '#808080';
}

// Plugin Chart.js: desenha linha pontilhada vertical e label de CIA entre grupos de municípios
// Usado nos gráficos de barra que agrupam cidades por CIA no eixo X
// ⚠ Depende da ordem de MUNS[] — sempre reflete a agrupação CIA_STRUCT
function ciaSepPlugin(muns) {
  // Inclui a 1ª CIA (idx=0) e todas as mudanças seguintes
  const seps = [];
  let prevCia = null;
  muns.forEach((mun, i) => {
    const cia = munCia(mun);
    if (cia !== prevCia) { seps.push({ idx: i, name: cia }); prevCia = cia; }
  });
  return {
    id: 'ciaSep',
    afterDraw(chart) {
      if (!seps.length) return;
      const { ctx, chartArea } = chart;
      const n = muns.length;
      const w = (chartArea.right - chartArea.left) / n;
      seps.forEach(({ idx, name }, si) => {
        const x = chartArea.left + w * idx;
        const nextIdx = si + 1 < seps.length ? seps[si + 1].idx : n;
        const xCenter = chartArea.left + w * (idx + nextIdx) / 2;
        ctx.save();
        // Linha pontilhada (não desenha na posição 0 — borda já existe)
        if (idx > 0) {
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 19px "DM Mono", monospace';
        ctx.textAlign = 'center';
        // posiciona abaixo dos nomes das cidades (eixo X), na área de padding inferior
        ctx.fillText(name.toUpperCase(), xCenter, chart.height - 10);
        ctx.restore();
      });
    }
  };
}

// Ordem canônica dos meses
const MES_ORD = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MES_ABREV = { Janeiro:'JAN', Fevereiro:'FEV', Março:'MAR', Abril:'ABR', Maio:'MAI', Junho:'JUN', Julho:'JUL', Agosto:'AGO', Setembro:'SET', Outubro:'OUT', Novembro:'NOV', Dezembro:'DEZ' };

// Estado global preenchido após o fetch inicial
let RAW      = [];
let CRIMES   = [];
let MESES    = [];
let MUNS     = [];
let CIAS     = [];
let ANOS     = [];

let selMeses = [];
let selAno   = null;
let hmMeses  = [];
let charts   = {};

// Indicadores de Qualidade P3
let iqData = [];
let iqCharts = [];
let iqCalculadoData = [];
let iqHistCharts = [];
let iqProdFiltro = ''; // '' = todas; key = apenas essa
let iqCrimeFiltro = ''; // '' = todas; key = apenas essa
const IQ_PRAZO_DIA = 10;

// Dados históricos anuais 2021-2024
const IQ_HISTORICO_ANOS = [2021, 2022, 2023, 2024];
const IQ_HISTORICO = {
  homicidio_doloso:       { 2021: 0.0864, 2022: 0.074, 2023: 0.054, 2024: 0.049 },
  latrocinio:             { 2021: 0,     2022: 0,     2023: 0,     2024: 0     },
  roubo_outros:           { 2021: 0.842, 2022: 0.844, 2023: 0.743, 2024: 0.629 },
  roubo_veiculo:          { 2021: 0.31,  2022: 0.283, 2023: 0.314, 2024: 0.225 },
  furto_veiculo:          { 2021: 0.706, 2022: 0.707, 2023: 0.77,  2024: 0.754 },
  armas_apreendidas:      { 2021: 0.44,  2022: 0.23,  2023: 0.36,  2024: 0.36  },
  flagrantes_pm:          { 2021: 1.86,  2022: 1.75,  2023: 2.23,  2024: 2.46  },
  pessoas_presas:         { 2021: 2.09,  2022: 1.94,  2023: 2.42,  2024: 3.99  },
  menores_presos:         { 2021: 0.09,  2022: 0.06,  2023: 0.07,  2024: 0.14  },
  procurados:             { 2021: 1.36,  2022: 1.31,  2023: 1.85,  2024: 1.96  },
  disque_denuncia:        { 2021: 1.94,  2022: 1.59,  2023: 2.56,  2024: 3.69  },
  tempo_resposta_urgente: { 2021: 0.65,  2022: 0.72,  2023: 0.63,  2024: 1.66  },
  cursos_concluidos:      { 2021: 34.52, 2022: 15.36, 2023: 18.87, 2024: 24.35 },
};

// Indicadores automáticos (calculados do banco ou histórico fixo)
// fatorInv: multiplicador para reverter o resultado histórico ao valor bruto
//   per100k → × (44539225/100000)   | perPM → × 345   | null → mostrar como está
const IQ_POP_SEADE = 44539225;
const IQ_EFETIVO_HIST = 345;
const IQ_AUTO_CAMPOS = [
  { key: 'homicidio_doloso',       label: 'Homicídio Doloso',        unit: 'ocorr.', cor: '#e8b840', melhor: 'menor', auto: true,  fatorInv: IQ_POP_SEADE / 100000 },
  { key: 'latrocinio',             label: 'Latrocínio',              unit: 'ocorr.', cor: '#ff8c42', melhor: 'menor', auto: true,  fatorInv: IQ_POP_SEADE / 100000 },
  { key: 'roubo_outros',           label: 'Roubo Outros',            unit: 'ocorr.', cor: '#f7d060', melhor: 'menor', auto: true,  fatorInv: IQ_POP_SEADE / 100000 },
  { key: 'roubo_veiculo',          label: 'Roubo de Veículos',       unit: 'ocorr.', cor: '#9b6de0', melhor: 'menor', auto: true,  fatorInv: IQ_POP_SEADE / 100000 },
  { key: 'furto_veiculo',          label: 'Furto de Veículos',       unit: 'ocorr.', cor: '#5a9de0', melhor: 'menor', auto: true,  fatorInv: IQ_POP_SEADE / 100000 },
  { key: 'armas_apreendidas',      label: 'Armas Apreendidas',       unit: 'unid.',  cor: '#5a9de0', melhor: 'maior', auto: true,  fatorInv: IQ_EFETIVO_HIST },
  { key: 'flagrantes_pm',          label: 'Flagrantes',              unit: 'ocorr.', cor: '#5ae09a', melhor: 'maior', auto: true,  fatorInv: IQ_EFETIVO_HIST },
  { key: 'pessoas_presas',         label: 'Pessoas Presas',          unit: 'pess.',  cor: '#e08a5a', melhor: 'maior', auto: true,  fatorInv: IQ_EFETIVO_HIST },
  { key: 'menores_presos',         label: 'Menores Presos',          unit: 'pess.',  cor: '#c84b9e', melhor: 'maior', auto: true,  fatorInv: IQ_EFETIVO_HIST },
  { key: 'procurados',             label: 'Procurados',              unit: 'pess.',  cor: '#f7d060', melhor: 'maior', auto: true,  fatorInv: IQ_EFETIVO_HIST },
  { key: 'cursos_concluidos',      label: 'Cursos Concluídos',       unit: 'PMs',   cor: '#c8a84b', melhor: 'maior', auto: false, fatorInv: IQ_EFETIVO_HIST / 100 },
];
const IQ_CAMPOS = [
  { key: 'cursos_pm',          label: 'PMs em Cursos Institucionais', unit: '',    cor: '#9de05a' },
  { key: 'atendimento_vitima', label: 'Atend. Vítimas de Roubo',      unit: '',    cor: '#e8b840' },
  { key: 'conseg_ativo',       label: 'CONSEGs Ativos',               unit: '',    cor: '#e0c05a' },
  { key: 'bairros_pvs',        label: 'Bairros PVS',                  unit: '',    cor: '#5ae09a' },
];
let moCh     = [];
let moCrime  = '';
let moColor  = '';
let moMeses  = [];
let moScopeType = 'btl';
let moScopeVal  = null;

// ═══════════════════════════════════════════════════════════════
// HISTÓRICO DE ACESSOS (somente admin)
// ═══════════════════════════════════════════════════════════════
let _logsAll = [];

function closeLogsModal() { document.getElementById('logs-mo').style.display = 'none'; }

async function openAdminModalWithLogs() {
  const me = JSON.parse(localStorage.getItem('auth_user') || '{}');
  const btn = document.getElementById('adm-btn-logs');
  if (btn) btn.style.display = me.role === 'admin' ? 'inline-block' : 'none';
}

async function openLogsModal() {
  document.getElementById('logs-mo').style.display = 'block';
  document.getElementById('logs-search').value = '';
  document.getElementById('logs-tipo').value = '';
  await loadLogs();
}

async function loadLogs() {
  const el = document.getElementById('logs-table');
  el.innerHTML = '<div style="color:var(--tx3);font-size:13px;padding:10px 0">Carregando...</div>';
  try {
    const data = await authFetch(`${API}/logs/acesso?limit=1000`).then(r => r.json());
    if (!Array.isArray(data)) throw new Error(data?.error || 'Erro ao carregar logs');
    _logsAll = data;
    logsFilter();
  } catch (err) {
    el.innerHTML = `<div style="color:#f07878;font-size:13px">${escHtml(err.message)}</div>`;
  }
}

function logsFilter() {
  const q = (document.getElementById('logs-search').value || '').toLowerCase().trim();
  const tipo = (document.getElementById('logs-tipo').value || '').trim();
  let rows = _logsAll;
  if (q) rows = rows.filter(r =>
    (r.usuario_nome || '').toLowerCase().includes(q) ||
    (r.matricula    || '').toLowerCase().includes(q) ||
    (r.acao         || '').toLowerCase().includes(q) ||
    (r.detalhe      || '').toLowerCase().includes(q) ||
    (r.ip           || '').toLowerCase().includes(q)
  );
  if (tipo) rows = rows.filter(r => (r.acao || '').startsWith(tipo));
  document.getElementById('logs-count').textContent = `${rows.length} registro(s)`;
  document.getElementById('logs-table').innerHTML = buildLogsTable(rows);
}

const ACAO_LABEL = {
  login:                   { label: 'Login',             cor: '#5ae09a' },
  login_falhou:            { label: 'Login falhou',      cor: '#f07878' },
  logout:                  { label: 'Logout',            cor: '#5a9de0' },
  upload_efetivo:          { label: 'Upload Efetivo',    cor: '#c8a84b' },
  upload_afastamentos:     { label: 'Upload Afastamentos', cor: '#c8a84b' },
  upload_uis:              { label: 'Upload UIS',        cor: '#c8a84b' },
  upload_ias:              { label: 'Upload IAS',        cor: '#c8a84b' },
  upload_rac_pm:           { label: 'Upload RAC PM',     cor: '#c8a84b' },
  upload_infocrim:         { label: 'Upload InfoCrim',   cor: '#c8a84b' },
  upload_produtividade:    { label: 'Upload Produtividade', cor: '#c8a84b' },
  upload_pvs:              { label: 'Upload PVS',        cor: '#c8a84b' },
  upload_cursos:           { label: 'Upload Cursos',     cor: '#c8a84b' },
  admin_usuario_editado:   { label: 'Usuário editado',   cor: '#9b59b6' },
  admin_usuario_excluido:  { label: 'Usuário excluído',  cor: '#f07878' },
  admin_reset_senha:       { label: 'Reset senha',       cor: '#9b59b6' },
  admin_posto_editado:     { label: 'Posto editado',     cor: '#9b59b6' },
  upload_quadro:           { label: 'Upload Quadro',     cor: '#c8a84b' },
  indicadores_p3_salvo:    { label: 'Indicadores P3',   cor: '#4bc87a' },
};

function _acaoBadge(acao) {
  if (acao.startsWith('secao_')) return `<span style="padding:2px 8px;border-radius:10px;font-size:10px;background:rgba(90,158,224,.15);color:#5a9de0;font-family:'DM Mono',monospace">Seção: ${acao.slice(6)}</span>`;
  if (acao.startsWith('pagina_p3_')) return `<span style="padding:2px 8px;border-radius:10px;font-size:10px;background:rgba(90,224,154,.1);color:#5ae09a;font-family:'DM Mono',monospace">Página: ${acao.slice(10)}</span>`;
  const info = ACAO_LABEL[acao];
  if (info) return `<span style="padding:2px 8px;border-radius:10px;font-size:10px;background:${info.cor}22;color:${info.cor};font-family:'DM Mono',monospace">${info.label}</span>`;
  return `<span style="padding:2px 8px;border-radius:10px;font-size:10px;background:rgba(255,255,255,.06);color:var(--tx3);font-family:'DM Mono',monospace">${escHtml(acao)}</span>`;
}

function buildLogsTable(rows) {
  if (!rows.length) return '<div style="color:var(--tx3);font-size:13px;padding:6px 0">Nenhum registro.</div>';
  const thS = 'text-align:left;padding:9px 8px;border-bottom:1px solid var(--bd);font-family:"DM Mono",monospace;font-size:10px;color:var(--tx3);letter-spacing:1px;white-space:nowrap';
  const tdS = 'padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.03);font-size:12px;vertical-align:top';
  let h = `<table style="width:100%;border-collapse:collapse">
    <thead><tr>
      <th style="${thS}">DATA / HORA</th>
      <th style="${thS}">USUÁRIO</th>
      <th style="${thS}">RE</th>
      <th style="${thS}">ROLE</th>
      <th style="${thS}">AÇÃO</th>
      <th style="${thS}">DETALHE</th>
      <th style="${thS}">IP</th>
    </tr></thead><tbody>`;
  rows.forEach(r => {
    const dt = r.created_at ? new Date(r.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '—';
    h += `<tr>
      <td style="${tdS};font-family:'DM Mono',monospace;font-size:11px;color:var(--tx3);white-space:nowrap">${escHtml(dt)}</td>
      <td style="${tdS};color:#d8dce8;font-weight:500">${escHtml(r.usuario_nome || '—')}</td>
      <td style="${tdS};font-family:'DM Mono',monospace;font-size:11px;color:var(--tx3)">${escHtml(r.matricula || '—')}</td>
      <td style="${tdS};font-family:'DM Mono',monospace;font-size:11px;color:var(--tx3)">${escHtml(r.role || '—')}</td>
      <td style="${tdS}">${_acaoBadge(r.acao || '')}</td>
      <td style="${tdS};color:var(--tx3);font-size:11px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(r.detalhe||'')}">${escHtml(r.detalhe || '—')}</td>
      <td style="${tdS};font-family:'DM Mono',monospace;font-size:10px;color:var(--tx3)">${escHtml(r.ip || '—')}</td>
    </tr>`;
  });
  h += '</tbody></table>';
  return h;
}

