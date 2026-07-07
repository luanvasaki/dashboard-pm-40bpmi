// ═══════════════════════════════════════════════════════════════════════════
// INTELIGÊNCIA OPERACIONAL — análise espaciotemporal das ocorrências InfoCrim
// Renderizado dentro do modal de detalhes (#mo-intel) quando há dados InfoCrim.
// Componentes:
//   • renderOcorrHeatmap() → pico dia/período e dia mais crítico
//   • renderTipoLocal()    → ranking de tipos de local (gráfico barra horizontal)
//   • renderBairros()      → top bairros com mais ocorrências
// horaBlock() divide o dia em 4 blocos: Madrugada/Manhã/Tarde/Noite
// ═══════════════════════════════════════════════════════════════════════════

// Normaliza nome do dia da semana para abreviação padrão (Dom, Seg, Ter...)
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

// Renderiza o painel de inteligência no modal com os dados InfoCrim filtrados
// Chamada após loadMoOcorr() retornar os registros da tabela 'ocorrencias'
function renderMoIntel(data) {
  moIntelChs.forEach(c => c.destroy()); moIntelChs = [];
  const sec = document.getElementById('mo-intel');
  if (!sec) return;
  if (!data.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  renderOcorrHeatmap(data);
  renderTipoLocal(data);
  renderBairros(data);
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
    options: { responsive:true, cutout:'60%', plugins:{ legend:{ position:'bottom', labels:{ boxWidth:14, font:{size:22}, padding:20, color:'#ffffff' } } } }
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
        x: { grid: GR, ticks: { stepSize: 1, color: '#ffffff', font: { size: 22 } } },
        y: { grid: GR, ticks: { color: '#ffffff', font: { size: 22 }, autoSkip: false } }
      }
    }
  });
}


