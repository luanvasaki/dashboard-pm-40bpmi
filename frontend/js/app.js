/**
 * app.js — Frontend do Dashboard 40 BPM/I
 * Busca os dados via API REST (backend Node.js + Supabase).
 */

const API = `${window.location.origin}/api`;

// flag: indica se fonte_texto foi carregado do banco (impede updateSyncStatus de sobrescrever)
let _fonteFromConfig = false;

// ---------------------------------------------------------------------------
// Segurança — escape HTML para evitar XSS em innerHTML
// ---------------------------------------------------------------------------
function escHtml(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Helpers globais reutilizáveis
// ---------------------------------------------------------------------------
function currentRole() {
  try { return JSON.parse(localStorage.getItem('auth_user') || '{}').role || ''; } catch { return ''; }
}
const isFer      = t => /f[eé]rias/i.test(t || '');
const fmtDateBR  = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

// ---------------------------------------------------------------------------
// Autenticação — helpers
// ---------------------------------------------------------------------------
function authFetch(url, options = {}) {
  options.credentials = 'same-origin';
  return fetch(url, options).then(r => {
    if (r.status === 401) {
      localStorage.removeItem('auth_user');
      window.location.replace('/login.html');
      throw new Error('Sessão expirada');
    }
    return r;
  });
}

async function doLogout() {
  try { await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'same-origin' }); } catch (_) {}
  localStorage.removeItem('auth_user');
  window.location.replace('/login.html');
}

function toggleSidebar() {
  const aside = document.querySelector('aside');
  const overlay = document.querySelector('.sidebar-overlay');
  const open = aside.classList.toggle('open');
  overlay.style.display = open ? 'block' : 'none';
}

function toggleSidebarCollapse() {
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0');
  const icon = document.getElementById('sb-toggle-icon');
  if (icon) icon.setAttribute('points', collapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6');
}

(function initSidebarCollapse() {
  if (localStorage.getItem('sidebar_collapsed') === '1') {
    document.body.classList.add('sidebar-collapsed');
    const icon = document.getElementById('sb-toggle-icon');
    if (icon) icon.setAttribute('points', '9 18 15 12 9 6');
  }
})();

function initUserBlock() {
  try {
    const u = JSON.parse(localStorage.getItem('auth_user') || '{}');
    const ROLE_LABEL = { ti: 'T.I. / Programador', comandante: 'Cmt Batalhão', comandante_cia: 'Cmt de Cia', p1: 'Seção P1', p3: 'Seção P3', viewer: 'Visualizador' };
    document.getElementById('user-nome').textContent = u.nome || '—';
    document.getElementById('user-info').textContent = `${u.secao || '—'} · ${ROLE_LABEL[u.role] || u.role || '—'}`;
    if (['admin', 'p3', 'ti'].includes(u.role)) {
      document.getElementById('btn-admin').style.display = 'block';
      checkPendingUsers();
      // Botões de edição do cabeçalho P3 — visíveis só para admin/p3
      const btnEdit = document.getElementById('btn-edit-periodo');
      if (btnEdit) btnEdit.style.display = 'inline-block';
      const btnFonte = document.getElementById('btn-edit-fonte');
      if (btnFonte) btnFonte.style.display = 'inline-block';
    }
    if (['p1', 'ti'].includes(u.role)) {
      // Botão de edição de 'Última Atualização' do P1 — visível só para p1/ti
      const btnP1Per = document.getElementById('btn-p1-edit-periodo');
      if (btnP1Per) btnP1Per.style.display = 'inline-block';
    }
    loadDashboardConfig();
  } catch (_) {}
}

async function loadDashboardConfig() {
  try {
    const res = await authFetch(`${API}/config`);
    if (!res.ok) return;
    const cfg = await res.json();
    // P3
    if (cfg.periodo_texto) {
      const lbl = document.getElementById('lbl-p3-periodo');
      const inp = document.getElementById('inp-p3-periodo');
      if (lbl) lbl.textContent = cfg.periodo_texto;
      if (inp) inp.value = cfg.periodo_texto;
    }
    if (cfg.fonte_texto) {
      const lbl = document.getElementById('lbl-fonte');
      const inp = document.getElementById('inp-fonte');
      if (lbl) lbl.textContent = cfg.fonte_texto;
      if (inp) inp.value = cfg.fonte_texto;
      _fonteFromConfig = true;
    }
    // P1
    if (cfg.p1_periodo) {
      const lbl = document.getElementById('lbl-p1-periodo');
      const inp = document.getElementById('inp-p1-periodo');
      if (lbl) lbl.textContent = cfg.p1_periodo;
      if (inp) inp.value = cfg.p1_periodo;
    }
    if (cfg.last_upload) {
      const el = document.getElementById('sync-time');
      if (el) el.textContent = new Date(cfg.last_upload).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
  } catch (_) {}
}

async function saveConfig(chave, valor) {
  try {
    await authFetch(`${API}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave, valor })
    });
  } catch (_) {}
}

async function registraUpload() {
  const ts = new Date().toISOString();
  await saveConfig('last_upload', ts);
  const el = document.getElementById('sync-time');
  if (el) el.textContent = new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toggleEditPeriodo() {
  const inp  = document.getElementById('inp-p3-periodo');
  const lbl  = document.getElementById('lbl-p3-periodo');
  const btn  = document.getElementById('btn-edit-periodo');
  const open = inp.style.display === 'none' || inp.style.display === '';
  inp.style.display = open ? 'inline-block' : 'none';
  lbl.style.display = open ? 'none' : 'inline-block';
  btn.textContent   = open ? '✔ Salvar' : '✎ Editar';
  if (!open) {
    const val = inp.value.trim();
    lbl.textContent = val || '—';
    saveConfig('periodo_texto', val);
  }
}

function savePeriodo(val) {
  const lbl = document.getElementById('lbl-p3-periodo');
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
    lbl.textContent = val || '—';
    saveConfig('fonte_texto', val);
  }
}

function saveFonte(val) {
  const lbl = document.getElementById('lbl-fonte');
  if (lbl) lbl.textContent = val || '—';
}

function toggleEditP1Periodo() {
  const inp = document.getElementById('inp-p1-periodo');
  const lbl = document.getElementById('lbl-p1-periodo');
  const btn = document.getElementById('btn-p1-edit-periodo');
  const open = inp.style.display === 'none' || inp.style.display === '';
  inp.style.display = open ? 'inline-block' : 'none';
  lbl.style.display = open ? 'none' : 'inline-block';
  btn.textContent   = open ? '✔ Salvar' : '✎ Editar';
  if (!open) {
    const val = inp.value.trim();
    lbl.textContent = val || '—';
    saveConfig('p1_periodo', val);
  }
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
  document.getElementById('adm-users').innerHTML = '<div style="color:var(--tx3);font-size:19px;padding:10px 0">Carregando...</div>';
  document.getElementById('adm-pending').innerHTML = '';
  document.getElementById('adm-pending-section').style.display = 'none';

  try {
    const data = await authFetch(`${API}/admin/users`).then(r => r.json());
    if (!Array.isArray(data)) throw new Error(data?.error || 'Resposta inesperada da API.');
    renderAdminUsers(data);
  } catch (err) {
    document.getElementById('adm-users').innerHTML = `<div style="color:#f07878;font-size:19px">${err.message}</div>`;
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
  if (!users.length) return '<div style="color:var(--tx3);font-size:19px;padding:6px 0">Nenhum registro.</div>';
  const ROLE_LABEL = { ti: 'T.I.', comandante: 'Cmt Batalhão', comandante_cia: 'Cmt de Cia', p1: 'P1', p3: 'P3', viewer: 'Visualizador' };
  const STATUS_STYLE = {
    pending:  'background:rgba(200,168,75,.15);color:#e8c96a',
    approved: 'background:rgba(61,191,122,.1);color:#5ae09a',
    rejected: 'background:rgba(230,100,100,.1);color:#f07878'
  };
  const STATUS_LABEL = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Recusado' };

  let h = `<table style="width:100%;border-collapse:collapse;font-size:19px">
    <thead><tr>
      <th style="text-align:left;padding:9px 8px;border-bottom:1px solid var(--bd);font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px">NOME</th>
      <th style="text-align:left;padding:9px 8px;border-bottom:1px solid var(--bd);font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px">POSTO/GRAD.</th>
      <th style="text-align:left;padding:9px 8px;border-bottom:1px solid var(--bd);font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px">RE</th>
      <th style="text-align:left;padding:9px 8px;border-bottom:1px solid var(--bd);font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px">FUNÇÃO</th>
      <th style="text-align:left;padding:9px 8px;border-bottom:1px solid var(--bd);font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px">STATUS</th>
      <th style="text-align:left;padding:9px 8px;border-bottom:1px solid var(--bd);font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px">NÍVEL</th>
      <th style="padding:9px 8px;border-bottom:1px solid var(--bd)"></th>
    </tr></thead><tbody>`;

  const SECAO_OPTS = ['Comandante de Batalhão','Subcomandante de Batalhão','CoordOp','Comandante de Cia','CFP','Sargentante','P1','P2','P3','P4','P5','P1 de Cia','P3 de Cia','P4 de Cia','P5 de Cia','CGP','1ª Cia Operacional','2ª Cia Operacional','3ª Cia Operacional','Força Tatica Operacional'];

  users.forEach(u => {
    const sStyle = STATUS_STYLE[u.status] || '';
    const canEditRole  = ['admin', 'p3', 'ti'].includes(me.role);
    const canEditPosto = ['admin', 'p1', 'p3', 'ti'].includes(me.role);
    const editableRoles = ['viewer','p1','p3','ti'];
    const roleOpts = canEditRole
      ? editableRoles.map(r =>
          `<option value="${r}" ${u.role===r?'selected':''}>${ROLE_LABEL[r]||r}</option>`).join('')
      : `<option>${ROLE_LABEL[u.role]||u.role}</option>`;
    const secaoOpts = canEditRole
      ? SECAO_OPTS.map(s => `<option value="${s}" ${u.secao===s?'selected':''}>${s}</option>`).join('')
      : `<option>${u.secao}</option>`;

    let actions = '';
    if (u.status === 'pending') {
      actions = `<button onclick="admAction('${u.id}','approved')" style="padding:5px 12px;background:rgba(61,191,122,.15);border:1px solid rgba(61,191,122,.3);color:#5ae09a;border-radius:4px;cursor:pointer;font-size:19px;margin-right:4px">✓ Aprovar</button>
                 <button onclick="admAction('${u.id}','rejected')" style="padding:5px 12px;background:rgba(230,100,100,.1);border:1px solid rgba(230,100,100,.25);color:#f07878;border-radius:4px;cursor:pointer;font-size:19px">✕ Recusar</button>`;
    } else if (u.status === 'approved') {
      actions = `<button onclick="admAction('${u.id}','approved')" style="display:none"></button>
                 <button onclick="admAction('${u.id}','rejected')" style="padding:5px 12px;background:rgba(230,100,100,.08);border:1px solid rgba(230,100,100,.2);color:#f07878;border-radius:4px;cursor:pointer;font-size:19px">Revogar</button>
                 <button data-uid="${escHtml(u.id)}" data-unome="${escHtml(u.nome)}" onclick="admResetSenha(this.dataset.uid,this.dataset.unome)" style="padding:5px 12px;background:rgba(200,168,75,.08);border:1px solid rgba(200,168,75,.25);color:#e8c96a;border-radius:4px;cursor:pointer;font-size:19px;margin-left:4px" title="Senha temporária = matrícula do usuário">🔑 Redefinir Senha</button>`;
    } else {
      actions = `<button onclick="admAction('${u.id}','approved')" style="padding:5px 12px;background:rgba(61,191,122,.1);border:1px solid rgba(61,191,122,.25);color:#5ae09a;border-radius:4px;cursor:pointer;font-size:19px">Reativar</button>`;
    }

    h += `<tr>
      <td style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.03);color:#d8dce8">${escHtml(u.nome)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.03)">
        ${canEditPosto
          ? `<select onchange="admChangePosto('${u.id}',this.value)" style="background:#121620;border:1px solid #252d40;color:#d8dce8;padding:4px 8px;border-radius:4px;font-size:19px;cursor:pointer">
              ${ ['Sd PM','Cb PM','3º Sgt PM','2º Sgt PM','1º Sgt PM','Subten PM','Asp Of PM','2º Ten PM','1º Ten PM','Cap PM','Maj PM','Ten Cel PM','Cel PM']
                .map(p => `<option value="${p}" ${(u.posto||'')=== p?'selected':''}>${p}</option>`).join('') }
            </select>`
          : `<span style="color:var(--tx3)">${u.posto||'—'}</span>`}
      </td>
      <td style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.03);font-family:'DM Mono',monospace;color:var(--tx3)">${escHtml(u.matricula)}</td>
      <td style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.03)">
        <select onchange="admChangeSecao('${u.id}',this.value)" ${!canEditRole?'disabled':''} style="background:#121620;border:1px solid #252d40;color:#d8dce8;padding:4px 8px;border-radius:4px;font-size:19px;cursor:pointer;${!canEditRole?'opacity:.6':''}">${secaoOpts}</select>
      </td>
      <td style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.03)"><span style="padding:3px 10px;border-radius:20px;font-family:'DM Mono',monospace;font-size:19px;${sStyle}">${STATUS_LABEL[u.status]||u.status}</span></td>
      <td style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.03)">
        <select onchange="admChangeRole('${u.id}',this.value)" ${!canEditRole?'disabled':''} style="background:#121620;border:1px solid #252d40;color:#d8dce8;padding:4px 8px;border-radius:4px;font-size:19px;cursor:pointer;${!canEditRole?'opacity:.6':''}">${roleOpts}</select>
      </td>
      <td style="padding:8px 8px;border-bottom:1px solid rgba(255,255,255,.03);white-space:nowrap">
        ${actions}
        <button data-uid="${escHtml(u.id)}" data-unome="${escHtml(u.nome)}" onclick="admDelete(this.dataset.uid,this.dataset.unome)" style="padding:5px 10px;background:transparent;border:1px solid rgba(230,100,100,.2);color:var(--tx3);border-radius:4px;cursor:pointer;font-size:19px;margin-left:4px" title="Excluir usuário">🗑</button>
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

async function admChangePosto(id, posto) {
  if (!posto || !posto.trim()) return;
  try {
    const res = await authFetch(`${API}/admin/users/${id}/posto`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posto })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showAdmMsg('Posto/Grad atualizado.', 'ok');
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
    ? 'display:block;padding:12px 14px;border-radius:6px;font-size:19px;background:rgba(61,191,122,.1);border:1px solid rgba(61,191,122,.25);color:#5ae09a;margin-top:14px'
    : 'display:block;padding:12px 14px;border-radius:6px;font-size:19px;background:rgba(230,100,100,.1);border:1px solid rgba(230,100,100,.25);color:#f07878;margin-top:14px';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// Paleta de cores por crime (mesma ordem da API)
const PAL = ['#e05555','#bf7a3d','#c8a84b','#3d7abf','#e8c96a','#3dbf7a','#7a4bbf'];

// Crimes agrupados num único card na visão geral
const CRIME_GROUPS = [
  { label: 'Roubo / Furto Veículos', crimes: ['Roubo de Veículos', 'Furto de Veículos'], color: '#5a9de0' }
];
const GR  = { color: 'rgba(255,255,255,.04)' };

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

// Plugin inline Chart.js: linha pontilhada + label de CIA entre grupos (para gráficos de barra com municípios no eixo X)
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

// ---------------------------------------------------------------------------
// Utilitários (idênticos ao original)
// ---------------------------------------------------------------------------

const q    = f => RAW.filter(r => (!selAno || r.ano === selAno) && Object.entries(f).every(([k,v]) => Array.isArray(v) ? v.includes(r[k]) : r[k] === v));
const sf   = (arr, field = 'avaliado') => arr.reduce((s, r) => s + (r[field] || 0), 0);
const pLbl = m => m.length === MESES.length ? 'Todos os meses' : m.join(' + ');
const hcol = (aval, meta, ant) => {
  if (aval === 0) return 'rgba(74,158,232,.10)';
  if (meta === 0) return aval <= ant ? 'rgba(191,122,61,.85)' : 'rgba(230,100,100,.80)';
  if (aval <= meta) return 'rgba(61,191,122,.70)';   // verde: dentro da meta
  if (aval <= ant)  return 'rgba(191,122,61,.85)';   // laranja: acima da meta, melhor que anterior
  return 'rgba(230,100,100,.80)';                       // vermelho: acima da meta
};
const mk  = (id, cfg) => { if (charts[id]) charts[id].destroy(); charts[id] = new Chart(document.getElementById(id), cfg); };
const cl  = c => c === 'Homicídio' ? 'Vítimas de Letalidade Violenta' : c.replace(' Vulnerável', ' Vuln.').replace(' Veículos', ' Veíc.');

// ---------------------------------------------------------------------------
// Inicialização — busca dados da API
// ---------------------------------------------------------------------------

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

async function forceSync() {
  const btn = document.getElementById('sync-btn');
  if (btn) { btn.textContent = '↻ Sincronizando...'; btn.disabled = true; }
  try {
    await authFetch(`${API}/sync`);
    await loadData();
    selAno   = ANOS[0] || new Date().getFullYear();
    MESES    = getMesForAno(selAno);
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
        <div style="font-size:19px;color:var(--tx3);max-width:480px">Não foi possível conectar à API. Verifique sua conexão com a internet e tente novamente.</div>
        <button onclick="location.reload()" style="margin-top:8px;padding:12px 28px;background:rgba(61,122,191,.15);border:1px solid rgba(61,122,191,.3);color:#5a9de0;border-radius:6px;cursor:pointer;font-size:19px;font-weight:600">↻ Tentar novamente</button>
      </div>`;
    return;
  }

  // Etapa 2: inicializar e renderizar (erros aqui não bloqueiam a página)
  try {
    selAno   = ANOS[0] || new Date().getFullYear();
    MESES    = getMesForAno(selAno);
    selMeses = [...MESES];
    hmMeses  = [...MESES];

    Chart.defaults.color       = '#e0ecf8';
    Chart.defaults.borderColor = '#1c2235';
    Chart.defaults.font.family = "'DM Mono', monospace";
    Chart.defaults.font.size   = 19;

    buildSbMes();
    buildHmFilter();
    buildPageFilters();
    renderAll();
    updateSyncStatus();
    renderHome();
    loadP1(); // carrega dados P1 em background para exibir resumo na home
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.error('Erro ao renderizar dashboard:', err);
  }
}

// ---------------------------------------------------------------------------
// Sidebar de meses
// ---------------------------------------------------------------------------

function buildSbMes() {
  const pf = pageFilters.visao;

  // Linha 1: Período + ANO + meses
  let row1 = `<div class="pf-row">`;
  row1 += `<span class="pf-label">Período</span>`;
  row1 += `<div class="pf-field"><span class="pf-label">ANO</span><select class="pf-select pf-ano-sel" onchange="sbSetAno(this.value ? parseInt(this.value) : null)">`;
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
  row2 += `<div class="pf-field"><span class="pf-label">CIA</span><select class="pf-select" id="sb-cia-sel" onchange="sbSetScope('cia',this.value)">`;
  row2 += `<option value="">Todas</option>`;
  CIAS.forEach(c => row2 += `<option value="${c}" ${pf.type==='cia'&&pf.value===c?'selected':''}>${c}</option>`);
  row2 += `</select></div>`;
  row2 += `<div class="pf-field"><span class="pf-label">Cidade</span><select class="pf-select" id="sb-mun-sel" onchange="sbSetScope('mun',this.value)">`;
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

// ---------------------------------------------------------------------------
// Render geral
// ---------------------------------------------------------------------------

function renderAll() {
  const p = pLbl(selMeses);
  ['lbl-p2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = p;
  });
  // Período da Visão Geral: atualiza label do cabeçalho se não houver texto salvo no banco
  const lblP3Per = document.getElementById('lbl-p3-periodo');
  if (lblP3Per && lblP3Per.textContent === '—') lblP3Per.textContent = p;
  document.getElementById('metas-badge').textContent = p;
  renderKPIs();
  renderVisao();
  renderMetas();
  renderHeatmap();
  renderEvolucao();
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

function renderKPIs() {
  const sc = scope('visao');
  const groupedCrimes = CRIME_GROUPS.flatMap(g => g.crimes);
  let html = '';

  // Cards individuais (pula os que fazem parte de um grupo)
  CRIMES.forEach((c, i) => {
    if (groupedCrimes.includes(c)) return;
    const aval = sf(q({ crime: c, mes: selMeses, ...sc }));
    const ant  = sf(q({ crime: c, mes: selMeses, ...sc }), 'anterior');
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
    const aval = sf(q({ crime: g.crimes, mes: selMeses, ...sc }));
    const ant  = sf(q({ crime: g.crimes, mes: selMeses, ...sc }), 'anterior');
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
  renderVisaoHeatmap();
  renderInsights();

  // Desvio vs Meta: ((avaliado - meta) / meta) * 100
  // Verde  → avaliado ≤ meta  |  Laranja → acima mas melhorando  |  Vermelho → acima e piorando
  const groupedCrimes = CRIME_GROUPS.flatMap(g => g.crimes);
  const vmEntries = [
    ...CRIMES.filter(c => !groupedCrimes.includes(c)).map(c => ({ label: cl(c), crimes: [c] })),
    ...CRIME_GROUPS.map(g => ({ label: g.label, crimes: g.crimes }))
  ];
  const vmDetails = vmEntries.map(({ crimes: cs }) => {
    const aval  = cs.reduce((s,c) => s + sf(q({ crime: c, mes: selMeses, ...sc })), 0);
    const meta  = cs.reduce((s,c) => s + sf(q({ crime: c, mes: selMeses, ...sc }), 'meta'), 0);
    const ant   = cs.reduce((s,c) => s + sf(q({ crime: c, mes: selMeses, ...sc }), 'anterior'), 0);
    const tendV = cs.reduce((s,c) => s + sf(q({ crime: c, mes: selMeses, ...sc }), 'tend'), 0);
    const dev   = meta === 0 ? (aval === 0 ? 0 : 100) : parseFloat(((aval - meta) / meta * 100).toFixed(1));
    const devT  = tendV === 0 ? null : meta === 0 ? 100 : parseFloat(((tendV - meta) / meta * 100).toFixed(1));
    const tendS = aval <= meta ? '✓ Dentro da meta' : aval < ant ? '↗ Acima da meta, melhorando' : '↘ Acima da meta, piorando';
    return { aval, meta, ant, tendV, dev, devT, tendS };
  });
  const wrapLabel = (s, maxLen = 14) => {
    const words = s.split(' ');
    const lines = [];
    let cur = '';
    words.forEach(w => {
      if (!cur) { cur = w; }
      else if ((cur + ' ' + w).length <= maxLen) { cur += ' ' + w; }
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines.length === 1 ? lines[0] : lines;
  };

  const vmWrappedLabels = vmEntries.map(e => wrapLabel(e.label));

  mk('c-var', {
    type: 'bar',
    data: {
      labels: vmWrappedLabels,
      datasets: [
        {
          label: 'Meta vs Avaliado',
          data: vmDetails.map(d => (d.aval > 0 && d.dev === 0) ? -5 : d.dev),
          backgroundColor: vmDetails.map(d =>
            d.aval <= d.meta  ? 'rgba(61,191,122,.80)' :
            d.aval <= d.ant   ? 'rgba(191,122,61,.85)' :
                                'rgba(230,100,100,.80)'
          ),
          borderRadius: 4,
          order: 1
        },
        {
          label: 'Tendência (%)',
          data: vmDetails.map(d => (d.tendV > 0 && (d.devT ?? 0) === 0) ? -5 : (d.devT ?? 0)),
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
      maintainAspectRatio: false,
      layout: { padding: { top: 75 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => vmEntries[ctx[0].dataIndex]?.label,
            label: ctx => {
              const d = vmDetails[ctx.dataIndex];
              return [
                `Resultado: ${d.dev > 0 ? '+' : ''}${d.dev}% vs meta`,
                `Avaliado:  ${d.aval}`,
                `Meta:      ${d.meta || '—'}`,
                `Status:    ${d.tendS}`
              ];
            }
          }
        }
      },
      scales: {
        x: { grid: GR, ticks: { display: false } },
        y: { grid: GR, ticks: { callback: v => v + '%', color: '#ffffff', font: { size: 19 } }, suggestedMin: -30, suggestedMax: 30 }
      },
      onClick: (evt, elements) => {
        if (elements.length) moOpen(CRIMES[elements[0].index], PAL[elements[0].index]);
      },
      onHover: (evt, elements) => {
        evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      }
    },
    plugins: [
    {
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
    },
    {
      id: 'barTopLabels',
      afterDraw(chart) {
        const ctx = chart.ctx;
        const meta0 = chart.getDatasetMeta(0);
        const meta1 = chart.getDatasetMeta(1);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.font = "bold 21px 'DM Sans', sans-serif";
        const lineH = 24;
        meta0.data.forEach((bar0, i) => {
          const bar1 = meta1.data[i];
          const groupCenterX = bar1 ? (bar0.x + bar1.x) / 2 : bar0.x;
          const raw = vmWrappedLabels[i] ?? vmEntries[i]?.label ?? '';
          const lines = Array.isArray(raw) ? raw : [raw];
          const barTop = Math.min(bar0.y, bar0.base);
          const startY = barTop - 4;
          lines.forEach((line, li) => {
            ctx.fillText(line, groupCenterX, startY - (lines.length - 1 - li) * lineH);
          });
        });
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

  // Municípios no escopo atual
  const muns = sc.mun ? [sc.mun]
             : sc.cia ? MUNS.filter(m => RAW.some(r => r.mun === m && r.cia === sc.cia))
             : MUNS;

  // Apenas municípios com pelo menos uma ocorrência no período, ordenados por CIA
  const withOcc = muns
    .map(m => ({ m, total: MESES.reduce((s, mes) => s + sf(q({ crime, mun: m, mes })), 0) }))
    .filter(x => x.total > 0)
    .sort((a, b) => munCia(a.m).localeCompare(munCia(b.m)) || b.total - a.total);

  const ciaStyleIdx2 = {};
  mk('c-evol-muns', {
    type: 'line',
    data: {
      labels: MESES,
      datasets: withOcc.map(({ m }) => {
        const col = ciaColor(m);
        const cia = munCia(m);
        ciaStyleIdx2[cia] = (ciaStyleIdx2[cia] ?? -1) + 1;
        const idx = ciaStyleIdx2[cia];
        const styles = ['circle','triangle','rect'];
        return {
          label: m,
          data: MESES.map(mes => sf(q({ crime, mun: m, mes }))),
          borderColor: col, backgroundColor: 'transparent',
          tension: 0.3, pointRadius: 5, borderWidth: 2,
          borderDash: [], pointStyle: styles[idx % 3],
          pointBackgroundColor: col
        };
      })
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 20, padding: 18, font: { size: 19 }, usePointStyle: true, color: '#ffffff' } }
      },
      scales: {
        x: { grid: GR, ticks: { color: '#ffffff', font: { size: 19 } } },
        y: { grid: GR, beginAtZero: true, ticks: { stepSize: 1, color: '#ffffff', font: { size: 19 } } }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------

function ciaSepRow(cia, cols) {
  const cor = ciaCorByName(cia);
  return `<tr><td colspan="${cols}" style="padding:6px 10px;background:${cor}18;border-top:2px solid ${cor}55;border-bottom:1px solid ${cor}33;font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:${cor};font-weight:700">${cia.toUpperCase()}</td></tr>`;
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

function renderVisaoHeatmap() {
  const tbl = document.getElementById('vis-hm-tbl');
  if (!tbl) return;
  const meses = selMeses;
  const sc = scope('visao');
  const crimes = CRIMES;
  const muns = sc.cia ? MUNS.filter(m => RAW.some(r => r.mun === m && r.cia === sc.cia)) :
               sc.mun ? [sc.mun] : MUNS;
  const hmCols = crimes.length + 2;
  const hmLblV = c => cl(c).replace('Vítimas de Letalidade Violenta', 'Vit. Let.<br>Violenta').replace('Estupro de Vuln.', 'Estupro de<br>Vuln.');
  let h = '<thead><tr><th>Município</th>' + crimes.map(c => `<th>${hmLblV(c)}</th>`).join('') + '<th>Total</th></tr></thead><tbody>';
  let lastCia = null;
  muns.forEach(mun => {
    const cia = munCia(mun);
    if (cia !== lastCia) { h += ciaSepRow(cia, hmCols); lastCia = cia; }
    const vals  = crimes.map(c => sf(q({ crime: c, mun, mes: meses })));
    const total = vals.reduce((a, b) => a + b, 0);
    h += `<tr><td class="hm-city">${mun}</td>`;
    vals.forEach((v, i) => {
      const c    = crimes[i];
      const meta = sf(q({ crime: c, mun, mes: meses }), 'meta');
      const ant  = sf(q({ crime: c, mun, mes: meses }), 'anterior');
      const bg   = hcol(v, meta, ant);
      h += `<td><div class="hm-cell" style="background:${bg};color:#ffffff">${v}</div></td>`;
    });
    h += `<td><div class="hm-cell" style="background:rgba(255,255,255,.07);color:#ffffff;font-weight:700">${total}</div></td></tr>`;
  });
  tbl.innerHTML = h + '</tbody>';
}

function renderHeatmap() {
  const p = pLbl(hmMeses);
  document.getElementById('lbl-p4').textContent  = p;
  document.getElementById('hm-badge').textContent = p;
  const hmCols = CRIMES.length + 2;
  const hmLbl = c => cl(c).replace('Vítimas de Letalidade Violenta', 'Vit. Let.<br>Violenta').replace('Estupro de Vuln.', 'Estupro de<br>Vuln.');
  let h = '<thead><tr><th>Município</th>' + CRIMES.map(c => `<th>${hmLbl(c)}</th>`).join('') + '<th>Total</th></tr></thead><tbody>';
  let lastHmCia = null;
  MUNS.forEach(mun => {
    const cia = munCia(mun);
    if (cia !== lastHmCia) { h += ciaSepRow(cia, hmCols); lastHmCia = cia; }
    const vals  = CRIMES.map(c => sf(q({ crime: c, mun, mes: hmMeses })));
    const total = vals.reduce((a, b) => a + b, 0);
    h += `<tr><td class="hm-city">${mun}</td>`;
    vals.forEach((v, i) => {
      const c    = CRIMES[i];
      const meta = sf(q({ crime: c, mun, mes: hmMeses }), 'meta');
      const ant  = sf(q({ crime: c, mun, mes: hmMeses }), 'anterior');
      const bg   = hcol(v, meta, ant);
      h += `<td><div class="hm-cell" style="background:${bg};color:#ffffff">${v}</div></td>`;
    });
    h += `<td><div class="hm-cell" style="background:rgba(255,255,255,.07);color:#ffffff;font-weight:700">${total}</div></td></tr>`;
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
  const muns = pf.type === 'cia' ? MUNS.filter(m => RAW.some(r => r.mun === m && r.cia === pf.value))
             : sc.mun                ? [sc.mun]
             : MUNS;
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

  // Crime mais crítico: pior município individual (máximo desvio por município)
  const crimesDesvio = CRIMES.map(c => {
    let maxDesvio = -Infinity, maxA = 0, maxM = 0;
    muns.forEach(mun => {
      const a = sf(q({ crime: c, mun, mes: selMeses, ...sc }));
      const m = sf(q({ crime: c, mun, mes: selMeses, ...sc }), 'meta');
      if (m > 0) {
        const d = (a - m) / m * 100;
        if (d > maxDesvio) { maxDesvio = d; maxA = a; maxM = m; }
      }
    });
    return { c, a: maxA, m: maxM, desvio: maxDesvio };
  });
  const crimeCritico = [...crimesDesvio].sort((a, b) => b.desvio - a.desvio)[0];

  // Totais agregados — mesma lógica dos KPI cards (usada para contagens e melhor desempenho)
  const crimesTotais = CRIMES.map(c => {
    const a = sf(qsc({ crime: c }));
    const m = sf(qsc({ crime: c }), 'meta');
    const desvio = m > 0 ? (a - m) / m * 100 : (a > 0 ? 100 : -Infinity);
    return { c, a, m, desvio };
  });

  // Crime melhor desempenho: maior redução sobre a meta (totais agregados)
  const crimeMelhor = crimesTotais
    .filter(x => x.m > 0 && x.a <= x.m)
    .sort((a, b) => a.desvio - b.desvio)[0];

  // Contagens de meta — totais agregados, coerente com os KPI cards
  const acima  = crimesTotais.filter(x => x.m > 0 && x.a > x.m).length;
  const ok     = crimesTotais.filter(x => x.m > 0 && x.a <= x.m).length;
  const emEvol = crimesTotais.filter(x => {
    if (x.m === 0 || x.desvio <= 0) return false;
    const ant = sf(qsc({ crime: x.c }), 'anterior');
    return x.a < ant;
  }).length;

  // Só considera municípios com pelo menos 1 ocorrência real no período
  const munsAtivos = muns.filter(m => CRIMES.some(c => sf(q({ crime: c, mun: m, mes: selMeses, ...sc })) > 0));

  // Score único por município: ok − acima (garante que destaque e alerta nunca são a mesma cidade)
  const munScores = munsAtivos.map(m => {
    let acima = 0, ok = 0;
    CRIMES.forEach(c => {
      const a  = sf(q({ crime: c, mun: m, mes: selMeses, ...sc }));
      const mt = sf(q({ crime: c, mun: m, mes: selMeses, ...sc }), 'meta');
      if (mt > 0) { if (a > mt) acima++; else ok++; }
    });
    return { m, acima, ok, score: ok - acima };
  }).sort((a, b) => b.score - a.score);

  const munAlerta   = munScores.length ? munScores[munScores.length - 1] : { m: '—', acima: 0, score: 0 };
  const munDestaque = munScores.length >= 2 ? munScores[0]
    : (munScores.length === 1 && munScores[0].score > 0 ? munScores[0] : { m: '—', ok: 0, score: 0 });

  // --- Cards ---
  const ins = [
    // 1. Crime com maior crescimento vs anterior
    crimeMaisCresceu && crimeMaisCresceu.varP > 0
      ? { t: 'red',   v: `▲${crimeMaisCresceu.varP}%`, title: `Maior crescimento — ${crimeMaisCresceu.c}`, body: `Passou de ${crimeMaisCresceu.ant} para ${crimeMaisCresceu.a} ocorrências vs período anterior. Escopo: ${lbl}.` }
      : crimeMaisReduciu
        ? { t: 'green', v: `▼${Math.abs(crimeMaisReduciu.varP)}%`, title: `Maior redução — ${crimeMaisReduciu.c}`, body: `Passou de ${crimeMaisReduciu.ant} para ${crimeMaisReduciu.a} ocorrências. Nenhum crime em alta no período — destaque para a maior queda. Escopo: ${lbl}.` }
        : { t: '', v: '—', title: 'Sem variação', body: 'Não há dados suficientes para calcular variação entre períodos.' },
    // 2. Crime mais crítico
    crimeCritico.desvio > 0
      ? { t: 'red', v: `+${crimeCritico.desvio.toFixed(0)}%`, title: `Crítico — ${crimeCritico.c}`, body: `${crimeCritico.a} ocorrências contra meta de ${crimeCritico.m}. Desvio de ${crimeCritico.desvio.toFixed(0)}% acima do permitido. Escopo: ${lbl}.` }
      : { t: 'green', v: '✓', title: 'Todos dentro da meta', body: `Nenhum crime acima da meta no período. Escopo: ${lbl}.` },
    // 3. Melhor desempenho
    crimeMelhor
      ? { t: 'green', v: `${Math.abs(crimeMelhor.desvio).toFixed(0)}%`, title: `Destaque — ${crimeMelhor.c}`, body: `${crimeMelhor.a} ocorrências contra meta de ${crimeMelhor.m}. ${Math.abs(crimeMelhor.desvio).toFixed(0)}% abaixo da meta. Escopo: ${lbl}.` }
      : { t: '', v: '—', title: 'Nenhum crime abaixo da meta', body: `Todos os crimes com meta definida estão no limite ou acima. Escopo: ${lbl}.` },
    // 4. Resumo de metas
    {
      t: acima > 0 ? 'red' : 'green',
      v: `${ok}/${CRIMES.length}`,
      title: 'Crimes dentro da meta',
      body: `${ok} crimes dentro da meta, ${acima} acima${emEvol > 0 ? ` e ${emEvol} acima mas em evolução (melhorando vs anterior)` : ''}. Escopo: ${lbl}.`
    },
    // 5. Município em alerta
    {
      t: munAlerta.acima > 0 ? 'red' : 'green',
      v: munAlerta.m,
      title: 'Município em alerta',
      body: munAlerta.acima > 0
        ? `${munAlerta.m} possui ${munAlerta.acima} crime(s) acima da meta. Requer atenção prioritária. Escopo: ${lbl}.`
        : `Nenhum município com crimes acima da meta. Escopo: ${lbl}.`
    },
    // 6. Município destaque (sempre diferente do município em alerta)
    {
      t: munDestaque.score > 0 ? 'green' : '',
      v: munDestaque.m,
      title: 'Município destaque',
      body: munDestaque.m !== '—'
        ? `${munDestaque.m} tem ${munDestaque.ok} crime(s) dentro ou abaixo da meta no período. Melhor desempenho — Escopo: ${lbl}.`
        : `Sem município em destaque no período. Escopo: ${lbl}.`
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
          tension: .4, borderDash: [], pointRadius: 3, borderWidth: 1.5
        },
        {
          label: 'Anterior',
          data: MESES.map(m => sf(q({ crime, mes: m, ...sc }), 'anterior')),
          borderColor: 'rgba(255,255,255,.18)', backgroundColor: 'transparent',
          tension: .4, borderDash: [], pointRadius: 2, borderWidth: 1
        },
        {
          label: 'Tendência',
          data: MESES.map(m => sf(q({ crime, mes: m, ...sc }), 'tend')),
          borderColor: '#3d7abf', backgroundColor: 'transparent',
          tension: .4, borderDash: [], pointRadius: 3, borderWidth: 1.5
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { boxWidth: 20, padding: 16, font: { size: 19 }, color: '#ffffff' } } },
      scales: { x: { grid: GR, ticks: { color: '#ffffff', font: { size: 19 } } }, y: { grid: GR, beginAtZero: true, ticks: { color: '#ffffff', font: { size: 19 } } } }
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
        ${hasRec ? `<div style="font-family:'DM Mono',monospace;font-size:19px;font-weight:700;color:${color}">${a}</div>
        <div style="font-family:'DM Mono',monospace;font-size:19px;font-weight:500;color:var(--tx3);margin-top:2px">meta: ${mt}</div>` : '<div style="color:var(--tx3)">—</div>'}
      </td>`;
    }).join('');

    h += `<tr style="border-top:1px solid var(--bd)">
      <td style="font-weight:600">${mun}</td>
      <td style="color:var(--tx3);font-size:19px;font-weight:500">${cia}</td>
      ${cells}
      <td style="text-align:center;padding:6px 8px">
        <div style="font-family:'DM Mono',monospace;font-size:19px;font-weight:700">${tot}</div>
        <div style="font-family:'DM Mono',monospace;font-size:19px;font-weight:500;color:var(--tx3);margin-top:2px">meta: ${totMeta}</div>
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
  if (moFemCh) { moFemCh.destroy(); moFemCh = null; }
}

function moOpen(crime, color, displayLabel) {
  moDestroy();
  moCrime = crime; moColor = color;
  moMeses = [...selMeses];
  moScopeType = 'btl'; moScopeVal = null;
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
  h += '<div class="pf-field"><span class="pf-label">CIA</span><select class="pf-select" style="min-width:90px" onchange="moSetScope(\'cia\',this.value)"><option value="">—</option>';
  CIAS.forEach(c => h += `<option value="${c}" ${moScopeType==='cia'&&moScopeVal===c?'selected':''}>${c}</option>`);
  h += '</select></div>';
  const munListMo = moScopeType === 'cia' ? MUNS.filter(m => RAW.some(r => r.mun === m && normCiaKey(r.cia) === normCiaKey(moScopeVal))) : MUNS;
  h += '<div class="pf-field"><span class="pf-label">Município</span><select class="pf-select" style="min-width:130px" onchange="moSetScope(\'mun\',this.value)"><option value="">—</option>';
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
  const vp   = ant > 0 ? ((aval - ant) / ant * 100).toFixed(0) : 0;

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
    : acimaDoMeta.map(x => `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><span style="font-size:20px;font-weight:700;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${x.m}</span><span style="font-family:'DM Mono',monospace;font-size:20px;color:#ffaaaa;margin-left:8px;flex-shrink:0">+${x.desvio.toFixed(0)}%</span></div>`).join('');

  document.getElementById('mo-kpis').innerHTML = `
    <div class="mk"><div class="mk-lbl">Total Avaliado</div><div class="mk-val" style="color:${color}">${aval}</div><div class="mk-sub">${pLbl(moMeses)}</div></div>
    <div class="mk"><div class="mk-lbl">Var vs Anterior</div><div class="mk-val" style="color:${vc}">${parseFloat(vp) <= 0 ? '▼' : '▲'}${Math.abs(vp)}%</div><div class="mk-sub" style="font-size:22px">Ant: ${ant}</div></div>
    <div class="mk"><div class="mk-lbl">Municípios Fora da Meta (${acimaDoMeta.length})</div>${munCriticoHtml}</div>
    <div class="mk"><div class="mk-lbl">Meta</div><div class="mk-val" style="color:${mok?'var(--green2)':'var(--red2)'};font-size:22px;padding-top:6px">${mok?'✓ Ok':'✗ Acima'}</div><div class="mk-sub" style="font-size:22px">Meta:${meta} | Real:${aval}</div></div>
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
              boxWidth: 18, padding: 24, font: { size: 19 }, color: '#ffffff',
              generateLabels: () => [
                { text: 'Dentro da meta',                         fillStyle: 'rgba(61,191,122,.75)',  strokeStyle: 'rgba(61,191,122,.75)',  lineWidth: 0, hidden: false, fontColor: '#ffffff', color: '#ffffff', font: { size: 19 } },
                { text: 'Acima da meta, melhor que mês anterior', fillStyle: 'rgba(191,122,61,.85)', strokeStyle: 'rgba(191,122,61,.85)', lineWidth: 0, hidden: false, fontColor: '#ffffff', color: '#ffffff', font: { size: 19 } },
                { text: 'Acima da meta',                          fillStyle: 'rgba(230,100,100,.80)',  strokeStyle: 'rgba(230,100,100,.80)',  lineWidth: 0, hidden: false, fontColor: '#ffffff', color: '#ffffff', font: { size: 19 } }
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
          x: { grid: GR, ticks: { color: '#ffffff', font: { size: 19 } } },
          y: { grid: GR, ticks: { callback: v => v + '%', color: '#ffffff', font: { size: 19 } }, suggestedMin: -20, suggestedMax: 20 }
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
        legend: { labels: { boxWidth: 15, padding: 32, font: { size: 19 }, usePointStyle: true, color: '#ffffff' } },
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
      scales: { x: { grid: GR, ticks: { color: '#ffffff', font: { size: 19 } } }, y: { grid: GR, beginAtZero: true, ticks: { stepSize: 1, color: '#ffffff', font: { size: 19 } } } }
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
        if (!denom) return vals.map(() => sy/n);
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
      const avgBaseAno   = baseAnoNum.length > 0 ? baseAnoNum.reduce((a,b) => a+b,0) / baseAnoNum.length : 1;
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
          plugins: { legend: { labels: { boxWidth: 15, padding: 28, font: { size: 19 }, color: '#ffffff' } },
            tooltip: { callbacks: { title: items => MES_ORD[items[0].dataIndex] } } },
          scales: { x: { grid: GR, ticks: { color: '#ffffff', font: { size: 19 } } }, y: { grid: GR, beginAtZero: true, ticks: { color: '#ffffff', font: { size: 19 } } } } }
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
document.addEventListener('keydown', e => { if (e.key === 'Escape') moClose(); });

// ---------------------------------------------------------------------------
// Upload CSV → Supabase
// ---------------------------------------------------------------------------

let uploadData = null;

function openUploadModal() {
  uploadData = null;
  document.getElementById('upl-file').value = '';
  document.getElementById('upl-ano').value = '';
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

  // Mapa de normalização: qualquer variação de caixa → nome canônico
  const HEADER_MAP = {
    ano:'Ano', mes:'Mes', cia:'Cia', municipio:'Municipio', crime:'Crime',
    anterior:'Anterior', meta:'Meta', avaliado:'Avaliado',
    tendencia:'Tendencia', tendência:'Tendencia',
    variacao:'Variacao', variação:'Variacao'
  };

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => HEADER_MAP[h.trim().toLowerCase()] || h.trim(),
    complete: (results) => {
      if (!results.data.length) {
        showUplMsg('Arquivo vazio ou sem registros válidos.', 'err');
        return;
      }

      const required = ['Ano', 'Mes', 'Cia', 'Municipio', 'Crime', 'Anterior', 'Meta', 'Avaliado'];
      const headers  = Object.keys(results.data[0]);
      const missing  = required.filter(r => !headers.includes(r));

      if (missing.length) {
        showUplMsg(`Colunas ausentes: ${missing.join(', ')}`, 'err');
        return;
      }

      // Filtra linhas válidas (Ano já está normalizado pelo transformHeader)
      uploadData = results.data
        .map(row => { const n = {}; Object.entries(row).forEach(([k, v]) => { n[k] = (v || '').trim(); }); return n; })
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
  const anoInput = document.getElementById('upl-ano');
  const overrideAno = anoInput?.value ? parseInt(anoInput.value) : null;
  const btn = document.getElementById('upl-confirm');
  btn.disabled = true;
  btn.textContent = 'Importando...';
  showUplMsg('Enviando para o Supabase...', 'info');

  try {
    const res  = await authFetch(`${API}/upload`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ records: uploadData, overrideAno })
    });
    const json = await res.json();

    if (!res.ok || !json.ok) throw new Error(json.error || 'Erro desconhecido');

    showUplMsg(`✓ ${json.uploaded} registros importados. Total na base: ${json.total}.`, 'ok');
    registraUpload();
    btn.classList.remove('on');

    // Força re-sincronização do cache do servidor antes de recarregar
    await authFetch(`${API}/sync`).catch(() => {});
    await loadData();
    selAno   = ANOS[0] || new Date().getFullYear();
    MESES    = getMesForAno(selAno);
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

let ocorrData  = null;
let moOcorrAll = [];
let moFemData = []; // registros de Feminicídio para tela de Homicídio
let moFemCh   = null;

function updateFemKpi() {
  const sec = document.getElementById('mo-fem-section');
  if (!sec) return;
  if (moCrime !== 'Homicídio') { sec.style.display = 'none'; return; }

  // Filtra registros pelo período + escopo selecionado (CIA ou município)
  const femFiltrado = moFemData.filter(r => {
    if (!r.data_ocorrencia) return false;
    const [ano, mes] = r.data_ocorrencia.split('-').map(Number);
    const mesNome = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes - 1];
    const anoOk = !selAno || ano === selAno;
    if (!anoOk || !moMeses.includes(mesNome)) return false;
    if (moScopeType === 'cia' && moScopeVal) {
      if ((r.cia || '').trim().toLowerCase() !== moScopeVal.trim().toLowerCase()) return false;
    }
    if (moScopeType === 'mun' && moScopeVal) {
      if ((r.municipio || '').trim().toLowerCase() !== moScopeVal.trim().toLowerCase()) return false;
    }
    return true;
  });

  const femCount  = femFiltrado.length;
  const totalAval = sf(q({ crime: moCrime, mes: moMeses, ...moQScope() }));
  if (!totalAval) { sec.style.display = 'none'; return; }
  sec.style.display = '';
  const demais    = Math.max(0, totalAval - femCount);

  // Destrói gráfico anterior se existir
  if (moFemCh) { moFemCh.destroy(); moFemCh = null; }
  const ctx = document.getElementById('mo-fem-chart')?.getContext('2d');
  if (!ctx) return;

  moFemCh = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Homicídio', 'Feminicídio'],
      datasets: [{ data: [demais, femCount], backgroundColor: ['rgba(230,100,100,.75)', 'rgba(240,140,200,.90)'], borderWidth: 0 }]
    },
    options: {
      responsive: true, cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: i => ` ${i.label}: ${i.raw} (${totalAval > 0 ? Math.round(i.raw/totalAval*100) : 0}%)` } }
      }
    }
  });

  document.getElementById('mo-fem-legend').innerHTML =
    `<div style="font-size:24px"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:rgba(230,100,100,.75);margin-right:8px"></span>Homicídio — <b>${demais}</b></div>` +
    `<div style="font-size:24px"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:rgba(240,140,200,.90);margin-right:8px"></span>Feminicídio — <b>${femCount}</b></div>` +
    `<div style="margin-top:6px;font-size:24px;color:#f4f6fc">Total: ${totalAval} • ${Math.round(femCount/totalAval*100)}% feminicídio</div>`;
}

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
  el.style.color = type === 'err' ? '#f07878' : type === 'ok' ? '#5ae09a' : '#5a9de0';
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
    registraUpload();
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

// Normaliza nome de CIA para exibição padronizada (ex: "1ª CIA PM" → "1ª CIA", "FT" → "FT")
function normCiaDisplay(s) {
  const str = (s || '').trim();
  const l = str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (l.includes('ft') || l.includes('forca') || l.includes('tatica')) return 'FT';
  const m = str.match(/(\d+)/);
  if (m) return m[1] + 'ª CIA';
  return str;
}

async function loadMoOcorr() {
  const el = document.getElementById('mo-ocorr-table');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--tx3);font-size:19px;padding:8px 0">Carregando ocorrências...</div>';
  const filtersEl = document.getElementById('mo-ocorr-filters');
  if (filtersEl) filtersEl.innerHTML = '';

  try {
    let data;
    if (Array.isArray(moCrime)) {
      // Crime agrupado: busca cada rubrica base separadamente e filtra por conduta veículo
      const rubricas = ['Roubo', 'Furto'];
      const results = await Promise.all(rubricas.map(r =>
        authFetch(`${API}/ocorrencias?${new URLSearchParams({ rubrica: r, limit: '2000' })}`).then(res => res.json())
      ));
      const isCondutaVeiculo = c => { const l = (c || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); return l.includes('veic') && !l.includes('interior'); };
      const merged = results.flat().filter(r => isCondutaVeiculo(r.conduta));
      // Remove duplicatas por id
      const seen = new Set();
      data = merged.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
    } else {
      // Se crime contiver 'vulnerav' (normalizado), busca por 'estupro' para evitar
      // problema de acento no ilike do Postgres e filtra no frontend depois
      const _normCrime = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const isEstVul = _normCrime(moCrime).includes('vulnerav');
      const termoBusca = isEstVul ? 'estupro' : moCrime;
      const params = new URLSearchParams({ rubrica: termoBusca, limit: '2000' });
      const res = await authFetch(`${API}/ocorrencias?${params}`);
      data = await res.json();
      // Homicídio: busca contagem de Feminicídio separadamente para exibir como detalhe
      // Usa 'eminicid' para evitar problema de acento/encoding no ilike
      if (moCrime === 'Homicídio') {
        try {
          const paramsFem = new URLSearchParams({ rubrica: 'Feminic', limit: '2000' });
          const resFem = await authFetch(`${API}/ocorrencias?${paramsFem}`);
          const dataFem = await resFem.json();
          moFemData = Array.isArray(dataFem) ? dataFem : [];
          // Mescla feminicídios na lista principal de ocorrências
          const merged = [...data, ...moFemData];
          const seen = new Set();
          data = merged.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
        } catch (e) {
          console.error('Erro ao buscar Feminicídio:', e);
          moFemData = [];
        }
        updateFemKpi();
      }
      // Estupro Vulnerável: mantém apenas registros com 'vulnerav' ou '217' na rubrica
      if (isEstVul) {
        data = data.filter(r => {
          const rub = (r.rubrica || '').toLowerCase();
          return rub.includes('vulnerav') || rub.includes('217');
        });
      }
      // Exclui condutas de veículo — pertencem à tela Roubo/Furto Veículos
      if (['Roubo','Furto'].includes(moCrime)) {
        const isCondutaVeiculo = c => { const l = (c || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); return l.includes('veic') && !l.includes('interior'); };
        data = data.filter(r => !isCondutaVeiculo(r.conduta));
      }
      // Se existir um crime mais específico (ex: "Estupro Vulnerável" para "Estupro"),
      // exclui os registros que pertencem ao mais específico — ilike traz os dois
      const _norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const normMC = _norm(moCrime);
      const maisEspecificos = CRIMES.filter(c => c !== moCrime && _norm(c).startsWith(normMC + ' '));
      if (maisEspecificos.length > 0) {
        data = data.filter(r => {
          const normR = _norm(r.rubrica || '');
          return !maisEspecificos.some(c => normR.includes(_norm(c)));
        });
      }
    }
    moOcorrAll = Array.isArray(data) ? data : [];
    applyOcorrFilters();
  } catch (err) {
    if (el) el.innerHTML = `<div style="color:#f07878;font-size:19px;padding:8px 0">Erro ao carregar ocorrências: ${err.message}</div>`;
  }
}

function applyOcorrFilters() {
  let filtered = moOcorrAll.filter(r => {
    if (!r.data_ocorrencia) return true;
    const m = parseInt(r.data_ocorrencia.split('-')[1]) - 1;
    return moMeses.includes(MES_ORD[m]);
  });
  if (moScopeType === 'cia' && moScopeVal)
    filtered = filtered.filter(r => normCiaKey(r.cia) === normCiaKey(moScopeVal));
  if (moScopeType === 'mun' && moScopeVal)
    filtered = filtered.filter(r => r.municipio === moScopeVal);
  renderMoOcorrFilters();
  renderOcorrTable(filtered);
  renderMoIntel(filtered);
}

function setOcorrCia(cia) {
  // Toggle: se já está selecionada, volta para Batalhão; senão seleciona a CIA
  if (moScopeType === 'cia' && moScopeVal === cia) moSetScope('btl', null);
  else moSetScope('cia', cia);
}

function renderMoOcorrFilters() {
  const el = document.getElementById('mo-ocorr-filters');
  if (!el) return;
  let h = '';
  if (moOcorrAll.length) {
    h += `<span style="font-size:19px;color:var(--tx3)">${moOcorrAll.length} registro(s) total</span>`;
  }
  el.innerHTML = h;
}

function renderOcorrTable(data) {
  const el = document.getElementById('mo-ocorr-table');
  if (!el) return;
  if (!data.length) {
    el.innerHTML = '<div style="color:var(--tx3);font-size:19px;padding:8px 0">Nenhuma ocorrência encontrada para os filtros selecionados.</div>';
    return;
  }
  const th = s => `<th style="padding:9px 10px;border-bottom:1px solid var(--bd);font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;letter-spacing:1px;text-align:left;white-space:nowrap">${s}</th>`;
  const td = (s, mono) => `<td style="padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.05);color:#ffffff;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis${mono?';font-family:\'DM Mono\',monospace;font-size:19px':';font-size:19px'}" title="${escHtml(s||'')}">${escHtml(s)||'—'}</td>`;
  let h = `<table style="width:100%;border-collapse:collapse;font-size:19px"><thead><tr>
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
}

function renderOcorrHeatmap(data) {
  const el = document.getElementById('mo-heatmap');
  if (!el) return;
  const DIAS_FULL = { Dom:'Domingo', Seg:'Segunda-feira', Ter:'Terça-feira', Qua:'Quarta-feira', Qui:'Quinta-feira', Sex:'Sexta-feira', 'Sáb':'Sábado' };
  const DIAS   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const BLOCOS_LABEL = ['Madrugada (00–05h)', 'Manhã (06–11h)', 'Tarde (12–17h)', 'Noite (18–23h)'];
  const matrix = {};
  DIAS.forEach(d => { matrix[d] = [0,0,0,0]; });
  data.forEach(r => {
    const dia   = normDia(r.dia_semana);
    const bloco = horaBlock(r.hora_ocorrencia);
    if (DIAS.includes(dia) && bloco !== null) matrix[dia][bloco]++;
  });

  // Total para % do pico (apenas registros com horário)
  const totalComHora = data.filter(r => r.dia_semana && r.hora_ocorrencia).length;
  if (totalComHora === 0 && !data.some(r => r.dia_semana)) {
    el.innerHTML = '<div style="color:var(--tx3);font-size:19px">Sem dados de dia disponíveis.</div>'; return;
  }

  // Pico absoluto (dia + período) — usa apenas registros com horário
  let picoDia = '', picoBlocoIdx = 0, picoVal = 0;
  DIAS.forEach(d => matrix[d].forEach((v, b) => { if (v > picoVal) { picoVal = v; picoDia = d; picoBlocoIdx = b; } }));

  // Dia mais crítico — usa TODOS os registros com dia_semana, independente de horário
  const countsPorDia = {};
  DIAS.forEach(d => { countsPorDia[d] = 0; });
  data.forEach(r => {
    const dia = normDia(r.dia_semana);
    if (DIAS.includes(dia)) countsPorDia[dia]++;
  });
  const totalTodos = data.filter(r => r.dia_semana).length;
  const totDia = DIAS.map(d => ({ d, v: countsPorDia[d] })).sort((a,b) => b.v-a.v)[0];

  const pctHora  = v => totalComHora > 0 ? Math.round(v / totalComHora * 100) : 0;
  const pctTodos = v => totalTodos   > 0 ? Math.round(v / totalTodos   * 100) : 0;

  const card = (icon, label, value, sub) => `
    <div style="background:var(--bg2);border:1px solid var(--bd);border-radius:10px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px">
      <span style="font-size:22px;line-height:1">${icon}</span>
      <div>
        <div style="font-size:19px;color:#ffffff;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;font-weight:600">${label}</div>
        <div style="font-size:19px;font-weight:700;color:#ffffff">${value}</div>
        ${sub ? `<div style="font-size:19px;color:#ffffff;margin-top:3px">${sub}</div>` : ''}
      </div>
    </div>`;

  let cards = '';
  if (picoVal > 0) {
    cards += card('🔴', 'Pico de ocorrências', `${DIAS_FULL[picoDia]} · ${BLOCOS_LABEL[picoBlocoIdx]}`, `${picoVal} ocorrência${picoVal !== 1 ? 's' : ''} — ${pctHora(picoVal)}% dos registros com horário`);
  }
  cards += card('📅', 'Dia mais crítico', DIAS_FULL[totDia.d], `${totDia.v} ocorrência${totDia.v !== 1 ? 's' : ''} — ${pctTodos(totDia.v)}% do total`);

  el.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${cards}</div>`;
}

function safeChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
  const chart = new Chart(canvas.getContext('2d'), config);
  moIntelChs.push(chart);
  return chart;
}

function renderTipoLocal(data) {
  const counts = {};
  data.forEach(r => { const t = r.tipo_local || 'Não informado'; counts[t] = (counts[t]||0)+1; });
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
  const top = sorted.slice(0,7);
  const outros = sorted.slice(7).reduce((s,[,v]) => s+v, 0);
  if (outros > 0) {
    const idx = top.findIndex(([k]) => k === 'Outros');
    if (idx >= 0) top[idx] = ['Outros', top[idx][1] + outros];
    else top.push(['Outros', outros]);
  }
  if (!top.length) return;
  const colors = ['#c8a84b','#3d7abf','#e05555','#3dbf7a','#bf7a3d','#7a4bbf','#4bbfbf','#808080'];
  safeChart('mo-tipolocal', {
    type: 'doughnut',
    data: { labels: top.map(([k])=>k), datasets: [{ data: top.map(([,v])=>v), backgroundColor: colors.slice(0,top.length), borderWidth:0 }] },
    options: { responsive:true, cutout:'60%', plugins:{ legend:{ position:'bottom', labels:{ boxWidth:14, font:{size:19}, padding:20, color:'#ffffff' } } } }
  });
}


function renderBairros(data) {
  const counts = {};
  const muns   = {};
  data.forEach(r => {
    if (!r.bairro) return;
    counts[r.bairro] = (counts[r.bairro] || 0) + 1;
    if (!muns[r.bairro] && r.municipio) muns[r.bairro] = r.municipio;
  });
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,10);
  if (!sorted.length) return;
  const wrapper = document.getElementById('mo-bairros')?.parentElement;
  if (!wrapper) return;
  const rowH = 52;
  wrapper.style.height = Math.max(220, sorted.length * rowH + 40) + 'px';
  safeChart('mo-bairros', {
    type: 'bar',
    data: {
      labels: sorted.map(([k]) => muns[k] ? `${muns[k]} · ${k}` : k),
      datasets: [{ label:'Ocorrências', data: sorted.map(([,v])=>v), backgroundColor:'rgba(74,158,232,.7)', borderRadius:4, barPercentage: 0.45, categoryPercentage: 0.8 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: GR, ticks: { stepSize: 1, color: '#ffffff', font: { size: 19 } } },
        y: { grid: GR, ticks: { color: '#ffffff', font: { size: 19 }, autoSkip: false } }
      }
    }
  });
}

function renderRubrica(data) {
  const counts = {};
  data.forEach(r => { const rub = r.rubrica||'Não informado'; counts[rub]=(counts[rub]||0)+1; });
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if (!sorted.length) return;
  const ctx = document.getElementById('mo-rubrica')?.getContext('2d');
  if (!ctx) return;
  const colors = ['#e05555','#bf7a3d','#c8a84b','#3d7abf','#3dbf7a','#7a4bbf','#4bbfbf','#f07878','#5ae09a'];
  moIntelChs.push(new Chart(ctx, {
    type: 'bar',
    data: { labels: sorted.map(([k])=>k), datasets: [{ label:'Ocorrências', data: sorted.map(([,v])=>v), backgroundColor: sorted.map((_,i)=>colors[i%colors.length]), borderRadius:4 }] },
    options: { indexAxis:'y', responsive:true, plugins:{ legend:{display:false} }, scales:{ x:{ grid:GR, ticks:{stepSize:1, color:'#ffffff', font:{size:19}} }, y:{ grid:GR, ticks:{color:'#ffffff', font:{size:19}, autoSkip:false} } } }
  }));
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

// ---------------------------------------------------------------------------
// P1 — Gestão de Efetivo
// ---------------------------------------------------------------------------

let p1Data       = [];
let p1Afasts     = [];   // afastamentos carregados do Supabase
let p1Parsed     = [];   // CSV efetivo aguardando confirmação
let p1AfParsed   = [];   // CSV afastamentos aguardando confirmação
let p1Fotos      = {};   // RE → foto_base64 | null
let p1ByUnit     = {};   // OPM → PM[] (populado em renderP1)
let p1AfastHoje  = {};   // RE → afastamentos ativos hoje (populado em renderP1)
let p1Vagas      = [];   // efetivo fixado por OPM
let p1Quadro     = [];   // quadro fixado do efetivo (por posto)
let p1FiltroOpm  = '';   // filtro ativo por OPM
let prontoCurrentRe  = '';   // RE do prontuário aberto
let p1ClosingPronto  = false;// flag: acabou de fechar prontuário — evita fechar painel CIA
let p1UnitClickOut   = null; // handler de click fora do detalhe de unidade
let p1KpiClickOut    = null; // handler de click fora do detalhe de KPI

// ── Estrutura orgânica do 40º BPM/I ─────────────────────────────────────────
const CIA_STRUCT = [
  {
    label: '1ª CIA', sede: 'Votorantim', color: CIA_COR['1'],
    units: [
      { label: 'Sede · Votorantim', keys: ['1 cia - sede', 'votorantim'] },
      { label: '1º GP · Alumínio',  keys: ['alumin'] },
    ]
  },
  {
    label: '2ª CIA', sede: 'Ibiúna', color: CIA_COR['2'],
    units: [
      { label: 'Sede · Ibiúna',        keys: ['2 cia - sede', 'ibiun'] },
      { label: '1º Pel · Piedade',     keys: ['piedade'] },
      { label: '1º GP · Tapiraí',      keys: ['tapira'] },
    ]
  },
  {
    label: '3ª CIA', sede: 'Salto de Pirapora', color: CIA_COR['3'],
    units: [
      { label: 'Sede · Salto de Pirapora',    keys: ['3 cia - sede', 'salto de pirapora', 'salto pirapora'] },
      { label: '1º Pel · Araçoiaba da Serra', keys: ['aracoiaba'] },
      { label: '2º Pel · Pilar do Sul',       keys: ['pilar do sul', 'pilar'] },
      { label: '3º Pel · Iperó',              keys: ['ipero'] },
    ]
  },
  {
    label: 'FT', sede: 'Votorantim', color: CIA_COR.ft,
    units: [
      { label: 'Força Tática', keys: ['^ft$', 'forca tatica', 'f.t.'] },
    ]
  },
];

const _normOpm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[ºª°]/g,'').trim();
const _opmMatch = (opm, keys) => {
  const n = _normOpm(opm);
  return keys.some(k => k.startsWith('^') ? new RegExp(k).test(n) : n.includes(_normOpm(k)));
};

// Categoriza posto/graduação em 4 grupos
function p1Cat(posto) {
  const p = (posto || '').toLowerCase().replace(/[º°ª]/g, '');
  if (/\b(soldado|sd pm|sd$)\b/.test(p) || /\bcabo\b/.test(p) || /\bcb pm\b/.test(p) || p === 'sd' || p === 'cb') return 'cbsd';
  if (/\bsargento\b/.test(p) || /\bsgt\b/.test(p)) return 'sgt';
  if (/\bsubten(ente)?\b/.test(p) || /\bsub ten\b/.test(p) || /\bst pm\b/.test(p) || /^st$/.test(p.trim())) return 'sub';
  return 'of'; // Asp, Ten, Cap, Maj, TC, Cel
}

async function loadP1() {
  const kpis = document.getElementById('p1-kpis');
  const body = document.getElementById('p1-body');
  const renderingP1 = !!(kpis && body);
  if (renderingP1) {
    kpis.innerHTML = '<div style="color:var(--tx3);font-size:19px;padding:10px 0">Carregando...</div>';
    body.innerHTML = '';
  }
  try {
    const [r1, r2, r3, r4] = await Promise.all([
      authFetch(`${API}/efetivo`),
      authFetch(`${API}/afastamentos`),
      authFetch(`${API}/p1/vagas`),
      authFetch(`${API}/p1/quadro`)
    ]);
    p1Data   = await r1.json();
    p1Afasts = await r2.json();
    const vagasRaw = await r3.json();
    p1Vagas  = Array.isArray(vagasRaw) ? vagasRaw : [];
    const quadroRaw = await r4.json();
    p1Quadro = Array.isArray(quadroRaw) ? quadroRaw : [];
    if (renderingP1) renderP1();
    renderHome();
  } catch (err) {
    if (kpis) kpis.innerHTML = `<div style="color:#f07878;font-size:19px">${err.message}</div>`;
  }
}

function renderP1() {
  const kpisEl = document.getElementById('p1-kpis');
  const bodyEl = document.getElementById('p1-body');
  if (!kpisEl || !bodyEl) return;

  if (!p1Data.length) {
    kpisEl.innerHTML = '';
    bodyEl.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--tx3)">
      <div style="font-size:32px;margin-bottom:12px">👥</div>
      <div style="font-size:19px">Nenhum dado de efetivo importado ainda.</div>
      <div style="font-size:19px;margin-top:6px">Use o botão <b style="color:var(--gold)">↑ Importar Efetivo</b> na barra lateral.</div>
    </div>`;
    return;
  }

  const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const anoAtual = new Date().getFullYear();
  const fmtDate  = s => { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };

  // Afastamentos ativos hoje por RE
  const afastHoje = {};
  p1Afasts.forEach(a => {
    if (a.inicio && a.termino && a.inicio <= hoje && a.termino >= hoje) {
      if (!afastHoje[a.re]) afastHoje[a.re] = [];
      afastHoje[a.re].push(a);
    }
  });
  p1AfastHoje = afastHoje;

  // Filtro ativo por OPM
  const dataF = p1FiltroOpm ? p1Data.filter(r => r.opm === p1FiltroOpm) : p1Data;
  const reSetF = new Set(dataF.map(r => r.re));

  // Status de cada PM
  const pmAfastados    = dataF.filter(r => afastHoje[r.re]);
  const pmAptos        = dataF.filter(r => !afastHoje[r.re]);
  const pmComRestricao = dataF.filter(r => (r.possui_restricao || '').toLowerCase().startsWith('s'));
  const pmEapPendente  = dataF.filter(r => {
    if (!r.data_eap) return true;
    const d = new Date(r.data_eap);
    return isNaN(d) || d.getUTCFullYear() !== anoAtual;
  });
  const pmEapFeito = dataF.filter(r => {
    if (!r.data_eap) return false;
    const d = new Date(r.data_eap);
    return !isNaN(d) && d.getUTCFullYear() === anoAtual;
  });
  const TAFTAT_REPROV = new Set(['inapto','ruim']);
  const inaptosTaf = dataF.filter(r => TAFTAT_REPROV.has((r.taf||'').toLowerCase().trim()));
  const inaptosTat = dataF.filter(r => TAFTAT_REPROV.has((r.tat||'').toLowerCase().trim()));
  const taftatVencFn = pm => {
    if (!pm.data_eap) return false;
    const d = new Date(pm.data_eap), lim = new Date(d);
    lim.setFullYear(lim.getFullYear() + 1);
    return new Date() > lim;
  };
  const taftatVencidos = dataF.filter(taftatVencFn);

  // ── Controle de Férias / LP
  const isLP  = t => /^lp$/i.test((t || '').trim());
  const em15s = (() => { const d = new Date(); d.setDate(d.getDate() + 15); return d.toISOString().split('T')[0]; })();
  const em30s = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
  const afastsF      = p1FiltroOpm ? p1Afasts.filter(a => reSetF.has(a.re)) : p1Afasts;
  const ferEmGozo    = afastsF.filter(a => isFer(a.tipo_afastamento) && a.inicio <= hoje && a.termino >= hoje);
  const ferEm15Dias  = afastsF.filter(a => isFer(a.tipo_afastamento) && a.inicio > hoje && a.inicio <= em15s);
  const ferLpEm30    = afastsF.filter(a => (isFer(a.tipo_afastamento) || isLP(a.tipo_afastamento)) && a.inicio > hoje && a.inicio <= em30s);
  // Todos os tipos de afastamento iniciando nos próximos 30 dias (para planejamento de escala)
  const afastEm30    = afastsF.filter(a => a.inicio > hoje && a.inicio <= em30s);
  const resFeriasAno = new Set(p1Afasts.filter(a => isFer(a.tipo_afastamento) && (a.inicio||'').startsWith(String(anoAtual))).map(a => a.re));
  const semFeriasAno = dataF.filter(r => !resFeriasAno.has(r.re));

  // Restrições vencendo em 30 dias
  const vencendoRestricao = p1Data.filter(r =>
    (r.possui_restricao || '').toLowerCase().startsWith('s') &&
    r.restricao_termino && r.restricao_termino >= hoje && r.restricao_termino <= em30s
  );

  // Afastamentos vencendo em 7 dias
  const em7 = new Date(); em7.setDate(em7.getDate() + 7);
  const em7s = em7.toISOString().split('T')[0];
  const retornando = p1Afasts.filter(a =>
    a.inicio <= hoje && a.termino >= hoje && a.termino <= em7s
  );

  const CATS = { cbsd: 'Cb / Sd', sgt: 'Sargentos', sub: 'Subtenentes', of: 'Oficiais' };
  const CATS_COLOR = { cbsd: '#4bc87a', sgt: '#e05555', sub: '#5a9de0', of: '#c8a84b' };
  const count = (arr, cat) => arr.filter(r => p1Cat(r.posto) === cat).length;
  const total = dataF.length;

  // ── KPI cards (clicáveis)
  kpisEl.style.gridTemplateColumns = 'repeat(auto-fill,minmax(210px,1fr))';
  const kpiCard = (label, val, sub, color, key) =>
    `<div onclick="p1ShowKpiDetail('${key}')" style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:22px 24px;cursor:pointer;transition:all .2s;min-height:140px;display:flex;flex-direction:column;justify-content:space-between" onmouseover="this.style.borderColor='${color}';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='var(--bd)';this.style.transform=''">
      <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:var(--tx);text-transform:uppercase">${label}</div>
      <div style="font-size:34px;font-weight:800;color:${color};font-family:'Barlow Condensed',sans-serif;line-height:1;margin:8px 0 6px">${val}</div>
      <div>
        ${sub ? `<div style="font-size:19px;color:var(--tx3);margin-bottom:8px;line-height:1.4">${sub}</div>` : ''}
        <div style="height:2px;background:${color};opacity:.25;border-radius:1px"></div>
      </div>
    </div>`;

  // Tipos de afastamento agrupados
  const tiposCount = {};
  pmAfastados.forEach(r => { (afastHoje[r.re] || []).forEach(a => { tiposCount[a.tipo_afastamento] = (tiposCount[a.tipo_afastamento] || 0) + 1; }); });
  const tiposSub = Object.entries(tiposCount).map(([t,n]) => `${n} ${t}`).join(' · ') || '';

  kpisEl.innerHTML =
    kpiCard('Total Efetivo', total, Object.keys(CATS).filter(k=>count(dataF,k)>0).map(k=>`<span style="color:${CATS_COLOR[k]}">${count(dataF,k)} ${CATS[k]}</span>`).join('<span style="color:var(--bd2);margin:0 4px">·</span>'), 'var(--tx)', 'total') +
    kpiCard('Aptos', pmAptos.length, total > 0 ? `${Math.round(pmAptos.length/total*100)}% do efetivo` : '—', '#4bc87a', 'aptos') +
    kpiCard('Afastamentos', pmAfastados.length, tiposSub || '—', pmAfastados.length > 0 ? '#e05555' : 'var(--tx3)', 'afastados') +
    kpiCard('Em Restrição', pmComRestricao.length, vencendoRestricao.length > 0 ? `⚠ ${vencendoRestricao.length} vencem em 30 dias` : '—', pmComRestricao.length > 0 ? '#c8a84b' : 'var(--tx3)', 'restricao') +
    kpiCard(`EAP / TAF / TAT ${anoAtual}`, pmEapFeito.length,
      `<span style="color:#4bc87a">${pmEapFeito.length} realizaram</span> · <span style="color:#c8a84b">${pmEapPendente.length} pendentes</span>` +
      (inaptosTaf.length ? ` · <span style="color:#e05555">${inaptosTaf.length} inapto${inaptosTaf.length>1?'s':''} TAF</span>` : '') +
      (inaptosTat.length ? ` · <span style="color:#e05555">${inaptosTat.length} inapto${inaptosTat.length>1?'s':''} TAT</span>` : '') +
      (taftatVencidos.length ? ` · <span style="color:#e05555">${taftatVencidos.length} vencidos</span>` : ''),
      (inaptosTaf.length || inaptosTat.length || taftatVencidos.length) ? '#e05555' : pmEapPendente.length > 0 ? '#c8a84b' : '#4bc87a', 'eap') +
    kpiCard('Controle de Férias', ferEmGozo.length, `${ferEmGozo.length} em gozo · ${ferEm15Dias.length} em 15d`, ferEmGozo.length > 0 ? '#5a9de0' : 'var(--tx3)', 'ferias') +
    (() => {
      if (!p1Quadro.length) return '';
      const excl = s => /cfp|uis\s*m[eé]d|uis\s*odonto/i.test(s||'');
      const qRows = p1Quadro.filter(q => !excl(q.opm));
      const gtFx = qRows.reduce((a,q) => a + (Number(q.fx_total)||0), 0);
      const gtEx = qRows.reduce((a,q) => a + (Number(q.ex_total)||0), 0);
      const gtClaro = gtFx - gtEx;
      const gtPct = gtFx > 0 ? ((gtClaro/gtFx)*100).toFixed(1)+'%' : '—';
      const estouradas = qRows.filter(q => (Number(q.fx_total)||0) - (Number(q.ex_total)||0) < 0).length;
      const cor = gtClaro < 0 ? '#e05555' : gtClaro === 0 ? '#c8a84b' : '#4bc87a';
      const sub = estouradas > 0
        ? `<span style="color:#e05555">⚠ ${estouradas} unid. estouradas</span> · FX ${gtFx} / EX ${gtEx}`
        : `FX ${gtFx} / EX ${gtEx} · ${gtPct} claro`;
      return kpiCard('Quadro Fixado', `${gtClaro >= 0 ? '−' : '+'}${Math.abs(gtClaro)}`, sub, cor, 'quadro');
    })();

  const thS = 'padding:8px 12px;border-bottom:1px solid var(--bd2);font-family:"DM Mono",monospace;font-size:19px;color:#ffffff;letter-spacing:1px;text-transform:uppercase;text-align:right';
  const thL = thS.replace('text-align:right','text-align:left');
  const tdS = 'padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-family:"DM Mono",monospace;font-size:19px;color:var(--tx3);text-align:right';
  const tdL = 'padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-size:19px;font-weight:600;color:var(--tx)';
  const badge = (txt, color) => `<span style="padding:3px 9px;border-radius:20px;font-size:19px;font-family:'DM Mono',monospace;background:${color}22;color:${color}">${txt}</span>`;

  // ── Seção: Afastados agora
  let afastSection = '';
  if (pmAfastados.length) {
    const afRows = pmAfastados.map(r => {
      const ats = afastHoje[r.re] || [];
      const tipo = ats.map(a => a.tipo_afastamento).join(', ');
      const termino = ats[0]?.termino || '';
      const diasRest = termino ? Math.ceil((new Date(termino) - new Date(hoje)) / 86400000) : '—';
      const _escB = s => (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      const _fotoRe = _escB(r.re);
      const _fotoNm = _escB(r.nome_guerra || r.nome);
      const _fotoPt = _escB(r.posto || '');
      const _av = `<div data-foto-re="${r.re}" data-nome="${(r.nome_guerra||r.nome).replace(/"/g,'&quot;')}" data-posto="${(r.posto||'').replace(/"/g,'&quot;')}" onclick="openProntuario('${_fotoRe}')" style="cursor:pointer;display:inline-block">${p1AvatarSVG(r.nome_guerra||r.nome, r.posto)}</div>`;
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.03);width:44px;vertical-align:middle">${_av}</td>
        <td style="${tdS.replace('text-align:right','text-align:left')};color:var(--tx2)">${r.posto || '—'}</td>
        <td style="${tdS.replace('text-align:right','text-align:left')};color:var(--tx3)">${r.re || '—'}</td>
        <td style="${tdL};cursor:pointer" onclick="openProntuario('${_fotoRe}')">${r.nome_guerra || r.nome}</td>
        <td style="${tdS.replace('text-align:right','text-align:left')};color:var(--tx3)">${r.opm || '—'}</td>
        <td style="${tdS.replace('text-align:right','text-align:left')}">${badge(tipo, '#e05555')}</td>
        <td style="${tdS}">${fmtDate(ats[0]?.inicio)}</td>
        <td style="${tdS}">${fmtDate(termino)}</td>
        <td style="${tdS};color:${diasRest <= 3 ? '#4bc87a' : 'var(--tx3)'}">${diasRest !== '—' ? diasRest + 'd' : '—'}</td>
      </tr>`;
    }).join('');
    afastSection = `
      <div style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;overflow-x:auto;margin-bottom:14px">
        <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:#e05555;padding:14px 16px 0;text-transform:uppercase">Afastamentos — ${pmAfastados.length}</div>
        <table style="width:100%;border-collapse:collapse;margin-top:8px">
          <thead><tr>
            <th style="${thL};width:44px;padding:8px 4px 8px 8px"></th><th style="${thL}">Posto</th><th style="${thL}">RE</th><th style="${thL}">Nome de Guerra</th><th style="${thL}">OPM</th>
            <th style="${thL}">Tipo</th><th style="${thS}">Início</th><th style="${thS}">Término</th><th style="${thS}">Dias restantes</th>
          </tr></thead><tbody>${afRows}</tbody>
        </table>
      </div>`;
  }

  // ── Alertas
  let alertSection = '';
  const alertItems = [];
  if (vencendoRestricao.length) {
    vencendoRestricao.forEach(r => {
      const dias = Math.ceil((new Date(r.restricao_termino) - new Date(hoje)) / 86400000);
      alertItems.push(`<div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);display:flex;gap:12px;align-items:center">
        ${badge('RESTRIÇÃO', '#c8a84b')}
        <span style="font-size:19px;color:var(--tx)">${r.nome_guerra || r.nome}</span>
        <span style="font-size:19px;color:#ffffff">${r.opm || ''}</span>
        <span style="font-size:19px;color:#ffffff;margin-left:auto">Vence em <b style="color:#c8a84b">${dias}d</b> — ${fmtDate(r.restricao_termino)}</span>
      </div>`);
    });
  }
  if (retornando.length) {
    retornando.forEach(a => {
      const pm = p1Data.find(r => r.re === a.re);
      const dias = Math.ceil((new Date(a.termino) - new Date(hoje)) / 86400000);
      alertItems.push(`<div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);display:flex;gap:12px;align-items:center">
        ${badge('RETORNO', '#4bc87a')}
        <span style="font-size:19px;color:var(--tx)">${pm?.nome_guerra || a.nome || a.re}</span>
        <span style="font-size:19px;color:#ffffff">${a.tipo_afastamento}</span>
        <span style="font-size:19px;color:#ffffff;margin-left:auto">Retorna em <b style="color:#4bc87a">${dias}d</b> — ${fmtDate(a.termino)}</span>
      </div>`);
    });
  }
  if (ferLpEm30.length) {
    ferLpEm30.sort((a, b) => (a.inicio||'').localeCompare(b.inicio||'')).forEach(a => {
      const pm = p1Data.find(r => r.re === a.re);
      const diasAte = Math.ceil((new Date(a.inicio) - new Date(hoje)) / 86400000);
      const tipo = isFer(a.tipo_afastamento) ? 'FÉRIAS' : 'LP';
      const cor  = isFer(a.tipo_afastamento) ? '#5a9de0' : '#9b6de0';
      alertItems.push(`<div style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);display:flex;gap:12px;align-items:center">
        ${badge(tipo, cor)}
        <span style="font-size:19px;color:var(--tx2)">${pm?.posto||''}</span>
        <span style="font-size:19px;color:var(--tx)">${pm?.nome_guerra || pm?.nome || a.re}</span>
        <span style="font-size:19px;color:#ffffff;margin-left:auto">Inicia em <b style="color:${cor}">${diasAte}d</b> — ${fmtDate(a.inicio)}</span>
      </div>`);
    });
  }
  if (alertItems.length) {
    alertSection = `
      <div style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;margin-bottom:14px">
        <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:#c8a84b;padding:14px 16px 8px;text-transform:uppercase">Alertas</div>
        ${alertItems.join('')}
      </div>`;
  }

  // ── Tabela por OPM
  const byUnit = {};
  dataF.forEach(r => {
    const u = r.opm || 'Não Informada';
    if (!byUnit[u]) byUnit[u] = [];
    byUnit[u].push(r);
  });
  p1ByUnit = byUnit;
  const unitsSorted = Object.entries(byUnit).sort((a, b) => b[1].length - a[1].length);
  // ── Cards por CIA com sub-unidades ──────────────────────────────────────────
  const getPms = keys => Object.entries(byUnit).filter(([opm]) => _opmMatch(opm, keys)).flatMap(([,arr]) => arr);
  const statsOf = pms => {
    const afst_ = pms.filter(r => afastHoje[r.re]).length;
    const restr_ = pms.filter(r => (r.possui_restricao||'').toLowerCase().startsWith('s')).length;
    const aptos_ = pms.length - afst_;
    const pct_   = pms.length ? Math.round(aptos_ / pms.length * 100) : 0;
    const color_ = pct_ >= 85 ? '#4bc87a' : pct_ >= 70 ? '#c8a84b' : '#e8b840';
    return { afst: afst_, restr: restr_, aptos: aptos_, pct: pct_, color: color_, total: pms.length };
  };

  // Detecta OPMs que não se encaixam em nenhuma CIA para exibir separado
  const allCiaKeys = CIA_STRUCT.flatMap(c => c.units.flatMap(u => u.keys));
  const unmatchedUnits = unitsSorted.filter(([opm]) => !_opmMatch(opm, allCiaKeys));

  const ciaCards = CIA_STRUCT.map((cia, ci) => {
    const ciaPms  = getPms(cia.units.flatMap(u => u.keys));
    if (!ciaPms.length) return '';
    const s = statsOf(ciaPms);
    const catLine = Object.keys(CATS).map(k => {
      const n = ciaPms.filter(r => p1Cat(r.posto) === k).length;
      return n ? `<span style="color:${CATS_COLOR[k]}">${n} ${CATS[k]}</span>` : '';
    }).filter(Boolean).join('<span style="color:var(--bd2);margin:0 4px">·</span>');

    const unitBtns = cia.units.map((u, ui) => {
      const upms = getPms(u.keys);
      if (!upms.length) return '';
      const us = statsOf(upms);
      return `<button class="p1-ubtn" data-ci="${ci}" data-ui="${ui}" onclick="p1ShowByKeys(${ci},${ui},'${u.label.replace(/'/g,"\\'")}');event.stopPropagation()"
        style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:8px 12px;cursor:pointer;text-align:left;transition:all .15s;color:var(--tx2)"
        onmouseover="if(!this.classList.contains('sel')){this.style.borderColor='${cia.color}';this.style.color='var(--tx)'}"
        onmouseout="if(!this.classList.contains('sel')){this.style.borderColor='rgba(255,255,255,.1)';this.style.color='var(--tx2)'}">
        <div style="font-size:19px;font-weight:600;color:#ffffff;white-space:nowrap">${u.label}</div>
        <div style="font-family:'DM Mono',monospace;font-size:19px;margin-top:3px;display:flex;gap:8px">
          <span style="color:#4bc87a">${us.aptos} aptos</span>
          ${us.afst > 0 ? `<span style="color:#e05555">${us.afst} afst</span>` : ''}
          ${us.restr > 0 ? `<span style="color:#c8a84b">${us.restr} restr</span>` : ''}
        </div>
      </button>`;
    }).join('');

    return `<div class="p1-uc" data-ci="${ci}"
      style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid ${cia.color};border-radius:10px;padding:20px;transition:all .2s;cursor:default"
      onmouseover="if(!this.classList.contains('sel')){this.style.boxShadow='0 4px 20px rgba(0,0,0,.3)';this.style.transform='translateY(-2px)'}"
      onmouseout="if(!this.classList.contains('sel')){this.style.boxShadow='';this.style.transform=''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px">40º BPM/I</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:800;color:${cia.color};letter-spacing:.5px;line-height:1">${cia.label}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;margin-top:2px">Sede · ${cia.sede}</div>
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);text-align:right">efetivo<br><span style="font-size:20px;font-weight:700;color:var(--tx)">${s.total}</span></div>
      </div>
      <div style="background:rgba(255,255,255,.06);border-radius:4px;height:5px;overflow:hidden;margin-bottom:10px">
        <div style="height:100%;width:${s.pct}%;background:${s.color};border-radius:4px;transition:width .5s ease"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:14px;text-align:center">
        <div style="background:rgba(255,255,255,.03);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;color:${s.color};line-height:1">${s.pct}%</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-top:1px">DISP</div>
        </div>
        <div style="background:rgba(75,200,122,.07);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;color:#4bc87a;line-height:1">${s.aptos}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#4bc87a;margin-top:1px">APTOS</div>
        </div>
        <div style="background:rgba(230,100,100,.07);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;color:${s.afst>0?'#e05555':'var(--tx3)'};line-height:1">${s.afst}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:${s.afst>0?'#e05555':'var(--tx3)'};margin-top:1px">AFST</div>
        </div>
        <div style="background:rgba(200,168,75,.07);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;color:${s.restr>0?'#c8a84b':'var(--tx3)'};line-height:1">${s.restr}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:${s.restr>0?'#c8a84b':'var(--tx3)'};margin-top:1px">RESTR</div>
        </div>
      </div>
      <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;margin-bottom:12px;line-height:1.8">${catLine}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${unitBtns}</div>
    </div>`;
  }).join('');

  // OPMs não mapeadas na estrutura orgânica
  const unmatchedCards = unmatchedUnits.map(([unit, d]) => {
    const s = statsOf(d);
    const _esc = unit.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    const catLine = Object.keys(CATS).map(k => {
      const n = count(d, k);
      return n ? `<span style="color:${CATS_COLOR[k]}">${n} ${CATS[k]}</span>` : '';
    }).filter(Boolean).join('<span style="color:var(--bd2);margin:0 4px">·</span>');
    return `<div class="p1-uc" data-unit="${unit.replace(/"/g,'&quot;')}" onclick="p1ShowUnit('${_esc}')"
      style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid ${s.color};border-radius:10px;padding:20px;cursor:pointer;transition:all .2s"
      onmouseover="if(!this.classList.contains('sel')){this.style.boxShadow='0 4px 16px rgba(0,0,0,.3)';this.style.transform='translateY(-2px)'}"
      onmouseout="if(!this.classList.contains('sel')){this.style.boxShadow='';this.style.transform=''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px">40º BPM/I</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:800;color:${s.color};letter-spacing:.5px;line-height:1">${unit}</div>
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);text-align:right">efetivo<br><span style="font-size:20px;font-weight:700;color:var(--tx)">${d.length}</span></div>
      </div>
      <div style="background:rgba(255,255,255,.06);border-radius:4px;height:5px;overflow:hidden;margin-bottom:10px">
        <div style="height:100%;width:${s.pct}%;background:${s.color};border-radius:4px;transition:width .5s ease"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:14px;text-align:center">
        <div style="background:rgba(255,255,255,.03);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;color:${s.color};line-height:1">${s.pct}%</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-top:1px">DISP</div>
        </div>
        <div style="background:rgba(75,200,122,.07);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;color:#4bc87a;line-height:1">${s.aptos}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#4bc87a;margin-top:1px">APTOS</div>
        </div>
        <div style="background:rgba(230,100,100,.07);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;color:${s.afst>0?'#e05555':'var(--tx3)'};line-height:1">${s.afst}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:${s.afst>0?'#e05555':'var(--tx3)'};margin-top:1px">AFST</div>
        </div>
        <div style="background:rgba(200,168,75,.07);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;color:${s.restr>0?'#c8a84b':'var(--tx3)'};line-height:1">${s.restr}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:${s.restr>0?'#c8a84b':'var(--tx3)'};margin-top:1px">RESTR</div>
        </div>
      </div>
      <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;border-top:1px solid rgba(255,255,255,.05);padding-top:10px;line-height:1.8">${catLine || '—'}</div>
    </div>`;
  }).join('');

  // ── Claro Operacional (visível e editável apenas por p1/ti)
  let claroSection = '';
  const _claroRole = currentRole();
  if (['p1','ti'].includes(_claroRole) && p1Vagas.length) {
    const vagasMap = {};
    p1Vagas.forEach(v => { vagasMap[v.opm] = Number(v.vagas); });
    const claroData = unitsSorted.map(([unit, d]) => {
      const vagas = vagasMap[unit];
      if (!vagas) return null;
      const afst     = d.filter(r => afastHoje[r.re]).length;
      const presentes = d.length - afst;
      const pct       = Math.min(100, Math.round(presentes / vagas * 100));
      const claro     = Math.max(0, vagas - presentes);
      const pctColor  = pct >= 85 ? '#4bc87a' : pct >= 70 ? '#c8a84b' : '#e8b840';
      return { unit, vagas, presentes, afst, pct, pctColor, claro };
    }).filter(Boolean).sort((a, b) => a.pct - b.pct);

    if (claroData.length) {
      const rows = claroData.map(r => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.03)">
          <div style="width:180px;font-size:19px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.unit}</div>
          <div style="flex:1;background:rgba(255,255,255,.05);border-radius:4px;height:8px;overflow:hidden">
            <div style="height:100%;width:${r.pct}%;background:${r.pctColor};border-radius:4px;transition:width .4s"></div>
          </div>
          <div style="width:46px;text-align:right;font-family:'DM Mono',monospace;font-size:19px;font-weight:700;color:${r.pctColor}">${r.pct}%</div>
          <div style="width:110px;font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);text-align:right">${r.presentes}/${r.vagas} vagas</div>
          <div style="width:80px;font-family:'DM Mono',monospace;font-size:19px;text-align:right;color:${r.claro > 0 ? '#e05555' : '#4bc87a'}">${r.claro > 0 ? '−' + r.claro + ' claro' : 'completo'}</div>
        </div>`).join('');
      claroSection = `<div style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;overflow:hidden;margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px">
          <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:#5a9de0;text-transform:uppercase">Claro Operacional — Ranking por Disponibilidade</div>
          <button onclick="openVagasModal()" style="font-size:19px;padding:5px 12px;background:rgba(90,157,224,.1);border:1px solid rgba(90,157,224,.25);color:#5a9de0;border-radius:4px;cursor:pointer">⚙ Editar Vagas</button>
        </div>
        ${rows}
      </div>`;
    }
  } else if (['p1','ti'].includes(_claroRole)) {
    claroSection = `<div style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:16px 18px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px">
      <div>
        <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:#5a9de0;text-transform:uppercase;margin-bottom:4px">Claro Operacional</div>
        <div style="font-size:19px;color:var(--tx3)">Configure o efetivo fixado (vagas) para calcular o claro operacional por unidade.</div>
      </div>
      <button onclick="openVagasModal()" style="padding:9px 18px;background:rgba(90,157,224,.15);border:1px solid rgba(90,157,224,.3);color:#5a9de0;border-radius:6px;cursor:pointer;font-size:19px;white-space:nowrap">⚙ Configurar Vagas</button>
    </div>`;
  }

  // ── Seção de afastamentos + alertas unificada (vai para o rodapé, abaixo das CIAs)
  const _esc2 = s => (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  let bottomItems = [];

  // Quem ESTÁ afastado agora
  if (pmAfastados.length) {
    pmAfastados.forEach(r => {
      const ats = afastHoje[r.re] || [];
      const tipo = ats.map(a => a.tipo_afastamento).join(', ') || 'Afastado';
      const termino = ats[0]?.termino || '';
      const diasRest = termino ? Math.ceil((new Date(termino) - new Date(hoje)) / 86400000) : null;
      const retStr = diasRest !== null ? `retorna em <b style="color:#e05555">${diasRest}d</b> · ${fmtDate(termino)}` : fmtDate(termino)||'—';
      bottomItems.push({ order: 0, html: `<div style="padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.04);display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        ${badge(tipo.split(',')[0].trim().toUpperCase(), '#e05555')}
        <span style="font-size:19px;color:var(--tx3)">${r.posto||''}</span>
        <span style="font-size:19px;font-weight:600;color:var(--tx);cursor:pointer" onclick="openProntuario('${_esc2(r.re)}')">${r.nome_guerra||r.nome}</span>
        <span style="font-size:19px;color:var(--tx3)">${r.opm||''}</span>
        <span style="font-size:19px;color:var(--tx3);margin-left:auto">${retStr}</span>
      </div>` });
    });
  }

  // Alertas existentes (restrições, retornos, férias/LP em 30d)
  if (vencendoRestricao.length) {
    vencendoRestricao.forEach(r => {
      const dias = Math.ceil((new Date(r.restricao_termino) - new Date(hoje)) / 86400000);
      bottomItems.push({ order: 1, html: `<div style="padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.04);display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        ${badge('RESTRIÇÃO', '#c8a84b')}
        <span style="font-size:19px;font-weight:600;color:var(--tx)">${r.nome_guerra||r.nome}</span>
        <span style="font-size:19px;color:var(--tx3)">${r.opm||''}</span>
        <span style="font-size:19px;color:var(--tx3);margin-left:auto">Vence em <b style="color:#c8a84b">${dias}d</b> · ${fmtDate(r.restricao_termino)}</span>
      </div>` });
    });
  }
  if (afastEm30.length) {
    const TIPO_COR = t => {
      const tl = (t||'').toLowerCase();
      if (/f[eé]rias/.test(tl))          return ['FÉRIAS',     '#5a9de0'];
      if (/\blp\b|premio/.test(tl))       return ['LP',         '#9b6de0'];
      if (/\blts\b|trat/.test(tl))        return ['LTS',        '#e05555'];
      if (/\blsv\b|sem.venc/.test(tl))    return ['LSV',        '#c8a84b'];
      if (/n[uú]pcia/.test(tl))           return ['NÚPCIAS',    '#f1c40f'];
      if (/maternidade/.test(tl))         return ['MATERNIDADE','#e91e63'];
      if (/paternidade/.test(tl))         return ['PATERNIDADE','#2196f3'];
      if (/luto/.test(tl))                return ['LUTO',       '#95a5a6'];
      if (/conval/.test(tl))              return ['CONVAL',     '#e67e22'];
      return [(t||'AFASTAMENTO').toUpperCase().slice(0,12), '#607090'];
    };
    afastEm30.sort((a,b) => (a.inicio||'').localeCompare(b.inicio||'')).forEach(a => {
      const pm = p1Data.find(r => r.re === a.re);
      const diasAte = Math.ceil((new Date(a.inicio) - new Date(hoje)) / 86400000);
      const [label, cor] = TIPO_COR(a.tipo_afastamento);
      bottomItems.push({ order: 3, html: `<div style="padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.04);display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        ${badge(label, cor)}
        <span style="font-size:19px;color:var(--tx3)">${pm?.posto||''}</span>
        <span style="font-size:19px;font-weight:600;color:var(--tx)">${pm?.nome_guerra||pm?.nome||a.re}</span>
        <span style="font-size:19px;color:var(--tx3)">${pm?.opm||''}</span>
        <span style="font-size:19px;color:var(--tx3);margin-left:auto">Inicia em <b style="color:${cor}">${diasAte}d</b> · ${fmtDate(a.inicio)} → ${fmtDate(a.termino)}</span>
      </div>` });
    });
  }

  const nowItems  = bottomItems.filter(i => i.order <= 1); // afastados agora + restrições
  const nextItems = bottomItems.filter(i => i.order >= 3); // próximos afastamentos

  const mkBlock = (titulo, cor, items) => !items.length ? '' : `
    <div style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;margin-top:14px;overflow:hidden">
      <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:${cor};padding:10px 16px 8px;text-transform:uppercase;border-bottom:1px solid var(--bd)">${titulo} — ${items.length}</div>
      ${items.sort((a,b)=>a.order-b.order).map(i=>i.html).join('')}
    </div>`;

  const bottomSection =
    mkBlock('Em Afastamento', '#e05555', nowItems) +
    mkBlock('Próximos Afastamentos — 30 dias', '#5a9de0', nextItems);

  bodyEl.innerHTML = claroSection + `
    <div style="margin-bottom:6px">
      <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:#ffffff;text-transform:uppercase;margin-bottom:14px">Efetivo por Companhia <span style="font-weight:400">· clique na sub-unidade para ver os PMs</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
        ${ciaCards}${unmatchedCards}
      </div>
    </div>
    <div id="p1-unit-detail"></div>
    ${bottomSection}`;

  // Mostra botão exportar quando há dados
  const btnE = document.getElementById('btn-exportar-p1');
  if (btnE) btnE.style.display = 'inline-block';
}

// ── Upload modal P1
function openP1Upload() {
  const mo = document.getElementById('p1-upl-mo');
  mo.style.display = 'flex';
  document.getElementById('p1-upl-file').value = '';
  document.getElementById('p1-upl-preview').textContent = '';
  document.getElementById('p1-upl-msg').textContent = '';
  document.getElementById('p1-upl-btn').disabled = true;
  document.getElementById('p1-upl-btn').style.opacity = '.5';
  p1Parsed = [];
}

function closeP1Upload() {
  document.getElementById('p1-upl-mo').style.display = 'none';
}

function p1UplClickOut(e) {
  if (e.target === document.getElementById('p1-upl-mo')) closeP1Upload();
}

function p1FileChange() {
  const file = document.getElementById('p1-upl-file').files[0];
  const prev = document.getElementById('p1-upl-preview');
  const btn  = document.getElementById('p1-upl-btn');
  const msg  = document.getElementById('p1-upl-msg');
  p1Parsed = [];
  btn.disabled = true;
  btn.style.opacity = '.5';
  prev.innerHTML = '';
  msg.innerHTML = '';
  if (!file) return;

  // Normaliza cabeçalhos para nomes canônicos
  const HEADER_MAP = {
    'opm': 'OPM',
    'posto / grad': 'Posto', 'posto/grad': 'Posto', 'posto': 'Posto',
    'graduacao': 'Posto', 'graduação': 'Posto',
    're': 'RE',
    'nome completo': 'Nome', 'nome': 'Nome',
    'função': 'Funcao', 'funcao': 'Funcao',
    'genero': 'Genero', 'gênero': 'Genero',
    'nome de guerra': 'NomeGuerra',
    'data eap': 'DataEAP',
    'possui restrição': 'PossuiRestricao', 'possui restricao': 'PossuiRestricao',
    'tipos de restrição': 'TiposRestricao', 'tipos de restricao': 'TiposRestricao',
    'restrição inicio': 'RestricaoInicio', 'restricao inicio': 'RestricaoInicio',
    'restrição término': 'RestricaoTermino', 'restricao termino': 'RestricaoTermino',
    'restrição termino': 'RestricaoTermino'
  };

  Papa.parse(file, {
    header: true, skipEmptyLines: true,
    transformHeader: h => HEADER_MAP[h.trim().toLowerCase()] || h.trim(),
    complete: r => {
      if (!r.data.length) {
        prev.innerHTML = '<span style="color:#f07878">Arquivo vazio ou sem registros válidos.</span>';
        return;
      }
      const required = ['OPM', 'Posto', 'RE', 'Nome'];
      const headers  = Object.keys(r.data[0]);
      const missing  = required.filter(c => !headers.includes(c));
      if (missing.length) {
        prev.innerHTML = `<span style="color:#f07878">Colunas ausentes: <b>${missing.join(', ')}</b>.<br>Colunas esperadas: OPM, Posto / Grad, RE, Nome Completo.</span>`;
        return;
      }
      p1Parsed = r.data.map(row => {
        const n = {};
        Object.entries(row).forEach(([k, v]) => { n[k] = (v || '').trim(); });
        return n;
      }).filter(row => row.Nome && row.Posto);

      const opms = [...new Set(p1Parsed.map(r => r.OPM).filter(Boolean))];
      prev.innerHTML = `<span style="color:#4bc87a">✓ <b>${p1Parsed.length}</b> militares lidos — ${opms.length} OPM(s): ${opms.join(', ')}.</span>`;
      btn.disabled = false;
      btn.style.opacity = '1';
    },
    error: err => { prev.innerHTML = `<span style="color:#f07878">Erro ao ler o arquivo: ${err.message}</span>`; }
  });
}

async function p1ConfirmUpload() {
  const btn = document.getElementById('p1-upl-btn');
  const msg = document.getElementById('p1-upl-msg');
  if (!p1Parsed.length) return;
  btn.disabled = true;
  btn.style.opacity = '.5';
  msg.innerHTML = '<span style="color:var(--tx3)">Enviando...</span>';
  try {
    const res = await authFetch(`${API}/efetivo/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: p1Parsed })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
    msg.innerHTML = `<span style="color:#4bc87a">✓ ${data.inserted} registros importados com sucesso.</span>`;
    registraUpload();
    await loadP1();
    setTimeout(closeP1Upload, 1500);
  } catch (err) {
    msg.innerHTML = `<span style="color:#f07878">Erro: ${err.message}</span>`;
    btn.disabled = false;
    btn.style.opacity = '1';
  }
}

// ── Upload Afastamentos
function openAfUpload() {
  const mo = document.getElementById('af-upl-mo');
  mo.style.display = 'flex';
  document.getElementById('af-upl-file').value = '';
  document.getElementById('af-upl-preview').textContent = '';
  document.getElementById('af-upl-msg').textContent = '';
  document.getElementById('af-upl-btn').disabled = true;
  document.getElementById('af-upl-btn').style.opacity = '.5';
  p1AfParsed = [];
}
function closeAfUpload() { document.getElementById('af-upl-mo').style.display = 'none'; }
function afUplClickOut(e) { if (e.target === document.getElementById('af-upl-mo')) closeAfUpload(); }

function afFileChange() {
  const file = document.getElementById('af-upl-file').files[0];
  const prev = document.getElementById('af-upl-preview');
  const btn  = document.getElementById('af-upl-btn');
  p1AfParsed = [];
  btn.disabled = true; btn.style.opacity = '.5';
  prev.innerHTML = ''; document.getElementById('af-upl-msg').innerHTML = '';
  if (!file) return;
  const HEADER_MAP = {
    're': 'RE', 'nome': 'Nome', 'nome completo': 'Nome', 'opm': 'OPM',
    'tipo de afastamento': 'Tipo', 'tipo afastamento': 'Tipo', 'tipo': 'Tipo',
    'n° de dias': 'NDias', 'nº de dias': 'NDias', 'n de dias': 'NDias', 'n_dias': 'NDias', 'dias': 'NDias',
    'início': 'Inicio', 'inicio': 'Inicio',
    'término': 'Termino', 'termino': 'Termino',
    'nbi': 'NBI', 'bol g': 'BolG', 'bol. g': 'BolG', 'bolg': 'BolG',
    'sipa': 'SIPA', 'sgp': 'SGP', 'paf': 'PAF',
    'obs': 'Obs', 'observação': 'Obs', 'observacao': 'Obs'
  };
  Papa.parse(file, {
    header: true, skipEmptyLines: true,
    transformHeader: h => HEADER_MAP[h.trim().toLowerCase()] || h.trim(),
    complete: r => {
      if (!r.data.length) { prev.innerHTML = '<span style="color:#f07878">Arquivo vazio.</span>'; return; }
      const required = ['RE', 'Tipo', 'Inicio', 'Termino'];
      const missing  = required.filter(c => !Object.keys(r.data[0]).includes(c));
      if (missing.length) {
        prev.innerHTML = `<span style="color:#f07878">Colunas ausentes: <b>${missing.join(', ')}</b>.<br>Esperadas: RE, Tipo de Afastamento, Início, Término.</span>`;
        return;
      }
      p1AfParsed = r.data.map(row => { const n = {}; Object.entries(row).forEach(([k,v]) => { n[k] = (v||'').trim(); }); return n; })
        .filter(row => row.RE && row.Tipo && row.Inicio && row.Termino);
      const tipos = [...new Set(p1AfParsed.map(r => r.Tipo).filter(Boolean))];
      prev.innerHTML = `<span style="color:#4bc87a">✓ <b>${p1AfParsed.length}</b> registros lidos — tipos: ${tipos.join(', ')}.</span>`;
      btn.disabled = false; btn.style.opacity = '1';
    },
    error: err => { prev.innerHTML = `<span style="color:#f07878">Erro: ${err.message}</span>`; }
  });
}

async function afConfirmUpload() {
  const btn = document.getElementById('af-upl-btn');
  const msg = document.getElementById('af-upl-msg');
  if (!p1AfParsed.length) return;
  btn.disabled = true; btn.style.opacity = '.5';
  msg.innerHTML = '<span style="color:var(--tx3)">Enviando...</span>';
  try {
    const res = await authFetch(`${API}/afastamentos/upload`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: p1AfParsed })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
    msg.innerHTML = `<span style="color:#4bc87a">✓ ${data.inserted} afastamentos importados.</span>`;
    registraUpload();
    await loadP1();
    setTimeout(closeAfUpload, 1500);
  } catch (err) {
    msg.innerHTML = `<span style="color:#f07878">Erro: ${err.message}</span>`;
    btn.disabled = false; btn.style.opacity = '1';
  }
}

// ── KPI Detail ───────────────────────────────────────────────────────────────

function wrapDetail(_title, _count, _color, _closeBtn, inner) {
  return `<div style="overflow-x:auto">${inner}</div>`;
}

function closeP1Detail() {
  const mo = document.getElementById('p1-detail-mo');
  if (mo) { mo.classList.remove('on'); document.body.style.overflow = ''; }
}


function eapFiltroSet(key) {
  ['feitos','aptos365','pend','inaptaf','inatat','venc'].forEach(k => {
    const el = document.getElementById('eap-tbl-' + k);
    if (el) el.style.display = k === key ? '' : 'none';
  });
  document.querySelectorAll('.eap-flt').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.eapkey === key);
  });
}

function p1DetailClickOut(e) {
  if (e.target === document.getElementById('p1-detail-mo')) closeP1Detail();
}

function p1ShowKpiDetail(tipo) {
  const mo = document.getElementById('p1-detail-mo');
  if (!mo) return;

  const KPI_META = {
    total:    { title: 'TODO O EFETIVO',       color: 'var(--gold)' },
    aptos:    { title: 'APTOS',                color: '#4bc87a' },
    afastados:{ title: 'AFASTAMENTOS',         color: '#e05555' },
    restricao:{ title: 'EM RESTRIÇÃO',         color: '#c8a84b' },
    eap:      { title: `EAP / TAF / TAT ${new Date().getFullYear()}`, color: '#c8a84b' },
    ferias:   { title: 'CONTROLE DE FÉRIAS',   color: '#5a9de0' },
    quadro:   { title: 'QUADRO FIXADO DO EFETIVO', color: '#4bc87a' },
  };
  const meta = KPI_META[tipo] || { title: tipo.toUpperCase(), color: 'var(--tx)' };
  document.getElementById('p1d-accent').style.background = meta.color;
  document.getElementById('p1d-title').textContent = meta.title;

  const hoje     = new Date().toISOString().split('T')[0];
  const anoAtual = new Date().getFullYear();
  const fmtD     = s => { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
  const dataF    = p1FiltroOpm ? p1Data.filter(r => r.opm === p1FiltroOpm) : p1Data;
  const reSetF   = new Set(dataF.map(r => r.re));
  const esc      = s => (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");

  const TIPO_COLOR = { Férias:'#5a9de0', LP:'#9b59b6', LSV:'#e67e22', Conval:'#e74c3c',
    Núpcias:'#f1c40f', Luto:'#95a5a6', Maternidade:'#e91e63', Paternidade:'#2196f3', LTS:'#e05555', Outros:'#607090' };
  const catTipo = t => {
    const tl = (t||'').toLowerCase();
    if (/f[eé]rias/.test(tl)) return 'Férias';
    if (/\blp\b|licen[cç]a.pr[eê]mio|premio/.test(tl)) return 'LP';
    if (/\blsv\b|sem.vencimento/.test(tl)) return 'LSV';
    if (/conval/.test(tl)) return 'Conval';
    if (/n[uú]pcia/.test(tl)) return 'Núpcias';
    if (/luto/.test(tl)) return 'Luto';
    if (/maternidade/.test(tl)) return 'Maternidade';
    if (/paternidade/.test(tl)) return 'Paternidade';
    if (/\blts\b|licen[cç]a.trat|tratamento.sa/.test(tl)) return 'LTS';
    return 'Outros';
  };

  const closeBtn = ''; // botão ✕ fica no header do modal

  const thL = 'padding:8px 12px;border-bottom:1px solid var(--bd2);font-family:"DM Mono",monospace;font-size:19px;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;text-align:left';
  const thR = thL.replace('text-align:left','text-align:right');
  const tdL = 'padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-size:19px;font-weight:600;color:var(--tx)';
  const tdS = 'padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-family:"DM Mono",monospace;font-size:19px;color:var(--tx3)';

  let html = '';

  if (tipo === 'total') {
    const rows = dataF.map(r => {
      const afst = p1AfastHoje[r.re];
      const s = afst
        ? `<span style="font-size:19px;padding:3px 9px;border-radius:10px;background:#e0555522;color:#e05555;font-family:'DM Mono',monospace">${afst[0]?.tipo_afastamento||'Afastado'}</span>`
        : `<span style="font-size:19px;padding:3px 9px;border-radius:10px;background:#4bc87a22;color:#4bc87a;font-family:'DM Mono',monospace">Apto</span>`;
      return `<tr>
        <td style="${tdS}">${r.posto||'—'}</td>
        <td style="${tdS}">${r.re}</td>
        <td style="${tdL};cursor:pointer" onclick="openProntuario('${esc(r.re)}')">${r.nome_guerra||r.nome}</td>
        <td style="${tdS}">${r.opm||'—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.03)">${s}</td>
      </tr>`;
    }).join('');
    html = wrapDetail('Todo o Efetivo', dataF.length, '#c8a84b', closeBtn,
      `<table style="width:100%;border-collapse:collapse">
        <thead><tr><th style="${thL}">Posto</th><th style="${thL}">RE</th><th style="${thL}">Nome</th><th style="${thL}">OPM</th><th style="${thL}">Status</th></tr></thead>
        <tbody>${rows}</tbody></table>`);
  }

  else if (tipo === 'aptos') {
    const list = dataF.filter(r => !p1AfastHoje[r.re]);
    const rows = list.map(r => `<tr>
      <td style="${tdS}">${r.posto||'—'}</td>
      <td style="${tdS}">${r.re}</td>
      <td style="${tdL};cursor:pointer" onclick="openProntuario('${esc(r.re)}')">${r.nome_guerra||r.nome}</td>
      <td style="${tdS}">${r.opm||'—'}</td>
    </tr>`).join('');
    html = wrapDetail('Aptos', list.length, '#4bc87a', closeBtn,
      `<table style="width:100%;border-collapse:collapse">
        <thead><tr><th style="${thL}">Posto</th><th style="${thL}">RE</th><th style="${thL}">Nome</th><th style="${thL}">OPM</th></tr></thead>
        <tbody>${rows}</tbody></table>`);
  }

  else if (tipo === 'afastados') {
    const ativos = p1Afasts.filter(a => a.inicio <= hoje && a.termino >= hoje && reSetF.has(a.re));
    const groups = {};
    ativos.forEach(a => { const c = catTipo(a.tipo_afastamento); (groups[c] = groups[c]||[]).push(a); });
    const ORDER = ['Férias','LP','LSV','Conval','Núpcias','Luto','Maternidade','Paternidade','LTS','Outros'];
    let inner = '';
    ORDER.forEach(cat => {
      const list = groups[cat]; if (!list?.length) return;
      const color = TIPO_COLOR[cat];
      inner += `<tr><td colspan="5" style="padding:10px 12px 4px;border-bottom:1px solid rgba(255,255,255,.04)">
        <span style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:1px;padding:3px 10px;border-radius:10px;background:${color}22;color:${color};text-transform:uppercase">${cat} — ${list.length}</span>
      </td></tr>`;
      list.forEach(a => {
        const pm = p1Data.find(r => r.re === a.re);
        const nm = pm?.nome_guerra || pm?.nome || a.nome || a.re;
        const dias = a.termino ? Math.ceil((new Date(a.termino) - new Date(hoje)) / 86400000) : null;
        inner += `<tr>
          <td style="${tdS}">${pm?.posto||'—'}</td>
          <td style="${tdS}">${a.re}</td>
          <td style="${tdL};cursor:pointer" onclick="openProntuario('${esc(a.re)}')">${nm}</td>
          <td style="${tdS}">${pm?.opm||a.opm||'—'}</td>
          <td style="${tdS};text-align:right">${fmtD(a.inicio)}</td>
          <td style="${tdS};text-align:right;color:${dias!==null&&dias<=3?'#4bc87a':'var(--tx3)'}">${dias!==null?dias+'d':'—'}</td>
        </tr>`;
      });
    });
    html = wrapDetail('Afastamentos Ativos', ativos.length, '#e05555', closeBtn,
      `<table style="width:100%;border-collapse:collapse">
        <thead><tr><th style="${thL}">Posto</th><th style="${thL}">RE</th><th style="${thL}">Nome</th><th style="${thL}">OPM</th><th style="${thR}">Início</th><th style="${thR}">Dias Rest.</th></tr></thead>
        <tbody>${inner}</tbody></table>`);
  }

  else if (tipo === 'restricao') {
    const list = dataF.filter(r => (r.possui_restricao||'').toLowerCase().startsWith('s'));
    const rows = list.map(r => {
      const dias = r.restricao_termino ? Math.ceil((new Date(r.restricao_termino) - new Date(hoje)) / 86400000) : null;
      const cor  = dias === null ? 'var(--tx3)' : dias <= 0 ? '#e05555' : dias <= 30 ? '#c8a84b' : '#4bc87a';
      return `<tr>
        <td style="${tdL};cursor:pointer" onclick="openProntuario('${esc(r.re)}')">${r.nome_guerra||r.nome}</td>
        <td style="${tdS}">${r.posto||'—'}</td>
        <td style="${tdS}">${r.opm||'—'}</td>
        <td style="${tdS};color:var(--tx2)">${r.tipos_restricao||'—'}</td>
        <td style="${tdS};text-align:right">${fmtD(r.restricao_termino)}</td>
        <td style="${tdS};text-align:right;color:${cor};font-weight:700">${dias!==null?(dias<0?'Vencida':dias+'d'):'—'}</td>
      </tr>`;
    }).join('');
    html = wrapDetail('Em Restrição', list.length, '#c8a84b', closeBtn,
      `<table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="${thL}">Nome</th><th style="${thL}">Posto</th><th style="${thL}">OPM</th>
          <th style="${thL}">Tipo de Restrição</th><th style="${thR}">Válida até</th><th style="${thR}">Restam</th>
        </tr></thead><tbody>${rows}</tbody></table>`);
  }

  else if (tipo === 'eap') {
    const isEapOk = r => { const d = r.data_eap ? new Date(r.data_eap) : null; return d && !isNaN(d) && d.getUTCFullYear() === anoAtual; };
    const taftatVencFn = pm => {
      if (!pm.data_eap) return false;
      const d = new Date(pm.data_eap), lim = new Date(d);
      lim.setFullYear(lim.getFullYear() + 1);
      return new Date() > lim;
    };
    const feitos   = dataF.filter(r => isEapOk(r)).sort((a,b) => (a.data_eap||'').localeCompare(b.data_eap||''));
    const pend     = dataF.filter(r => !isEapOk(r));
    const REPROV_D = new Set(['inapto','ruim']);
    const inapTAF  = dataF.filter(r => REPROV_D.has((r.taf||'').toLowerCase().trim()));
    const inapTAT  = dataF.filter(r => REPROV_D.has((r.tat||'').toLowerCase().trim()));
    const vencidos = dataF.filter(taftatVencFn);
    const lim365   = (() => { const d = new Date(); d.setDate(d.getDate() - 365); return d; })();
    const aptos365 = dataF.filter(r =>
      r.data_eap && new Date(r.data_eap) >= lim365 && !REPROV_D.has((r.taf||'').toLowerCase().trim())
    );

    const notaCor2  = n => ({ 'excepcional':'#4bc87a','muito bom':'#9de05a','bom':'#c8c84b','regular':'#c8a84b','ruim':'#e05555','inapto':'#e05555' })[(n||'').toLowerCase()] || 'var(--tx3)';
    const notaBadge = n => n
      ? `<span style="font-size:19px;font-family:'DM Mono',monospace;padding:2px 8px;border-radius:8px;background:${notaCor2(n)}22;color:${notaCor2(n)}">${n}</span>`
      : `<span style="color:var(--tx3);font-size:19px">—</span>`;
    const p2 = n => String(n).padStart(2,'0');
    const fmtEap = s => {
      if (!s) return '—';
      const d = new Date(s); if (isNaN(d)) return '—';
      const d3 = new Date(d); d3.setUTCDate(d3.getUTCDate() + 2);
      return `${p2(d.getUTCDate())} à ${p2(d3.getUTCDate())}/${p2(d3.getUTCMonth()+1)}/${d3.getUTCFullYear()}`;
    };
    const cS  = 'font-family:"DM Mono",monospace;font-size:19px;color:var(--tx3)';
    const cL  = 'font-size:19px;font-weight:600;color:var(--tx)';
    const pC  = 'padding:8px 6px 8px 4px;border-bottom:1px solid rgba(255,255,255,.03);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const thE = 'padding:8px 6px 8px 4px;border-bottom:1px solid rgba(200,168,75,.25);background:rgba(200,168,75,.06);font-family:"DM Mono",monospace;font-size:19px;color:#c8a84b;letter-spacing:1px;text-transform:uppercase;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

    const mkRow7 = r => `<tr>
      <td style="${pC};${cS}">${r.posto||'—'}</td>
      <td style="${pC};${cS}">${r.re}</td>
      <td style="${pC};${cL};cursor:pointer" onclick="openProntuario('${esc(r.re)}')">${r.nome_guerra||r.nome}</td>
      <td style="${pC};${cS}">${r.opm||'—'}</td>
      <td style="${pC};${cS};color:#4bc87a">${fmtEap(r.data_eap)}</td>
      <td style="${pC};text-align:center">${notaBadge(r.taf)}</td>
      <td style="${pC};text-align:center">${notaBadge(r.tat)}</td>
    </tr>`;
    const mkRow5nota = (r, campo, notaFn) => `<tr>
      <td style="${pC};${cS}">${r.posto||'—'}</td>
      <td style="${pC};${cS}">${r.re}</td>
      <td style="${pC};${cL};cursor:pointer" onclick="openProntuario('${esc(r.re)}')">${r.nome_guerra||r.nome}</td>
      <td style="${pC};${cS}">${r.opm||'—'}</td>
      <td style="${pC};text-align:center">${notaBadge(r[campo])}</td>
    </tr>`;

    const thead7 = (cols) => `<thead><tr>${cols.map(c=>`<th style="${thE}${c.center?';text-align:center':''}">${c.l}</th>`).join('')}</tr></thead>`;
    const colg7  = `<colgroup><col style="width:17%"><col style="width:11%"><col style="width:24%"><col style="width:18%"><col style="width:15%"><col style="width:7%"><col style="width:8%"></colgroup>`;
    const colg5  = `<colgroup><col style="width:20%"><col style="width:13%"><col style="width:37%"><col style="width:22%"><col style="width:8%"></colgroup>`;

    const tblFeitos = `
      <table style="width:100%;border-collapse:collapse;table-layout:fixed">
        ${colg7}${thead7([{l:'Posto'},{l:'RE'},{l:'Nome'},{l:'OPM'},{l:'Período'},{l:'TAF',center:true},{l:'TAT',center:true}])}
        <tbody>${feitos.map(mkRow7).join('')||`<tr><td colspan="7" style="padding:14px;color:var(--tx3);font-size:19px;text-align:center">Nenhum realizado ainda</td></tr>`}</tbody>
      </table>`;

    const tblPend = `
      <table style="width:100%;border-collapse:collapse;table-layout:fixed">
        ${colg7}${thead7([{l:'Posto'},{l:'RE'},{l:'Nome'},{l:'OPM'},{l:'Situação'},{l:'TAF',center:true},{l:'TAT',center:true}])}
        <tbody>${pend.map(r => {
          const venc = taftatVencFn(r);
          const sit = venc
            ? `<span style="font-size:19px;font-family:'DM Mono',monospace;padding:2px 8px;border-radius:8px;background:#e0555522;color:#e05555">Vencido</span>`
            : `<span style="font-size:19px;font-family:'DM Mono',monospace;padding:2px 8px;border-radius:8px;background:#c8a84b22;color:#c8a84b">Não realizado</span>`;
          return `<tr>
            <td style="${pC};${cS}">${r.posto||'—'}</td>
            <td style="${pC};${cS}">${r.re}</td>
            <td style="${pC};${cL};cursor:pointer" onclick="openProntuario('${esc(r.re)}')">${r.nome_guerra||r.nome}</td>
            <td style="${pC};${cS}">${r.opm||'—'}</td>
            <td style="${pC}">${sit}</td>
            <td style="${pC};text-align:center">${notaBadge(r.taf)}</td>
            <td style="${pC};text-align:center">${notaBadge(r.tat)}</td>
          </tr>`;
        }).join('')||`<tr><td colspan="7" style="padding:14px;color:var(--tx3);font-size:19px;text-align:center">Todos realizaram ✓</td></tr>`}</tbody>
      </table>`;

    const tblInapTAF = `
      <table style="width:100%;border-collapse:collapse;table-layout:fixed">
        ${colg5}${thead7([{l:'Posto'},{l:'RE'},{l:'Nome'},{l:'OPM'},{l:'TAF',center:true}])}
        <tbody>${inapTAF.map(r => mkRow5nota(r,'taf')).join('')||`<tr><td colspan="5" style="padding:14px;color:var(--tx3);font-size:19px;text-align:center">Nenhum inapto no TAF</td></tr>`}</tbody>
      </table>`;

    const tblInapTAT = `
      <table style="width:100%;border-collapse:collapse;table-layout:fixed">
        ${colg5}${thead7([{l:'Posto'},{l:'RE'},{l:'Nome'},{l:'OPM'},{l:'TAT',center:true}])}
        <tbody>${inapTAT.map(r => mkRow5nota(r,'tat')).join('')||`<tr><td colspan="5" style="padding:14px;color:var(--tx3);font-size:19px;text-align:center">Nenhum inapto no TAT</td></tr>`}</tbody>
      </table>`;

    const tblVenc = `
      <table style="width:100%;border-collapse:collapse;table-layout:fixed">
        ${colg7}${thead7([{l:'Posto'},{l:'RE'},{l:'Nome'},{l:'OPM'},{l:'Último EAP'},{l:'TAF',center:true},{l:'TAT',center:true}])}
        <tbody>${vencidos.map(mkRow7).join('')||`<tr><td colspan="7" style="padding:14px;color:var(--tx3);font-size:19px;text-align:center">Nenhum vencido</td></tr>`}</tbody>
      </table>`;

    // Cartão de resumo clicável
    const smCard = (key, label, val, cor) =>
      `<div onclick="eapFiltroSet('${key}')" style="background:var(--bg2);border:1px solid var(--bd2);border-top:3px solid ${cor};border-radius:8px;padding:14px 16px;cursor:pointer;transition:border-color .15s" onmouseover="this.style.borderColor='${cor}'" onmouseout="this.style.borderTopColor='${cor}';this.style.borderColor='var(--bd2)';this.style.borderTopColor='${cor}'">
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">${label}</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:36px;font-weight:800;color:${cor};line-height:1">${val}</div>
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-top:4px">▸ ver lista</div>
      </div>`;

    // Pill de filtro
    const pill = (key, label, active) =>
      `<button class="pf-btn eap-flt${active?' on':''}" data-eapkey="${key}" onclick="eapFiltroSet('${key}')">${label}</button>`;

    const inner = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;padding:16px 12px 14px">
        ${smCard('feitos',   'Realizaram ' + anoAtual,  feitos.length,   '#4bc87a')}
        ${smCard('aptos365', 'Aptos 365 dias',           aptos365.length, aptos365.length ? '#4bc87a' : 'var(--tx3)')}
        ${smCard('pend',     'Pendentes',                pend.length,     pend.length   ? '#c8a84b' : 'var(--tx3)')}
        ${smCard('inaptaf',  'Inaptos TAF',              inapTAF.length,  inapTAF.length? '#e05555' : 'var(--tx3)')}
        ${smCard('inatat',   'Inaptos TAT',              inapTAT.length,  inapTAT.length? '#e05555' : 'var(--tx3)')}
        ${smCard('venc',     'Vencidos',                 vencidos.length, vencidos.length?'#e05555' : 'var(--tx3)')}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;padding:0 12px 14px;border-bottom:1px solid var(--bd2)">
        ${pill('feitos',   'Realizaram ('   + feitos.length    + ')', false)}
        ${pill('aptos365', 'Aptos 365d ('   + aptos365.length  + ')', false)}
        ${pill('pend',     'Pendentes ('    + pend.length      + ')', false)}
        ${pill('inaptaf',  'Inaptos TAF ('  + inapTAF.length   + ')', false)}
        ${pill('inatat',   'Inaptos TAT ('  + inapTAT.length   + ')', false)}
        ${pill('venc',     'Vencidos ('     + vencidos.length  + ')', false)}
      </div>
      <div id="eap-tbl-feitos"   style="display:none;padding:0 12px 12px">${tblFeitos}</div>
      <div id="eap-tbl-aptos365" style="display:none;padding:0 12px 12px">
        <table style="width:100%;border-collapse:collapse;table-layout:fixed">
          ${`<colgroup><col style="width:17%"><col style="width:11%"><col style="width:24%"><col style="width:18%"><col style="width:15%"><col style="width:7%"><col style="width:8%"></colgroup>`}
          <thead><tr>${[{l:'Posto'},{l:'RE'},{l:'Nome'},{l:'OPM'},{l:'Período'},{l:'TAF',center:true},{l:'TAT',center:true}].map(c=>`<th style="${thE}${c.center?';text-align:center':''}">${c.l}</th>`).join('')}</tr></thead>
          <tbody>${aptos365.map(mkRow7).join('')||`<tr><td colspan="7" style="padding:14px;color:var(--tx3);font-size:19px;text-align:center">Nenhum apto nos últimos 365 dias</td></tr>`}</tbody>
        </table>
      </div>
      <div id="eap-tbl-pend"    style="display:none;padding:0 12px 12px">${tblPend}</div>
      <div id="eap-tbl-inaptaf" style="display:none;padding:0 12px 12px">${tblInapTAF}</div>
      <div id="eap-tbl-inatat"  style="display:none;padding:0 12px 12px">${tblInapTAT}</div>
      <div id="eap-tbl-venc"    style="display:none;padding:0 12px 12px">${tblVenc}</div>`;

    html = wrapDetail(`EAP / TAF / TAT ${anoAtual}`, null, '#c8a84b', closeBtn, inner);
  }

  else if (tipo === 'ferias') {
    const afastsF = p1FiltroOpm ? p1Afasts.filter(a => reSetF.has(a.re)) : p1Afasts;
    const em15s   = (() => { const d = new Date(); d.setDate(d.getDate()+15); return d.toISOString().split('T')[0]; })();
    const gozo    = afastsF.filter(a => isFer(a.tipo_afastamento) && a.inicio <= hoje && a.termino >= hoje);
    const prox    = afastsF.filter(a => isFer(a.tipo_afastamento) && a.inicio > hoje && a.inicio <= em15s);
    const resFer  = new Set(p1Afasts.filter(a => isFer(a.tipo_afastamento) && (a.inicio||'').startsWith(String(anoAtual))).map(a => a.re));
    const semFer  = dataF.filter(r => !resFer.has(r.re));

    const ferRow = (a, showDias) => {
      const pm   = p1Data.find(r => r.re === a.re);
      const nm   = pm?.nome_guerra || pm?.nome || a.nome || a.re;
      const dias = a.termino ? Math.ceil((new Date(a.termino) - new Date(hoje)) / 86400000) : null;
      return `<tr>
        <td style="${tdS}">${a.re}</td>
        <td style="${tdL};cursor:pointer" onclick="openProntuario('${esc(a.re)}')">${nm}</td>
        <td style="${tdS}">${pm?.opm||a.opm||'—'}</td>
        <td style="${tdS};text-align:right">${fmtD(a.inicio)}</td>
        <td style="${tdS};text-align:right">${fmtD(a.termino)}</td>
        ${showDias ? `<td style="${tdS};text-align:right;color:${dias!==null&&dias<=3?'#4bc87a':'var(--tx3)'}">${dias!==null?dias+'d':'—'}</td>` : ''}
      </tr>`;
    };
    const colH = (showDias) => `<thead><tr>
      <th style="${thL}">RE</th><th style="${thL}">Nome</th><th style="${thL}">OPM</th>
      <th style="${thR}">Início</th><th style="${thR}">Término</th>
      ${showDias?`<th style="${thR}">Dias Rest.</th>`:''}
    </tr></thead>`;

    let inner = '';
    if (gozo.length) inner += `
      <div style="font-family:'DM Mono',monospace;font-size:19px;color:#5a9de0;letter-spacing:1.5px;padding:12px 14px 6px;text-transform:uppercase">Em Gozo — ${gozo.length}</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px">${colH(true)}<tbody>${gozo.map(a=>ferRow(a,true)).join('')}</tbody></table>`;
    if (prox.length) inner += `
      <div style="font-family:'DM Mono',monospace;font-size:19px;color:#c8a84b;letter-spacing:1.5px;padding:12px 14px 6px;text-transform:uppercase">Iniciando em 15 dias — ${prox.length}</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px">${colH(false)}<tbody>${prox.map(a=>ferRow(a,false)).join('')}</tbody></table>`;
    if (semFer.length) {
      const rows = semFer.map(r => `<tr>
        <td style="${tdS}">${r.re}</td>
        <td style="${tdL};cursor:pointer" onclick="openProntuario('${esc(r.re)}')">${r.nome_guerra||r.nome}</td>
        <td style="${tdS}">${r.posto||'—'}</td>
        <td style="${tdS}">${r.opm||'—'}</td>
      </tr>`).join('');
      inner += `
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:#e05555;letter-spacing:1.5px;padding:12px 14px 6px;text-transform:uppercase">Sem Férias em ${anoAtual} — ${semFer.length}</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr><th style="${thL}">RE</th><th style="${thL}">Nome</th><th style="${thL}">Posto</th><th style="${thL}">OPM</th></tr></thead>
          <tbody>${rows}</tbody></table>`;
    }
    html = wrapDetail('Controle de Férias', null, '#5a9de0', closeBtn, inner);
  }

  else if (tipo === 'quadro') {
    const excl = s => /cfp|uis\s*m[eé]d|uis\s*odonto/i.test(s||'');
    const qRows = p1Quadro.filter(q => !excl(q.opm));

    // Inferir CIA a partir do p1Data (cruza por OPM ou municipio)
    const normStr = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[ªº°]/g,'').replace(/\s+/g,' ').trim();
    const opmCiaMap = {};
    p1Data.forEach(pm => {
      const cia = (pm.cia||'').trim();
      if (!cia) return;
      const key = normStr(pm.opm||'');
      if (key && !opmCiaMap[key]) opmCiaMap[key] = normCiaDisp(cia);
    });
    const getCia = q => {
      if ((q.cia||'').trim()) return normCiaDisp(q.cia);
      const nOpm = normStr(q.opm||'');
      const nMun = normStr(q.municipio||'');
      const found = Object.entries(opmCiaMap).find(([k]) =>
        k === nOpm || k === nMun || k.includes(nMun) || nMun.includes(k) || k.includes(nOpm) || nOpm.includes(k)
      );
      return found?.[1] || (q.opm||'').trim() || '—';
    };

    // +X (estourado) = RED, -X (vagas) = GREEN, 0 = branco
    const cColor = c => c < 0 ? '#e05555' : c === 0 ? 'var(--tx3)' : '#4bc87a';
    const cVal   = c => c < 0 ? `+${Math.abs(c)}` : c === 0 ? '0' : `−${c}`;
    const cPct   = (c, fx) => fx > 0 ? ((c / fx) * 100).toFixed(1) + '%' : '—';

    const thH  = 'padding:8px 14px;border-bottom:1px solid var(--bd2);font-family:"DM Mono",monospace;font-size:19px;letter-spacing:1px;text-transform:uppercase;color:var(--tx3);text-align:right;white-space:nowrap';
    const thHL = thH + ';text-align:left';
    const tdc  = 'padding:7px 14px;border-bottom:1px solid rgba(255,255,255,.04);font-family:"DM Mono",monospace;font-size:19px;text-align:right;white-space:nowrap';
    const tdcL = 'padding:7px 14px;border-bottom:1px solid rgba(255,255,255,.04);font-size:19px;font-weight:600;color:var(--tx);white-space:nowrap';

    // Agrupa por CIA inferida
    const byCia = {};
    qRows.forEach(q => {
      const c = getCia(q);
      if (!byCia[c]) byCia[c] = [];
      byCia[c].push(q);
    });
    const cias = Object.keys(byCia).sort();

    // Rankings separados por posto — Cb/Sd e Subten/Sgt são independentes
    const mkRankList = (items, cor) => items.map((r,i) => {
      const pct = r.fx > 0 ? ((r.claro/r.fx)*100).toFixed(0) : 0;
      const bar = `<div style="height:4px;border-radius:2px;background:rgba(255,255,255,.06);overflow:hidden;margin-top:3px"><div style="height:100%;width:${pct}%;background:${cor};border-radius:2px"></div></div>`;
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div style="flex:1;min-width:0">
          <span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3)">${i+1}. </span>
          <span style="font-size:19px;font-weight:700;color:var(--tx)">${r.mun}</span>
          <span style="font-size:19px;color:#5a9de0;margin-left:6px">${r.cia}</span>
          ${bar}
        </div>
        <span style="font-family:'DM Mono',monospace;font-size:19px;font-weight:800;color:${cor};white-space:nowrap">−${r.claro} <span style="font-size:19px;font-weight:400">(${pct}%)</span></span>
      </div>`;
    }).join('');

    const rankCb = [...qRows]
      .map(q => { const fx=Number(q.fx_cb_sd)||0, ex=Number(q.ex_cb_sd)||0; return { mun:q.municipio||q.opm||'—', cia:getCia(q), claro:fx-ex, fx }; })
      .filter(r => r.claro > 0).sort((a,b) => b.claro-a.claro).slice(0,5);

    const rankSub = [...qRows]
      .map(q => { const fx=Number(q.fx_subten_sgt)||0, ex=Number(q.ex_subten_sgt)||0; return { mun:q.municipio||q.opm||'—', cia:getCia(q), claro:fx-ex, fx }; })
      .filter(r => r.claro > 0).sort((a,b) => b.claro-a.claro).slice(0,5);

    let rankHtml = '';
    if (rankCb.length || rankSub.length) {
      rankHtml = `<div style="padding:14px 18px;border-bottom:1px solid var(--bd);display:grid;grid-template-columns:1fr 1fr;gap:24px">
        <div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:#e0965a;text-transform:uppercase;margin-bottom:10px">Cb / Sd — Vagas em aberto</div>
          <div style="display:flex;flex-direction:column;gap:8px">${rankCb.length ? mkRankList(rankCb,'#e0965a') : '<span style="font-size:19px;color:var(--tx3)">Sem vagas abertas</span>'}</div>
        </div>
        <div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:#9b6de0;text-transform:uppercase;margin-bottom:10px">Subten / Sgt — Vagas em aberto</div>
          <div style="display:flex;flex-direction:column;gap:8px">${rankSub.length ? mkRankList(rankSub,'#9b6de0') : '<span style="font-size:19px;color:var(--tx3)">Sem vagas abertas</span>'}</div>
        </div>
      </div>`;
    }

    let bodyQ = '';
    // Acumula totais por posto separadamente — nunca misturar St/Sgt com Cb/Sd
    let gtFxSub=0, gtCSub=0, gtFxCb=0, gtCCb=0;

    cias.forEach(cia => {
      const rows = byCia[cia];
      bodyQ += `<tr><td colspan="8" style="padding:9px 16px 5px;background:rgba(90,157,224,.07);border-top:1px solid rgba(90,157,224,.2);border-bottom:1px solid rgba(90,157,224,.12);font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:#5a9de0;text-transform:uppercase;font-weight:700">${cia}</td></tr>`;
      let cFxSub=0, cCSub=0, cFxCb=0, cCCb=0;
      rows.forEach(q => {
        const fxSub = Number(q.fx_subten_sgt)||0, exSub = Number(q.ex_subten_sgt)||0;
        const fxCb  = Number(q.fx_cb_sd)||0,      exCb  = Number(q.ex_cb_sd)||0;
        const cS = fxSub - exSub;   // claro St/Sgt desta cidade (independente)
        const cC = fxCb  - exCb;    // claro Cb/Sd desta cidade (independente)
        cFxSub+=fxSub; cCSub+=cS; cFxCb+=fxCb; cCCb+=cC;
        bodyQ += `<tr>
          <td style="${tdcL}">${q.municipio||'—'}</td>
          <td style="${tdcL};font-weight:400;font-size:19px;color:var(--tx3)">${q.opm||'—'}</td>
          <td style="${tdc};color:var(--tx2)">${fxSub}</td>
          <td style="${tdc};font-size:19px;font-weight:800;color:${cColor(cS)}">${cVal(cS)}</td>
          <td style="${tdc};font-size:19px;color:${cColor(cS)}">${cPct(cS,fxSub)}</td>
          <td style="${tdc};color:var(--tx2)">${fxCb}</td>
          <td style="${tdc};font-size:19px;font-weight:800;color:${cColor(cC)}">${cVal(cC)}</td>
          <td style="${tdc};font-size:19px;color:${cColor(cC)}">${cPct(cC,fxCb)}</td>
        </tr>`;
      });
      // Subtotal CIA — St/Sgt e Cb/Sd continuam independentes
      bodyQ += `<tr style="background:rgba(255,255,255,.03);border-top:1px solid rgba(255,255,255,.07)">
        <td style="${tdcL};color:var(--tx3);font-size:19px;letter-spacing:.5px" colspan="2">Subtotal ${cia}</td>
        <td style="${tdc};color:#fff;font-weight:700">${cFxSub}</td>
        <td style="${tdc};font-size:19px;font-weight:800;color:${cColor(cCSub)}">${cVal(cCSub)}</td>
        <td style="${tdc};font-size:19px;color:${cColor(cCSub)}">${cPct(cCSub,cFxSub)}</td>
        <td style="${tdc};color:#fff;font-weight:700">${cFxCb}</td>
        <td style="${tdc};font-size:19px;font-weight:800;color:${cColor(cCCb)}">${cVal(cCCb)}</td>
        <td style="${tdc};font-size:19px;color:${cColor(cCCb)}">${cPct(cCCb,cFxCb)}</td>
      </tr>`;
      gtFxSub+=cFxSub; gtCSub+=cCSub; gtFxCb+=cFxCb; gtCCb+=cCCb;
    });

    // Total geral — St/Sgt e Cb/Sd totalmente separados, sem somar entre si
    if (qRows.length) {
      bodyQ += `<tr style="border-top:2px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05)">
        <td style="${tdcL};text-transform:uppercase;font-size:19px;letter-spacing:1px;color:var(--tx2)" colspan="2">Total Geral</td>
        <td style="${tdc};color:#fff;font-weight:700;font-size:19px">${gtFxSub}</td>
        <td style="${tdc};font-size:19px;font-weight:900;color:${cColor(gtCSub)}">${cVal(gtCSub)}</td>
        <td style="${tdc};font-size:19px;color:${cColor(gtCSub)}">${cPct(gtCSub,gtFxSub)}</td>
        <td style="${tdc};color:#fff;font-weight:700;font-size:19px">${gtFxCb}</td>
        <td style="${tdc};font-size:19px;font-weight:900;color:${cColor(gtCCb)}">${cVal(gtCCb)}</td>
        <td style="${tdc};font-size:19px;color:${cColor(gtCCb)}">${cPct(gtCCb,gtFxCb)}</td>
      </tr>`;
    }

    const tableHdr = `<table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="${thHL}">Município</th>
        <th style="${thHL}">OPM</th>
        <th style="${thH}">St/Sgt FX</th>
        <th style="${thH}">Claro</th>
        <th style="${thH}">%</th>
        <th style="${thH}">Cb/Sd FX</th>
        <th style="${thH}">Claro</th>
        <th style="${thH}">%</th>
      </tr></thead>
      <tbody>${bodyQ || '<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--tx3);font-size:19px">Nenhum dado. Importe o CSV pelo menu lateral.</td></tr>'}</tbody>
    </table>`;

    html = wrapDetail('Quadro Fixado do Efetivo', null, '#4bc87a', closeBtn, rankHtml + tableHdr);
  }

  document.getElementById('p1d-body').innerHTML = html;
  mo.classList.add('on');
  document.body.style.overflow = 'hidden';
}

// ── Filtro OPM e Busca P1 ────────────────────────────────────────────────────

function p1SetFiltroOpm(opm) {
  p1FiltroOpm = opm;
  renderP1();
}

let p1SearchIdx = -1; // índice selecionado no dropdown

function p1SearchInput(val) {
  const drop = document.getElementById('p1-search-drop');
  if (!drop) return;
  const q = (val || '').trim().toLowerCase();
  p1SearchIdx = -1;
  if (!q || q.length < 1) { drop.style.display = 'none'; return; }

  const isRe = /^\d+$/.test(q);
  const matches = p1Data.filter(r =>
    (isRe
      ? (r.re || '').toLowerCase().startsWith(q)
      : (r.nome || '').toLowerCase().includes(q) || (r.nome_guerra || '').toLowerCase().includes(q))
  ).slice(0, 30);

  if (!matches.length) { drop.style.display = 'none'; return; }

  const norm = s => (s || '').replace(/</g,'&lt;');
  const hi = s => {
    const idx = s.toLowerCase().indexOf(q);
    if (idx < 0) return norm(s);
    return norm(s.slice(0, idx)) + `<span style="color:var(--gold);font-weight:700">${norm(s.slice(idx, idx + q.length))}</span>` + norm(s.slice(idx + q.length));
  };

  drop.innerHTML = matches.map((r, i) => {
    const afst = p1AfastHoje[r.re];
    const statusColor = afst ? '#e05555' : '#4bc87a';
    const statusTxt   = afst ? (afst[0]?.tipo_afastamento || 'Afastado') : 'Apto';
    const nomePrinc   = r.nome_guerra || r.nome || '—';
    return `<div data-re="${r.re}" data-i="${i}"
      onmousedown="p1SearchSelect('${r.re.replace(/'/g,"\\'")}')"
      onmouseover="p1SearchHover(${i})"
      style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);transition:background .1s"
      id="p1-sdrop-${i}">
      <div style="flex-shrink:0">${p1AvatarSVG(nomePrinc, r.posto)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:19px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${hi(nomePrinc)}</div>
        <div style="font-size:19px;color:var(--tx3)">${hi(r.nome || '')} · ${r.posto || '—'} · ${r.opm || '—'}</div>
      </div>
      <div style="font-size:19px;font-family:'DM Mono',monospace;padding:3px 9px;border-radius:10px;background:${statusColor}22;color:${statusColor};white-space:nowrap">${statusTxt}</div>
    </div>`;
  }).join('');

  drop.style.display = 'block';
}

function p1SearchHover(i) {
  p1SearchIdx = i;
  document.querySelectorAll('#p1-search-drop > div').forEach((el, j) => {
    el.style.background = j === i ? 'rgba(255,255,255,.06)' : '';
  });
}

function p1SearchKey(e) {
  const drop = document.getElementById('p1-search-drop');
  if (!drop || drop.style.display === 'none') {
    if (e.key === 'Enter') {
      const val = document.getElementById('p1-search')?.value.trim();
      if (val) p1SearchInput(val);
    }
    return;
  }
  const items = drop.querySelectorAll('div[data-re]');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    p1SearchHover(Math.min(p1SearchIdx + 1, items.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    p1SearchHover(Math.max(p1SearchIdx - 1, 0));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const sel = drop.querySelector(`[data-i="${p1SearchIdx}"]`) || items[0];
    if (sel) p1SearchSelect(sel.dataset.re);
  } else if (e.key === 'Escape') {
    p1SearchHide();
  }
}

function p1SearchSelect(re) {
  p1SearchHide();
  const inp = document.getElementById('p1-search');
  const pm = p1Data.find(r => r.re === re);
  if (inp && pm) inp.value = pm.nome_guerra || pm.nome || re;
  openProntuario(re);
}

function p1SearchHide() {
  const drop = document.getElementById('p1-search-drop');
  if (drop) drop.style.display = 'none';
}

// ── Prontuário Individual ────────────────────────────────────────────────────

async function openProntuario(re) {
  const mo = document.getElementById('pronto-mo');
  if (!mo) return;
  mo.style.display = 'flex';
  prontoCurrentRe = re;
  const pm = p1Data.find(r => r.re === re);
  if (!pm) { mo.style.display = 'none'; return; }

  const hoje = new Date().toISOString().split('T')[0];
  const anoAtual = new Date().getFullYear();
  const fmtD = s => { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };

  document.getElementById('pronto-nome').textContent   = pm.nome || '—';
  document.getElementById('pronto-posto').textContent  = pm.posto || '—';
  document.getElementById('pronto-re').textContent     = `RE ${pm.re}`;
  document.getElementById('pronto-opm').textContent    = pm.opm || '—';
  document.getElementById('pronto-func').textContent   = pm.funcao || '—';
  document.getElementById('pronto-gen').textContent    = pm.genero || '—';
  document.getElementById('pronto-guerra').textContent = pm.nome_guerra || '—';

  // Status
  const afsts    = p1AfastHoje[re] || [];
  const emRestr  = (pm.possui_restricao || '').toLowerCase().startsWith('s');
  let statusHtml = '';
  if (afsts.length) {
    statusHtml = afsts.map(a =>
      `<span style="padding:4px 12px;border-radius:20px;background:#e0555522;color:#e05555;font-size:19px;font-family:'DM Mono',monospace">${a.tipo_afastamento}</span>`
    ).join(' ');
  } else if (emRestr) {
    statusHtml = `<span style="padding:4px 12px;border-radius:20px;background:#c8a84b22;color:#c8a84b;font-size:19px;font-family:'DM Mono',monospace">Em Restrição</span>`;
  } else {
    statusHtml = `<span style="padding:4px 12px;border-radius:20px;background:#4bc87a22;color:#4bc87a;font-size:19px;font-family:'DM Mono',monospace">Apto</span>`;
  }
  document.getElementById('pronto-status').innerHTML = statusHtml;

  // EAP
  const eapDate = pm.data_eap ? new Date(pm.data_eap) : null;
  const eapOk   = eapDate && !isNaN(eapDate) && eapDate.getUTCFullYear() === anoAtual;
  if (eapOk) {
    const d1 = eapDate;
    const d3 = new Date(d1); d3.setUTCDate(d3.getUTCDate() + 2);
    const p2 = n => String(n).padStart(2,'0');
    const d1d = p2(d1.getUTCDate()), d3d = p2(d3.getUTCDate());
    const mon = p2(d3.getUTCMonth() + 1), yr = d3.getUTCFullYear();
    document.getElementById('pronto-eap').innerHTML =
      `<span style="color:#4bc87a;font-weight:600">EAP ${anoAtual} ✓</span>` +
      `<div style="font-size:19px;color:var(--tx3);margin-top:2px">${d1d} à ${d3d}/${mon}/${yr}</div>`;
  } else {
    document.getElementById('pronto-eap').innerHTML = `<span style="color:#c8a84b">⚠ Pendente ${anoAtual}</span>`;
  }

  // Restrição
  document.getElementById('pronto-restr').innerHTML = emRestr
    ? `<div style="font-size:19px;color:#c8a84b">${pm.tipos_restricao || 'Sim'}</div>
       <div style="font-size:19px;color:var(--tx3)">${fmtD(pm.restricao_inicio)} → ${fmtD(pm.restricao_termino)}</div>`
    : `<span style="font-size:19px;color:var(--tx3)">—</span>`;

  // TAF / TAT
  const NOTA_COR = { 'excepcional':'#4bc87a','muito bom':'#9de05a','bom':'#c8c84b','regular':'#c8a84b','ruim':'#e05555','inapto':'#e05555' };
  const notaCor  = n => NOTA_COR[(n||'').toLowerCase()] || 'var(--tx3)';
  const fmtRange = s => {
    if (!s) return null;
    const [y,m,d] = s.split('-');
    const d1 = new Date(parseInt(y), parseInt(m)-1, parseInt(d));
    const d3 = new Date(d1); d3.setDate(d3.getDate() + 2);
    const p2 = n => String(n).padStart(2,'0');
    return `${p2(d1.getDate())}/${p2(d1.getMonth()+1)}/${d1.getFullYear()} à ${p2(d3.getDate())}/${p2(d3.getMonth()+1)}/${d3.getFullYear()}`;
  };
  const tafVencido = (() => {
    if (!pm.data_eap) return false;
    const eap = new Date(pm.data_eap);
    const limite = new Date(eap); limite.setFullYear(limite.getFullYear() + 1);
    return new Date() > limite;
  })();
  const renderTeste = (dataTafTat, nota) => {
    if (!nota && !dataTafTat) return `<span style="font-size:19px;color:var(--tx3)">—</span>`;
    const cor = tafVencido ? '#e05555' : notaCor(nota);
    const range = fmtRange(dataTafTat);
    return `${nota ? `<div style="font-size:19px;font-weight:600;color:${cor}">${nota}</div>` : ''}
            ${range ? `<div style="font-size:19px;color:var(--tx3)">${range}</div>` : ''}
            ${tafVencido ? `<div style="font-size:19px;font-weight:600;color:#e05555;margin-top:2px">⚠ VENCIDO</div>` : ''}`;
  };
  document.getElementById('pronto-taf').innerHTML = renderTeste(pm.data_eap, pm.taf);
  document.getElementById('pronto-tat').innerHTML = renderTeste(pm.data_eap, pm.tat);

  // Alerta TAF/TAT vencido no status
  if (tafVencido) {
    document.getElementById('pronto-status').innerHTML +=
      ` <span style="padding:4px 12px;border-radius:20px;background:#e0555522;color:#e05555;font-size:19px;font-family:'DM Mono',monospace">TAF/TAT Vencido</span>`;
  }

  // Foto
  const imgEl = document.getElementById('pronto-foto');
  const phEl  = document.getElementById('pronto-foto-ph');
  imgEl.style.display = 'none'; phEl.style.display = 'flex';
  // Controles de upload (somente p1/admin)
  const u = JSON.parse(localStorage.getItem('auth_user') || '{}');
  const canEdit = ['admin','p1','ti'].includes(u.role);
  const editArea = document.getElementById('pronto-foto-edit-area');
  if (editArea) {
    editArea.style.display = canEdit ? 'block' : 'none';
    const fi = document.getElementById('pronto-foto-file');
    if (fi) fi.value = '';
    const salvarBtn = document.getElementById('pronto-btn-salvar');
    if (salvarBtn) salvarBtn.style.display = 'none';
    const msg = document.getElementById('pronto-foto-msg');
    if (msg) msg.textContent = '';
  }
  if (p1Fotos[re]) {
    imgEl.src = p1Fotos[re]; imgEl.style.display = 'block'; phEl.style.display = 'none';
  } else if (p1Fotos[re] === null) {
    // já buscou antes, não tem foto
  } else {
    try {
      const data = await authFetch(`${API}/p1/foto/${encodeURIComponent(re)}`).then(r => r.json());
      if (data?.foto_base64) {
        p1Fotos[re] = data.foto_base64;
        imgEl.src = data.foto_base64; imgEl.style.display = 'block'; phEl.style.display = 'none';
      } else {
        p1Fotos[re] = null;
      }
    } catch (_) { p1Fotos[re] = null; }
  }

  // Extrato cronológico
  const extrato = p1Afasts.filter(a => a.re === re).sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
  const extratoHtml = extrato.length
    ? extrato.map(a => {
        const ativo = a.inicio <= hoje && a.termino >= hoje;
        const tdE = 'padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.04);font-family:\'DM Mono\',monospace;font-size:19px;color:var(--tx3)';
        return `<tr>
          <td style="${tdE};font-size:19px;color:${ativo?'var(--tx)':'var(--tx3)'};font-family:inherit">${a.tipo_afastamento || '—'}</td>
          <td style="${tdE}">${fmtD(a.inicio)}</td>
          <td style="${tdE}">${fmtD(a.termino)}</td>
          <td style="${tdE}">${a.n_dias ? a.n_dias + 'd' : '—'}</td>
          <td style="${tdE};color:var(--tx2)">${a.nbi || '—'}</td>
          <td style="${tdE};color:var(--tx2)">${a.bol_g || '—'}</td>
          <td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.04)">${ativo ? '<span style="font-size:19px;padding:2px 8px;border-radius:8px;background:#e0555522;color:#e05555;font-family:DM Mono,monospace">ATIVO</span>' : ''}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="7" style="padding:14px 10px;color:var(--tx3);font-size:19px;text-align:center">Nenhum afastamento registrado.</td></tr>';
  document.getElementById('pronto-extrato').innerHTML = extratoHtml;

  // Cursos institucionais
  const cursosEl = document.getElementById('pronto-cursos');
  if (cursosEl) {
    cursosEl.innerHTML = '<tr><td colspan="3" style="padding:10px;color:var(--tx3);font-size:19px;text-align:center">Carregando...</td></tr>';
    authFetch(`${API}/pm/${encodeURIComponent(re)}/cursos`).then(r => r.json()).then(cursosData => {
      const fmtDc = s => { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
      const tdC = 'padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.04);font-family:\'DM Mono\',monospace;font-size:19px;color:var(--tx3)';
      cursosEl.innerHTML = Array.isArray(cursosData) && cursosData.length
        ? cursosData.map(c => `<tr>
            <td style="${tdC};white-space:nowrap">${fmtDc(c.data)}</td>
            <td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.04);font-size:19px;font-weight:600;color:var(--tx)">${c.nome_curso||'—'}</td>
            <td style="${tdC}">${c.posto_pm||'—'}</td>
          </tr>`).join('')
        : '<tr><td colspan="3" style="padding:12px 10px;color:var(--tx3);font-size:19px;text-align:center">Nenhum curso registrado.</td></tr>';
    }).catch(() => {
      cursosEl.innerHTML = '<tr><td colspan="3" style="padding:12px 10px;color:var(--tx3);font-size:19px;text-align:center">—</td></tr>';
    });
  }
}

function closeProntuario() {
  const mo = document.getElementById('pronto-mo');
  if (mo) mo.style.display = 'none';
  prontoCurrentRe = '';
  p1ClosingPronto = true;
  setTimeout(() => { p1ClosingPronto = false; }, 120);
}
function prontoClickOut(e) { if (e.target.id === 'pronto-mo') closeProntuario(); }

function prontoFotoPreview() {
  const file = document.getElementById('pronto-foto-file').files[0];
  const msg  = document.getElementById('pronto-foto-msg');
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    msg.style.color = '#f07878';
    msg.textContent = 'Selecione uma imagem.';
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    compressImage(e.target.result, 400, 0.82, compressed => {
      const imgEl = document.getElementById('pronto-foto');
      imgEl.src = compressed; imgEl.style.display = 'block';
      document.getElementById('pronto-foto-ph').style.display = 'none';
      document.getElementById('pronto-btn-salvar').style.display = 'block';
      if (msg) msg.textContent = '';
    });
  };
  reader.readAsDataURL(file);
}

async function prontoSaveFoto() {
  const re  = prontoCurrentRe;
  const img = document.getElementById('pronto-foto');
  const msg = document.getElementById('pronto-foto-msg');
  if (!re || !img.src || img.style.display === 'none') {
    msg.style.color = '#f07878'; msg.textContent = 'Nenhuma imagem selecionada.'; return;
  }
  msg.style.color = 'var(--tx3)'; msg.textContent = 'Salvando...';
  try {
    await authFetch(`${API}/p1/foto/${encodeURIComponent(re)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foto_base64: img.src })
    });
    p1Fotos[re] = img.src;
    document.querySelectorAll(`[data-foto-re="${re}"]`).forEach(el => renderAvatarEl(el, re, img.src));
    document.getElementById('pronto-btn-salvar').style.display = 'none';
    document.getElementById('pronto-foto-file').value = '';
    msg.style.color = '#4bc87a'; msg.textContent = 'Foto salva!';
    setTimeout(() => { if (msg) msg.textContent = ''; }, 2500);
  } catch (_) { msg.style.color = '#f07878'; msg.textContent = 'Erro ao salvar.'; }
}

async function prontoRemoveFoto() {
  const re  = prontoCurrentRe;
  const msg = document.getElementById('pronto-foto-msg');
  if (!re) return;
  msg.style.color = 'var(--tx3)'; msg.textContent = 'Removendo...';
  try {
    await authFetch(`${API}/p1/foto/${encodeURIComponent(re)}`, { method: 'DELETE' });
    p1Fotos[re] = null;
    const imgEl = document.getElementById('pronto-foto');
    imgEl.style.display = 'none'; imgEl.src = '';
    document.getElementById('pronto-foto-ph').style.display = 'flex';
    document.getElementById('pronto-btn-salvar').style.display = 'none';
    document.getElementById('pronto-foto-file').value = '';
    document.querySelectorAll(`[data-foto-re="${re}"]`).forEach(el => renderAvatarEl(el, re, null));
    msg.style.color = '#4bc87a'; msg.textContent = 'Foto removida.';
    setTimeout(() => { if (msg) msg.textContent = ''; }, 2500);
  } catch (_) { msg.style.color = '#f07878'; msg.textContent = 'Erro ao remover.'; }
}

// Retorna HTML compacto do quadro para uma CIA/sub-unidade específica
function quadroForUnit(opmLabel) {
  if (!p1Quadro.length) return '';
  const normQ = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[ªº°]/g,'').replace(/\s+/g,'').trim();
  const nLabel = normQ(opmLabel);
  // Tenta match exato; se não achar, tenta por inclusão (label pode ter "Sede · OPM")
  const q = p1Quadro.find(r => normQ(r.opm) === nLabel) ||
            p1Quadro.find(r => nLabel.includes(normQ(r.opm)) || normQ(r.opm).includes(nLabel));
  if (!q) return '';

  // PMs presentes nesta unidade (match exato pelo OPM do quadro ou pelo label)
  const nOpm = normQ(q.opm);
  const unitPms = Object.entries(p1ByUnit)
    .filter(([opm]) => normQ(opm) === nOpm || normQ(opm) === nLabel)
    .flatMap(([, arr]) => arr);

  const present = cat => unitPms.filter(r => p1Cat(r.posto) === cat && !p1AfastHoje[r.re]).length;

  const grupos = [
    { label: 'Oficiais',   fx: (Number(q.fx_ten_cel)||0)+(Number(q.fx_maj)||0)+(Number(q.fx_cap)||0)+(Number(q.fx_ten)||0)+(Number(q.fx_of_med)||0), ex: (Number(q.ex_ten_cel)||0)+(Number(q.ex_maj)||0)+(Number(q.ex_cap)||0)+(Number(q.ex_ten)||0)+(Number(q.ex_of_med)||0), cat: 'of' },
    { label: 'St / Sgt',   fx: Number(q.fx_subten_sgt)||0, ex: Number(q.ex_subten_sgt)||0, cat: 'sub' },
    { label: 'Cb / Sd',    fx: Number(q.fx_cb_sd)||0,      ex: Number(q.ex_cb_sd)||0,      cat: 'cbsd' },
  ];
  const totalFx = Number(q.fx_total)||0;
  const totalEx = Number(q.ex_total)||0;
  const totalClaro = totalFx - totalEx;
  const claroColor = c => c > 5 ? '#e05555' : c > 0 ? '#c8a84b' : '#4bc87a';

  const rows = grupos.map(g => {
    const pres = present(g.cat);
    return `<tr>
      <td style="padding:6px 8px;font-size:19px;color:var(--tx)">${g.label}</td>
      <td style="padding:6px 8px;font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);text-align:right">${g.fx}</td>
      <td style="padding:6px 8px;font-family:'DM Mono',monospace;font-size:19px;color:#c8a84b;text-align:right">${g.ex}</td>
      <td style="padding:6px 8px;font-family:'DM Mono',monospace;font-size:19px;color:#4bc87a;text-align:right">${pres}</td>
    </tr>`;
  }).join('');

  return `<div style="margin-top:14px;border-top:1px solid rgba(255,255,255,.07);padding-top:12px">
    <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:#5a9de0;text-transform:uppercase;margin-bottom:8px">Quadro Fixado</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="padding:4px 8px;font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);text-align:left;letter-spacing:1px">GRADUAÇÃO</th>
        <th style="padding:4px 8px;font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);text-align:right;letter-spacing:1px">FIXADO</th>
        <th style="padding:4px 8px;font-family:'DM Mono',monospace;font-size:19px;color:#c8a84b;text-align:right;letter-spacing:1px">EX QUAD</th>
        <th style="padding:4px 8px;font-family:'DM Mono',monospace;font-size:19px;color:#4bc87a;text-align:right;letter-spacing:1px">PRESENTE</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:flex;justify-content:space-between;margin-top:8px;padding:6px 8px;background:rgba(255,255,255,.03);border-radius:4px">
      <span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3)">TOTAL FX <b style="color:var(--tx)">${totalFx}</b> · EX <b style="color:#c8a84b">${totalEx}</b></span>
      <span style="font-family:'DM Mono',monospace;font-size:19px;font-weight:700;color:${claroColor(totalClaro)}">CLARO ${totalClaro > 0 ? '−'+totalClaro : totalClaro === 0 ? '0' : '+'+Math.abs(totalClaro)}</span>
    </div>
  </div>`;
}

// ── Upload Quadro Fixado ──────────────────────────────────────────────────────

let p1QuadroParsed = [];

function openQuadroUpload() {
  const mo = document.getElementById('quadro-upl-mo');
  if (!mo) return;
  mo.style.display = 'flex';
  document.getElementById('quadro-upl-file').value = '';
  document.getElementById('quadro-upl-preview').textContent = '';
  document.getElementById('quadro-upl-msg').textContent = '';
  const btn = document.getElementById('quadro-upl-btn');
  btn.disabled = true; btn.style.opacity = '.5';
  p1QuadroParsed = [];
}

function closeQuadroUpload() {
  const mo = document.getElementById('quadro-upl-mo');
  if (mo) mo.style.display = 'none';
}

function quadroUplClickOut(e) {
  if (e.target === document.getElementById('quadro-upl-mo')) closeQuadroUpload();
}

function quadroFileChange() {
  const file = document.getElementById('quadro-upl-file').files[0];
  const prev = document.getElementById('quadro-upl-preview');
  const btn  = document.getElementById('quadro-upl-btn');
  p1QuadroParsed = [];
  btn.disabled = true; btn.style.opacity = '.5';
  prev.innerHTML = '';
  document.getElementById('quadro-upl-msg').innerHTML = '';
  if (!file) return;

  // Mapeamento flexível de colunas do CSV
  const HEADER_MAP = {
    'municipio': 'municipio', 'município': 'municipio',
    'opm': 'opm',
    'fx ten cel': 'fx_ten_cel', 'fx_ten_cel': 'fx_ten_cel',
    'ex ten cel': 'ex_ten_cel', 'ex_ten_cel': 'ex_ten_cel',
    'fx maj': 'fx_maj', 'fx_maj': 'fx_maj',
    'ex maj': 'ex_maj', 'ex_maj': 'ex_maj',
    'fx cap': 'fx_cap', 'fx_cap': 'fx_cap',
    'ex cap': 'ex_cap', 'ex_cap': 'ex_cap',
    'fx ten': 'fx_ten', 'fx_ten': 'fx_ten',
    'ex ten': 'ex_ten', 'ex_ten': 'ex_ten',
    'fx of med': 'fx_of_med', 'fx_of_med': 'fx_of_med',
    'ex of med': 'ex_of_med', 'ex_of_med': 'ex_of_med',
    'fx subten sgt': 'fx_subten_sgt', 'fx_subten_sgt': 'fx_subten_sgt', 'fx st sgt': 'fx_subten_sgt',
    'ex subten sgt': 'ex_subten_sgt', 'ex_subten_sgt': 'ex_subten_sgt', 'ex st sgt': 'ex_subten_sgt',
    'fx cb sd': 'fx_cb_sd', 'fx_cb_sd': 'fx_cb_sd',
    'ex cb sd': 'ex_cb_sd', 'ex_cb_sd': 'ex_cb_sd',
    'fx total': 'fx_total', 'fx_total': 'fx_total',
    'ex total': 'ex_total', 'ex_total': 'ex_total',
  };

  Papa.parse(file, {
    header: true, skipEmptyLines: true,
    transformHeader: h => {
      const k = h.trim().toLowerCase().replace(/[ºª°]/g,'');
      return HEADER_MAP[k] || h.trim();
    },
    complete: r => {
      if (!r.data.length) { prev.innerHTML = '<span style="color:#f07878">Arquivo vazio.</span>'; return; }
      const required = ['municipio', 'opm'];
      const missing  = required.filter(c => !Object.keys(r.data[0]).includes(c));
      if (missing.length) {
        prev.innerHTML = `<span style="color:#f07878">Colunas ausentes: <b>${missing.join(', ')}</b>.</span>`;
        return;
      }
      p1QuadroParsed = r.data.map(row => {
        const n = {};
        Object.entries(row).forEach(([k, v]) => { n[k] = (v||'').trim(); });
        return n;
      }).filter(row => row.opm);
      prev.innerHTML = `<span style="color:#4bc87a">✓ <b>${p1QuadroParsed.length}</b> unidades lidas.</span>`;
      btn.disabled = false; btn.style.opacity = '1';
    },
    error: err => { prev.innerHTML = `<span style="color:#f07878">Erro: ${err.message}</span>`; }
  });
}

async function quadroConfirmUpload() {
  const btn = document.getElementById('quadro-upl-btn');
  const msg = document.getElementById('quadro-upl-msg');
  if (!p1QuadroParsed.length) return;
  btn.disabled = true; btn.style.opacity = '.5';
  msg.innerHTML = '<span style="color:var(--tx3)">Enviando...</span>';
  try {
    const res = await authFetch(`${API}/p1/quadro/upload`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: p1QuadroParsed })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
    msg.innerHTML = `<span style="color:#4bc87a">✓ ${data.inserted || p1QuadroParsed.length} registros importados.</span>`;
    registraUpload();
    await loadP1();
    setTimeout(closeQuadroUpload, 1500);
  } catch (err) {
    msg.innerHTML = `<span style="color:#f07878">Erro: ${err.message}</span>`;
    btn.disabled = false; btn.style.opacity = '1';
  }
}

// ── Vagas (Efetivo Fixado) ───────────────────────────────────────────────────

function openVagasModal() {
  const mo = document.getElementById('vagas-mo');
  if (!mo) return;
  mo.style.display = 'flex';
  renderVagasTable();
}

function closeVagasModal() {
  const mo = document.getElementById('vagas-mo');
  if (mo) mo.style.display = 'none';
}
function vagasClickOut(e) { if (e.target.id === 'vagas-mo') closeVagasModal(); }

function renderVagasTable() {
  const tbl = document.getElementById('vagas-tbl');
  if (!tbl) return;
  const vagasMap = {};
  p1Vagas.forEach(v => { vagasMap[v.opm] = v.vagas; });
  const opms = Object.keys(p1ByUnit).sort();
  if (!opms.length) {
    tbl.innerHTML = '<div style="color:var(--tx3);font-size:19px;padding:10px 0">Nenhum efetivo importado.</div>';
    return;
  }
  tbl.innerHTML = `<table style="width:100%;border-collapse:collapse">
    <thead><tr>
      <th style="text-align:left;padding:9px 10px;border-bottom:1px solid var(--bd);font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px">OPM</th>
      <th style="text-align:right;padding:9px 10px;border-bottom:1px solid var(--bd);font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px">Efetivo Atual</th>
      <th style="text-align:right;padding:9px 10px;border-bottom:1px solid var(--bd);font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px">Vagas Autorizadas</th>
    </tr></thead>
    <tbody>${opms.map(opm => {
      const atual = p1ByUnit[opm]?.length || 0;
      const vagas = vagasMap[opm] !== undefined ? vagasMap[opm] : '';
      return `<tr>
        <td style="padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.03);font-size:19px;color:var(--tx)">${opm}</td>
        <td style="padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.03);text-align:right;font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3)">${atual}</td>
        <td style="padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.03);text-align:right">
          <input type="number" min="0" value="${vagas}" onchange="saveVaga('${opm.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}', this.value, this)"
            style="width:90px;background:var(--s2);border:1px solid var(--bd);color:var(--tx);border-radius:4px;padding:5px 8px;font-size:19px;text-align:right;font-family:'DM Mono',monospace">
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

async function saveVaga(opm, vagas, inputEl) {
  const msgEl = document.getElementById('vagas-msg');
  try {
    const res = await authFetch(`${API}/p1/vagas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opm, vagas: Number(vagas) })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const idx = p1Vagas.findIndex(v => v.opm === opm);
    if (idx >= 0) p1Vagas[idx].vagas = Number(vagas);
    else p1Vagas.push({ opm, vagas: Number(vagas) });
    if (inputEl) { inputEl.style.borderColor = '#4bc87a'; setTimeout(() => { if (inputEl) inputEl.style.borderColor = ''; }, 1500); }
    if (msgEl) { msgEl.style.color = '#4bc87a'; msgEl.textContent = 'Salvo.'; setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 2000); }
  } catch (err) {
    if (msgEl) { msgEl.style.color = '#f07878'; msgEl.textContent = err.message; }
  }
}

// ── Exportar Situação do Efetivo ─────────────────────────────────────────────

function exportarSituacao() {
  if (!p1Data.length) { alert('Nenhum dado para exportar.'); return; }
  const hoje = new Date().toISOString().split('T')[0];
  const fmtD = s => { if (!s) return ''; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
  const anoAtual = new Date().getFullYear();
  const cols = ['RE','Nome','Nome de Guerra','Posto','OPM','Função','Status','Tipo Afastamento','Início Afastamento','Término Afastamento','Possui Restrição','Tipos Restrição','EAP'];
  const rows = p1Data.map(r => {
    const afsts = p1AfastHoje[r.re] || [];
    const afst  = afsts[0];
    const eapOk = r.data_eap && !isNaN(new Date(r.data_eap)) && new Date(r.data_eap).getFullYear() === anoAtual;
    return [
      r.re, r.nome, r.nome_guerra || '', r.posto || '', r.opm || '', r.funcao || '',
      afst ? 'Afastado' : 'Apto',
      afst?.tipo_afastamento || '',
      afst ? fmtD(afst.inicio) : '',
      afst ? fmtD(afst.termino) : '',
      r.possui_restricao || 'N',
      r.tipos_restricao || '',
      eapOk ? fmtD(r.data_eap) : 'Pendente'
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const csv  = [cols.map(c => `"${c}"`).join(','), ...rows].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `situacao-efetivo-${hoje}.csv`;
  a.click();
}

// ── Módulo de Fotos PM ───────────────────────────────────────────────────────

// Gera avatar SVG com iniciais coloridas por posto
function p1AvatarSVG(nome, posto) {
  const cat = p1Cat(posto);
  const colors = { cbsd: '#5a9de0', sgt: '#c8a84b', sub: '#4bc87a', of: '#e05555' };
  const bg = colors[cat] || '#607090';
  const initials = (nome || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="16" fill="${bg}33"/>
    <circle cx="16" cy="16" r="15.5" fill="none" stroke="${bg}" stroke-width="1"/>
    <text x="16" y="21" text-anchor="middle" fill="${bg}" font-family="DM Mono,monospace" font-size="14" font-weight="600">${initials}</text>
  </svg>`;
}

// Atualiza um elemento avatar com foto real ou SVG de initials
function renderAvatarEl(el, re, foto) {
  if (!el) return;
  if (foto) {
    el.innerHTML = `<img src="${foto}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1.5px solid rgba(255,255,255,.18)">`;
  } else {
    el.innerHTML = p1AvatarSVG(el.dataset.nome || '', el.dataset.posto || '');
  }
}

// Abre modal de foto para um PM
async function openFotoModal(re, nome, posto) {
  const mo = document.getElementById('foto-mo');
  if (!mo) return;
  mo.style.display = 'flex';
  document.getElementById('foto-mo-nome').textContent = nome || re;
  document.getElementById('foto-mo-posto').textContent = posto || '—';
  document.getElementById('foto-mo-re').textContent = `RE ${re}`;
  document.getElementById('foto-mo-re-data').value = re;
  document.getElementById('foto-mo-msg').textContent = '';
  document.getElementById('foto-mo-msg').style.color = 'var(--tx3)';
  const img = document.getElementById('foto-img');
  img.style.display = 'none';
  img.src = '';
  document.getElementById('foto-placeholder').style.display = 'flex';

  const u = JSON.parse(localStorage.getItem('auth_user') || '{}');
  const canEdit = ['admin', 'p1', 'ti'].includes(u.role);
  document.getElementById('foto-edit-area').style.display = canEdit ? 'block' : 'none';
  document.getElementById('foto-readonly-note').style.display = canEdit ? 'none' : 'block';
  document.getElementById('foto-file-input').value = '';

  // Usa cache se disponível
  if (p1Fotos[re] !== undefined) {
    if (p1Fotos[re]) {
      img.src = p1Fotos[re]; img.style.display = 'block';
      document.getElementById('foto-placeholder').style.display = 'none';
    }
    return;
  }

  // Busca do servidor
  try {
    const data = await authFetch(`${API}/p1/foto/${encodeURIComponent(re)}`).then(r => r.json());
    if (data?.foto_base64) {
      img.src = data.foto_base64; img.style.display = 'block';
      document.getElementById('foto-placeholder').style.display = 'none';
      p1Fotos[re] = data.foto_base64;
      document.querySelectorAll(`[data-foto-re="${re}"]`).forEach(el => renderAvatarEl(el, re, data.foto_base64));
    } else {
      p1Fotos[re] = null;
    }
  } catch (_) {}
}

function closeFotoModal() {
  const mo = document.getElementById('foto-mo');
  if (mo) mo.style.display = 'none';
  const fi = document.getElementById('foto-file-input');
  if (fi) fi.value = '';
}

function fotoClickOut(e) { if (e.target.id === 'foto-mo') closeFotoModal(); }

// Comprime imagem via canvas antes do upload
function compressImage(dataUrl, maxDim, quality, callback) {
  const img = new Image();
  img.onload = () => {
    let w = img.width, h = img.height;
    if (w > maxDim || h > maxDim) {
      if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
      else { w = Math.round(w * maxDim / h); h = maxDim; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', quality));
  };
  img.src = dataUrl;
}

function fotoPreviewChange() {
  const file = document.getElementById('foto-file-input').files[0];
  const msg  = document.getElementById('foto-mo-msg');
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    msg.style.color = '#f07878';
    msg.textContent = 'Selecione um arquivo de imagem (JPG, PNG, etc).';
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    compressImage(e.target.result, 400, 0.82, compressed => {
      document.getElementById('foto-img').src = compressed;
      document.getElementById('foto-img').style.display = 'block';
      document.getElementById('foto-placeholder').style.display = 'none';
      msg.textContent = '';
    });
  };
  reader.readAsDataURL(file);
}

async function p1SaveFoto() {
  const re  = document.getElementById('foto-mo-re-data').value;
  const img = document.getElementById('foto-img');
  const msg = document.getElementById('foto-mo-msg');
  if (!img.src || img.style.display === 'none') {
    msg.style.color = '#f07878';
    msg.textContent = 'Selecione uma imagem primeiro.';
    return;
  }
  msg.style.color = 'var(--tx3)'; msg.textContent = 'Salvando...';
  try {
    const res = await authFetch(`${API}/p1/foto/${encodeURIComponent(re)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ foto_base64: img.src })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    p1Fotos[re] = img.src;
    document.querySelectorAll(`[data-foto-re="${re}"]`).forEach(el => renderAvatarEl(el, re, img.src));
    msg.style.color = '#4bc87a'; msg.textContent = 'Foto salva com sucesso.';
  } catch (err) {
    msg.style.color = '#f07878'; msg.textContent = err.message;
  }
}

async function p1RemoveFoto() {
  const re  = document.getElementById('foto-mo-re-data').value;
  const msg = document.getElementById('foto-mo-msg');
  if (!confirm('Remover a foto deste PM?')) return;
  try {
    const res = await authFetch(`${API}/p1/foto/${encodeURIComponent(re)}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    p1Fotos[re] = null;
    document.getElementById('foto-img').style.display = 'none';
    document.getElementById('foto-img').src = '';
    document.getElementById('foto-placeholder').style.display = 'flex';
    document.getElementById('foto-file-input').value = '';
    document.querySelectorAll(`[data-foto-re="${re}"]`).forEach(el => renderAvatarEl(el, re, null));
    msg.style.color = '#4bc87a'; msg.textContent = 'Foto removida.';
  } catch (err) {
    msg.style.color = '#f07878'; msg.textContent = err.message;
  }
}

// Expande painel de efetivo por unidade com cards fotográficos
function p1CloseUnit() {
  const det = document.getElementById('p1-unit-detail');
  if (det) det.innerHTML = '';
  document.querySelectorAll('.p1-uc').forEach(el => {
    el.classList.remove('sel');
    el.style.borderColor = '';
    el.style.transform = '';
    el.style.boxShadow = '';
  });
  document.querySelectorAll('.p1-ubtn').forEach(el => el.classList.remove('sel'));
  if (p1UnitClickOut) { document.removeEventListener('click', p1UnitClickOut); p1UnitClickOut = null; }
}

function p1ShowByKeys(ci, ui, label) {
  // Deselect all unit buttons, select clicked one
  document.querySelectorAll('.p1-ubtn').forEach(el => {
    el.classList.remove('sel');
    el.style.borderColor = 'rgba(255,255,255,.1)';
    el.style.color = 'var(--tx2)';
  });
  const btn = document.querySelector(`.p1-ubtn[data-ci="${ci}"][data-ui="${ui}"]`);
  if (btn) {
    const ciaColor = CIA_STRUCT[ci]?.color || 'var(--gold)';
    btn.classList.add('sel');
    btn.style.borderColor = ciaColor;
    btn.style.color = 'var(--tx)';
    btn.style.background = `${ciaColor}18`;
  }
  const keys = CIA_STRUCT[ci]?.units[ui]?.keys || [];
  const pms  = Object.entries(p1ByUnit).filter(([opm]) => _opmMatch(opm, keys)).flatMap(([,arr]) => arr);
  p1ShowPmList(pms, label);
}

function p1ShowUnit(unit) {
  const selCard = document.querySelector(`.p1-uc[data-unit="${unit.replace(/"/g,'\\"')}"]`);
  if (selCard && selCard.classList.contains('sel')) { p1CloseUnit(); return; }
  document.querySelectorAll('.p1-uc').forEach(el => { el.classList.remove('sel'); el.style.borderColor = ''; el.style.transform = ''; el.style.boxShadow = ''; });
  document.querySelectorAll('.p1-ubtn').forEach(el => el.classList.remove('sel'));
  if (selCard) selCard.classList.add('sel');
  const pms = p1ByUnit[unit] || [];
  p1ShowPmList(pms, unit);
}

function p1ShowPmList(pms, label) {
  const det = document.getElementById('p1-unit-detail');
  if (!det) return;
  const escA = s => (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");

  const cards = pms.map(r => {
    const afst        = p1AfastHoje[r.re];
    const statusColor = afst ? '#e05555' : '#4bc87a';
    const statusTxt   = afst ? (afst[0]?.tipo_afastamento || 'AFASTADO') : 'APTO';
    const _re         = escA(r.re || '');
    const fotoCached  = p1Fotos[r.re];
    const avatarContent = fotoCached
      ? `<img src="${fotoCached}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.18)">`
      : p1AvatarSVG(r.nome_guerra || r.nome, r.posto).replace('width="32" height="32" viewBox="0 0 32 32"','width="56" height="56" viewBox="0 0 32 32"');
    return `<div onclick="openProntuario('${_re}')" style="background:rgba(255,255,255,.025);border:1px solid var(--bd);border-radius:8px;padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;transition:border-color .15s;text-align:center" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--bd)'">
      <div data-foto-re="${r.re}" data-nome="${(r.nome_guerra||r.nome).replace(/"/g,'&quot;')}" data-posto="${(r.posto||'').replace(/"/g,'&quot;')}">${avatarContent}</div>
      <div style="font-size:19px;color:var(--tx3);font-family:'DM Mono',monospace;margin-top:2px">${r.posto || '—'}</div>
      <div style="font-size:19px;color:var(--tx3);font-family:'DM Mono',monospace">RE ${r.re}</div>
      <div style="font-size:19px;font-weight:700;color:var(--tx);line-height:1.3;word-break:break-word">${r.nome_guerra || r.nome}</div>
      <div style="font-size:19px;padding:2px 8px;border-radius:10px;background:${statusColor}22;color:${statusColor};font-family:'DM Mono',monospace;margin-top:2px">${statusTxt}</div>
    </div>`;
  }).join('');

  const quadroHtml = quadroForUnit(label);

  det.innerHTML = `<div id="p1-unit-panel" style="margin-top:14px;background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:16px 18px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:var(--gold);text-transform:uppercase">${label} — ${pms.length} militares</div>
      <button onclick="p1CloseUnit()" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:var(--tx3);border-radius:4px;padding:3px 10px;cursor:pointer;font-size:19px">✕ Fechar</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px">${cards}</div>
    ${quadroHtml}
  </div>`;

  det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  if (p1UnitClickOut) document.removeEventListener('click', p1UnitClickOut);
  setTimeout(() => {
    p1UnitClickOut = e => {
      if (prontoCurrentRe || p1ClosingPronto) return;
      if (!det.contains(e.target) && !e.target.closest('.p1-uc') && !e.target.closest('.p1-ubtn')) {
        p1CloseUnit();
      }
    };
    document.addEventListener('click', p1UnitClickOut);
  }, 0);
}

// ── Tela Inicial (Home) ───────────────────────────────────────────────────────
function renderHome() {
  const el = document.getElementById('home-content');
  if (!el) return;
  const u    = JSON.parse(localStorage.getItem('auth_user') || '{}');
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const data = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const saudacao = (() => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; })();
  // Prefere nome de guerra do efetivo (cruza matricula do login com RE do efetivo, ignorando dígito)
  const normRe = re => String(re||'').trim().split('-')[0].trim();
  const pmRec = p1Data && u.matricula ? p1Data.find(r => normRe(r.re) === normRe(u.matricula)) : null;
  const nome = pmRec?.nome_guerra || pmRec?.nome || (u.nome || '').split(' ')[0];

  // ── Resumo P1 ─────────────────────────────────────────────────────────────
  let p1Preview = '';
  if (p1Data && p1Data.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const afH = {};
    (p1Afasts || []).forEach(a => {
      if (a.inicio <= today && (!a.termino || a.termino >= today)) {
        if (!afH[a.re]) afH[a.re] = [];
        afH[a.re].push(a);
      }
    });
    const getPms  = keys => p1Data.filter(r => _opmMatch(r.opm, keys));
    const stOf    = pms  => {
      const total = pms.length, afst = pms.filter(r => afH[r.re]).length;
      const restr = pms.filter(r => (r.possui_restricao||'').toLowerCase().startsWith('s')).length;
      const pct   = total ? Math.round((total - afst) / total * 100) : 0;
      const color = pct >= 80 ? '#4bc87a' : pct >= 60 ? '#c8a84b' : '#e8b840';
      return { total, afst, restr, aptos: total - afst, pct, color };
    };
    const gs = stOf(p1Data);

    // EAP pendente
    const anoAtualH = new Date().getFullYear();
    const eapPend = p1Data.filter(r => {
      if (!r.data_eap) return true;
      const d = new Date(r.data_eap);
      return isNaN(d) || d.getFullYear() !== anoAtualH;
    }).length;

    // Férias
    const em15s  = (() => { const d = new Date(); d.setDate(d.getDate() + 15); return d.toISOString().split('T')[0]; })();
    const ferGozo = (p1Afasts||[]).filter(a => isFer(a.tipo_afastamento) && a.inicio <= today && (!a.termino || a.termino >= today)).length;
    const fer15   = (p1Afasts||[]).filter(a => isFer(a.tipo_afastamento) && a.inicio > today && a.inicio <= em15s).length;

    // Restrições vencendo em 30 dias
    const em30s = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
    const restrVenc = p1Data.filter(r =>
      (r.possui_restricao||'').toLowerCase().startsWith('s') &&
      r.restricao_termino && r.restricao_termino >= today && r.restricao_termino <= em30s
    ).length;

    // Tipo de afastamento mais frequente
    const tipoCount = {};
    Object.values(afH).flat().forEach(a => { tipoCount[a.tipo_afastamento] = (tipoCount[a.tipo_afastamento]||0) + 1; });
    const topAfst = Object.entries(tipoCount).sort((a,b) => b[1]-a[1])[0];

    // Alertas
    const alertas = [];
    if (eapPend > 0)   alertas.push(`<span style="color:#c8a84b">⚠ ${eapPend} EAP pend.</span>`);
    if (restrVenc > 0) alertas.push(`<span style="color:#c8a84b">⚠ ${restrVenc} restr. vencem</span>`);
    if (ferGozo > 0)   alertas.push(`<span style="color:#5a9de0">${ferGozo} em férias</span>`);
    if (fer15 > 0)     alertas.push(`<span style="color:#5a9de0">${fer15} férias em 15d</span>`);
    if (topAfst)       alertas.push(`<span style="color:var(--tx3)">Afst líder: <span style="color:var(--tx2)">${topAfst[0]} (${topAfst[1]})</span></span>`);

    const allCiaKeys = CIA_STRUCT.flatMap(c => c.units.flatMap(u => u.keys));
    const unmatchedOpms = [...new Set(p1Data.map(r => r.opm).filter(o => o && !_opmMatch(o, allCiaKeys)))];

    const makeRow = (label, color, pms) => {
      if (!pms.length) return '';
      const s = stOf(pms);
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:${color};width:48px;flex-shrink:0">${label}</div>
        <div style="flex:1;background:rgba(255,255,255,.06);border-radius:3px;height:6px;overflow:hidden">
          <div style="height:100%;width:${s.pct}%;background:${s.color};border-radius:3px"></div>
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:${s.color};width:38px;text-align:right">${s.pct}%</div>
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);width:58px">${s.total} PMs</div>
        ${s.afst  > 0 ? `<div style="font-family:'DM Mono',monospace;font-size:19px;color:#e05555">${s.afst} afst</div>` : ''}
        ${s.restr > 0 ? `<div style="font-family:'DM Mono',monospace;font-size:19px;color:#c8a84b">${s.restr} restr</div>` : ''}
      </div>`;
    };

    const ciaRows = [
      ...CIA_STRUCT.map(cia => makeRow(cia.label, cia.color, getPms(cia.units.flatMap(u => u.keys)))),
      ...unmatchedOpms.map(opm => makeRow(opm, 'var(--tx3)', p1Data.filter(r => r.opm === opm)))
    ].filter(Boolean).join('');

    p1Preview = `
      <div style="border-top:1px solid var(--bd);margin-top:10px;padding-top:10px">
        <div style="display:flex;gap:14px;margin-bottom:10px;flex-wrap:wrap">
          <div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:var(--tx)">${gs.total}</span><span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-left:4px">total</span></div>
          <div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:#4bc87a">${gs.aptos}</span><span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-left:4px">aptos</span></div>
          <div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:${gs.afst>0?'#e05555':'var(--tx3)'}">${gs.afst}</span><span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-left:4px">afst</span></div>
          <div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:${gs.restr>0?'#c8a84b':'var(--tx3)'}">${gs.restr}</span><span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-left:4px">restr</span></div>
        </div>
        ${ciaRows}
        ${alertas.length ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bd);display:flex;flex-wrap:wrap;gap:8px;font-family:'DM Mono',monospace;font-size:19px">${alertas.join('<span style="color:var(--bd2)">·</span>')}</div>` : ''}
      </div>`;
  }

  // ── Resumo P3 ─────────────────────────────────────────────────────────────
  let p3Preview = '';
  if (RAW && RAW.length > 0) {
    const anos  = [...new Set(RAW.map(r => r.ano))].sort((a,b) => b - a);
    const anoR  = anos[0];
    const meses = getMesForAno(anoR);
    const mesR  = meses[meses.length - 1];
    const rawMes = RAW.filter(r => r.ano === anoR && r.mes === mesR);
    const totalMes = rawMes.reduce((s, r) => s + (r.avaliado || 0), 0);
    const totalMeta = rawMes.reduce((s, r) => s + (r.meta || 0), 0);
    const pctMeta = totalMeta > 0 ? Math.round(totalMes / totalMeta * 100) : null;
    const metaColor = pctMeta === null ? 'var(--tx3)' : pctMeta <= 100 ? '#4bc87a' : '#e8b840';
    // Crime mais fora da meta no mês (maior desvio % acima)
    const porCrimeMeta = {};
    rawMes.forEach(r => {
      if (!porCrimeMeta[r.crime]) porCrimeMeta[r.crime] = { a: 0, m: 0 };
      porCrimeMeta[r.crime].a += (r.avaliado || 0);
      porCrimeMeta[r.crime].m += (r.meta || 0);
    });
    const crimesAcima = Object.entries(porCrimeMeta)
      .filter(([, v]) => v.m > 0 && v.a > v.m)
      .sort(([, a], [, b]) => (b.a / b.m) - (a.a / a.m));
    const topCritico = crimesAcima[0];
    const criticoTxt = topCritico
      ? `Crítico em ${mesR}: <span style="color:#e8b840">${topCritico[0]}</span> <span style="color:#e8b840">+${Math.round((topCritico[1].a / topCritico[1].m - 1) * 100)}%</span>`
      : `<span style="color:#4bc87a">✓ Em ${mesR}, todos os crimes dentro da meta</span>`;

    p3Preview = `
      <div style="border-top:1px solid var(--bd);margin-top:10px;padding-top:10px">
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px;margin-bottom:6px">${mesR} ${anoR}</div>
        <div style="display:flex;gap:14px;margin-bottom:8px;flex-wrap:wrap">
          <div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:var(--tx)">${totalMes}</span><span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-left:4px">ocorr.</span></div>
          ${pctMeta !== null ? `<div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:${metaColor}">${pctMeta}%</span><span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-left:4px">da meta</span></div>` : ''}
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff">${criticoTxt}</div>
      </div>`;
  }

  // ── Insights / Rankings ───────────────────────────────────────────────────
  let insightsHtml = '';
  const hasP1ins = p1Data && p1Data.length > 0;
  const hasP3ins = RAW && RAW.length > 0;
  if (hasP1ins || hasP3ins) {
    const insColsP1 = [], insColsP3Meta = [], insColsP3Fora = [];

    if (hasP3ins) {
      const anos3  = [...new Set(RAW.map(r => r.ano))].sort((a,b) => b-a);
      const ano3   = anos3[0];
      const meses3 = getMesForAno(ano3);
      const mes3   = meses3[meses3.length - 1];
      const rawM   = RAW.filter(r => r.ano === ano3 && r.mes === mes3);

      // Crimes × meta — totais do batalhão
      const crimesSoma = CRIMES.map(c => {
        const recs = rawM.filter(r => r.crime === c);
        const aval = recs.reduce((s,r) => s + (r.avaliado||0), 0);
        const meta = recs.reduce((s,r) => s + (r.meta||0), 0);
        return { c, aval, meta };
      }).filter(x => x.aval > 0 || x.meta > 0);
      if (crimesSoma.length > 0) {
        const crimesSomaRows = crimesSoma.map((d, i) => {
          const ok = d.aval <= d.meta;
          const col = ok ? '#4bc87a' : '#e8b840';
          const status = ok ? '✓ Na meta' : '✗ Acima';
          return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0${i<crimesSoma.length-1?';border-bottom:1px solid var(--bd)':''}">
            <div style="flex:1;font-size:19px;color:#ffffff">${d.c}</div>
            <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff">Meta <b style="color:#ffffff">${d.meta}</b></div>
            <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff">Aval <b style="color:${col}">${d.aval}</b></div>
            <div style="font-family:'DM Mono',monospace;font-size:19px;color:${col};width:72px;text-align:right">${status}</div>
          </div>`;
        }).join('');
        insColsP3Meta.push(`<div style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid #5a9de0;border-radius:10px;padding:20px">
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#5a9de0;letter-spacing:1.5px;margin-bottom:12px">P3 · CRIMES × META — ${mes3} ${ano3} — BATALHÃO</div>
          ${crimesSomaRows}
        </div>`);
      }

      // Municípios por nº de crimes fora da meta
      const munCrimesFora = {};
      rawM.forEach(r => {
        if (!r.mun || !r.meta) return;
        if (!munCrimesFora[r.mun]) munCrimesFora[r.mun] = { fora: 0, total: 0 };
        munCrimesFora[r.mun].total++;
        if (r.avaliado > r.meta) munCrimesFora[r.mun].fora++;
      });
      const munRank = Object.entries(munCrimesFora)
        .filter(([, v]) => v.fora > 0)
        .map(([m, v]) => ({ m, fora: v.fora, total: v.total }))
        .sort((a, b) => b.fora - a.fora || b.total - a.total)
        .slice(0, 6);
      if (munRank.length > 0) {
        const munRows3 = munRank.map((item, i) => {
          const col = item.fora >= 4 ? '#e8b840' : item.fora >= 2 ? '#c8a84b' : '#e0d0a0';
          return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0${i<munRank.length-1?';border-bottom:1px solid var(--bd)':''}">
            <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;width:22px;flex-shrink:0">${i+1}</div>
            <div style="flex:1;font-size:19px;color:#ffffff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.m}</div>
            <div style="font-family:'DM Mono',monospace;font-size:19px;color:${col};font-weight:700;white-space:nowrap">${item.fora}/7 ▲</div>
          </div>`;
        }).join('');
        insColsP3Fora.push(`<div style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid #5a9de0;border-radius:10px;padding:20px">
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#5a9de0;letter-spacing:1.5px;margin-bottom:12px">P3 · CRIMES FORA DA META — ${mes3} ${ano3}</div>
          ${munRows3}
        </div>`);
      }
    }

    if (hasP1ins) {
      const today3 = new Date().toISOString().split('T')[0];
      const afH3 = {};
      (p1Afasts || []).forEach(a => {
        if (a.inicio <= today3 && (!a.termino || a.termino >= today3)) {
          if (!afH3[a.re]) afH3[a.re] = [];
          afH3[a.re].push(a);
        }
      });
      const stOf3 = pms => {
        const total = pms.length, afst = pms.filter(r => afH3[r.re]).length;
        const restr = pms.filter(r => (r.possui_restricao||'').toLowerCase().startsWith('s')).length;
        const pct = total ? Math.round((total - afst) / total * 100) : 0;
        const color = pct >= 80 ? '#4bc87a' : pct >= 60 ? '#c8a84b' : '#e8b840';
        return { total, afst, restr, aptos: total - afst, pct, color };
      };

      // CIA ranking por disponibilidade
      const ciaRank = CIA_STRUCT.map(cia => {
        const pms = p1Data.filter(r => _opmMatch(r.opm, cia.units.flatMap(u => u.keys)));
        if (!pms.length) return null;
        const s = stOf3(pms);
        return { label: cia.label, color: cia.color, ...s };
      }).filter(Boolean).sort((a, b) => b.pct - a.pct);
      if (ciaRank.length > 0) {
        const ciaRows3 = ciaRank.map((c, i) => `<div style="display:flex;align-items:center;gap:8px;padding:8px 0${i<ciaRank.length-1?';border-bottom:1px solid var(--bd)':''}">
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;width:22px;flex-shrink:0">${i+1}</div>
          <div style="width:10px;height:10px;border-radius:50%;background:${c.color};flex-shrink:0"></div>
          <div style="flex:1;font-size:19px;color:#ffffff">${c.label}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:${c.color};font-weight:700;width:44px;text-align:right">${c.pct}%</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;width:64px;text-align:right">${c.total} PMs</div>
        </div>`).join('');
        insColsP1.push(`<div style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid #4bc87a;border-radius:10px;padding:20px">
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#4bc87a;letter-spacing:1.5px;margin-bottom:12px">P1 · DISPONIBILIDADE POR CIA</div>
          ${ciaRows3}
        </div>`);
      }

      // Afastamentos por tipo
      const tipoCnt = {};
      Object.values(afH3).flat().forEach(a => { tipoCnt[a.tipo_afastamento] = (tipoCnt[a.tipo_afastamento] || 0) + 1; });
      const tipoRank = Object.entries(tipoCnt).sort((a, b) => b[1] - a[1]).slice(0, 6);
      if (tipoRank.length > 0) {
        const maxTipo = tipoRank[0][1];
        const tipoRows3 = tipoRank.map(([tipo, cnt], i) => {
          const pct = maxTipo > 0 ? Math.round(cnt / maxTipo * 100) : 0;
          return `<div style="margin-bottom:${i<tipoRank.length-1?'12':'0'}px">
            <div style="display:flex;justify-content:space-between;margin-bottom:5px">
              <div style="font-size:19px;color:#ffffff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:76%">${tipo}</div>
              <div style="font-family:'DM Mono',monospace;font-size:19px;color:#e05555;font-weight:700">${cnt}</div>
            </div>
            <div style="background:rgba(255,255,255,.06);border-radius:3px;height:5px"><div style="height:100%;width:${pct}%;background:#e05555;border-radius:3px"></div></div>
          </div>`;
        }).join('');
        insColsP1.push(`<div style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid #e05555;border-radius:10px;padding:20px">
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#e05555;letter-spacing:1.5px;margin-bottom:12px">P1 · RANKING AFASTAMENTOS POR TIPO</div>
          ${tipoRows3}
        </div>`);
      }
    }

    const insCols = [...insColsP1, ...insColsP3Meta, ...insColsP3Fora];
    if (insCols.length > 0) {
      insightsHtml = `<div style="margin-top:28px">
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;letter-spacing:2px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--bd)">INSIGHTS &amp; RANKINGS</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">${insCols.join('')}</div>
      </div>`;
    }
  }

  const sections = [
    {
      id: 'p1', icon: 'users', color: '#4bc87a', label: 'P1', title: 'Seção de Pessoal',
      desc: 'Gestão de efetivo, afastamentos, férias, restrições médicas, EAP e prontuário individual.',
      soon: false, action: `goSection('p1', document.getElementById('sec-p1'))`,
      preview: p1Preview
    },
    {
      id: 'p3', icon: 'shield', color: '#5a9de0', label: 'P3', title: 'Divisão Operacional',
      desc: 'Inteligência criminal, análise de crimes, metas SSP, ocorrências InfoCrim e relatórios operacionais.',
      soon: false, action: `goSection('p3', document.getElementById('sec-p3'))`,
      preview: p3Preview
    },
    {
      id: 'p4', icon: 'package', color: '#8090a8', label: 'P4', title: 'Seção de Materiais',
      desc: 'Controle de armamento, equipamentos, viaturas e logística do batalhão.',
      soon: true, preview: ''
    },
    {
      id: 'p5', icon: 'megaphone', color: '#8090a8', label: 'P5', title: 'Comunicação Social',
      desc: 'Comunicados internos, publicações, gestão da imagem institucional e eventos.',
      soon: true, preview: ''
    },
    {
      id: 'sjd', icon: 'scale', color: '#8090a8', label: 'PJMD', title: 'Pol. Judiciária Militar e Disciplina',
      desc: 'Processos administrativos, sindicâncias, punições e gestão disciplinar.',
      soon: true, preview: ''
    },
  ];

  const cards = sections.map(s => {
    const opacity = s.soon ? '0.45' : '1';
    const cursor  = s.soon ? 'default' : 'pointer';
    const click   = s.soon ? '' : `onclick="${s.action};closeSidebarMobile()"`;
    const hover   = s.soon ? '' : `onmouseover="this.style.borderColor='${s.color}';this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 24px rgba(0,0,0,.35)'" onmouseout="this.style.borderColor='var(--bd)';this.style.transform='';this.style.boxShadow=''"`;
    return `<div ${click} ${hover} style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid ${s.soon?'var(--bd)':s.color};border-radius:10px;padding:26px 22px;cursor:${cursor};transition:all .2s;opacity:${opacity};display:flex;flex-direction:column">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:14px">
        <div style="width:44px;height:44px;border-radius:10px;background:${s.color}18;border:1px solid ${s.color}33;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-lucide="${s.icon}" style="width:22px;height:22px;stroke:${s.color};stroke-width:1.75"></i>
        </div>
        ${s.soon ? `<span style="font-family:'DM Mono',monospace;font-size:19px;padding:3px 10px;border-radius:10px;background:rgba(255,255,255,.05);color:#ffffff;letter-spacing:1px">EM BREVE</span>` : `<span style="font-family:'DM Mono',monospace;font-size:19px;padding:3px 10px;border-radius:10px;background:${s.color}18;color:${s.color};letter-spacing:1px">ATIVO</span>`}
      </div>
      <div style="margin-bottom:8px">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:34px;font-weight:800;color:${s.soon?'var(--tx3)':s.color};letter-spacing:1px;line-height:1;margin-bottom:4px">${s.label}</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:600;color:#ffffff;letter-spacing:.5px">${s.title}</div>
      </div>
      <div style="font-size:19px;color:#ffffff;line-height:1.7">${s.desc}</div>
      ${s.preview || (!s.soon ? `<div style="border-top:1px solid var(--bd);margin-top:10px;padding-top:10px;font-family:'DM Mono',monospace;font-size:19px;color:${s.color};display:flex;align-items:center;gap:6px">Acessar <span style="font-size:19px">→</span></div>` : '')}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-tag">40º BPM/I — SISTEMA DE GESTÃO</div>
        <div class="ph-title">${saudacao}, <span>${nome || 'Usuário'}</span></div>
        <div style="font-size:19px;color:#ffffff;margin-top:4px;text-transform:capitalize">${data} · ${hora}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">
      ${cards}
    </div>
    ${insightsHtml}`;

  if (window.lucide) lucide.createIcons();
}

function updateSidebarImports(section) {
  const el = document.getElementById('sidebar-imports');
  if (!el) return;
  const role = currentRole();
  const isP3 = ['admin', 'p3', 'ti'].includes(role);
  const isP1 = ['admin', 'p1', 'ti'].includes(role);
  if (section === 'p1') {
    if (!isP1) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <button onclick="openP1Upload()" style="width:100%;padding:6px;background:rgba(200,168,75,.12);border:1px solid rgba(200,168,75,.25);color:var(--gold);border-radius:4px;cursor:pointer;font-size:19px;font-weight:600">↑ Importar Efetivo</button>
      <button onclick="openAfUpload()" style="margin-top:4px;width:100%;padding:6px;background:rgba(90,157,224,.12);border:1px solid rgba(90,157,224,.3);color:#5a9de0;border-radius:4px;cursor:pointer;font-size:19px;font-weight:600">↑ Importar Afastamentos</button>
      <button onclick="openQuadroUpload()" style="margin-top:4px;width:100%;padding:6px;background:rgba(75,200,122,.12);border:1px solid rgba(75,200,122,.3);color:#4bc87a;border-radius:4px;cursor:pointer;font-size:19px;font-weight:600">↑ Importar Quadro de Claros</button>`;
  } else if (section === 'p3') {
    if (!isP3) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <button onclick="openUploadModal()" style="width:100%;padding:6px;background:rgba(200,168,75,.12);border:1px solid rgba(200,168,75,.25);color:var(--gold);border-radius:4px;cursor:pointer;font-size:19px;font-weight:600">↑ Importar Banco de Dados RAC</button>
      <button onclick="openOcorrModal()" style="margin-top:4px;width:100%;padding:6px;background:rgba(61,122,191,.12);border:1px solid rgba(61,122,191,.3);color:#5a9de0;border-radius:4px;cursor:pointer;font-size:19px;font-weight:600">↑ Importar Ocorrências (InfoCrim)</button>`;
  } else if (section === 'p3prod') {
    if (!isP3) { el.innerHTML = ''; return; }
    const itens = [
      ['ocorrencias',      'Ocorrências Gerais',       '#5a9de0'],
      ['presos',           'Pessoas Presas',            '#e0965a'],
      ['armas',            'Armas Apreendidas',         '#e05555'],
      ['veiculos',         'Veículos Recuperados',      '#4bc8a0'],
      ['entorpecentes',    'Entorpecentes',             '#9b6de0'],
      ['visita-solidaria', 'Visita Solidária (VD)',     '#e05a8a'],
      ['tempo-resposta',   'Tempo Resposta Atend. Ocorrência', '#4bc8e0'],
      ['cursos',           'Cursos Institucionais',            '#9de05a'],
    ];
    el.innerHTML = itens.map(([t, l, c]) =>
      `<button onclick="openProdUpl('${t}')" style="width:100%;padding:6px;margin-top:4px;background:rgba(0,0,0,.15);border:1px solid ${c}55;color:${c};border-radius:4px;cursor:pointer;font-size:19px;font-weight:600">↑ ${l}</button>`
    ).join('') + `<button onclick="openDDUpl()" style="width:100%;padding:6px;margin-top:4px;background:rgba(0,0,0,.15);border:1px solid #5a9de055;color:#5a9de0;border-radius:4px;cursor:pointer;font-size:19px;font-weight:600">↑ Disque Denúncia</button>`;
  } else {
    el.innerHTML = '';
  }
}

function goSection(id, btn) {
  closeSidebarMobile();

  if (id === 'p3prod') {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('on'));
    if (btn) btn.classList.add('on');
    const submenu = document.getElementById('p3-submenu');
    if (submenu) submenu.style.display = '';
    document.getElementById('sec-p3').classList.add('on');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
    document.getElementById('page-p3prod').classList.add('on');
    updateSidebarImports('p3prod');
    loadProdData();
    loadDDData();
    return;
  }

  document.querySelectorAll('.sec-btn').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');

  if (id === 'home') {
    const submenu = document.getElementById('p3-submenu');
    if (submenu) submenu.style.display = 'none';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
    document.getElementById('page-home').classList.add('on');
    updateSidebarImports('home');
    renderHome();
    return;
  }

  const isP3 = id === 'p3';
  const submenu = document.getElementById('p3-submenu');
  if (submenu) submenu.style.display = isP3 ? '' : 'none';
  if (isP3) {
    currentP3Page = 'visao';
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('on'));
    const visaoBtn = document.querySelector('.nav-btn[onclick*="visao"]');
    if (visaoBtn) visaoBtn.classList.add('on');
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.getElementById(isP3 ? 'page-visao' : 'page-' + id).classList.add('on');
  updateSidebarImports(id);
  if (id === 'p1') {
    p1FiltroOpm = '';
    loadP1();
  }
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
}

function goPage(id, btn) {
  closeSidebarMobile();
  currentP3Page = id;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('on'));
  if (btn.classList.contains('sec-btn')) {
    document.querySelectorAll('.sec-btn').forEach(b => b.classList.remove('on'));
  }
  document.getElementById('page-' + id).classList.add('on');
  btn.classList.add('on');
  updateSidebarImports('p3');
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
}

// ---------------------------------------------------------------------------
// PRODUTIVIDADE P3
// ---------------------------------------------------------------------------
let prodRaw = { ocorrencias: [], presos: [], armas: [], veiculos: [], entorpecentes: [], visitaSolidaria: [], tempoResposta: [], cursos: [], loaded: false };
let prodSelAno    = null;
let prodSelMeses  = [];
let prodSelCia    = null;
let prodChs       = [];
let prodUplTipo   = null;
let prodUplParsed = [];
let prodEntorpUnit = null;
let prodEntorpCatCh = null;
let pdTipo = null, pdUnidade = null, pdChs = [], pdSelCia = '', pdMeses = [], pdNatFilter = null;

const PROD_CORES = {
  ocorrencias:      '#5a9de0',
  presos:           '#e0965a',
  armas:            '#e8b840',
  veiculos:         '#4bc8a0',
  entorpecentes:    '#9b6de0',
  'tempo-resposta': '#4bc8e0',
  cursos:           '#9de05a',
  taftat:           '#7b8cde'
};
const PROD_LABELS = {
  ocorrencias:        'Ocorrências Atendidas',
  presos:             'Pessoas Presas',
  armas:              'Armas Apreendidas',
  veiculos:           'Veículos Recuperados',
  entorpecentes:      'Entorpecentes Apreendidos',
  'visita-solidaria': 'Visita Solidária (VD)',
  'tempo-resposta':   'Tempo Resposta de Atendimento de Ocorrência',
  'cursos':           'Cursos Institucionais',
  'taftat':           'TAF / TAT'
};
const PROD_CAMPO = {
  ocorrencias:   'contagem',
  presos:        'quantidade',
  armas:         'quantidade',
  veiculos:      'quantidade',
  entorpecentes: 'quantidade'
};
const PROD_BREAK = {
  ocorrencias:   'natureza',
  presos:        'situacao',
  armas:         'tipo_arma',
  veiculos:      'situacao',
  entorpecentes: 'entorpecente'
};

const normCiaDisp = normCiaDisplay;

function prodFilter(arr) {
  return arr.filter(r => {
    if (prodSelAno && r.ano !== prodSelAno) return false;
    if (prodSelMeses.length && !prodSelMeses.some(m => m.toLowerCase() === (r.mes||'').toLowerCase())) return false;
    if (prodSelCia && normCiaDisp(r.cia) !== normCiaDisp(prodSelCia)) return false;
    return true;
  });
}

function prodSum(arr, field) {
  return arr.reduce((s, r) => s + (Number(r[field]) || 0), 0);
}

function prodGetAnosDisp() {
  const all = new Set();
  ['ocorrencias','presos','armas','veiculos','entorpecentes','visitaSolidaria','tempoResposta','cursos'].forEach(k => {
    if (Array.isArray(prodRaw[k])) prodRaw[k].forEach(r => r.ano && all.add(r.ano));
  });
  return [...all].sort((a, b) => b - a);
}

function prodGetMesesDisp(ano) {
  const all = new Set();
  ['ocorrencias','presos','armas','veiculos','entorpecentes','visitaSolidaria','tempoResposta','cursos'].forEach(k => {
    if (Array.isArray(prodRaw[k]))
      prodRaw[k].filter(r => !ano || r.ano === ano).forEach(r => r.mes && all.add((r.mes||'').toLowerCase()));
  });
  return MES_ORD.filter(m => all.has(m.toLowerCase()));
}

function prodGetCiasDisp() {
  const all = new Set();
  ['ocorrencias','presos','armas','veiculos','entorpecentes','visitaSolidaria','tempoResposta'].forEach(k => {
    if (Array.isArray(prodRaw[k])) prodRaw[k].forEach(r => r.cia && all.add(normCiaDisp(r.cia.trim())));
  });
  return [...all].sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b, 'pt-BR');
  });
}

function prodBuildFilter() {
  const el = document.getElementById('prod-filter');
  if (!el) return;
  const anos = prodGetAnosDisp();
  const mesesDisp = prodGetMesesDisp(prodSelAno);
  const cias = prodGetCiasDisp();
  const allSel = prodSelMeses.length === mesesDisp.length;
  let h = `<div class="pf-row">`;
  // Ano
  h += `<div class="pf-field"><span class="pf-label">ANO</span><select class="pf-select" onchange="prodSetAno(+this.value)">`;
  if (!anos.length) h += `<option>Sem dados</option>`;
  anos.forEach(a => h += `<option value="${a}"${a===prodSelAno?' selected':''}>${a}</option>`);
  h += `</select></div>`;
  // Meses
  h += `<div class="pf-field"><span class="pf-label">MÊS</span><div style="display:flex;gap:4px;flex-wrap:wrap">`;
  h += `<button onclick="prodSetAllMeses()" class="pf-btn${allSel?' on':''}">Todos</button>`;
  const _pmComDados = new Set(mesesDisp);
  MES_ORD.forEach(m => {
    const ok = _pmComDados.has(m);
    h += `<button onclick="prodTogMes('${m}')" class="pf-btn${prodSelMeses.includes(m)?' on':''}"${ok ? '' : ' style="opacity:.35" title="Sem dados"'}>${MES_ABREV[m] || m.slice(0,3).toUpperCase()}</button>`;
  });
  h += `</div></div>`;
  // CIA
  h += `<div class="pf-field"><span class="pf-label">CIA</span><select class="pf-select" onchange="prodSetCia(this.value)">`;
  h += `<option value="">Todas</option>`;
  cias.forEach(c => h += `<option value="${c}"${normCiaDisp(c)===normCiaDisp(prodSelCia||'')?' selected':''}>${c}</option>`);
  h += `</select></div>`;
  h += `</div>`;
  el.innerHTML = h;
}

function prodDestroyCharts() {
  prodChs.forEach(c => { try { c.destroy(); } catch(e){} });
  prodChs = [];
  if (prodEntorpCatCh) { try { prodEntorpCatCh.destroy(); } catch(e){} prodEntorpCatCh = null; }
}

function prodRender() {
  prodBuildFilter();
  prodDestroyCharts();
  // sincroniza ano DD com filtro prod
  if (prodSelAno && prodSelAno !== ddAnoFiltro) {
    ddAnoFiltro = prodSelAno;
    loadDDData();
  }
  const tipos = ['ocorrencias','presos','armas','veiculos','entorpecentes'];
  const kpisEl = document.getElementById('prod-kpis');
  const chartsEl = document.getElementById('prod-charts');
  if (!kpisEl || !chartsEl) return;

  const mesesDisp = prodGetMesesDisp(prodSelAno);
  const periodoLbl = prodSelMeses.length === mesesDisp.length ? 'Acumulado ' + prodSelAno : prodSelMeses.join(', ');

  // Dados filtrados (respeita ano + meses + CIA)
  const filt = {};
  tipos.forEach(t => filt[t] = prodFilter(prodRaw[t]));
  const totais = {};
  tipos.forEach(t => totais[t] = prodSum(filt[t], PROD_CAMPO[t]));

  // Unidades de entorpecentes — grama sempre primeiro
  const unidadesEntorp = [...new Set(filt.entorpecentes.map(r => (r.unidade_medida||'Sem unidade').trim()))].filter(Boolean).sort((a, b) => {
    const aG = /^(g|kg|grama)/i.test(a), bG = /^(g|kg|grama)/i.test(b);
    if (aG === bG) return a.localeCompare(b);
    return aG ? -1 : 1;
  });
  const normId = s => s.replace(/[^a-z0-9]/gi,'_').toLowerCase();
  // Garante que a unidade ativa é válida (reseta para grama se necessário)
  if (!prodEntorpUnit || !unidadesEntorp.includes(prodEntorpUnit)) prodEntorpUnit = unidadesEntorp[0] || null;

  // KPI Violência Doméstica
  const VD_NAT = 'violência doméstica';
  const VD_COR = '#e05a8a';
  const normStr = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const VD_NORM = normStr(VD_NAT);
  const totVD = prodSum(filt.ocorrencias.filter(r => normStr(r.natureza).includes(VD_NORM)), 'contagem');

  // KPIs: 4 indicadores principais + 1 KPI por unidade de entorpecente + taxa efetividade
  kpisEl.innerHTML =
    ['ocorrencias','presos','armas','veiculos'].map(t =>
      `<div class="kpi" onclick="openProdDetail('${t}')" title="Clique para detalhes" style="cursor:pointer">
        <div class="kpi-top" style="background:${PROD_CORES[t]}"></div>
        <div class="kpi-lbl">${PROD_LABELS[t]}</div>
        <div class="kpi-val" style="color:${PROD_CORES[t]}">${totais[t].toLocaleString('pt-BR')}</div>
        <div class="kpi-sub">${periodoLbl}</div>
        <div class="kpi-hint">▸ clique p/ detalhes</div>
      </div>`
    ).join('') +
    (() => {
      if (!unidadesEntorp.length) return `<div class="kpi" onclick="openProdDetail('entorpecentes')" title="Clique para detalhes" style="cursor:pointer">
        <div class="kpi-top" style="background:${PROD_CORES.entorpecentes}"></div>
        <div class="kpi-lbl">${PROD_LABELS.entorpecentes}</div>
        <div class="kpi-val" style="color:${PROD_CORES.entorpecentes}">—</div>
        <div class="kpi-sub">${periodoLbl}</div>
        <div class="kpi-hint">▸ clique p/ detalhes</div>
      </div>`;
      const totAtivo = prodSum(filt.entorpecentes.filter(r => (r.unidade_medida||'Sem unidade').trim() === prodEntorpUnit), 'quantidade');
      const pills = unidadesEntorp.map(u =>
        `<button class="pf-btn${u===prodEntorpUnit?' on':''}" data-eunit="${u.replace(/"/g,'&quot;')}" onclick="event.stopPropagation();switchEntorpUnit('${u.replace(/'/g,"\\'")}','kpi')" style="font-size:19px;padding:2px 7px;line-height:1.4">${u}</button>`
      ).join('');
      return `<div class="kpi" onclick="openProdDetail('entorpecentes',prodEntorpUnit)" title="Clique para detalhes" style="cursor:pointer">
        <div class="kpi-top" style="background:${PROD_CORES.entorpecentes}"></div>
        <div class="kpi-lbl">${PROD_LABELS.entorpecentes}</div>
        <div style="display:flex;gap:3px;flex-wrap:wrap;margin:5px 0">${pills}</div>
        <div class="kpi-val" id="entorp-kpi-val" style="color:${PROD_CORES.entorpecentes}">${totAtivo.toLocaleString('pt-BR')}</div>
        <div class="kpi-sub">${periodoLbl}</div>
        <div class="kpi-hint">▸ clique p/ detalhes</div>
      </div>`;
    })() +
    `<div class="kpi" onclick="openProdDetail('ocorrencias',null,'${VD_NAT}')" title="Clique para detalhes" style="cursor:pointer">
      <div class="kpi-top" style="background:${VD_COR}"></div>
      <div class="kpi-lbl">Violência Doméstica</div>
      <div class="kpi-val" style="color:${VD_COR}">${totVD.toLocaleString('pt-BR')}</div>
      <div class="kpi-sub">${periodoLbl}</div>
      <div class="kpi-hint">▸ clique p/ detalhes</div>
    </div>` +
    renderDDKpi() +
    (() => {
      const filtTR = prodFilter(prodRaw.tempoResposta);
      if (!filtTR.length) return '';
      const trWAvg = rows => {
        const tot = rows.reduce((s, r) => s + (r.qtde_taloes || 0), 0);
        return tot ? rows.reduce((s, r) => s + (r.pct_hd_hcl_20min || 0) * (r.qtde_taloes || 0), 0) / tot : 0;
      };
      const trGlobal = trWAvg(filtTR);
      const trTotalTaloes = filtTR.reduce((s, r) => s + (r.qtde_taloes || 0), 0);
      const TR_COR = '#4bc8e0';
      return `<div class="kpi" onclick="openProdDetail('tempo-resposta')" title="Clique para detalhes" style="cursor:pointer">
        <div class="kpi-top" style="background:${TR_COR}"></div>
        <div class="kpi-lbl" style="letter-spacing:.5px;line-height:1.4">Tempo Resposta Atend. Ocorrência</div>
        <div class="kpi-val" style="color:${TR_COR}">${parseFloat(trGlobal.toFixed(1))}%</div>
        <div class="kpi-sub">% atendidos no prazo</div>
        <div class="kpi-hint">▸ clique p/ detalhes</div>
      </div>`;
    })() +
    (() => {
      const cursosData = (prodRaw.cursos||[]).filter(r => {
        if (prodSelAno && r.ano !== prodSelAno) return false;
        if (prodSelMeses.length && !prodSelMeses.some(m => m.toLowerCase() === (r.mes||'').toLowerCase())) return false;
        return true;
      });
      if (!cursosData.length) return '';
      const cursosUnicos = new Set(cursosData.map(r => (r.data||'') + '||' + (r.nome_curso||'')));
      const pmsUnicos = new Set(cursosData.filter(r => r.re_pm).map(r => r.re_pm));
      const CUR_COR = '#9de05a';
      return `<div class="kpi" onclick="openProdDetail('cursos')" title="Clique para detalhes" style="cursor:pointer">
        <div class="kpi-top" style="background:${CUR_COR}"></div>
        <div class="kpi-lbl">Cursos Institucionais</div>
        <div class="kpi-val" style="color:${CUR_COR}">${cursosUnicos.size}</div>
        <div class="kpi-sub">${pmsUnicos.size} PM${pmsUnicos.size !== 1 ? 's' : ''} capacitados</div>
        <div class="kpi-hint">▸ clique p/ detalhes</div>
      </div>`;
    })() +
    (() => {
      const TF_COR = '#7b8cde';
      const comTaf = p1Data.filter(pm => pm.taf);
      const comTat = p1Data.filter(pm => pm.tat);
      if (!comTaf.length && !comTat.length) return '';
      const hoje = new Date();
      const isVenc = pm => {
        if (!pm.data_eap) return false;
        const d = new Date(pm.data_eap), lim = new Date(d);
        lim.setFullYear(lim.getFullYear() + 1);
        return hoje > lim;
      };
      const lim365 = new Date(hoje); lim365.setDate(lim365.getDate() - 365);
      const APROV_MB = new Set(['muito bom','excepcional']);
      const REPROV   = new Set(['inapto','ruim']);
      const aptosMB365 = p1Data.filter(pm => {
        if (!pm.data_eap) return false;
        return new Date(pm.data_eap) >= lim365 && APROV_MB.has((pm.taf||'').toLowerCase().trim());
      }).length;
      const inaptosTafN = comTaf.filter(pm => REPROV.has((pm.taf||'').toLowerCase().trim())).length;
      const vencidos = p1Data.filter(isVenc).length;
      const metricRow = (label, val, cor) =>
        `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px">
          <span style="font-family:'DM Mono',monospace;font-size:19px;color:#f4f6fc">${label}</span>
          <span style="font-family:'DM Mono',monospace;font-size:19px;font-weight:700;color:${cor}">${val}</span>
        </div>`;
      return `<div class="kpi" onclick="openProdDetail('taftat')" title="Clique para detalhes" style="cursor:pointer">
        <div class="kpi-top" style="background:${TF_COR}"></div>
        <div class="kpi-lbl">TAF / TAT</div>
        <div style="margin-top:10px">
          ${metricRow('Aptos MB+', aptosMB365, '#4bc87a')}
          ${metricRow('Inaptos TAF', inaptosTafN, inaptosTafN > 0 ? '#e05555' : 'var(--tx3)')}
          ${metricRow('Vencidos', vencidos, vencidos > 0 ? '#e05555' : 'var(--tx3)')}
        </div>
        <div class="kpi-hint" style="margin-top:10px">▸ clique p/ detalhes</div>
      </div>`;
    })();

  // Cabeçalho de seção
  const sec = label => `<div style="grid-column:1/-1;display:flex;align-items:center;gap:12px;margin-top:10px;padding-bottom:8px;border-bottom:1px solid var(--bd2)">
    <span style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--tx2)">${label}</span>
  </div>`;

  // ─── Rankings por CIA ──────────────────────────────────────────────────
  const mkRankCard = (cor, label, rows) => {
    if (!rows.length) return '';
    const maxV = rows[0][1];
    const items = rows.map(([cia, v], i) => {
      const barCor = ciaCorByName(cia);
      const pct = maxV > 0 ? Math.round(v / maxV * 100) : 0;
      return `<div style="margin-bottom:${i < rows.length - 1 ? '14' : '0'}px">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px">
          <div style="font-size:19px;color:${barCor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:68%">${i + 1}. ${cia}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:${barCor};font-weight:700">${v.toLocaleString('pt-BR')}</div>
        </div>
        <div style="background:rgba(255,255,255,.06);border-radius:3px;height:6px"><div style="height:100%;width:${pct}%;background:${barCor};border-radius:3px"></div></div>
      </div>`;
    }).join('');
    return `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${cor};border-radius:10px;padding:20px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${cor};margin-bottom:16px">${label}</div>
      ${items}
    </div>`;
  };
  const aggByCia = (tipo, campo, extraFilt) => {
    const agg = {};
    (extraFilt ? filt[tipo].filter(extraFilt) : filt[tipo]).forEach(r => {
      const cia = r.cia ? normCiaDisplay(r.cia) : 'Não informado';
      agg[cia] = (agg[cia] || 0) + (Number(r[campo]) || 0);
    });
    return Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 8);
  };
  const ciaRankCards =
    mkRankCard(PROD_CORES.presos,   'Pessoas Presas por CIA',         aggByCia('presos',   PROD_CAMPO.presos))  +
    mkRankCard(PROD_CORES.armas,    'Armas Apreendidas por CIA',      aggByCia('armas',    PROD_CAMPO.armas))   +
    mkRankCard(PROD_CORES.veiculos, 'Veículos Recuperados por CIA',   aggByCia('veiculos', PROD_CAMPO.veiculos)) +
    (prodEntorpUnit
      ? mkRankCard(PROD_CORES.entorpecentes, `Entorpecentes (${prodEntorpUnit}) por CIA`,
          aggByCia('entorpecentes', 'quantidade', r => (r.unidade_medida||'').trim() === prodEntorpUnit))
      : '');

  // ─── Insights do Período ────────────────────────────────────────────────
  const insCards = [];

  // CIA em Destaque (composto)
  const ciaComp = {};
  ['presos','armas','veiculos'].forEach(t => {
    filt[t].forEach(r => {
      const cia = r.cia ? normCiaDisplay(r.cia) : 'Não informado';
      ciaComp[cia] = (ciaComp[cia] || 0) + (Number(r[PROD_CAMPO[t]]) || 0);
    });
  });
  const ciaCompRank = Object.entries(ciaComp).sort((a, b) => b[1] - a[1]);
  if (ciaCompRank.length > 0) {
    const [ciaTopo, valTopo] = ciaCompRank[0];
    const runners = ciaCompRank.slice(1, 4).map(([c, v]) =>
      `<div style="display:flex;justify-content:space-between;margin-top:10px">
        <span style="font-size:19px;color:#ffffff">${c}</span>
        <span style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;font-weight:700">${v.toLocaleString('pt-BR')}</span>
      </div>`).join('');
    insCards.push(`<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid #f0c040;border-radius:10px;padding:20px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#f0c040;margin-bottom:10px">CIA em Destaque</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:32px;font-weight:800;color:var(--tx);line-height:1.1;margin-bottom:4px">${ciaTopo}</div>
      <div style="font-family:'DM Mono',monospace;font-size:19px;color:#f0c040;margin-bottom:12px">${valTopo.toLocaleString('pt-BR')} ações (presos + armas + veíc.)</div>
      ${runners}
    </div>`);
  }

  // Índice de Capacitação (cursos × efetivo)
  const cursosAno = (prodRaw.cursos||[]).filter(r => {
    if (prodSelAno && r.ano !== prodSelAno) return false;
    if (prodSelMeses.length && !prodSelMeses.some(m => m.toLowerCase() === (r.mes||'').toLowerCase())) return false;
    return true;
  });
  const pmsCapacitados = new Set(cursosAno.filter(r => r.re_pm).map(r => r.re_pm));
  if (pmsCapacitados.size > 0) {
    const COR_CAP = '#9de05a';
    const totalEfetivo = p1Data.length;
    const pct = totalEfetivo > 0 ? Math.round(pmsCapacitados.size / totalEfetivo * 100) : null;
    const barW = pct !== null ? pct : 0;

    // Breakdown por tipo de curso (cursos únicos no ano)
    const cursosUnicosAno = new Map();
    cursosAno.forEach(r => {
      const key = (r.data||'') + '||' + (r.nome_curso||'');
      if (!cursosUnicosAno.has(key)) cursosUnicosAno.set(key, tipoCurso(r.nome_curso));
    });
    const tipoCount = {};
    [...cursosUnicosAno.values()].forEach(t => { tipoCount[t] = (tipoCount[t]||0) + 1; });
    const tipoRows = TIPO_ORD.filter(t => tipoCount[t]).map(t =>
      `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <span style="font-size:19px;color:var(--tx2)">${t}</span>
        <span style="font-family:'DM Mono',monospace;font-size:19px;font-weight:700;color:${TIPO_COR[t]||'var(--tx)'}">${tipoCount[t]}</span>
      </div>`
    ).join('');

    insCards.push(`<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${COR_CAP};border-radius:10px;padding:20px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COR_CAP};margin-bottom:10px">Índice de Capacitação</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:38px;font-weight:800;color:var(--tx);line-height:1;margin-bottom:2px">${pmsCapacitados.size}</div>
      <div style="font-family:'DM Mono',monospace;font-size:19px;color:${COR_CAP};margin-bottom:${pct !== null ? '10' : '14'}px">PMs capacitados em ${prodSelAno||'—'}</div>
      ${pct !== null ? `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3)">do efetivo (${totalEfetivo} PMs)</span>
          <span style="font-family:'DM Mono',monospace;font-size:19px;font-weight:700;color:${COR_CAP}">${pct}%</span>
        </div>
        <div style="background:rgba(255,255,255,.06);border-radius:3px;height:6px">
          <div style="height:100%;width:${barW}%;background:${COR_CAP};border-radius:3px;transition:width .4s"></div>
        </div>
      </div>` : ''}
      <div style="border-top:1px solid rgba(255,255,255,.06);padding-top:10px">${tipoRows}</div>
    </div>`);
  }

  // Meses mais produtivos
  const mesProd = {};
  ['presos','armas','veiculos'].forEach(t => {
    filt[t].forEach(r => {
      const m = MES_ORD.find(x => x.toLowerCase() === (r.mes||'').toLowerCase()) || r.mes || '';
      if (m) mesProd[m] = (mesProd[m] || 0) + (Number(r[PROD_CAMPO[t]]) || 0);
    });
  });
  const mesRank = Object.entries(mesProd).sort((a, b) => b[1] - a[1]);
  if (mesRank.length > 0) {
    const maxMes = mesRank[0][1];
    const mesRows = mesRank.slice(0, 5).map(([m, v], i) => {
      const pct = maxMes > 0 ? Math.round(v / maxMes * 100) : 0;
      return `<div style="margin-bottom:${i < 4 ? '14' : '0'}px">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px">
          <div style="font-size:19px;color:#ffffff;font-weight:${i === 0 ? '700' : '400'}">${i + 1}. ${m}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;font-weight:700">${v.toLocaleString('pt-BR')}</div>
        </div>
        <div style="background:rgba(255,255,255,.06);border-radius:3px;height:6px"><div style="height:100%;width:${pct}%;background:#f0c040;border-radius:3px"></div></div>
      </div>`;
    }).join('');
    insCards.push(`<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid #f0c040;border-radius:10px;padding:20px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#f0c040;margin-bottom:14px">Meses Mais Produtivos</div>
      ${mesRows}
    </div>`);
  }

  // Distribuição percentual entre tipos
  const totGeral = totais.presos + totais.armas + totais.veiculos;
  if (totGeral > 0) {
    const distTipos = [
      { label: 'Pessoas Presas',      v: totais.presos,   cor: PROD_CORES.presos   },
      { label: 'Armas Apreendidas',   v: totais.armas,    cor: PROD_CORES.armas    },
      { label: 'Veículos Recuperados',v: totais.veiculos, cor: PROD_CORES.veiculos  },
    ];
    const distRows = distTipos.map(t => {
      const pct = Math.round(t.v / totGeral * 100);
      return `<div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px">
          <div style="font-size:19px;color:#ffffff;font-weight:600">${t.label}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;font-weight:700">${pct}%</div>
        </div>
        <div style="background:rgba(255,255,255,.06);border-radius:3px;height:6px"><div style="height:100%;width:${pct}%;background:${t.cor};border-radius:3px"></div></div>
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;margin-top:4px">${t.v.toLocaleString('pt-BR')} no período</div>
      </div>`;
    }).join('');
    insCards.push(`<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid var(--bd2);border-radius:10px;padding:20px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--tx2);margin-bottom:14px">Distribuição por Tipo</div>
      ${distRows}
    </div>`);
  }

  // ─── Tendência: último mês selecionado vs anterior disponível ───────
  let tendHtml = '';
  const mesesComDados = prodGetMesesDisp(prodSelAno);
  // mesB = último dos meses atualmente selecionados (por ordem de MES_ORD)
  const mesSel = MES_ORD.filter(m => prodSelMeses.some(s => s.toLowerCase() === m.toLowerCase()));
  const mesB = mesSel.length ? mesSel[mesSel.length - 1] : null;
  // mesA = mês imediatamente anterior ao mesB no histórico de dados
  const idxB = mesB ? mesesComDados.findIndex(m => m.toLowerCase() === mesB.toLowerCase()) : -1;
  const mesA = idxB > 0 ? mesesComDados[idxB - 1] : null;
  if (mesB && mesA) {
    const sumMes = (tipo, campo, mes) =>
      prodSum(
        prodRaw[tipo].filter(r =>
          r.ano === prodSelAno &&
          (r.mes||'').toLowerCase() === mes.toLowerCase() &&
          (!prodSelCia || normCiaDisp(r.cia) === normCiaDisp(prodSelCia))
        ),
        campo
      );
    const tendMetrics = [
      { label: 'Ocorrências',        tipo: 'ocorrencias', campo: 'contagem',   cor: PROD_CORES.ocorrencias },
      { label: 'Pessoas Presas',     tipo: 'presos',      campo: 'quantidade', cor: PROD_CORES.presos      },
      { label: 'Armas Apreendidas',  tipo: 'armas',       campo: 'quantidade', cor: PROD_CORES.armas       },
      { label: 'Veículos Recuperados', tipo: 'veiculos',  campo: 'quantidade', cor: PROD_CORES.veiculos    },
    ];
    const tendCards = tendMetrics.map(({ label, tipo, campo, cor }) => {
      const vA = sumMes(tipo, campo, mesA);
      const vB = sumMes(tipo, campo, mesB);
      if (vA === 0 && vB === 0) return '';
      const diff = vB - vA;
      const pct  = vA > 0 ? Math.round(Math.abs(diff) / vA * 100) : null;
      const seta = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
      const corSeta = diff > 0 ? '#4bc87a' : diff < 0 ? '#e05555' : 'var(--tx3)';
      const diffStr = (diff > 0 ? '+' : '') + diff.toLocaleString('pt-BR');
      const pctStr  = pct !== null ? ` (${diff >= 0 ? '+' : ''}${pct}%)` : '';
      return `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${cor};border-radius:10px;padding:18px 20px">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${cor};margin-bottom:10px">${label}</div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px">
          <span style="font-family:'DM Mono',monospace;font-size:34px;font-weight:700;color:${corSeta};line-height:1">${seta}</span>
          <span style="font-family:'DM Mono',monospace;font-size:19px;font-weight:700;color:${corSeta}">${diffStr}${pctStr}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;background:rgba(255,255,255,.03);border-radius:6px;padding:8px 10px;text-align:center">
            <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">${MES_ABREV[mesA] || mesA.slice(0,3)}</div>
            <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx2);font-weight:600">${vA.toLocaleString('pt-BR')}</div>
          </div>
          <div style="color:var(--tx3);font-size:19px">›</div>
          <div style="flex:1;background:rgba(255,255,255,.05);border-radius:6px;padding:8px 10px;text-align:center;border:1px solid ${cor}44">
            <div style="font-family:'DM Mono',monospace;font-size:19px;color:${cor};letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">${MES_ABREV[mesB] || mesB.slice(0,3)}</div>
            <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx);font-weight:700">${vB.toLocaleString('pt-BR')}</div>
          </div>
        </div>
      </div>`;
    }).filter(Boolean);
    if (tendCards.length) {
      tendHtml = sec('Tendência Recente — ' + mesA.slice(0,3) + ' × ' + mesB.slice(0,3)) +
        `<div style="grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px">${tendCards.join('')}</div>`;
    }
  }

  // Monta HTML de todas as seções
  chartsEl.innerHTML =
    tendHtml +
    (ciaRankCards
      ? sec('Ranking por CIA') +
        `<div style="grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px">${ciaRankCards}</div>`
      : '') +
    (insCards.length
      ? sec('Insights do Período') +
        `<div style="grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px">${insCards.join('')}</div>`
      : '');

}
function prodSetAno(ano) {
  prodSelAno = ano;
  prodSelMeses = [...prodGetMesesDisp(ano)];
  prodRender();
}
function prodSetAllMeses() {
  prodSelMeses = [...prodGetMesesDisp(prodSelAno)];
  prodRender();
}
function prodTogMes(mes) {
  const mesesDisp = prodGetMesesDisp(prodSelAno);
  if (prodSelMeses.length === mesesDisp.length) { prodSelMeses = [mes]; }
  else {
    const idx = prodSelMeses.indexOf(mes);
    if (idx >= 0) { prodSelMeses.splice(idx, 1); if (!prodSelMeses.length) prodSelMeses = [...mesesDisp]; }
    else { prodSelMeses.push(mes); prodSelMeses.sort((a, b) => MES_ORD.indexOf(a) - MES_ORD.indexOf(b)); }
  }
  prodRender();
}
function prodSetCia(cia) { prodSelCia = (cia || '').trim() || null; prodRender(); }

async function loadProdData(force) {
  if (prodRaw.loaded && !force) { prodRender(); return; }
  const kpisEl = document.getElementById('prod-kpis');
  const chartsEl = document.getElementById('prod-charts');
  const filterEl = document.getElementById('prod-filter');
  if (filterEl) filterEl.innerHTML = '';
  if (kpisEl) kpisEl.innerHTML = '<div style="grid-column:1/-1;color:var(--tx3);font-size:19px;padding:20px 0">Carregando dados de produtividade...</div>';
  if (chartsEl) chartsEl.innerHTML = '';
  try {
    const [ocorr, presos, armas, veiculos, entorp, visitaSol, tempoResp, cursos] = await Promise.all([
      authFetch(`${API}/prod/ocorrencias`).then(r => r.json()),
      authFetch(`${API}/prod/presos`).then(r => r.json()),
      authFetch(`${API}/prod/armas`).then(r => r.json()),
      authFetch(`${API}/prod/veiculos`).then(r => r.json()),
      authFetch(`${API}/prod/entorpecentes`).then(r => r.json()),
      authFetch(`${API}/prod/visita-solidaria`).then(r => r.json()).catch(() => []),
      authFetch(`${API}/prod/tempo-resposta`).then(r => r.json()).catch(() => []),
      authFetch(`${API}/prod/cursos`).then(r => r.json()).catch(() => []),
    ]);
    prodRaw = {
      ocorrencias:    Array.isArray(ocorr)     ? ocorr     : [],
      presos:         Array.isArray(presos)    ? presos    : [],
      armas:          Array.isArray(armas)     ? armas     : [],
      veiculos:       Array.isArray(veiculos)  ? veiculos  : [],
      entorpecentes:  Array.isArray(entorp)    ? entorp    : [],
      visitaSolidaria: Array.isArray(visitaSol) ? visitaSol : [],
      tempoResposta:  Array.isArray(tempoResp) ? tempoResp : [],
      cursos:         Array.isArray(cursos)    ? cursos    : [],
      loaded: true
    };
    const anosDisp = prodGetAnosDisp();
    prodSelAno   = anosDisp[0] || new Date().getFullYear();
    prodSelMeses = [...prodGetMesesDisp(prodSelAno)];
    prodSelCia   = null;
    prodRender();
  } catch (err) {
    if (kpisEl) kpisEl.innerHTML = `<div style="grid-column:1/-1;color:#f07878;font-size:19px;padding:20px 0">Erro ao carregar dados: ${err.message}</div>`;
  }
}

// Upload genérico produtividade
function openProdUpl(tipo) {
  prodUplTipo = tipo;
  prodUplParsed = [];
  document.getElementById('prod-upl-file').value = '';
  document.getElementById('prod-upl-preview').innerHTML = '';
  document.getElementById('prod-upl-msg').innerHTML = '';
  const btn = document.getElementById('prod-upl-btn');
  btn.disabled = true; btn.style.opacity = '.5';
  document.getElementById('prod-upl-title').textContent = 'Importar ' + (PROD_LABELS[tipo] || tipo);
  const PROD_UPL_HINTS = {
    'ocorrencias':      'Colunas: Ano de Data · Mês de Data · CIA · Grupo de Natureza · Natureza da Ocorrência · Contagem de Ocorrências',
    'presos':           'Colunas: Ano · Mês · CIA · Situação da Pessoa · Quantidade de Pessoas',
    'armas':            'Colunas: Ano · Mês · CIA · Tipo da Arma · Calibre · Quantidade de Armas',
    'veiculos':         'Colunas: Ano · Mês · CIA · Situacao do Veículo · Contagem Quantidade de Veículos',
    'entorpecentes':    'Colunas: Ano · Mês · CIA · Entorpecente · Unidade de Medida · Quantidade de Entorpecentes',
    'visita-solidaria': 'Colunas: Data da ocorrência · Cia PM · Nome da Vitima · Parentesco do Agressor · ...',
    'tempo-resposta':   'Colunas: Ano · Mês · CIA · Natureza Final · Qtde Talões · % Talões HD-HCL até 20min · % BOe',
    'cursos':           'Colunas: Nº do Ofício · Data · Curso · PM (formato: Posto PM RE Nome; Posto PM RE Nome; ...)',
  };
  const hintEl = document.getElementById('prod-upl-hint');
  if (hintEl) hintEl.textContent = PROD_UPL_HINTS[tipo] || '';
  document.getElementById('prod-upl-mo').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closeProdUpl() {
  document.getElementById('prod-upl-mo').style.display = 'none';
  document.body.style.overflow = '';
}
function prodUplClickOut(e) { if (e.target === document.getElementById('prod-upl-mo')) closeProdUpl(); }

function prodUplFileChange() {
  const file = document.getElementById('prod-upl-file').files[0];
  const prev = document.getElementById('prod-upl-preview');
  const btn  = document.getElementById('prod-upl-btn');
  prodUplParsed = [];
  btn.disabled = true; btn.style.opacity = '.5';
  prev.innerHTML = '';
  if (!file) return;
  Papa.parse(file, {
    header: true, skipEmptyLines: true,
    complete: r => {
      if (!r.data.length) { prev.innerHTML = '<span style="color:#f07878">Arquivo vazio.</span>'; return; }
      const keys = Object.keys(r.data[0]).map(k => k.toLowerCase());
      if (prodUplTipo === 'cursos') {
        const hasCurso = keys.some(k => k.includes('curso'));
        if (!hasCurso) {
          prev.innerHTML = `<span style="color:#f07878">Coluna "Curso" não encontrada no CSV.</span>`;
          return;
        }
      } else if (prodUplTipo === 'visita-solidaria') {
        const hasData = keys.some(k => k.includes('data') && k.includes('ocorr'));
        if (!hasData) {
          prev.innerHTML = `<span style="color:#f07878">Coluna "Data da ocorrência" não encontrada no CSV.</span>`;
          return;
        }
      } else {
        const hasAno = keys.some(k => k.includes('ano'));
        const hasMes = keys.some(k => k.includes('mês') || k.includes('mes'));
        if (!hasAno || !hasMes) {
          prev.innerHTML = `<span style="color:#f07878">Colunas "Ano de Data" e "Mês de Data" não encontradas no CSV.</span>`;
          return;
        }
      }
      prodUplParsed = r.data;
      prev.innerHTML = `<span style="color:#4bc87a">✓ <b>${r.data.length}</b> registros lidos.</span>`;
      btn.disabled = false; btn.style.opacity = '1';
    },
    error: err => { prev.innerHTML = `<span style="color:#f07878">Erro: ${err.message}</span>`; }
  });
}

async function prodUplConfirm() {
  const btn = document.getElementById('prod-upl-btn');
  const msg = document.getElementById('prod-upl-msg');
  if (!prodUplParsed.length || !prodUplTipo) return;
  btn.disabled = true; btn.style.opacity = '.5';
  msg.innerHTML = '<span style="color:var(--tx3)">Enviando...</span>';
  try {
    const uplEndpoint = prodUplTipo === 'cursos' ? `${API}/upload/cursos` : `${API}/upload/prod/${prodUplTipo}`;
    const res = await authFetch(uplEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: prodUplParsed })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
    msg.innerHTML = `<span style="color:#4bc87a">✓ ${data.total} registros importados.</span>`;
    registraUpload();
    await loadProdData(true);
    setTimeout(closeProdUpl, 1800);
  } catch (err) {
    msg.innerHTML = `<span style="color:#f07878">Erro: ${err.message}</span>`;
    btn.disabled = false; btn.style.opacity = '1';
  }
}

// ---------------------------------------------------------------------------
// Produtividade — Entorpecentes: card único com troca de unidade
// ---------------------------------------------------------------------------

function renderEntorpCatChart(u, rows, cor, barOpts) {
  if (prodEntorpCatCh) { try { prodEntorpCatCh.destroy(); } catch(e){} prodEntorpCatCh = null; }
  const canvasId = 'cat-entorp';
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  const filtRows = u ? rows.filter(r => (r.unidade_medida||'Sem unidade').trim() === u) : rows;
  const agg = {};
  filtRows.forEach(r => { const key = r.entorpecente || 'Não informado'; agg[key] = (agg[key]||0) + (Number(r.quantidade)||0); });
  const entries = Object.entries(agg).sort((a,b) => b[1]-a[1]).slice(0,10);
  const emptyEl = document.getElementById(canvasId + '-empty');
  if (!entries.length) {
    if (emptyEl) emptyEl.style.display = '';
    ctx.canvas.style.display = 'none';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  ctx.canvas.style.display = '';
  prodEntorpCatCh = new Chart(ctx, {
    type: 'bar',
    data: { labels: entries.map(([k])=>k), datasets: [{ data: entries.map(([,v])=>v), backgroundColor: cor+'99', borderColor: cor, borderWidth: 1, borderRadius: 3 }] },
    options: barOpts(cor)
  });
}

function switchEntorpUnit(u, origem) {
  prodEntorpUnit = u;
  // Atualiza pills do KPI
  document.querySelectorAll('[data-eunit]').forEach(b => b.classList.toggle('on', b.dataset.eunit === u));
  // Atualiza tabs do gráfico
  document.querySelectorAll('[data-eunit-cat]').forEach(b => b.classList.toggle('on', b.dataset.eunitCat === u));
  // Atualiza valor do KPI
  const filt = prodFilter(prodRaw.entorpecentes);
  const tot = prodSum(filt.filter(r => (r.unidade_medida||'Sem unidade').trim() === u), 'quantidade');
  const valEl = document.getElementById('entorp-kpi-val');
  if (valEl) valEl.textContent = tot.toLocaleString('pt-BR');
  // Atualiza gráfico de categorias
  const barOpts = cor => ({
    indexAxis: 'y', responsive: true,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${i.raw.toLocaleString('pt-BR')}` } } },
    scales: {
      x: { grid: GR, ticks: { color: 'rgba(255,255,255,.45)', font: { size: 19 } } },
      y: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,.75)', font: { size: 19 } } }
    }
  });
  renderEntorpCatChart(u, filt, PROD_CORES.entorpecentes, barOpts);
}

// ---------------------------------------------------------------------------
// Produtividade — Detalhe (modal drill-down por card)
// ---------------------------------------------------------------------------

function pdDestroy() {
  pdChs.forEach(c => { try { c.destroy(); } catch(e){} });
  pdChs = [];
}

function openProdDetail(tipo, unidade, natFilter) {
  pdDestroy();
  pdTipo = tipo;
  pdUnidade = unidade || null;
  pdNatFilter = natFilter || null;
  pdSelCia = prodSelCia || '';
  const mesesDisp = prodGetMesesDisp(prodSelAno);
  pdMeses = prodSelMeses.length ? [...prodSelMeses] : [...mesesDisp];
  const cor = pdNatFilter ? '#e05a8a' : PROD_CORES[tipo];
  const label = pdNatFilter ? pdNatFilter : (unidade ? `${PROD_LABELS[tipo]} — ${unidade}` : PROD_LABELS[tipo]);
  document.getElementById('pd-accent').style.background = cor;
  document.getElementById('pd-title').textContent = label.toUpperCase();
  buildPdFilter();
  renderProdDetail();
  document.getElementById('prod-detail-mo').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeProdDetail() {
  pdDestroy();
  document.getElementById('prod-detail-mo').classList.remove('on');
  document.body.style.overflow = '';
}

function prodDetailClickOut(e) {
  if (e.target === document.getElementById('prod-detail-mo')) closeProdDetail();
}

function buildPdFilter() {
  if (pdTipo === 'taftat') { document.getElementById('pd-filter-bar').innerHTML = ''; return; }
  const mesesDisp = prodGetMesesDisp(prodSelAno);
  const _pdRawKey = pdTipo === 'tempo-resposta' ? 'tempoResposta' : pdTipo;
  let baseRows = prodRaw[_pdRawKey] || [];
  if (prodSelAno) baseRows = baseRows.filter(r => r.ano === prodSelAno);
  if (pdUnidade) baseRows = baseRows.filter(r => (r.unidade_medida||'Sem unidade').trim() === pdUnidade);
  if (pdNatFilter) { const _nfN = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); const _nf = _nfN(pdNatFilter); baseRows = baseRows.filter(r => _nfN(r.natureza||'').includes(_nf)); }
  const cias = [...new Set(baseRows.map(r => (r.cia||'').trim()).filter(Boolean))].sort();

  let h = '';

  // Pills de unidade — só para entorpecentes
  if (pdTipo === 'entorpecentes') {
    const todasUn = [...new Set((prodRaw.entorpecentes||[])
      .filter(r => !prodSelAno || r.ano === prodSelAno)
      .map(r => (r.unidade_medida||'Sem unidade').trim())
    )].filter(Boolean).sort((a,b) => {
      const aG = /^(g|kg|grama)/i.test(a), bG = /^(g|kg|grama)/i.test(b);
      if (aG === bG) return a.localeCompare(b);
      return aG ? -1 : 1;
    });
    if (todasUn.length > 1) {
      h += '<span class="pf-label">Unidade</span>';
      todasUn.forEach(u => h += `<button class="pf-btn${u===pdUnidade?' on':''}" onclick="pdSwitchUnit('${u.replace(/'/g,"\\'")}')"> ${u}</button>`);
      h += '<span class="pf-sep"></span>';
    }
  }

  h += '<span class="pf-label">Meses</span>';
  h += `<button class="pf-btn ${pdMeses.length === mesesDisp.length ? 'on' : ''}" onclick="pdSetAllMes()">Todos</button>`;
  const _pdComDados = new Set(mesesDisp);
  MES_ORD.forEach(m => {
    const ok = _pdComDados.has(m);
    h += `<button class="pf-btn ${pdMeses.includes(m) ? 'on' : ''}" onclick="pdTogMes('${m}')"${ok ? '' : ' style="opacity:.35" title="Sem dados"'}>${m.slice(0,3)}</button>`;
  });
  if (cias.length) {
    h += '<span class="pf-sep"></span>';
    h += '<div class="pf-field"><span class="pf-label">CIA</span><select class="pf-select" onchange="pdSetCia(this.value)"><option value="">Todas</option>';
    cias.forEach(c => h += `<option value="${c}"${normCiaDisp(c) === normCiaDisp(pdSelCia) ? ' selected' : ''}>${c}</option>`);
    h += '</select></div>';
  }
  document.getElementById('pd-filter-bar').innerHTML = h;
}

function pdSwitchUnit(u) {
  pdUnidade = u;
  const label = `${PROD_LABELS.entorpecentes} — ${u}`;
  const titleEl = document.getElementById('pd-title');
  if (titleEl) titleEl.textContent = label.toUpperCase();
  buildPdFilter();
  renderProdDetail();
}

function pdSetAllMes() {
  pdMeses = [...prodGetMesesDisp(prodSelAno)];
  buildPdFilter(); renderProdDetail();
}

function pdTogMes(m) {
  const all = prodGetMesesDisp(prodSelAno);
  if (pdMeses.length === all.length) { pdMeses = [m]; }
  else {
    const idx = pdMeses.indexOf(m);
    if (idx >= 0) { pdMeses.splice(idx, 1); if (!pdMeses.length) pdMeses = [...all]; }
    else { pdMeses.push(m); pdMeses.sort((a,b) => all.indexOf(a) - all.indexOf(b)); }
  }
  buildPdFilter(); renderProdDetail();
}

function pdSetCia(val) { pdSelCia = val; buildPdFilter(); renderProdDetail(); }

function renderTRModalDetail() {
  const TR_COR     = '#4bc8e0';
  const TR_COR_BOM = '#4bc87a';
  const TR_COR_MAU = '#e8b840';
  const mesesDisp  = prodGetMesesDisp(prodSelAno);
  const periodoLbl = pdMeses.length === mesesDisp.length ? 'Acumulado ' + (prodSelAno || '') : pdMeses.join(', ');

  const rows = (prodRaw.tempoResposta || []).filter(r => {
    if (prodSelAno && r.ano !== prodSelAno) return false;
    if (pdMeses.length && !pdMeses.some(m => m.toLowerCase() === (r.mes||'').toLowerCase())) return false;
    if (pdSelCia && normCiaDisp(r.cia) !== normCiaDisp(pdSelCia)) return false;
    return true;
  });

  document.getElementById('pd-sub').textContent = (pdSelCia ? pdSelCia + ' — ' : '') + periodoLbl.toUpperCase();

  const wAvg = (rs, field) => {
    const tot = rs.reduce((s, r) => s + (r.qtde_taloes || 0), 0);
    return tot ? rs.reduce((s, r) => s + (r[field] || 0) * (r.qtde_taloes || 0), 0) / tot : 0;
  };

  const trGlobal    = wAvg(rows, 'pct_hd_hcl_20min');
  const trBoe       = wAvg(rows, 'pct_boe');
  const trTotalTal  = rows.reduce((s, r) => s + (r.qtde_taloes || 0), 0);
  const trForaPrazo = Math.round(trTotalTal * (1 - trGlobal / 100));

  const byNat = {};
  rows.forEach(r => {
    if (!r.natureza_final) return;
    if (!byNat[r.natureza_final]) byNat[r.natureza_final] = [];
    byNat[r.natureza_final].push(r);
  });
  const natRank = Object.entries(byNat)
    .map(([nat, rs]) => ({
      nat,
      pct:    wAvg(rs, 'pct_hd_hcl_20min'),
      taloes: rs.reduce((s, r) => s + (r.qtde_taloes || 0), 0),
    }))
    .filter(d => d.taloes > 0)
    .sort((a, b) => b.pct - a.pct);

  const natCriticas = natRank
    .map(d => ({ ...d, fora_prazo: Math.round(d.taloes * (1 - d.pct / 100)) }))
    .filter(d => d.fora_prazo > 0)
    .sort((a, b) => b.fora_prazo - a.fora_prazo)
    .slice(0, 10);

  const byCia = {};
  rows.forEach(r => {
    const cia = r.cia ? normCiaDisplay(r.cia) : 'Não informado';
    if (!byCia[cia]) byCia[cia] = [];
    byCia[cia].push(r);
  });
  const ciaRank = Object.entries(byCia)
    .map(([cia, rs]) => ({
      cia,
      pct:    wAvg(rs, 'pct_hd_hcl_20min'),
      pctBoe: wAvg(rs, 'pct_boe'),
      taloes: rs.reduce((s, r) => s + (r.qtde_taloes || 0), 0),
    }))
    .sort((a, b) => b.pct - a.pct);

  const kpiCor = trGlobal >= 70 ? TR_COR_BOM : trGlobal >= 50 ? TR_COR : TR_COR_MAU;
  document.getElementById('pd-kpis').innerHTML = `
    <div class="pd-kpi"><div class="pd-kpi-lbl">Tempo ≤20min</div><div class="pd-kpi-val" style="color:${kpiCor}">${parseFloat(trGlobal.toFixed(1))}%</div></div>
    <div class="pd-kpi"><div class="pd-kpi-lbl">% BOe</div><div class="pd-kpi-val" style="color:${TR_COR}">${trBoe > 0 ? parseFloat(trBoe.toFixed(1)) + '%' : '—'}</div></div>
    <div class="pd-kpi"><div class="pd-kpi-lbl">Total Talões</div><div class="pd-kpi-val" style="color:${TR_COR}">${trTotalTal.toLocaleString('pt-BR')}</div></div>
    <div class="pd-kpi"><div class="pd-kpi-lbl">Fora do Prazo</div><div class="pd-kpi-val" style="color:${TR_COR_MAU}">~${trForaPrazo.toLocaleString('pt-BR')}</div></div>
  `;

  const cardTop = (cor, title, subtitle) =>
    `<div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${cor};margin-bottom:${subtitle ? '2' : '14'}px">${title}</div>
     ${subtitle ? `<div style="font-size:19px;color:var(--tx3);margin-bottom:12px">${subtitle}</div>` : ''}`;

  const barRow = (name, val, barPct, cor, sub) =>
    `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;gap:8px">
        <div style="font-size:19px;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${name}">${name}</div>
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:${cor};font-weight:700;flex-shrink:0">${val}</div>
      </div>
      <div style="background:rgba(255,255,255,.06);border-radius:3px;height:4px"><div style="height:100%;width:${Math.min(100,barPct)}%;background:${cor};border-radius:3px"></div></div>
      <div style="font-size:19px;color:var(--tx3);margin-top:2px">${sub}</div>
    </div>`;

  const natTop = natRank.slice(0, 10);
  const natTopCard = !natTop.length ? '' :
    `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${TR_COR_BOM};border-radius:10px;padding:16px">
      ${cardTop(TR_COR_BOM, 'Naturezas Mais Rápidas — % ≤20min')}
      ${natTop.map(d => barRow(d.nat, parseFloat(d.pct.toFixed(1)) + '%', Math.round(d.pct), TR_COR_BOM, d.taloes.toLocaleString('pt-BR') + ' talões')).join('')}
    </div>`;

  const natBot = natRank.length > 3 ? [...natRank].reverse().slice(0, Math.min(10, natRank.length)) : [];
  const natBotCard = !natBot.length ? '' :
    `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${TR_COR_MAU};border-radius:10px;padding:16px">
      ${cardTop(TR_COR_MAU, 'Naturezas Mais Demoradas — % ≤20min')}
      ${natBot.map(d => barRow(d.nat, parseFloat(d.pct.toFixed(1)) + '%', Math.round(d.pct), TR_COR_MAU, d.taloes.toLocaleString('pt-BR') + ' talões')).join('')}
    </div>`;

  const criticasCard = !natCriticas.length ? '' :
    `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid #e0965a;border-radius:10px;padding:16px">
      ${cardTop('#e0965a', 'Naturezas Críticas — Maior Impacto')}
      ${natCriticas.map(d => barRow(d.nat, parseFloat(d.pct.toFixed(1)) + '%', Math.round(d.pct), '#e0965a', d.taloes.toLocaleString('pt-BR') + ' talões')).join('')}
    </div>`;

  const topTitle = pdSelCia ? `Detalhamento — ${pdSelCia}` : 'Ranking por CIA — Precisão e % BOe';
  const topShell = `<div style="grid-column:1/-1;background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${TR_COR};border-radius:10px;padding:16px">
      ${cardTop(TR_COR, topTitle)}
      <canvas id="tr-rank-ch"></canvas>
    </div>`;

  document.getElementById('pd-charts').innerHTML = [
    topShell,
    natTopCard,
    natBotCard,
    criticasCard,
  ].join('');

  const topCtx = document.getElementById('tr-rank-ch')?.getContext('2d');
  if (topCtx) {
    if (pdSelCia) {
      const natShow = natRank.slice(0, 15);
      const h = Math.max(300, natShow.length * 44 + 60);
      topCtx.canvas.style.height = h + 'px';
      topCtx.canvas.style.maxHeight = h + 'px';
      const cor = ciaCorByName(pdSelCia);
      pdChs.push(new Chart(topCtx, {
        type: 'bar',
        data: {
          labels: natShow.map(d => d.nat),
          datasets: [{
            label: 'Tempo ≤20min',
            data: natShow.map(d => parseFloat(d.pct.toFixed(1))),
            backgroundColor: cor + '99',
            borderColor: cor,
            borderWidth: 1,
            borderRadius: 3,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: i => ` ${parseFloat(i.raw.toFixed(1))}% no prazo`,
                afterLabel: i => ` ${natShow[i.dataIndex].taloes.toLocaleString('pt-BR')} talões`,
              },
            },
          },
          scales: {
            x: { grid: GR, min: 0, max: 100, ticks: { color: 'rgba(255,255,255,.45)', font: { size: 19 }, callback: v => v + '%' } },
            y: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,.75)', font: { size: 19 } } },
          },
        },
      }));
    } else {
      const ciasToShow = ciaRank.slice(0, 8);
      const h = Math.max(280, ciasToShow.length * 56 + 60);
      topCtx.canvas.style.height = h + 'px';
      topCtx.canvas.style.maxHeight = h + 'px';
      const hasBoeData = ciasToShow.some(d => d.pctBoe > 0);
      pdChs.push(new Chart(topCtx, {
        type: 'bar',
        data: {
          labels: ciasToShow.map(d => d.cia),
          datasets: [
            {
              label: 'Tempo ≤20min',
              data: ciasToShow.map(d => parseFloat(d.pct.toFixed(1))),
              backgroundColor: ciasToShow.map(d => ciaCorByName(d.cia) + '99'),
              borderColor: ciasToShow.map(d => ciaCorByName(d.cia)),
              borderWidth: 1,
              borderRadius: 3,
            },
            ...(hasBoeData ? [{
              label: '% BOe',
              data: ciasToShow.map(d => parseFloat(d.pctBoe.toFixed(1))),
              backgroundColor: '#9b6de055',
              borderColor: '#9b6de0',
              borderWidth: 1,
              borderRadius: 3,
            }] : []),
          ],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: hasBoeData,
              position: 'top',
              labels: { color: '#f4f6fc', font: { size: 19, family: "'DM Sans',sans-serif" }, padding: 16, usePointStyle: true },
            },
            tooltip: {
              callbacks: {
                label: i => {
                  if (i.datasetIndex === 0) {
                    const d = ciasToShow[i.dataIndex];
                    return [` Tempo ≤20min: ${i.raw}%`, ` ${d.taloes.toLocaleString('pt-BR')} talões`];
                  }
                  return ` % BOe: ${i.raw}%`;
                },
              },
            },
          },
          scales: {
            x: { grid: GR, min: 0, max: 100, ticks: { color: 'rgba(255,255,255,.45)', font: { size: 19 }, callback: v => v + '%' } },
            y: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,.75)', font: { size: 19 } } },
          },
        },
      }));
    }
  }
}

function tipoCurso(nome) {
  const nl = (nome||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  if (/^cep\s*[-–]/.test(nl)) return 'CEP';
  if (/^eep\s*[-–]/.test(nl) || /estagio de especializacao/.test(nl)) return 'EEP';
  if (/^habilit/.test(nl)) return 'Habilitação';
  if (/^adapt/.test(nl)) return 'Adaptação';
  if (/^instruc/.test(nl)) return 'Instrução';
  return 'Outros';
}

const TIPO_COR = {
  'CEP':         '#5a9de0',
  'EEP':         '#e0965a',
  'Habilitação': '#9b6de0',
  'Adaptação':   '#4bc8a0',
  'Instrução':   '#e05a8a',
  'Outros':      '#607090'
};
const TIPO_ORD = ['CEP','EEP','Habilitação','Adaptação','Instrução','Outros'];

function renderCursosModalDetail() {
  const COR = '#9de05a';
  const mesesDisp = prodGetMesesDisp(prodSelAno);
  const periodoLbl = pdMeses.length === mesesDisp.length ? 'Acumulado ' + (prodSelAno || '') : pdMeses.join(', ');

  const rows = (prodRaw.cursos || []).filter(r => {
    if (prodSelAno && r.ano !== prodSelAno) return false;
    if (pdMeses.length && !pdMeses.some(m => m.toLowerCase() === (r.mes||'').toLowerCase())) return false;
    return true;
  });

  const cursosMap = new Map();
  rows.forEach(r => {
    const key = (r.data||'') + '||' + (r.nome_curso||'');
    if (!cursosMap.has(key)) cursosMap.set(key, { data: r.data, nome_curso: r.nome_curso, mes: r.mes, tipo: tipoCurso(r.nome_curso), pms: [] });
    if (r.re_pm) cursosMap.get(key).pms.push({ posto: r.posto_pm, re: r.re_pm, nome: r.nome_pm });
  });
  const cursosList = [...cursosMap.values()].sort((a, b) => (b.data||'').localeCompare(a.data||''));
  const pmsUnicos  = new Set(rows.filter(r => r.re_pm).map(r => r.re_pm));

  // Agregação por tipo (cursos únicos)
  const tipoAgg = {};
  cursosList.forEach(c => { tipoAgg[c.tipo] = (tipoAgg[c.tipo] || 0) + 1; });
  const tipoLabels = TIPO_ORD.filter(t => tipoAgg[t]);
  const tipoValues = tipoLabels.map(t => tipoAgg[t]);
  const tipoCores  = tipoLabels.map(t => TIPO_COR[t]);

  document.getElementById('pd-sub').textContent = periodoLbl.toUpperCase();
  document.getElementById('pd-kpis').innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${COR};border-radius:8px;padding:14px 18px">
      <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Cursos Realizados</div>
      <div style="font-family:'DM Mono',monospace;font-size:28px;font-weight:700;color:${COR}">${cursosList.length}</div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${COR};border-radius:8px;padding:14px 18px">
      <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">PMs Capacitados</div>
      <div style="font-family:'DM Mono',monospace;font-size:28px;font-weight:700;color:${COR}">${pmsUnicos.size}</div>
    </div>`;

  const fmtD = s => { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
  const tdS = 'padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.04);font-family:"DM Mono",monospace;font-size:19px;color:var(--tx3)';
  const tdL = 'padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.04);font-size:19px;font-weight:600;color:var(--tx)';
  const thS = 'padding:8px 12px;border-bottom:1px solid var(--bd2);font-family:"DM Mono",monospace;font-size:19px;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;text-align:left';

  const tableRows = cursosList.map(c => {
    const cor = TIPO_COR[c.tipo] || '#607090';
    return `<tr>
      <td style="${tdS};white-space:nowrap">${fmtD(c.data)}</td>
      <td style="padding:10px 18px;border-bottom:1px solid rgba(255,255,255,.04);text-align:center">
        <span style="font-family:'DM Mono',monospace;font-size:19px;padding:1px 7px;border-radius:8px;background:${cor}22;color:${cor};display:inline-block;margin-bottom:4px">${c.tipo}</span>
        <div style="font-size:19px;font-weight:600;color:var(--tx);display:flex;align-items:center;justify-content:center;gap:8px">
          <span>${c.nome_curso||'—'}</span>
          ${c.pms.length ? `<span style="font-family:'DM Mono',monospace;font-size:19px;padding:1px 8px;border-radius:8px;background:${COR}22;color:${COR};font-weight:400;white-space:nowrap">${c.pms.length} PM${c.pms.length !== 1 ? 's' : ''}</span>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  // Evolução mensal (cursos únicos por mês)
  const mesAgg = {};
  rows.forEach(r => {
    const key = (r.data||'') + '||' + (r.nome_curso||'');
    const m = (r.mes||'').toLowerCase();
    if (!m) return;
    if (!mesAgg[m]) mesAgg[m] = new Set();
    mesAgg[m].add(key);
  });
  const evoLabels = MES_ORD.filter(m => mesAgg[m.toLowerCase()]);
  const evoData   = evoLabels.map(m => mesAgg[m.toLowerCase()].size);

  const chartsEl = document.getElementById('pd-charts');
  chartsEl.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--bd2);border-radius:10px;padding:16px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COR};margin-bottom:10px">Evolução Mensal</div>
      <canvas id="cursos-evo" style="height:420px;max-height:420px"></canvas>
      <div id="cursos-evo-empty" style="display:none;color:var(--tx3);font-size:19px;text-align:center;padding:12px 0">Sem dados para o período</div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--bd2);border-radius:10px;padding:16px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COR};margin-bottom:10px">Distribuição por Tipo</div>
      <canvas id="cursos-tipo" style="height:420px;max-height:420px"></canvas>
      <div id="cursos-tipo-empty" style="display:none;color:var(--tx3);font-size:19px;text-align:center;padding:12px 0">Sem dados para o período</div>
    </div>
    <div style="grid-column:1/-1;background:var(--bg2);border:1px solid var(--bd2);border-radius:10px;padding:16px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COR};margin-bottom:12px">Lista de Cursos</div>
      ${!cursosList.length ? `<div style="color:var(--tx3);font-size:19px;text-align:center;padding:12px 0">Sem dados para o período</div>` : `
      <div style="overflow-x:auto;max-height:420px;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="${thS};width:90px">Data</th>
            <th style="${thS}">Curso</th>
            <th style="${thS}"></th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`}
    </div>`;

  // Gráfico evolução
  if (evoLabels.length) {
    const ctx = document.getElementById('cursos-evo')?.getContext('2d');
    if (ctx) {
      pdChs.push(new Chart(ctx, {
        type: 'bar',
        data: { labels: evoLabels, datasets: [{ data: evoData, backgroundColor: COR + '88', borderColor: COR, borderWidth: 1, borderRadius: 3 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${i.raw} curso${i.raw !== 1 ? 's' : ''}` } } },
          scales: {
            x: { grid: GR, ticks: { color: 'rgba(255,255,255,.55)', font: { size: 19 } } },
            y: { grid: GR, ticks: { color: 'rgba(255,255,255,.55)', font: { size: 19 }, stepSize: 1 }, beginAtZero: true }
          }
        }
      }));
    }
  } else {
    const e = document.getElementById('cursos-evo-empty'), c = document.getElementById('cursos-evo');
    if (e) e.style.display = ''; if (c) c.style.display = 'none';
  }

  // Gráfico distribuição por tipo
  if (tipoLabels.length) {
    const ctx2 = document.getElementById('cursos-tipo')?.getContext('2d');
    if (ctx2) {
      pdChs.push(new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: tipoLabels,
          datasets: [{ data: tipoValues, backgroundColor: tipoCores.map(c => c + 'cc'), borderColor: tipoCores, borderWidth: 2 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,.7)', font: { size: 19 }, padding: 16, boxWidth: 14 } },
            tooltip: { callbacks: { label: i => ` ${i.label}: ${i.raw} curso${i.raw !== 1 ? 's' : ''}` } }
          }
        }
      }));
    }
  } else {
    const e = document.getElementById('cursos-tipo-empty'), c = document.getElementById('cursos-tipo');
    if (e) e.style.display = ''; if (c) c.style.display = 'none';
  }
}

async function renderTafTatModalDetail() {
  const COR = '#7b8cde';
  document.getElementById('pd-sub').textContent = 'EFETIVO DO BATALHÃO';

  let efetivo = p1Data.length ? p1Data : [];
  if (!efetivo.length) {
    document.getElementById('pd-kpis').innerHTML = `<div style="color:var(--tx3);font-size:19px;grid-column:1/-1">Carregando efetivo...</div>`;
    document.getElementById('pd-charts').innerHTML = '';
    try {
      const r = await authFetch(`${API}/efetivo`);
      efetivo = await r.json();
    } catch { efetivo = []; }
  }
  if (!efetivo.length) {
    document.getElementById('pd-kpis').innerHTML = `<div style="color:var(--tx3);font-size:19px;grid-column:1/-1">Sem dados de efetivo disponíveis.</div>`;
    document.getElementById('pd-charts').innerHTML = '';
    return;
  }

  const hoje = new Date();
  const isVenc = pm => {
    if (!pm.data_eap) return false;
    const d = new Date(pm.data_eap), lim = new Date(d);
    lim.setFullYear(lim.getFullYear() + 1);
    return hoje > lim;
  };

  const APROV_MB = new Set(['muito bom','excepcional']);
  const REPROV   = new Set(['inapto','ruim']);
  const comTaf   = efetivo.filter(pm => pm.taf);
  const comTat   = efetivo.filter(pm => pm.tat);
  const inaptoTaf = comTaf.filter(pm => REPROV.has((pm.taf||'').toLowerCase())).length;
  const inaptoTat = comTat.filter(pm => REPROV.has((pm.tat||'').toLowerCase())).length;
  const vencidos  = efetivo.filter(isVenc).length;

  const lim365 = new Date(hoje); lim365.setDate(lim365.getDate() - 365);
  const aptosMB365Taf = efetivo.filter(pm =>
    pm.data_eap && new Date(pm.data_eap) >= lim365 && APROV_MB.has((pm.taf||'').toLowerCase().trim())
  ).length;
  const aptosMB365Tat = efetivo.filter(pm =>
    pm.data_eap && new Date(pm.data_eap) >= lim365 && APROV_MB.has((pm.tat||'').toLowerCase().trim())
  ).length;

  const kpiMini = (lbl, val, cor, sub) =>
    `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${cor};border-radius:8px;padding:14px 18px">
      <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">${lbl}</div>
      <div style="font-family:'DM Mono',monospace;font-size:28px;font-weight:700;color:${cor}">${val}</div>
      ${sub ? `<div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-top:3px">${sub}</div>` : ''}
    </div>`;

  document.getElementById('pd-kpis').innerHTML =
    kpiMini('Total Efetivo',      efetivo.length,    COR) +
    kpiMini('Aptos MB+ TAF 365d', aptosMB365Taf,     '#4bc87a', 'Muito Bom ou Excepcional') +
    kpiMini('Inaptos TAF',        inaptoTaf,          inaptoTaf  > 0 ? '#e05555' : 'var(--tx3)') +
    kpiMini('TAF Vencido',        vencidos,           vencidos   > 0 ? '#e05555' : 'var(--tx3)', '> 1 ano sem fazer') +
    kpiMini('Avaliados TAT',      comTat.length,      COR) +
    kpiMini('Aptos MB+ TAT 365d', aptosMB365Tat,     '#4bc87a', 'Muito Bom ou Excepcional') +
    kpiMini('Inaptos TAT',        inaptoTat,          inaptoTat  > 0 ? '#e05555' : 'var(--tx3)');

  // Distribuição por conceito
  const CONCS_ORD = ['Excepcional','Muito Bom','Bom','Regular','Ruim','Inapto'];
  const CONC_NORM = { 'excepcional':'Excepcional','muito bom':'Muito Bom','bom':'Bom','regular':'Regular','ruim':'Ruim','inapto':'Inapto' };
  const CONC_COR  = { 'Excepcional':'#4bc87a','Muito Bom':'#9de05a','Bom':'#c8c84b','Regular':'#c8a84b','Ruim':'#e05555','Inapto':'#e05555','Sem dados':'#404060' };

  const contarConceito = campo => {
    const counts = {};
    efetivo.forEach(pm => {
      const n = (pm[campo]||'').toLowerCase().trim();
      const k = CONC_NORM[n] || (n ? n.charAt(0).toUpperCase() + n.slice(1) : 'Sem dados');
      counts[k] = (counts[k] || 0) + 1;
    });
    return counts;
  };
  const tafCts = contarConceito('taf');
  const tatCts = contarConceito('tat');
  const tafLbls = [...CONCS_ORD.filter(c => tafCts[c]), ...(tafCts['Sem dados'] ? ['Sem dados'] : [])];
  const tatLbls = [...CONCS_ORD.filter(c => tatCts[c]), ...(tatCts['Sem dados'] ? ['Sem dados'] : [])];

  const chartsEl = document.getElementById('pd-charts');
  const cardSt = 'background:var(--bg2);border:1px solid var(--bd2);border-radius:10px;padding:16px';
  const titSt  = `font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COR};margin-bottom:10px`;
  chartsEl.innerHTML = `
    <div style="grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div style="${cardSt}">
        <div style="${titSt}">Distribuição TAF por Conceito</div>
        <canvas id="taftat-taf-dist" style="height:460px;max-height:460px"></canvas>
      </div>
      <div style="${cardSt}">
        <div style="${titSt}">Distribuição TAT por Conceito</div>
        <canvas id="taftat-tat-dist" style="height:460px;max-height:460px"></canvas>
      </div>
    </div>
    <div style="grid-column:1/-1;${cardSt}">
      <div style="${titSt}">TAF × TAT — Comparativo por Conceito</div>
      <canvas id="taftat-compare" style="height:480px;max-height:480px"></canvas>
    </div>`;

  const legendOpts = { position:'bottom', labels:{ color:'rgba(255,255,255,.9)', font:{size:19}, padding:20, boxWidth:16 } };

  // Doughnut TAF
  if (tafLbls.some(l => l !== 'Sem dados')) {
    const ctx = document.getElementById('taftat-taf-dist')?.getContext('2d');
    if (ctx) pdChs.push(new Chart(ctx, {
      type: 'doughnut',
      data: { labels: tafLbls, datasets: [{ data: tafLbls.map(l => tafCts[l]||0), backgroundColor: tafLbls.map(l => (CONC_COR[l]||'#607090')+'cc'), borderColor: tafLbls.map(l => CONC_COR[l]||'#607090'), borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legendOpts, tooltip: { callbacks: { label: i => ` ${i.label}: ${i.raw} PM${i.raw!==1?'s':''}` } } } }
    }));
  }

  // Doughnut TAT
  if (tatLbls.some(l => l !== 'Sem dados')) {
    const ctx2 = document.getElementById('taftat-tat-dist')?.getContext('2d');
    if (ctx2) pdChs.push(new Chart(ctx2, {
      type: 'doughnut',
      data: { labels: tatLbls, datasets: [{ data: tatLbls.map(l => tatCts[l]||0), backgroundColor: tatLbls.map(l => (CONC_COR[l]||'#607090')+'cc'), borderColor: tatLbls.map(l => CONC_COR[l]||'#607090'), borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: legendOpts, tooltip: { callbacks: { label: i => ` ${i.label}: ${i.raw} PM${i.raw!==1?'s':''}` } } } }
    }));
  }

  // Bar comparativo TAF × TAT
  const ctx3 = document.getElementById('taftat-compare')?.getContext('2d');
  if (ctx3) pdChs.push(new Chart(ctx3, {
    type: 'bar',
    data: {
      labels: CONCS_ORD,
      datasets: [
        { label: 'TAF', data: CONCS_ORD.map(c => tafCts[c]||0), backgroundColor: COR+'99', borderColor: COR, borderWidth: 1, borderRadius: 3 },
        { label: 'TAT', data: CONCS_ORD.map(c => tatCts[c]||0), backgroundColor: '#e0a87b99', borderColor: '#e0a87b', borderWidth: 1, borderRadius: 3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: legendOpts,
        tooltip: { callbacks: { label: i => ` ${i.dataset.label}: ${i.raw} PM${i.raw!==1?'s':''}` } }
      },
      scales: {
        x: { grid: GR, ticks: { color:'rgba(255,255,255,.7)', font:{size:19} } },
        y: { grid: GR, ticks: { color:'rgba(255,255,255,.7)', font:{size:19}, stepSize:1 }, beginAtZero: true }
      }
    }
  }));
}

function renderProdDetail() {
  pdDestroy();
  const tipo = pdTipo;
  if (tipo === 'tempo-resposta') { renderTRModalDetail(); return; }
  if (tipo === 'cursos') { renderCursosModalDetail(); return; }
  if (tipo === 'taftat') { renderTafTatModalDetail(); return; }
  const cor = pdNatFilter ? '#e05a8a' : PROD_CORES[tipo];
  const campo = tipo === 'entorpecentes' ? 'quantidade' : PROD_CAMPO[tipo];
  const mesesDisp = prodGetMesesDisp(prodSelAno);

  // Base: ano + unidade + natureza (sem filtro de CIA/mês ainda, para evolução correta)
  let baseRows = prodRaw[tipo] || [];
  if (prodSelAno) baseRows = baseRows.filter(r => r.ano === prodSelAno);
  if (pdUnidade) baseRows = baseRows.filter(r => (r.unidade_medida||'Sem unidade').trim() === pdUnidade);
  if (pdNatFilter) { const nf = pdNatFilter.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); baseRows = baseRows.filter(r => (r.natureza||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(nf)); }

  // Filtrado: aplica CIA + meses
  const rows = baseRows.filter(r => {
    if (pdMeses.length && !pdMeses.some(m => m.toLowerCase() === (r.mes||'').toLowerCase())) return false;
    if (pdSelCia && normCiaDisp(r.cia) !== normCiaDisp(pdSelCia)) return false;
    return true;
  });

  const total = prodSum(rows, campo);
  const periodoLbl = pdMeses.length === mesesDisp.length ? 'Acumulado ' + (prodSelAno || '') : pdMeses.join(', ');

  // Ranking CIA
  const aggCia = {};
  rows.forEach(r => { const c = r.cia ? normCiaDisplay(r.cia) : ''; if (c) aggCia[c] = (aggCia[c]||0) + (Number(r[campo])||0); });
  const topCias = Object.entries(aggCia).sort((a,b) => b[1]-a[1]);

  // Mês de pico
  const aggMesPico = {};
  rows.forEach(r => { const mk = MES_ORD.find(x => x.toLowerCase() === (r.mes||'').toLowerCase()) || r.mes || ''; if (mk) aggMesPico[mk] = (aggMesPico[mk]||0) + (Number(r[campo])||0); });
  const topMes = Object.entries(aggMesPico).sort((a,b) => b[1]-a[1])[0];

  // KPIs do modal
  document.getElementById('pd-kpis').innerHTML = '';

  document.getElementById('pd-sub').textContent = (pdSelCia ? pdSelCia + ' — ' : '') + periodoLbl.toUpperCase();

  // Charts HTML
  const chartsEl = document.getElementById('pd-charts');
  const cardHtml = (id, label, full) =>
    `<div style="${full ? 'grid-column:1/-1;' : ''}background:var(--bg2);border:1px solid var(--bd2);border-radius:10px;padding:16px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${cor};margin-bottom:10px">${label}</div>
      <canvas id="${id}"></canvas>
      <div id="${id}-empty" style="display:none;color:var(--tx3);font-size:19px;text-align:center;padding:12px 0">Sem dados para o período</div>
    </div>`;

  const ciaTitleLabel = pdSelCia
    ? (tipo === 'ocorrencias' ? `Municípios — ${pdSelCia}` : `Detalhamento — ${pdSelCia}`)
    : 'Ranking por CIA';
  let html = cardHtml('pd-cia', ciaTitleLabel, true) + cardHtml('pd-evo', 'Evolução Mensal', true);
  if (!pdNatFilter) html += cardHtml('pd-cat', 'Detalhamento por Categoria', true);
  if (tipo === 'ocorrencias') {
    html += `<div style="grid-column:1/-1;background:var(--bg2);border:1px solid var(--bd2);border-radius:10px;padding:16px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${cor};margin-bottom:12px">Natureza × Mês</div>
      <div id="pd-matriz" style="overflow-x:auto;font-size:19px"></div>
    </div>`;
  }
  chartsEl.innerHTML = html;

  // Opções barra horizontal
  const barOpts = {
    indexAxis: 'y', responsive: true,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${i.raw.toLocaleString('pt-BR')}` } } },
    scales: {
      x: { grid: GR, ticks: { color: 'rgba(255,255,255,.45)', font: { size: 19 } } },
      y: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,.80)', font: { size: 19 } } }
    }
  };

  // Helper renderBar local — colorFn(label) opcional; sem ela usa ciaCorByName
  const rdBar = (id, labels, values, colorFn) => {
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx) return;
    if (!labels.length) { const e = document.getElementById(id+'-empty'); if(e) e.style.display=''; ctx.canvas.style.display='none'; return; }
    const h = Math.max(300, labels.length * 52 + 40);
    ctx.canvas.style.height = h + 'px';
    ctx.canvas.style.maxHeight = h + 'px';
    const fn = colorFn || ciaCorByName;
    const bkgs = labels.map(l => fn(l) + '99');
    const brds = labels.map(l => fn(l));
    pdChs.push(new Chart(ctx, { type:'bar', data:{ labels, datasets:[{ data:values, backgroundColor:bkgs, borderColor:brds, borderWidth:1, borderRadius:3 }] }, options: { ...barOpts, maintainAspectRatio: false } }));
  };

  // --- Ranking CIA / Detalhamento por município (ocorrencias) ou categoria quando CIA filtrada ---
  if (pdSelCia) {
    if (tipo === 'ocorrencias') {
      const munAgg = {};
      rows.forEach(r => { const k = r.municipio || 'Não informado'; munAgg[k] = (munAgg[k]||0) + (Number(r[campo])||0); });
      const munEntries = Object.entries(munAgg).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0, 15);
      rdBar('pd-cia', munEntries.map(([k]) => k), munEntries.map(([,v]) => v), () => cor);
    } else {
      const breakField = PROD_BREAK[tipo] || 'natureza';
      const catAgg = {};
      rows.forEach(r => { const k = r[breakField] || 'Não informado'; catAgg[k] = (catAgg[k]||0) + (Number(r[campo])||0); });
      const catEntries = Object.entries(catAgg).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0, 15);
      rdBar('pd-cia', catEntries.map(([k]) => k), catEntries.map(([,v]) => v), () => cor);
    }
  } else {
    rdBar('pd-cia', topCias.map(([k])=>k), topCias.map(([,v])=>v));
  }

  // --- Evolução Mensal ---
  const rowsParaEvo = baseRows.filter(r => !pdSelCia || normCiaDisp(r.cia) === normCiaDisp(pdSelCia));
  const aggEvo = {};
  mesesDisp.forEach(m => aggEvo[m] = 0);
  rowsParaEvo.forEach(r => { const mk = MES_ORD.find(x => x.toLowerCase() === (r.mes||'').toLowerCase()) || r.mes || ''; if (mesesDisp.includes(mk)) aggEvo[mk] = (aggEvo[mk]||0) + (Number(r[campo])||0); });
  const evoVals = mesesDisp.map(m => aggEvo[m]||0);
  const evoCtx = document.getElementById('pd-evo')?.getContext('2d');
  if (evoCtx) {
    evoCtx.canvas.style.height = '340px';
    evoCtx.canvas.style.maxHeight = '340px';
    if (!evoVals.some(v => v > 0)) { const e = document.getElementById('pd-evo-empty'); if(e) e.style.display=''; evoCtx.canvas.style.display='none'; }
    else {
      // Multi-linha por CIA com legenda clicável
      const CIA_LINHAS = [
        { label: 'Total Batalhão', cor: CIA_COR.total,  key: null },
        { label: '1ª CIA',         cor: CIA_COR['1'],   key: '1' },
        { label: '2ª CIA',         cor: CIA_COR['2'],   key: '2' },
        { label: '3ª CIA',         cor: CIA_COR['3'],   key: '3' },
        { label: 'FT',             cor: CIA_COR.ft,     key: 'ft' },
      ];
      const datasets = CIA_LINHAS.map(({ label, cor: c, key }) => {
        const vals = mesesDisp.map(m => {
          return baseRows.filter(r => {
            const mk = MES_ORD.find(x => x.toLowerCase() === (r.mes||'').toLowerCase()) || r.mes || '';
            if (mk !== m) return false;
            if (key === null) return true;
            return normCiaKey(r.cia) === key || (key === 'ft' && /ft|forca|tatica/.test((r.cia||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')));
          }).reduce((s, r) => s + (Number(r[campo])||0), 0);
        });
        return { label, data: vals, borderColor: c, backgroundColor: c + '18', borderWidth: label === 'Total Batalhão' ? 3 : 2, fill: false, tension: 0.4, pointBackgroundColor: c, pointRadius: 4 };
      });
      pdChs.push(new Chart(evoCtx, {
        type: 'line',
        data: { labels: mesesDisp.map(m => m.slice(0,3)), datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top', labels: { color: '#f4f6fc', font: { size: 19, family: "'DM Sans',sans-serif" }, padding: 18, usePointStyle: true, pointStyleWidth: 10 } },
            tooltip: { callbacks: { label: i => ` ${i.dataset.label}: ${i.raw.toLocaleString('pt-BR')}` } }
          },
          scales: { x: { grid: GR, ticks: { color: 'rgba(255,255,255,.55)', font: { size: 19 } } }, y: { grid: GR, beginAtZero: true, ticks: { color: 'rgba(255,255,255,.45)', font: { size: 19 } } } }
        }
      }));
    }
  }

  // --- Detalhamento por Categoria ---
  if (!pdNatFilter) {
    const breakField = PROD_BREAK[tipo] || 'entorpecente';
    const catAgg    = {};
    const catCiaAgg = {};
    rows.forEach(r => {
      const key = r[breakField] || 'Não informado';
      const cia = r.cia ? normCiaDisplay(r.cia) : 'Não informado';
      const val = Number(r[campo]) || 0;
      catAgg[key] = (catAgg[key] || 0) + val;
      if (!catCiaAgg[key]) catCiaAgg[key] = {};
      catCiaAgg[key][cia] = (catCiaAgg[key][cia] || 0) + val;
    });
    const catEntries = Object.entries(catAgg).sort((a,b) => b[1]-a[1]).slice(0,15);
    const catLabels  = catEntries.map(([k]) => k);
    const catValues  = catEntries.map(([,v]) => v);

    const ctxCat = document.getElementById('pd-cat')?.getContext('2d');
    if (ctxCat) {
      if (!catLabels.length) { const e = document.getElementById('pd-cat-empty'); if(e) e.style.display=''; ctxCat.canvas.style.display='none'; }
      else {
        const h = Math.max(260, catLabels.length * 34 + 40);
        ctxCat.canvas.style.height = h + 'px';
        ctxCat.canvas.style.maxHeight = h + 'px';
        pdChs.push(new Chart(ctxCat, {
          type: 'bar',
          data: { labels: catLabels, datasets: [{ data: catValues, backgroundColor: cor+'99', borderColor: cor, borderWidth: 1, borderRadius: 3 }] },
          options: {
            ...barOpts,
            maintainAspectRatio: false,
            plugins: {
              ...barOpts.plugins,
              tooltip: {
                callbacks: {
                  label: ctx => ` Total: ${ctx.raw.toLocaleString('pt-BR')}`,
                  afterLabel: ctx => {
                    const breakdown = catCiaAgg[ctx.label] || {};
                    return Object.entries(breakdown)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cia, v]) => `  ${cia}: ${v.toLocaleString('pt-BR')}`);
                  }
                }
              }
            }
          }
        }));
      }
    }
  }

  // --- Natureza × Mês (só ocorrências) ---
  if (tipo === 'ocorrencias') {
    const natMes = {};
    rows.forEach(r => {
      const nat = r.natureza || 'Não informado';
      const mk = MES_ORD.find(x => x.toLowerCase() === (r.mes||'').toLowerCase()) || r.mes || '';
      if (!natMes[nat]) natMes[nat] = {};
      natMes[nat][mk] = (natMes[nat][mk]||0) + (Number(r.contagem)||0);
    });
    const natList = Object.keys(natMes).sort((a,b) => {
      const ta = pdMeses.reduce((s,m) => s+(natMes[a][m]||0), 0);
      const tb = pdMeses.reduce((s,m) => s+(natMes[b][m]||0), 0);
      return tb - ta;
    }).slice(0,20);
    const mesesUsados = pdMeses.filter(m => natList.some(n => (natMes[n][m]||0) > 0));
    const matEl = document.getElementById('pd-matriz');
    if (matEl) {
      if (!natList.length || !mesesUsados.length) { matEl.innerHTML = '<div style="color:var(--tx3);font-size:19px;padding:8px 0">Sem dados</div>'; }
      else {
        let tbl = `<table style="border-collapse:collapse;width:100%;min-width:400px"><thead><tr>
          <th style="text-align:left;padding:8px 12px;border-bottom:1px solid var(--bd2);font-size:19px;color:var(--tx3)">Natureza</th>`;
        mesesUsados.forEach(m => tbl += `<th style="padding:8px 12px;border-bottom:1px solid var(--bd2);font-size:19px;color:var(--tx3);text-align:right">${m.slice(0,3)}</th>`);
        tbl += `<th style="padding:8px 12px;border-bottom:1px solid var(--bd2);font-size:19px;color:var(--tx3);text-align:right">Total</th></tr></thead><tbody>`;
        natList.forEach((nat, i) => {
          const rowTot = mesesUsados.reduce((s,m) => s+(natMes[nat][m]||0), 0);
          tbl += `<tr style="background:${i%2?'':'rgba(255,255,255,.02)'}">
            <td style="padding:8px 12px;font-size:19px;color:var(--tx)">${nat}</td>`;
          mesesUsados.forEach(m => { const v = natMes[nat][m]||0; tbl += `<td style="padding:8px 12px;text-align:right;font-size:19px;color:${v>0?'var(--tx)':'var(--tx3)'}">${v>0?v:'—'}</td>`; });
          tbl += `<td style="padding:8px 12px;text-align:right;font-size:19px;font-weight:700;color:${cor}">${rowTot}</td></tr>`;
        });
        tbl += '</tbody></table>';
        matEl.innerHTML = tbl;
      }
    }
  }

  // --- Visita Solidária (só quando modal de Violência Doméstica) ---
  const normStrPd = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  if (pdNatFilter && normStrPd(pdNatFilter).includes('violencia domestica')) {
    const VD_COR2 = '#e05a8a';
    const simRx = /^sim$/i;
    const naoRx = /^n[ãa]o$/i;
    const vsFields = ['visita_1','visita_2','visita_3','visita_4','visita_5','visita_6'];

    // Filtra VS pelo mesmo período/CIA do modal
    const filtVS = (prodRaw.visitaSolidaria || []).filter(r => {
      if (prodSelAno && r.ano !== prodSelAno) return false;
      if (pdMeses.length && !pdMeses.some(m => m.toLowerCase() === (r.mes||'').toLowerCase())) return false;
      if (pdSelCia && normCiaDisp(r.cia) !== normCiaDisp(pdSelCia)) return false;
      return true;
    });
    // Para reiterações: ignora filtro de ano e mês — detecta mesma vítima em qualquer período
    const allYearVS = (prodRaw.visitaSolidaria || []).filter(r => {
      if (pdSelCia && normCiaDisp(r.cia) !== normCiaDisp(pdSelCia)) return false;
      return true;
    });

    const totVDModal = total; // total do modal já filtrado

    // Métricas básicas
    const vsQuer         = filtVS.filter(r => simRx.test((r.quer_acompanhamento||'').trim())).length;
    const vsNaoQuer      = filtVS.filter(r => naoRx.test((r.quer_acompanhamento||'').trim())).length;
    const vsMedProt      = filtVS.filter(r => simRx.test((r.medida_protetiva||'').trim())).length;
    const vsAcompanhados = filtVS.filter(r => vsFields.some(f => r[f] && r[f].trim())).length;
    const vsTotalContatos= filtVS.reduce((s, r) => s + vsFields.filter(f => r[f] && r[f].trim()).length, 0);
    const vsPctAcomp     = totVDModal > 0 ? Math.round(vsAcompanhados / totVDModal * 100) : null;
    const gaugeColor     = vsPctAcomp === null ? '#888' : vsPctAcomp >= 80 ? '#4bc87a' : vsPctAcomp >= 50 ? '#f0c040' : '#f07878';

    // Helpers
    const parseVSDate = s => {
      if (!s) return null;
      const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      return m ? new Date(+m[3], +m[2]-1, +m[1]) : null;
    };
    const normNome = s => (s||'').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ');
    const titleNome = s => s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Reiterações com histórico detalhado por vítima (usa ano inteiro, ignora filtro de mês)
    const nomeMap = {};
    allYearVS.forEach(r => {
      const k = normNome(r.nome_vitima);
      if (!k) return;
      if (!nomeMap[k]) nomeMap[k] = { nome: r.nome_vitima, ocorrencias: [] };
      nomeMap[k].ocorrencias.push(r);
    });
    const reiterantes = Object.values(nomeMap)
      .filter(v => v.ocorrencias.length > 1)
      .sort((a, b) => b.ocorrencias.length - a.ocorrencias.length);

    // Intervalo médio entre contatos
    const iSums = [0,0,0,0,0], iCounts = [0,0,0,0,0];
    filtVS.forEach(r => {
      const dates = vsFields.map(f => parseVSDate(r[f])).filter(Boolean).sort((a,b) => a-b);
      for (let i = 1; i < dates.length; i++) {
        const diff = Math.round((dates[i] - dates[i-1]) / 86400000);
        if (diff >= 0 && i-1 < 5) { iSums[i-1] += diff; iCounts[i-1]++; }
      }
    });
    const avgIntvs = iSums.map((s,i) => iCounts[i] > 0 ? Math.round(s/iCounts[i]) : null);

    // Normaliza texto para chave de agrupamento
    const normGrp = s => (s||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ');
    const toTitle  = s => s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

    // Parentesco
    const parentAgg = {}, parentDisp = {};
    filtVS.forEach(r => {
      const raw = (r.parentesco_agressor||'').trim() || 'Não informado';
      const key = normGrp(raw);
      parentAgg[key] = (parentAgg[key]||0) + 1;
      if (!parentDisp[key]) parentDisp[key] = toTitle(raw);
    });
    const topParent = Object.entries(parentAgg).sort((a,b)=>b[1]-a[1]).slice(0,6)
      .map(([k,v]) => [parentDisp[k], v]);

    // Bairros
    const bairroAgg = {}, bairroDisp = {};
    filtVS.forEach(r => {
      const raw = (r.bairro||'').trim();
      if (!raw) return;
      const key = normGrp(raw);
      bairroAgg[key] = (bairroAgg[key]||0) + 1;
      if (!bairroDisp[key]) bairroDisp[key] = toTitle(raw);
    });
    const topBairros = Object.entries(bairroAgg).sort((a,b)=>b[1]-a[1]).slice(0,6)
      .map(([k,v]) => [bairroDisp[k], v]);

    // ── HTML: mini-KPI helper ──
    const mkpi = (lbl, val, sub, c) =>
      `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${c};border-radius:8px;padding:12px 14px;min-width:110px;flex:1">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${c};margin-bottom:5px">${lbl}</div>
        <div style="font-family:'DM Mono',monospace;font-size:24px;font-weight:700;color:#ffffff;line-height:1">${val}</div>
        ${sub?`<div style="font-size:19px;color:#ffffff;margin-top:4px">${sub}</div>`:''}
      </div>`;

    // ── HTML: barra de ranking ──
    const mkBar = (label, val, max, c) => {
      const pct = max > 0 ? Math.round(val/max*100) : 0;
      return `<div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <div style="font-size:19px;color:#ffffff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:74%">${label}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:${c};font-weight:700">${val}</div>
        </div>
        <div style="background:rgba(255,255,255,.06);border-radius:2px;height:4px"><div style="height:100%;width:${pct}%;background:${c};border-radius:2px"></div></div>
      </div>`;
    };

    // ── Reiterações detalhadas ──
    const reiterHtml = (() => {
      if (!reiterantes.length) return `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid #9b6de0;border-radius:8px;padding:14px 16px">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9b6de0;margin-bottom:8px">Reiterações</div>
        <div style="font-family:'DM Mono',monospace;font-size:22px;font-weight:700;color:#fff">0</div>
        <div style="font-size:19px;color:var(--tx3);margin-top:4px">nenhuma vítima com mais de 1 ocorrência</div>
      </div>`;

      const cards = reiterantes.map(v => {
        const ocorrs = v.ocorrencias.slice().sort((a,b) => {
          const da = parseVSDate(a.data_ocorrencia), db = parseVSDate(b.data_ocorrencia);
          return (da||0) - (db||0);
        });
        const bairros = [...new Set(ocorrs.map(o => (o.bairro||'').trim()).filter(Boolean))];
        const mesmoCal = bairros.length <= 1;
        const rows = ocorrs.map((o, i) => {
          const nContatos = vsFields.filter(f => o[f] && o[f].trim()).length;
          const quer = simRx.test((o.quer_acompanhamento||'').trim()) ? 'Sim' : naoRx.test((o.quer_acompanhamento||'').trim()) ? 'Não' : '—';
          return `<tr style="background:${i%2?'':'rgba(255,255,255,.02)'}">
            <td style="padding:5px 8px;font-size:19px;color:var(--tx);white-space:nowrap;overflow:hidden">${o.data_ocorrencia||'—'}</td>
            <td style="padding:5px 8px;font-size:19px;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(o.bairro||'').replace(/"/g,'&quot;')}">${(o.bairro||'—')}</td>
            <td style="padding:5px 8px;font-size:19px;color:${quer==='Sim'?'#4bc87a':quer==='Não'?'#f07878':'var(--tx3)'};text-align:center">${quer}</td>
            <td style="padding:5px 8px;font-size:19px;color:${VD_COR2};text-align:center;font-family:'DM Mono',monospace">${nContatos}</td>
          </tr>`;
        }).join('');
        return `<div style="background:rgba(155,109,224,.07);border:1px solid rgba(155,109,224,.25);border-radius:8px;padding:12px;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <div style="font-size:19px;font-weight:700;color:#fff">${titleNome(normNome(v.nome))}</div>
            <div style="font-family:'DM Mono',monospace;font-size:19px;color:#9b6de0;font-weight:700">${ocorrs.length}x</div>
            <div style="font-size:19px;color:${mesmoCal?'#f0c040':'#4bc87a'};margin-left:auto">${mesmoCal?'⚠ mesmo local':'locais diferentes'}</div>
          </div>
          <table style="width:100%;border-collapse:collapse;table-layout:fixed">
            <colgroup>
              <col style="width:105px">
              <col>
              <col style="width:95px">
              <col style="width:80px">
            </colgroup>
            <thead><tr>
              <th style="text-align:left;padding:4px 8px;font-size:19px;color:var(--tx3);font-weight:600;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,.08)">Data</th>
              <th style="text-align:left;padding:4px 8px;font-size:19px;color:var(--tx3);font-weight:600;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,.08)">Bairro</th>
              <th style="text-align:center;padding:4px 8px;font-size:19px;color:var(--tx3);font-weight:600;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,.08)">Quer visita</th>
              <th style="text-align:center;padding:4px 8px;font-size:19px;color:var(--tx3);font-weight:600;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,.08)">Contatos</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
      }).join('');

      return `<div style="grid-column:1/-1;background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid #9b6de0;border-radius:10px;padding:16px">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#9b6de0;margin-bottom:4px">Reiterações</div>
        <div style="font-size:19px;color:#ffffff;margin-bottom:14px">${reiterantes.length} vítima(s) com mais de 1 ocorrência registrada</div>
        ${cards}
      </div>`;
    })();

    // ── Evolução mensal: 3 séries ──
    const evoBase = (prodRaw.visitaSolidaria || [])
      .filter(r => !prodSelAno || r.ano === prodSelAno)
      .filter(r => !pdSelCia || normCiaDisp(r.cia) === normCiaDisp(pdSelCia));
    const evoAgg = {};
    mesesDisp.forEach(m => evoAgg[m] = { quer: 0, nao: 0, acomp: 0 });
    evoBase.filter(r => pdMeses.some(m => m.toLowerCase() === (r.mes||'').toLowerCase())).forEach(r => {
      const mk = MES_ORD.find(x => x.toLowerCase() === (r.mes||'').toLowerCase()) || '';
      if (!mk || !evoAgg[mk]) return;
      if (simRx.test((r.quer_acompanhamento||'').trim())) evoAgg[mk].quer++;
      if (naoRx.test((r.quer_acompanhamento||'').trim())) evoAgg[mk].nao++;
      if (vsFields.some(f => r[f] && r[f].trim())) evoAgg[mk].acomp++;
    });
    const evoLabels = mesesDisp.map(m => m.slice(0,3));
    const evoQuer  = mesesDisp.map(m => evoAgg[m]?.quer  || 0);
    const evoNao   = mesesDisp.map(m => evoAgg[m]?.nao   || 0);
    const evoAcomp = mesesDisp.map(m => evoAgg[m]?.acomp || 0);
    const hasEvo   = [...evoQuer,...evoNao,...evoAcomp].some(v=>v>0);

    // ── Monta HTML do bloco VS ──
    const maxP = topParent[0]?.[1] || 1;
    const maxB = topBairros[0]?.[1] || 1;

    const vsHtml = `
      <div style="grid-column:1/-1;border-top:1px solid var(--bd2);margin-top:8px;padding-top:18px">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${VD_COR2};margin-bottom:14px">Visita Solidária — Acompanhamento</div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
          ${mkpi('Querem Visita', vsQuer.toLocaleString('pt-BR'), 'aceitaram', '#4bc87a')}
          ${mkpi('Não Querem', vsNaoQuer.toLocaleString('pt-BR'), 'recusaram', '#f07878')}
          ${mkpi('Acompanhadas', vsAcompanhados.toLocaleString('pt-BR'), `${vsTotalContatos} contatos`, VD_COR2)}
          ${mkpi('Med. Protetiva', vsMedProt.toLocaleString('pt-BR'), 'possuem atualmente', '#f0c040')}
          <div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${gaugeColor};border-radius:8px;padding:12px 14px;min-width:110px;flex:1">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${gaugeColor};margin-bottom:5px">% Acompanhamento</div>
            <div style="font-family:'DM Mono',monospace;font-size:24px;font-weight:700;color:${gaugeColor};line-height:1">${vsPctAcomp !== null ? vsPctAcomp+'%' : '—'}</div>
            <div style="background:rgba(255,255,255,.06);border-radius:3px;height:4px;margin-top:8px"><div style="height:100%;width:${Math.min(vsPctAcomp||0,100)}%;background:${gaugeColor};border-radius:3px"></div></div>
            <div style="font-size:19px;color:#ffffff;margin-top:4px">${vsAcompanhados} de ${totVDModal} ocorrências VD</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:16px">
          ${topParent.length ? `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${VD_COR2};border-radius:8px;padding:14px 16px">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${VD_COR2};margin-bottom:10px">Parentesco do Agressor</div>
            ${topParent.map(([p,v])=>mkBar(p,v,maxP,VD_COR2)).join('')}
          </div>` : ''}
          ${topBairros.length ? `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid #5a9de0;border-radius:8px;padding:14px 16px">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#5a9de0;margin-bottom:10px">Bairros com Mais Ocorrências</div>
            ${topBairros.map(([b,v])=>mkBar(b,v,maxB,'#5a9de0')).join('')}
          </div>` : ''}
          ${avgIntvs.some(v=>v!==null) ? `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid #f0c040;border-radius:8px;padding:14px 16px">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#f0c040;margin-bottom:4px">Intervalo Médio entre Contatos</div>
            <div style="font-size:19px;color:#ffffff;margin-bottom:10px">dias entre cada etapa da visita solidária</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${['1ª→2ª','2ª→3ª','3ª→4ª','4ª→5ª','5ª→6ª'].map((lbl,i)=>avgIntvs[i]!==null?`<div style="text-align:center;flex:1;min-width:52px">
                <div style="font-family:'DM Mono',monospace;font-size:20px;font-weight:700;color:#f0c040">${avgIntvs[i]}</div>
                <div style="font-size:19px;color:#ffffff;margin-top:2px">dias</div>
                <div style="font-size:19px;color:#ffffff;margin-top:1px">${lbl}</div>
              </div>`:''  ).join('')}
            </div>
          </div>` : ''}
        </div>

        ${reiterHtml}

        <div style="margin-top:16px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${VD_COR2};margin-bottom:10px">Evolução Mensal — Visita Solidária</div>
          ${hasEvo ? `<div style="position:relative;height:300px"><canvas id="vs-modal-evo" style="height:300px"></canvas></div>` : `<div style="color:#ffffff;font-size:19px">Sem dados para o período.</div>`}
        </div>
      </div>`;

    // Injeta o bloco no modal
    const pdChartsEl = document.getElementById('pd-charts');
    if (pdChartsEl) pdChartsEl.insertAdjacentHTML('beforeend', vsHtml);

    if (hasEvo) {
      requestAnimationFrame(() => {
        const ctx = document.getElementById('vs-modal-evo')?.getContext('2d');
        if (!ctx) return;
        pdChs.push(new Chart(ctx, {
          type: 'line',
          data: {
            labels: evoLabels,
            datasets: [
              { label: 'Querem acomp.', data: evoQuer,  borderColor:'#4bc87a', backgroundColor:'#4bc87a22', borderWidth:2, fill:false, tension:0.4, pointRadius:5, pointBackgroundColor:'#4bc87a' },
              { label: 'Não querem',    data: evoNao,   borderColor:'#f07878', backgroundColor:'#f0787822', borderWidth:2, fill:false, tension:0.4, pointRadius:5, pointBackgroundColor:'#f07878' },
              { label: 'Acompanhadas',  data: evoAcomp, borderColor:VD_COR2,   backgroundColor:VD_COR2+'22', borderWidth:2, fill:false, tension:0.4, pointRadius:5, pointBackgroundColor:VD_COR2 },
            ]
          },
          options: {
            responsive:true, maintainAspectRatio:false,
            plugins: {
              legend: { display:true, labels:{ color:'#ffffff', font:{size:19}, boxWidth:14, padding:18 } },
              tooltip: { callbacks:{ label: i => ` ${i.dataset.label}: ${i.raw.toLocaleString('pt-BR')}` } }
            },
            scales: {
              x: { grid:GR, ticks:{ color:'#ffffff', font:{size:19} } },
              y: { grid:GR, beginAtZero:true, ticks:{ color:'#ffffff', font:{size:19} } }
            }
          }
        }));
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Indicadores de Qualidade P3
// ---------------------------------------------------------------------------

async function loadIndicadoresP3() {
  try {
    const res = await authFetch(`${API}/indicadores-p3`);
    if (!res.ok) return;
    iqData = await res.json();
    renderIndicadoresP3();
  } catch(e) { /* silencia — tabela pode não existir ainda */ }
  loadIqCalculado();
}

async function loadIqCalculado() {
  try {
    const res = await authFetch(`${API}/indicadores-p3/calculado`);
    if (!res.ok) return;
    iqCalculadoData = await res.json();
    renderIqHistorico();
  } catch(e) {}
}

function toggleIqProdFiltro(key) {
  iqProdFiltro = key;
  renderIqHistorico();
}

function toggleIqCrimeFiltro(key) {
  iqCrimeFiltro = key;
  renderIqHistorico();
}

function renderIqHistorico() {
  iqHistCharts.forEach(c => { try { c.destroy(); } catch(e){} });
  iqHistCharts = [];

  const el = document.getElementById('iq-historico-section');
  if (!el) return;

  const anosCalc = iqCalculadoData.map(r => r.ano).filter(a => !IQ_HISTORICO_ANOS.includes(a) && a !== 2025);
  const anos = [...IQ_HISTORICO_ANOS, ...anosCalc].sort();

  const getVal = (c, ano) => {
    if (IQ_HISTORICO_ANOS.includes(ano)) {
      const v = IQ_HISTORICO[c.key]?.[ano] ?? null;
      if (v === null) return null;
      return c.fatorInv != null ? Math.round(v * c.fatorInv) : v;
    }
    const calc = iqCalculadoData.find(r => r.ano === ano);
    return calc ? (calc[c.key] ?? null) : null;
  };

  const fmtVal = (v, unit) => {
    if (v === null) return '—';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + (unit ? ' ' + unit : '');
  };

  // ── Tabela ─────────────────────────────────────────────────────────────
  const headerCells = anos.map(a => {
    const isCalc = !IQ_HISTORICO_ANOS.includes(a);
    return `<th style="padding:8px 14px;border-bottom:1px solid var(--bd);text-align:right;font-family:'DM Mono',monospace;font-size:19px;color:${isCalc ? '#5a9de0' : 'var(--tx3)'};${isCalc ? 'background:rgba(90,157,224,.06)' : ''}">${a}${isCalc ? ' ●' : ''}</th>`;
  }).join('');

  const tableRows = IQ_AUTO_CAMPOS.map(c => {
    const vals = anos.map(a => getVal(c, a));
    const cells = vals.map((v, i) => {
      const isCalc = !IQ_HISTORICO_ANOS.includes(anos[i]);
      const bg = isCalc ? 'background:rgba(90,157,224,.04)' : '';
      if (v === null) return `<td style="padding:7px 14px;border-bottom:1px solid rgba(255,255,255,.03);text-align:right;color:var(--tx3);${bg}">—</td>`;
      const prev = vals.slice(0, i).reverse().find(x => x !== null) ?? null;
      let trend = '';
      if (prev !== null && v !== prev) {
        const melhorou = c.melhor === 'maior' ? v > prev : v < prev;
        trend = melhorou ? ' <span style="color:#5ae09a;font-size:19px">▲</span>' : ' <span style="color:#f07878;font-size:19px">▼</span>';
      }
      return `<td style="padding:7px 14px;border-bottom:1px solid rgba(255,255,255,.03);text-align:right;font-family:'DM Mono',monospace;font-size:19px;color:var(--tx);${bg}">${fmtVal(v, c.unit)}${trend}</td>`;
    }).join('');
    const autoBadge = c.auto ? `<span style="font-size:19px;background:rgba(90,157,224,.15);color:#5a9de0;border-radius:3px;padding:1px 5px;margin-left:6px;font-family:'DM Mono',monospace">AUTO</span>` : '';
    return `<tr><td style="padding:7px 14px;border-bottom:1px solid rgba(255,255,255,.03);color:${c.cor};font-size:19px;white-space:nowrap">${c.label}${autoBadge}</td>${cells}</tr>`;
  }).join('');

  // ── Grupos para gráficos ───────────────────────────────────────────────
  const CRIMES_CAMPOS  = IQ_AUTO_CAMPOS.filter(c => ['homicidio_doloso','latrocinio','roubo_outros','roubo_veiculo','furto_veiculo'].includes(c.key));
  const PROD_CAMPOS    = IQ_AUTO_CAMPOS.filter(c => ['armas_apreendidas','flagrantes_pm','pessoas_presas','menores_presos','procurados'].includes(c.key));
  const CRIMES_ATIVOS = iqCrimeFiltro ? CRIMES_CAMPOS.filter(c => c.key === iqCrimeFiltro) : CRIMES_CAMPOS;
  const PROD_ATIVOS = iqProdFiltro ? PROD_CAMPOS.filter(c => c.key === iqProdFiltro) : PROD_CAMPOS;

  const crimeFiltroHtml = `<select onchange="toggleIqCrimeFiltro(this.value)"
    style="background:var(--bg2);color:var(--tx1);border:1px solid var(--bd2);border-radius:6px;padding:5px 10px;font-size:19px;font-family:'DM Mono',monospace;cursor:pointer">
    <option value="" style="background:#111;color:#fff">Todas as ocorrências</option>
    ${CRIMES_CAMPOS.map(c => `<option value="${c.key}"${iqCrimeFiltro === c.key ? ' selected' : ''} style="background:#111;color:#fff">${c.label}</option>`).join('')}
  </select>`;

  const prodFiltroHtml = `<select onchange="toggleIqProdFiltro(this.value)"
    style="background:var(--bg2);color:var(--tx1);border:1px solid var(--bd2);border-radius:6px;padding:5px 10px;font-size:19px;font-family:'DM Mono',monospace;cursor:pointer">
    <option value="" style="background:#111;color:#fff">Todas as ocorrências</option>
    ${PROD_CAMPOS.map(c => `<option value="${c.key}"${iqProdFiltro === c.key ? ' selected' : ''} style="background:#111;color:#fff">${c.label}</option>`).join('')}
  </select>`;



  // ── Render ─────────────────────────────────────────────────────────────
  el.innerHTML = `
    <div class="card" style="margin-top:16px">
      <div class="card-head" style="flex-wrap:wrap;gap:8px">
        <div class="card-title">Indicadores Históricos</div>
        <span style="font-size:19px;color:var(--tx3);font-family:'DM Mono',monospace">● azul = calculado do banco &nbsp;|&nbsp; AUTO = cálculo automático</span>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="text-align:left;padding:8px 14px;border-bottom:1px solid var(--bd);font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);white-space:nowrap">Indicador</th>
            ${headerCells}
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
      <div class="card">
        <div class="card-head"><div class="card-title">Tendência — Criminalidade</div></div>
        <div style="margin-bottom:12px">${crimeFiltroHtml}</div>
        <canvas id="iq-h-crimes" style="height:260px;max-height:260px"></canvas>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Tendência — Produtividade</div></div>
        <div style="margin-bottom:12px">${prodFiltroHtml}</div>
        <canvas id="iq-h-prod" style="height:260px;max-height:260px"></canvas>
      </div>
    </div>

  `;

  // Gráfico crimes
  const crimeEl = document.getElementById('iq-h-crimes');
  if (crimeEl) iqHistCharts.push(new Chart(crimeEl.getContext('2d'), {
    type: 'line',
    data: { labels: anos, datasets: CRIMES_ATIVOS.map(c => ({
      label: c.label, data: anos.map(a => getVal(c, a)),
      borderColor: c.cor, backgroundColor: 'transparent', tension: 0.3, pointRadius: 5, borderWidth: 2
    }))},
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#fff', font: { size: 19 }, boxWidth: 14, padding: 16 } } },
      scales: { x: { grid: GR, ticks: { color: '#fff', font: { size: 19 } } }, y: { grid: GR, ticks: { color: '#fff', font: { size: 19 } }, beginAtZero: true } }
    }
  }));

  // Gráfico produtividade
  const prodEl = document.getElementById('iq-h-prod');
  if (prodEl) iqHistCharts.push(new Chart(prodEl.getContext('2d'), {
    type: 'bar',
    data: { labels: anos, datasets: PROD_ATIVOS.map(c => ({
      label: c.label, data: anos.map(a => getVal(c, a)),
      backgroundColor: c.cor + 'aa', borderColor: c.cor, borderWidth: 1, borderRadius: 3
    }))},
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#fff', font: { size: 19 }, boxWidth: 14, padding: 16 } } },
      scales: { x: { grid: GR, ticks: { color: '#fff', font: { size: 19 } } }, y: { grid: GR, ticks: { color: '#fff', font: { size: 19 } }, beginAtZero: true } }
    }
  }));
}

function iqDestroyCharts() {
  iqCharts.forEach(c => { try { c.destroy(); } catch(e){} });
  iqCharts = [];
}

function renderIndicadoresP3() {
  const el = document.getElementById('iq-section');
  if (!el) return;

  const user    = JSON.parse(localStorage.getItem('auth_user') || '{}');
  const canEdit = ['admin','p3','ti'].includes(user.role);
  const hoje    = new Date();
  const anoAtual  = hoje.getFullYear();
  const mesAtual  = MES_ORD[hoje.getMonth()];
  const diaAtual  = hoje.getDate();

  const dadosAno         = iqData.filter(r => r.ano === anoAtual);
  const mesesPreenchidos = new Set(dadosAno.map(r => r.mes));
  const regMesAtual      = dadosAno.find(r => r.mes === mesAtual);

  // ── Banner de cobrança ─────────────────────────────────────────────────
  let bannerHtml = '';
  if (!regMesAtual) {
    const atrasado = diaAtual > IQ_PRAZO_DIA;
    const cor = atrasado ? '#e05555' : '#e0c05a';
    const bg  = atrasado ? 'rgba(230,100,100,.10)' : 'rgba(224,192,90,.10)';
    const bd  = atrasado ? 'rgba(230,100,100,.30)' : 'rgba(224,192,90,.30)';
    const icn = atrasado ? '🔴' : '⚠️';
    const txt = atrasado
      ? `Prazo encerrado — indicadores de <strong>${mesAtual} ${anoAtual}</strong> ainda não foram preenchidos. Cobrar a seção P3.`
      : `Indicadores de <strong>${mesAtual} ${anoAtual}</strong> ainda não foram preenchidos. Prazo: dia ${IQ_PRAZO_DIA}.`;
    bannerHtml = `<div style="padding:12px 16px;border-radius:8px;border:1px solid ${bd};background:${bg};color:${cor};font-size:19px;margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:19px">${icn}</span>
      <span style="flex:1">${txt}</span>
      ${canEdit ? `<button onclick="openIqMo('${mesAtual}',${anoAtual})" style="padding:5px 14px;background:${cor};color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:19px;font-weight:700;white-space:nowrap">Preencher agora</button>` : ''}
    </div>`;
  } else {
    const dt   = regMesAtual.preenchido_em ? new Date(regMesAtual.preenchido_em) : null;
    const dtStr = dt ? `${dt.getDate().toString().padStart(2,'0')}/${(dt.getMonth()+1).toString().padStart(2,'0')} às ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}` : '';
    const quem = regMesAtual.preenchido_por || '';
    bannerHtml = `<div style="padding:12px 16px;border-radius:8px;border:1px solid rgba(61,191,122,.30);background:rgba(61,191,122,.08);color:#5ae09a;font-size:19px;margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:19px">✅</span>
      <span style="flex:1">Indicadores de <strong>${mesAtual} ${anoAtual}</strong> preenchidos${dtStr ? ` em ${dtStr}` : ''}${quem ? ` por <strong>${quem}</strong>` : ''}.</span>
      ${canEdit ? `<button onclick="openIqMo('${mesAtual}',${anoAtual})" style="padding:5px 14px;background:rgba(61,191,122,.2);color:#5ae09a;border:1px solid rgba(61,191,122,.3);border-radius:5px;cursor:pointer;font-size:19px">Editar</button>` : ''}
    </div>`;
  }

  // ── Meses sem dados ────────────────────────────────────────────────────
  const mesIdx       = MESES.indexOf(mesAtual);
  const mesesPassados = MESES.slice(0, mesIdx).filter(m => !mesesPreenchidos.has(m));
  const alertFalta   = mesesPassados.length
    ? `<div style="padding:10px 16px;border-radius:8px;border:1px solid rgba(230,100,100,.2);background:rgba(230,100,100,.06);color:#f07878;font-size:19px;margin-bottom:14px">
        <strong>Meses sem dados em ${anoAtual}:</strong> ${mesesPassados.join(', ')}
      </div>`
    : '';

  // ── KPI cards do mês atual ─────────────────────────────────────────────
  const mesAnteriorIdx = mesIdx - 1;
  const regAnterior    = mesAnteriorIdx >= 0 ? dadosAno.find(r => r.mes === MESES[mesAnteriorIdx]) : null;
  const kpiCards = IQ_CAMPOS.map(c => {
    const val    = regMesAtual ? regMesAtual[c.key] : null;
    const valAnt = regAnterior ? regAnterior[c.key] : null;
    let tendHtml = '';
    if (val != null && valAnt != null && val !== valAnt) {
      const up   = val > valAnt;
      const diff = Math.abs(val - valAnt).toLocaleString('pt-BR');
      tendHtml   = `<span style="font-size:19px;color:${up ? '#5ae09a' : '#f07878'}">${up ? '▲' : '▼'} ${diff}</span>`;
    }
    const valStr = val != null ? val.toLocaleString('pt-BR') + (c.unit ? ' ' + c.unit : '') : '—';
    return `<div style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid ${c.cor};border-radius:8px;padding:14px">
      <div style="font-size:19px;color:var(--tx3);font-family:'DM Mono',monospace;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;line-height:1.3">${c.label}</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:30px;font-weight:800;color:${c.cor};line-height:1">${valStr}</div>
      <div style="margin-top:6px;min-height:18px">${tendHtml}</div>
    </div>`;
  }).join('');

  // ── Gráficos (só se houver dados) ─────────────────────────────────────
  const temDados = dadosAno.length > 0;
  const chartsHtml = temDados ? `
    <div class="card" style="margin-top:16px">
      <div class="card-head"><div class="card-title">Evolução Mensal dos Indicadores</div></div>
      <canvas id="iq-c-linha" style="height:300px;max-height:300px"></canvas>
    </div>
    <div class="g2" style="margin-top:14px">
      <div class="card">
        <div class="card-head"><div class="card-title">Acumulado no Ano</div></div>
        <canvas id="iq-c-barra" style="height:260px;max-height:260px"></canvas>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Perfil do Batalhão — ${mesAtual}</div></div>
        <canvas id="iq-c-radar" style="height:260px;max-height:260px"></canvas>
      </div>
    </div>` : '';

  el.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--bd)">
        <div style="font-family:'DM Mono',monospace;font-size:19px;font-weight:700;letter-spacing:2px;color:#5a9de0;text-transform:uppercase">Indicadores de Qualidade — ${anoAtual}</div>
        ${canEdit ? `<button onclick="openIqMo('${mesAtual}',${anoAtual})" style="padding:6px 16px;background:rgba(90,157,224,.12);border:1px solid rgba(90,157,224,.3);color:#5a9de0;border-radius:6px;cursor:pointer;font-size:19px;font-weight:600">+ Preencher ${mesAtual}</button>` : ''}
      </div>
      ${bannerHtml}
      ${alertFalta}
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px">${kpiCards}</div>
    </div>
    ${chartsHtml}`;

  if (temDados) {
    iqDestroyCharts();
    renderIqLinha(dadosAno);
    renderIqBarra(dadosAno);
    renderIqRadar(dadosAno, mesAtual);
  }
}

function renderIqLinha(dados) {
  const el = document.getElementById('iq-c-linha');
  if (!el) return;
  const mesesOrdenados = MESES.filter(m => dados.find(r => r.mes === m));
  const datasets = IQ_CAMPOS.map(c => ({
    label: c.label,
    data: mesesOrdenados.map(m => { const r = dados.find(x => x.mes === m); return r ? (r[c.key] ?? null) : null; }),
    borderColor: c.cor,
    backgroundColor: 'transparent',
    tension: 0.3,
    pointRadius: 4,
    borderWidth: 2,
    spanGaps: false
  }));
  iqCharts.push(new Chart(el.getContext('2d'), {
    type: 'line',
    data: { labels: mesesOrdenados.map(m => m.slice(0,3)), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#ffffff', font: { size: 19 }, boxWidth: 12, padding: 14 } } },
      scales: {
        x: { grid: GR, ticks: { color: '#ffffff', font: { size: 19 } } },
        y: { grid: GR, ticks: { color: '#ffffff', font: { size: 19 } }, beginAtZero: true }
      }
    }
  }));
}

function renderIqBarra(dados) {
  const el = document.getElementById('iq-c-barra');
  if (!el) return;
  const campoCont = IQ_CAMPOS.filter(c => ['atendimento_vitima','conseg_ativo','bairros_pvs'].includes(c.key));
  const mesesOrdenados = MESES.filter(m => dados.find(r => r.mes === m));
  const datasets = campoCont.map(c => ({
    label: c.label,
    data: mesesOrdenados.map(m => { const r = dados.find(x => x.mes === m); return r ? (r[c.key] ?? 0) : 0; }),
    backgroundColor: c.cor + 'aa',
    borderColor: c.cor,
    borderWidth: 1,
    borderRadius: 3
  }));
  iqCharts.push(new Chart(el.getContext('2d'), {
    type: 'bar',
    data: { labels: mesesOrdenados.map(m => m.slice(0,3)), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#ffffff', font: { size: 19 }, boxWidth: 12, padding: 12 } } },
      scales: {
        x: { grid: GR, ticks: { color: '#ffffff', font: { size: 19 } } },
        y: { grid: GR, ticks: { color: '#ffffff', font: { size: 19 } }, beginAtZero: true }
      }
    }
  }));
}

function renderIqRadar(dados, mesAtual) {
  const el = document.getElementById('iq-c-radar');
  if (!el) return;
  const reg = dados.find(r => r.mes === mesAtual);
  if (!reg) return;
  const normalized = IQ_CAMPOS.map(c => {
    const maxVal = Math.max(...dados.map(r => Number(r[c.key]) || 0), 1);
    return Math.round((Number(reg[c.key]) || 0) / maxVal * 100);
  });
  iqCharts.push(new Chart(el.getContext('2d'), {
    type: 'radar',
    data: {
      labels: IQ_CAMPOS.map(c => c.label),
      datasets: [{
        label: mesAtual,
        data: normalized,
        backgroundColor: 'rgba(90,157,224,.18)',
        borderColor: '#5a9de0',
        pointBackgroundColor: '#5a9de0',
        borderWidth: 2,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#ffffff', font: { size: 19 } } } },
      scales: {
        r: {
          grid: { color: 'rgba(255,255,255,.10)' },
          angleLines: { color: 'rgba(255,255,255,.10)' },
          pointLabels: { color: '#ffffff', font: { size: 19 } },
          ticks: { display: false, beginAtZero: true, max: 100 }
        }
      }
    }
  }));
}

// Helpers de bloqueio
function iqIsMesPassado(mes, ano) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = MES_ORD[hoje.getMonth()];
  if (Number(ano) < anoAtual) return true;
  if (Number(ano) > anoAtual) return false;
  return MESES.indexOf(mes) < MESES.indexOf(mesAtual);
}
function iqIsDesbloqueado(r) {
  return r.desbloqueado_ate && new Date(r.desbloqueado_ate) > new Date();
}
async function iqDesbloquear(mes, ano) {
  if (!confirm(`Desbloquear ${mes} ${ano} para edição por 24 horas?`)) return;
  const res = await authFetch(`${API}/indicadores-p3/desbloquear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mes, ano })
  });
  const data = await res.json();
  if (!res.ok) { alert(data.error); return; }
  await loadIndicadoresP3();
}

// Modal
let iqMoMes = '', iqMoAno = 0;

function iqMoFillCampos() {
  const existente = iqData.find(r => r.mes === iqMoMes && r.ano === iqMoAno);
  IQ_CAMPOS.forEach(c => {
    const inp = document.getElementById(`iq-inp-${c.key}`);
    if (inp) inp.value = existente && existente[c.key] != null ? existente[c.key] : '';
  });
  const badge = document.getElementById('iq-mo-badge');
  if (badge) badge.textContent = existente ? '✎ Editar registro existente' : '+ Novo registro';
  document.getElementById('iq-mo-msg').textContent = '';
}

function openIqMo(mes, ano) {
  iqMoMes = mes; iqMoAno = Number(ano);
  document.getElementById('iq-mo-msg').textContent = '';

  const anoAtual = new Date().getFullYear();
  const anos = [...new Set([anoAtual - 1, anoAtual, anoAtual + 1, ...iqData.map(r => r.ano)])].sort();
  const mesOpts  = MES_ORD.map(m => `<option value="${m}" ${m === iqMoMes ? 'selected' : ''}>${m}</option>`).join('');
  const anoOpts  = anos.map(a => `<option value="${a}" ${a === iqMoAno ? 'selected' : ''}>${a}</option>`).join('');

  document.getElementById('iq-mo-body').innerHTML =
    `<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--bd)">
      <div>
        <label style="font-size:19px;color:var(--tx3);font-family:'DM Mono',monospace;display:block;margin-bottom:4px;text-transform:uppercase">Mês</label>
        <select id="iq-sel-mes" onchange="iqMoMes=this.value;iqMoFillCampos()" style="background:var(--s2);border:1px solid var(--bd2);color:var(--tx);padding:6px 10px;border-radius:5px;font-size:19px;cursor:pointer">${mesOpts}</select>
      </div>
      <div>
        <label style="font-size:19px;color:var(--tx3);font-family:'DM Mono',monospace;display:block;margin-bottom:4px;text-transform:uppercase">Ano</label>
        <select id="iq-sel-ano" onchange="iqMoAno=+this.value;iqMoFillCampos()" style="background:var(--s2);border:1px solid var(--bd2);color:var(--tx);padding:6px 10px;border-radius:5px;font-size:19px;cursor:pointer">${anoOpts}</select>
      </div>
      <div id="iq-mo-badge" style="margin-top:18px;font-size:19px;color:var(--tx3);font-family:'DM Mono',monospace"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px">` +
    IQ_CAMPOS.map(c => `
      <div>
        <label style="font-size:19px;color:var(--tx3);font-family:'DM Mono',monospace;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">${c.label}${c.unit ? ' (' + c.unit + ')' : ''}</label>
        <input id="iq-inp-${c.key}" type="number" min="0" step="any"
          style="width:100%;background:var(--s2);border:1px solid var(--bd2);color:var(--tx);padding:7px 10px;border-radius:5px;font-size:19px;box-sizing:border-box">
      </div>`).join('') +
    `</div>`;

  iqMoFillCampos();
  document.getElementById('iq-mo').style.display = 'flex';
}

function closeIqMo() {
  document.getElementById('iq-mo').style.display = 'none';
}

function iqMoClickOut(e) {
  if (e.target === document.getElementById('iq-mo')) closeIqMo();
}

async function iqSave() {
  const body = { mes: iqMoMes, ano: iqMoAno };
  IQ_CAMPOS.forEach(c => {
    const v = document.getElementById(`iq-inp-${c.key}`)?.value.trim();
    body[c.key] = (v !== '' && v != null) ? Number(v) : null;
  });
  const msgEl = document.getElementById('iq-mo-msg');
  try {
    const res = await authFetch(`${API}/indicadores-p3`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    msgEl.style.color = '#5ae09a';
    msgEl.textContent = 'Dados salvos com sucesso!';
    await loadIndicadoresP3();
    setTimeout(closeIqMo, 800);
  } catch (err) {
    msgEl.style.color = '#f07878';
    msgEl.textContent = err.message;
  }
}

// ---------------------------------------------------------------------------
// Disque Denúncia
// ---------------------------------------------------------------------------

const DD_CIAS    = ['1ª Cia PM', '2ª Cia PM', '3ª Cia PM', 'FT'];
const DD_STATUS  = ['Andamento', 'Averiguada com Êxito', 'Averiguada sem Êxito', 'Sem Averiguação'];
const DD_STATUS_COR = {
  'Andamento':              '#f7d060',
  'Averiguada com Êxito':   '#5ae09a',
  'Averiguada sem Êxito':   '#e08a5a',
  'Sem Averiguação':        '#f07878',
};
const ddNorm = s => (s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
// classifica o status pelo conteúdo, independente de acento, case ou prefixo
const ddClassStatus = s => {
  const n = ddNorm(s);
  if (n.includes('exito') && (n.includes(' com') || n.startsWith('com'))) return 'Averiguada com Êxito';
  if (n.includes('exito') && (n.includes(' sem') || n.startsWith('sem'))) return 'Averiguada sem Êxito';
  if (n.includes('andamento')) return 'Andamento';
  if (n.includes('sem') && n.includes('aver')) return 'Sem Averiguação';
  return s; // mantém original se não reconhecer
};
const ddStatusMatch = (stored, expected) => ddClassStatus(stored) === expected;
const ddStatusCor = s => DD_STATUS_COR[ddClassStatus(s)] || '#aaa';

let ddData        = [];
let ddAnoFiltro   = new Date().getFullYear();
let ddMesFiltro   = []; // array de nomes de meses, vazio = todos
let ddCiaFiltro   = '';
let ddEditId      = null;
let ddChart  = null;
let ddChart2 = null;
let ddChart3 = null;
let ddChart4 = null;
let ddChart5 = null;
let ddChart6 = null;
let ddDonutHidden = new Set();
let _ddDrillChart  = null;
let _ddDrillCiaIdx = null;

async function loadDDData() {
  try {
    const res = await authFetch(`${API}/disque-denuncia?ano=${ddAnoFiltro}`);
    if (!res.ok) return;
    ddData = await res.json();
    // atualiza KPI na grade se estiver visível
    const kpiEl = document.getElementById('dd-kpi-card');
    if (kpiEl) kpiEl.outerHTML = renderDDKpi();
    // atualiza modal se estiver aberto
    if (document.getElementById('dd-detail-mo').classList.contains('on')) renderDDSection();
  } catch(e) { console.error('loadDDData:', e); }
}

function renderDDKpi() {
  // Aplica filtro de meses apenas quando mês específico está selecionado
  // (quando "Todos" está ativo, prodSelMeses só contém meses com dados de prod —
  //  DD pode ter meses extras, então nesse caso mostramos todo o ddData)
  const mesesDisp = prodGetMesesDisp ? prodGetMesesDisp(prodSelAno) : [];
  const allMesesSel = !prodSelMeses.length || prodSelMeses.length === mesesDisp.length;
  const base = allMesesSel ? ddData : ddData.filter(r => {
    const d = new Date(r.data + 'T00:00:00');
    return prodSelMeses.includes(MES_ORD[d.getMonth()]);
  });
  const total = base.length;
  const periodoLbl = allMesesSel
    ? 'Acumulado ' + ddAnoFiltro
    : prodSelMeses.map(m => m.slice(0,3)).join(', ') + ' ' + ddAnoFiltro;
  return `<div id="dd-kpi-card" class="kpi" onclick="openDDDetail()" title="Clique para detalhes" style="cursor:pointer">
    <div class="kpi-top" style="background:#5a9de0"></div>
    <div class="kpi-lbl">Disque Denúncia</div>
    <div class="kpi-val" style="color:#5a9de0">${total.toLocaleString('pt-BR')}</div>
    <div class="kpi-sub">${periodoLbl}</div>
    <div class="kpi-hint">▸ clique p/ detalhes</div>
  </div>`;
}

function openDDDetail() {
  const mo = document.getElementById('dd-detail-mo');
  mo.classList.add('on');
  renderDDSection();
}

function closeDDDetail() {
  document.getElementById('dd-detail-mo').classList.remove('on');
  [ddChart, ddChart2, ddChart3, ddChart4, ddChart5, ddChart6].forEach(ch => { if (ch) { try { ch.destroy(); } catch(e){} } });
  ddChart = ddChart2 = ddChart3 = ddChart4 = ddChart5 = ddChart6 = null;
  if (_ddDrillChart) { try { _ddDrillChart.destroy(); } catch(e){} _ddDrillChart = null; }
  _ddDrillCiaIdx = null;
  ddDonutHidden = new Set();
  const extTt = document.getElementById('dd-donut-ext-tt');
  if (extTt) extTt.remove();
}

function ddDetailClickOut(e) {
  if (e.target === document.getElementById('dd-detail-mo')) closeDDDetail();
}

function ddFiltrados() {
  return ddData.filter(r => {
    if (ddMesFiltro.length) {
      const nomeMes = MES_ORD[new Date(r.data + 'T00:00:00').getMonth()];
      if (!ddMesFiltro.includes(nomeMes)) return false;
    }
    if (ddCiaFiltro && r.cia !== ddCiaFiltro) return false;
    return true;
  });
}

function renderDDSection() {
  [ddChart, ddChart2, ddChart3, ddChart4, ddChart5, ddChart6].forEach(ch => { if (ch) { try { ch.destroy(); } catch(e){} } });
  ddChart = ddChart2 = ddChart3 = ddChart4 = ddChart5 = ddChart6 = null;

  const el = document.getElementById('dd-detail-body');
  if (!el) return;
  const _role   = currentRole();
  const canEdit = ['admin','p3','ti'].includes(_role);
  const canDel  = ['admin','p3'].includes(_role);

  const registros = ddFiltrados();
  const todos     = ddData;

  const total       = registros.length;
  const exito       = registros.filter(r => ddStatusMatch(r.status, 'Averiguada com Êxito')).length;
  const semExito    = registros.filter(r => ddStatusMatch(r.status, 'Averiguada sem Êxito')).length;
  const andamento   = registros.filter(r => ddStatusMatch(r.status, 'Andamento')).length;
  const semAver     = registros.filter(r => ddStatusMatch(r.status, 'Sem Averiguação')).length;
  const averiguadas = exito + semExito;
  const pctAver     = total > 0 ? ((averiguadas / total) * 100).toFixed(1) : '—';
  const flagrantes  = registros.filter(r => r.flagrante).length;
  const presos      = registros.reduce((s, r) => s + (Number(r.quant_presos) || 0), 0);
  const presosPerDD = averiguadas > 0 ? (presos / averiguadas).toFixed(2) : '—';
  const pctExito    = averiguadas > 0 ? ((exito / averiguadas) * 100).toFixed(1) : '—';

  const kpis = [
    { label: 'Total Recebidas',        val: total,       cor: '#5a9de0' },
    { label: 'Averiguada c/ Êxito',    val: exito,       cor: '#5ae09a' },
    { label: 'Averiguada s/ Êxito',    val: semExito,    cor: '#e08a5a' },
    { label: 'Sem Averiguação',        val: semAver,     cor: '#f07878' },
    { label: 'Com Flagrante',          val: flagrantes,  cor: '#9b6de0' },
    { label: 'Total Presos',           val: presos,      cor: '#e05555' },
  ].map(k => `<div style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid ${k.cor};border-radius:8px;padding:14px">
    <div style="font-size:19px;color:#fff;font-family:'DM Mono',monospace;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;line-height:1.3">${k.label}</div>
    <div style="font-family:'Barlow Condensed',sans-serif;font-size:30px;font-weight:800;color:${k.cor};line-height:1">${k.val}</div>
  </div>`).join('');

  const MESES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const getMes = r => new Date(r.data + 'T00:00:00').getMonth();
  // Evolução mensal: respeita filtro de CIA mas não de mês (para mostrar todos os meses)
  const evolBase = ddCiaFiltro ? todos.filter(r => r.cia === ddCiaFiltro) : todos;
  const evolDatasets = [
    { label: 'Averiguada s/ Êxito', status: 'Averiguada sem Êxito', cor: '#e08a5a' },
    { label: 'Sem Averiguação',     status: 'Sem Averiguação',       cor: '#9b6de0' },
    { label: 'Averiguada c/ Êxito', status: 'Averiguada com Êxito', cor: '#5ae09a' },
  ].map(d => ({
    label: d.label,
    data: MESES_LABEL.map((_, i) => evolBase.filter(r => getMes(r) === i && ddStatusMatch(r.status, d.status)).length),
    backgroundColor: d.cor + 'bb',
    borderColor: d.cor,
    borderWidth: 1,
    borderRadius: 3,
    stack: 's',
    yAxisID: 'y',
  }));

  const rankingRows = DD_CIAS.map(cia => {
    const ciaDados = registros.filter(r => r.cia === cia);
    const cTotal   = ciaDados.length;
    const cAver    = ciaDados.filter(r => ddStatusMatch(r.status,'Averiguada com Êxito') || ddStatusMatch(r.status,'Averiguada sem Êxito')).length;
    const cExito   = ciaDados.filter(r => ddStatusMatch(r.status, 'Averiguada com Êxito')).length;
    const cPresos  = ciaDados.reduce((s, r) => s + (Number(r.quant_presos) || 0), 0);
    const cPct     = cTotal > 0 ? ((cAver / cTotal) * 100).toFixed(0) + '%' : '—';
    return { cia, cTotal, cAver, cExito, cPresos, cPct };
  }).sort((a, b) => b.cTotal - a.cTotal);

  const thR = 'padding:9px 14px;border-bottom:1px solid var(--bd);font-family:"DM Mono",monospace;font-size:19px;color:var(--tx3);text-transform:uppercase;letter-spacing:1px';
  const tdR = 'padding:9px 14px;border-bottom:1px solid rgba(255,255,255,.04);font-size:19px;color:var(--tx2)';
  const rankingHtml = rankingRows.length ? `
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="${thR};text-align:left">Cia</th>
        <th style="${thR};text-align:center">Total</th>
        <th style="${thR};text-align:center">Averiguadas</th>
        <th style="${thR};text-align:center">% Aver.</th>
        <th style="${thR};text-align:center">Av. c/ Êxito</th>
        <th style="${thR};text-align:center">Presos</th>
      </tr></thead>
      <tbody>${rankingRows.map(r => `<tr>
        <td style="${tdR};font-weight:600;color:var(--tx)">${r.cia}</td>
        <td style="${tdR};text-align:center">${r.cTotal}</td>
        <td style="${tdR};text-align:center">${r.cAver}</td>
        <td style="${tdR};text-align:center;color:#c8a84b">${r.cPct}</td>
        <td style="${tdR};text-align:center;color:#5ae09a">${r.cExito}</td>
        <td style="${tdR};text-align:center;color:#e05555">${r.cPresos}</td>
      </tr>`).join('')}</tbody>
    </table>` : `<div style="color:var(--tx3);font-size:19px;padding:12px">Sem dados para o filtro selecionado.</div>`;

  // Funil de Efetividade
  const funilMax = total || 1;
  const funilSteps = [
    { label: 'Denúncias Recebidas', val: total,       cor: '#5a9de0', sub: '100% do total' },
    { label: 'Averiguadas',          val: averiguadas, cor: '#c8a84b', sub: total > 0 ? ((averiguadas/total)*100).toFixed(0)+'% das recebidas' : '—' },
    { label: 'Com Flagrante',        val: flagrantes,  cor: '#9b6de0', sub: total > 0 ? ((flagrantes/total)*100).toFixed(0)+'% das recebidas' : '—' },
    { label: 'Pessoas Presas',       val: presos,      cor: '#e05555', sub: flagrantes > 0 ? (presos/flagrantes).toFixed(1)+' presos/flagrante' : '—' },
  ];
  const funilHtml = funilSteps.map((s, i) => {
    const barPct = Math.max(8, (s.val / funilMax) * 100);
    const arrow  = i < funilSteps.length - 1
      ? `<div style="text-align:center;color:var(--tx3);font-size:19px;padding:3px 0;letter-spacing:1px">▼ ${funilSteps[i+1].sub}</div>`
      : '';
    return `
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:5px">
          <span style="font-size:19px;color:#fff;font-family:'DM Mono',monospace;text-transform:uppercase;letter-spacing:.5px">${s.label}</span>
          <span style="font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:800;color:${s.cor};line-height:1">${s.val.toLocaleString('pt-BR')}</span>
        </div>
        <div style="height:18px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${barPct}%;background:${s.cor}55;border-left:3px solid ${s.cor};border-radius:0 4px 4px 0"></div>
        </div>
      </div>${arrow}`;
  }).join('');

const mesesComDados = new Set(MES_ORD.filter(m => todos.some(r => MES_ORD[new Date(r.data + 'T00:00:00').getMonth()] === m)));
  const allMeses = ddMesFiltro.length === 0;
  let filtrosHtml = `<div class="pf" style="margin-bottom:14px"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">`;
  filtrosHtml += `<div class="pf-field"><span class="pf-label">ANO</span><select class="pf-select" onchange="ddSetFiltro('ano',this.value)">`;
  [2024,2025,2026,2027].forEach(a => filtrosHtml += `<option value="${a}"${ddAnoFiltro==a?' selected':''}>${a}</option>`);
  filtrosHtml += `</select></div>`;
  filtrosHtml += `<div class="pf-field"><span class="pf-label">MÊS</span><div style="display:flex;gap:4px;flex-wrap:wrap">`;
  filtrosHtml += `<button onclick="ddSetFiltro('mes','__all__')" class="pf-btn${allMeses?' on':''}">Todos</button>`;
  MES_ORD.forEach(m => { const ok = mesesComDados.has(m); filtrosHtml += `<button onclick="ddTogMes('${m}')" class="pf-btn${(allMeses || ddMesFiltro.includes(m))?' on':''}"${ok ? '' : ' style="opacity:.35" title="Sem dados"'}>${m.slice(0,3)}</button>`; });
  filtrosHtml += `</div></div>`;
  filtrosHtml += `<div class="pf-field"><span class="pf-label">CIA</span><select class="pf-select" onchange="ddSetFiltro('cia',this.value)">`;
  filtrosHtml += `<option value="">Todas</option>`;
  DD_CIAS.forEach(c => filtrosHtml += `<option value="${c}"${ddCiaFiltro===c?' selected':''}>${c}</option>`);
  filtrosHtml += `</select></div>`;
  filtrosHtml += `</div></div>`;

  const secTitle = txt => `<div style="font-family:'DM Mono',monospace;font-size:19px;color:#fff;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px">${txt}</div>`;
  const cardBox  = `background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:16px`;

  el.innerHTML = `
    <div class="card">
      <div class="card-head" style="flex-wrap:wrap;gap:10px">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="card-title">Disque Denúncia</div>
          <span style="font-size:19px;color:#5a9de0;font-family:'DM Mono',monospace;letter-spacing:1px">${ddAnoFiltro}</span>
        </div>
        ${canEdit ? `<button onclick="openDDUpl()" style="padding:6px 16px;background:rgba(200,168,75,.12);border:1px solid rgba(200,168,75,.3);color:#c8a84b;border-radius:6px;cursor:pointer;font-size:19px;font-weight:600">↑ Importar CSV</button>` : ''}
      </div>

      <div style="margin-bottom:14px">${filtrosHtml}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px;margin-bottom:20px">${kpis}</div>

      <div style="display:flex;flex-direction:column;gap:16px;margin-bottom:16px">
        <div style="${cardBox}">
          ${secTitle('Participação por CIA — Total de DDs Recebidas e Averiguadas c/ Êxito')}
          <div id="dd-donut-main" style="display:flex;align-items:center;justify-content:center;gap:32px;flex-wrap:wrap">
            <div style="display:flex;flex-direction:column;align-items:center;gap:10px;flex-shrink:0">
              <div style="position:relative;width:240px;height:240px">
                <canvas id="dd-chart-donut" style="cursor:pointer" title="Clique na fatia para ver detalhes da CIA"></canvas>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
                  <div style="font-family:'Barlow Condensed',sans-serif;font-size:36px;font-weight:800;color:#fff;line-height:1">${total}</div>
                  <div style="font-size:19px;color:var(--tx3);font-family:'DM Mono',monospace;letter-spacing:1px;margin-top:2px">TOTAL DDs</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;background:rgba(90,224,154,.1);border:1px solid rgba(90,224,154,.3);border-radius:20px;padding:4px 12px">
                <span style="font-size:19px;color:#5ae09a">▲</span>
                <span style="font-size:19px;color:#5ae09a;font-family:'DM Mono',monospace;letter-spacing:1px">fatias destacadas = c/ Êxito</span>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px">
              <div style="display:grid;grid-template-columns:auto 110px 110px;gap:8px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.08)">
                <span style="font-size:19px;color:var(--tx3);font-family:'DM Mono',monospace;letter-spacing:1px">CIA</span>
                <span style="font-size:19px;color:var(--tx3);font-family:'DM Mono',monospace;letter-spacing:1px;text-align:right">TOTAL DDs</span>
                <span style="font-size:19px;color:#5ae09a;font-family:'DM Mono',monospace;letter-spacing:1px;text-align:right">c/ ÊXITO</span>
              </div>
              <div id="dd-donut-legend" style="display:flex;flex-direction:column;gap:10px"></div>
              <div style="font-size:19px;color:rgba(255,255,255,.6);margin-top:6px;font-family:'DM Mono',monospace">clique na legenda para ocultar/exibir</div>
            </div>
          </div>
          <div id="dd-donut-drill" style="display:none;flex-direction:column;align-items:center;gap:16px;padding-top:8px">
            <div style="display:flex;align-items:center;gap:12px;width:100%;flex-wrap:wrap">
              <button onclick="ddCloseDrill()" style="padding:5px 14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:6px;cursor:pointer;font-size:19px;font-family:'DM Mono',monospace">← Voltar</button>
              <span id="dd-drill-title" style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;letter-spacing:2px;color:#fff"></span>
            </div>
            <div style="display:flex;align-items:flex-start;gap:32px;flex-wrap:wrap;justify-content:center">
              <div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex-shrink:0">
                <div style="width:240px;height:240px">
                  <canvas id="dd-chart-drill"></canvas>
                </div>
                <div style="font-size:19px;color:rgba(255,255,255,.6);font-family:'DM Mono',monospace">clique no gráfico para voltar</div>
              </div>
              <div id="dd-drill-legend" style="display:flex;flex-direction:column;gap:4px;min-width:220px;padding-top:8px"></div>
            </div>
          </div>
        </div>
        <div style="${cardBox}">
          ${secTitle('Evolução Mensal — ' + ddAnoFiltro)}
          <canvas id="dd-chart-evolucao" style="height:440px;max-height:440px"></canvas>
        </div>
        <div style="${cardBox}">
          ${secTitle('Ranking por CIA')}
          ${rankingHtml}
        </div>
        <div style="${cardBox}">
          ${secTitle('Ranking por Município — Top 10')}
          <canvas id="dd-chart-municipio" style="height:320px;max-height:320px"></canvas>
        </div>
        <div style="${cardBox}">
          ${secTitle('Tempo Médio de Atendimento por CIA (dias)')}
          <canvas id="dd-chart-tempo" style="height:360px;max-height:360px"></canvas>
        </div>
      </div>

    </div>`;

  const c6 = document.getElementById('dd-chart-donut');
  if (c6) {
    if (_ddDrillChart) { try { _ddDrillChart.destroy(); } catch(e){} _ddDrillChart = null; }
    const donutCors  = [CIA_COR['1'], CIA_COR['2'], CIA_COR['3'], CIA_COR.ft];
    const exitoCor   = '#5ae09a';
    const donutTotais = DD_CIAS.map(cia => registros.filter(r => r.cia === cia).length);
    const donutExito  = DD_CIAS.map(cia => registros.filter(r => r.cia === cia && ddStatusMatch(r.status, 'Averiguada com Êxito')).length);
    const donutSemEx  = DD_CIAS.map(cia => registros.filter(r => r.cia === cia && ddStatusMatch(r.status, 'Averiguada sem Êxito')).length);
    const donutAndamt = DD_CIAS.map(cia => registros.filter(r => r.cia === cia && ddStatusMatch(r.status, 'Andamento')).length);
    const donutSemAv  = DD_CIAS.map(cia => registros.filter(r => r.cia === cia && ddStatusMatch(r.status, 'Sem Averiguação')).length);
    const donutResto  = DD_CIAS.map((_, i) => donutTotais[i] - donutExito[i]);

    const buildDonutSlices = () => {
      const data = [], bg = [], border = [];
      DD_CIAS.forEach((cia, i) => {
        const hidden = ddDonutHidden.has(cia);
        const esq    = hidden ? 0 : Math.floor(donutResto[i] / 2);
        const exito  = hidden ? 0 : donutExito[i];
        const dir    = hidden ? 0 : (donutResto[i] - Math.floor(donutResto[i] / 2));
        data.push(esq, exito, dir);
        bg.push(donutCors[i], exitoCor, donutCors[i]);
        border.push('#131720', '#131720', '#131720');
      });
      return { data, bg, border };
    };

    const ddExtTooltip = ctx => {
      const { chart, tooltip } = ctx;
      const TT_ID = 'dd-donut-ext-tt';
      let el = document.getElementById(TT_ID);
      if (!el) {
        el = document.createElement('div');
        el.id = TT_ID;
        el.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;background:rgba(17,21,34,.97);border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:12px 16px;font-family:"DM Mono",monospace;font-size:19px;color:#ccc;min-width:210px;box-shadow:0 6px 24px rgba(0,0,0,.65);display:none';
        document.body.appendChild(el);
      }
      if (tooltip.opacity === 0 || !tooltip.dataPoints?.length) { el.style.display = 'none'; return; }
      const dIdx = tooltip.dataPoints[0].dataIndex;
      const i    = Math.floor(dIdx / 3);
      if (donutTotais[i] === 0 || ddDonutHidden.has(DD_CIAS[i])) { el.style.display = 'none'; return; }
      const t   = donutTotais[i];
      const cor = donutCors[i];
      const pct = (v, base) => base > 0 ? `<span style="color:#777"> (${((v / base) * 100).toFixed(1)}%)</span>` : '';
      el.innerHTML = `
        <div style="font-size:19px;font-weight:700;color:${cor};letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid ${cor}44">${DD_CIAS[i]}</div>
        <div style="display:grid;grid-template-columns:auto auto;gap:4px 14px;align-items:baseline">
          <span style="color:#888">Total DDs</span><span style="color:#fff;font-weight:700">${t}${pct(t, total)}</span>
          <span style="color:#888">c/ Êxito</span><span style="color:#5ae09a;font-weight:700">${donutExito[i]}${pct(donutExito[i], t)}</span>
          <span style="color:#888">s/ Êxito</span><span style="color:#e08a5a;font-weight:700">${donutSemEx[i]}${pct(donutSemEx[i], t)}</span>
          <span style="color:#888">Andamento</span><span style="color:#f7d060;font-weight:700">${donutAndamt[i]}${pct(donutAndamt[i], t)}</span>
          <span style="color:#888">Sem Aver.</span><span style="color:#f07878;font-weight:700">${donutSemAv[i]}${pct(donutSemAv[i], t)}</span>
        </div>`;
      el.style.display = 'block';
      const rect = chart.canvas.getBoundingClientRect();
      let x = rect.left + tooltip.caretX + 18;
      let y = rect.top  + tooltip.caretY - 16;
      if (x + 230 > window.innerWidth - 12) x = rect.left + tooltip.caretX - 228;
      if (y + el.offsetHeight > window.innerHeight - 12) y = window.innerHeight - el.offsetHeight - 12;
      el.style.left = Math.max(8, x) + 'px';
      el.style.top  = Math.max(8, y) + 'px';
    };

    const initSlices = buildDonutSlices();
    ddChart6 = new Chart(c6.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: [],
        datasets: [{
          data: initSlices.data,
          backgroundColor: initSlices.bg,
          borderColor: initSlices.border,
          borderWidth: 1,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        cutout: '54%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false, external: ddExtTooltip }
        },
        onClick: (evt, elements) => {
          if (!elements.length) return;
          const ciaIdx = Math.floor(elements[0].index / 3);
          if (ddDonutHidden.has(DD_CIAS[ciaIdx])) return;
          if (_ddDrillCiaIdx === ciaIdx) { ddCloseDrill(); return; }
          ddChart6._ddData.openDrill(ciaIdx);
        }
      }
    });

    const legendEl = document.getElementById('dd-donut-legend');
    const renderLegend = () => {
      if (!legendEl) return;
      legendEl.innerHTML = DD_CIAS.map((cia, i) => {
        const val     = donutTotais[i];
        const exit    = donutExito[i];
        const pct     = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
        const exitPct = val > 0 ? ((exit / val) * 100).toFixed(1) : '0.0';
        const hidden  = ddDonutHidden.has(cia);
        return `<div onclick="ddToggleDonut('${cia.replace(/'/g, "\\'")}')" title="${hidden ? 'Mostrar' : 'Ocultar'} ${cia} no gráfico" style="display:grid;grid-template-columns:auto 110px 110px;gap:8px;align-items:center;cursor:pointer;opacity:${hidden ? 0.38 : 1}">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="width:10px;height:10px;border-radius:2px;background:${hidden ? 'rgba(255,255,255,.2)' : donutCors[i]};flex-shrink:0"></div>
            <div style="width:10px;height:10px;border-radius:2px;background:${hidden ? 'rgba(255,255,255,.2)' : exitoCor};flex-shrink:0"></div>
            <span style="font-size:19px;color:${hidden ? 'rgba(255,255,255,.35)' : '#fff'};font-family:'DM Mono',monospace;font-weight:600">${cia}</span>
          </div>
          <div style="text-align:right">
            <span style="font-size:19px;color:${hidden ? 'rgba(255,255,255,.35)' : '#fff'};font-family:'DM Mono',monospace">${val}</span>
            <span style="font-size:19px;color:${hidden ? 'rgba(255,255,255,.2)' : donutCors[i]};margin-left:5px;font-weight:700">${pct}%</span>
          </div>
          <div style="text-align:right">
            <span style="font-size:19px;color:${hidden ? 'rgba(255,255,255,.35)' : exitoCor};font-family:'DM Mono',monospace">${exit}</span>
            <span style="font-size:19px;color:${hidden ? 'rgba(255,255,255,.2)' : exitoCor + '88'};margin-left:5px">${exitPct}%</span>
          </div>
        </div>`;
      }).join('');
    };
    renderLegend();

    const openDrill = ciaIdx => {
      _ddDrillCiaIdx = ciaIdx;
      const cia      = DD_CIAS[ciaIdx];
      const t          = donutTotais[ciaIdx];
      const statData   = [donutExito[ciaIdx], donutSemEx[ciaIdx], donutAndamt[ciaIdx], donutSemAv[ciaIdx]];
      const statLabels = ['Av. c/ Êxito', 'Av. s/ Êxito', 'Andamento', 'Sem Averiguação'];
      const statCors   = ['#5ae09a', '#e08a5a', '#f7d060', '#f07878'];
      const extTt = document.getElementById('dd-donut-ext-tt');
      if (extTt) extTt.style.display = 'none';
      const mainEl  = document.getElementById('dd-donut-main');
      const drillEl = document.getElementById('dd-donut-drill');
      if (mainEl)  mainEl.style.display  = 'none';
      if (drillEl) drillEl.style.display = 'flex';
      const titleEl = document.getElementById('dd-drill-title');
      if (titleEl) titleEl.textContent = cia.toUpperCase();
      if (_ddDrillChart) { try { _ddDrillChart.destroy(); } catch(e){} _ddDrillChart = null; }
      const cDrill = document.getElementById('dd-chart-drill');
      if (cDrill) {
        cDrill.style.cursor = 'pointer';
        cDrill.title = 'Clique para voltar';
        if (statData.some(v => v > 0)) {
          setTimeout(() => {
            _ddDrillChart = new Chart(cDrill.getContext('2d'), {
              type: 'pie',
              data: {
                labels: statLabels,
                datasets: [{
                  data: statData,
                  backgroundColor: statCors.map(sc => sc + 'cc'),
                  borderColor: statCors,
                  borderWidth: 2,
                  hoverOffset: 8
                }]
              },
              options: {
                responsive: true, maintainAspectRatio: true,
                onClick: () => ddCloseDrill(),
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: ctx => ` ${ctx.label}: ${ctx.raw}${t > 0 ? ' (' + ((ctx.raw / t) * 100).toFixed(1) + '%)' : ''}`
                    }
                  }
                }
              }
            });
          }, 0);
        }
      }
      const legEl = document.getElementById('dd-drill-legend');
      if (legEl) {
        legEl.innerHTML = statLabels.map((lbl, i) => {
          const v   = statData[i];
          const pct = t > 0 ? ((v / t) * 100).toFixed(1) : '0.0';
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:10px;height:10px;border-radius:50%;background:${statCors[i]};flex-shrink:0"></div>
              <span style="font-size:19px;color:#fff;font-family:'DM Mono',monospace">${lbl}</span>
            </div>
            <div>
              <span style="font-size:19px;color:${statCors[i]};font-family:'DM Mono',monospace;font-weight:700">${v}</span>
              <span style="font-size:19px;color:var(--tx3);margin-left:8px">${pct}%</span>
            </div>
          </div>`;
        }).join('');
      }
    };

    ddChart6._ddData = { buildDonutSlices, renderLegend, openDrill };
  }

  const c1 = document.getElementById('dd-chart-evolucao');
  if (c1 && todos.length) {
    ddChart = new Chart(c1.getContext('2d'), {
      type: 'bar',
      data: { labels: MESES_LABEL, datasets: evolDatasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#fff', font: { size: 19 }, boxWidth: 14, padding: 16 } },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: i => ` ${i.dataset.label}: ${i.raw.toLocaleString('pt-BR')}`,
            },
          },
        },
        scales: {
          x: { stacked: true, grid: GR, ticks: { color: '#fff', font: { size: 19 } } },
          y: { stacked: true, grid: GR, ticks: { color: '#fff', font: { size: 19 } }, beginAtZero: true },
        },
      }
    });
  }

  // Ranking por Município
  const cMun = document.getElementById('dd-chart-municipio');
  if (cMun) {
    const normMun = s => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const munMap  = {};
    const munLabel = {}; // guarda a forma de escrita mais frequente por chave normalizada
    registros.forEach(r => {
      const raw = (r.municipio || '').trim();
      if (!raw) return;
      const key = normMun(raw);
      if (!munMap[key]) { munMap[key] = { total: 0, exito: 0 }; munLabel[key] = {}; }
      munLabel[key][raw] = (munLabel[key][raw] || 0) + 1;
      munMap[key].total++;
      if (ddStatusMatch(r.status, 'Averiguada com Êxito')) munMap[key].exito++;
    });
    const munRows = Object.entries(munMap).sort((a, b) => b[1].exito - a[1].exito).slice(0, 10);
    // exibe a variante mais frequente de cada município
    const munLabels = munRows.map(([key]) =>
      Object.entries(munLabel[key]).sort((a, b) => b[1] - a[1])[0][0]
    );
    const ciaCors = [CIA_COR['1'], CIA_COR['2'], CIA_COR['3'], CIA_COR.ft];
    const munCiaDatasets = DD_CIAS.map((cia, ci) => ({
      label: cia,
      data: munRows.map(([key]) =>
        registros.filter(r => {
          const raw = (r.municipio || '').trim();
          return raw && normMun(raw) === key && r.cia === cia;
        }).length
      ),
      backgroundColor: ciaCors[ci] + 'cc',
      borderColor: ciaCors[ci],
      borderWidth: 1,
      borderRadius: 3,
    }));
    ddChart2 = new Chart(cMun.getContext('2d'), {
      type: 'bar',
      data: { labels: munLabels, datasets: munCiaDatasets },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#fff', font: { size: 19 }, boxWidth: 12, padding: 14 } } },
        scales: {
          x: { stacked: true, grid: GR, ticks: { color: '#fff', font: { size: 19 } }, beginAtZero: true },
          y: { stacked: true, grid: GR, ticks: { color: '#fff', font: { size: 19 } } }
        }
      }
    });
  }

  // Tempo Médio de Atendimento por CIA
  const cTempo = document.getElementById('dd-chart-tempo');
  if (cTempo) {
    const tempoMedias = DD_CIAS.map(cia => {
      const recs = registros.filter(r => r.cia === cia && r.data && r.data_atendimento);
      if (!recs.length) return null;
      const dias = recs.map(r => Math.max(0, (new Date(r.data_atendimento) - new Date(r.data)) / 86400000));
      return +(dias.reduce((a, b) => a + b, 0) / dias.length).toFixed(1);
    });
    const donutCors2 = [CIA_COR['1'], CIA_COR['2'], CIA_COR['3'], CIA_COR.ft];
    ddChart3 = new Chart(cTempo.getContext('2d'), {
      type: 'bar',
      data: {
        labels: DD_CIAS,
        datasets: [{
          label: 'Dias (média)',
          data: tempoMedias,
          backgroundColor: donutCors2.map(c => c + 'bb'),
          borderColor: donutCors2,
          borderWidth: 2,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.raw !== null ? ` ${ctx.raw} dias (média)` : ' Sem dados' } }
        },
        scales: {
          x: { grid: GR, ticks: { color: '#fff', font: { size: 19 } } },
          y: { grid: GR, ticks: { color: '#fff', font: { size: 19 } }, beginAtZero: true }
        }
      }
    });
  }


}


function ddToggleDonut(cia) {
  if (ddDonutHidden.has(cia)) ddDonutHidden.delete(cia);
  else ddDonutHidden.add(cia);
  if (!ddChart6?._ddData) return;
  const s = ddChart6._ddData.buildDonutSlices();
  ddChart6.data.datasets[0].data = s.data;
  ddChart6.update();
  ddChart6._ddData.renderLegend();
}

function ddCloseDrill() {
  _ddDrillCiaIdx = null;
  if (_ddDrillChart) { try { _ddDrillChart.destroy(); } catch(e){} _ddDrillChart = null; }
  const mainEl  = document.getElementById('dd-donut-main');
  const drillEl = document.getElementById('dd-donut-drill');
  if (mainEl)  mainEl.style.display  = 'flex';
  if (drillEl) drillEl.style.display = 'none';
}

function ddSetFiltro(campo, valor) {
  if (campo === 'ano') { ddAnoFiltro = Number(valor); ddMesFiltro = []; loadDDData().then(() => renderDDSection()); }
  else if (campo === 'mes') { ddMesFiltro = valor === '__all__' ? [] : [valor]; renderDDSection(); }
  else if (campo === 'cia') { ddCiaFiltro = valor; renderDDSection(); }
}

function ddTogMes(mes) {
  if (ddMesFiltro.includes(mes)) ddMesFiltro = ddMesFiltro.filter(m => m !== mes);
  else ddMesFiltro = [...ddMesFiltro, mes];
  renderDDSection();
}

function openDDMo(id) {
  ddEditId = id;
  const rec = id ? ddData.find(r => r.id === id) : null;
  document.getElementById('dd-mo-title').textContent = id ? 'Editar Registro' : 'Novo Registro';
  document.getElementById('dd-mo-msg').textContent = '';

  const fmtDate = v => v ? v.slice(0,10) : '';
  const selectStyle = 'width:100%;background:var(--s2);color:var(--tx);border:1px solid var(--bd2);border-radius:6px;padding:8px 10px;font-size:19px;margin-bottom:12px';
  const inputStyle  = 'width:100%;background:var(--s2);color:var(--tx);border:1px solid var(--bd2);border-radius:6px;padding:8px 10px;font-size:19px;margin-bottom:12px;box-sizing:border-box';
  const labelStyle  = 'display:block;font-size:19px;color:var(--tx3);font-family:"DM Mono",monospace;letter-spacing:1px;margin-bottom:4px;text-transform:uppercase';

  document.getElementById('dd-mo-body').innerHTML = `
    <label style="${labelStyle}">Data</label>
    <input type="date" id="dd-f-data" value="${fmtDate(rec?.data)}" style="${inputStyle}">
    <label style="${labelStyle}">Cia</label>
    <select id="dd-f-cia" style="${selectStyle}">
      ${DD_CIAS.map(c => `<option value="${c}"${rec?.cia===c?' selected':''}>${c}</option>`).join('')}
    </select>
    <label style="${labelStyle}">Nº Disque Denúncia</label>
    <input type="text" id="dd-f-numero" value="${rec?.numero_dd||''}" placeholder="Ex: DD-2026-0001" style="${inputStyle}">
    <label style="${labelStyle}">Data do Atendimento</label>
    <input type="date" id="dd-f-dtatend" value="${fmtDate(rec?.data_atendimento)}" style="${inputStyle}">
    <label style="${labelStyle}">Status</label>
    <select id="dd-f-status" style="${selectStyle}">
      ${DD_STATUS.map(s => `<option value="${s}"${(rec?.status||'Andamento')===s?' selected':''}>${s}</option>`).join('')}
    </select>
    <label style="${labelStyle}">Flagrante</label>
    <select id="dd-f-flagrante" style="${selectStyle}">
      <option value="false"${!rec?.flagrante?' selected':''}>Não</option>
      <option value="true"${rec?.flagrante?' selected':''}>Sim</option>
    </select>
    <label style="${labelStyle}">Qtd. Presos</label>
    <input type="number" id="dd-f-presos" value="${rec?.quant_presos||0}" min="0" style="${inputStyle}">
    <label style="${labelStyle}">Município</label>
    <input type="text" id="dd-f-municipio" value="${rec?.municipio||''}" placeholder="Ex: São Paulo" style="${inputStyle}">
  `;

  const mo = document.getElementById('dd-mo');
  mo.style.display = 'flex';
}

function closeDDMo() {
  document.getElementById('dd-mo').style.display = 'none';
  ddEditId = null;
}

function ddMoClickOut(e) {
  if (e.target === document.getElementById('dd-mo')) closeDDMo();
}

async function ddSave() {
  const msg = document.getElementById('dd-mo-msg');
  const body = {
    data:              document.getElementById('dd-f-data').value,
    cia:               document.getElementById('dd-f-cia').value,
    numero_dd:         document.getElementById('dd-f-numero').value.trim(),
    data_atendimento:  document.getElementById('dd-f-dtatend').value || null,
    status:            document.getElementById('dd-f-status').value,
    flagrante:         document.getElementById('dd-f-flagrante').value === 'true',
    quant_presos:      Number(document.getElementById('dd-f-presos').value) || 0,
    municipio:         document.getElementById('dd-f-municipio').value.trim() || null,
  };
  if (!body.data || !body.numero_dd) { msg.textContent = 'Preencha Data e Nº DD.'; return; }
  try {
    const url    = ddEditId ? `${API}/disque-denuncia/${ddEditId}` : `${API}/disque-denuncia`;
    const method = ddEditId ? 'PUT' : 'POST';
    const res = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { msg.textContent = data.error || 'Erro ao salvar.'; return; }
    closeDDMo();
    await loadDDData();
  } catch(e) { msg.textContent = 'Erro de conexão.'; }
}

async function deleteDDRecord(id) {
  if (!confirm('Excluir este registro?')) return;
  try {
    const res = await authFetch(`${API}/disque-denuncia/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Erro ao excluir.'); return; }
    await loadDDData();
  } catch(e) { alert('Erro de conexão.'); }
}

// ---------------------------------------------------------------------------
// Disque Denúncia — Upload CSV
// ---------------------------------------------------------------------------

let ddUplParsed = [];

function openDDUpl() {
  ddUplParsed = [];
  document.getElementById('dd-upl-file').value = '';
  document.getElementById('dd-upl-preview').innerHTML = '';
  document.getElementById('dd-upl-msg').innerHTML = '';
  const btn = document.getElementById('dd-upl-btn');
  btn.disabled = true; btn.style.opacity = '.5';
  document.getElementById('dd-upl-mo').style.display = 'flex';
}

function closeDDUpl() {
  document.getElementById('dd-upl-mo').style.display = 'none';
}

function ddUplClickOut(e) {
  if (e.target === document.getElementById('dd-upl-mo')) closeDDUpl();
}

function ddUplFileChange() {
  const file = document.getElementById('dd-upl-file').files[0];
  const prev = document.getElementById('dd-upl-preview');
  const btn  = document.getElementById('dd-upl-btn');
  ddUplParsed = [];
  btn.disabled = true; btn.style.opacity = '.5';
  prev.innerHTML = '';
  if (!file) return;
  Papa.parse(file, {
    header: true, skipEmptyLines: true,
    complete: r => {
      if (!r.data.length) { prev.innerHTML = '<span style="color:#f07878">Arquivo vazio.</span>'; return; }
      const keys = Object.keys(r.data[0]).map(k => k.toLowerCase().trim());
      const hasData = keys.some(k => k.includes('data'));
      const hasCia  = keys.some(k => k.includes('cia'));
      const hasNum  = keys.some(k => k.includes('disque') || k.includes('nº') || k.includes('numero'));
      if (!hasData || !hasCia || !hasNum) {
        prev.innerHTML = `<span style="color:#f07878">Colunas obrigatórias não encontradas. Verifique: Data, Cia, Nº Disque Denuncia.</span>`;
        return;
      }
      ddUplParsed = r.data;
      prev.innerHTML = `<span style="color:#4bc87a">✓ <b>${r.data.length}</b> registros lidos.</span>`;
      btn.disabled = false; btn.style.opacity = '1';
    },
    error: err => { prev.innerHTML = `<span style="color:#f07878">Erro: ${err.message}</span>`; }
  });
}

async function ddUplConfirm() {
  const btn = document.getElementById('dd-upl-btn');
  const msg = document.getElementById('dd-upl-msg');
  if (!ddUplParsed.length) return;
  btn.disabled = true; btn.style.opacity = '.5';
  msg.innerHTML = '<span style="color:var(--tx3)">Enviando...</span>';
  try {
    const res = await authFetch(`${API}/disque-denuncia/upload`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: ddUplParsed })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
    msg.innerHTML = `<span style="color:#4bc87a">✓ ${data.total} registros importados.</span>`;
    registraUpload();
    await loadDDData();
    setTimeout(closeDDUpl, 1800);
  } catch (err) {
    msg.innerHTML = `<span style="color:#f07878">Erro: ${err.message}</span>`;
    btn.disabled = false; btn.style.opacity = '1';
  }
}

// ---------------------------------------------------------------------------
// Modo Inspetor (apenas admin / ti)
// ---------------------------------------------------------------------------

function initInspector() {
  const role = currentRole();
  if (!['admin', 'ti'].includes(role)) return;

  let active = false;

  const style = document.createElement('style');
  style.textContent = `
    #inspector-btn{display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:19px;color:#5a9de0;opacity:.45;transition:opacity .2s,color .2s;user-select:none;padding:2px 4px;border-radius:4px;flex-shrink:0}
    #inspector-btn:hover{opacity:1}
    #inspector-btn.on{opacity:1;color:#5ae09a}
    #inspector-popup{position:fixed;z-index:9999;background:#1a1e2e;border:1px solid rgba(90,157,224,.45);border-radius:10px;padding:14px 16px;font-family:'DM Mono',monospace;font-size:19px;color:#d0d4dc;box-shadow:0 4px 24px rgba(0,0,0,.6);display:none;max-width:340px;min-width:280px;pointer-events:none;line-height:1.5}
    body.inspector-on *{cursor:crosshair !important}
    body.inspector-on canvas:hover,body.inspector-on div[id]:hover,body.inspector-on section[id]:hover{outline:2px solid rgba(90,157,224,.7) !important;outline-offset:3px !important}
  `;
  document.head.appendChild(style);

  const btn = document.createElement('span');
  btn.id = 'inspector-btn';
  btn.title = 'Modo Inspetor';
  btn.textContent = '🔍';
  btn.onclick = () => {
    active = !active;
    btn.classList.toggle('on', active);
    document.body.classList.toggle('inspector-on', active);
    popup.style.display = 'none';
  };

  const userNome = document.getElementById('user-nome');
  if (userNome) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
    userNome.parentNode.insertBefore(row, userNome);
    row.appendChild(userNome);
    row.appendChild(btn);
  } else {
    document.body.appendChild(btn);
  }

  const popup = document.createElement('div');
  popup.id = 'inspector-popup';
  document.body.appendChild(popup);

  const getTitle = el => {
    let node = el;
    while (node && node !== document.body) {
      const kids = node.children ? [...node.children] : [];
      for (const k of kids) {
        const st = k.getAttribute?.('style') || '';
        const txt = (k.textContent || '').trim();
        if (txt && txt.length < 100 && (st.includes('letter-spacing') || st.includes('text-transform') || st.includes('Barlow') || st.includes('font-weight:700') || st.includes('font-weight:800'))) {
          return txt.split('\n')[0].trim();
        }
      }
      node = node.parentElement;
    }
    return '';
  };

  // Gera frase pronta para descrever o elemento ao Claude
  const buildClaudeRef = (targetEl) => {
    const directText = node => {
      let t = '';
      for (const n of node.childNodes) if (n.nodeType === 3) t += n.textContent;
      return t.replace(/\s+/g, ' ').trim();
    };
    let elTxt = directText(targetEl);
    if (!elTxt) elTxt = (targetEl.textContent || '').replace(/\s+/g, ' ').trim();
    if (elTxt.length > 50) elTxt = elTxt.slice(0, 47) + '…';

    const looksLikeTitle = el => {
      const st = (el.getAttribute?.('style') || '').replace(/\s/g, '');
      const txt = (el.textContent || '').trim();
      if (!txt || txt.length > 80) return false;
      return st.includes('letter-spacing') || st.includes('text-transform:uppercase') ||
             /font-weight:[78]/.test(st);
    };

    let sectionTxt = '';
    let walker = targetEl.parentElement;
    while (walker && walker !== document.body && !sectionTxt) {
      for (const child of walker.children) {
        if (child.contains(targetEl) || child === targetEl) continue;
        if (looksLikeTitle(child)) {
          const t = child.textContent.trim().replace(/\s+/g, ' ');
          if (t && t !== elTxt && t.length < 70) { sectionTxt = t.slice(0, 55); break; }
        }
      }
      walker = walker.parentElement;
    }

    if (elTxt && sectionTxt && elTxt !== sectionTxt) return `"${elTxt}" dentro de "${sectionTxt}"`;
    if (elTxt) return `"${elTxt}"`;
    if (sectionTxt) return `dentro de "${sectionTxt}"`;
    return '(elemento sem texto)';
  };

  document.addEventListener('mousemove', e => {
    if (!active) return;
    const target = e.target;
    if (target === btn || target.closest?.('#inspector-popup') || target.closest?.('#inspector-btn')) return;

    // refEl: ancestral com id — usado para título e referência de código
    let refEl = target;
    while (refEl && refEl !== document.body) {
      if (refEl.id && refEl.id !== 'inspector-popup' && refEl.id !== 'inspector-btn') break;
      refEl = refEl.parentElement;
    }
    if (!refEl || refEl === document.body) { popup.style.display = 'none'; return; }

    // target é o elemento real sob o cursor — estilos mudam a cada elemento
    const el = target;

    const title = getTitle(refEl) || refEl.id || refEl.tagName;
    const tag   = refEl.tagName === 'CANVAS' ? '📊 Gráfico' : refEl.tagName === 'TABLE' ? '📋 Tabela' : '🗂 Elemento';

    const cs   = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const toHex = rgb => {
      const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return rgb;
      if (m[4] !== undefined && parseFloat(m[4]) < 0.05) return 'transparente';
      return '#' + [m[1],m[2],m[3]].map(n => (+n).toString(16).padStart(2,'0')).join('');
    };
    const fgHex      = toHex(cs.color);
    const bgHex      = toHex(cs.backgroundColor);
    const fontSize   = cs.fontSize;
    const fontWeight = cs.fontWeight;
    const fontFamily = cs.fontFamily.split(',')[0].replace(/['"]/g,'').trim();
    const opacity    = parseFloat(cs.opacity);
    const opacityTxt = opacity >= 1 ? '100%' : `${Math.round(opacity * 100)}% ⚠ texto aparece mais apagado`;
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    const staticIds = ['user-block','sidebar','btn-admin','btn-logout','main-content','nav','header','pending-badge','user-nome','user-info'];
    const srcFile  = staticIds.includes(refEl.id) ? 'index.html' : refEl.id ? 'app.js' : 'index.html ou app.js';
    const refClass = typeof refEl.className === 'string' ? refEl.className.trim().split(/\s+/)[0] : '';
    const searchTerm = refEl.id ? `id="${refEl.id}"` : refClass ? `.${refClass}` : refEl.tagName.toLowerCase();
    const swatch = c => `<span style="display:inline-block;width:9px;height:9px;background:${c};border-radius:2px;margin-right:5px;border:1px solid rgba(255,255,255,.15);vertical-align:middle;flex-shrink:0"></span>`;
    const claudeRef = buildClaudeRef(el);

    popup.innerHTML = `
      <div style="color:#5a9de0;font-size:19px;letter-spacing:1.5px;margin-bottom:8px;font-weight:700">🔍 INSPETOR</div>
      <div style="color:#fff;font-size:19px;font-weight:700;margin-bottom:2px;line-height:1.4">${title}</div>
      <div style="color:#666;font-size:19px;margin-bottom:10px">${tag}</div>
      <div style="display:grid;grid-template-columns:80px 1fr;gap:4px 8px;font-size:19px;margin-bottom:10px;align-items:center">
        <span style="color:#555">ID ref.</span>
        <span style="color:#c8a84b;font-family:'DM Mono',monospace">${refEl.id || '(sem id)'}</span>
        <span style="color:#555">Tamanho</span>
        <span style="color:#d0d4dc">${w} × ${h} px</span>
        <span style="color:#555">Fonte</span>
        <span style="color:#d0d4dc">${fontSize} · peso ${fontWeight}</span>
        <span style="color:#555">Família</span>
        <span style="color:#d0d4dc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fontFamily}</span>
        <span style="color:#555">Cor texto</span>
        <span style="color:#d0d4dc;display:flex;align-items:center">${swatch(cs.color)}${fgHex}</span>
        <span style="color:#555">Cor fundo</span>
        <span style="color:#d0d4dc;display:flex;align-items:center">${swatch(cs.backgroundColor)}${bgHex}</span>
        <span style="color:#555">Opacidade</span>
        <span style="color:${opacity < 1 ? '#c8a84b' : '#d0d4dc'}">${opacityTxt}</span>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,.08);padding-top:8px;margin-bottom:8px;font-size:19px">
        <div style="color:#555;margin-bottom:3px;letter-spacing:1px;text-transform:uppercase">Buscar no código</div>
        <div style="color:#c8a84b;font-family:'DM Mono',monospace;margin-bottom:2px">${searchTerm}</div>
        <div style="color:#444">em <span style="color:#6a8fc0">${srcFile}</span></div>
      </div>
      <div style="border-top:1px solid rgba(90,224,154,.2);padding-top:8px;background:rgba(90,224,154,.04);border-radius:0 0 6px 6px;margin:-2px -2px -2px -2px;padding:8px 10px">
        <div style="color:#5ae09a;font-size:19px;letter-spacing:1px;text-transform:uppercase;font-weight:700;margin-bottom:5px">💬 Diga ao Claude</div>
        <div style="color:#e8f5ee;font-size:19px;line-height:1.55;word-break:break-word;user-select:text">${claudeRef}</div>
      </div>
    `;

    const popW = 340;
    const popH = 330;
    const px = Math.min(e.clientX + 18, window.innerWidth - popW - 8);
    const py = Math.min(e.clientY + 18, window.innerHeight - popH - 8);
    popup.style.left = px + 'px';
    popup.style.top  = py + 'px';
    popup.style.display = 'block';
  });

  document.addEventListener('mouseleave', () => { popup.style.display = 'none'; });
}

// ---------------------------------------------------------------------------
// Inicia a aplicação
// ---------------------------------------------------------------------------

init();
initInspector();
