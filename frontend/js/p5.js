// ═══════════════════════════════════════════════════════════════
// P5 · COMUNICAÇÃO SOCIAL — Láureas do Efetivo
// Único conteúdo da seção por enquanto. Mostra, pra cada PM do efetivo, o
// grau mais alto de láurea que ele já alcançou (ou nenhum) — gráfico de
// barras + lista nominal filtrável por grau, reaproveitando p1CardGrid
// (mesmo componente usado nos KPIs de PM do P1) pra abrir o prontuário.
// ═══════════════════════════════════════════════════════════════

let p5Efetivo = [];
let p5FiltroGrau = null;
let p5Chart = null;

// Mesmas cores reais de material usadas no badge de grau do prontuário
// (ver GRAU_COR em p1.js) — repetidas aqui porque p5.js pode ser a única
// tela carregada nessa navegação (não dá pra depender de p1.js já ter
// rodado sua definição local).
const P5_GRAU_COR = { '1':'#f2e6c9','2':'#d4af37','3':'#d0d4dc','4':'#a8b4c0','5':'#b87333' };
const P5_GRAU_LBL = { '1':'1º Grau','2':'2º Grau','3':'3º Grau','4':'4º Grau','5':'5º Grau' };
const P5_SEM_COR = '#607090';

async function loadP5Section() {
  const kpisEl = document.getElementById('p5-kpis');
  if (kpisEl) kpisEl.innerHTML = `<div style="color:var(--tx3);font-size:19px;grid-column:1/-1">Carregando...</div>`;
  try {
    const data = await authFetch(`${API}/laureas/resumo`).then(r => r.json());
    p5Efetivo = Array.isArray(data) ? data : [];
  } catch {
    p5Efetivo = [];
  }
  p5Render();
}

function p5Render() {
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
