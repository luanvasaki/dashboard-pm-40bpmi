// ═══════════════════════════════════════════════════════════════════════════
// RENDER GERAL — dispara re-render de todas as seções após mudança de filtro
// Chamada sempre que selAno ou selMeses mudam.
// ═══════════════════════════════════════════════════════════════════════════

// Atualiza labels de período e chama todas as funções de renderização em sequência
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

// ═══════════════════════════════════════════════════════════════════════════
// KPI CARDS — linha de indicadores no topo da Visão Geral (#kpi-row)
// Um card por crime + cards agrupados (ex: Roubo/Furto Veículos).
// Cada card mostra: total avaliado, meta e variação % vs meta.
// Ao clicar, abre o modal de detalhes (moOpen).
// ⚠ CRÍTICO: CRIME_GROUPS define crimes que compartilham um card — alterar
//   impacta os cálculos de insights e o modal de detalhes.
// ═══════════════════════════════════════════════════════════════════════════

// Gera o HTML dos cards KPI e insere em #kpi-row
function renderKPIs() {
  const sc = scope('visao');
  const groupedCrimes = CRIME_GROUPS.flatMap(g => g.crimes);
  let html = '';

  const _kpiTag = (aval, meta) => {
    if (meta <= 0) return meta === 0 && aval === 0
      ? `<div class="tag tok">— sem meta</div>`
      : `<div class="tag tbad">▲ sem meta</div>`;
    const vp  = ((aval - meta) / meta * 100).toFixed(0);
    // Compara aval/meta direto (não o % já arredondado) — um desvio de só
    // +0.06% (ex: 1581 vs meta 1580) arredonda pra "0%" e `parseFloat(vp)>0`
    // dava falso, mostrando ▼ verde (favorável) pra um crime que na
    // verdade está acima da meta. Achado real comparando contra o banco.
    const up  = aval > meta;
    return `<div class="tag ${up ? 'tbad' : 'tok'}">${up ? '▲' : '▼'}${Math.abs(vp)}% meta</div>`;
  };

  // Cards individuais (pula os que fazem parte de um grupo)
  CRIMES.forEach((c, i) => {
    if (groupedCrimes.includes(c)) return;
    const aval = sf(q({ crime: c, mes: selMeses, ...sc }));
    const meta = sf(q({ crime: c, mes: selMeses, ...sc }), 'meta');
    html += `<div class="kpi" onclick="moOpen('${c}','${PAL[i]}')" title="Clique para detalhes">
      <div class="kpi-top"></div>
      <div class="kpi-lbl">${cl(c)}</div>
      <div class="kpi-val">${aval}</div>
      <div class="kpi-row2">
        <div class="kpi-sub">Meta: ${meta}</div>
        ${_kpiTag(aval, meta)}
      </div>
      <div class="kpi-hint">▸ clique p/ detalhes</div>
    </div>`;
  });

  // Cards agrupados
  CRIME_GROUPS.forEach(g => {
    const aval = sf(q({ crime: g.crimes, mes: selMeses, ...sc }));
    const meta = sf(q({ crime: g.crimes, mes: selMeses, ...sc }), 'meta');
    html += `<div class="kpi" onclick="moOpenGroup('${g.label}')" title="Clique para detalhes">
      <div class="kpi-top"></div>
      <div class="kpi-lbl">${g.label}</div>
      <div class="kpi-val">${aval}</div>
      <div class="kpi-row2">
        <div class="kpi-sub">Meta: ${meta}</div>
        ${_kpiTag(aval, meta)}
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

// ═══════════════════════════════════════════════════════════════════════════
// VISÃO GERAL — painel principal da seção P3
// Contém:
//   • Gráfico de barras "Avaliado × Meta" por crime (c-var) com plugin de
//     rótulos customizados acima das barras
//   • Gráfico de evolução mensal por município (c-evol-muns)
//   • Heatmap de municípios × crimes (vis-hm-tbl)
//   • Cards de insights automáticos
// Filtro de escopo: pageFilters.visao (Batalhão / CIA / Município)
// ═══════════════════════════════════════════════════════════════════════════

// Renderiza todos os componentes da Visão Geral com o filtro atual
function renderVisao() {
  const sc  = scope('visao');

  // Popula o dropdown de crime na primeira vez
  const sel = document.getElementById('evol-mun-crime');
  if (sel && !sel.options.length) {
    CRIMES.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
  }
  renderEvolMuns();
  _initCompAnosSelects();
  renderComparacaoAnos();
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
        y: { grid: GR, ticks: { callback: v => v + '%', color: '#ffffff', font: { size: 22 } }, suggestedMin: -30, suggestedMax: 30 }
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
        legend: { position: 'bottom', labels: { boxWidth: 20, padding: 18, font: { size: 22 }, usePointStyle: true, color: '#ffffff' } }
      },
      scales: {
        x: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } } },
        y: { grid: GR, beginAtZero: true, ticks: { stepSize: 1, color: '#ffffff', font: { size: 22 } } }
      }
    }
  });
}

// Inicializa os selects de crime e anos do comparativo (roda uma única vez)
function _initCompAnosSelects() {
  const selCrime = document.getElementById('comp-anos-crime');
  const selA     = document.getElementById('comp-anos-a');
  const selB     = document.getElementById('comp-anos-b');
  if (!selCrime || !selA || !selB) return;

  if (!selCrime.options.length) {
    CRIMES.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; selCrime.appendChild(o); });
  }
  if (!selA.options.length) {
    ANOS.forEach((a, i) => {
      const oA = document.createElement('option'); oA.value = a; oA.textContent = a; if (i === 0) oA.selected = true; selA.appendChild(oA);
      const oB = document.createElement('option'); oB.value = a; oB.textContent = a; if (i === 1) oB.selected = true; selB.appendChild(oB);
    });
  }
}

// Gráfico de comparação entre dois anos para o crime e escopo selecionados
function renderComparacaoAnos() {
  const selCrime = document.getElementById('comp-anos-crime');
  const selA     = document.getElementById('comp-anos-a');
  const selB     = document.getElementById('comp-anos-b');
  if (!selCrime || !selA || !selB) return;

  const crime = selCrime.value || CRIMES[0];
  const anoA  = parseInt(selA.value);
  const anoB  = parseInt(selB.value);
  const sc    = scope('visao');

  const MESES_FIXOS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const qAno = (ano, mes) => RAW.filter(r =>
    r.ano === ano && r.crime === crime && r.mes === mes &&
    (!sc.mun || r.mun === sc.mun) &&
    (!sc.cia || r.cia === sc.cia)
  );

  const dadosA = MESES_FIXOS.map(mes => sf(qAno(anoA, mes)));
  const dadosB = MESES_FIXOS.map(mes => sf(qAno(anoB, mes)));

  // Só mostra até o último mês com dado em qualquer dos dois anos
  let ultimo = MESES_FIXOS.length - 1;
  for (let i = MESES_FIXOS.length - 1; i >= 0; i--) {
    if (dadosA[i] > 0 || dadosB[i] > 0) { ultimo = i; break; }
  }
  const labels  = MESES_FIXOS.slice(0, ultimo + 1);
  const sliceA  = dadosA.slice(0, ultimo + 1);
  const sliceB  = dadosB.slice(0, ultimo + 1);

  mk('c-comp-anos', {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: String(anoA),
          data: sliceA,
          borderColor: '#4a9ee8', backgroundColor: 'rgba(74,158,232,.12)',
          tension: 0.3, pointRadius: 5, borderWidth: 2.5, fill: true,
          pointBackgroundColor: '#4a9ee8'
        },
        {
          label: String(anoB),
          data: sliceB,
          borderColor: '#e05555', backgroundColor: 'rgba(224,85,85,.10)',
          tension: 0.3, pointRadius: 5, borderWidth: 2.5, fill: true,
          borderDash: [6, 3],
          pointBackgroundColor: '#e05555'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 20, padding: 18, font: { size: 22 }, color: '#ffffff' } },
        tooltip: {
          callbacks: {
            footer(items) {
              if (items.length < 2) return '';
              const diff = items[0].raw - items[1].raw;
              const pct  = items[1].raw > 0 ? ((diff / items[1].raw) * 100).toFixed(0) : '—';
              const sinal = diff > 0 ? '+' : '';
              return `Δ ${sinal}${diff} (${sinal}${pct}%)`;
            }
          }
        }
      },
      scales: {
        x: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } } },
        y: { grid: GR, beginAtZero: true, ticks: { stepSize: 1, color: '#ffffff', font: { size: 22 } } }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// METAS — tabela detalhada por município e crime (#tbl-metas)
// Exibe: Anterior · Meta · Avaliado · Var% vs Anterior · Status (pill colorida)
// Status:
//   Ótimo       → avaliado ≤ 80% da meta
//   Na Meta     → avaliado ≤ meta
//   Em Evolução → acima da meta, mas melhorando vs anterior
//   Acima       → acima da meta e não melhorando
// Filtro: pageFilters.metas (página independente do filtro da sidebar)
// ═══════════════════════════════════════════════════════════════════════════

// Gera uma linha de cabeçalho de CIA separando grupos de municípios na tabela
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


// ═══════════════════════════════════════════════════════════════════════════
// HEATMAP — tabela calor de municípios × crimes
// Duas versões:
//   • renderVisaoHeatmap() → embutida na Visão Geral, usa pageFilters.visao
//   • renderHeatmap()      → aba dedicada, usa hmMeses (filtro independente)
// Cor da célula: hcol(avaliado, meta, anterior) — verde/laranja/vermelho
// ═══════════════════════════════════════════════════════════════════════════

// Renderiza o heatmap integrado à Visão Geral (filtro = escopo da visão)
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

// ═══════════════════════════════════════════════════════════════════════════
// INSIGHTS — 6 cards automáticos de análise situacional (#ins-grid)
// Calculados a cada renderização com base nos filtros ativos.
// Cards gerados:
//   1. Crime com maior crescimento % vs anterior
//   2. Crime mais crítico (maior desvio acima da meta)
//   3. Crime com melhor desempenho (abaixo da meta)
//   4. Resumo geral (N crimes dentro/acima da meta)
//   5. Município em alerta (pior score: mais crimes acima da meta)
//   6. Município destaque (melhor score; nunca igual ao município em alerta)
// ⚠ Score de município = crimes_ok − crimes_acima (garante distinção entre 5 e 6)
// ═══════════════════════════════════════════════════════════════════════════

// Calcula e renderiza os 6 cards de insight com base no filtro atual
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

  // Totais agregados — mesma lógica dos KPI cards
  const crimesTotais = CRIMES.map(c => {
    const a = sf(qsc({ crime: c }));
    const m = sf(qsc({ crime: c }), 'meta');
    const desvio = m > 0 ? (a - m) / m * 100 : (a > 0 ? 100 : -Infinity);
    return { c, a, m, desvio };
  });

  // Crime mais crítico: maior desvio sobre a meta nos totais do batalhão (coerente com KPI cards)
  const crimeCritico = [...crimesTotais]
    .filter(x => x.m > 0 && x.a > x.m)
    .sort((a, b) => b.desvio - a.desvio)[0] || null;

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
    // 2. Crime mais crítico (totais do batalhão, igual ao KPI card)
    // 1 casa decimal (não 0) — um desvio pequeno tipo +0.06% arredondava
    // pra "+0%", o que lia como se não houvesse desvio nenhum bem no card
    // que está justamente dizendo que esse crime é o "crítico" do período.
    crimeCritico
      ? { t: 'red', v: `+${crimeCritico.desvio.toFixed(1)}%`, title: `Crítico — ${crimeCritico.c}`, body: `${crimeCritico.a} ocorrências contra meta de ${crimeCritico.m}. Desvio de ${crimeCritico.desvio.toFixed(1)}% acima da meta no batalhão. Escopo: ${lbl}.` }
      : { t: 'green', v: '✓', title: 'Todos dentro da meta', body: `Nenhum crime acima da meta no período. Escopo: ${lbl}.` },
    // 3. Melhor desempenho
    crimeMelhor
      ? { t: 'green', v: `${Math.abs(crimeMelhor.desvio).toFixed(1)}%`, title: `Destaque — ${crimeMelhor.c}`, body: `${crimeMelhor.a} ocorrências contra meta de ${crimeMelhor.m}. ${Math.abs(crimeMelhor.desvio).toFixed(1)}% abaixo da meta. Escopo: ${lbl}.` }
      : { t: '', v: '—', title: 'Nenhum crime abaixo da meta', body: `Todos os crimes com meta definida estão no limite ou acima. Escopo: ${lbl}.` },
    // 4. Resumo de metas
    {
      t: acima > 0 ? 'red' : 'green',
      v: `${ok}/${CRIMES.length}`,
      title: 'Crimes dentro da meta',
      // emEvol é subconjunto de acima (mesmos crimes, não uma categoria à
      // parte) — "X acima e Y em evolução" lia como se fossem crimes
      // diferentes, somando errado na cabeça de quem lê. "dos quais"
      // deixa claro que é o mesmo grupo.
      body: `${ok} crimes dentro da meta, ${acima} acima${emEvol > 0 ? ` (dos quais ${emEvol} em evolução, melhorando vs anterior)` : ''}. Escopo: ${lbl}.`
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

// ═══════════════════════════════════════════════════════════════════════════
// EVOLUÇÃO — gráficos de linha de tendência mensal por crime
// Filtro: pageFilters.evolucao (independente da sidebar)
// Mostra Avaliado × Meta × Anterior ao longo dos meses selecionados
// ═══════════════════════════════════════════════════════════════════════════

// Renderiza o gráfico de evolução mensal com o crime e escopo selecionados
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
      plugins: { legend: { labels: { boxWidth: 20, padding: 16, font: { size: 22 }, color: '#ffffff' } } },
      scales: { x: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 } } }, y: { grid: GR, beginAtZero: true, ticks: { color: '#ffffff', font: { size: 22 } } } }
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

