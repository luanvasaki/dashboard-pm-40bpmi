// ═══════════════════════════════════════════════════════════════
// P5 · COMUNICAÇÃO SOCIAL — Láureas do Efetivo
// Único conteúdo da seção por enquanto. Mostra, pra cada PM do efetivo, o
// grau mais alto de láurea que ele já alcançou (ou nenhum) — gráfico de
// barras + lista nominal filtrável por grau, reaproveitando p1CardGrid
// (mesmo componente usado nos KPIs de PM do P1) pra abrir o prontuário.
// ═══════════════════════════════════════════════════════════════

let p5EfetivoFull = [];
let p5Efetivo = [];
let p5LaureasFull = [];
let p5Laureas = [];
let p5FiltroGrau = null;
let p5FiltroCia = '';
let p5FiltroAnoMes = ''; // ano selecionado pro gráfico "Láureas por Mês" ('' = Total Histórico)
let p5FiltroAnoMesTocado = false; // true assim que o usuário mexe no seletor — trava o auto-default pro ano mais recente
let p5FiltroGrauMes = ''; // grau selecionado pro gráfico "Láureas por Mês" ('' = todos os graus)
let p5Chart = null;
let p5ChartAno = null;
let p5ChartMes = null;
let p5PorMesLaureas = Array.from({ length: 12 }, () => []); // PMs (já com dados de efetivo) que ganharam láurea em cada mês, na mesma filtragem do gráfico "Láureas por Mês" — populado em p5RenderEvolucao, consumido por p5MesModalOpen

// Mesmas cores reais de material usadas no badge de grau do prontuário
// (ver GRAU_COR em p1.js) — repetidas aqui porque p5.js pode ser a única
// tela carregada nessa navegação (não dá pra depender de p1.js já ter
// rodado sua definição local).
const P5_GRAU_COR = { '1':'#f2e6c9','2':'#d4af37','3':'#d0d4dc','4':'#a8b4c0','5':'#b87333' };
const P5_GRAU_LBL = { '1':'1º Grau','2':'2º Grau','3':'3º Grau','4':'4º Grau','5':'5º Grau' };
const P5_SEM_COR = '#607090';
const P5_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// efetivo_pm não tem coluna `cia` própria, só `opm` (ex: "2ª Cia 1º Pel -
// Piedade") — normCiaDisplay (ocorr-modal.js, sempre carregado no mesmo
// index.html) extrai o padrão "Nª CIA"/"FT" daí, igual ao resto do P3.
function p5CiaOf(opm) { return typeof normCiaDisplay === 'function' ? normCiaDisplay(opm || '') : (opm || '—'); }

// laureas[].re já vem sem dígito verificador do backend — normaliza também
// efetivo[].re (que tem o dígito) pra casar os dois lados.
function p5BaseRe(re) { return String(re || '').split('-')[0]; }

async function loadP5Section() {
  const kpisEl = document.getElementById('p5-kpis');
  if (kpisEl) kpisEl.innerHTML = `<div style="color:var(--tx3);font-size:19px;grid-column:1/-1">Carregando...</div>`;
  try {
    const data = await authFetch(`${API}/laureas/resumo`).then(r => r.json());
    p5EfetivoFull = Array.isArray(data?.efetivo) ? data.efetivo : [];
    p5LaureasFull = Array.isArray(data?.laureas) ? data.laureas : [];
  } catch {
    p5EfetivoFull = [];
    p5LaureasFull = [];
  }
  p5Render();
}

function p5BuildFiltroBar() {
  const barEl = document.getElementById('p5-filtro-bar');
  if (!barEl) return;
  const cias = [...new Set(p5EfetivoFull.map(p => p5CiaOf(p.opm)).filter(Boolean))].sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b, 'pt-BR');
  });
  if (!cias.length) { barEl.innerHTML = ''; return; }
  barEl.innerHTML = `<div class="pf-field"><span class="pf-label">CIA</span><select name="p5-cia" autocomplete="off" class="pf-select" onchange="p5SetFiltroCia(this.value)">` +
    `<option value="">Todas</option>` +
    cias.map(c => `<option value="${c}"${c === p5FiltroCia ? ' selected' : ''}>${c}</option>`).join('') +
    `</select></div>`;
}

function p5SetFiltroCia(val) {
  p5FiltroCia = val || '';
  p5Render();
}

function p5SetFiltroAnoMes(val) {
  p5FiltroAnoMes = val || '';
  p5FiltroAnoMesTocado = true;
  p5RenderEvolucao();
}

function p5SetFiltroGrauMes(val) {
  p5FiltroGrauMes = val || '';
  p5RenderEvolucao();
}

function p5Render() {
  p5Efetivo = p5FiltroCia ? p5EfetivoFull.filter(p => p5CiaOf(p.opm) === p5FiltroCia) : p5EfetivoFull;
  p5Laureas = p5FiltroCia ? p5LaureasFull.filter(l => p5CiaOf(l.opm) === p5FiltroCia) : p5LaureasFull;

  p5BuildFiltroBar();

  const total = p5Efetivo.length;
  const semLaurea = p5Efetivo.filter(p => !p.grau).length;
  const comLaurea = total - semLaurea;
  const porGrau = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  p5Efetivo.forEach(p => { if (p.grau && porGrau[p.grau] !== undefined) porGrau[p.grau]++; });

  const kpisEl = document.getElementById('p5-kpis');
  if (kpisEl) {
    kpisEl.innerHTML = `
      <div class="pd-kpi"><div class="pd-kpi-lbl">Efetivo Total</div><div class="pd-kpi-val">${total}</div></div>
      <div class="pd-kpi"><div class="pd-kpi-lbl">Com Láurea</div><div class="pd-kpi-val">${comLaurea}</div></div>
      <div class="pd-kpi"><div class="pd-kpi-lbl">Sem Láurea</div><div class="pd-kpi-val" style="color:#e05555">${semLaurea}</div></div>`;
  }

  const ctx = document.getElementById('p5-chart-grau')?.getContext('2d');
  if (ctx) {
    if (p5Chart) { p5Chart.destroy(); p5Chart = null; }
    const labels = ['1º Grau', '2º Grau', '3º Grau', '4º Grau', '5º Grau', 'Sem Láurea'];
    const keys   = ['1', '2', '3', '4', '5', 'sem'];
    const valores = [porGrau['1'], porGrau['2'], porGrau['3'], porGrau['4'], porGrau['5'], semLaurea];
    const cores   = [P5_GRAU_COR['1'], P5_GRAU_COR['2'], P5_GRAU_COR['3'], P5_GRAU_COR['4'], P5_GRAU_COR['5'], P5_SEM_COR];
    p5Chart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data: valores, backgroundColor: cores.map(c => c + 'cc'), borderColor: cores, borderWidth: 2 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, els) => { if (els.length) p5SetFiltro(keys[els[0].index]); },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: i => ` ${i.raw} PM${i.raw !== 1 ? 's' : ''}` } }
        },
        scales: {
          x: { grid: GR, ticks: { color: '#ffffff', font: { size: 20 } } },
          y: { grid: GR, beginAtZero: true, ticks: { color: '#ffffff', font: { size: 20 } } }
        }
      }
    });
  }

  p5RenderEvolucao();

  const filtrosEl = document.getElementById('p5-filtros');
  if (filtrosEl) {
    const btn = (key, lbl, cor) => {
      const on = p5FiltroGrau === key;
      return `<button onclick="p5SetFiltro('${key}')" style="padding:6px 14px;background:${on ? cor + '22' : 'var(--s2)'};border:1px solid ${on ? cor : cor + '44'};color:${on ? cor : 'var(--tx)'};border-radius:6px;cursor:pointer;font-family:'DM Mono',monospace;font-size:15px;font-weight:600;transition:all .15s">${lbl}</button>`;
    };
    filtrosEl.innerHTML =
      ['1', '2', '3', '4', '5'].map(g => btn(g, P5_GRAU_LBL[g], P5_GRAU_COR[g])).join('') +
      btn('sem', 'Sem Láurea', '#e05555');
  }

  p5RenderGrid();
}

function p5SetFiltro(key) {
  p5FiltroGrau = (p5FiltroGrau === key) ? null : key;
  p5Render();
}

// Duas leituras complementares da mesma lista de láureas (já filtrada por
// CIA em p5Render): evolução ano a ano (tendência ao longo do tempo) e soma
// por mês-calendário (pra achar os meses que mais concentram concessão de
// láurea, ex: aniversário da unidade/datas comemorativas) — por padrão soma
// todos os anos, mas dá pra restringir a um ano específico via p5FiltroAnoMes.
function p5RenderEvolucao() {
  // anosTodosGraus (sem filtro de grau) só serve pra popular o seletor de ANO
  // com todos os anos que têm alguma láurea, mesmo que nenhuma seja do grau
  // selecionado no momento — senão trocar o filtro de grau podia fazer o ano
  // escolhido sumir da lista sem motivo aparente.
  const porAnoTodosGraus = {};
  p5Laureas.forEach(l => {
    const ano = parseInt(String(l.concessao || '').split('-')[0], 10);
    if (!isNaN(ano)) porAnoTodosGraus[ano] = (porAnoTodosGraus[ano] || 0) + 1;
  });
  const anos = Object.keys(porAnoTodosGraus).map(Number).sort((a, b) => a - b);
  if (p5FiltroAnoMes && !anos.includes(Number(p5FiltroAnoMes))) p5FiltroAnoMes = '';
  // Enquanto o usuário não mexer no seletor, trava no ano mais recente disponível
  // (em vez de Total Histórico) — assim que ele escolhe algo (inclusive Total
  // Histórico), p5FiltroAnoMesTocado vira true e esse auto-default para de agir.
  if (!p5FiltroAnoMesTocado && !p5FiltroAnoMes && anos.length) p5FiltroAnoMes = String(anos[anos.length - 1]);

  const anoFiltroEl = document.getElementById('p5-mes-ano-filtro');
  if (anoFiltroEl) {
    if (anos.length) {
      const anosDesc = [...anos].sort((a, b) => b - a);
      anoFiltroEl.innerHTML = `<div class="pf-field"><span class="pf-label">Ano</span><select name="p5-mes-ano" autocomplete="off" class="pf-select" onchange="p5SetFiltroAnoMes(this.value)">` +
        anosDesc.map(a => `<option value="${a}"${String(a) === String(p5FiltroAnoMes) ? ' selected' : ''}>${a}</option>`).join('') +
        `<option value=""${p5FiltroAnoMes ? '' : ' selected'}>Total Histórico</option>` +
        `</select></div>`;
    } else {
      anoFiltroEl.innerHTML = '';
    }
  }

  const grausDisponiveis = [...new Set(p5Laureas.map(l => l.grau).filter(g => g != null))].sort((a, b) => a - b);
  if (p5FiltroGrauMes && !grausDisponiveis.map(String).includes(p5FiltroGrauMes)) p5FiltroGrauMes = '';

  const grauFiltroEl = document.getElementById('p5-mes-grau-filtro');
  if (grauFiltroEl) {
    if (grausDisponiveis.length) {
      grauFiltroEl.innerHTML = `<div class="pf-field"><span class="pf-label">Grau</span><select name="p5-mes-grau" autocomplete="off" class="pf-select" onchange="p5SetFiltroGrauMes(this.value)">` +
        `<option value=""${p5FiltroGrauMes ? '' : ' selected'}>Todos</option>` +
        grausDisponiveis.map(g => `<option value="${g}"${String(g) === p5FiltroGrauMes ? ' selected' : ''}>${P5_GRAU_LBL[g]}</option>`).join('') +
        `</select></div>`;
    } else {
      grauFiltroEl.innerHTML = '';
    }
  }

  // porAno é a série exibida no gráfico de evolução — respeita o mesmo filtro
  // de grau do gráfico "Láureas por Mês" (os dois seletores ficam lado a lado
  // e o usuário espera que ambos reajam à mesma escolha de grau).
  const porAno = {};
  p5Laureas.forEach(l => {
    if (p5FiltroGrauMes && String(l.grau) !== p5FiltroGrauMes) return;
    const ano = parseInt(String(l.concessao || '').split('-')[0], 10);
    if (!isNaN(ano)) porAno[ano] = (porAno[ano] || 0) + 1;
  });

  const anoTituloEl = document.getElementById('p5-ano-titulo');
  if (anoTituloEl) {
    const parteGrauAno = p5FiltroGrauMes
      ? ` · ${p5FiltroGrauMes}<span style="text-transform:none">º</span> Grau`
      : '';
    anoTituloEl.innerHTML = `Evolução de Láureas por Ano${parteGrauAno}`;
  }

  const tituloEl = document.getElementById('p5-mes-titulo');
  if (tituloEl) {
    const parteAno = p5FiltroAnoMes || 'Total Histórico';
    // O "º" de "1º Grau" etc. vira "ª" sob text-transform:uppercase (bug
    // conhecido do CSS com o indicador ordinal masculino) — isola ele num
    // span com transform:none pra escapar dessa conversão.
    const parteGrau = p5FiltroGrauMes
      ? ` · ${p5FiltroGrauMes}<span style="text-transform:none">º</span> Grau`
      : '';
    tituloEl.innerHTML = `Láureas por Mês (${parteAno}${parteGrau})`;
  }

  // porMes é a série exibida nas barras (respeita o filtro de grau, se houver);
  // porMesPorGrau é o detalhamento completo por grau usado no tooltip — sempre
  // considera todos os graus, independente do filtro, pra dar contexto no hover;
  // p5PorMesLaureas guarda os PMs por trás de cada barra (mesma filtragem de
  // porMes), consumido ao clicar num mês (ver p5MesModalOpen).
  const efetivoPorBaseRe = new Map(p5EfetivoFull.map(p => [p5BaseRe(p.re), p]));
  const porMes = new Array(12).fill(0);
  const porMesPorGrau = Array.from({ length: 12 }, () => ({}));
  p5PorMesLaureas = Array.from({ length: 12 }, () => []);
  p5Laureas.forEach(l => {
    const [anoStr, mesStr] = String(l.concessao || '').split('-');
    if (p5FiltroAnoMes && anoStr !== String(p5FiltroAnoMes)) return;
    const mesIdx = parseInt(mesStr, 10) - 1;
    if (mesIdx < 0 || mesIdx >= 12) return;

    const gKey = l.grau != null ? String(l.grau) : 'sem';
    porMesPorGrau[mesIdx][gKey] = (porMesPorGrau[mesIdx][gKey] || 0) + 1;

    if (p5FiltroGrauMes && String(l.grau) !== p5FiltroGrauMes) return;
    porMes[mesIdx]++;

    const pm = efetivoPorBaseRe.get(l.re);
    if (pm) p5PorMesLaureas[mesIdx].push({ ...pm, _laureaGrau: l.grau, _laureaConcessao: l.concessao });
  });

  const ctxAno = document.getElementById('p5-chart-ano')?.getContext('2d');
  if (ctxAno) {
    if (p5ChartAno) { p5ChartAno.destroy(); p5ChartAno = null; }
    p5ChartAno = new Chart(ctxAno, {
      type: 'line',
      data: {
        labels: anos,
        datasets: [{
          data: anos.map(a => porAno[a]),
          borderColor: '#c8a84b', backgroundColor: 'rgba(200,168,75,.18)',
          borderWidth: 2, tension: .25, fill: true, pointRadius: 3, pointBackgroundColor: '#c8a84b'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: i => ` ${i.raw} láurea${i.raw !== 1 ? 's' : ''}` } } },
        scales: {
          x: { grid: GR, ticks: { color: '#ffffff', font: { size: 18 } } },
          y: { grid: GR, beginAtZero: true, ticks: { color: '#ffffff', font: { size: 18 }, precision: 0 } }
        }
      }
    });
  }

  const maxMes = Math.max(...porMes);
  const ctxMes = document.getElementById('p5-chart-mes')?.getContext('2d');
  if (ctxMes) {
    if (p5ChartMes) { p5ChartMes.destroy(); p5ChartMes = null; }
    p5ChartMes = new Chart(ctxMes, {
      type: 'bar',
      data: {
        labels: P5_MESES.map(m => m.slice(0, 3)),
        datasets: [{
          data: porMes,
          backgroundColor: porMes.map(v => (v === maxMes && maxMes > 0 ? '#c8a84b' : '#5a9de0') + 'cc'),
          borderColor: porMes.map(v => (v === maxMes && maxMes > 0 ? '#c8a84b' : '#5a9de0')),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        onClick: (evt, els) => { if (els.length && porMes[els[0].index] > 0) p5MesModalOpen(els[0].index); },
        onHover: (evt, els) => { evt.native.target.style.cursor = (els.length && porMes[els[0].index] > 0) ? 'pointer' : 'default'; },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: i => ` ${P5_MESES[i.dataIndex]}: ${i.raw} láurea${i.raw !== 1 ? 's' : ''}${porMes[i.dataIndex] === maxMes && maxMes > 0 ? ' — maior concentração' : ''}`,
              // Detalhamento por grau só faz sentido com "Todos" selecionado —
              // com um grau específico filtrado, a barra já É aquele grau, então
              // listar os outros de novo (que nem entram na contagem) confundia.
              afterLabel: i => {
                const linhas = [];
                if (!p5FiltroGrauMes) {
                  const bd = porMesPorGrau[i.dataIndex] || {};
                  linhas.push(...['1', '2', '3', '4', '5', 'sem']
                    .filter(g => bd[g])
                    .map(g => ` ${g === 'sem' ? 'Sem grau identificado' : P5_GRAU_LBL[g]}: ${bd[g]}`));
                }
                if (porMes[i.dataIndex] > 0) linhas.push(' ▸ Clique pra ver os PMs');
                return linhas;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#ffffff', font: { size: 18 } } },
          y: { grid: GR, beginAtZero: true, ticks: { color: '#ffffff', font: { size: 18 }, precision: 0 } }
        }
      }
    });
  }
}

// ── Modal de PMs laureados num mês específico (clique numa barra do gráfico
// "Láureas por Mês") — reaproveita p1CardGrid, igual à Lista Nominal.
function p5MesModalOpen(mesIdx) {
  const lista = p5PorMesLaureas[mesIdx] || [];
  if (!lista.length) return;

  const tituloEl = document.getElementById('p5-mes-mo-title');
  if (tituloEl) tituloEl.textContent = `Láureas em ${P5_MESES[mesIdx]}`;
  const subEl = document.getElementById('p5-mes-mo-sub');
  if (subEl) {
    const parteAno = p5FiltroAnoMes || 'Total Histórico';
    const parteGrau = p5FiltroGrauMes ? ` · ${P5_GRAU_LBL[p5FiltroGrauMes]}` : '';
    subEl.textContent = `${parteAno}${parteGrau} · ${lista.length} PM${lista.length !== 1 ? 's' : ''}`;
  }

  const fmtData = s => { const [y, m, d] = String(s || '').split('-'); return (y && m && d) ? `${d}/${m}/${y}` : (y && m) ? `${m}/${y}` : '—'; };
  const info = r => {
    const cor = r._laureaGrau ? P5_GRAU_COR[r._laureaGrau] : P5_SEM_COR;
    const lbl = r._laureaGrau ? P5_GRAU_LBL[r._laureaGrau] : 'Sem grau';
    return `<div style="font-size:12px;font-family:'DM Mono',monospace;margin-top:2px;color:${cor}">${lbl} · ${fmtData(r._laureaConcessao)}</div>`;
  };

  const bodyEl = document.getElementById('p5-mes-mo-body');
  if (bodyEl) bodyEl.innerHTML = typeof p1CardGrid === 'function' ? p1CardGrid(lista, info) : '';

  document.getElementById('p5-mes-mo')?.classList.add('on');
  document.body.style.overflow = 'hidden';
}

function p5MesModalClose() {
  document.getElementById('p5-mes-mo')?.classList.remove('on');
  document.body.style.overflow = '';
}

function p5MesModalClickOut(e) {
  if (e.target === document.getElementById('p5-mes-mo')) p5MesModalClose();
}

// ── Busca por Nome/RE (mesmo padrão da busca do P1 — ver p1SearchInput em
// p1.js) — pesquisa sempre no efetivo completo (ignora o filtro de CIA em
// tela) e abre direto o prontuário do PM selecionado.
let p5SearchIdx = -1;

function p5SearchInput(val) {
  const drop = document.getElementById('p5-search-drop');
  if (!drop) return;
  const q = (val || '').trim().toLowerCase();
  p5SearchIdx = -1;
  if (!q) { drop.style.display = 'none'; return; }

  const isRe = /^\d+$/.test(q);
  const matches = p5EfetivoFull.filter(r =>
    (isRe
      ? (r.re || '').toLowerCase().startsWith(q)
      : (r.nome || '').toLowerCase().includes(q) || (r.nome_guerra || '').toLowerCase().includes(q))
  ).slice(0, 30);

  if (!matches.length) { drop.style.display = 'none'; return; }

  const norm = s => (s || '').replace(/</g, '&lt;');
  const hi = s => {
    const idx = s.toLowerCase().indexOf(q);
    if (idx < 0) return norm(s);
    return norm(s.slice(0, idx)) + `<span style="color:var(--gold);font-weight:700">${norm(s.slice(idx, idx + q.length))}</span>` + norm(s.slice(idx + q.length));
  };

  drop.innerHTML = matches.map((r, i) => {
    const nomePrinc = r.nome_guerra || r.nome || '—';
    const grauCor = r.grau ? P5_GRAU_COR[r.grau] : P5_SEM_COR;
    const grauTxt = r.grau ? P5_GRAU_LBL[r.grau] : 'Sem Láurea';
    return `<div data-re="${escHtml(r.re)}" data-i="${i}"
      onmousedown="p5SearchSelect('${(r.re || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')"
      onmouseover="p5SearchHover(${i})"
      style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);transition:background .1s"
      id="p5-sdrop-${i}">
      <div data-foto-re="${escHtml(r.re)}" data-nome="${escHtml(nomePrinc)}" data-posto="${escHtml(r.posto || '')}" data-size="32" style="flex-shrink:0">${p1Fotos[r.re] ? `<img src="${p1Fotos[r.re]}" style="width:32px;height:${p1AvatarH(32)}px;border-radius:7px;object-fit:cover;border:1.5px solid rgba(255,255,255,.18)">` : p1AvatarSVG(nomePrinc, r.posto)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:19px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${hi(nomePrinc)}</div>
        <div style="font-size:19px;color:var(--tx3)">${hi(r.nome || '')} · ${escHtml(r.posto || '—')} · ${escHtml(p5CiaOf(r.opm))}</div>
      </div>
      <div style="font-size:19px;font-family:'DM Mono',monospace;padding:3px 9px;border-radius:10px;background:${grauCor}22;color:${grauCor};white-space:nowrap">${grauTxt}</div>
    </div>`;
  }).join('');

  drop.style.display = 'block';
  if (typeof p1LoadFotosVisiveis === 'function') p1LoadFotosVisiveis();
}

function p5SearchHover(i) {
  p5SearchIdx = i;
  document.querySelectorAll('#p5-search-drop > div').forEach((el, j) => {
    el.style.background = j === i ? 'rgba(255,255,255,.06)' : '';
  });
}

function p5SearchKey(e) {
  const drop = document.getElementById('p5-search-drop');
  if (!drop || drop.style.display === 'none') {
    if (e.key === 'Enter') {
      const val = document.getElementById('p5-search')?.value.trim();
      if (val) p5SearchInput(val);
    }
    return;
  }
  const items = drop.querySelectorAll('div[data-re]');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    p5SearchHover(Math.min(p5SearchIdx + 1, items.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    p5SearchHover(Math.max(p5SearchIdx - 1, 0));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const sel = drop.querySelector(`[data-i="${p5SearchIdx}"]`) || items[0];
    if (sel) p5SearchSelect(sel.dataset.re);
  } else if (e.key === 'Escape') {
    p5SearchHide();
  }
}

function p5SearchSelect(re) {
  p5SearchHide();
  const inp = document.getElementById('p5-search');
  const pm = p5EfetivoFull.find(r => r.re === re);
  if (inp && pm) inp.value = pm.nome_guerra || pm.nome || re;
  openProntuario(re);
}

function p5SearchHide() {
  const drop = document.getElementById('p5-search-drop');
  if (drop) drop.style.display = 'none';
}

function p5RenderGrid() {
  const gridEl = document.getElementById('p5-grid');
  if (!gridEl) return;
  if (!p5FiltroGrau) {
    gridEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--tx3);font-size:15px;font-family:'DM Mono',monospace;letter-spacing:1px">▸ Clique numa barra do gráfico ou num grau acima pra ver a lista</div>`;
    return;
  }
  const lista = p5FiltroGrau === 'sem'
    ? p5Efetivo.filter(p => !p.grau)
    : p5Efetivo.filter(p => String(p.grau) === p5FiltroGrau);
  gridEl.innerHTML = typeof p1CardGrid === 'function'
    ? p1CardGrid(lista, null, r => `openProntuario('${String(r.re).replace(/'/g, "\\'")}')`)
    : '';
}
