// ═══════════════════════════════════════════════════════════════════════════
// GERENCIAMENTO DE USUÁRIOS (modal #adm-mo)
// Acessível apenas por admin, p3 e ti. Permite:
//   • Aprovar / recusar cadastros pendentes
//   • Alterar role (nível de acesso), posto/graduação e seção
//   • Revogar acesso e excluir conta
//   • Redefinir senha (temporária = matrícula do usuário)
// Usuários com role 'admin' são ocultados da lista (protegidos contra alteração).
// ═══════════════════════════════════════════════════════════════════════════
function admClickOut(e) { if (e.target.id === 'adm-mo') closeAdminModal(); }
function closeAdminModal() { document.getElementById('adm-mo').style.display = 'none'; }

let _admAllUsers = []; // cache para busca sem re-fetch

// Ordem de posto do menor ao maior — índice maior = posto mais alto
const POSTO_ORDER = ['Sd PM','Cb PM','3º Sgt PM','2º Sgt PM','1º Sgt PM','Subten PM','Asp Of PM','2º Ten PM','1º Ten PM','Cap PM','Maj PM','Ten Cel PM','Cel PM'];
function _postoRank(posto) { const i = POSTO_ORDER.indexOf(posto||''); return i === -1 ? -1 : i; }
function _sortHierarquia(users) {
  return [...users].sort((a, b) => {
    const dr = _postoRank(b.posto) - _postoRank(a.posto); // mais alto primeiro
    if (dr !== 0) return dr;
    const ma = parseInt((a.matricula||'').replace(/\D/g,'')) || 999999;
    const mb = parseInt((b.matricula||'').replace(/\D/g,'')) || 999999;
    return ma - mb; // RE menor = mais antigo = primeiro
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
  const pending = _sortHierarquia(users.filter(u => u.status === 'pending'));
  const others  = _sortHierarquia(users.filter(u => u.status !== 'pending'));
  _admAllUsers  = others;

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

