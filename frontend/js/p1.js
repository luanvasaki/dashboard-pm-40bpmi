// ═══════════════════════════════════════════════════════════════════════════
// NAVEGAÇÃO — alternância entre seções/páginas do dashboard
// goSection(id, btn) — troca a seção principal (home, p1, p3, p3prod)
// goPage(id, btn)    — troca a sub-página dentro de P3 (visao, metas, evolucao...)
// Cada seção ativa o carregamento de seus dados se necessário (loadP1, loadProdData...).
// ═══════════════════════════════════════════════════════════════════════════

let currentP3Page = 'visao';

function closeSidebarMobile() {
  const aside = document.querySelector('aside');
  if (aside.classList.contains('open')) {
    aside.classList.remove('open');
    document.querySelector('.sidebar-overlay').style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// P1 — GESTÃO DE EFETIVO (seção #page-p1)
// Conteúdo:
//   • KPI cards: total, afastados, presença, férias ativas
//   • Grade de PMs por OPM / CIA (cards com foto, posto, RE, afastamento)
//   • Prontuário individual (prontoOpen): histórico de afastamentos + foto
//   • Quadro comparativo: fixado × existente por posto
//   • Uploads: efetivo (CSV P1), afastamentos (CSV P1), fotos (base64)
// Dados carregados em loadP1() via 4 endpoints paralelos:
//   /api/efetivo, /api/afastamentos, /api/p1/vagas, /api/p1/quadro
//
// ⚠ ESTRUTURA ORGÂNICA: CIA_STRUCT define a hierarquia OPM → CIA para
//   agrupar os PMs. Alterar requer atualizar os keys de matching (_opmMatch).
// ═══════════════════════════════════════════════════════════════════════════

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

// Carrega todos os dados do P1 em paralelo: efetivo, afastamentos, vagas e quadro
// Chamada ao entrar na seção P1 via goSection('p1') e após qualquer upload
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
    // Carrega restrições UIS em paralelo com o restante, mas aguarda antes de renderizar
    // para que os badges já apareçam na primeira passagem (sem segundo render).
    await loadUisRestricoes().catch(() => {});
    if (renderingP1) renderP1();
    renderHome();
  } catch (err) {
    if (kpis) kpis.innerHTML = `<div style="color:#f07878;font-size:19px">${err.message}</div>`;
  }
}

// Renderiza a grade de PMs agrupados por CIA/OPM e os KPI cards do P1
// Popula p1ByUnit e p1AfastHoje para uso nos cards e no prontuário
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
  const hasUisRestr = re => typeof uisNormRE === 'function' && !!_uisRestMap?.[uisNormRE(re)]?.length;
  const pmComRestricaoEfetivo = dataF.filter(r => (r.possui_restricao || '').toLowerCase().startsWith('s'));
  const pmComRestricaoUis = dataF.filter(r => !(r.possui_restricao||'').toLowerCase().startsWith('s') && hasUisRestr(r.re));
  const pmComRestricao = dataF.filter(r => (r.possui_restricao || '').toLowerCase().startsWith('s') || hasUisRestr(r.re));
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
  const kpiCard = (label, val, sub, color, key) => {
    return `<div onclick="p1ShowKpiDetail('${key}')" class="kpi">
      <div class="kpi-top"></div>
      <div class="kpi-lbl">${label}</div>
      <div class="kpi-val">${val}</div>
      ${sub ? `<div class="kpi-sub" style="line-height:1.7;width:100%">${sub}</div>` : ''}
      <div class="kpi-hint">▸ clique p/ detalhes</div>
    </div>`;
  };

  // Tipos de afastamento agrupados
  const tiposCount = {};
  pmAfastados.forEach(r => { (afastHoje[r.re] || []).forEach(a => { tiposCount[a.tipo_afastamento] = (tiposCount[a.tipo_afastamento] || 0) + 1; }); });
  const _kpiRow = (label, val, color) => `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:#ffffff;font-size:17px">${label}</span><span style="color:${color};font-weight:700;font-size:20px">${val}</span></div>`;
  const tiposSub = Object.entries(tiposCount).map(([t,n]) => _kpiRow(t, n, '#e05555')).join('') || '—';

  kpisEl.innerHTML =
    kpiCard('Total Efetivo', total,
      Object.keys(CATS).filter(k=>count(dataF,k)>0).map(k => _kpiRow(CATS[k], count(dataF,k), CATS_COLOR[k])).join(''),
      'var(--tx)', 'total') +
    kpiCard('Aptos', pmAptos.length, total > 0 ? `${Math.round(pmAptos.length/total*100)}% do efetivo` : '—', '#4bc87a', 'aptos') +
    kpiCard('Afastamentos', pmAfastados.length, tiposSub, pmAfastados.length > 0 ? '#e05555' : 'var(--tx3)', 'afastados') +
    kpiCard('Em Restrição', pmComRestricao.length,
      [pmComRestricaoEfetivo.length ? _kpiRow('Planilha P1', pmComRestricaoEfetivo.length, '#c8a84b') : '',
       pmComRestricaoUis.length ? _kpiRow('Restrição UIS', pmComRestricaoUis.length, '#5a9de0') : '',
       vencendoRestricao.length ? `<div style="color:#e05555;font-size:17px;padding:4px 0">⚠ ${vencendoRestricao.length} vencem em 30d</div>` : ''].filter(Boolean).join('') || '—',
      pmComRestricao.length > 0 ? '#c8a84b' : 'var(--tx3)', 'restricao') +
    kpiCard(`EAP / TAF / TAT ${anoAtual}`, pmEapFeito.length,
      [_kpiRow('Realizaram', pmEapFeito.length, '#4bc87a'),
       _kpiRow('Pendentes', pmEapPendente.length, '#c8a84b'),
       ...(inaptosTaf.length ? [_kpiRow('Inaptos TAF', inaptosTaf.length, '#e05555')] : []),
       ...(inaptosTat.length ? [_kpiRow('Inaptos TAT', inaptosTat.length, '#e05555')] : []),
       ...(taftatVencidos.length ? [_kpiRow('Vencidos', taftatVencidos.length, '#e05555')] : [])
      ].join(''),
      (inaptosTaf.length || inaptosTat.length || taftatVencidos.length) ? '#e05555' : pmEapPendente.length > 0 ? '#c8a84b' : '#4bc87a', 'eap') +
    kpiCard('Controle de Férias', ferEmGozo.length,
      [_kpiRow('Em gozo', ferEmGozo.length, '#5a9de0'), _kpiRow('Iniciam em 15d', ferEm15Dias.length, '#5a9de0')].join(''),
      ferEmGozo.length > 0 ? '#5a9de0' : 'var(--tx3)', 'ferias') +
    (() => {
      if (!p1Quadro.length) return '';
      const excl = s => /cfp|uis\s*m[eé]d|uis\s*odonto/i.test(s||'');
      const qRows = p1Quadro.filter(q => !excl(q.opm));
      const gtFx = qRows.reduce((a,q) => a + (Number(q.fx_total)||0), 0);
      const gtEx = qRows.reduce((a,q) => a + (Number(q.ex_total)||0), 0);
      const gtClaro = gtFx - gtEx;
      const gtPct = gtFx > 0 ? ((gtClaro/gtFx)*100).toFixed(1)+'%' : '—';
      const cor = gtClaro < 0 ? '#e05555' : gtClaro === 0 ? '#c8a84b' : '#4bc87a';
      // Agrupa por CIA e calcula saldo
      const byCiaKpi = {};
      qRows.forEach(q => {
        const c = (q.cia||'').trim() || '—';
        if (!byCiaKpi[c]) byCiaKpi[c] = { fx: 0, ex: 0 };
        byCiaKpi[c].fx += Number(q.fx_total)||0;
        byCiaKpi[c].ex += Number(q.ex_total)||0;
      });
      const ciaStatusRows = Object.entries(byCiaKpi).sort(([a],[b])=>a.localeCompare(b)).map(([cia, d]) => {
        const saldo = d.fx - d.ex;
        const statusCor = saldo < 0 ? '#e05555' : '#4bc87a';
        const statusTxt = saldo < 0 ? `+${Math.abs(saldo)} exc.` : saldo === 0 ? 'OK' : `−${saldo} vgs`;
        const ciaCor = ciaCorByName(cia);
        return `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:${ciaCor};font-size:17px;font-weight:700">${cia}</span><span style="color:${statusCor};font-weight:700;font-size:18px">${statusTxt}</span></div>`;
      }).join('');
      const sub = ciaStatusRows + `<div style="margin-top:6px">${_kpiRow('FX Total', gtFx, '#ffffff')}${_kpiRow('EX Total', gtEx, '#ffffff')}</div>`;
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
        <td style="${tdL};cursor:pointer" onclick="openProntuario('${_fotoRe}')">${r.nome_guerra || r.nome}${uisBadge(r.re)}</td>
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
      return n ? `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:1px 0"><span style="font-family:'DM Mono',monospace;font-size:18px;color:var(--tx3)">${CATS[k]}</span><span style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;color:${CATS_COLOR[k]}">${n}</span></div>` : '';
    }).filter(Boolean).join('');

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
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);text-align:right">efetivo<br><span style="font-size:22px;font-weight:700;color:var(--tx)">${s.total}</span></div>
      </div>
      <div style="background:rgba(255,255,255,.06);border-radius:4px;height:5px;overflow:hidden;margin-bottom:10px">
        <div style="height:100%;width:${s.pct}%;background:${s.color};border-radius:4px;transition:width .5s ease"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:14px;text-align:center">
        <div style="background:rgba(255,255,255,.03);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;color:${s.color};line-height:1">${s.pct}%</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-top:1px">DISP</div>
        </div>
        <div style="background:rgba(75,200,122,.07);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;color:#4bc87a;line-height:1">${s.aptos}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#4bc87a;margin-top:1px">APTOS</div>
        </div>
        <div style="background:rgba(230,100,100,.07);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;color:${s.afst>0?'#e05555':'var(--tx3)'};line-height:1">${s.afst}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:${s.afst>0?'#e05555':'var(--tx3)'};margin-top:1px">AFST</div>
        </div>
        <div style="background:rgba(200,168,75,.07);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;color:${s.restr>0?'#c8a84b':'var(--tx3)'};line-height:1">${s.restr}</div>
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
      return n ? `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:1px 0"><span style="font-family:'DM Mono',monospace;font-size:18px;color:var(--tx3)">${CATS[k]}</span><span style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:700;color:${CATS_COLOR[k]}">${n}</span></div>` : '';
    }).filter(Boolean).join('');
    return `<div class="p1-uc" data-unit="${unit.replace(/"/g,'&quot;')}" onclick="p1ShowUnit('${_esc}')"
      style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid ${s.color};border-radius:10px;padding:20px;cursor:pointer;transition:all .2s"
      onmouseover="if(!this.classList.contains('sel')){this.style.boxShadow='0 4px 16px rgba(0,0,0,.3)';this.style.transform='translateY(-2px)'}"
      onmouseout="if(!this.classList.contains('sel')){this.style.boxShadow='';this.style.transform=''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px">40º BPM/I</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:800;color:${s.color};letter-spacing:.5px;line-height:1">${unit}</div>
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);text-align:right">efetivo<br><span style="font-size:22px;font-weight:700;color:var(--tx)">${d.length}</span></div>
      </div>
      <div style="background:rgba(255,255,255,.06);border-radius:4px;height:5px;overflow:hidden;margin-bottom:10px">
        <div style="height:100%;width:${s.pct}%;background:${s.color};border-radius:4px;transition:width .5s ease"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:14px;text-align:center">
        <div style="background:rgba(255,255,255,.03);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;color:${s.color};line-height:1">${s.pct}%</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-top:1px">DISP</div>
        </div>
        <div style="background:rgba(75,200,122,.07);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;color:#4bc87a;line-height:1">${s.aptos}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#4bc87a;margin-top:1px">APTOS</div>
        </div>
        <div style="background:rgba(230,100,100,.07);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;color:${s.afst>0?'#e05555':'var(--tx3)'};line-height:1">${s.afst}</div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:${s.afst>0?'#e05555':'var(--tx3)'};margin-top:1px">AFST</div>
        </div>
        <div style="background:rgba(200,168,75,.07);border-radius:5px;padding:7px 4px">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;color:${s.restr>0?'#c8a84b':'var(--tx3)'};line-height:1">${s.restr}</div>
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
      bottomItems.push({ order: 0, html: `<div style="display:grid;grid-template-columns:170px 1fr auto;align-items:center;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04);border-left:3px solid #e05555;gap:14px">
        ${badge(tipo.split(',')[0].trim().toUpperCase(), '#e05555')}
        <div>
          <span style="font-family:'DM Mono',monospace;font-size:18px;color:var(--tx3)">${r.posto||''}</span>
          <span style="font-size:20px;font-weight:700;color:var(--tx);margin-left:6px;cursor:pointer" onclick="openProntuario('${_esc2(r.re)}')">${r.nome_guerra||r.nome}</span>${uisBadge(r.re)}
          ${r.opm ? `<div style="font-size:17px;color:var(--tx3);margin-top:2px">${r.opm}</div>` : ''}
        </div>
        <div style="font-size:19px;color:var(--tx3);text-align:right;white-space:nowrap">${retStr}</div>
      </div>` });
    });
  }

  // Alertas existentes (restrições, retornos, férias/LP em 30d)
  if (vencendoRestricao.length) {
    vencendoRestricao.forEach(r => {
      const dias = Math.ceil((new Date(r.restricao_termino) - new Date(hoje)) / 86400000);
      bottomItems.push({ order: 1, html: `<div style="display:grid;grid-template-columns:170px 1fr auto;align-items:center;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04);border-left:3px solid #c8a84b;gap:14px">
        ${badge('RESTRIÇÃO', '#c8a84b')}
        <div>
          <span style="font-size:20px;font-weight:700;color:var(--tx)">${r.nome_guerra||r.nome}</span>
          ${r.opm ? `<div style="font-size:17px;color:var(--tx3);margin-top:2px">${r.opm}</div>` : ''}
        </div>
        <div style="font-size:19px;color:var(--tx3);text-align:right;white-space:nowrap">Vence em <b style="color:#c8a84b">${dias}d</b> · ${fmtDate(r.restricao_termino)}</div>
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
      bottomItems.push({ order: 3, html: `<div style="display:grid;grid-template-columns:170px 1fr auto;align-items:center;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04);border-left:3px solid ${cor};gap:14px">
        ${badge(label, cor)}
        <div>
          <span style="font-family:'DM Mono',monospace;font-size:18px;color:var(--tx3)">${pm?.posto||''}</span>
          <span style="font-size:20px;font-weight:700;color:var(--tx);margin-left:6px">${pm?.nome_guerra||pm?.nome||a.re}</span>
          ${pm?.opm ? `<div style="font-size:17px;color:var(--tx3);margin-top:2px">${pm.opm}</div>` : ''}
        </div>
        <div style="font-size:19px;color:var(--tx3);text-align:right;white-space:nowrap">Inicia em <b style="color:${cor}">${diasAte}d</b> · ${fmtDate(a.inicio)} → ${fmtDate(a.termino)}</div>
      </div>` });
    });
  }

  const nowItems  = bottomItems.filter(i => i.order <= 1); // afastados agora + restrições
  const nextItems = bottomItems.filter(i => i.order >= 3); // próximos afastamentos

  const mkBlock = (titulo, cor, items) => !items.length ? '' : `
    <div style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;margin-top:14px;overflow:hidden">
      <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:${cor};padding:10px 16px 8px;text-transform:uppercase;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:10px">
        <span>${titulo}</span>
        <span style="background:${cor}28;color:${cor};border-radius:20px;padding:1px 10px;font-size:17px;letter-spacing:0">${items.length}</span>
      </div>
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
        <td style="${tdL};cursor:pointer" onclick="openProntuario('${esc(r.re)}')">${r.nome_guerra||r.nome}${uisBadge(r.re)}</td>
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
      <td style="${tdL};cursor:pointer" onclick="openProntuario('${esc(r.re)}')">${r.nome_guerra||r.nome}${uisBadge(r.re)}</td>
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
    const listEfetivo = dataF.filter(r => (r.possui_restricao||'').toLowerCase().startsWith('s'));
    const listUisOnly = dataF.filter(r => !(r.possui_restricao||'').toLowerCase().startsWith('s') && hasUisRestr(r.re));
    const listAll = [...listEfetivo, ...listUisOnly];
    const rows = listAll.map(r => {
      const isUisOnly = !(r.possui_restricao||'').toLowerCase().startsWith('s') && hasUisRestr(r.re);
      let termino = r.restricao_termino || null;
      let tipoR = r.tipos_restricao || '—';
      if (isUisOnly) {
        const uisRecs = (_uisRestMap || {})[uisNormRE(r.re)] || [];
        termino = uisRecs.map(x => x.termino).filter(Boolean).sort().pop() || null;
        tipoR = 'Restrição UIS';
      }
      const dias = termino ? Math.ceil((new Date(termino) - new Date(hoje)) / 86400000) : null;
      const cor  = dias === null ? 'var(--tx3)' : dias <= 0 ? '#e05555' : dias <= 30 ? '#c8a84b' : '#4bc87a';
      return `<tr>
        <td style="${tdL};cursor:pointer" onclick="openProntuario('${esc(r.re)}')">${r.nome_guerra||r.nome}${uisBadge(r.re)}</td>
        <td style="${tdS}">${r.posto||'—'}</td>
        <td style="${tdS}">${r.opm||'—'}</td>
        <td style="${tdS};color:var(--tx2)">${tipoR}</td>
        <td style="${tdS};text-align:right">${fmtD(termino)}</td>
        <td style="${tdS};text-align:right;color:${cor};font-weight:700">${dias!==null?(dias<0?'Vencida':dias+'d'):'—'}</td>
      </tr>`;
    }).join('');
    html = wrapDetail('Em Restrição', listAll.length, '#c8a84b', closeBtn,
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
      <td style="${pC};${cL};cursor:pointer" onclick="openProntuario('${esc(r.re)}')">${r.nome_guerra||r.nome}${uisBadge(r.re)}</td>
      <td style="${pC};${cS}">${r.opm||'—'}</td>
      <td style="${pC};${cS};color:#4bc87a">${fmtEap(r.data_eap)}</td>
      <td style="${pC};text-align:center">${notaBadge(r.taf)}</td>
      <td style="${pC};text-align:center">${notaBadge(r.tat)}</td>
    </tr>`;
    const mkRow5nota = (r, campo, notaFn) => `<tr>
      <td style="${pC};${cS}">${r.posto||'—'}</td>
      <td style="${pC};${cS}">${r.re}</td>
      <td style="${pC};${cL};cursor:pointer" onclick="openProntuario('${esc(r.re)}')">${r.nome_guerra||r.nome}${uisBadge(r.re)}</td>
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
            <td style="${pC};${cL};cursor:pointer" onclick="openProntuario('${esc(r.re)}')">${r.nome_guerra||r.nome}${uisBadge(r.re)}</td>
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
        <td style="${tdL};cursor:pointer" onclick="openProntuario('${esc(r.re)}')">${r.nome_guerra||r.nome}${uisBadge(r.re)}</td>
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
    const excl = s => /cfp|uis\s*m[eé]d|uis\s*odonto|sede\s*em|\bem\b/i.test(s||'');
    const qRows = p1Quadro.filter(q => !excl(q.opm) && !excl(q.municipio));

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

    const thH  = 'padding:8px 14px;border-bottom:1px solid var(--bd2);font-family:"DM Mono",monospace;font-size:19px;letter-spacing:1px;text-transform:uppercase;color:#ffffff;text-align:center;white-space:nowrap';
    const thHL = thH + ';text-align:left';
    const tdc  = 'padding:7px 14px;border-bottom:1px solid rgba(255,255,255,.04);font-family:"DM Mono",monospace;font-size:19px;text-align:center;white-space:nowrap';
    const tdcL = 'padding:7px 14px;border-bottom:1px solid rgba(255,255,255,.04);font-size:19px;font-weight:600;color:var(--tx);white-space:nowrap';

    // Agrupa por CIA inferida
    const byCia = {};
    qRows.forEach(q => {
      const c = getCia(q);
      if (!byCia[c]) byCia[c] = [];
      byCia[c].push(q);
    });
    const cias = Object.keys(byCia).sort();

    // Rankings por CIA — inclui todas as CIAs, mesmo com 0%
    const mkRankByCia = (items) => items.map((r,i) => {
      const pct = r.fx > 0 ? Math.min((r.claro/r.fx)*100, 100).toFixed(0) : 0;
      const cor = ciaCorByName(r.cia);
      const valColor = r.claro > 0 ? '#e05555' : '#4bc87a';
      const bar = `<div style="height:8px;border-radius:2px;background:rgba(255,255,255,.06);overflow:hidden;margin-top:3px"><div style="height:100%;width:${pct}%;background:${cor};border-radius:2px"></div></div>`;
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div style="flex:1;min-width:0">
          <span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3)">${i+1}. </span>
          <span style="font-size:19px;font-weight:700;color:${cor}">${r.cia}</span>
          ${bar}
        </div>
        <span style="font-family:'DM Mono',monospace;font-size:19px;font-weight:800;color:${valColor};white-space:nowrap">${r.claro > 0 ? `−${r.claro}` : r.claro < 0 ? `+${Math.abs(r.claro)}` : '0'} <span style="font-size:17px;font-weight:400;color:#ffffff">(${pct}%)</span></span>
      </div>`;
    }).join('');

    const rankCb = cias.map(cia => {
      const rows = byCia[cia];
      const fx = rows.reduce((a,q)=>a+(Number(q.fx_cb_sd)||0),0);
      const ex = rows.reduce((a,q)=>a+(Number(q.ex_cb_sd)||0),0);
      return { cia, claro: fx-ex, fx };
    }).sort((a,b) => (b.fx>0?b.claro/b.fx:0) - (a.fx>0?a.claro/a.fx:0));

    const rankSub = cias.map(cia => {
      const rows = byCia[cia];
      const fx = rows.reduce((a,q)=>a+(Number(q.fx_subten_sgt)||0),0);
      const ex = rows.reduce((a,q)=>a+(Number(q.ex_subten_sgt)||0),0);
      return { cia, claro: fx-ex, fx };
    }).sort((a,b) => (b.fx>0?b.claro/b.fx:0) - (a.fx>0?a.claro/a.fx:0));

    let rankHtml = '';
    if (cias.length) {
      // Rankings por município
      const mkRankByMun = (items) => items.map((r,i) => {
        const pct = r.fx > 0 ? Math.min((r.claro/r.fx)*100,100).toFixed(0) : 0;
        const cor = ciaCorByName(r.cia);
        const valColor = r.claro > 0 ? '#e05555' : '#4bc87a';
        const bar = `<div style="height:6px;border-radius:2px;background:rgba(255,255,255,.06);overflow:hidden;margin-top:3px"><div style="height:100%;width:${Math.max(0,pct)}%;background:${cor};border-radius:2px"></div></div>`;
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div style="flex:1;min-width:0">
            <span style="font-family:'DM Mono',monospace;font-size:17px;color:var(--tx3)">${i+1}. </span>
            <span style="font-size:17px;font-weight:700;color:#ffffff">${r.mun}</span>
            <span style="font-size:15px;color:${cor};margin-left:5px">${r.cia}</span>
            ${bar}
          </div>
          <span style="font-family:'DM Mono',monospace;font-size:17px;font-weight:800;color:${valColor};white-space:nowrap">${r.claro>0?`−${r.claro}`:r.claro<0?`+${Math.abs(r.claro)}`:'0'} <span style="font-size:15px;font-weight:400;color:#ffffff">(${pct}%)</span></span>
        </div>`;
      }).join('');

      const rankMunCb = [...qRows].map(q => {
        const fx=Number(q.fx_cb_sd)||0, ex=Number(q.ex_cb_sd)||0;
        return { mun:q.municipio||q.opm||'—', cia:getCia(q), claro:fx-ex, fx };
      }).sort((a,b)=>(b.fx>0?b.claro/b.fx:0)-(a.fx>0?a.claro/a.fx:0));

      const rankMunSub = [...qRows].map(q => {
        const fx=Number(q.fx_subten_sgt)||0, ex=Number(q.ex_subten_sgt)||0;
        return { mun:q.municipio||q.opm||'—', cia:getCia(q), claro:fx-ex, fx };
      }).sort((a,b)=>(b.fx>0?b.claro/b.fx:0)-(a.fx>0?a.claro/a.fx:0));

      rankHtml = `
        <div style="padding:14px 18px;border-bottom:1px solid var(--bd);display:grid;grid-template-columns:1fr 1fr;gap:24px">
          <div>
            <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:#ffffff;text-transform:uppercase;margin-bottom:10px">Cb / Sd — Por CIA</div>
            <div style="display:flex;flex-direction:column;gap:10px">${mkRankByCia(rankCb)}</div>
          </div>
          <div>
            <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:#ffffff;text-transform:uppercase;margin-bottom:10px">Subten / Sgt — Por CIA</div>
            <div style="display:flex;flex-direction:column;gap:10px">${mkRankByCia(rankSub)}</div>
          </div>
        </div>
        <div style="padding:14px 18px;border-bottom:1px solid var(--bd);display:grid;grid-template-columns:1fr 1fr;gap:24px">
          <div>
            <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:#ffffff;text-transform:uppercase;margin-bottom:10px">Cb / Sd — Por Cidade</div>
            <div style="display:flex;flex-direction:column;gap:8px">${mkRankByMun(rankMunCb)}</div>
          </div>
          <div>
            <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:#ffffff;text-transform:uppercase;margin-bottom:10px">Subten / Sgt — Por Cidade</div>
            <div style="display:flex;flex-direction:column;gap:8px">${mkRankByMun(rankMunSub)}</div>
          </div>
        </div>`;
    }

    let bodyQ = '';
    // Acumula totais por posto separadamente — nunca misturar St/Sgt com Cb/Sd
    let gtFxSub=0, gtCSub=0, gtFxCb=0, gtCCb=0;

    cias.forEach(cia => {
      const rows = byCia[cia];
      const ciaCor = ciaCorByName(cia);
      bodyQ += `<tr><td colspan="8" style="padding:9px 16px 5px;background:${ciaCor}12;border-top:1px solid ${ciaCor}44;border-bottom:1px solid ${ciaCor}28;font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:${ciaCor};text-transform:uppercase;font-weight:700">${cia}</td></tr>`;
      let cExSub=0, cCSub=0, cExCb=0, cCCb=0;
      rows.forEach(q => {
        const fxSub = Number(q.fx_subten_sgt)||0, exSub = Number(q.ex_subten_sgt)||0;
        const fxCb  = Number(q.fx_cb_sd)||0,      exCb  = Number(q.ex_cb_sd)||0;
        const cS = fxSub - exSub;
        const cC = fxCb  - exCb;
        cExSub+=exSub; cCSub+=cS; cExCb+=exCb; cCCb+=cC;
        bodyQ += `<tr>
          <td style="${tdcL}">${q.municipio||'—'}</td>
          <td style="${tdcL};font-weight:400;font-size:19px;color:var(--tx3)">${q.opm||'—'}</td>
          <td style="${tdc};color:#ffffff;font-weight:700">${exSub}</td>
          <td style="${tdc};font-size:19px;font-weight:800;color:${cColor(cS)}">${cVal(cS)}</td>
          <td style="${tdc};font-size:19px;color:${cColor(cS)}">${cPct(cS,fxSub)}</td>
          <td style="${tdc};color:#ffffff;font-weight:700">${exCb}</td>
          <td style="${tdc};font-size:19px;font-weight:800;color:${cColor(cC)}">${cVal(cC)}</td>
          <td style="${tdc};font-size:19px;color:${cColor(cC)}">${cPct(cC,fxCb)}</td>
        </tr>`;
      });
      // Subtotal CIA
      const cFxSubTot = rows.reduce((a,q)=>a+(Number(q.fx_subten_sgt)||0),0);
      const cFxCbTot  = rows.reduce((a,q)=>a+(Number(q.fx_cb_sd)||0),0);
      bodyQ += `<tr style="background:rgba(255,255,255,.03);border-top:1px solid rgba(255,255,255,.07)">
        <td style="${tdcL};color:${ciaCor};font-size:19px;letter-spacing:.5px" colspan="2">Subtotal ${cia}</td>
        <td style="${tdc};color:#fff;font-weight:700">${cExSub}</td>
        <td style="${tdc};font-size:19px;font-weight:800;color:${cColor(cCSub)}">${cVal(cCSub)}</td>
        <td style="${tdc};font-size:19px;color:${cColor(cCSub)}">${cPct(cCSub,cFxSubTot)}</td>
        <td style="${tdc};color:#fff;font-weight:700">${cExCb}</td>
        <td style="${tdc};font-size:19px;font-weight:800;color:${cColor(cCCb)}">${cVal(cCCb)}</td>
        <td style="${tdc};font-size:19px;color:${cColor(cCCb)}">${cPct(cCCb,cFxCbTot)}</td>
      </tr>`;
      gtFxSub+=cFxSubTot; gtCSub+=cCSub; gtFxCb+=cFxCbTot; gtCCb+=cCCb;
    });

    // Total geral — St/Sgt e Cb/Sd totalmente separados, sem somar entre si
    if (qRows.length) {
      bodyQ += `<tr style="border-top:2px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05)">
        <td style="${tdcL};text-transform:uppercase;font-size:19px;letter-spacing:1px;color:var(--tx2)" colspan="2">Total Geral</td>
        <td style="${tdc};color:#fff;font-weight:700;font-size:19px">${qRows.reduce((a,q)=>a+(Number(q.ex_subten_sgt)||0),0)}</td>
        <td style="${tdc};font-size:19px;font-weight:900;color:${cColor(gtCSub)}">${cVal(gtCSub)}</td>
        <td style="${tdc};font-size:19px;color:${cColor(gtCSub)}">${cPct(gtCSub,gtFxSub)}</td>
        <td style="${tdc};color:#fff;font-weight:700;font-size:19px">${qRows.reduce((a,q)=>a+(Number(q.ex_cb_sd)||0),0)}</td>
        <td style="${tdc};font-size:19px;font-weight:900;color:${cColor(gtCCb)}">${cVal(gtCCb)}</td>
        <td style="${tdc};font-size:19px;color:${cColor(gtCCb)}">${cPct(gtCCb,gtFxCb)}</td>
      </tr>`;
    }

    // Insights automáticos por CIA ordenados por % claro Cb/Sd
    const insightsCia = cias.map(cia => {
      const rows = byCia[cia];
      const fxCb  = rows.reduce((a,q)=>a+(Number(q.fx_cb_sd)||0),0);
      const exCb  = rows.reduce((a,q)=>a+(Number(q.ex_cb_sd)||0),0);
      const fxSub = rows.reduce((a,q)=>a+(Number(q.fx_subten_sgt)||0),0);
      const exSub = rows.reduce((a,q)=>a+(Number(q.ex_subten_sgt)||0),0);
      const claroCb  = fxCb  - exCb;
      const claroSub = fxSub - exSub;
      const pctCb  = fxCb  > 0 ? (claroCb /fxCb *100)  : 0;
      const pctSub = fxSub > 0 ? (claroSub/fxSub*100) : 0;
      return { cia, claroCb, claroSub, pctCb, pctSub, cor: ciaCorByName(cia) };
    }).filter(d => d.claroCb > 0 || d.claroSub > 0).sort((a,b) => b.pctCb - a.pctCb);

    const urgIcon = pct => pct >= 40 ? '🔴' : pct >= 20 ? '🟡' : '🟢';

    // Insights por cidade
    const insightsMun = qRows.map(q => {
      const fxCb  = Number(q.fx_cb_sd)||0,      exCb  = Number(q.ex_cb_sd)||0;
      const fxSub = Number(q.fx_subten_sgt)||0, exSub = Number(q.ex_subten_sgt)||0;
      const claroCb  = fxCb  - exCb;
      const claroSub = fxSub - exSub;
      const pctCb  = fxCb  > 0 ? (claroCb /fxCb *100)  : 0;
      const pctSub = fxSub > 0 ? (claroSub/fxSub*100) : 0;
      return { mun: q.municipio||q.opm||'—', cia: getCia(q), claroCb, claroSub, pctCb, pctSub };
    }).filter(d => d.claroCb > 0 || d.claroSub > 0).sort((a,b) => b.pctCb - a.pctCb);

    const mkInsightCard = (d, i, total, isCia) => {
      const cor = isCia ? ciaCorByName(d.cia||d.mun) : ciaCorByName(d.cia);
      const nome = isCia ? d.cia : d.mun;
      const sub  = isCia ? '' : `<span style="font-size:14px;color:${cor};margin-left:6px">${d.cia}</span>`;
      const rank = i === 0 ? 'MAIOR NECESSIDADE' : i === total-1 ? 'MENOR NECESSIDADE' : '';
      return `<div style="background:var(--s2);border:1px solid var(--bd);border-left:3px solid ${cor};border-radius:8px;padding:14px 16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
          <span style="font-family:'DM Mono',monospace;font-size:17px;font-weight:700;color:${cor};text-transform:uppercase">${nome}</span>${sub}
          ${rank ? `<span style="font-size:12px;font-family:'DM Mono',monospace;color:var(--gold2);letter-spacing:1px">${rank}</span>` : ''}
        </div>
        ${d.claroCb > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="color:#ffffff;font-size:16px">Cb/Sd: faltam <strong style="color:#e05555">${d.claroCb}</strong> PMs</span>
          <span style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:800;color:#e05555">${urgIcon(d.pctCb)} ${d.pctCb.toFixed(0)}% claro</span>
        </div>` : '<div style="color:#4bc87a;font-size:16px;margin-bottom:4px">✓ Cb/Sd dentro do fixado</div>'}
        ${d.claroSub > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center">
          <span style="color:#ffffff;font-size:16px">Subten/Sgt: faltam <strong style="color:#e05555">${d.claroSub}</strong> PMs</span>
          <span style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:800;color:#e05555">${urgIcon(d.pctSub)} ${d.pctSub.toFixed(0)}% claro</span>
        </div>` : '<div style="color:#4bc87a;font-size:16px">✓ Subten/Sgt dentro do fixado</div>'}
      </div>`;
    };

    const insightsHtml = (insightsCia.length || insightsMun.length) ? `
      <div style="padding:16px 20px;border-bottom:1px solid var(--bd);background:rgba(255,255,255,.02)">
        <div style="font-family:'DM Mono',monospace;font-size:18px;letter-spacing:2px;color:var(--gold2);text-transform:uppercase;margin-bottom:12px">⚡ Insights — Necessidade de Efetivo por CIA</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:20px">
          ${insightsCia.map((d,i) => mkInsightCard(d, i, insightsCia.length, true)).join('')}
        </div>
        ${insightsMun.length ? `
        <div style="font-family:'DM Mono',monospace;font-size:18px;letter-spacing:2px;color:var(--gold2);text-transform:uppercase;margin-bottom:12px">⚡ Insights — Necessidade de Efetivo por Cidade</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">
          ${insightsMun.map((d,i) => mkInsightCard(d, i, insightsMun.length, false)).join('')}
        </div>` : ''}
      </div>` : '';

    const tableHdr = `<table style="width:100%;border-collapse:collapse;table-layout:fixed">
      <colgroup>
        <col style="width:18%"><col style="width:10%">
        <col style="width:10%"><col style="width:9%"><col style="width:8%">
        <col style="width:10%"><col style="width:9%"><col style="width:8%">
      </colgroup>
      <thead><tr>
        <th style="${thHL}">Município</th>
        <th style="${thHL}">OPM</th>
        <th style="${thH}">Subten/Sgt EX</th>
        <th style="${thH}">Claro</th>
        <th style="${thH}">%</th>
        <th style="${thH}">Cb/Sd EX</th>
        <th style="${thH}">Claro</th>
        <th style="${thH}">%</th>
      </tr></thead>
      <tbody>${bodyQ || '<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--tx3);font-size:19px">Nenhum dado. Importe o CSV pelo menu lateral.</td></tr>'}</tbody>
    </table>`;

    html = wrapDetail('Quadro Fixado do Efetivo', null, '#4bc87a', closeBtn, rankHtml + insightsHtml + tableHdr);
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
          <input type="number" name="vaga-opm" autocomplete="off" min="0" value="${vagas}" onchange="saveVaga('${opm.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}', this.value, this)"
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
      <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px;margin-top:2px">
        <div style="font-size:19px;padding:2px 8px;border-radius:10px;background:${statusColor}22;color:${statusColor};font-family:'DM Mono',monospace">${statusTxt}</div>
        ${uisBadge(r.re)}
      </div>
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
      ['pvs',              'PVS — Vigilância Solidária',       '#e8a040'],
      ['conseg',           'CONSEG',                           '#3db8a4'],
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
  if (id === 'uis') {
    loadUisSection();
  }
  setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
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
  setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
}

