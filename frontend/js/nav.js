
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

// Preenche nome/cargo do usuário na sidebar e configura visibilidade de botões
// conforme o role (admin/p3/ti veem botões de edição; p1/ti veem edição do P1)
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
      const btnSicoordop = document.getElementById('btn-edit-sicoordop');
      if (btnSicoordop) btnSicoordop.style.display = 'inline-block';
    }
    if (['p1', 'ti'].includes(u.role)) {
      // Botão de edição de 'Última Atualização' do P1 — visível só para p1/ti
      const btnP1Per = document.getElementById('btn-p1-edit-periodo');
      if (btnP1Per) btnP1Per.style.display = 'inline-block';
    }
    loadDashboardConfig();
  } catch (_) {}
}

// Carrega configurações globais do banco (periodo_texto, fonte_texto, p1_periodo,
// last_upload, sicoordop_texto) e popula os labels/inputs editáveis na UI
async function loadDashboardConfig() {
  try {
    const res = await authFetch(`${API}/config`);
    if (!res.ok) return;
    const cfg = await res.json();
    // P3
    if (!cfg.periodo_texto) {
      const lbl = document.getElementById('vis-periodo-lbl');
      if (lbl) { lbl.textContent = 'Período não definido'; lbl.style.color = 'var(--gold2)'; }
    }
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
      const ts = new Date(cfg.last_upload).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
      const el = document.getElementById('sync-time');
      if (el) el.textContent = ts;
    }
    // P3 Produtividade — SICOORDOP (campo independente)
    if (cfg.sicoordop_texto) {
      const lbl = document.getElementById('lbl-sicoordop');
      const inp = document.getElementById('inp-sicoordop');
      if (lbl) lbl.textContent = cfg.sicoordop_texto;
      if (inp) inp.value = cfg.sicoordop_texto;
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
  const fmt = new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const el = document.getElementById('sync-time');
  if (el) el.textContent = fmt;
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

function saveSicoordop(val) {
  const lbl = document.getElementById('lbl-sicoordop');
  if (lbl) lbl.textContent = val || '—';
}

function toggleEditSicoordop() {
  const inp  = document.getElementById('inp-sicoordop');
  const lbl  = document.getElementById('lbl-sicoordop');
  const btn  = document.getElementById('btn-edit-sicoordop');
  const open = inp.style.display === 'none' || inp.style.display === '';
  inp.style.display = open ? 'inline-block' : 'none';
  lbl.style.display = open ? 'none' : 'inline-block';
  btn.textContent   = open ? '✔ Salvar' : '✎ Editar';
  if (!open) {
    const val = inp.value.trim();
    lbl.textContent = val || '—';
    saveConfig('sicoordop_texto', val);
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

