// ═══════════════════════════════════════════════════════════════════════════
// PRODUTIVIDADE P3 — indicadores operacionais (#page-p3prod)
// Tabelas/categorias: ocorrências, presos, armas, veículos, entorpecentes,
//   visita solidária, tempo de resposta, cursos, PVS, CONSEG
// Cada categoria tem upload CSV próprio via openProdUpl(tipo).
// Dados armazenados em prodRaw[tipo] após loadProdData().
// Filtros: prodSelAno, prodSelMeses, prodSelCia
// Cards clicáveis abrem modal de detalhe (pdOpen) com gráficos por CIA e natureza.
// ═══════════════════════════════════════════════════════════════════════════
let prodRaw = { ocorrencias: [], presos: [], armas: [], veiculos: [], entorpecentes: [], visitaSolidaria: [], tempoResposta: [], cursos: [], pvs: [], conseg: [], loaded: false };
let _trNatCiaData = {}; // { natureza: [{cia, pct, taloes, fora}, ...] } — populado em renderTRModalDetail
let _taftatData   = null;
let _taftatTab    = 'taf';
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
  taftat:           '#7b8cde',
  pvs:              '#e8a040',
  conseg:           '#3db8a4'
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
  'taftat':           'TAF / TAT',
  'pvs':              'PVS — Vigilância Solidária',
  'conseg':           'CONSEG'
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
  ['ocorrencias','presos','armas','veiculos','entorpecentes','visitaSolidaria','tempoResposta','cursos','conseg'].forEach(k => {
    if (Array.isArray(prodRaw[k])) prodRaw[k].forEach(r => r.ano && all.add(r.ano));
  });
  return [...all].sort((a, b) => b - a);
}

function prodGetMesesDisp(ano) {
  const all = new Set();
  ['ocorrencias','presos','armas','veiculos','entorpecentes','visitaSolidaria','tempoResposta','cursos','conseg'].forEach(k => {
    if (Array.isArray(prodRaw[k]))
      prodRaw[k].filter(r => !ano || r.ano === ano).forEach(r => r.mes && all.add((r.mes||'').toLowerCase()));
  });
  return MES_ORD.filter(m => all.has(m.toLowerCase()));
}

function prodGetCiasDisp() {
  const all = new Set();
  ['ocorrencias','presos','armas','veiculos','entorpecentes','visitaSolidaria','tempoResposta','conseg'].forEach(k => {
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
  h += `<div class="pf-field"><span class="pf-label">ANO</span><select name="prod-ano" autocomplete="off" class="pf-select" onchange="prodSetAno(+this.value)">`;
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
  h += `<div class="pf-field"><span class="pf-label">CIA</span><select name="prod-cia" autocomplete="off" class="pf-select" onchange="prodSetCia(this.value)">`;
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
        <div class="kpi-top"></div>
        <div class="kpi-lbl">${PROD_LABELS[t]}</div>
        <div class="kpi-val">${totais[t].toLocaleString('pt-BR')}</div>
        <div class="kpi-sub">${periodoLbl}</div>
        <div class="kpi-hint">▸ clique p/ detalhes</div>
      </div>`
    ).join('') +
    (() => {
      if (!unidadesEntorp.length) return `<div class="kpi" onclick="openProdDetail('entorpecentes')" title="Clique para detalhes" style="cursor:pointer">
        <div class="kpi-top"></div>
        <div class="kpi-lbl">${PROD_LABELS.entorpecentes}</div>
        <div class="kpi-val">—</div>
        <div class="kpi-sub">${periodoLbl}</div>
        <div class="kpi-hint">▸ clique p/ detalhes</div>
      </div>`;
      const totAtivo = prodSum(filt.entorpecentes.filter(r => (r.unidade_medida||'Sem unidade').trim() === prodEntorpUnit), 'quantidade');
      const pills = unidadesEntorp.map(u =>
        `<button class="pf-btn${u===prodEntorpUnit?' on':''}" data-eunit="${u.replace(/"/g,'&quot;')}" onclick="event.stopPropagation();switchEntorpUnit('${u.replace(/'/g,"\\'")}','kpi')" style="font-size:18px;padding:2px 7px;line-height:1.4">${u}</button>`
      ).join('');
      return `<div class="kpi" onclick="openProdDetail('entorpecentes',prodEntorpUnit)" title="Clique para detalhes" style="cursor:pointer">
        <div class="kpi-top"></div>
        <div class="kpi-lbl">${PROD_LABELS.entorpecentes}</div>
        <div class="kpi-val" id="entorp-kpi-val">${totAtivo.toLocaleString('pt-BR')}</div>
        <div style="display:flex;gap:3px;flex-wrap:wrap;justify-content:center;margin:6px 0">${pills}</div>
        <div class="kpi-sub">${periodoLbl}</div>
        <div class="kpi-hint">▸ clique p/ detalhes</div>
      </div>`;
    })() +
    `<div class="kpi" onclick="openProdDetail('ocorrencias',null,'${VD_NAT}')" title="Clique para detalhes" style="cursor:pointer">
      <div class="kpi-top"></div>
      <div class="kpi-lbl">Visita Solidária</div>
      <div class="kpi-val">${totVD.toLocaleString('pt-BR')}</div>
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
      const trCls = trGlobal >= 70 ? ' pos' : trGlobal >= 40 ? ' warn' : ' neg';
      return `<div class="kpi" onclick="openProdDetail('tempo-resposta')" title="Clique para detalhes" style="cursor:pointer">
        <div class="kpi-top"></div>
        <div class="kpi-lbl">Tempo Resposta Atend. Ocorrência</div>
        <div class="kpi-val${trCls}">${parseFloat(trGlobal.toFixed(1))}%</div>
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
        <div class="kpi-top"></div>
        <div class="kpi-lbl">Cursos Institucionais</div>
        <div class="kpi-val">${cursosUnicos.size}</div>
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
      const pctAptos = comTaf.length ? Math.round(aptosMB365 / comTaf.length * 100) : 0;
      const tafCor = pctAptos >= 70 ? '#4bc87a' : pctAptos >= 40 ? '#e8b840' : '#e05555';
      return `<div class="kpi" onclick="openProdDetail('taftat')" title="Clique para detalhes" style="cursor:pointer">
        <div class="kpi-top"></div>
        <div class="kpi-lbl">TAF / TAT</div>
        <div class="kpi-val">${pctAptos}%</div>
        <div class="kpi-sub" style="margin-top:4px">${aptosMB365}/${comTaf.length} aptos MB+</div>
        <div class="kpi-hint" style="margin-top:10px">▸ clique p/ detalhes</div>
      </div>`;
    })() +
    (() => {
      const PVS_COR = PROD_CORES.pvs;
      const pvsData = (prodRaw.pvs||[]).filter(r => !prodSelAno || r.ano === prodSelAno);
      if (!pvsData.length) return '';
      const totalMuns = new Set(pvsData.map(r => r.municipio)).size;
      const totalFamilias = pvsData.reduce((s, r) => s + (r.familias_atendidas || 0), 0);
      const allNotas = pvsData.filter(r => r.nota_eficacia).map(r => r.nota_eficacia);
      const mediaNota = allNotas.length ? (allNotas.reduce((s, n) => s + n, 0) / allNotas.length).toFixed(1) : null;
      return `<div class="kpi" onclick="openProdDetail('pvs')" title="Clique para detalhes" style="cursor:pointer">
        <div class="kpi-top"></div>
        <div class="kpi-lbl">PVS — Vig. Solidária</div>
        <div class="kpi-val">${totalFamilias.toLocaleString('pt-BR')}</div>
        <div class="kpi-sub" style="margin-top:4px">famílias atendidas</div>
        ${mediaNota ? `<div class="kpi-sub" style="margin-top:4px;color:var(--green2)">nota eficácia: ${mediaNota}/10</div>` : ''}
        <div class="kpi-hint" style="margin-top:10px">▸ clique p/ detalhes</div>
      </div>`;
    })() +
    (() => {
      const CONSEG_COR = PROD_CORES.conseg;
      const consegAll = prodRaw.conseg || [];
      if (!consegAll.length) return '';
      const allMuns = [...new Set(consegAll.map(r => r.municipio).filter(Boolean))];
      const inativosMuns = [...new Set(consegAll.filter(r => !r.conseg_ativo).map(r => r.municipio))];
      const totalConseg  = allMuns.length;
      const ativosCount  = totalConseg - inativosMuns.length;
      const taxa = totalConseg ? Math.round(ativosCount / totalConseg * 100) : 0;
      const taxaCor = taxa >= 80 ? '#4bc87a' : taxa >= 60 ? '#e8b840' : '#e05555';
      const metricRow = (label, val, cor) =>
        `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px">
          <span style="font-family:'DM Mono',monospace;font-size:19px;color:#f4f6fc">${label}</span>
          <span style="font-family:'DM Mono',monospace;font-size:19px;font-weight:700;color:${cor}">${val}</span>
        </div>`;
      const consegCls = taxa >= 80 ? ' pos' : taxa >= 60 ? ' warn' : ' neg';
      return `<div class="kpi" onclick="openProdDetail('conseg')" title="Clique para detalhes" style="cursor:pointer">
        <div class="kpi-top"></div>
        <div class="kpi-lbl">CONSEG</div>
        <div class="kpi-val${consegCls}">${taxa}%</div>
        <div class="kpi-sub" style="margin-top:4px">${ativosCount}/${totalConseg} ativos</div>
        <div class="kpi-hint" style="margin-top:10px">▸ clique p/ detalhes</div>
      </div>`;
    })();

  // Cabeçalho de seção
  const sec = label => `<div style="grid-column:1/-1;display:flex;align-items:center;gap:12px;margin-top:10px;padding-bottom:8px;border-bottom:1px solid var(--bd2)">
    <span style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#ffffff">${label}</span>
  </div>`;

  // ─── Rankings por CIA ──────────────────────────────────────────────────
  const mkRankCard = (cor, label, rows) => {
    if (!rows.length) return '';
    const maxV = rows[0][1];
    const items = rows.map(([cia, v, meses], i) => {
      const barCor = ciaCorByName(cia);
      const pct = maxV > 0 ? Math.round(v / maxV * 100) : 0;
      const tooltipRows = (meses || []).map(([m, mv]) =>
        `<div style="display:flex;justify-content:space-between;gap:20px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.06)">
          <span style="font-size:18px;color:rgba(255,255,255,.7)">${m}</span>
          <span style="font-family:'DM Mono',monospace;font-size:18px;font-weight:700;color:#e8c96a">${mv.toLocaleString('pt-BR')}</span>
        </div>`).join('');
      const tooltipHtml = meses && meses.length
        ? `<div class="prod-rank-tooltip">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${barCor};margin-bottom:8px">${cia}</div>
            ${tooltipRows}
            <div style="display:flex;justify-content:space-between;gap:20px;padding:5px 0 0">
              <span style="font-size:18px;font-weight:700;color:#ffffff">Total</span>
              <span style="font-family:'DM Mono',monospace;font-size:18px;font-weight:700;color:${barCor}">${v.toLocaleString('pt-BR')}</span>
            </div>
          </div>` : '';
      return `<div style="position:relative;margin-bottom:${i < rows.length - 1 ? '16' : '0'}px" class="prod-rank-row">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <div style="font-size:22px;color:${barCor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:68%">${i + 1}. ${cia}</div>
          <div style="font-family:'DM Mono',monospace;font-size:22px;color:${barCor};font-weight:700">${v.toLocaleString('pt-BR')}</div>
        </div>
        <div style="background:rgba(255,255,255,.06);border-radius:3px;height:14px;cursor:default"><div style="height:100%;width:${pct}%;background:${barCor};border-radius:3px"></div></div>
        ${tooltipHtml}
      </div>`;
    }).join('');
    return `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid var(--bd2);border-radius:10px;padding:22px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:18px">${label}</div>
      ${items}
    </div>`;
  };
  const aggByCia = (tipo, campo, extraFilt) => {
    const aggTotal = {};
    const aggMes   = {};
    (extraFilt ? filt[tipo].filter(extraFilt) : filt[tipo]).forEach(r => {
      const cia = r.cia ? normCiaDisplay(r.cia) : 'Não informado';
      const val = Number(r[campo]) || 0;
      aggTotal[cia] = (aggTotal[cia] || 0) + val;
      const mes = MES_ORD.find(x => x.toLowerCase() === (r.mes||'').toLowerCase()) || r.mes || 'N/I';
      if (!aggMes[cia]) aggMes[cia] = {};
      aggMes[cia][mes] = (aggMes[cia][mes] || 0) + val;
    });
    return Object.entries(aggTotal)
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([cia, total]) => {
        const mesByOrder = MES_ORD
          .filter(m => aggMes[cia]?.[m])
          .map(m => [m, aggMes[cia][m]]);
        return [cia, total, mesByOrder];
      });
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
      `<div style="display:flex;justify-content:space-between;margin-top:12px">
        <span style="font-size:22px;color:#ffffff">${c}</span>
        <span style="font-family:'DM Mono',monospace;font-size:22px;color:#ffffff;font-weight:700">${v.toLocaleString('pt-BR')}</span>
      </div>`).join('');
    insCards.push(`<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid var(--bd2);border-radius:10px;padding:22px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:12px">CIA em Destaque</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:44px;font-weight:800;color:var(--gold2);line-height:1.1;margin-bottom:6px">${ciaTopo}</div>
      <div style="font-family:'DM Mono',monospace;font-size:22px;color:#ffffff;margin-bottom:14px">${valTopo.toLocaleString('pt-BR')} ações (presos + armas + veíc.)</div>
      ${runners}
    </div>`);
  }

  // Índice de Capacitação removido dos insights de produtividade

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
      return `<div style="margin-bottom:${i < 4 ? '16' : '0'}px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <div style="font-size:22px;color:#ffffff;font-weight:${i === 0 ? '700' : '400'}">${i + 1}. ${m}</div>
          <div style="font-family:'DM Mono',monospace;font-size:22px;color:#ffffff;font-weight:700">${v.toLocaleString('pt-BR')}</div>
        </div>
        <div style="background:rgba(255,255,255,.06);border-radius:3px;height:8px"><div style="height:100%;width:${pct}%;background:#f0c040;border-radius:3px"></div></div>
      </div>`;
    }).join('');
    insCards.push(`<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid var(--bd2);border-radius:10px;padding:22px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:16px">Meses Mais Produtivos</div>
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
      return `<div style="margin-bottom:18px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <div style="font-size:22px;color:#ffffff;font-weight:600">${t.label}</div>
          <div style="font-family:'DM Mono',monospace;font-size:22px;color:#ffffff;font-weight:700">${pct}%</div>
        </div>
        <div style="background:rgba(255,255,255,.06);border-radius:3px;height:8px"><div style="height:100%;width:${pct}%;background:${t.cor};border-radius:3px"></div></div>
        <div style="font-family:'DM Mono',monospace;font-size:22px;color:#ffffff;margin-top:5px">${t.v.toLocaleString('pt-BR')} no período</div>
      </div>`;
    }).join('');
    insCards.push(`<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid var(--bd2);border-radius:10px;padding:22px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:16px">Distribuição por Tipo</div>
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
      return `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid var(--bd2);border-radius:10px;padding:22px 24px">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:12px">${label}</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:14px">
          <span style="font-family:'DM Mono',monospace;font-size:50px;font-weight:700;color:${corSeta};line-height:1">${seta}</span>
          <span style="font-family:'DM Mono',monospace;font-size:22px;font-weight:700;color:${corSeta}">${diffStr}${pctStr}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;background:rgba(255,255,255,.03);border-radius:6px;padding:10px 12px;text-align:center">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,.7);text-transform:uppercase;margin-bottom:4px">${MES_ABREV[mesA] || mesA.slice(0,3)}</div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:52px;font-weight:800;color:#ffffff;line-height:1">${vA.toLocaleString('pt-BR')}</div>
          </div>
          <div style="color:rgba(255,255,255,.4);font-size:26px">›</div>
          <div style="flex:1;background:rgba(255,255,255,.05);border-radius:6px;padding:10px 12px;text-align:center;border:1px solid var(--bd2)">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,.7);text-transform:uppercase;margin-bottom:4px">${MES_ABREV[mesB] || mesB.slice(0,3)}</div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:52px;font-weight:800;color:#ffffff;line-height:1">${vB.toLocaleString('pt-BR')}</div>
          </div>
        </div>
      </div>`;
    }).filter(Boolean);
    if (tendCards.length) {
      tendHtml = sec('Tendência Recente — ' + mesA.slice(0,3) + ' × ' + mesB.slice(0,3)) +
        `<div style="grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:14px">${tendCards.join('')}</div>`;
    }
  }


  // Monta HTML de todas as seções
  chartsEl.innerHTML =
    tendHtml +
    (ciaRankCards
      ? sec('Ranking por CIA') +
        `<div style="grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px">${ciaRankCards}</div>`
      : '') +
    (insCards.length
      ? sec('Insights do Período') +
        `<div style="grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">${insCards.join('')}</div>`
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
    const [ocorr, presos, armas, veiculos, entorp, visitaSol, tempoResp, cursos, pvs, conseg] = await Promise.all([
      authFetch(`${API}/prod/ocorrencias`).then(r => r.json()),
      authFetch(`${API}/prod/presos`).then(r => r.json()),
      authFetch(`${API}/prod/armas`).then(r => r.json()),
      authFetch(`${API}/prod/veiculos`).then(r => r.json()),
      authFetch(`${API}/prod/entorpecentes`).then(r => r.json()),
      authFetch(`${API}/prod/visita-solidaria`).then(r => r.json()).catch(() => []),
      authFetch(`${API}/prod/tempo-resposta`).then(r => r.json()).catch(() => []),
      authFetch(`${API}/prod/cursos`).then(r => r.json()).catch(() => []),
      authFetch(`${API}/pvs`).then(r => r.json()).catch(() => []),
      authFetch(`${API}/prod/conseg`).then(r => r.json()).catch(() => []),
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
      pvs:            Array.isArray(pvs)       ? pvs       : [],
      conseg:         Array.isArray(conseg)    ? conseg    : [],
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
    'pvs':              'Colunas: ano · cia · municipio · bairros_com_pvs · nucleos_total · familias_atendidas · modal_residencial · modal_comercial · modal_escolar · modal_rural · modal_empresarial · nota_eficacia · tem_cadastro · pm_whatsapp · reunioes_semestrais · visitas_solidarias',
    'conseg':           'Colunas: Mês / Ano (MM/AAAA) · Cia · Município · Houve Reunião (Sim/Não) · Data da última reunião · Providências Adatodas · Data da Reunião',
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
      } else if (prodUplTipo === 'pvs') {
        const hasCia = keys.some(k => k.includes('cia'));
        const hasMun = keys.some(k => k.includes('munic'));
        if (!hasCia || !hasMun) {
          prev.innerHTML = `<span style="color:#f07878">Colunas "CIA" e "Municipio" não encontradas no CSV.</span>`;
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
    const uplEndpoint = prodUplTipo === 'pvs' ? `${API}/pvs` : prodUplTipo === 'cursos' ? `${API}/upload/cursos` : `${API}/upload/prod/${prodUplTipo}`;
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

// ═══════════════════════════════════════════════════════════════════════════
// PRODUTIVIDADE — ENTORPECENTES
// Card especial com seletor de unidade de medida (Kg, Unidade, Litro...).
// switchEntorpUnit() atualiza o KPI e o gráfico de categorias sem recarregar dados.
// ═══════════════════════════════════════════════════════════════════════════

// Renderiza o gráfico de barras das categorias de entorpecentes por unidade
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
      x: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } } },
      y: { grid: { display: false }, ticks: { color: '#ffffff', font: { size: 22 } } }
    }
  });
  renderEntorpCatChart(u, filt, PROD_CORES.entorpecentes, barOpts);
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUTIVIDADE — MODAL DE DETALHE (drill-down por card)
// Aberto por openProdDetail(tipo, unidade, natFilter) ao clicar em card de prod.
// Exibe gráficos por CIA, evolução mensal, detalhes por natureza/categoria.
// Para Visita Solidária: inclui análise de reiterações e acompanhamento VD.
// Estado: pdTipo, pdUnidade, pdSelCia, pdMeses, pdNatFilter, pdChs[]
// ⚠ pdDestroy() deve ser chamado antes de reabrir para não vazar instâncias Chart.js
// ═══════════════════════════════════════════════════════════════════════════

// Destrói as instâncias Chart.js do modal de detalhe de produtividade
function pdDestroy() {
  pdChs.forEach(c => { try { c.destroy(); } catch(e){} });
  pdChs = [];
  document.getElementById('pvs-ext-tip')?.remove();
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
  if (pdTipo === 'taftat' || pdTipo === 'pvs' || pdTipo === 'conseg') { document.getElementById('pd-filter-bar').innerHTML = ''; return; }
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
    h += '<div class="pf-field"><span class="pf-label">CIA</span><select name="pd-cia" autocomplete="off" class="pf-select" onchange="pdSetCia(this.value)"><option value="">Todas</option>';
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

  // Monta índice CIA × natureza para drill-down interativo
  _trNatCiaData = {};
  Object.entries(byNat).forEach(([nat, rs]) => {
    const ciasMap = {};
    rs.forEach(r => {
      const cia = r.cia ? normCiaDisplay(r.cia) : 'Não informado';
      if (!ciasMap[cia]) ciasMap[cia] = { pctW: 0, taloes: 0 };
      const t = r.qtde_taloes || 0;
      ciasMap[cia].pctW   += (r.pct_hd_hcl_20min || 0) * t;
      ciasMap[cia].taloes += t;
    });
    _trNatCiaData[nat] = Object.entries(ciasMap)
      .filter(([, d]) => d.taloes > 0)
      .map(([cia, d]) => ({
        cia,
        pct:    d.pctW / d.taloes,
        taloes: d.taloes,
        fora:   Math.round(d.taloes * (1 - (d.pctW / d.taloes) / 100)),
      }))
      .sort((a, b) => a.pct - b.pct); // pior primeiro
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
      <div style="background:rgba(255,255,255,.06);border-radius:3px;height:8px"><div style="height:100%;width:${Math.min(100,barPct)}%;background:${cor};border-radius:3px"></div></div>
      <div style="font-size:19px;color:var(--tx3);margin-top:2px">${sub}</div>
    </div>`;

  // Variante clicável de barRow — abre drill-down de CIAs ao clicar
  const barRowDrill = (name, val, barPct, cor, sub, sortMode) => {
    const enc = encodeURIComponent(name);
    return `<div style="margin-bottom:12px;cursor:pointer;transition:opacity .15s" onclick="trDrillNat(this,decodeURIComponent('${enc}'),'${sortMode}')" title="Clique para ver desempenho por CIA">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;gap:8px">
        <div style="font-size:19px;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${name}">${name}<span style="font-size:18px;color:var(--tx3);margin-left:6px;vertical-align:middle;user-select:none">▾ CIA</span></div>
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:${cor};font-weight:700;flex-shrink:0">${val}</div>
      </div>
      <div style="background:rgba(255,255,255,.06);border-radius:3px;height:8px"><div style="height:100%;width:${Math.min(100,barPct)}%;background:${cor};border-radius:3px"></div></div>
      <div style="font-size:19px;color:var(--tx3);margin-top:2px">${sub}</div>
    </div>`;
  };

  const natTop = natRank.slice(0, 10);
  const natTopCard = !natTop.length ? '' :
    `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${TR_COR_BOM};border-radius:10px;padding:16px">
      ${cardTop(TR_COR_BOM, 'Naturezas Mais Rápidas — % ≤20min')}
      ${natTop.map(d => barRowDrill(d.nat, parseFloat(d.pct.toFixed(1)) + '%', Math.round(d.pct), TR_COR_BOM, d.taloes.toLocaleString('pt-BR') + ' talões', 'desc-pct')).join('')}
    </div>`;

  const natBot = natRank.length > 3 ? [...natRank].reverse().slice(0, Math.min(10, natRank.length)) : [];
  const natBotCard = !natBot.length ? '' :
    `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${TR_COR_MAU};border-radius:10px;padding:16px">
      ${cardTop(TR_COR_MAU, 'Naturezas Mais Demoradas — % ≤20min')}
      ${natBot.map(d => barRowDrill(d.nat, parseFloat(d.pct.toFixed(1)) + '%', Math.round(d.pct), TR_COR_MAU, d.taloes.toLocaleString('pt-BR') + ' talões', 'asc-pct')).join('')}
    </div>`;

  const criticasCard = !natCriticas.length ? '' :
    `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid #e0965a;border-radius:10px;padding:16px">
      ${cardTop('#e0965a', 'Naturezas Críticas — Maior Impacto')}
      ${natCriticas.map(d => barRowDrill(d.nat, parseFloat(d.pct.toFixed(1)) + '%', Math.round(d.pct), '#e0965a', d.taloes.toLocaleString('pt-BR') + ' talões · ~' + d.fora_prazo.toLocaleString('pt-BR') + ' fora do prazo', 'desc-fora')).join('')}
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
            x: { grid: GR, min: 0, max: 100, ticks: { color: '#ffffff', font: { size: 22 }, callback: v => v + '%' } },
            y: { grid: { display: false }, ticks: { color: '#ffffff', font: { size: 22 } } },
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
            x: { grid: GR, min: 0, max: 100, ticks: { color: '#ffffff', font: { size: 22 }, callback: v => v + '%' } },
            y: { grid: { display: false }, ticks: { color: '#ffffff', font: { size: 22 } } },
          },
        },
      }));
    }
  }
}

// Drill-down de CIA por natureza no painel Tempo Resposta
function trDrillNat(el, nat, sortMode) {
  const existing = el.nextElementSibling;
  if (existing && existing.dataset.drill === 'tr') {
    existing.remove();
    el.style.opacity = '';
    return;
  }
  // Fecha qualquer outro painel aberto
  document.querySelectorAll('[data-drill="tr"]').forEach(p => {
    if (p.previousElementSibling) p.previousElementSibling.style.opacity = '';
    p.remove();
  });

  const base = (_trNatCiaData[nat] || []);
  if (!base.length) return;

  // Ordena conforme o contexto do card de origem
  const cias = [...base].sort((a, b) => {
    if (sortMode === 'desc-pct')  return b.pct - a.pct;   // Mais Rápidas: maior % primeiro
    if (sortMode === 'asc-pct')   return a.pct - b.pct;   // Mais Demoradas: menor % primeiro
    if (sortMode === 'desc-fora') return b.fora - a.fora; // Críticas: mais fora do prazo primeiro
    return b.pct - a.pct;
  });

  el.style.opacity = '0.7';

  const COR_BOM = '#4bc87a';
  const COR_MED = '#4bc8e0';
  const COR_MAU = '#e8b840';

  const ciaRows = cias.map(d => {
    const pctCor = d.pct >= 70 ? COR_BOM : d.pct >= 50 ? COR_MED : COR_MAU;
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">
      <div style="width:8px;height:8px;border-radius:50%;background:${ciaCorByName(d.cia)};flex-shrink:0"></div>
      <div style="flex:1;font-size:18px;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.cia}</div>
      <div style="font-family:'DM Mono',monospace;font-size:18px;color:${pctCor};font-weight:700;flex-shrink:0">${parseFloat(d.pct.toFixed(1))}%</div>
      <div style="font-size:18px;color:var(--tx3);flex-shrink:0;min-width:58px;text-align:right">${d.taloes.toLocaleString('pt-BR')} tal.</div>
      ${d.fora > 0 ? `<div style="font-size:18px;color:${COR_MAU};flex-shrink:0;min-width:52px;text-align:right">~${d.fora.toLocaleString('pt-BR')} fora</div>` : '<div style="min-width:52px"></div>'}
    </div>`;
  }).join('');

  const panel = document.createElement('div');
  panel.dataset.drill = 'tr';
  panel.style.cssText = 'background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:10px 14px;margin:-4px 0 14px;animation:fu .15s ease';
  panel.innerHTML =
    `<div style="font-size:18px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Desempenho por CIA — ${nat}</div>` +
    ciaRows +
    `<div style="font-size:18px;color:var(--tx3);margin-top:8px;text-align:right">clique novamente para fechar</div>`;

  el.insertAdjacentElement('afterend', panel);
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

async function renderCursosModalDetail() {
  const COR = '#9de05a';
  const mesesDisp = prodGetMesesDisp(prodSelAno);
  const periodoLbl = pdMeses.length === mesesDisp.length ? 'Acumulado ' + (prodSelAno || '') : pdMeses.join(', ');

  // Carrega efetivo se ainda não foi carregado (necessário para cruzar RE → CIA)
  if (!p1Data.length) {
    try {
      const r = await authFetch(`${API}/efetivo`);
      const ef = await r.json();
      if (Array.isArray(ef) && ef.length) p1Data = ef;
    } catch { /* segue sem CIA */ }
  }

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

  // Lookup RE → CIA a partir do efetivo (p1Data pode estar vazio se P1 ainda não foi aberto)
  // Usa pm.cia quando disponível; cai em pm.opm que contém o nome da OPM (ex: "1ª CIA PM SOROCABA")
  const _normRe = re => String(re||'').trim().split('-')[0].trim();
  const reToCia = {};
  p1Data.forEach(pm => {
    const re = _normRe(pm.re);
    const src = (pm.cia||'').trim() || (pm.opm||'').trim();
    if (re && src) reToCia[re] = normCiaDisplay(src);
  });
  const getCiaPM = re => reToCia[_normRe(re)] || null;

  // Total de PMs por CIA (para ranking no card "Distribuição por Tipo")
  const ciaTotaisMap = {};
  rows.forEach(r => {
    if (!r.re_pm) return;
    const cia = getCiaPM(r.re_pm) || 'Não identificado';
    ciaTotaisMap[cia] = (ciaTotaisMap[cia] || 0) + 1;
  });
  const ciaTotaisOrdered = Object.entries(ciaTotaisMap).sort((a,b) => b[1] - a[1]);
  const ciaTotaisMaxVal  = ciaTotaisOrdered[0]?.[1] || 1;
  const ciaTotaisHtml = ciaTotaisOrdered.length
    ? ciaTotaisOrdered.map(([cia, n]) => {
        const pct = Math.round(n / ciaTotaisMaxVal * 100);
        const c   = ciaCorByName(cia);
        return `<div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:8px">
            <div style="font-size:19px;color:var(--tx);display:flex;align-items:center;gap:8px;overflow:hidden">
              <div style="width:9px;height:9px;border-radius:50%;background:${c};flex-shrink:0"></div>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cia}</span>
            </div>
            <div style="font-family:'DM Mono',monospace;font-size:19px;color:${c};font-weight:700;flex-shrink:0">${n} PM${n !== 1 ? 's' : ''}</div>
          </div>
          <div style="background:rgba(255,255,255,.06);border-radius:3px;height:4px">
            <div style="height:100%;width:${pct}%;background:${c};border-radius:3px"></div>
          </div>
        </div>`;
      }).join('')
    : `<div style="color:var(--tx3);font-size:19px">Sem dados para o período</div>`;

  // CIA × mês — contagem de PMs por CIA em cada mês (para tooltip do gráfico de evolução)
  const mesTooltipCia = {};
  rows.forEach(r => {
    const m = (r.mes||'').toLowerCase();
    if (!m || !r.re_pm) return;
    const cia = getCiaPM(r.re_pm) || 'Não identificado';
    if (!mesTooltipCia[m]) mesTooltipCia[m] = {};
    mesTooltipCia[m][cia] = (mesTooltipCia[m][cia] || 0) + 1;
  });

  // CIA × tipo — contagem de PMs por CIA em cada tipo de curso (para tooltip do doughnut)
  const tipoTooltipCia = {};
  rows.forEach(r => {
    if (!r.re_pm) return;
    const tipo = tipoCurso(r.nome_curso);
    const cia = getCiaPM(r.re_pm) || 'Não identificado';
    if (!tipoTooltipCia[tipo]) tipoTooltipCia[tipo] = {};
    tipoTooltipCia[tipo][cia] = (tipoTooltipCia[tipo][cia] || 0) + 1;
  });

  // Agrega por tipo — conta PMs que fizeram cada tipo de curso
  const tipoAgg = {};
  rows.forEach(r => {
    if (!r.re_pm) return;
    const tipo = tipoCurso(r.nome_curso);
    tipoAgg[tipo] = (tipoAgg[tipo] || 0) + 1;
  });
  const tipoLabels = TIPO_ORD.filter(t => tipoAgg[t]);
  const tipoValues = tipoLabels.map(t => tipoAgg[t]);
  const tipoCores  = tipoLabels.map(t => TIPO_COR[t]);

  document.getElementById('pd-sub').textContent = periodoLbl.toUpperCase();
  document.getElementById('pd-kpis').innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${COR};border-radius:8px;padding:14px 18px">
      <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Cursos Realizados</div>
      <div style="font-family:'DM Mono',monospace;font-size:28px;font-weight:700;color:var(--gold2)">${cursosList.length}</div>
    </div>
    <div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${COR};border-radius:8px;padding:14px 18px">
      <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">PMs Capacitados</div>
      <div style="font-family:'DM Mono',monospace;font-size:28px;font-weight:700;color:var(--gold2)">${pmsUnicos.size}</div>
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

  // Evolução mensal — conta PMs que fizeram cursos por mês
  const mesAgg = {};
  rows.forEach(r => {
    const m = (r.mes||'').toLowerCase();
    if (!m || !r.re_pm) return;
    mesAgg[m] = (mesAgg[m] || 0) + 1;
  });
  const evoLabels = MES_ORD.filter(m => mesAgg[m.toLowerCase()]);
  const evoData   = evoLabels.map(m => mesAgg[m.toLowerCase()] || 0);

  const chartsEl = document.getElementById('pd-charts');
  chartsEl.innerHTML = `
    <div style="grid-column:1/-1;background:var(--bg2);border:1px solid var(--bd2);border-left:3px solid ${COR};border-radius:10px;padding:16px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:10px">Evolução Mensal</div>
      <canvas id="cursos-evo"></canvas>
      <div id="cursos-evo-empty" style="display:none;color:var(--tx3);font-size:19px;text-align:center;padding:12px 0">Sem dados para o período</div>
    </div>
    <div style="grid-column:1/-1;background:var(--bg2);border:1px solid var(--bd2);border-left:3px solid ${COR};border-radius:10px;padding:16px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:14px">Distribuição por Tipo</div>
      <canvas id="cursos-tipo" style="height:340px;max-height:340px"></canvas>
      <div id="cursos-tipo-empty" style="display:none;color:var(--tx3);font-size:19px;text-align:center;padding:12px 0">Sem dados para o período</div>
    </div>
    <div style="grid-column:1/-1;background:var(--bg2);border:1px solid var(--bd2);border-left:3px solid ${COR};border-radius:10px;padding:16px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:16px">PMs por CIA</div>
      ${ciaTotaisHtml}
    </div>
    <div style="grid-column:1/-1;background:var(--bg2);border:1px solid var(--bd2);border-left:3px solid ${COR};border-radius:10px;padding:16px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:12px">Lista de Cursos</div>
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

  // Gráfico evolução — multi-linha por CIA, mesmo padrão do KPI de Ocorrências
  const evoCtx = document.getElementById('cursos-evo')?.getContext('2d');
  if (evoCtx) {
    evoCtx.canvas.style.height    = '340px';
    evoCtx.canvas.style.maxHeight = '340px';
    if (!evoLabels.length) {
      const e = document.getElementById('cursos-evo-empty');
      if (e) e.style.display = '';
      evoCtx.canvas.style.display = 'none';
    } else {
      const CIA_LINHAS_C = [
        { label: 'Total Batalhão', cor: CIA_COR.total, cia: null },
        { label: '1ª CIA',         cor: CIA_COR['1'],  cia: '1ª CIA' },
        { label: '2ª CIA',         cor: CIA_COR['2'],  cia: '2ª CIA' },
        { label: '3ª CIA',         cor: CIA_COR['3'],  cia: '3ª CIA' },
        { label: 'FT',             cor: CIA_COR.ft,    cia: 'FT' },
      ];
      const ciaDatasets = CIA_LINHAS_C.map(({ label, cor: c, cia }) => {
        const vals = evoLabels.map(m => rows.filter(r => {
          if (!r.re_pm) return false;
          if ((r.mes||'').toLowerCase() !== m.toLowerCase()) return false;
          return cia === null || getCiaPM(r.re_pm) === cia;
        }).length);
        return { label, data: vals, borderColor: c, backgroundColor: c + '18', borderWidth: label === 'Total Batalhão' ? 3 : 2, fill: false, tension: 0.4, pointBackgroundColor: c, pointRadius: 4 };
      });
      pdChs.push(new Chart(evoCtx, {
        type: 'line',
        data: { labels: evoLabels.map(m => m.slice(0, 3)), datasets: ciaDatasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'top', labels: { color: '#f4f6fc', font: { size: 19, family: "'DM Sans',sans-serif" }, padding: 18, usePointStyle: true, pointStyleWidth: 10 } },
            tooltip: { callbacks: { label: i => ` ${i.dataset.label}: ${i.raw} PM${i.raw !== 1 ? 's' : ''}` } }
          },
          scales: {
            x: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } } },
            y: { grid: GR, beginAtZero: true, ticks: { color: '#ffffff', font: { size: 22 } } }
          }
        }
      }));
    }
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
            legend: { position: 'bottom', labels: { color: '#ffffff', font: { size: 22 }, padding: 16, boxWidth: 14 } },
            tooltip: { callbacks: {
              label: i => ` ${i.label}: ${i.raw} PM${i.raw !== 1 ? 's' : ''}`,
              afterBody: items => {
                const tipo = tipoLabels[items[0].dataIndex];
                const ciaMap = tipoTooltipCia[tipo] || {};
                const sorted = Object.entries(ciaMap).sort((a,b) => b[1] - a[1]);
                if (!sorted.length) return [];
                return [''].concat(sorted.map(([c,n]) => `  ${c}: ${n} PM${n !== 1 ? 's' : ''}`));
              }
            } }
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

  const kpiMini = (lbl, val, cor, sub) => {
    const semColor = cor && cor !== 'var(--tx)' && cor !== 'var(--tx3)';
    const valCol = semColor ? cor : 'var(--tx)';
    return `<div style="background:var(--s1);border:1px solid var(--bd);border-top:2px solid var(--bd2);border-radius:8px;padding:18px 20px">
      <div style="font-family:'DM Mono',monospace;font-size:18px;font-weight:600;color:var(--tx3);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">${lbl}</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:48px;font-weight:800;color:${valCol};line-height:1">${val}</div>
      ${sub ? `<div style="font-family:'DM Sans',sans-serif;font-size:18px;color:var(--tx3);margin-top:5px">${sub}</div>` : ''}
    </div>`;
  };

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

  // CIA × conceito para TAF e TAT (para afterBody dos tooltips)
  const tafCiaCts = {}, tatCiaCts = {};
  efetivo.forEach(pm => {
    const cia = normCiaDisplay((pm.cia||'').trim() || (pm.opm||'').trim()) || 'Não identificado';
    const tafN = (pm.taf||'').toLowerCase().trim();
    const tatN = (pm.tat||'').toLowerCase().trim();
    const tafK = CONC_NORM[tafN] || (tafN ? tafN.charAt(0).toUpperCase() + tafN.slice(1) : 'Sem dados');
    const tatK = CONC_NORM[tatN] || (tatN ? tatN.charAt(0).toUpperCase() + tatN.slice(1) : 'Sem dados');
    if (!tafCiaCts[tafK]) tafCiaCts[tafK] = {};
    tafCiaCts[tafK][cia] = (tafCiaCts[tafK][cia] || 0) + 1;
    if (!tatCiaCts[tatK]) tatCiaCts[tatK] = {};
    tatCiaCts[tatK][cia] = (tatCiaCts[tatK][cia] || 0) + 1;
  });
  _taftatTab  = 'taf';
  _taftatData = { tafCts, tatCts, tafLbls, tatLbls, tafCiaCts, tatCiaCts, COR, CONCS_ORD, CONC_COR };
  _renderTafTatCharts();
}

function switchTafTatTab(tab) {
  if (!_taftatData || tab === _taftatTab) return;
  _taftatTab = tab;
  pdChs.forEach(c => { try { c.destroy(); } catch {} });
  pdChs.length = 0;
  _renderTafTatCharts();
}

function _renderTafTatCharts() {
  const chartsEl = document.getElementById('pd-charts');
  if (!chartsEl || !_taftatData) return;
  const { tafCts, tatCts, tafLbls, tatLbls, tafCiaCts, tatCiaCts, COR, CONCS_ORD, CONC_COR } = _taftatData;
  const tab    = _taftatTab;
  const lbls   = tab === 'taf' ? tafLbls   : tatLbls;
  const cts    = tab === 'taf' ? tafCts    : tatCts;
  const ciaCts = tab === 'taf' ? tafCiaCts : tatCiaCts;
  const campo  = tab.toUpperCase();
  const subTitSt = 'font-family:\'Barlow Condensed\',sans-serif;font-size:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--tx3);margin-bottom:16px';
  const titSt    = `font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COR};margin-bottom:14px`;
  const btnSt    = active => `padding:7px 24px;border-radius:8px;border:1px solid ${active?COR:'rgba(255,255,255,.15)'};background:${active?COR+'22':'transparent'};color:${active?COR:'rgba(255,255,255,.45)'};font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all .15s`;
  const legItemSt = (cor) => `display:flex;align-items:center;gap:8px;font-family:'DM Mono',monospace;font-size:19px;color:rgba(255,255,255,.85)`;
  const legDot    = (cor) => `<span style="display:inline-block;width:13px;height:13px;border-radius:3px;background:${cor};flex-shrink:0"></span>`;
  chartsEl.innerHTML = `
    <div style="grid-column:1/-1;background:var(--bg2);border:1px solid var(--bd2);border-radius:10px;padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="${titSt}">Distribuição ${campo} por Conceito e CIA</div>
        <div style="display:flex;gap:8px">
          <button id="btn-taftat-taf" onclick="switchTafTatTab('taf')" style="${btnSt(tab==='taf')}">TAF</button>
          <button id="btn-taftat-tat" onclick="switchTafTatTab('tat')" style="${btnSt(tab==='tat')}">TAT</button>
        </div>
      </div>
      <div style="display:flex;gap:28px">
        <div style="flex:1;min-width:0">
          <div style="${subTitSt}">Por Conceito</div>
          <div style="position:relative;height:320px">
            <canvas id="taftat-dist"></canvas>
          </div>
          <div id="taftat-dist-leg" style="display:flex;flex-direction:column;gap:6px;margin-top:0px"></div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="${subTitSt}">Por CIA</div>
          <div style="position:relative;height:320px">
            <canvas id="taftat-cia"></canvas>
          </div>
          <div id="taftat-cia-leg" style="display:flex;flex-direction:column;gap:6px;margin-top:0px"></div>
        </div>
      </div>
    </div>`;
  // Doughnut — Por Conceito
  if (lbls.some(l => l !== 'Sem dados')) {
    const ctx = document.getElementById('taftat-dist')?.getContext('2d');
    if (ctx) {
      pdChs.push(new Chart(ctx, {
        type: 'doughnut',
        data: { labels: lbls, datasets: [{ data: lbls.map(l=>cts[l]||0), backgroundColor: lbls.map(l=>(CONC_COR[l]||'#607090')+'cc'), borderColor: lbls.map(l=>CONC_COR[l]||'#607090'), borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: {
          label: i => ` ${i.label}: ${i.raw} PM${i.raw!==1?'s':''}`,
          afterBody: items => {
            const conceito = lbls[items[0].dataIndex];
            const sorted = Object.entries(ciaCts[conceito]||{}).sort((a,b)=>b[1]-a[1]);
            if (!sorted.length) return [];
            return [''].concat(sorted.map(([c,n])=>`  ${c}: ${n} PM${n!==1?'s':''}`));
          }
        } } } }
      }));
      // legenda HTML vertical
      const total = lbls.reduce((s,l) => s+(cts[l]||0), 0);
      const legEl = document.getElementById('taftat-dist-leg');
      if (legEl) legEl.innerHTML = lbls.map(l => {
        const n = cts[l]||0;
        const pct = total > 0 ? ((n/total)*100).toFixed(1) : '0.0';
        return `<div style="${legItemSt()}">${legDot(CONC_COR[l]||'#607090')}<span>${l}: <strong>${n}</strong> PM${n!==1?'s':''} <span style="color:var(--tx3)">(${pct}%)</span></span></div>`;
      }).join('');
    }
  }
  // Stacked bar — Por CIA
  const ciaConcMap = {};
  Object.entries(ciaCts).forEach(([conc,cias])=>{ Object.entries(cias).forEach(([cia,n])=>{ if(!ciaConcMap[cia]) ciaConcMap[cia]={}; ciaConcMap[cia][conc]=n; }); });
  const cias = Object.entries(ciaConcMap).map(([cia,concs])=>({cia,total:Object.values(concs).reduce((s,v)=>s+v,0)})).sort((a,b)=>b.total-a.total).map(d=>d.cia);
  const datasets = CONCS_ORD.map(conc=>({ label:conc, data:cias.map(cia=>ciaConcMap[cia]?.[conc]||0), backgroundColor:(CONC_COR[conc]||'#607090')+'cc', borderColor:CONC_COR[conc]||'#607090', borderWidth:1 })).filter(d=>d.data.some(v=>v>0));
  const ctxCia = document.getElementById('taftat-cia')?.getContext('2d');
  if (ctxCia && cias.length) {
    pdChs.push(new Chart(ctxCia, { type:'bar', data:{ labels:cias, datasets }, options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: i=>` ${i.dataset.label}: ${i.raw} PM${i.raw!==1?'s':''}` } } }, scales:{ x:{ stacked:true, grid:GR, ticks:{ color:'rgba(255,255,255,.45)', font:{size:22} }, beginAtZero:true }, y:{ stacked:true, grid:{ display:false }, ticks:{ color:'rgba(255,255,255,.8)', font:{size:22} } } } } }));
    // legenda HTML vertical (conceitos presentes)
    const legEl2 = document.getElementById('taftat-cia-leg');
    if (legEl2) legEl2.innerHTML = datasets.map(d =>
      `<div style="${legItemSt()}">${legDot((CONC_COR[d.label]||'#607090')+'cc')}<span>${d.label}</span></div>`
    ).join('');
  }
}

function renderConsegModalDetail() {
  const chartsEl = document.getElementById('pd-charts');
  if (!chartsEl) return;
  const COR     = PROD_CORES.conseg;
  const titSt   = `font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COR};margin-bottom:14px`;
  const subTitSt = `font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.9);margin-bottom:16px`;
  const mkMini  = (label, val, cor) =>
    `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:3px solid ${cor};border-radius:10px;padding:16px 20px;flex:1;min-width:120px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:6px">${label}</div>
      <div style="font-family:'DM Mono',monospace;font-size:28px;font-weight:700;color:${cor}">${val}</div>
    </div>`;

  const consegData = prodRaw.conseg || [];
  if (!consegData.length) {
    chartsEl.innerHTML = '<div style="grid-column:1/-1;color:var(--tx3);font-size:19px;padding:20px 0">Sem dados de CONSEG para o período selecionado.</div>';
    return;
  }

  const allMuns      = [...new Set(consegData.map(r => r.municipio).filter(Boolean))].sort();
  const inativosMuns = new Set(consegData.filter(r => !r.conseg_ativo).map(r => r.municipio));
  const ativosCount  = allMuns.filter(m => !inativosMuns.has(m)).length;
  const inativosCount = inativosMuns.size;
  const taxa         = allMuns.length ? Math.round(ativosCount / allMuns.length * 100) : 0;
  const taxaCor      = taxa >= 80 ? '#4bc87a' : taxa >= 60 ? '#e8b840' : '#e05555';

  const filtConseg   = consegData.filter(r => !prodSelAno || r.ano === prodSelAno);
  const consegMeses  = MES_ORD.filter(m => filtConseg.some(r => (r.mes||'').toLowerCase() === m.toLowerCase()));

  // Denominador correto: meses com dados no período (ex: Jan–Jun = 6)
  const nMeses = consegMeses.length || 1;

  // Frequência por município: reuniões / nMeses (não por registros no banco)
  const munFreq = allMuns
    .filter(mun => filtConseg.some(r => r.municipio === mun))
    .map(mun => {
      const reunioes = filtConseg.filter(r => r.municipio === mun && r.houve_reuniao).length;
      return { mun, reunioes, total: nMeses, pct: Math.round(reunioes / nMeses * 100) };
    }).sort((a, b) => b.pct - a.pct);

  // Frequência por CIA: reuniões / (municípios da CIA × nMeses)
  const ciaMuns = {};
  filtConseg.forEach(r => {
    const cia = r.cia ? normCiaDisp(r.cia) : 'Não informado';
    if (!ciaMuns[cia]) ciaMuns[cia] = { muns: new Set(), reunioes: 0 };
    if (r.municipio) ciaMuns[cia].muns.add(r.municipio);
    if (r.houve_reuniao) ciaMuns[cia].reunioes++;
  });
  const ciaItems = Object.entries(ciaMuns)
    .map(([cia, s]) => {
      const total = s.muns.size * nMeses;
      return { cia, reunioes: s.reunioes, total, pct: total ? Math.round(s.reunioes / total * 100) : 0 };
    })
    .sort((a, b) => b.pct - a.pct);

  // Status grid
  const gridHeaders = consegMeses.map(m =>
    `<th style="padding:6px 8px;text-align:center;font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COR}">${MES_ABREV[m] || m.slice(0,3).toUpperCase()}</th>`
  ).join('');
  const gridRows = allMuns.map(mun => {
    const ciaRec = consegData.find(r => r.municipio === mun);
    const cia    = ciaRec ? normCiaDisp(ciaRec.cia) : '';
    const cells  = consegMeses.map(mes => {
      const recs = filtConseg.filter(r => r.municipio === mun && (r.mes||'').toLowerCase() === mes.toLowerCase());
      if (!recs.length) return `<td style="text-align:center;font-family:'DM Mono',monospace;font-size:22px;color:#e05555">✗</td>`;
      const rec = recs.find(r => r.houve_reuniao) || recs[0];
      if (!rec.conseg_ativo) return `<td style="text-align:center;font-family:'DM Mono',monospace;font-size:18px;color:#f07878;font-weight:700">INATIVO</td>`;
      return rec.houve_reuniao
        ? `<td style="text-align:center;font-family:'DM Mono',monospace;font-size:22px;color:#4bc87a;font-weight:700">✓</td>`
        : `<td style="text-align:center;font-family:'DM Mono',monospace;font-size:22px;color:#e05555">✗</td>`;
    }).join('');
    return `<tr style="border-bottom:1px solid var(--bd2)">
      <td style="padding:9px 12px;font-size:22px;color:#ffffff;font-weight:600;white-space:nowrap">${mun}</td>
      <td style="padding:9px 12px;font-size:22px;color:#ffffff">${cia}</td>
      ${cells}
    </tr>`;
  }).join('');

  const munHeight = Math.max(200, munFreq.length * 80);

  document.getElementById('pd-sub').textContent = prodSelAno || '';

  chartsEl.innerHTML = `
    <div style="grid-column:1/-1;display:flex;gap:12px;flex-wrap:wrap;margin-bottom:4px">
      ${mkMini('Total CONSEGs', allMuns.length, COR)}
      ${mkMini('Ativos', ativosCount, '#4bc87a')}
      ${mkMini('Inativos', inativosCount, inativosCount > 0 ? '#e05555' : 'var(--tx3)')}
      ${mkMini('Taxa Ativa', taxa + '%', taxaCor)}
    </div>
    <div style="grid-column:1/-1;background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${COR};border-radius:10px;padding:16px">
      <div style="${titSt}">Situação e Frequência por CIA — ${prodSelAno}</div>
      <div style="display:flex;gap:28px;flex-wrap:wrap">
        <div style="flex:1;min-width:220px">
          <div style="${subTitSt}">CONSEGs Ativos vs Inativos</div>
          <div style="position:relative;height:360px"><canvas id="conseg-donut"></canvas></div>
        </div>
        <div style="flex:1;min-width:220px">
          <div style="${subTitSt}">% Reuniões por CIA</div>
          <div style="position:relative;height:360px"><canvas id="conseg-cia-bar"></canvas></div>
        </div>
      </div>
    </div>
    <div style="grid-column:1/-1;display:flex;flex-direction:column;gap:8px;align-items:stretch;align-self:start">
      <div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${COR};border-radius:10px;padding:12px 12px 6px">
        <div style="${titSt}">% Reuniões Realizadas por Município — ${prodSelAno}</div>
        <div style="position:relative;height:${munHeight}px"><canvas id="conseg-mun-bar"></canvas></div>
      </div>
      <div style="background:var(--bg2);border:1px solid var(--bd2);border-top:2px solid ${COR};border-radius:10px;padding:16px">
      <div style="${titSt}">Status Mês a Mês — ${prodSelAno}</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;min-width:360px">
          <thead><tr style="border-bottom:2px solid var(--bd2)">
            <th style="padding:6px 12px;text-align:left;font-family:'DM Mono',monospace;font-size:22px;color:#ffffff;font-weight:600">Município</th>
            <th style="padding:6px 12px;text-align:left;font-family:'DM Mono',monospace;font-size:22px;color:#ffffff;font-weight:600">CIA</th>
            ${gridHeaders}
          </tr></thead>
          <tbody>${gridRows}</tbody>
        </table>
      </div>
      <div style="margin-top:12px;font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3)">✓ reunião realizada · ✗ sem reunião · INATIVO conseg inativo · — sem registro</div>
    </div>
    </div>`;

  // Doughnut: Ativos vs Inativos
  const ativosPorCia = {}, inativosPorCia = {};
  allMuns.forEach(mun => {
    const ciaRec = consegData.find(r => r.municipio === mun);
    const cia = ciaRec ? normCiaDisp(ciaRec.cia) : 'Não informado';
    if (inativosMuns.has(mun)) {
      if (!inativosPorCia[cia]) inativosPorCia[cia] = [];
      inativosPorCia[cia].push(mun);
    } else {
      if (!ativosPorCia[cia]) ativosPorCia[cia] = [];
      ativosPorCia[cia].push(mun);
    }
  });
  const donutLines = [
    Object.entries(ativosPorCia).sort().map(([c, ms]) => `✓ ${c}: ${ms.join(', ')}`),
    Object.entries(inativosPorCia).sort().map(([c, ms]) => `✗ ${c}: ${ms.join(', ')}`)
  ];

  const donutCtx = document.getElementById('conseg-donut');
  if (donutCtx) {
    pdChs.push(new Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels: ['Ativos', 'Inativos'],
        datasets: [{ data: [ativosCount, inativosCount], backgroundColor: ['#4bc87a', '#e05555'], borderWidth: 0 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#ffffff', font: { size: 19, weight: '700' }, padding: 16 } },
          tooltip: {
            callbacks: {
              label: i => ` ${i.label}: ${i.raw} CONSEG${i.raw !== 1 ? 's' : ''}`,
              afterBody: items => donutLines[items[0].dataIndex]
            }
          }
        }
      }
    }));
  }

  // Barras por CIA
  const ciaBarCtx = document.getElementById('conseg-cia-bar');
  if (ciaBarCtx && ciaItems.length) {
    pdChs.push(new Chart(ciaBarCtx, {
      type: 'bar',
      data: {
        labels: ciaItems.map(c => c.cia),
        datasets: [{ data: ciaItems.map(c => c.pct), backgroundColor: ciaItems.map(c => ciaCorByName(c.cia)), borderRadius: 4, borderSkipped: false }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: i => ` ${ciaItems[i.dataIndex].reunioes}/${ciaItems[i.dataIndex].total} possíveis (${i.raw}%)` } }
        },
        scales: {
          x: { min: 0, max: 100, grid: GR, ticks: { color: '#ffffff', font: { size: 22, weight: '700' }, callback: v => v + '%' } },
          y: { grid: { display: false }, ticks: { color: '#ffffff', font: { size: 22, weight: '700' } } }
        }
      }
    }));
  }

  // Barras por município
  const munBarCtx = document.getElementById('conseg-mun-bar');
  if (munBarCtx && munFreq.length) {
    munBarCtx.style.height    = munHeight + 'px';
    munBarCtx.style.maxHeight = munHeight + 'px';
    const munColors = munFreq.map(m => inativosMuns.has(m.mun) ? '#e05555' : (m.pct >= 75 ? '#4bc87a' : m.pct >= 50 ? '#e8b840' : '#e0965a'));
    pdChs.push(new Chart(munBarCtx, {
      type: 'bar',
      data: {
        labels: munFreq.map(m => m.mun),
        datasets: [{ data: munFreq.map(m => m.pct), backgroundColor: munColors, borderRadius: 4, borderSkipped: false, maxBarThickness: 48 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 0, bottom: 4, left: 0, right: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: i => ` ${munFreq[i.dataIndex].reunioes}/${nMeses} meses (${i.raw}%)` } }
        },
        scales: {
          x: { min: 0, max: 100, grid: GR, ticks: { color: '#ffffff', font: { size: 22, weight: '700' }, callback: v => v + '%' } },
          y: { grid: { display: false }, ticks: { color: '#ffffff', font: { size: 22, weight: '700' } } }
        }
      }
    }));
  }
}

function renderPvsModalDetail() {
  const chartsEl = document.getElementById('pd-charts');
  if (!chartsEl) return;
  const COR = PROD_CORES.pvs;
  const pvsData = (prodRaw.pvs||[]).filter(r => !prodSelAno || r.ano === prodSelAno);
  if (!pvsData.length) {
    chartsEl.innerHTML = '<div style="grid-column:1/-1;color:var(--tx3);font-size:19px;padding:20px 0">Sem dados de PVS para o período selecionado.</div>';
    return;
  }

  const ciaMap = {};
  pvsData.forEach(r => {
    const c = r.cia || 'Não informado';
    if (!ciaMap[c]) ciaMap[c] = { bairros: 0, familias: 0, nucleos: 0, notas: [], cadastro: 0, whatsapp: 0, reunioes: 0, visitas: 0, total: 0 };
    ciaMap[c].total++;
    ciaMap[c].bairros   += r.bairros_com_pvs   || 0;
    ciaMap[c].familias  += r.familias_atendidas || 0;
    ciaMap[c].nucleos   += r.nucleos_total      || 0;
    if (r.nota_eficacia) ciaMap[c].notas.push(r.nota_eficacia);
    if ((r.tem_cadastro       ||'').toLowerCase() === 'sim') ciaMap[c].cadastro++;
    if ((r.pm_whatsapp        ||'').toLowerCase() === 'sim') ciaMap[c].whatsapp++;
    if ((r.reunioes_semestrais||'').toLowerCase() === 'sim') ciaMap[c].reunioes++;
    if ((r.visitas_solidarias ||'').toLowerCase() === 'sim') ciaMap[c].visitas++;
  });

  const cias = Object.keys(ciaMap).sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b, 'pt-BR');
  });

  const totalMuns     = new Set(pvsData.map(r => r.municipio)).size;
  const totalFamilias = pvsData.reduce((s, r) => s + (r.familias_atendidas || 0), 0);
  const totalWhatsapp = pvsData.filter(r => (r.pm_whatsapp||'').toLowerCase() === 'sim').length;
  const totalVisitas  = pvsData.filter(r => (r.visitas_solidarias||'').toLowerCase() === 'sim').length;
  const pctWhatsapp   = totalMuns > 0 ? Math.round(totalWhatsapp / totalMuns * 100) : 0;
  const pctVisitas    = totalMuns > 0 ? Math.round(totalVisitas  / totalMuns * 100) : 0;

  const MODAIS       = ['residencial','comercial','escolar','rural','empresarial'];
  const MODAL_LABELS = { residencial:'Residencial', comercial:'Comercial', escolar:'Escolar', rural:'Rural', empresarial:'Empresarial' };
  const MODAL_CORES  = { residencial:'#5a9de0', comercial:'#e0965a', escolar:'#9de05a', rural:'#4bc87a', empresarial:'#9b6de0' };
  const modalCts = {};
  const munsByModal = {};
  MODAIS.forEach(m => {
    const com = pvsData.filter(r => (r[`modal_${m}`]||'').toLowerCase() === 'sim');
    modalCts[m]    = com.length;
    munsByModal[m] = com.map(r => r.municipio);
  });
  const modalAtivos = MODAIS.filter(m => modalCts[m] > 0);

  const IND_FIELD = { whatsapp: 'pm_whatsapp', reunioes: 'reunioes_semestrais', visitas: 'visitas_solidarias', cadastro: 'tem_cadastro' };
  const munsSimByCia = {};
  Object.keys(IND_FIELD).forEach(key => {
    munsSimByCia[key] = {};
    cias.forEach(cia => {
      munsSimByCia[key][cia] = pvsData
        .filter(r => r.cia === cia && (r[IND_FIELD[key]]||'').toLowerCase() === 'sim')
        .map(r => r.municipio);
    });
  });

  const munCiaColor = {};
  pvsData.forEach(r => { if (r.municipio) munCiaColor[r.municipio] = ciaCorByName(r.cia || ''); });

  // Tooltip HTML externo — não fica preso ao canvas
  document.getElementById('pvs-ext-tip')?.remove();
  const pvsExtTip = ctx => {
    let el = document.getElementById('pvs-ext-tip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pvs-ext-tip';
      el.style.cssText = 'position:fixed;background:rgba(22,28,36,.97);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:14px 18px;pointer-events:none;z-index:99999;max-width:380px;line-height:1.8;word-break:break-word;transition:opacity .1s';
      document.body.appendChild(el);
    }
    const { tooltip } = ctx;
    if (tooltip.opacity === 0) { el.style.opacity = '0'; return; }
    let html = '';
    if (tooltip.title?.length) html += `<div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.9);margin-bottom:8px">${tooltip.title[0]}</div>`;
    tooltip.body?.forEach(b => b.lines.forEach(l => { html += `<div style="font-family:'DM Mono',monospace;font-size:18px;color:#f4f6fc">${l.trim()}</div>`; }));
    if (tooltip.afterBody?.length) {
      tooltip.afterBody.forEach(l => {
        if (l === '') { html += '<div style="height:6px"></div>'; return; }
        let col = l.startsWith('✓') ? '#4bc87a' : l.startsWith('✗') ? '#e05555' : '#f4f6fc';
        // Colorir linha de CIA com a cor correspondente
        const ciaM = l.match(/CIA:\s*([\dºa-zA-Z ]+CIA)/i);
        if (ciaM) col = ciaCorByName(ciaM[1].trim()) || col;
        html += `<div style="font-family:'DM Mono',monospace;font-size:18px;color:${col}">${l}</div>`;
      });
    }
    el.innerHTML = html;
    el.style.opacity = '1';
    const rect = ctx.chart.canvas.getBoundingClientRect();
    let x = rect.left + tooltip.caretX + 14;
    let y = rect.top  + tooltip.caretY;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    requestAnimationFrame(() => {
      const tw = el.offsetWidth, th = el.offsetHeight;
      if (x + tw > window.innerWidth - 8) x = rect.left + tooltip.caretX - tw - 14;
      y = Math.max(8, Math.min(y - th / 2, window.innerHeight - th - 8));
      el.style.left = Math.max(8, x) + 'px'; el.style.top = y + 'px';
    });
  };

  const titSt     = `font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:14px`;
  const subTitSt  = `font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:16px`;
  const legItemSt = `display:flex;align-items:center;gap:8px;font-family:'DM Mono',monospace;font-size:19px;color:rgba(255,255,255,.85)`;
  const legDot    = cor => `<span style="display:inline-block;width:13px;height:13px;border-radius:3px;background:${cor};flex-shrink:0"></span>`;
  const mkMini    = (label, val, cor) =>
    `<div style="background:var(--bg2);border:1px solid var(--bd2);border-top:3px solid ${cor};border-radius:10px;padding:16px 20px;flex:1;min-width:120px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:6px">${label}</div>
      <div style="font-family:'DM Mono',monospace;font-size:28px;font-weight:700;color:${cor}">${val}</div>
    </div>`;

  const munFamMap = {};
  pvsData.forEach(r => { if (r.municipio) munFamMap[r.municipio] = (munFamMap[r.municipio] || 0) + (r.familias_atendidas || 0); });
  const munsSorted = Object.entries(munFamMap).sort((a, b) => b[1] - a[1]);

  chartsEl.innerHTML = `
    <div style="grid-column:1/-1;display:flex;gap:12px;flex-wrap:wrap;margin-bottom:4px">
      ${mkMini('Municípios', totalMuns, COR)}
      ${mkMini('Famílias', totalFamilias.toLocaleString('pt-BR'), COR)}
      ${mkMini('PM no WhatsApp', `${pctWhatsapp}%`, '#4bc87a')}
      ${mkMini('Visita Solidária', `${pctVisitas}%`, '#e0965a')}
    </div>
    <div style="grid-column:1/-1;background:var(--bg2);border:1px solid var(--bd2);border-left:3px solid ${COR};border-radius:10px;padding:16px">
      <div style="${titSt}">Modalidades Ativas</div>
      <div style="position:relative;height:280px"><canvas id="pvs-modal-chart"></canvas></div>
      <div id="pvs-modal-leg" style="display:flex;flex-direction:column;gap:6px;margin-top:8px"></div>
    </div>
    <div style="grid-column:1/-1;background:var(--bg2);border:1px solid var(--bd2);border-left:3px solid ${COR};border-radius:10px;padding:16px">
      <div style="${titSt}">Indicadores por CIA</div>
      <div style="position:relative;height:${Math.max(180, cias.length * 64)}px"><canvas id="pvs-ind-chart"></canvas></div>
      <div id="pvs-ind-leg" style="display:flex;flex-direction:column;gap:6px;margin-top:8px"></div>
    </div>
    <div style="grid-column:1/-1;background:var(--bg2);border:1px solid var(--bd2);border-left:3px solid ${COR};border-radius:10px;padding:16px">
      <div style="${titSt}">Famílias Atendidas por CIA</div>
      <div style="position:relative;height:${Math.max(160, cias.length * 52)}px"><canvas id="pvs-fam-cia-chart"></canvas></div>
    </div>
    <div style="grid-column:1/-1;background:var(--bg2);border:1px solid var(--bd2);border-left:3px solid ${COR};border-radius:10px;padding:16px">
      <div style="${titSt}">Famílias Atendidas por Município</div>
      <div style="position:relative;height:${Math.max(160, munsSorted.length * 52)}px"><canvas id="pvs-fam-mun-chart"></canvas></div>
    </div>`;

  // Doughnut — modalidades
  if (modalAtivos.length) {
    const ctx1 = document.getElementById('pvs-modal-chart')?.getContext('2d');
    if (ctx1) {
      pdChs.push(new Chart(ctx1, {
        type: 'doughnut',
        data: { labels: modalAtivos.map(m => MODAL_LABELS[m]), datasets: [{ data: modalAtivos.map(m => modalCts[m]), backgroundColor: modalAtivos.map(m => MODAL_CORES[m]+'cc'), borderColor: modalAtivos.map(m => MODAL_CORES[m]), borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false, external: pvsExtTip, callbacks: {
          label: i => `${i.label}: ${i.raw} município${i.raw !== 1 ? 's' : ''}`,
          afterBody: items => {
            const m = modalAtivos[items[0].dataIndex];
            const simMuns = munsByModal[m] || [];
            const naoMuns = pvsData.filter(r => (r[`modal_${m}`]||'').toLowerCase() !== 'sim').map(r => r.municipio);
            const out = [];
            if (simMuns.length) { out.push(''); simMuns.forEach(mn => out.push(`✓ ${mn}`)); }
            if (naoMuns.length) { out.push(''); naoMuns.forEach(mn => out.push(`✗ ${mn}`)); }
            return out;
          }
        } } } }
      }));
      const total = modalAtivos.reduce((s, m) => s + modalCts[m], 0);
      const legEl = document.getElementById('pvs-modal-leg');
      if (legEl) legEl.innerHTML = modalAtivos.map(m => {
        const n = modalCts[m];
        const pct = pvsData.length > 0 ? Math.round((n / pvsData.length) * 100) : 0;
        return `<div style="${legItemSt}">${legDot(MODAL_CORES[m]+'cc')}<span>${MODAL_LABELS[m]}: <strong>${n}</strong> mun. <span style="color:var(--tx3)">(${pct}%)</span></span></div>`;
      }).join('');
    }
  }

  // Horizontal bar — indicadores por CIA (% municípios com Sim)
  if (cias.length) {
    const IND_DEFS = [
      { label: 'PM no WhatsApp',  key: 'whatsapp',  cor: '#4bc87a' },
      { label: 'Reuniões Sem.',   key: 'reunioes',  cor: '#e8b840' },
      { label: 'Visitas Solid.',  key: 'visitas',   cor: '#e0965a' },
      { label: 'Cadastro',        key: 'cadastro',  cor: '#5a9de0' },
    ].filter(d => cias.some(c => (ciaMap[c][d.key] || 0) > 0));
    const ctx2 = document.getElementById('pvs-ind-chart')?.getContext('2d');
    if (ctx2 && IND_DEFS.length) {
      const datasets = IND_DEFS.map(d => ({
        label: d.label,
        data: cias.map(c => {
          const tot = ciaMap[c].total || 1;
          return Math.round((ciaMap[c][d.key] || 0) / tot * 100);
        }),
        backgroundColor: d.cor + 'cc',
        borderColor: d.cor,
        borderWidth: 1
      }));
      pdChs.push(new Chart(ctx2, {
        type: 'bar',
        data: { labels: cias, datasets },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false, external: pvsExtTip, callbacks: {
            label: i => {
              const cia = cias[i.dataIndex];
              const d = IND_DEFS[i.datasetIndex];
              const n = ciaMap[cia][d.key] || 0;
              const tot = ciaMap[cia].total || 1;
              return `${d.label}: ${n}/${tot} mun. (${i.raw}%)`;
            },
            afterBody: items => {
              const cia = cias[items[0].dataIndex];
              const d = IND_DEFS[items[0].datasetIndex];
              const simMuns = (munsSimByCia[d.key] || {})[cia] || [];
              const naoMuns = pvsData.filter(r => r.cia === cia && (r[IND_FIELD[d.key]]||'').toLowerCase() !== 'sim').map(r => r.municipio);
              const out = [];
              if (simMuns.length) { out.push(''); simMuns.forEach(mn => out.push(`✓ ${mn}`)); }
              if (naoMuns.length) { out.push(''); naoMuns.forEach(mn => out.push(`✗ ${mn}`)); }
              return out;
            }
          } } },
          scales: {
            x: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 }, callback: v => `${v}%` }, beginAtZero: true, max: 100 },
            y: { grid: { display: false }, ticks: { color: '#ffffff', font: { size: 22 } } }
          }
        }
      }));
      const legEl2 = document.getElementById('pvs-ind-leg');
      if (legEl2) legEl2.innerHTML = IND_DEFS.map(d => `<div style="${legItemSt}">${legDot(d.cor+'cc')}<span>${d.label}</span></div>`).join('');
    }
  }

  // Horizontal bar — famílias por CIA
  const famCiaData = cias.map(c => ciaMap[c].familias);
  if (famCiaData.some(v => v > 0)) {
    const ctx3 = document.getElementById('pvs-fam-cia-chart')?.getContext('2d');
    if (ctx3) {
      pdChs.push(new Chart(ctx3, {
        type: 'bar',
        data: { labels: cias, datasets: [{ data: famCiaData, backgroundColor: cias.map(c => ciaCorByName(c) + 'cc'), borderColor: cias.map(c => ciaCorByName(c)), borderWidth: 1 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false, external: pvsExtTip, callbacks: {
          label: i => `${i.raw.toLocaleString('pt-BR')} famílias`,
          afterBody: items => {
            const cia = cias[items[0].dataIndex];
            const muns = pvsData.filter(r => r.cia === cia && (r.familias_atendidas || 0) > 0).sort((a, b) => (b.familias_atendidas||0) - (a.familias_atendidas||0));
            return muns.length ? [''].concat(muns.map(r => `• ${r.municipio}: ${(r.familias_atendidas||0).toLocaleString('pt-BR')}`)) : [];
          }
        } } }, scales: { x: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } }, beginAtZero: true }, y: { grid: { display: false }, ticks: { color: '#ffffff', font: { size: 22 } } } } }
      }));
    }
  }

  // Horizontal bar — famílias por município
  if (munsSorted.length) {
    const ctx4 = document.getElementById('pvs-fam-mun-chart')?.getContext('2d');
    if (ctx4) {
      pdChs.push(new Chart(ctx4, {
        type: 'bar',
        data: { labels: munsSorted.map(m => m[0]), datasets: [{ data: munsSorted.map(m => m[1]), backgroundColor: munsSorted.map(([mn]) => (munCiaColor[mn] || COR) + 'cc'), borderColor: munsSorted.map(([mn]) => munCiaColor[mn] || COR), borderWidth: 1 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false, external: pvsExtTip, callbacks: {
          label: i => `${munsSorted[i.dataIndex]?.[0]} — ${i.raw.toLocaleString('pt-BR')} famílias`,
          afterBody: items => {
            const mun = munsSorted[items[0].dataIndex]?.[0];
            const r = pvsData.find(d => d.municipio === mun);
            return r ? [`• CIA: ${r.cia}`] : [];
          }
        } } }, scales: { x: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } }, beginAtZero: true }, y: { grid: { display: false }, ticks: { color: '#ffffff', font: { size: 22 }, autoSkip: false } } } }
      }));
    }
  }
}

function renderProdDetail() {
  pdDestroy();
  const tipo = pdTipo;
  if (tipo === 'tempo-resposta') { renderTRModalDetail(); return; }
  if (tipo === 'cursos') { renderCursosModalDetail(); return; }
  if (tipo === 'taftat') { renderTafTatModalDetail(); return; }
  if (tipo === 'pvs') { renderPvsModalDetail(); return; }
  if (tipo === 'conseg') { renderConsegModalDetail(); return; }
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
  const ciaBreakMap = {}; // CIA → { tipo/situacao/natureza: total }
  const breakField = PROD_BREAK[tipo] || (tipo === 'entorpecentes' ? 'entorpecente' : 'natureza');
  rows.forEach(r => {
    const c = r.cia ? normCiaDisplay(r.cia) : ''; if (!c) return;
    aggCia[c] = (aggCia[c]||0) + (Number(r[campo])||0);
    const cat = r[breakField] || 'Não informado';
    if (!ciaBreakMap[c]) ciaBreakMap[c] = {};
    ciaBreakMap[c][cat] = (ciaBreakMap[c][cat]||0) + (Number(r[campo])||0);
  });
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
    `<div style="${full ? 'grid-column:1/-1;' : ''}background:var(--bg2);border:1px solid var(--bd2);border-left:3px solid ${cor};border-radius:10px;padding:16px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:10px">${label}</div>
      <canvas id="${id}"></canvas>
      <div id="${id}-empty" style="display:none;color:var(--tx3);font-size:19px;text-align:center;padding:12px 0">Sem dados para o período</div>
    </div>`;

  const ciaTitleLabel = pdSelCia
    ? (tipo === 'ocorrencias' ? `Municípios — ${pdSelCia}` : `Detalhamento — ${pdSelCia}`)
    : (tipo === 'ocorrencias' ? 'Ranking por CIA — clique para ver municípios' : 'Ranking por CIA');
  const voltarBtn = pdSelCia
    ? `<button onclick="pdSetCia('')" style="margin-left:12px;padding:4px 14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.2);color:#ffffff;border-radius:5px;cursor:pointer;font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:600;letter-spacing:.5px;vertical-align:middle">← Todas as CIAs</button>`
    : '';
  const cardHtmlWithBack = (id, label, full, extra) =>
    `<div style="${full ? 'grid-column:1/-1;' : ''}background:var(--bg2);border:1px solid var(--bd2);border-left:3px solid ${cor};border-radius:10px;padding:16px">
      <div style="display:flex;align-items:center;margin-bottom:10px">
        <span style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff">${label}</span>
        ${extra||''}
      </div>
      <canvas id="${id}"></canvas>
      <div id="${id}-empty" style="display:none;color:var(--tx3);font-size:19px;text-align:center;padding:12px 0">Sem dados para o período</div>
    </div>`;
  let html = cardHtmlWithBack('pd-cia', ciaTitleLabel, true, voltarBtn);
  if (pdSelCia && tipo === 'ocorrencias') {
    html += `<div id="pd-mun-detail" style="grid-column:1/-1;display:none;background:var(--bg2);border:1px solid var(--bd2);border-left:3px solid ${cor};border-radius:10px;padding:16px"></div>`;
  }
  html += cardHtml('pd-evo', 'Evolução Mensal', true);
  if (!pdNatFilter) html += cardHtml('pd-cat', 'Detalhamento por Categoria', true);
  if (tipo === 'ocorrencias') {
    html += `<div style="grid-column:1/-1;background:var(--bg2);border:1px solid var(--bd2);border-left:3px solid ${cor};border-radius:10px;padding:16px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:12px">Natureza × Mês</div>
      <div id="pd-matriz" style="overflow-x:auto;font-size:19px"></div>
    </div>`;
  }
  chartsEl.innerHTML = html;

  // Opções barra horizontal
  const barOpts = {
    indexAxis: 'y', responsive: true,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${i.raw.toLocaleString('pt-BR')}` } } },
    scales: {
      x: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } } },
      y: { grid: { display: false }, ticks: { color: '#ffffff', font: { size: 22 } } }
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
      // Mapa municipio → { natureza: count } para tooltip e drill-down
      const munNatMap = {};
      rows.forEach(r => {
        const mun = r.municipio || 'Não informado';
        const nat = r.natureza  || 'Não informado';
        if (!munNatMap[mun]) munNatMap[mun] = {};
        munNatMap[mun][nat] = (munNatMap[mun][nat] || 0) + (Number(r[campo]) || 0);
      });
      const munAgg = {};
      rows.forEach(r => { const k = r.municipio || 'Não informado'; munAgg[k] = (munAgg[k]||0) + (Number(r[campo])||0); });
      const munEntries = Object.entries(munAgg).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0, 15);
      const munLabels = munEntries.map(([k]) => k);
      const munVals   = munEntries.map(([,v]) => v);
      const munCtx = document.getElementById('pd-cia')?.getContext('2d');
      if (munCtx && munLabels.length) {
        const h = Math.max(300, munLabels.length * 52 + 40);
        munCtx.canvas.style.height = h + 'px';
        munCtx.canvas.style.maxHeight = h + 'px';
        munCtx.canvas.style.cursor = 'pointer';
        let munDetChart = null;
        pdChs.push(new Chart(munCtx, {
          type: 'bar',
          data: { labels: munLabels, datasets: [{ data: munVals, backgroundColor: munLabels.map(() => cor + '99'), borderColor: munLabels.map(() => cor), borderWidth: 1, borderRadius: 3 }] },
          options: {
            ...barOpts, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: {
                label: i => ` ${i.raw.toLocaleString('pt-BR')} ocorrências`,
                afterBody: items => {
                  const nats = Object.entries(munNatMap[items[0]?.label] || {}).sort((a,b)=>b[1]-a[1]).slice(0,5);
                  if (!nats.length) return [];
                  return ['', '  Principais naturezas:', ...nats.map(([n,v]) => `  · ${n}: ${v.toLocaleString('pt-BR')}`)];
                }
              }}
            },
            onClick: (_evt, elems) => {
              if (!elems.length) return;
              const mun = munLabels[elems[0].index];
              const nats = Object.entries(munNatMap[mun] || {}).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
              const det = document.getElementById('pd-mun-detail');
              if (!det) return;
              det.style.display = '';
              det.innerHTML = `<div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:10px">Naturezas — ${mun}</div><canvas id="pd-mun-nat-ch"></canvas>`;
              if (munDetChart) { munDetChart.destroy(); munDetChart = null; }
              const natCtx = document.getElementById('pd-mun-nat-ch')?.getContext('2d');
              if (natCtx && nats.length) {
                const natH = Math.max(300, nats.length * 44 + 40);
                natCtx.canvas.style.height = natH + 'px';
                natCtx.canvas.style.maxHeight = natH + 'px';
                munDetChart = new Chart(natCtx, {
                  type: 'bar',
                  data: { labels: nats.map(([n])=>n), datasets: [{ data: nats.map(([,v])=>v), backgroundColor: cor+'66', borderColor: cor, borderWidth:1, borderRadius:3 }] },
                  options: { ...barOpts, maintainAspectRatio: false }
                });
                pdChs.push(munDetChart);
              }
            }
          }
        }));
      } else if (munCtx) {
        const e = document.getElementById('pd-cia-empty'); if(e) e.style.display=''; munCtx.canvas.style.display='none';
      }
    } else {
      const breakField = PROD_BREAK[tipo] || 'natureza';
      const catAgg = {};
      rows.forEach(r => { const k = r[breakField] || 'Não informado'; catAgg[k] = (catAgg[k]||0) + (Number(r[campo])||0); });
      const catEntries = Object.entries(catAgg).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).slice(0, 15);
      rdBar('pd-cia', catEntries.map(([k]) => k), catEntries.map(([,v]) => v), () => cor);
    }
  } else if (tipo === 'ocorrencias') {
    // Ranking CIA clicável — click filtra CIA e exibe municípios
    const ciaRankLabels = topCias.map(([k]) => k);
    const ciaRankVals   = topCias.map(([, v]) => v);
    const ciaRankCtx    = document.getElementById('pd-cia')?.getContext('2d');
    if (ciaRankCtx && ciaRankLabels.length) {
      const h = Math.max(300, ciaRankLabels.length * 52 + 40);
      ciaRankCtx.canvas.style.height = h + 'px';
      ciaRankCtx.canvas.style.maxHeight = h + 'px';
      ciaRankCtx.canvas.style.cursor = 'pointer';
      pdChs.push(new Chart(ciaRankCtx, {
        type: 'bar',
        data: {
          labels: ciaRankLabels,
          datasets: [{ data: ciaRankVals, backgroundColor: ciaRankLabels.map(l => ciaCorByName(l) + '99'), borderColor: ciaRankLabels.map(l => ciaCorByName(l)), borderWidth: 1, borderRadius: 3 }]
        },
        options: {
          ...barOpts, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: {
              label: i => ` Total: ${i.raw.toLocaleString('pt-BR')}`,
              afterBody: items => {
                const cia = items[0]?.label;
                const cats = Object.entries(ciaBreakMap[cia] || {}).sort((a,b) => b[1]-a[1]).slice(0, 8);
                const linhas = cats.length ? ['', ...cats.map(([k, v]) => `  ${k}: ${v.toLocaleString('pt-BR')}`)] : [];
                return [...linhas, '', '  ▸ clique para ver municípios'];
              }
            }}
          },
          onClick: (_evt, elems) => {
            if (!elems.length) return;
            pdSetCia(ciaRankLabels[elems[0].index]);
          }
        }
      }));
    } else if (ciaRankCtx) {
      const e = document.getElementById('pd-cia-empty'); if (e) e.style.display = ''; ciaRankCtx.canvas.style.display = 'none';
    }
  } else {
    // Ranking CIA com tooltip mensal detalhado
    const ciaLabels = topCias.map(([k]) => k);
    const ciaVals   = topCias.map(([, v]) => v);
    const ciaCtx    = document.getElementById('pd-cia')?.getContext('2d');
    if (ciaCtx && ciaLabels.length) {
      const h = Math.max(300, ciaLabels.length * 52 + 40);
      ciaCtx.canvas.style.height = h + 'px';
      ciaCtx.canvas.style.maxHeight = h + 'px';
      ciaCtx.canvas.style.cursor = 'pointer';
      pdChs.push(new Chart(ciaCtx, {
        type: 'bar',
        data: { labels: ciaLabels, datasets: [{ data: ciaVals, backgroundColor: ciaLabels.map(l => ciaCorByName(l) + '99'), borderColor: ciaLabels.map(l => ciaCorByName(l)), borderWidth: 1, borderRadius: 3 }] },
        options: {
          ...barOpts, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: {
              label: i => ` Total: ${i.raw.toLocaleString('pt-BR')}`,
              afterBody: items => {
                const cia = items[0]?.label;
                const cats = Object.entries(ciaBreakMap[cia] || {}).sort((a,b) => b[1]-a[1]).slice(0, 8);
                const linhas = cats.length ? ['', ...cats.map(([k, v]) => `  ${k}: ${v.toLocaleString('pt-BR')}`)] : [];
                return [...linhas, '', '  ▸ clique para filtrar'];
              }
            }}
          },
          onClick: (_evt, elems) => {
            if (!elems.length) return;
            pdSetCia(ciaLabels[elems[0].index]);
          }
        }
      }));
    } else if (ciaCtx) {
      const e = document.getElementById('pd-cia-empty'); if (e) e.style.display = ''; ciaCtx.canvas.style.display = 'none';
    }
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
          scales: { x: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } } }, y: { grid: GR, beginAtZero: true, ticks: { color: '#ffffff', font: { size: 22 } } } }
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
      `<div style="background:var(--s1);border:1px solid var(--bd);border-top:2px solid var(--bd2);border-radius:8px;padding:16px 18px;min-width:110px;flex:1">
        <div style="font-family:'DM Mono',monospace;font-size:18px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--tx3);margin-bottom:8px">${lbl}</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:48px;font-weight:800;color:var(--tx);line-height:1">${val}</div>
        ${sub?`<div style="font-size:18px;color:var(--tx3);margin-top:5px">${sub}</div>`:''}
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
            <div style="font-family:'DM Mono',monospace;font-size:19px;color:#9b6de0;font-weight:700">${ocorrs.length}x ocorrências</div>
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
                <div style="font-family:'DM Mono',monospace;font-size:22px;font-weight:700;color:#f0c040">${avgIntvs[i]}</div>
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
              legend: { display:true, labels:{ color:'#ffffff', font:{size:22}, boxWidth:14, padding:18 } },
              tooltip: { callbacks:{ label: i => ` ${i.dataset.label}: ${i.raw.toLocaleString('pt-BR')}` } }
            },
            scales: {
              x: { grid:GR, ticks:{ color:'#ffffff', font:{size:22} } },
              y: { grid:GR, beginAtZero:true, ticks:{ color:'#ffffff', font:{size:22} } }
            }
          }
        }));
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INDICADORES DE QUALIDADE P3 — 13 indicadores por mês/ano
// Dois tipos:
//   • Automáticos (IQ_AUTO_CAMPOS): calculados do banco de dados
//     (homicídio doloso, furto/roubo veículos, armas, flagrantes, presos...)
//     com histórico fixo 2021-2024 em IQ_HISTORICO para comparação anual
//   • Manuais (IQ_CAMPOS): inseridos via modal (#iq-mo) por p3/admin/ti
//     (PMs em cursos, atendimento a vítimas, CONSEGs, bairros PVS)
// Renderizado como gráfico de radar + tabela histórica + gráficos de linha
// Controles de edição: passado é bloqueado; admin pode desbloquear por 24h
// ═══════════════════════════════════════════════════════════════════════════

// Carrega os registros manuais de indicadores do banco e dispara renderização
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

  const crimeFiltroHtml = `<select name="iq-crime-filtro" autocomplete="off" onchange="toggleIqCrimeFiltro(this.value)"
    style="background:var(--bg2);color:var(--tx1);border:1px solid var(--bd2);border-radius:6px;padding:5px 10px;font-size:19px;font-family:'DM Mono',monospace;cursor:pointer">
    <option value="" style="background:#111;color:#fff">Todas as ocorrências</option>
    ${CRIMES_CAMPOS.map(c => `<option value="${c.key}"${iqCrimeFiltro === c.key ? ' selected' : ''} style="background:#111;color:#fff">${c.label}</option>`).join('')}
  </select>`;

  const prodFiltroHtml = `<select name="iq-prod-filtro" autocomplete="off" onchange="toggleIqProdFiltro(this.value)"
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
      plugins: { legend: { labels: { color: '#fff', font: { size: 22 }, boxWidth: 14, padding: 16 } } },
      scales: { x: { grid: GR, ticks: { color: '#fff', font: { size: 22 } } }, y: { grid: GR, ticks: { color: '#fff', font: { size: 22 } }, beginAtZero: true } }
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
      plugins: { legend: { labels: { color: '#fff', font: { size: 22 }, boxWidth: 14, padding: 16 } } },
      scales: { x: { grid: GR, ticks: { color: '#fff', font: { size: 22 } } }, y: { grid: GR, ticks: { color: '#fff', font: { size: 22 } }, beginAtZero: true } }
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
      <div style="font-size:19px;color:#ffffff;font-family:'DM Mono',monospace;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;line-height:1.3">${c.label}</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:30px;font-weight:800;color:var(--gold2);line-height:1">${valStr}</div>
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
      plugins: { legend: { labels: { color: '#ffffff', font: { size: 22 }, boxWidth: 12, padding: 14 } } },
      scales: {
        x: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } } },
        y: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } }, beginAtZero: true }
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
      plugins: { legend: { labels: { color: '#ffffff', font: { size: 22 }, boxWidth: 12, padding: 12 } } },
      scales: {
        x: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } } },
        y: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } }, beginAtZero: true }
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
      plugins: { legend: { labels: { color: '#ffffff', font: { size: 22 } } } },
      scales: {
        r: {
          grid: { color: 'rgba(255,255,255,.10)' },
          angleLines: { color: 'rgba(255,255,255,.10)' },
          pointLabels: { color: '#ffffff', font: { size: 22 } },
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
        <select id="iq-sel-mes" name="iq-sel-mes" autocomplete="off" onchange="iqMoMes=this.value;iqMoFillCampos()" style="background:var(--s2);border:1px solid var(--bd2);color:var(--tx);padding:6px 10px;border-radius:5px;font-size:19px;cursor:pointer">${mesOpts}</select>
      </div>
      <div>
        <label style="font-size:19px;color:var(--tx3);font-family:'DM Mono',monospace;display:block;margin-bottom:4px;text-transform:uppercase">Ano</label>
        <select id="iq-sel-ano" name="iq-sel-ano" autocomplete="off" onchange="iqMoAno=+this.value;iqMoFillCampos()" style="background:var(--s2);border:1px solid var(--bd2);color:var(--tx);padding:6px 10px;border-radius:5px;font-size:19px;cursor:pointer">${anoOpts}</select>
      </div>
      <div id="iq-mo-badge" style="margin-top:18px;font-size:19px;color:var(--tx3);font-family:'DM Mono',monospace"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px">` +
    IQ_CAMPOS.map(c => `
      <div>
        <label style="font-size:19px;color:var(--tx3);font-family:'DM Mono',monospace;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">${c.label}${c.unit ? ' (' + c.unit + ')' : ''}</label>
        <input id="iq-inp-${c.key}" name="iq-inp-${c.key}" autocomplete="off" type="number" min="0" step="any"
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

// ═══════════════════════════════════════════════════════════════════════════
// DISQUE DENÚNCIA — registro e análise de denúncias recebidas (#page-p3prod)
// Tabela: disque_denuncia_registros
// Status possíveis: Andamento · Averiguada com Êxito · Averiguada sem Êxito · Sem Averiguação
// Funcionalidades:
//   • Cadastro manual via modal de formulário
//   • Upload em lote via CSV (openDDUpl / confirmDDUpl)
//   • Filtros por ano, mês e CIA
//   • Gráficos: distribuição de status (rosca), evolução mensal,
//     por CIA, por bairro, top denunciantes, tempo médio
// ddClassStatus() normaliza o status ignorando acentos e maiúsculas
// ═══════════════════════════════════════════════════════════════════════════

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
    <div class="kpi-top"></div>
    <div class="kpi-lbl">Disque Denúncia</div>
    <div class="kpi-val">${total.toLocaleString('pt-BR')}</div>
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
  ].map(k => `<div style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid ${k.cor};border-radius:8px;padding:16px">
    <div style="font-size:20px;color:#ffffff;font-family:'DM Mono',monospace;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;line-height:1.3">${k.label}</div>
    <div style="font-family:'Barlow Condensed',sans-serif;font-size:52px;font-weight:800;color:var(--gold2);line-height:1">${k.val}</div>
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

  const thR = 'padding:14px 18px;border-bottom:2px solid var(--bd);font-family:"DM Mono",monospace;font-size:21px;color:#ffffff;text-transform:uppercase;letter-spacing:1px';
  const tdR = 'padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.06);font-family:"Barlow Condensed",sans-serif;font-size:26px;font-weight:600;color:var(--tx2)';
  const rankingHtml = rankingRows.length ? `
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="${thR};text-align:left">CIA</th>
        <th style="${thR};text-align:center">Total</th>
        <th style="${thR};text-align:center">Averiguadas</th>
        <th style="${thR};text-align:center">% Aver.</th>
        <th style="${thR};text-align:center">Av. c/ Êxito</th>
        <th style="${thR};text-align:center">Presos</th>
      </tr></thead>
      <tbody>${rankingRows.map(r => `<tr>
        <td style="${tdR};font-weight:800;color:${ciaCorByName(r.cia)}">${r.cia}</td>
        <td style="${tdR};text-align:center;color:#ffffff">${r.cTotal}</td>
        <td style="${tdR};text-align:center;color:#ffffff">${r.cAver}</td>
        <td style="${tdR};text-align:center;color:var(--gold2)">${r.cPct}</td>
        <td style="${tdR};text-align:center;color:#5ae09a">${r.cExito}</td>
        <td style="${tdR};text-align:center;color:${r.cPresos > 0 ? '#e05555' : '#ffffff'}">${r.cPresos}</td>
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
  filtrosHtml += `<div class="pf-field"><span class="pf-label">ANO</span><select name="dd-ano" autocomplete="off" class="pf-select" onchange="ddSetFiltro('ano',this.value)">`;
  [2024,2025,2026,2027].forEach(a => filtrosHtml += `<option value="${a}"${ddAnoFiltro==a?' selected':''}>${a}</option>`);
  filtrosHtml += `</select></div>`;
  filtrosHtml += `<div class="pf-field"><span class="pf-label">MÊS</span><div style="display:flex;gap:4px;flex-wrap:wrap">`;
  filtrosHtml += `<button onclick="ddSetFiltro('mes','__all__')" class="pf-btn${allMeses?' on':''}">Todos</button>`;
  MES_ORD.forEach(m => { const ok = mesesComDados.has(m); filtrosHtml += `<button onclick="ddTogMes('${m}')" class="pf-btn${(allMeses || ddMesFiltro.includes(m))?' on':''}"${ok ? '' : ' style="opacity:.35" title="Sem dados"'}>${m.slice(0,3)}</button>`; });
  filtrosHtml += `</div></div>`;
  filtrosHtml += `<div class="pf-field"><span class="pf-label">CIA</span><select name="dd-cia" autocomplete="off" class="pf-select" onchange="ddSetFiltro('cia',this.value)">`;
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
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:20px">${kpis}</div>

      <div style="display:flex;flex-direction:column;gap:16px;margin-bottom:16px">
        <div style="${cardBox}">
          ${secTitle('Participação por CIA — Total de DDs Recebidas e Averiguadas c/ Êxito')}
          <div id="dd-donut-main" style="display:flex;align-items:center;justify-content:center;gap:32px;flex-wrap:wrap">
            <div style="display:flex;flex-direction:column;align-items:center;gap:10px;flex-shrink:0">
              <div style="position:relative;width:320px;height:320px">
                <canvas id="dd-chart-donut" style="cursor:pointer" title="Clique na fatia para ver detalhes da CIA"></canvas>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
                  <div style="font-family:'Barlow Condensed',sans-serif;font-size:56px;font-weight:800;color:#fff;line-height:1">${total}</div>
                  <div style="font-size:20px;color:#ffffff;font-family:'DM Mono',monospace;letter-spacing:1px;margin-top:4px">TOTAL DDs</div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;background:rgba(90,224,154,.1);border:1px solid rgba(90,224,154,.3);border-radius:20px;padding:4px 12px">
                <span style="font-size:19px;color:#5ae09a">▲</span>
                <span style="font-size:19px;color:#5ae09a;font-family:'DM Mono',monospace;letter-spacing:1px">fatias destacadas = c/ Êxito</span>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px">
              <div style="display:grid;grid-template-columns:auto 130px 130px;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.12)">
                <span style="font-size:20px;color:#ffffff;font-family:'DM Mono',monospace;letter-spacing:1px">CIA</span>
                <span style="font-size:20px;color:#ffffff;font-family:'DM Mono',monospace;letter-spacing:1px;text-align:right">TOTAL DDs</span>
                <span style="font-size:20px;color:#5ae09a;font-family:'DM Mono',monospace;letter-spacing:1px;text-align:right">c/ ÊXITO</span>
              </div>
              <div id="dd-donut-legend" style="display:flex;flex-direction:column;gap:10px"></div>
              <div style="font-size:18px;color:#ffffff;margin-top:8px;font-family:'DM Mono',monospace;opacity:.7">clique na legenda para ocultar/exibir</div>
            </div>
          </div>
          <div id="dd-donut-drill" style="display:none;flex-direction:column;align-items:center;gap:16px;padding-top:8px">
            <div style="display:flex;align-items:center;gap:12px;width:100%;flex-wrap:wrap">
              <button onclick="ddCloseDrill()" style="padding:5px 14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:6px;cursor:pointer;font-size:19px;font-family:'DM Mono',monospace">← Voltar</button>
              <span id="dd-drill-title" style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;letter-spacing:2px;color:#fff"></span>
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
          <canvas id="dd-chart-municipio" style="height:520px;max-height:520px"></canvas>
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
        return `<div onclick="ddToggleDonut('${cia.replace(/'/g, "\\'")}')" title="${hidden ? 'Mostrar' : 'Ocultar'} ${cia} no gráfico" style="display:grid;grid-template-columns:auto 130px 130px;gap:8px;align-items:center;cursor:pointer;opacity:${hidden ? 0.38 : 1};padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:12px;height:12px;border-radius:2px;background:${hidden ? 'rgba(255,255,255,.2)' : donutCors[i]};flex-shrink:0"></div>
            <div style="width:12px;height:12px;border-radius:2px;background:${hidden ? 'rgba(255,255,255,.2)' : exitoCor};flex-shrink:0"></div>
            <span style="font-size:21px;color:${hidden ? 'rgba(255,255,255,.35)' : donutCors[i]};font-family:'DM Mono',monospace;font-weight:700">${cia}</span>
          </div>
          <div style="text-align:right">
            <span style="font-size:22px;color:${hidden ? 'rgba(255,255,255,.35)' : '#ffffff'};font-family:'Barlow Condensed',sans-serif;font-weight:700">${val}</span>
            <span style="font-size:19px;color:${hidden ? 'rgba(255,255,255,.2)' : donutCors[i]};margin-left:5px;font-weight:700">${pct}%</span>
          </div>
          <div style="text-align:right">
            <span style="font-size:22px;color:${hidden ? 'rgba(255,255,255,.35)' : exitoCor};font-family:'Barlow Condensed',sans-serif;font-weight:700">${exit}</span>
            <span style="font-size:19px;color:${hidden ? 'rgba(255,255,255,.2)' : exitoCor};margin-left:5px">${exitPct}%</span>
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
          legend: { labels: { color: '#fff', font: { size: 22 }, boxWidth: 14, padding: 16 } },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: i => ` ${i.dataset.label}: ${i.raw.toLocaleString('pt-BR')}`,
            },
          },
        },
        scales: {
          x: { stacked: true, grid: GR, ticks: { color: '#fff', font: { size: 22 } } },
          y: { stacked: true, grid: GR, ticks: { color: '#fff', font: { size: 22 } }, beginAtZero: true },
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
        plugins: { legend: { labels: { color: '#fff', font: { size: 22 }, boxWidth: 12, padding: 14 } } },
        scales: {
          x: { stacked: true, grid: GR, ticks: { color: '#fff', font: { size: 22 } }, beginAtZero: true },
          y: { stacked: true, grid: GR, ticks: { color: '#fff', font: { size: 22 } } }
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
    const semDados = tempoMedias.every(v => v === null);
    if (semDados) {
      cTempo.style.display = 'none';
      const msg = document.createElement('div');
      msg.style.cssText = 'color:var(--tx3);font-size:19px;padding:24px 0;text-align:center';
      msg.textContent = 'Sem dados de atendimento — preencha a coluna "Data do Atendimento" no CSV';
      cTempo.parentElement.appendChild(msg);
    } else {
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
            x: { grid: GR, ticks: { color: '#fff', font: { size: 22 } } },
            y: { grid: GR, ticks: { color: '#fff', font: { size: 22 } }, beginAtZero: true }
          }
        }
      });
    }
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
    <input type="date" name="dd-edit-data" id="dd-edit-data" autocomplete="off" value="${fmtDate(rec?.data)}" style="${inputStyle}">
    <label style="${labelStyle}">Cia</label>
    <select name="dd-edit-cia" id="dd-edit-cia" autocomplete="off" style="${selectStyle}">
      ${DD_CIAS.map(c => `<option value="${c}"${rec?.cia===c?' selected':''}>${c}</option>`).join('')}
    </select>
    <label style="${labelStyle}">Nº Disque Denúncia</label>
    <input type="text" name="dd-edit-numero" id="dd-edit-numero" autocomplete="off" value="${rec?.numero_dd||''}" placeholder="Ex: DD-2026-0001" style="${inputStyle}">
    <label style="${labelStyle}">Data do Atendimento</label>
    <input type="date" name="dd-edit-dtatend" id="dd-edit-dtatend" autocomplete="off" value="${fmtDate(rec?.data_atendimento)}" style="${inputStyle}">
    <label style="${labelStyle}">Status</label>
    <select name="dd-edit-status" id="dd-edit-status" autocomplete="off" style="${selectStyle}">
      ${DD_STATUS.map(s => `<option value="${s}"${(rec?.status||'Andamento')===s?' selected':''}>${s}</option>`).join('')}
    </select>
    <label style="${labelStyle}">Flagrante</label>
    <select name="dd-edit-flagrante" id="dd-edit-flagrante" autocomplete="off" style="${selectStyle}">
      <option value="false"${!rec?.flagrante?' selected':''}>Não</option>
      <option value="true"${rec?.flagrante?' selected':''}>Sim</option>
    </select>
    <label style="${labelStyle}">Qtd. Presos</label>
    <input type="number" name="dd-edit-presos" id="dd-edit-presos" autocomplete="off" value="${rec?.quant_presos||0}" min="0" style="${inputStyle}">
    <label style="${labelStyle}">Município</label>
    <input type="text" name="dd-edit-municipio" id="dd-edit-municipio" autocomplete="off" value="${rec?.municipio||''}" placeholder="Ex: São Paulo" style="${inputStyle}">
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
    data:              document.getElementById('dd-edit-data').value,
    cia:               document.getElementById('dd-edit-cia').value,
    numero_dd:         document.getElementById('dd-edit-numero').value.trim(),
    data_atendimento:  document.getElementById('dd-edit-dtatend').value || null,
    status:            document.getElementById('dd-edit-status').value,
    flagrante:         document.getElementById('dd-edit-flagrante').value === 'true',
    quant_presos:      Number(document.getElementById('dd-edit-presos').value) || 0,
    municipio:         document.getElementById('dd-edit-municipio').value.trim() || null,
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

// ═══════════════════════════════════════════════════════════════════════════
// DISQUE DENÚNCIA — UPLOAD CSV (#dd-upl-mo)
// Permite importar múltiplos registros de Disque Denúncia via CSV.
// O backend faz upsert por numero_dd (não apaga registros existentes).
// ═══════════════════════════════════════════════════════════════════════════

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

