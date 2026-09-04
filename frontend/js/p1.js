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
let p1Fotos      = {};   // RE → foto_base64 | null
let p1ByUnit     = {};   // OPM → PM[] (populado em renderP1)
let p1AfastHoje  = {};   // RE → afastamentos ativos hoje (populado em renderP1)
let p1Vagas      = [];   // efetivo fixado por OPM
let p1Quadro     = [];   // quadro fixado do efetivo (por posto)
let p1Cursos     = [];   // prod_cursos (internos+externos+manuais) — pra filtro no KPI Total Efetivo
let p1FiltroOpm  = '';   // filtro ativo por OPM
let prontoCurrentRe  = '';   // RE do prontuário aberto
let prontoExtratoFull = [];  // afastamentos do PM aberto, sem filtro (base p/ os selects)
let prontoCursosFull  = [];  // cursos (internos+externos) do PM aberto, sem filtro (base p/ o select de origem)
let prontoLaureasFull = [];  // láureas (prod_laureas) do PM aberto
let p1ClosingPronto  = false;// flag: acabou de fechar prontuário — evita fechar painel CIA
let p1UnitClickOut   = null; // handler de click fora do detalhe de unidade
let p1KpiClickOut    = null; // handler de click fora do detalhe de KPI

// Retorna true se o usuário deve ver apenas dados quantitativos (sem nomes individuais).
// admin, ti e p1 sempre veem tudo; demais roles dependem de secoes_acesso.p1:
//   'nominal' ou 'editor' → vê nomes | 'viewer' ou ausente → só números
const p1SomenteQuantitativo = () => {
  const u = JSON.parse(localStorage.getItem('auth_user') || '{}');
  if (['admin','ti','p1'].includes(u.role || '')) return false;
  return !['nominal','editor'].includes((u.secoes_acesso || {}).p1 || '');
};

// Estado dos filtros de CIA/Cidade/Graduação de cada detalhe de KPI do P1 —
// todos usam o mesmo padrão de 3 seletores integrados (p1FiltroCMP). Gênero
// (Total Efetivo) e Situação (IAS) são filtros à parte, específicos daquela tela.
let _p1TotalDetCia = -1, _p1TotalDetMun = null, _p1TotalDetPosto = null, _p1TotalDetGen = null;
function p1TotalSetCia(val)   { _p1TotalDetCia = (val === '' || val == null) ? -1 : parseInt(val, 10); p1ShowKpiDetail('total'); }
function p1TotalSetMun(val)   { _p1TotalDetMun = val || null; p1ShowKpiDetail('total'); }
function p1TotalSetPosto(val) { _p1TotalDetPosto = val || null; p1ShowKpiDetail('total'); }
function p1TotalSetGen(val)   { _p1TotalDetGen = _p1TotalDetGen === val ? null : val; p1ShowKpiDetail('total'); }

// Filtro por curso (interno/externo) no KPI Total Efetivo — independentes,
// combinados com E quando os dois estão ativos ao mesmo tempo.
let _p1TotalDetCursoInt = null, _p1TotalDetCursoExt = null;
function p1TotalSetCursoInt(val) { _p1TotalDetCursoInt = val || null; p1ShowKpiDetail('total'); }
function p1TotalSetCursoExt(val) { _p1TotalDetCursoExt = val || null; p1ShowKpiDetail('total'); }

// Busca por nome ou RE dentro do KPI Total Efetivo — texto livre (não exige
// selecionar um item exato da lista suspensa, diferente do filtro de curso).
let _p1TotalDetBusca = null;
function p1TotalSetBusca(val) { _p1TotalDetBusca = (val || '').trim() || null; p1ShowKpiDetail('total'); }

let _p1IasDetCia = -1, _p1IasDetMun = null, _p1IasDetPosto = null, _p1IasDetSit = null;
let _iasChartData = null;
function p1IasSetCia(val)   { _p1IasDetCia = (val === '' || val == null) ? -1 : parseInt(val, 10); p1ShowKpiDetail('ias'); }
function p1IasSetMun(val)   { _p1IasDetMun = val || null; p1ShowKpiDetail('ias'); }
function p1IasSetPosto(val) { _p1IasDetPosto = val || null; p1ShowKpiDetail('ias'); }
function p1IasSetSit(val)   { _p1IasDetSit = _p1IasDetSit === val ? null : val; p1ShowKpiDetail('ias'); }

let _p1AfastDetCia = -1, _p1AfastDetMun = null, _p1AfastDetPosto = null;
function p1AfastSetCia(val)   { _p1AfastDetCia = (val === '' || val == null) ? -1 : parseInt(val, 10); p1ShowKpiDetail('afastados'); }
function p1AfastSetMun(val)   { _p1AfastDetMun = val || null; p1ShowKpiDetail('afastados'); }
function p1AfastSetPosto(val) { _p1AfastDetPosto = val || null; p1ShowKpiDetail('afastados'); }

let _p1EapDetCia = -1, _p1EapDetMun = null, _p1EapDetPosto = null;
function p1EapSetCia(val)   { _p1EapDetCia = (val === '' || val == null) ? -1 : parseInt(val, 10); p1ShowKpiDetail('eap'); }
function p1EapSetMun(val)   { _p1EapDetMun = val || null; p1ShowKpiDetail('eap'); }
function p1EapSetPosto(val) { _p1EapDetPosto = val || null; p1ShowKpiDetail('eap'); }

let _p1FeriasDetCia = -1, _p1FeriasDetMun = null, _p1FeriasDetPosto = null;
function p1FeriasSetCia(val)   { _p1FeriasDetCia = (val === '' || val == null) ? -1 : parseInt(val, 10); p1ShowKpiDetail('ferias'); }
function p1FeriasSetMun(val)   { _p1FeriasDetMun = val || null; p1ShowKpiDetail('ferias'); }
function p1FeriasSetPosto(val) { _p1FeriasDetPosto = val || null; p1ShowKpiDetail('ferias'); }

// Estado do filtro do bloco "Em Afastamento" na home do P1
let _p1HomeAfastCia = -1, _p1HomeAfastMun = null, _p1HomeAfastPosto = null;
function p1HomeAfastSetCia(val)   { _p1HomeAfastCia = (val === '' || val == null) ? -1 : parseInt(val, 10); renderP1(); }
function p1HomeAfastSetMun(val)   { _p1HomeAfastMun = val || null; renderP1(); }
function p1HomeAfastSetPosto(val) { _p1HomeAfastPosto = val || null; renderP1(); }

function hasUisRestr(re) {
  return typeof uisNormRE === 'function' && !!_uisRestMap?.[uisNormRE(re)]?.length;
}

// ── Estrutura orgânica do 40º BPM/I ─────────────────────────────────────────
// Cada unidade "Sede" ganhou um padrão âncora (ex: '^1 cia$') pro caso de
// registro cujo OPM vem só como o rótulo genérico da CIA ("1ª CIA", sem
// sede/cidade) — achado real na UIS: restrição com opm="1ª CIA" aparecia na
// lista geral mas sumia da aba "1ª CIA" porque nenhuma chave existente
// (todas mais específicas, tipo "1 cia - sede"/"votorantim") batia num OPM
// tão curto. FT/EM já tinham esse padrão (`^ft$`/`^em$`), só faltava nas CIAs.
const CIA_STRUCT = [
  {
    label: 'EM', sede: 'Votorantim', color: '#9b6de0',
    units: [
      { label: 'Estado Maior', keys: ['em -', 'estado maior', '^em$'] },
    ]
  },
  {
    label: '1ª CIA', sede: 'Votorantim', color: CIA_COR['1'],
    units: [
      { label: 'Sede · Votorantim', keys: ['1 cia - sede', 'votorantim', '^1 cia$'] },
      { label: '1º GP · Alumínio',  keys: ['alumin'] },
    ]
  },
  {
    label: '2ª CIA', sede: 'Ibiúna', color: CIA_COR['2'],
    units: [
      { label: 'Sede · Ibiúna',        keys: ['2 cia - sede', 'ibiun', '^2 cia$'] },
      { label: '1º Pel · Piedade',     keys: ['piedade'] },
      { label: '1º GP · Tapiraí',      keys: ['tapira'] },
    ]
  },
  {
    label: '3ª CIA', sede: 'Salto de Pirapora', color: CIA_COR['3'],
    units: [
      { label: 'Sede · Salto de Pirapora',    keys: ['3 cia - sede', 'salto de pirapora', 'salto pirapora', '^3 cia$'] },
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

// Ordena por antiguidade: Coronel primeiro, Soldado por último. Ordem mais
// específica primeiro (1º Ten antes de Ten genérico, etc.) — quem não bater
// em nada vai pro fim da lista em vez de quebrar a ordenação.
// Postos reais no banco usam PONTO, não "º" (ex: "1. SGT PM", "2. SGT PM"),
// e "º/°/ª" já são removidos antes de testar — por isso os padrões abaixo
// aceitam "." ou espaço entre o número e a graduação ([.\s]*), não só
// espaço. Sem isso, "1. SGT" e "2. SGT" caíam ambos no grupo genérico
// "sgt" (nenhum padrão numerado batia), perdendo a distinção de
// antiguidade entre eles e ordenando só por RE dentro do grupo confundido.
// Coronel também precisa excluir "ten cel" (Tenente-Coronel abreviado
// contém a palavra "cel"), senão TC é classificado como Coronel pleno.
const P1_POSTO_ORDEM = [
  /(?<!ten\s)\bcel\b|(?<!tenente[\s-]?)\bcoronel\b/,
  /\bten\s*cel\b|\btc\b|tenente.?coronel/,
  /\bmaj\b|major/,
  /\bcap\b|capit[aã]o/,
  /\b1[.\s]*ten\b|primeiro.?tenente/,
  /\b2[.\s]*ten\b|segundo.?tenente/,
  /\bten\b|tenente/,
  /\basp\b|aspirante/,
  /\bsub\s*ten\b|\bst\b|subtenente/,
  /\b1[.\s]*sgt\b|primeiro.?sargento/,
  /\b2[.\s]*sgt\b|segundo.?sargento/,
  /\b3[.\s]*sgt\b|terceiro.?sargento/,
  /\bsgt\b|sargento/,
  /\bcb\b|cabo/,
  /\bsd\b|soldado/,
];
function p1PostoRank(posto) {
  const p = (posto || '').toLowerCase().replace(/[º°ª]/g, '');
  const idx = P1_POSTO_ORDEM.findIndex(re => re.test(p));
  return idx === -1 ? 999 : idx;
}

// Extrai só a parte numérica do RE (ignora o dígito verificador) pra comparar.
function p1ReNum(re) {
  return parseInt(String(re || '').match(/\d+/)?.[0] || '0', 10);
}

function p1OrdenarPorAntiguidade(pms) {
  return pms.slice().sort((a, b) => {
    const ra = p1PostoRank(a.posto), rb = p1PostoRank(b.posto);
    if (ra !== rb) return ra - rb;
    return p1ReNum(a.re) - p1ReNum(b.re);
  });
}

// Normaliza a descrição livre de afastamento (vinda do CSV ou do WSSCPM,
// que traz muitas variações de texto) num grupo fixo, usado tanto no
// resumo compacto do KPI quanto no detalhe expandido.
const P1_TIPO_COLOR = { Férias:'#5a9de0', Dispensa:'#26a69a', Agregação:'#8e6dc9', LP:'#9b59b6', LSV:'#e67e22', Conval:'#e74c3c',
  Núpcias:'#f1c40f', Luto:'#95a5a6', Maternidade:'#e91e63', Paternidade:'#2196f3', LTS:'#e05555', Outros:'#607090' };
function p1CatTipo(t) {
  const tl = (t || '').toLowerCase();
  if (/f[eé]rias/.test(tl)) return 'Férias';
  if (/dispensa/.test(tl)) return 'Dispensa';
  if (/agrega[cç][aã]o/.test(tl)) return 'Agregação';
  if (/\blp\b|licen[cç]a.pr[eê]mio|premio/.test(tl)) return 'LP';
  if (/\blsv\b|sem.vencimento/.test(tl)) return 'LSV';
  if (/conval/.test(tl)) return 'Conval';
  if (/n[uú]pcia/.test(tl)) return 'Núpcias';
  if (/luto/.test(tl)) return 'Luto';
  if (/maternidade/.test(tl)) return 'Maternidade';
  if (/paternidade/.test(tl)) return 'Paternidade';
  if (/\blts\b|licen[cç]a.trat|tratamento.sa/.test(tl)) return 'LTS';
  return 'Outros';
}

// Texto pra exibir no lugar do tipo de afastamento — encurta "Licença
// para Tratamento de Saúde" (nome bem longo que vem assim do WSSCPM) para "LTS".
function p1TipoLabel(tipo) {
  return p1CatTipo(tipo) === 'LTS' ? 'LTS' : (tipo || '—');
}

// Linhas de afastamentos_pm sincronizadas do WSSCPM que na verdade são
// restrição (ex: Agregação/"Apto com Restrição"), não ausência de verdade —
// ficam no assentamento pra histórico, mas não contam como "afastado" em
// nenhum KPI/lista de afastamento ativo. Quem controla isso é o KPI de
// Restrições (efetivo_pm.possui_restricao, alimentado só pelo SGP).
const p1EhRestricao = a => !!a.restricao;

// Linhas de afastamentos_pm cujo tipo é "Supervisão Nível I/II/III - CAPS/NAPS"
// (acompanhamento psicossocial, não afastamento de verdade) — não contam em
// nenhum KPI/lista de afastamento ativo, e nem aparecem no extrato de
// afastamentos do prontuário (diferente de restrição, que fica no histórico).
// Viram o KPI próprio "CAPS/NAPS" na UIS (uis.js).
const p1EhSupervisao = a => /supervis[aã]o|caps\s*\/\s*naps/i.test(a.tipo_afastamento || '');

// Pra escala de rua (KPIs de disponibilidade por CIA/OPM), só a restrição de
// código "PO" (Policiamento — BG PM 166/2006) de fato tira o PM da rua; quem
// tem restrição de outro tipo (ex: EF, OU, SP) continua podendo trabalhar
// normalmente no policiamento, então não deve contar como "RESTR" nesses
// cards — pedido explícito do usuário (2026-08-14), já que são os cards que
// os comandantes usam pra saber com quantos PM podem contar na rua.
const p1RestrRua = r => {
  if (!(r.possui_restricao || '').toLowerCase().startsWith('s')) return false;
  return (r.tipos_restricao || '').split(/[,;]/).map(c => c.trim().toUpperCase()).includes('PO');
};

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
    const [r1, r2, r3, r4, r5] = await Promise.all([
      authFetch(`${API}/efetivo`),
      authFetch(`${API}/afastamentos`),
      authFetch(`${API}/p1/vagas`),
      authFetch(`${API}/p1/quadro`),
      authFetch(`${API}/prod/cursos`)
    ]);
    p1Data   = await r1.json();
    p1Afasts = await r2.json();
    const vagasRaw = await r3.json();
    p1Vagas  = Array.isArray(vagasRaw) ? vagasRaw : [];
    const quadroRaw = await r4.json();
    p1Quadro = Array.isArray(quadroRaw) ? quadroRaw : [];
    const cursosRaw = await r5.json().catch(() => []);
    p1Cursos = Array.isArray(cursosRaw) ? cursosRaw : [];
    // Carrega UIS e IAS antes de renderizar para que os badges apareçam na primeira passagem.
    await Promise.all([
      loadUisRestricoes().catch(() => {}),
      loadIasMapa().catch(() => {}),
    ]);
    if (renderingP1) renderP1();
    renderHome();
    p1SetupFotoObserver();
    p1LoadFotosVisiveis();
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

  // Esconde busca nominal para comandantes
  const _searchWrap = document.getElementById('p1-search')?.parentElement;
  if (_searchWrap) _searchWrap.style.display = p1SomenteQuantitativo() ? 'none' : '';

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
    // Termino nulo (ex: LSV em aberto, sem data de fim ainda) conta como
    // ainda em curso — não pode exigir a.termino truthy, senão essas
    // pessoas somem da lista de "afastado hoje" mesmo estando afastadas.
    if (!p1EhRestricao(a) && !p1EhSupervisao(a) && a.inicio && a.inicio <= hoje && (!a.termino || a.termino >= hoje)) {
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
  const afastsF      = (p1FiltroOpm ? p1Afasts.filter(a => reSetF.has(a.re)) : p1Afasts).filter(a => !p1EhSupervisao(a));
  const ferEmGozo    = afastsF.filter(a => isFer(a.tipo_afastamento) && a.inicio <= hoje && (!a.termino || a.termino >= hoje));
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
    !p1EhRestricao(a) && !p1EhSupervisao(a) && a.inicio <= hoje && a.termino >= hoje && a.termino <= em7s
  );

  const CATS = { cbsd: 'Cb / Sd', sgt: 'Sargentos', sub: 'Subtenentes', of: 'Oficiais' };
  const CATS_COLOR = { cbsd: '#4bc87a', sgt: '#e05555', sub: '#5a9de0', of: '#c8a84b' };
  const count = (arr, cat) => arr.filter(r => p1Cat(r.posto) === cat).length;
  const total = dataF.length;

  // ── KPI cards (clicáveis)
  // auto-fit (não auto-fill) — com menos KPIs (removemos 3 em 2026-08), os
  // cards restantes esticam pra preencher a linha em vez de deixar espaço
  // vazio à direita.
  kpisEl.style.gridTemplateColumns = 'repeat(auto-fit,minmax(210px,1fr))';
  const kpiCard = (label, val, sub, color, key) => {
    return `<div onclick="p1ShowKpiDetail('${key}')" class="kpi">
      <div class="kpi-top"></div>
      <div class="kpi-lbl">${label}</div>
      <div class="kpi-val">${val}</div>
      ${sub ? `<div class="kpi-sub" style="line-height:1.7;width:100%">${sub}</div>` : ''}
      <div class="kpi-hint">▸ clique p/ detalhes</div>
    </div>`;
  };

  // Tipos de afastamento agrupados — na frente do card só Férias/LP/LTS
  // aparecem por nome, o resto entra em "Outros" (detalhe expandido mostra
  // a quebra completa por tipo).
  const tiposCount = {};
  const TIPOS_FRENTE_KPI = ['Férias', 'LP', 'LTS'];
  pmAfastados.forEach(r => { (afastHoje[r.re] || []).forEach(a => {
    const c = p1CatTipo(a.tipo_afastamento);
    const label = TIPOS_FRENTE_KPI.includes(c) ? c : 'Outros';
    tiposCount[label] = (tiposCount[label] || 0) + 1;
  }); });
  const _kpiRow = (label, val, color) => `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:#ffffff;font-size:17px">${escHtml(label)}</span><span style="color:${color};font-weight:700;font-size:20px">${val}</span></div>`;
  const tiposEntries = Object.entries(tiposCount).sort(([,a],[,b]) => b - a);
  const tiposSub = tiposEntries.map(([t,n]) => _kpiRow(t, n, P1_TIPO_COLOR[t] || '#607090')).join('') || '—';

  kpisEl.innerHTML =
    kpiCard('Total Efetivo', total,
      Object.keys(CATS).filter(k=>count(dataF,k)>0).map(k => _kpiRow(CATS[k], count(dataF,k), CATS_COLOR[k])).join(''),
      'var(--tx)', 'total') +
    kpiCard('Afastamentos', pmAfastados.length, tiposSub, pmAfastados.length > 0 ? '#e05555' : 'var(--tx3)', 'afastados') +
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
      // 2026-09-04: CFP e UIS Méd/Odonto voltaram a contar (decisão do
      // usuário) — entram dentro do grupo "EM" junto com a Sede EM (as 4
      // linhas têm opm="EM", só o `municipio` distingue). Antes ficavam de
      // fora e isso fazia o card mostrar bem menos gente que o Total
      // Efetivo (332 vs 353), sem essa ser a intenção — as duas telas
      // deviam bater no total de efetivo.
      const qRows = p1Quadro;
      const gtFx = qRows.reduce((a,q) => a + (Number(q.fx_total)||0), 0);
      const gtEx = qRows.reduce((a,q) => a + (Number(q.ex_total)||0), 0);
      // Agrupa por CIA — a coluna q.cia raramente vem preenchida na
      // planilha (a maioria cai num "—" só, duplicando o total geral em
      // vez de mostrar o detalhe por CIA); mesma inferência via OPM/
      // município já usada no detalhe "Quadro Fixado" (tipo==='quadro').
      const normStrKpi = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[ªº°]/g,'').replace(/\s+/g,' ').trim();
      const opmCiaMapKpi = {};
      p1Data.forEach(pm => {
        const cia = (pm.cia||'').trim();
        if (!cia) return;
        const key = normStrKpi(pm.opm||'');
        if (key && !opmCiaMapKpi[key]) opmCiaMapKpi[key] = typeof normCiaDisp === 'function' ? normCiaDisp(cia) : cia;
      });
      const getCiaKpi = q => {
        if ((q.cia||'').trim()) return typeof normCiaDisp === 'function' ? normCiaDisp(q.cia) : q.cia.trim();
        const nOpm = normStrKpi(q.opm||''), nMun = normStrKpi(q.municipio||'');
        const found = Object.entries(opmCiaMapKpi).find(([k]) =>
          k === nOpm || k === nMun || k.includes(nMun) || nMun.includes(k) || k.includes(nOpm) || nOpm.includes(k)
        );
        return found?.[1] || (q.opm||'').trim() || '—';
      };
      const byCiaKpi = {};
      qRows.forEach(q => {
        const c = getCiaKpi(q);
        if (!byCiaKpi[c]) byCiaKpi[c] = { fx: 0, ex: 0 };
        byCiaKpi[c].fx += Number(q.fx_total)||0;
        byCiaKpi[c].ex += Number(q.ex_total)||0;
      });
      // Ordem fixa (EM primeiro, depois CIAs, esquerda p/ direita — mesma
      // ordem de CIA_STRUCT), em vez de alfabética; o que não bate com
      // nenhum label de CIA_STRUCT (OPM não mapeada) vai pro final.
      const ciaOrderIdx = cia => { const i = CIA_STRUCT.findIndex(c => c.label === cia); return i < 0 ? CIA_STRUCT.length : i; };
      // Por CIA: efetivo existente + a % de vagas em aberto (−, verde) ou
      // de efetivo acima do fixado (+, vermelho), sobre o fixado da CIA.
      const ciaExRows = Object.entries(byCiaKpi).sort(([a],[b]) => ciaOrderIdx(a) - ciaOrderIdx(b) || a.localeCompare(b)).map(([cia, d]) => {
        const ciaCor = /^em$/i.test(cia.trim()) ? '#9b6de0' : ciaCorByName(cia); // EM não tem dígito p/ ciaCorByName achar
        const saldo  = d.fx - d.ex; // >0 = vagas sobrando · <0 = estourado
        const pct    = d.fx > 0 ? Math.round(Math.abs(saldo) / d.fx * 100) : 0;
        const pctStr = saldo === 0 ? '0%' : `${saldo > 0 ? '−' : '+'}${pct}%`;
        const pctCor = saldo > 0 ? '#4bc87a' : saldo < 0 ? '#e05555' : 'var(--tx3)'; // verde = vaga sobrando · vermelho = efetivo a mais
        return `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:${ciaCor};font-size:17px;font-weight:700">${cia}</span><span style="font-weight:700;font-size:18px"><span style="color:#ffffff">${d.ex}</span> <span style="color:${pctCor};font-family:'DM Mono',monospace;font-size:15px;font-weight:600">${pctStr}</span></span></div>`;
      }).join('');
      const sub = ciaExRows + `<div style="margin-top:6px">${_kpiRow('FX Total', gtFx, '#ffffff')}${_kpiRow('EX Total', gtEx, '#ffffff')}</div>`;
      return kpiCard('Quadro Fixado', gtEx, sub, 'var(--tx)', 'quadro');
    })();

  const thS = 'padding:8px 12px;border-bottom:1px solid var(--bd2);font-family:"DM Mono",monospace;font-size:19px;color:#ffffff;letter-spacing:1px;text-transform:uppercase;text-align:right';
  const thL = thS.replace('text-align:right','text-align:left');
  const tdS = 'padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-family:"DM Mono",monospace;font-size:19px;color:var(--tx3);text-align:right';
  const tdL = 'padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-size:19px;font-weight:600;color:var(--tx)';
  const badge = (txt, color) => `<span style="padding:3px 9px;border-radius:20px;font-size:19px;font-family:'DM Mono',monospace;background:${color}22;color:${color}">${escHtml(txt)}</span>`;

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
      const _av = `<div data-foto-re="${escHtml(r.re)}" data-nome="${escHtml(r.nome_guerra||r.nome)}" data-posto="${escHtml(r.posto||'')}" data-size="40" onclick="openProntuario('${_fotoRe}')" style="cursor:pointer;display:inline-block">${p1AvatarSVG(r.nome_guerra||r.nome, r.posto, 40)}</div>`;
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.03);width:52px;vertical-align:middle">${_av}</td>
        <td style="${tdS.replace('text-align:right','text-align:left')};color:var(--tx2)">${escHtml(r.posto || '—')}</td>
        <td style="${tdS.replace('text-align:right','text-align:left')};color:var(--tx3)">${escHtml(r.re || '—')}</td>
        <td style="${tdL};cursor:pointer" onclick="openProntuario('${_fotoRe}')">${escHtml(r.nome_guerra || r.nome)}${uisBadge(r.re)}${iasBadge(r.re)}</td>
        <td style="${tdS.replace('text-align:right','text-align:left')};color:var(--tx3)">${escHtml(r.opm || '—')}</td>
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
        <span style="font-size:19px;color:var(--tx)">${escHtml(r.nome_guerra || r.nome)}</span>
        <span style="font-size:19px;color:#ffffff">${escHtml(r.opm || '')}</span>
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
        <span style="font-size:19px;color:var(--tx)">${escHtml(pm?.nome_guerra || a.nome || a.re)}</span>
        <span style="font-size:19px;color:#ffffff">${escHtml(a.tipo_afastamento)}</span>
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
        <span style="font-size:19px;color:var(--tx2)">${escHtml(pm?.posto||'')}</span>
        <span style="font-size:19px;color:var(--tx)">${escHtml(pm?.nome_guerra || pm?.nome || a.re)}</span>
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
    const restr_ = pms.filter(p1RestrRua).length;
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

    const unitBtns = p1SomenteQuantitativo() ? '' : cia.units.map((u, ui) => {
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
    return `<div class="p1-uc" data-unit="${escHtml(unit)}" onclick="p1ShowUnit('${_esc}')"
      style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid ${s.color};border-radius:10px;padding:20px;cursor:pointer;transition:all .2s"
      onmouseover="if(!this.classList.contains('sel')){this.style.boxShadow='0 4px 16px rgba(0,0,0,.3)';this.style.transform='translateY(-2px)'}"
      onmouseout="if(!this.classList.contains('sel')){this.style.boxShadow='';this.style.transform=''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <div>
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px">40º BPM/I</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:800;color:${s.color};letter-spacing:.5px;line-height:1">${escHtml(unit)}</div>
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
          <div style="width:180px;font-size:19px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r.unit)}</div>
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

  // Quem ESTÁ afastado agora — grade de fotos com filtro de posto/cidade.
  // Restrição (Agregação) não entra aqui — isso é status de "trabalhando com
  // limitação", não ausência; fica só no perfil do PM e no KPI de Restrições.
  const getMunHome = opm => { const p = (opm||'').split(' - '); return p.length > 1 ? p[p.length-1].trim() : null; };
  const getCiaHome = opm => (typeof CIA_STRUCT === 'undefined' || !opm) ? -1 : CIA_STRUCT.findIndex(c => typeof _opmMatch === 'function' && _opmMatch(opm, c.units.flatMap(u => u.keys)));
  const baseHome = pmAfastados.map(r => ({ r, ciaIdx: getCiaHome(r.opm), mun: getMunHome(r.opm), posto: r.posto }));

  const filtroHome = p1FiltroCMP(baseHome, _p1HomeAfastCia, _p1HomeAfastMun, _p1HomeAfastPosto, 'p1HomeAfastSetCia', 'p1HomeAfastSetMun', 'p1HomeAfastSetPosto');
  _p1HomeAfastCia = filtroHome.cia; _p1HomeAfastMun = filtroHome.mun; _p1HomeAfastPosto = filtroHome.posto;

  let pmAfastadosFiltrados = pmAfastados;
  if (_p1HomeAfastCia >= 0) pmAfastadosFiltrados = pmAfastadosFiltrados.filter(r => getCiaHome(r.opm) === _p1HomeAfastCia);
  if (_p1HomeAfastMun)      pmAfastadosFiltrados = pmAfastadosFiltrados.filter(r => getMunHome(r.opm) === _p1HomeAfastMun);
  if (_p1HomeAfastPosto)    pmAfastadosFiltrados = pmAfastadosFiltrados.filter(r => r.posto === _p1HomeAfastPosto);

  const homeAfastInfo = r => {
    const ats = afastHoje[r.re] || [];
    const tipo = (ats.map(a => a.tipo_afastamento).join(', ') || 'Afastado').split(',')[0].trim();
    const termino = ats[0]?.termino || '';
    const diasRest = termino ? Math.ceil((new Date(termino) - new Date(hoje)) / 86400000) : null;
    return `<div style="font-size:10px;font-family:'DM Mono',monospace;padding:1px 6px;border-radius:6px;background:#e0555522;color:#e05555;display:inline-block">${escHtml(tipo.toUpperCase())}</div>
      <div style="font-size:10px;font-family:'DM Mono',monospace;color:var(--tx3);margin-top:2px">${diasRest!==null ? diasRest+'d rest.' : (fmtDate(termino)||'—')}</div>`;
  };

  const emAfastamentoHtml = !pmAfastados.length ? '' : `
    <div style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;margin-top:14px;overflow:hidden">
      <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:#e05555;padding:10px 16px 8px;text-transform:uppercase;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:10px">
        <span>Em Afastamento</span>
        <span style="background:#e0555528;color:#e05555;border-radius:20px;padding:1px 10px;font-size:17px;letter-spacing:0">${pmAfastadosFiltrados.length}${pmAfastadosFiltrados.length !== pmAfastados.length ? ' de ' + pmAfastados.length : ''}</span>
      </div>
      ${filtroHome.html}
      <div style="padding:14px 16px">${p1CardGrid(pmAfastadosFiltrados, homeAfastInfo)}</div>
    </div>`;

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
          <span style="font-family:'DM Mono',monospace;font-size:18px;color:var(--tx3)">${escHtml(pm?.posto||'')}</span>
          <span style="font-size:20px;font-weight:700;color:var(--tx);margin-left:6px;cursor:pointer" onclick="openProntuario('${_esc2(a.re)}')">${escHtml(pm?.nome_guerra||pm?.nome||a.re)}</span>
          ${pm?.opm ? `<div style="font-size:17px;color:var(--tx3);margin-top:2px">${escHtml(pm.opm)}</div>` : ''}
        </div>
        <div style="font-size:19px;color:var(--tx3);text-align:right;white-space:nowrap">Inicia em <b style="color:${cor}">${diasAte}d</b> · ${fmtDate(a.inicio)} → ${fmtDate(a.termino)}</div>
      </div>` });
    });
  }

  const nextItems = bottomItems.filter(i => i.order >= 3); // próximos afastamentos

  const mkBlock = (titulo, cor, items) => !items.length ? '' : `
    <div style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;margin-top:14px;overflow:hidden">
      <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:${cor};padding:10px 16px 8px;text-transform:uppercase;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:10px">
        <span>${titulo}</span>
        <span style="background:${cor}28;color:${cor};border-radius:20px;padding:1px 10px;font-size:17px;letter-spacing:0">${items.length}</span>
      </div>
      ${items.sort((a,b)=>a.order-b.order).map(i=>i.html).join('')}
    </div>`;

  const bottomSection = p1SomenteQuantitativo() ? '' :
    emAfastamentoHtml +
    mkBlock('Próximos Afastamentos — 30 dias', '#5a9de0', nextItems);

  bodyEl.innerHTML = claroSection + `
    <div style="margin-bottom:6px">
      <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:#ffffff;text-transform:uppercase;margin-bottom:14px">Efetivo por Companhia${p1SomenteQuantitativo() ? '' : ' <span style="font-weight:400">· clique na sub-unidade para ver os PMs</span>'}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
        ${ciaCards}${unmatchedCards}
      </div>
    </div>
    <div id="p1-unit-detail"></div>
    ${bottomSection}`;

  // Mostra botão exportar quando há dados (oculto para comandantes — exportação contém dados nominais)
  const btnE = document.getElementById('btn-exportar-p1');
  if (btnE) btnE.style.display = p1SomenteQuantitativo() ? 'none' : 'inline-block';
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

// ═══════════════════════════════════════════════════════════════
// SINCRONIZAÇÃO VIA SGP (WSSCPM) — pedidos processados pelo agente
// rodando no computador do batalhão, não pelo backend.
// ═══════════════════════════════════════════════════════════════
let p1SgpPollTimer = null;

function openP1SgpModal() {
  document.getElementById('p1-sgp-mo').style.display = 'flex';
  document.getElementById('p1-sgp-re').value = '';
  document.getElementById('p1-sgp-msg').textContent = '';
  document.getElementById('p1-sgpdp-re').value = '';
  document.getElementById('p1-sgpdp-cookie').value = '';
  document.getElementById('p1-sgpdp-msg').textContent = '';
  document.getElementById('p1-sgpdp-cursos-re').value = '';
  document.getElementById('p1-sgpdp-cursos-msg').textContent = '';
  p1SgpRefreshStatus();
  p1SgpDpStatusSessao();
  if (p1SgpPollTimer) clearInterval(p1SgpPollTimer);
  p1SgpPollTimer = setInterval(p1SgpRefreshStatus, 5000);
}

function closeP1SgpModal() {
  document.getElementById('p1-sgp-mo').style.display = 'none';
  if (p1SgpPollTimer) { clearInterval(p1SgpPollTimer); p1SgpPollTimer = null; }
}

function p1SgpClickOut(e) {
  if (e.target === document.getElementById('p1-sgp-mo')) closeP1SgpModal();
}

async function p1SgpRequestSingle() {
  const msg = document.getElementById('p1-sgp-msg');
  const re = document.getElementById('p1-sgp-re').value.trim();
  if (!/^\d{6}$/.test(re)) { msg.innerHTML = '<span style="color:#f07878">Digite os 6 dígitos do RE, sem o dígito verificador.</span>'; return; }
  msg.innerHTML = '<span style="color:var(--tx3)">Enviando pedido...</span>';
  try {
    const res = await authFetch(`${API}/efetivo/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'single', re })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao criar pedido.');
    msg.innerHTML = '<span style="color:#4bc87a">Pedido enviado — aguardando o agente do batalhão processar.</span>';
    p1SgpRefreshStatus();
  } catch (err) {
    msg.innerHTML = `<span style="color:#f07878">${escHtml(err.message)}</span>`;
  }
}

async function p1SgpRequestBulk() {
  const msg = document.getElementById('p1-sgp-msg');
  if (!confirm('Isso vai reconsultar todo o efetivo cadastrado, um por um. Pode levar bastante tempo. Continuar?')) return;
  msg.innerHTML = '<span style="color:var(--tx3)">Enviando pedido...</span>';
  try {
    const res = await authFetch(`${API}/efetivo/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'bulk' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao criar pedido.');
    msg.innerHTML = '<span style="color:#4bc87a">Pedido enviado — aguardando o agente do batalhão processar.</span>';
    p1SgpRefreshStatus();
  } catch (err) {
    msg.innerHTML = `<span style="color:#f07878">${escHtml(err.message)}</span>`;
  }
}

// ── IAS via SGP-DP (sessão colada manualmente, cookie nunca volta pra tela) ──
async function p1SgpDpStatusSessao() {
  const el = document.getElementById('p1-sgpdp-status');
  if (!el) return;
  try {
    const st = await authFetch(`${API}/sgp-dp/sessao/status`).then(r => r.json());
    if (!st.atualizado_em) { el.innerHTML = '<span style="color:#c8a84b">Nenhuma sessão salva ainda.</span>'; return; }
    const quando = new Date(st.atualizado_em);
    const horas = Math.floor((Date.now() - quando.getTime()) / 3600000);
    // Duração observada na prática (2026-08-11): sessão real caiu entre 1h e
    // 4h, bem menos que as ~24h assumidas antes (nunca confirmadas de
    // verdade contra o SGP-DP) — limiares recalibrados pra avisar mais cedo.
    const cor = horas >= 3 ? '#f07878' : horas >= 1 ? '#c8a84b' : '#4bc87a';
    el.innerHTML = `<span style="color:${cor}">Sessão salva há ${horas}h</span> por ${escHtml(st.atualizado_por || '—')}${horas >= 1 ? ' — sessões do SGP-DP têm expirado entre 1h e 4h, considere colar um cookie novo' : ''}`;
  } catch {
    el.innerHTML = '<span style="color:#f07878">Erro ao carregar status da sessão.</span>';
  }
}

async function p1SgpDpSalvarSessao() {
  const msg = document.getElementById('p1-sgpdp-msg');
  const cookie = document.getElementById('p1-sgpdp-cookie').value.trim();
  if (cookie.length < 20) { msg.innerHTML = '<span style="color:#f07878">Cole o valor completo do cookie.</span>'; return; }
  msg.innerHTML = '<span style="color:var(--tx3)">Salvando...</span>';
  try {
    const res = await authFetch(`${API}/sgp-dp/sessao`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar sessão.');
    msg.innerHTML = '<span style="color:#4bc87a">Sessão salva.</span>';
    document.getElementById('p1-sgpdp-cookie').value = '';
    p1SgpDpStatusSessao();
  } catch (err) {
    msg.innerHTML = `<span style="color:#f07878">${escHtml(err.message)}</span>`;
  }
}

async function p1SgpIasRequestSingle() {
  const msg = document.getElementById('p1-sgpdp-msg');
  const re = document.getElementById('p1-sgpdp-re').value.trim();
  if (!/^\d{6}$/.test(re)) { msg.innerHTML = '<span style="color:#f07878">Digite os 6 dígitos do RE, sem o dígito verificador.</span>'; return; }
  msg.innerHTML = '<span style="color:var(--tx3)">Enviando pedido...</span>';
  try {
    const res = await authFetch(`${API}/efetivo/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'ias_single', re })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao criar pedido.');
    msg.innerHTML = '<span style="color:#4bc87a">Pedido enviado — aguardando o agente do batalhão processar.</span>';
    p1SgpRefreshStatus();
  } catch (err) {
    msg.innerHTML = `<span style="color:#f07878">${escHtml(err.message)}</span>`;
  }
}

async function p1SgpIasRequestBulk() {
  const msg = document.getElementById('p1-sgpdp-msg');
  if (!confirm('Isso vai reconsultar a IAS de todo o efetivo cadastrado, um por um. Pode levar bastante tempo e a sessão do SGP-DP pode expirar no meio (tem expirado entre 1h e 4h) — cole um cookie novo antes de rodar. Continuar?')) return;
  msg.innerHTML = '<span style="color:var(--tx3)">Enviando pedido...</span>';
  try {
    const res = await authFetch(`${API}/efetivo/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'ias_bulk' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao criar pedido.');
    msg.innerHTML = '<span style="color:#4bc87a">Pedido enviado — aguardando o agente do batalhão processar.</span>';
    p1SgpRefreshStatus();
  } catch (err) {
    msg.innerHTML = `<span style="color:#f07878">${escHtml(err.message)}</span>`;
  }
}

async function p1SgpCursosRequestSingle() {
  const msg = document.getElementById('p1-sgpdp-cursos-msg');
  const re = document.getElementById('p1-sgpdp-cursos-re').value.trim();
  if (!/^\d{6}$/.test(re)) { msg.innerHTML = '<span style="color:#f07878">Digite os 6 dígitos do RE, sem o dígito verificador.</span>'; return; }
  msg.innerHTML = '<span style="color:var(--tx3)">Enviando pedido...</span>';
  try {
    const res = await authFetch(`${API}/efetivo/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'cursos_single', re })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao criar pedido.');
    msg.innerHTML = '<span style="color:#4bc87a">Pedido enviado — aguardando o agente do batalhão processar.</span>';
    p1SgpRefreshStatus();
  } catch (err) {
    msg.innerHTML = `<span style="color:#f07878">${escHtml(err.message)}</span>`;
  }
}

async function p1SgpCursosRequestBulk() {
  const msg = document.getElementById('p1-sgpdp-cursos-msg');
  if (!confirm('Isso vai reconsultar os cursos de todo o efetivo cadastrado, um por um. Pode levar bastante tempo e a sessão do SGP-DP pode expirar no meio (tem expirado entre 1h e 4h) — cole um cookie novo antes de rodar. Continuar?')) return;
  msg.innerHTML = '<span style="color:var(--tx3)">Enviando pedido...</span>';
  try {
    const res = await authFetch(`${API}/efetivo/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'cursos_bulk' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao criar pedido.');
    msg.innerHTML = '<span style="color:#4bc87a">Pedido enviado — aguardando o agente do batalhão processar.</span>';
    p1SgpRefreshStatus();
  } catch (err) {
    msg.innerHTML = `<span style="color:#f07878">${escHtml(err.message)}</span>`;
  }
}

async function p1SgpLaureasRequestSingle() {
  const msg = document.getElementById('p1-sgpdp-laureas-msg');
  const re = document.getElementById('p1-sgpdp-laureas-re').value.trim();
  if (!/^\d{6}$/.test(re)) { msg.innerHTML = '<span style="color:#f07878">Digite os 6 dígitos do RE, sem o dígito verificador.</span>'; return; }
  msg.innerHTML = '<span style="color:var(--tx3)">Enviando pedido...</span>';
  try {
    const res = await authFetch(`${API}/efetivo/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'laureas_single', re })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao criar pedido.');
    msg.innerHTML = '<span style="color:#4bc87a">Pedido enviado — aguardando o agente do batalhão processar.</span>';
    p1SgpRefreshStatus();
  } catch (err) {
    msg.innerHTML = `<span style="color:#f07878">${escHtml(err.message)}</span>`;
  }
}

async function p1SgpLaureasRequestBulk() {
  const msg = document.getElementById('p1-sgpdp-laureas-msg');
  if (!confirm('Isso vai reconsultar as láureas de todo o efetivo cadastrado, um por um. Pode levar bastante tempo e a sessão do SGP-DP pode expirar no meio (tem expirado entre 1h e 4h) — cole um cookie novo antes de rodar. Continuar?')) return;
  msg.innerHTML = '<span style="color:var(--tx3)">Enviando pedido...</span>';
  try {
    const res = await authFetch(`${API}/efetivo/sync`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'laureas_bulk' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao criar pedido.');
    msg.innerHTML = '<span style="color:#4bc87a">Pedido enviado — aguardando o agente do batalhão processar.</span>';
    p1SgpRefreshStatus();
  } catch (err) {
    msg.innerHTML = `<span style="color:#f07878">${escHtml(err.message)}</span>`;
  }
}

function p1SgpStatusLabel(status) {
  const map = {
    pending:    ['aguardando', '#e8c96a'],
    processing: ['processando', '#5a9de0'],
    done:       ['concluído', '#4bc87a'],
    error:      ['erro', '#f07878'],
  };
  const [label, color] = map[status] || [status, 'var(--tx3)'];
  return `<span style="color:${color}">${label}</span>`;
}

async function p1SgpRefreshStatus() {
  const el = document.getElementById('p1-sgp-lista');
  if (!el) return;
  try {
    const jobs = await authFetch(`${API}/efetivo/sync/status`).then(r => r.json());
    if (!jobs.length) { el.innerHTML = '<span style="color:var(--tx3)">Nenhum pedido ainda.</span>'; return; }
    el.innerHTML = jobs.map(j => {
      const ehIas = j.tipo === 'ias_single' || j.tipo === 'ias_bulk';
      const ehCursos = j.tipo === 'cursos_single' || j.tipo === 'cursos_bulk';
      const ehLaureas = j.tipo === 'laureas_single' || j.tipo === 'laureas_bulk';
      const ehSingle = j.tipo === 'single' || j.tipo === 'ias_single' || j.tipo === 'cursos_single' || j.tipo === 'laureas_single';
      const prefixo = ehIas ? 'IAS · ' : ehCursos ? 'Cursos · ' : ehLaureas ? 'Láureas · ' : '';
      const desc = ehSingle ? `${prefixo}RE ${escHtml(j.re)}` : `${prefixo}Efetivo completo`;
      const quando = new Date(j.criado_em).toLocaleString('pt-BR');
      let detalhe = '';
      if (j.status === 'done' && j.resultado) {
        detalhe = !ehSingle
          ? ` — ${j.resultado.atualizados}/${j.resultado.total} atualizados${j.resultado.erros?.length ? `, ${j.resultado.erros.length} erro(s)` : ''}${j.resultado.abortado ? ` — ${escHtml(j.resultado.abortado)}` : ''}`
          : ` — ${escHtml(j.resultado.nome || '')}`;
      } else if (j.status === 'error' && j.resultado?.erro) {
        detalhe = ` — ${escHtml(j.resultado.erro)}`;
      }
      return `<div style="padding:6px 0;border-bottom:1px solid var(--bd)">${desc} · ${p1SgpStatusLabel(j.status)}${detalhe}<br><span style="color:var(--tx3);font-size:16px">${quando} · ${escHtml(j.solicitado_por || '')}</span></div>`;
    }).join('');
  } catch {
    el.innerHTML = '<span style="color:#f07878">Erro ao carregar status.</span>';
  }
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

// ── KPI Detail ───────────────────────────────────────────────────────────────

function wrapDetail(_title, _count, _color, _closeBtn, inner) {
  return `<div style="overflow-x:auto">${inner}</div>`;
}

// Card do KPI de IAS — igual ao que existia no P1 até 2026-08, só que agora
// é chamado de dentro da UIS (uis.js) em vez de aparecer no grid do P1.
// Mesmo onclick (abre o modal de detalhe do P1, com fotos via p1CardGrid).
function p1IasKpiCardHtml() {
  if (!_iasMap || !Object.keys(_iasMap).length) return '';
  const pmIasAptos    = p1Data.filter(r => iasStatus(r.re) === 'apto');
  const pmIasVencendo = p1Data.filter(r => iasStatus(r.re) === 'vencendo');
  const pmIasVencidos = p1Data.filter(r => iasStatus(r.re) === 'vencido');
  const pmIasSemReg   = p1Data.filter(r => !iasStatus(r.re));
  const kpiRow = (label, val, color) => `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:#ffffff;font-size:17px">${escHtml(label)}</span><span style="color:${color};font-weight:700;font-size:20px">${val}</span></div>`;
  const sub = [
    kpiRow('Aptos', pmIasAptos.length + pmIasVencendo.length, '#4bc87a'),
    pmIasVencendo.length ? kpiRow('Vencendo 30d', pmIasVencendo.length, '#c8a84b') : '',
    pmIasVencidos.length ? kpiRow('Vencidos', pmIasVencidos.length, '#e05555') : '',
    pmIasSemReg.length ? kpiRow('Sem registro', pmIasSemReg.length, '#606880') : '',
  ].filter(Boolean).join('') || '—';
  return `<div onclick="p1ShowKpiDetail('ias')" class="kpi">
      <div class="kpi-top"></div>
      <div class="kpi-lbl">IAS · Inspeção de Saúde</div>
      <div class="kpi-val">${pmIasAptos.length + pmIasVencendo.length}</div>
      <div class="kpi-sub" style="line-height:1.7;width:100%">${sub}</div>
      <div class="kpi-hint">▸ clique p/ detalhes</div>
    </div>`;
}

function closeP1Detail() {
  const mo = document.getElementById('p1-detail-mo');
  if (mo) { mo.classList.remove('on'); document.body.style.overflow = ''; }
  _p1TotalDetCia = -1; _p1TotalDetGen = null; _p1TotalDetMun = null; _p1TotalDetPosto = null;
  _p1TotalDetCursoInt = null; _p1TotalDetCursoExt = null; _p1TotalDetBusca = null;
  _p1IasDetSit = null; _p1IasDetCia = -1; _p1IasDetMun = null; _p1IasDetPosto = null;
  _p1AfastDetCia = -1; _p1AfastDetMun = null; _p1AfastDetPosto = null;
  _p1EapDetCia = -1; _p1EapDetMun = null; _p1EapDetPosto = null;
  _p1FeriasDetCia = -1; _p1FeriasDetMun = null; _p1FeriasDetPosto = null;
}


function eapFiltroSet(key) {
  ['feitos','aptos365','pend','inaptaf','inatat','venc'].forEach(k => {
    const el = document.getElementById('eap-tbl-' + k);
    if (el) el.style.display = k === key ? '' : 'none';
  });
  document.querySelectorAll('.eap-flt-card').forEach(card => {
    const on = card.dataset.eapkey === key;
    card.classList.toggle('on', on);
    card.style.borderColor = on ? card.dataset.cor : 'var(--bd2)';
    card.style.boxShadow = on ? `0 0 0 1px ${card.dataset.cor}` : 'none';
  });
}

function p1DetailClickOut(e) {
  if (e.target === document.getElementById('p1-detail-mo')) closeP1Detail();
}

// Filtro padrão (CIA / Cidade / Graduação) usado em todo detalhe de KPI do
// P1 que lista PMs — 3 seletores integrados: CIA e Cidade se filtram
// mutuamente (a lista de opções de um considera a seleção atual do outro),
// Graduação cascata dos dois. Autocorrige sozinho seleção que ficou inválida
// (ex: cidade que não existe mais na CIA recém-escolhida).
// `base` é [{ ciaIdx, mun, posto }] já enriquecido pelo chamador.
function p1FiltroCMP(base, cia, mun, posto, setCiaFn, setMunFn, setPostoFn) {
  const munOpts = [...new Set((cia >= 0 ? base.filter(x => x.ciaIdx === cia) : base).map(x => x.mun).filter(Boolean))].sort();
  if (mun && !munOpts.includes(mun)) mun = null;

  const ciaOpts = typeof CIA_STRUCT !== 'undefined' ? CIA_STRUCT.map((c, i) => ({
    idx: i, label: c.label,
    cnt: (mun ? base.filter(x => x.mun === mun) : base).filter(x => x.ciaIdx === i).length,
  })).filter(o => o.cnt > 0) : [];
  if (cia >= 0 && !ciaOpts.some(o => o.idx === cia)) cia = -1;

  let filtBase = base;
  if (cia >= 0) filtBase = filtBase.filter(x => x.ciaIdx === cia);
  if (mun)      filtBase = filtBase.filter(x => x.mun === mun);
  const postoOpts = [...new Set(filtBase.map(x => x.posto).filter(Boolean))].sort((a,b) => p1PostoRank(a)-p1PostoRank(b));
  if (posto && !postoOpts.includes(posto)) posto = null;

  const sel = (label, options, onchange) => `
    <div style="display:flex;flex-direction:column;gap:4px;min-width:150px;flex:1">
      <label style="font-family:'DM Mono',monospace;font-size:10px;color:var(--tx3);letter-spacing:1.5px;text-transform:uppercase">${label}</label>
      <select onchange="${onchange}" style="padding:7px 10px;background:var(--s2);border:1px solid var(--bd);color:var(--tx);border-radius:6px;font-family:'DM Mono',monospace;font-size:13px;cursor:pointer;width:100%">
        ${options}
      </select>
    </div>`;
  const html = `<div style="display:flex;flex-wrap:wrap;gap:12px;padding:12px 16px;border-bottom:1px solid var(--bd)">
    ${sel('CIA', `<option value="">Todas</option>` + ciaOpts.map(o => `<option value="${o.idx}" ${cia===o.idx?'selected':''}>${escHtml(o.label)} (${o.cnt})</option>`).join(''), `${setCiaFn}(this.value)`)}
    ${sel('CIDADE', `<option value="">Todas</option>` + munOpts.map(m => `<option value="${escHtml(m)}" ${mun===m?'selected':''}>${escHtml(m)}</option>`).join(''), `${setMunFn}(this.value)`)}
    ${sel('GRADUAÇÃO', `<option value="">Todas</option>` + postoOpts.map(p => `<option value="${escHtml(p)}" ${posto===p?'selected':''}>${escHtml(p)}</option>`).join(''), `${setPostoFn}(this.value)`)}
  </div>`;

  return { cia, mun, posto, html };
}

// Grade de cards com foto (mesmo padrão da grade por CIA), usada em todos os
// detalhes de KPI no lugar de tabela de texto. `info` é um HTML opcional
// (status, datas, etc.) mostrado embaixo do nome — cada tela passa o seu.
// Sempre ordenado por antiguidade (Coronel → Soldado, RE menor primeiro em empate).
function p1CardGrid(pms, info, onclickFn) {
  const escB = s => (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const cards = p1OrdenarPorAntiguidade(pms).map(r => {
    const nm = r.nome_guerra || r.nome || r.re;
    const fotoCached = p1Fotos[r.re];
    const avatarContent = fotoCached
      ? `<img src="${fotoCached}" style="width:56px;height:${p1AvatarH(56)}px;border-radius:8px;object-fit:cover;border:2px solid rgba(255,255,255,.18)">`
      : p1AvatarSVG(nm, r.posto, 56);
    const click = onclickFn ? onclickFn(r) : `openProntuario('${escB(r.re)}')`;
    return `<div onclick="${click}" style="background:rgba(255,255,255,.025);border:1px solid var(--bd);border-radius:8px;padding:10px 8px;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;transition:border-color .15s;text-align:center" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--bd)'">
      <div data-foto-re="${escHtml(r.re)}" data-nome="${escHtml(nm)}" data-posto="${escHtml(r.posto||'')}" data-size="56">${avatarContent}</div>
      <div style="font-size:12px;color:var(--tx3);font-family:'DM Mono',monospace;letter-spacing:.5px">${escHtml(r.posto || '—')} · RE ${escHtml(r.re)}</div>
      <div style="font-size:15px;font-weight:700;color:var(--tx);line-height:1.25;word-break:break-word">${escHtml(nm)}${uisBadge(r.re)}${iasBadge(r.re)}</div>
      ${info ? info(r) : ''}
    </div>`;
  }).join('');
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px">
    ${cards || '<div style="padding:16px;text-align:center;color:var(--tx3);grid-column:1/-1">Nenhum resultado.</div>'}
  </div>`;
}

function p1ShowKpiDetail(tipo) {
  const mo = document.getElementById('p1-detail-mo');
  if (!mo) return;

  const KPI_META = {
    total:    { title: 'TODO O EFETIVO',       color: 'var(--gold)' },
    aptos:    { title: 'APTOS OPERACIONAL',     color: '#4bc87a' },
    afastados:{ title: 'AFASTAMENTOS',         color: '#e05555' },
    restricao:{ title: 'EM RESTRIÇÃO',         color: '#c8a84b' },
    eap:      { title: `EAP / TAF / TAT ${new Date().getFullYear()}`, color: '#c8a84b' },
    ias:      { title: 'IAS · INSPEÇÃO ANUAL DE SAÚDE', color: '#5a9de0' },
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

  const TIPO_COLOR = P1_TIPO_COLOR;
  const catTipo = p1CatTipo;

  const closeBtn = ''; // botão ✕ fica no header do modal

  const thL = 'padding:8px 12px;border-bottom:1px solid var(--bd2);font-family:"DM Mono",monospace;font-size:19px;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;text-align:left';
  const thR = thL.replace('text-align:left','text-align:right');
  const tdL = 'padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-size:19px;font-weight:600;color:var(--tx)';
  const tdS = 'padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-family:"DM Mono",monospace;font-size:19px;color:var(--tx3)';

  let html = '';

  if (tipo === 'total') {
    const genNorm = g => { const s = (g||'').toLowerCase().trim(); if (s.startsWith('f')) return 'F'; if (s.startsWith('m')) return 'M'; return null; };
    const getCiaTot = opm => {
      if (!opm || typeof CIA_STRUCT === 'undefined') return -1;
      return CIA_STRUCT.findIndex(c => typeof _opmMatch === 'function' && _opmMatch(opm, c.units.flatMap(u => u.keys)));
    };
    const getMunTot = opm => { if (!opm) return null; const p = opm.split(' - '); return p.length > 1 ? p[p.length-1].trim() : null; };

    const baseList = dataF.map(r => ({ r, ciaIdx: getCiaTot(r.opm), gen: genNorm(r.genero), mun: getMunTot(r.opm), posto: r.posto }));

    const cntF = baseList.filter(x => x.gen === 'F').length;
    const cntM = baseList.filter(x => x.gen === 'M').length;

    // Filtro por curso interno/externo (prod_cursos, carregado junto com o
    // resto do P1) — dois seletores independentes, combinados com E quando
    // os dois estão ativos.
    const cursosInt = p1Cursos.filter(c => (c.origem === 'interno' || c.origem === 'manual') && c.nome_curso);
    const cursosExt = p1Cursos.filter(c => c.origem === 'externo' && c.nome_curso);
    const listaCursosInt = [...new Set(cursosInt.map(c => c.nome_curso))].sort((a,b) => a.localeCompare(b));
    const listaCursosExt = [...new Set(cursosExt.map(c => c.nome_curso))].sort((a,b) => a.localeCompare(b));
    const reComCursoInt = _p1TotalDetCursoInt ? new Set(cursosInt.filter(c => c.nome_curso === _p1TotalDetCursoInt).map(c => c.re_pm)) : null;
    const reComCursoExt = _p1TotalDetCursoExt ? new Set(cursosExt.filter(c => c.nome_curso === _p1TotalDetCursoExt).map(c => c.re_pm)) : null;

    const filtro = p1FiltroCMP(baseList, _p1TotalDetCia, _p1TotalDetMun, _p1TotalDetPosto, 'p1TotalSetCia', 'p1TotalSetMun', 'p1TotalSetPosto');
    _p1TotalDetCia = filtro.cia; _p1TotalDetMun = filtro.mun; _p1TotalDetPosto = filtro.posto;

    let filtered = baseList;
    if (_p1TotalDetCia >= 0) filtered = filtered.filter(x => x.ciaIdx === _p1TotalDetCia);
    if (_p1TotalDetGen)      filtered = filtered.filter(x => x.gen === _p1TotalDetGen);
    if (_p1TotalDetMun)      filtered = filtered.filter(x => x.mun === _p1TotalDetMun);
    if (_p1TotalDetPosto)    filtered = filtered.filter(x => x.posto === _p1TotalDetPosto);
    if (reComCursoInt)       filtered = filtered.filter(x => reComCursoInt.has(x.r.re));
    if (reComCursoExt)       filtered = filtered.filter(x => reComCursoExt.has(x.r.re));

    // Busca por nome/RE é dado nominal — nunca disponibilizar (nem a lista
    // de sugestão no DOM, nem o filtro) pra quem só tem acesso "Só números";
    // mesmo padrão de p1SearchInput, que já bloqueia isso na busca global.
    const somenteQtdBusca = p1SomenteQuantitativo();
    // Lista de sugestão vem do que já está filtrado pelos outros critérios
    // (CIA/gênero/município/posto/curso) — igual ao padrão dos outros filtros
    // dessa tela, refina em cima do que já foi reduzido em vez de sempre
    // sugerir o efetivo inteiro. Usa o NOME COMPLETO (não o QRA/nome de
    // guerra) como valor da opção — o filtro nativo do navegador (o que
    // aparece na lista suspensa enquanto digita) casa contra o texto da
    // opção, então "LUAN" só encontrava quem tem "Luan" no QRA se a opção
    // fosse o QRA; com o nome completo, casa em qualquer parte do nome de
    // qualquer PM, igual ao filtro de verdade (que já checa nome e QRA).
    const listaNomesBusca = somenteQtdBusca ? [] : [...new Set(filtered.map(x => x.r.nome).filter(Boolean))].sort((a,b) => a.localeCompare(b));
    if (!somenteQtdBusca && _p1TotalDetBusca) {
      const q = _p1TotalDetBusca.toLowerCase();
      const isReQ = /^\d+$/.test(q);
      filtered = filtered.filter(x => isReQ
        ? (x.r.re || '').toLowerCase().startsWith(q)
        : (x.r.nome || '').toLowerCase().includes(q) || (x.r.nome_guerra || '').toLowerCase().includes(q));
    }

    const btnBase = (lbl, cor, on, onclick) =>
      `<button onclick="${onclick}" style="padding:8px 18px;background:${on?cor+'22':'var(--s2)'};border:1px solid ${on?cor:cor+'44'};color:${on?cor:'var(--tx)'};border-radius:6px;cursor:pointer;font-family:'DM Mono',monospace;font-size:15px;font-weight:600;transition:all .15s;white-space:nowrap">${lbl}</button>`;
    const gridRow = (lbl, btns) =>
      `<div style="border-bottom:1px solid var(--bd);padding-bottom:10px;margin-bottom:10px">
        <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--tx3);letter-spacing:1.5px;margin-bottom:8px;text-transform:uppercase">${lbl}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${btns}</div>
      </div>`;

    const genBtns = [
      btnBase(`FEMININO <span style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;margin-left:6px">${cntF}</span>`, '#e91e8c', _p1TotalDetGen === 'F', "p1TotalSetGen('F')"),
      btnBase(`MASCULINO <span style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;margin-left:6px">${cntM}</span>`, '#5a9de0', _p1TotalDetGen === 'M', "p1TotalSetGen('M')"),
    ].join('');

    // input+datalist: digita pra filtrar a lista suspensa ao vivo, mas
    // continua mostrando a lista inteira ao focar/clicar (comportamento
    // nativo do navegador) — em vez de um <select> que só rola. Reaproveitado
    // tanto pros filtros de curso (seleção exata de um item) quanto pra busca
    // de nome/RE (texto livre, casa por trecho — ver filtro de _p1TotalDetBusca acima).
    // Placeholder curto o bastante pra nunca clipar (inputs de largura
    // variável dependendo da tela) — texto longo com contagem dinâmica
    // ("Buscar entre 352 PMs...") cortava sem reticências, já que o
    // navegador não aplica "..." em placeholder por padrão. A contagem
    // continua disponível no rótulo do campo (ex: "N PMs" abaixo), não
    // precisa repetir dentro do placeholder.
    const inputBusca = (id, lista, valor, onchangeFn, placeholder) => `
      <div style="display:flex;gap:6px;align-items:center;max-width:100%">
        <input type="text" list="${id}-list" value="${escHtml(valor || '')}"
          placeholder="${escHtml(placeholder)}" onchange="${onchangeFn}(this.value)"
          style="flex:1;min-width:0;padding:7px 10px;background:var(--s2);border:1px solid var(--bd);color:var(--tx);border-radius:6px;font-size:15px;font-family:'DM Mono',monospace;overflow:hidden;text-overflow:ellipsis">
        <datalist id="${id}-list">${lista.map(c => `<option value="${escHtml(c)}">`).join('')}</datalist>
        ${valor ? `<button onclick="${onchangeFn}('')" title="Limpar filtro" style="padding:6px 10px;background:var(--s2);border:1px solid var(--bd);color:var(--tx3);border-radius:6px;cursor:pointer;font-size:15px;flex-shrink:0">✕</button>` : ''}
      </div>`;
    const buscaNomeRow  = somenteQtdBusca ? '' : gridRow(`BUSCAR PM (NOME OU RE) · ${listaNomesBusca.length}`, inputBusca('p1-total-busca', listaNomesBusca, _p1TotalDetBusca, 'p1TotalSetBusca', 'Nome ou RE...'));
    const cursosIntRow = listaCursosInt.length ? gridRow(`CURSOS INTERNOS · ${listaCursosInt.length}`, inputBusca('p1-curso-int', listaCursosInt, _p1TotalDetCursoInt, 'p1TotalSetCursoInt', 'Nome do curso...')) : '';
    const cursosExtRow = listaCursosExt.length ? gridRow(`CURSOS EXTERNOS · ${listaCursosExt.length}`, inputBusca('p1-curso-ext', listaCursosExt, _p1TotalDetCursoExt, 'p1TotalSetCursoExt', 'Nome do curso...')) : '';

    const totalInfo = r => {
      const afst = p1AfastHoje[r.re];
      const s = afst
        ? `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#e0555522;color:#e05555;font-family:'DM Mono',monospace">${escHtml(afst[0]?.tipo_afastamento||'Afastado')}</span>`
        : `<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#4bc87a22;color:#4bc87a;font-family:'DM Mono',monospace">Apto</span>`;
      return `<div title="${escHtml(r.opm||'')}" style="font-size:11px;color:var(--tx3);font-family:'DM Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${escHtml(r.opm||'—')}</div>${s}`;
    };

    const tabelaTotalHtml = p1SomenteQuantitativo()
      ? `<div style="padding:16px;text-align:center;color:var(--tx3);font-size:15px;font-family:'DM Mono',monospace;letter-spacing:1px">▸ LISTAGEM NOMINAL RESTRITA — total: ${filtered.length}</div>`
      : p1CardGrid(filtered.map(({r}) => r), totalInfo);

    html = wrapDetail('Todo o Efetivo', filtered.length, '#c8a84b', closeBtn, `
      ${filtro.html}
      ${buscaNomeRow}
      ${gridRow('GÊNERO', genBtns)}
      ${cursosIntRow}
      ${cursosExtRow}
      ${tabelaTotalHtml}`);
  }

  else if (tipo === 'afastados') {
    const getMunAfast = opm => { const p = (opm||'').split(' - '); return p.length > 1 ? p[p.length-1].trim() : null; };
    const getCiaAfast = opm => (typeof CIA_STRUCT === 'undefined' || !opm) ? -1 : CIA_STRUCT.findIndex(c => typeof _opmMatch === 'function' && _opmMatch(opm, c.units.flatMap(u => u.keys)));

    const ativosBase = p1Afasts.filter(a => !p1EhRestricao(a) && !p1EhSupervisao(a) && a.inicio <= hoje && (!a.termino || a.termino >= hoje) && reSetF.has(a.re)).map(a => {
      const pm = p1Data.find(r => r.re === a.re);
      return { a, ciaIdx: getCiaAfast(pm?.opm), mun: getMunAfast(pm?.opm), posto: pm?.posto };
    });

    const filtro = p1FiltroCMP(ativosBase, _p1AfastDetCia, _p1AfastDetMun, _p1AfastDetPosto, 'p1AfastSetCia', 'p1AfastSetMun', 'p1AfastSetPosto');
    _p1AfastDetCia = filtro.cia; _p1AfastDetMun = filtro.mun; _p1AfastDetPosto = filtro.posto;

    let ativosFiltrados = ativosBase;
    if (_p1AfastDetCia >= 0) ativosFiltrados = ativosFiltrados.filter(x => x.ciaIdx === _p1AfastDetCia);
    if (_p1AfastDetMun)      ativosFiltrados = ativosFiltrados.filter(x => x.mun === _p1AfastDetMun);
    if (_p1AfastDetPosto)    ativosFiltrados = ativosFiltrados.filter(x => x.posto === _p1AfastDetPosto);
    const ativos = ativosFiltrados.map(x => x.a);

    const groups = {};
    ativos.forEach(a => {
      const cat = catTipo(a.tipo_afastamento);
      // Sem categoria fixa reconhecida: agrupa pelo texto real do tipo em vez
      // de amontoar tudo num "Outros" genérico que esconde o que realmente é.
      const key = cat === 'Outros' ? ((a.tipo_afastamento || '').trim() || 'Outros') : cat;
      (groups[key] = groups[key]||[]).push(a);
    });
    const KNOWN_ORDER = ['Férias','LP','LSV','Conval','Núpcias','Luto','Maternidade','Paternidade','LTS'];
    const outrosKeys = Object.keys(groups).filter(k => !KNOWN_ORDER.includes(k)).sort((a,b) => groups[b].length - groups[a].length);
    const ORDER = [...KNOWN_ORDER, ...outrosKeys];

    // Cards com foto, agrupados por tipo — mesmo padrão visual da grade por CIA.
    let inner = '';
    ORDER.forEach(cat => {
      const list = groups[cat]; if (!list?.length) return;
      const color = TIPO_COLOR[cat] || '#607090';
      const cardData = list.map(a => {
        const pm = p1Data.find(r => r.re === a.re);
        return { re: a.re, nome: pm?.nome || a.nome, nome_guerra: pm?.nome_guerra, posto: pm?.posto, _afast: a };
      });
      const afastInfo = r => {
        const a = r._afast;
        const dias = a.termino ? Math.ceil((new Date(a.termino) - new Date(hoje)) / 86400000) : null;
        return `<div style="font-size:11px;font-family:'DM Mono',monospace;color:var(--tx3)">${escHtml(a.tipo_afastamento || '—')}</div>
                <div style="font-size:12px;font-family:'DM Mono',monospace;color:${dias!==null&&dias<=3?'#4bc87a':'var(--tx3)'}">${fmtD(a.inicio)} → ${dias!==null ? dias+'d rest.' : fmtD(a.termino)}</div>`;
      };
      inner += `<div style="margin-bottom:16px">
        <div style="margin-bottom:8px"><span style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:1px;padding:3px 10px;border-radius:10px;background:${color}22;color:${color};text-transform:uppercase">${escHtml(cat)} — ${list.length}</span></div>
        ${p1CardGrid(cardData, afastInfo)}
      </div>`;
    });

    const conteudoAfastHtml = p1SomenteQuantitativo()
      ? `<div style="padding:16px;text-align:center;color:var(--tx3);font-size:15px;font-family:'DM Mono',monospace;letter-spacing:1px">▸ LISTAGEM NOMINAL RESTRITA — total: ${ativos.length}</div>`
      : (inner || `<div style="padding:16px;text-align:center;color:var(--tx3);font-size:19px">Nenhum afastamento ativo hoje.</div>`);
    html = wrapDetail('Afastamentos Ativos', ativos.length, '#e05555', closeBtn, `
      ${filtro.html}
      ${conteudoAfastHtml}`);
  }

  else if (tipo === 'eap') {
    const getMunEap = opm => { const p = (opm||'').split(' - '); return p.length > 1 ? p[p.length-1].trim() : null; };
    const getCiaEap = opm => (typeof CIA_STRUCT === 'undefined' || !opm) ? -1 : CIA_STRUCT.findIndex(c => typeof _opmMatch === 'function' && _opmMatch(opm, c.units.flatMap(u => u.keys)));
    const baseEap = dataF.map(r => ({ r, ciaIdx: getCiaEap(r.opm), mun: getMunEap(r.opm), posto: r.posto }));

    const filtroEap = p1FiltroCMP(baseEap, _p1EapDetCia, _p1EapDetMun, _p1EapDetPosto, 'p1EapSetCia', 'p1EapSetMun', 'p1EapSetPosto');
    _p1EapDetCia = filtroEap.cia; _p1EapDetMun = filtroEap.mun; _p1EapDetPosto = filtroEap.posto;

    let baseEapFiltrado = baseEap;
    if (_p1EapDetCia >= 0) baseEapFiltrado = baseEapFiltrado.filter(x => x.ciaIdx === _p1EapDetCia);
    if (_p1EapDetMun)      baseEapFiltrado = baseEapFiltrado.filter(x => x.mun === _p1EapDetMun);
    if (_p1EapDetPosto)    baseEapFiltrado = baseEapFiltrado.filter(x => x.posto === _p1EapDetPosto);
    const dataFEap = baseEapFiltrado.map(x => x.r);

    const isEapOk = r => { const d = r.data_eap ? new Date(r.data_eap) : null; return d && !isNaN(d) && d.getUTCFullYear() === anoAtual; };
    const taftatVencFn = pm => {
      if (!pm.data_eap) return false;
      const d = new Date(pm.data_eap), lim = new Date(d);
      lim.setFullYear(lim.getFullYear() + 1);
      return new Date() > lim;
    };
    const feitos   = dataFEap.filter(r => isEapOk(r)).sort((a,b) => (a.data_eap||'').localeCompare(b.data_eap||''));
    const pend     = dataFEap.filter(r => !isEapOk(r));
    const REPROV_D = new Set(['inapto','ruim']);
    const inapTAF  = dataFEap.filter(r => REPROV_D.has((r.taf||'').toLowerCase().trim()));
    const inapTAT  = dataFEap.filter(r => REPROV_D.has((r.tat||'').toLowerCase().trim()));
    const vencidos = dataFEap.filter(taftatVencFn);
    const lim365   = (() => { const d = new Date(); d.setDate(d.getDate() - 365); return d; })();
    const aptos365 = dataFEap.filter(r =>
      r.data_eap && new Date(r.data_eap) >= lim365 && !REPROV_D.has((r.taf||'').toLowerCase().trim())
    );

    const notaCor2  = n => ({ 'excepcional':'#4bc87a','muito bom':'#9de05a','bom':'#c8c84b','regular':'#c8a84b','ruim':'#e05555','inapto':'#e05555' })[(n||'').toLowerCase()] || 'var(--tx3)';
    const notaBadgeSm = n => n
      ? `<span style="font-size:10px;font-family:'DM Mono',monospace;padding:1px 6px;border-radius:6px;background:${notaCor2(n)}22;color:${notaCor2(n)}">${escHtml(n)}</span>`
      : `<span style="color:var(--tx3);font-size:10px">—</span>`;
    const p2 = n => String(n).padStart(2,'0');
    const fmtEap = s => {
      if (!s) return '—';
      const d = new Date(s); if (isNaN(d)) return '—';
      const d3 = new Date(d); d3.setUTCDate(d3.getUTCDate() + 2);
      return `${p2(d.getUTCDate())} à ${p2(d3.getUTCDate())}/${p2(d3.getUTCMonth()+1)}/${d3.getUTCFullYear()}`;
    };

    // Info do card: data do EAP (ou situação) + badges de TAF/TAT.
    const infoEapDatas = dateFn => r => `
      <div style="font-size:10px;color:#4bc87a;font-family:'DM Mono',monospace">${dateFn(r)}</div>
      <div style="display:flex;gap:6px;justify-content:center;margin-top:2px;font-size:10px;color:var(--tx3)">TAF ${notaBadgeSm(r.taf)} TAT ${notaBadgeSm(r.tat)}</div>`;
    const infoEapPend = r => {
      const sit = taftatVencFn(r)
        ? `<span style="font-size:10px;font-family:'DM Mono',monospace;padding:1px 6px;border-radius:6px;background:#e0555522;color:#e05555">Vencido</span>`
        : `<span style="font-size:10px;font-family:'DM Mono',monospace;padding:1px 6px;border-radius:6px;background:#c8a84b22;color:#c8a84b">Não realizado</span>`;
      return `<div>${sit}</div><div style="display:flex;gap:6px;justify-content:center;margin-top:2px;font-size:10px;color:var(--tx3)">TAF ${notaBadgeSm(r.taf)} TAT ${notaBadgeSm(r.tat)}</div>`;
    };
    const infoEapNota = campo => r => `<div style="margin-top:2px">${notaBadgeSm(r[campo])}</div>`;

    const tblFeitos   = feitos.length   ? p1CardGrid(feitos,   infoEapDatas(r => fmtEap(r.data_eap))) : `<div style="padding:14px;color:var(--tx3);font-size:19px;text-align:center">Nenhum realizado ainda</div>`;
    const tblPend     = pend.length     ? p1CardGrid(pend,     infoEapPend) : `<div style="padding:14px;color:var(--tx3);font-size:19px;text-align:center">Todos realizaram ✓</div>`;
    const tblInapTAF  = inapTAF.length  ? p1CardGrid(inapTAF,  infoEapNota('taf')) : `<div style="padding:14px;color:var(--tx3);font-size:19px;text-align:center">Nenhum inapto no TAF</div>`;
    const tblInapTAT  = inapTAT.length  ? p1CardGrid(inapTAT,  infoEapNota('tat')) : `<div style="padding:14px;color:var(--tx3);font-size:19px;text-align:center">Nenhum inapto no TAT</div>`;
    const tblVenc     = vencidos.length ? p1CardGrid(vencidos, infoEapDatas(r => fmtEap(r.data_eap))) : `<div style="padding:14px;color:var(--tx3);font-size:19px;text-align:center">Nenhum vencido</div>`;

    // Cartão de resumo clicável — dobra como o único seletor de filtro
    // (antes havia uma 2ª linha de botões repetindo os mesmos 6 rótulos/
    // contagens só pra mostrar qual estava selecionado; esse estado agora
    // fica no próprio card via classe "on", sem duplicar o controle).
    const smCard = (key, label, val, cor) =>
      `<div class="eap-flt-card" data-eapkey="${key}" data-cor="${cor}" onclick="eapFiltroSet('${key}')" style="background:var(--bg2);border:1px solid var(--bd2);border-top:3px solid ${cor};border-radius:8px;padding:14px 16px;cursor:pointer;transition:border-color .15s,box-shadow .15s" onmouseover="if(!this.classList.contains('on'))this.style.borderColor='${cor}'" onmouseout="if(!this.classList.contains('on'))this.style.borderColor='var(--bd2)'">
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">${label}</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:36px;font-weight:800;color:${cor};line-height:1">${val}</div>
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-top:4px">▸ ver lista</div>
      </div>`;

    const eapSmCards = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;padding:16px 12px 14px">
        ${smCard('feitos',   'Realizaram ' + anoAtual,  feitos.length,   '#4bc87a')}
        ${smCard('aptos365', 'Aptos 365 dias',           aptos365.length, aptos365.length ? '#4bc87a' : 'var(--tx3)')}
        ${smCard('pend',     'Pendentes',                pend.length,     pend.length   ? '#c8a84b' : 'var(--tx3)')}
        ${smCard('inaptaf',  'Inaptos TAF',              inapTAF.length,  inapTAF.length? '#e05555' : 'var(--tx3)')}
        ${smCard('inatat',   'Inaptos TAT',              inapTAT.length,  inapTAT.length? '#e05555' : 'var(--tx3)')}
        ${smCard('venc',     'Vencidos',                 vencidos.length, vencidos.length?'#e05555' : 'var(--tx3)')}
      </div>`;

    const eapTabelasHtml = p1SomenteQuantitativo()
      ? `<div style="padding:16px;text-align:center;color:var(--tx3);font-size:15px;font-family:'DM Mono',monospace;letter-spacing:1px">▸ LISTAGEM NOMINAL RESTRITA</div>`
      : `${filtroEap.html}
        <div id="eap-tbl-feitos"   style="display:none;padding:0 12px 12px">${tblFeitos}</div>
        <div id="eap-tbl-aptos365" style="display:none;padding:0 12px 12px">
          ${aptos365.length ? p1CardGrid(aptos365, infoEapDatas(r => fmtEap(r.data_eap))) : `<div style="padding:14px;color:var(--tx3);font-size:19px;text-align:center">Nenhum apto nos últimos 365 dias</div>`}
        </div>
        <div id="eap-tbl-pend"    style="display:none;padding:0 12px 12px">${tblPend}</div>
        <div id="eap-tbl-inaptaf" style="display:none;padding:0 12px 12px">${tblInapTAF}</div>
        <div id="eap-tbl-inatat"  style="display:none;padding:0 12px 12px">${tblInapTAT}</div>
        <div id="eap-tbl-venc"    style="display:none;padding:0 12px 12px">${tblVenc}</div>`;

    html = wrapDetail(`EAP / TAF / TAT ${anoAtual}`, null, '#c8a84b', closeBtn, eapSmCards + eapTabelasHtml);
  }

  else if (tipo === 'ias') {
    if (!_iasMap) { html = '<div style="color:var(--tx3);padding:16px">Dados IAS não carregados.</div>'; }
    else {
      const fmtV   = s => s ? s.split('-').reverse().join('/') : '—';
      const getMun = opm => { if (!opm) return null; const p = opm.split(' - '); return p.length > 1 ? p[p.length-1].trim() : null; };
      const getCia = opm => {
        if (!opm || typeof CIA_STRUCT === 'undefined') return -1;
        return CIA_STRUCT.findIndex(c => typeof _opmMatch === 'function' && _opmMatch(opm, c.units.flatMap(u => u.keys)));
      };

      const baseList = dataF.map(r => {
        const s = iasStatus(r.re) || 'semreg';
        const rec = _iasMap[iasNormRE(r.re)];
        return { r, s, rec, mun: getMun(r.opm), ciaIdx: getCia(r.opm), posto: r.posto };
      });

      const filtroIas = p1FiltroCMP(baseList, _p1IasDetCia, _p1IasDetMun, _p1IasDetPosto, 'p1IasSetCia', 'p1IasSetMun', 'p1IasSetPosto');
      _p1IasDetCia = filtroIas.cia; _p1IasDetMun = filtroIas.mun; _p1IasDetPosto = filtroIas.posto;

      let filtered = baseList;
      if (_p1IasDetSit)      filtered = filtered.filter(x => x.s === _p1IasDetSit);
      if (_p1IasDetCia >= 0) filtered = filtered.filter(x => x.ciaIdx === _p1IasDetCia);
      if (_p1IasDetMun)      filtered = filtered.filter(x => x.mun === _p1IasDetMun);
      if (_p1IasDetPosto)    filtered = filtered.filter(x => x.posto === _p1IasDetPosto);

      const cntVenc = baseList.filter(x => x.s === 'vencido').length;
      const cntVend = baseList.filter(x => x.s === 'vencendo').length;
      const cntApto = baseList.filter(x => x.s === 'apto').length;
      const cntSemR = baseList.filter(x => x.s === 'semreg').length;

      const anyFilter = _p1IasDetSit !== null || _p1IasDetCia >= 0 || !!_p1IasDetMun || !!_p1IasDetPosto;
      _iasChartData = { filtered, baseList, anyFilter };

      // ── Helpers de botão (só pra Situação, que não faz parte do filtro CIA/Cidade/Graduação) ─
      const btnBase = (lbl, _cnt, cor, on, onclick) =>
        `<button onclick="${onclick}" style="padding:8px 18px;background:${on?cor+'22':'var(--s2)'};border:1px solid ${on?cor:cor+'44'};color:${on?cor:'var(--tx)'};border-radius:6px;cursor:pointer;font-family:'DM Mono',monospace;font-size:15px;font-weight:600;transition:all .15s;white-space:nowrap">${lbl}</button>`;

      const gridRow = (lbl, btns) =>
        `<div style="border-bottom:1px solid var(--bd);padding-bottom:10px;margin-bottom:10px">
          <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--tx3);letter-spacing:1.5px;margin-bottom:8px;text-transform:uppercase">${lbl}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">${btns}</div>
        </div>`;

      const sitBtns = [
        btnBase('VENCIDA',   cntVenc, '#f07878', _p1IasDetSit==='vencido',  "p1IasSetSit('vencido')"),
        btnBase('VENCENDO',  cntVend, '#c8a84b', _p1IasDetSit==='vencendo', "p1IasSetSit('vencendo')"),
        btnBase('APTO',      cntApto, '#4bc87a', _p1IasDetSit==='apto',     "p1IasSetSit('apto')"),
        btnBase('SEM REG.',  cntSemR, '#606880', _p1IasDetSit==='semreg',   "p1IasSetSit('semreg')"),
      ].join('');

      const SIT_COR = { vencido:'#f07878', vencendo:'#c8a84b', apto:'#4bc87a', semreg:'#606880' };
      const SIT_LBL = { vencido:'VENCIDA', vencendo:'VENCENDO', apto:'APTO', semreg:'SEM REG.' };
      const iasRecByRe = {};
      filtered.forEach(({r, s, rec}) => { iasRecByRe[r.re] = { s, rec }; });
      const iasInfo = r => {
        const { s, rec } = iasRecByRe[r.re] || {};
        const cor = SIT_COR[s] || 'var(--tx3)';
        return `<div style="font-size:10px;font-family:'DM Mono',monospace;color:${cor};font-weight:700">${rec?.data_vencimento ? fmtV(rec.data_vencimento) : '—'}</div>
          <span style="padding:1px 6px;border-radius:6px;font-size:10px;background:${cor}22;color:${cor};font-family:'DM Mono',monospace;margin-top:2px;display:inline-block">${SIT_LBL[s]||s||'—'}</span>`;
      };
      const iasClick = r => `openIasPmModal('${String(iasNormRE(r.re)).replace(/'/g,"\\'")}')`;

      const tabelaIasHtml = p1SomenteQuantitativo()
        ? `<div style="padding:16px;text-align:center;color:var(--tx3);font-size:15px;font-family:'DM Mono',monospace;letter-spacing:1px">▸ LISTAGEM NOMINAL RESTRITA — total: ${filtered.length}</div>`
        : !anyFilter
          ? `<div style="padding:20px;text-align:center;color:var(--tx3);font-size:15px;font-family:'DM Mono',monospace;letter-spacing:1px">▸ Selecione um filtro acima para ver a listagem individual</div>`
          : p1CardGrid(filtered.map(({r}) => r), iasInfo, iasClick);

      const iasChartsHtml = `
        <div style="display:grid;grid-template-columns:310px 1fr;gap:16px;padding:0 0 16px;border-bottom:1px solid var(--bd);margin-bottom:12px;align-items:start">
          <div>
            <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--tx3);letter-spacing:1.5px;margin-bottom:8px;text-transform:uppercase">${anyFilter ? 'Situação · filtro ativo' : 'Situação Geral'}</div>
            <div style="position:relative;height:260px"><canvas id="ias-chart-status"></canvas></div>
          </div>
          <div>
            <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--tx3);letter-spacing:1.5px;margin-bottom:8px;text-transform:uppercase">Apto × Vencida por Unidade (total)</div>
            <canvas id="ias-chart-unidade" height="160"></canvas>
          </div>
        </div>`;

      html = wrapDetail(`IAS · Inspeção Anual de Saúde — ${anyFilter ? filtered.length + ' filtrado(s) de ' + baseList.length : baseList.length}`, null, '#5a9de0', closeBtn, `
        ${iasChartsHtml}
        ${gridRow('SITUAÇÃO', sitBtns)}
        ${filtroIas.html}
        ${tabelaIasHtml}`);
    }
  }

  else if (tipo === 'ferias') {
    const getMunFer = opm => { const p = (opm||'').split(' - '); return p.length > 1 ? p[p.length-1].trim() : null; };
    const getCiaFer = opm => (typeof CIA_STRUCT === 'undefined' || !opm) ? -1 : CIA_STRUCT.findIndex(c => typeof _opmMatch === 'function' && _opmMatch(opm, c.units.flatMap(u => u.keys)));
    const pmOfFer = re => p1Data.find(r => r.re === re);

    const afastsF = p1FiltroOpm ? p1Afasts.filter(a => reSetF.has(a.re)) : p1Afasts;
    const em15s   = (() => { const d = new Date(); d.setDate(d.getDate()+15); return d.toISOString().split('T')[0]; })();
    let gozo    = afastsF.filter(a => isFer(a.tipo_afastamento) && a.inicio <= hoje && (!a.termino || a.termino >= hoje));
    let prox    = afastsF.filter(a => isFer(a.tipo_afastamento) && a.inicio > hoje && a.inicio <= em15s);
    const resFer  = new Set(p1Afasts.filter(a => isFer(a.tipo_afastamento) && (a.inicio||'').startsWith(String(anoAtual))).map(a => a.re));
    let semFer  = dataF.filter(r => !resFer.has(r.re));

    const baseFer = dataF.map(r => ({ r, ciaIdx: getCiaFer(r.opm), mun: getMunFer(r.opm), posto: r.posto }));
    const filtroFer = p1FiltroCMP(baseFer, _p1FeriasDetCia, _p1FeriasDetMun, _p1FeriasDetPosto, 'p1FeriasSetCia', 'p1FeriasSetMun', 'p1FeriasSetPosto');
    _p1FeriasDetCia = filtroFer.cia; _p1FeriasDetMun = filtroFer.mun; _p1FeriasDetPosto = filtroFer.posto;

    if (_p1FeriasDetCia >= 0) {
      gozo   = gozo.filter(a => getCiaFer(pmOfFer(a.re)?.opm) === _p1FeriasDetCia);
      prox   = prox.filter(a => getCiaFer(pmOfFer(a.re)?.opm) === _p1FeriasDetCia);
      semFer = semFer.filter(r => getCiaFer(r.opm) === _p1FeriasDetCia);
    }
    if (_p1FeriasDetMun) {
      gozo   = gozo.filter(a => getMunFer(pmOfFer(a.re)?.opm) === _p1FeriasDetMun);
      prox   = prox.filter(a => getMunFer(pmOfFer(a.re)?.opm) === _p1FeriasDetMun);
      semFer = semFer.filter(r => getMunFer(r.opm) === _p1FeriasDetMun);
    }
    if (_p1FeriasDetPosto) {
      gozo   = gozo.filter(a => pmOfFer(a.re)?.posto === _p1FeriasDetPosto);
      prox   = prox.filter(a => pmOfFer(a.re)?.posto === _p1FeriasDetPosto);
      semFer = semFer.filter(r => r.posto === _p1FeriasDetPosto);
    }
    const filtroBarFer = filtroFer.html;

    // Junta o registro de afastamento com o cadastro da pessoa, pra virar card.
    const ferCardData = list => list.map(a => {
      const pm = p1Data.find(r => r.re === a.re);
      return { re: a.re, nome: pm?.nome || a.nome, nome_guerra: pm?.nome_guerra, posto: pm?.posto, opm: pm?.opm || a.opm, _afast: a };
    });
    const ferInfo = showDias => r => {
      const a = r._afast;
      const dias = a.termino ? Math.ceil((new Date(a.termino) - new Date(hoje)) / 86400000) : null;
      return `<div title="${escHtml(r.opm||'')}" style="font-size:10px;color:var(--tx3);font-family:'DM Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${escHtml(r.opm||'—')}</div>
        <div style="font-size:10px;font-family:'DM Mono',monospace;color:${showDias && dias!==null && dias<=3?'#4bc87a':'var(--tx3)'}">${fmtD(a.inicio)} → ${showDias && dias!==null ? dias+'d rest.' : fmtD(a.termino)}</div>`;
    };

    let inner = '';
    if (p1SomenteQuantitativo()) {
      inner = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;padding:14px 12px">
        <div style="background:var(--bg2);border:1px solid var(--bd);border-top:3px solid #5a9de0;border-radius:8px;padding:14px 16px">
          <div style="font-family:'DM Mono',monospace;font-size:15px;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Em Gozo</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:36px;font-weight:800;color:#5a9de0;line-height:1">${gozo.length}</div>
        </div>
        <div style="background:var(--bg2);border:1px solid var(--bd);border-top:3px solid #c8a84b;border-radius:8px;padding:14px 16px">
          <div style="font-family:'DM Mono',monospace;font-size:15px;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Iniciam em 15d</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:36px;font-weight:800;color:#c8a84b;line-height:1">${prox.length}</div>
        </div>
        <div style="background:var(--bg2);border:1px solid var(--bd);border-top:3px solid #e05555;border-radius:8px;padding:14px 16px">
          <div style="font-family:'DM Mono',monospace;font-size:15px;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Sem Férias ${anoAtual}</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:36px;font-weight:800;color:#e05555;line-height:1">${semFer.length}</div>
        </div>
      </div>
      <div style="padding:12px 16px;text-align:center;color:var(--tx3);font-size:15px;font-family:'DM Mono',monospace;letter-spacing:1px">▸ LISTAGEM NOMINAL RESTRITA</div>`;
    } else {
      if (gozo.length) inner += `
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:#5a9de0;letter-spacing:1.5px;padding:12px 14px 6px;text-transform:uppercase">Em Gozo — ${gozo.length}</div>
        <div style="padding:0 12px 12px">${p1CardGrid(ferCardData(gozo), ferInfo(true))}</div>`;
      if (prox.length) inner += `
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:#c8a84b;letter-spacing:1.5px;padding:12px 14px 6px;text-transform:uppercase">Iniciando em 15 dias — ${prox.length}</div>
        <div style="padding:0 12px 12px">${p1CardGrid(ferCardData(prox), ferInfo(false))}</div>`;
      if (semFer.length) {
        inner += `
          <div style="font-family:'DM Mono',monospace;font-size:19px;color:#e05555;letter-spacing:1.5px;padding:12px 14px 6px;text-transform:uppercase">Sem Férias em ${anoAtual} — ${semFer.length}</div>
          <div style="padding:0 12px 12px">${p1CardGrid(semFer)}</div>`;
      }
    }
    html = wrapDetail('Controle de Férias', null, '#5a9de0', closeBtn, filtroBarFer + inner);
  }

  else if (tipo === 'quadro') {
    // 2026-09-04: nenhuma linha do quadro é mais excluída — CFP e UIS
    // Méd/Odonto entram junto com a Sede EM no grupo "EM" (mesmo `opm`
    // nas 4 linhas). Igual ao card do KPI (mesmo escopo nos dois lugares).
    const qRows = p1Quadro;
    // ciaCorByName não acha cor pra "EM" (não tem dígito nem é FT) — mesmo
    // roxo usado no card do KPI, aplicado em todo lugar desta tela que
    // colore por CIA.
    const corDaCia = cia => /^em$/i.test((cia||'').trim()) ? '#9b6de0' : ciaCorByName(cia);

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

    // c = fx - ex.  c>0 = vagas em aberto (verde, "tem folga") · c<0 =
    // efetivo acima do fixado (vermelho, anomalia) · 0 = exato.
    // Mesma convenção de cor do card do KPI "Quadro Fixado".
    const cColor = c => c < 0 ? '#e05555' : c === 0 ? 'var(--tx3)' : '#4bc87a';
    // % com o mesmo formato do card: −N% = vagas em aberto (verde),
    // +N% = efetivo acima do fixado (vermelho). A cor já diz a direção;
    // o sinal reforça e deixa a tabela idêntica ao card.
    const cPct   = (c, fx) => fx > 0
      ? `${c > 0 ? '−' : c < 0 ? '+' : ''}${(Math.abs(c) / fx * 100).toFixed(1)}%`
      : '—';

    // Todas as células de número (cabeçalho E corpo) compartilham o mesmo
    // padding lateral (8px) e text-align:center — assim o rótulo da coluna
    // cai exatamente sobre os números de baixo. border-left em toda coluna
    // de número = uma divisória vertical entre cada coluna.
    const numLR = 'padding-left:8px;padding-right:8px;text-align:center;border-left:1px solid var(--bd2)';
    const thHL = 'padding:8px 14px;border-bottom:1px solid var(--bd2);font-family:"DM Mono",monospace;font-size:19px;letter-spacing:1px;text-transform:uppercase;color:#ffffff;text-align:left;white-space:nowrap';
    const tdc  = `padding-top:7px;padding-bottom:7px;${numLR};border-bottom:1px solid rgba(255,255,255,.04);font-family:"DM Mono",monospace;font-size:19px;white-space:nowrap`;
    const tdcL = 'padding:7px 14px;border-bottom:1px solid rgba(255,255,255,.04);font-size:19px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';

    // Agrupa por CIA inferida
    const byCia = {};
    qRows.forEach(q => {
      const c = getCia(q);
      if (!byCia[c]) byCia[c] = [];
      byCia[c].push(q);
    });
    // Ordem fixa (EM primeiro, depois CIAs — mesma ordem de CIA_STRUCT),
    // igual ao card do KPI. Antes era alfabética, mas "EM" nunca aparecia
    // aqui de qualquer forma (linha excluída); agora que entra, precisa da
    // mesma ordem pra não pular pro fim da lista.
    const ciaOrderIdx = cia => { const i = CIA_STRUCT.findIndex(c => c.label === cia); return i < 0 ? CIA_STRUCT.length : i; };
    const cias = Object.keys(byCia).sort((a,b) => ciaOrderIdx(a) - ciaOrderIdx(b) || a.localeCompare(b));

    // Rankings por CIA — inclui todas as CIAs, mesmo com 0%
    const mkRankByCia = (items) => items.map((r,i) => {
      // dev = magnitude do desvio (sempre positiva, pro texto do %);
      // barPct = mesma coisa mas limitada a 100 (só pra largura da barra,
      // que não pode ultrapassar o container nem ficar negativa).
      const dev = r.fx > 0 ? (Math.abs(r.claro) / r.fx) * 100 : 0;
      const barPct = Math.min(dev, 100);
      const cor = corDaCia(r.cia);
      // Mesma convenção da tabela principal (cColor acima): claro<0 (ex >
      // fixado, estourado) = vermelho; claro>=0 (vaga ou exato) = verde.
      // Antes estava invertido aqui (claro>0 = vermelho), oposto da tabela
      // logo abaixo na mesma tela — mesma métrica com cor contrária em
      // cada lugar.
      const valColor = r.claro < 0 ? '#e05555' : '#4bc87a';
      const bar = `<div style="height:8px;border-radius:2px;background:rgba(255,255,255,.06);overflow:hidden;margin-top:3px"><div style="height:100%;width:${barPct}%;background:${cor};border-radius:2px"></div></div>`;
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div style="flex:1;min-width:0">
          <span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3)">${i+1}. </span>
          <span style="font-size:19px;font-weight:700;color:${cor}">${r.cia}</span>
          ${bar}
        </div>
        <span style="font-family:'DM Mono',monospace;font-size:19px;font-weight:800;color:${valColor};white-space:nowrap">${r.claro > 0 ? r.claro : r.claro < 0 ? `+${Math.abs(r.claro)}` : '—'} <span style="font-size:17px;font-weight:400;color:#ffffff">(${dev.toFixed(0)}%)</span></span>
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
        const dev = r.fx > 0 ? (Math.abs(r.claro) / r.fx) * 100 : 0;
        const barPct = Math.min(dev, 100);
        const cor = corDaCia(r.cia);
        const valColor = r.claro < 0 ? '#e05555' : '#4bc87a';
        const bar = `<div style="height:6px;border-radius:2px;background:rgba(255,255,255,.06);overflow:hidden;margin-top:3px"><div style="height:100%;width:${barPct}%;background:${cor};border-radius:2px"></div></div>`;
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div style="flex:1;min-width:0">
            <span style="font-family:'DM Mono',monospace;font-size:17px;color:var(--tx3)">${i+1}. </span>
            <span style="font-size:17px;font-weight:700;color:#ffffff">${r.mun}</span>
            <span style="font-size:15px;color:${cor};margin-left:5px">${r.cia}</span>
            ${bar}
          </div>
          <span style="font-family:'DM Mono',monospace;font-size:17px;font-weight:800;color:${valColor};white-space:nowrap">${r.claro>0?r.claro:r.claro<0?`+${Math.abs(r.claro)}`:'—'} <span style="font-size:15px;font-weight:400;color:#ffffff">(${dev.toFixed(0)}%)</span></span>
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

    // EX (efetivo existente, base em branco) · % (desvio sobre o fixado,
    // verde = vaga / vermelho = acima) — por grupo de posto. As colunas
    // "Fix" e "Claro" (nº absoluto) saíram: o % sozinho já resume, e o
    // fixado inteiro vive na tela do card / no upload do Quadro de Claros.
    // Um par EX + % por grupo de posto. A divisória vertical entre colunas
    // já vem do border-left embutido em `tdc`; `grp` (só no 2º par de cada
    // linha) engrossa essa borda pra marcar a divisão entre os dois grupos,
    // alinhada com o `grpDiv` do cabeçalho.
    const grpDiv = ';border-left:2px solid var(--bd2)';
    const nPair = (fx, ex, c, grp) => `
      <td style="${tdc}${grp ? grpDiv : ''};color:#ffffff;font-weight:700">${ex}</td>
      <td style="${tdc};font-weight:800;color:${cColor(c)}">${cPct(c,fx)}</td>`;

    cias.forEach(cia => {
      const rows = byCia[cia];
      const ciaCor = corDaCia(cia);
      bodyQ += `<tr><td colspan="5" style="padding:9px 16px 5px;background:${ciaCor}12;border-top:1px solid ${ciaCor}44;border-bottom:1px solid ${ciaCor}28;font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:${ciaCor};text-transform:uppercase;font-weight:700">${cia}</td></tr>`;
      let cFxSub=0, cExSub=0, cCSub=0, cFxCb=0, cExCb=0, cCCb=0;
      rows.forEach(q => {
        const fxSub = Number(q.fx_subten_sgt)||0, exSub = Number(q.ex_subten_sgt)||0;
        const fxCb  = Number(q.fx_cb_sd)||0,      exCb  = Number(q.ex_cb_sd)||0;
        const cS = fxSub - exSub, cC = fxCb - exCb;
        cFxSub+=fxSub; cExSub+=exSub; cCSub+=cS; cFxCb+=fxCb; cExCb+=exCb; cCCb+=cC;
        bodyQ += `<tr>
          <td title="${q.municipio||''}" style="${tdcL}">${q.municipio||'—'}</td>
          ${nPair(fxSub, exSub, cS)}
          ${nPair(fxCb, exCb, cC, true)}
        </tr>`;
      });
      bodyQ += `<tr style="background:rgba(255,255,255,.03);border-top:1px solid rgba(255,255,255,.07)">
        <td style="${tdcL};color:${ciaCor};font-size:19px;letter-spacing:.5px">Subtotal ${cia}</td>
        ${nPair(cFxSub, cExSub, cCSub)}
        ${nPair(cFxCb, cExCb, cCCb, true)}
      </tr>`;
      gtFxSub+=cFxSub; gtCSub+=cCSub; gtFxCb+=cFxCb; gtCCb+=cCCb;
    });

    // Total geral — St/Sgt e Cb/Sd totalmente separados, sem somar entre si
    if (qRows.length) {
      const gtExSub = qRows.reduce((a,q)=>a+(Number(q.ex_subten_sgt)||0),0);
      const gtExCb  = qRows.reduce((a,q)=>a+(Number(q.ex_cb_sd)||0),0);
      bodyQ += `<tr style="border-top:2px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05)">
        <td style="${tdcL};text-transform:uppercase;font-size:19px;letter-spacing:1px;color:var(--tx2)">Total Geral</td>
        ${nPair(gtFxSub, gtExSub, gtCSub)}
        ${nPair(gtFxCb, gtExCb, gtCCb, true)}
      </tr>`;
    }

    // Cabeçalho em 2 níveis: grupo "Subten/Sgt" e "Cb/Sd" (nível 1, sobre
    // as 2 colunas do posto) e "EX / %" (nível 2, uma sobre cada coluna).
    // thGrp/thSub usam o MESMO `numLR` das células de número, então cada
    // rótulo fica alinhado com a coluna que ele nomeia. O `grpDiv` (borda
    // de 2px) marca a divisão entre os dois grupos, igual no corpo.
    const thGrp  = `padding-top:6px;padding-bottom:4px;${numLR};font-family:"DM Mono",monospace;font-size:15px;letter-spacing:1px;text-transform:uppercase;color:var(--tx3);white-space:nowrap`;
    const thSub  = `padding-top:4px;padding-bottom:8px;${numLR};border-bottom:1px solid var(--bd2);font-family:"DM Mono",monospace;font-size:16px;letter-spacing:.5px;text-transform:uppercase;color:#ffffff;white-space:nowrap`;
    const tableHdr = `<table style="width:100%;border-collapse:collapse;table-layout:fixed">
      <colgroup>
        <col style="width:32%">
        <col style="width:17%"><col style="width:17%">
        <col style="width:17%"><col style="width:17%">
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2" style="${thHL};vertical-align:bottom;padding-bottom:8px">Município</th>
          <th colspan="2" style="${thGrp}">Subten / Sgt</th>
          <th colspan="2" style="${thGrp}${grpDiv}">Cb / Sd</th>
        </tr>
        <tr>
          <th style="${thSub}">EX</th><th style="${thSub}">%</th>
          <th style="${thSub}${grpDiv}">EX</th><th style="${thSub}">%</th>
        </tr>
      </thead>
      <tbody>${bodyQ || '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--tx3);font-size:19px">Nenhum dado. Importe o CSV pelo menu lateral.</td></tr>'}</tbody>
    </table>`;

    html = wrapDetail('Quadro Fixado do Efetivo', null, '#4bc87a', closeBtn, rankHtml + tableHdr);
  }

  document.getElementById('p1d-body').innerHTML = html;
  if (tipo === 'ias' && _iasChartData) requestAnimationFrame(() => _renderIasCharts(_iasChartData));
  mo.classList.add('on');
  document.body.style.overflow = 'hidden';
}

function _renderIasCharts({ filtered, baseList }) {
  const cDonut = document.getElementById('ias-chart-status');
  if (cDonut) {
    const existing = typeof Chart !== 'undefined' && Chart.getChart ? Chart.getChart(cDonut) : null;
    if (existing) existing.destroy();
    const src = filtered;
    const dVenc = src.filter(x => x.s === 'vencido').length;
    const dVend = src.filter(x => x.s === 'vencendo').length;
    const dApto = src.filter(x => x.s === 'apto').length;
    const dSemR = src.filter(x => x.s === 'semreg').length;
    const total = dVenc + dVend + dApto + dSemR;
    new Chart(cDonut.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Vencida', 'Vencendo', 'Apto', 'Sem Reg.'],
        datasets: [{ data: [dVenc, dVend, dApto, dSemR], backgroundColor: ['#f07878','#c8a84b','#4bc87a','#60688099'], borderWidth: 0 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,.7)', font: { size: 12 }, padding: 10, boxWidth: 14 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} (${total ? Math.round(ctx.parsed/total*100) : 0}%)` } }
        },
        cutout: '52%'
      }
    });
  }

  const cBar = document.getElementById('ias-chart-unidade');
  if (cBar && typeof CIA_STRUCT !== 'undefined') {
    const existing = typeof Chart !== 'undefined' && Chart.getChart ? Chart.getChart(cBar) : null;
    if (existing) existing.destroy();
    const labels   = CIA_STRUCT.map(c => c.label);
    const aptoData = CIA_STRUCT.map((_, i) => baseList.filter(x => x.ciaIdx === i && x.s === 'apto').length);
    const vencData = CIA_STRUCT.map((_, i) => baseList.filter(x => x.ciaIdx === i && x.s === 'vencido').length);
    const vendData = CIA_STRUCT.map((_, i) => baseList.filter(x => x.ciaIdx === i && x.s === 'vencendo').length);
    new Chart(cBar.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Apto',     data: aptoData, backgroundColor: '#4bc87a55', borderColor: '#4bc87a', borderWidth: 1 },
          { label: 'Vencendo', data: vendData, backgroundColor: '#c8a84b55', borderColor: '#c8a84b', borderWidth: 1 },
          { label: 'Vencida',  data: vencData, backgroundColor: '#f0787855', borderColor: '#f07878', borderWidth: 1 },
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: 'rgba(255,255,255,.7)', font: { size: 11 }, boxWidth: 12 } } },
        scales: {
          x: { ticks: { color: 'rgba(255,255,255,.6)', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.06)' } },
          y: { ticks: { color: 'rgba(255,255,255,.6)', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.06)' }, beginAtZero: true }
        }
      }
    });
  }
}

// ── Filtro OPM e Busca P1 ────────────────────────────────────────────────────

function p1SetFiltroOpm(opm) {
  p1FiltroOpm = opm;
  renderP1();
}

let p1SearchIdx = -1; // índice selecionado no dropdown

function p1SearchInput(val) {
  if (p1SomenteQuantitativo()) return;
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
    return `<div data-re="${escHtml(r.re)}" data-i="${i}"
      onmousedown="p1SearchSelect('${(r.re||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')"
      onmouseover="p1SearchHover(${i})"
      style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);transition:background .1s"
      id="p1-sdrop-${i}">
      <div data-foto-re="${escHtml(r.re)}" data-nome="${escHtml(nomePrinc)}" data-posto="${escHtml(r.posto || '')}" data-size="32" style="flex-shrink:0">${p1Fotos[r.re] ? `<img src="${p1Fotos[r.re]}" style="width:32px;height:${p1AvatarH(32)}px;border-radius:7px;object-fit:cover;border:1.5px solid rgba(255,255,255,.18)">` : p1AvatarSVG(nomePrinc, r.posto)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:19px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${hi(nomePrinc)}</div>
        <div style="font-size:19px;color:var(--tx3)">${hi(r.nome || '')} · ${escHtml(r.posto || '—')} · ${escHtml(r.opm || '—')}</div>
      </div>
      <div style="font-size:19px;font-family:'DM Mono',monospace;padding:3px 9px;border-radius:10px;background:${statusColor}22;color:${statusColor};white-space:nowrap">${statusTxt}</div>
    </div>`;
  }).join('');

  drop.style.display = 'block';
  p1LoadFotosVisiveis();
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
  if (p1SomenteQuantitativo()) return;
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
  document.getElementById('pronto-nascimento').textContent = fmtD(pm.data_nascimento);
  document.getElementById('pronto-ingresso').textContent   = fmtD(pm.data_ingresso);

  // Status
  const afsts    = p1AfastHoje[re] || [];
  const emRestrEfetivo = (pm.possui_restricao || '').toLowerCase().startsWith('s');
  const emRestrUis     = hasUisRestr(re);
  const emRestr        = emRestrEfetivo || emRestrUis;
  let statusHtml = '';
  if (afsts.length) {
    statusHtml = afsts.map(a =>
      `<span style="padding:4px 12px;border-radius:20px;background:#e0555522;color:#e05555;font-size:19px;font-family:'DM Mono',monospace">${escHtml(a.tipo_afastamento)}</span>`
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
  // Só mostra as siglas na tela — a descrição completa de cada código
  // aparece num tooltip CSS próprio no hover (.restr-tt), por pedido do
  // usuário. title nativo do navegador tem ~1s de delay e passa despercebido.
  const restrTip = (cods) => {
    const linhas = cods.map(c => { const inf = typeof UIS_CODIGOS!=='undefined' && UIS_CODIGOS[c]; return escHtml(inf ? `${c} – ${inf.desc}` : c); });
    return `<div class="restr-tt">${linhas.join('<br>')}</div>`;
  };

  // Junta efetivo_pm (restrição "ativa" da IAS/WSSCPM) com uis_restricoes
  // (histórico manual+sgp) numa lista só, deduplicada por código+período —
  // as duas fontes descrevem com frequência a MESMA restrição (a sincronização
  // de IAS grava nos dois lugares), o que sem dedup mostrava a mesma linha
  // repetida 2-3x no card.
  const uisRecsRaw = emRestrUis ? ((_uisRestMap||{})[uisNormRE(re)]||[]) : [];
  const itensRestr = [];
  const vistos = new Set();
  if (emRestrEfetivo) {
    const rawRestr = pm.tipos_restricao || 'Sim';
    const key = `${rawRestr}|${pm.restricao_inicio}|${pm.restricao_termino}`;
    vistos.add(key);
    itensRestr.push({ cods: rawRestr.split(/[,;]/).map(c => c.trim()).filter(Boolean), raw: rawRestr, inicio: pm.restricao_inicio, termino: pm.restricao_termino, fonte: 'efetivo' });
  }
  uisRecsRaw.forEach(u => {
    const key = `${u.codigos}|${u.inicio}|${u.termino}`;
    if (vistos.has(key)) return; // já mostrado pelo bloco do efetivo_pm acima
    vistos.add(key);
    itensRestr.push({ cods: (u.codigos||'').split(/[,;]/).map(c => c.trim()).filter(Boolean), raw: u.codigos, inicio: u.inicio, termino: u.termino, fonte: 'uis' });
  });

  let restrHtml = itensRestr.map((item, i) => {
    const todosCodUis = item.cods.length > 0 && typeof UIS_CODIGOS !== 'undefined' && item.cods.every(c => UIS_CODIGOS[c]);
    const siglas = todosCodUis ? item.cods.join(', ') : (item.raw || '—');
    const prefixo = item.fonte === 'uis' ? '🏥 ' : '';
    const cor = item.fonte === 'uis' ? '#5a9de0' : '#c8a84b';
    const conteudo = todosCodUis
      ? `<span class="restr-tt-wrap">${prefixo}${escHtml(siglas)}${restrTip(item.cods)}</span>`
      : `${prefixo}${escHtml(siglas)}`;
    return `<div style="font-size:19px;color:${cor};margin-top:${i ? '6px' : '0'}">${conteudo}</div>
            <div style="font-size:19px;color:var(--tx3)">${fmtD(item.inicio)} → ${fmtD(item.termino)}</div>`;
  }).join('');

  if (emRestrUis) {
    const uisRecs = uisRecsRaw;
    // Resumo: tipo de emprego permitido
    if (typeof uisExtrairCodigos === 'function' && typeof uisGrupoMaisRestritivo === 'function') {
      const allCods = [...new Set(uisRecs.flatMap(u => uisExtrairCodigos(u.codigos)))];
      const grupo = uisGrupoMaisRestritivo(allCods);
      const gInfo = grupo && typeof UIS_GRUPOS !== 'undefined' ? UIS_GRUPOS[grupo] : null;
      if (gInfo) {
        restrHtml += `<div style="margin-top:10px;padding:8px 12px;border-radius:6px;background:${gInfo.bg};border:1px solid ${gInfo.cor}44">
          <div style="font-size:17px;color:var(--tx3);margin-bottom:2px">Tipo de emprego permitido (BG PM 166/2006, item ${gInfo.item})</div>
          <div style="font-size:19px;font-weight:700;color:${gInfo.cor}">${gInfo.label}</div>
        </div>`;
      }
    }
  }
  document.getElementById('pronto-restr').innerHTML = restrHtml || `<span style="font-size:19px;color:var(--tx3)">—</span>`;

  // IAS (Inspeção Anual de Saúde) — vem da sincronização via SGP-DP (agente-sgp).
  // _iasMap/iasStatus/iasNormRE são globais definidos em uis.js.
  const iasEl = document.getElementById('pronto-ias');
  if (iasEl) {
    const iasRec = (typeof _iasMap === 'object' && _iasMap) ? _iasMap[iasNormRE(re)] : null;
    if (!iasRec) {
      iasEl.innerHTML = `<span style="font-size:19px;color:var(--tx3)">Sem registro</span>`;
    } else {
      const iasSt = typeof iasStatus === 'function' ? iasStatus(re) : null;
      const IAS_COR = { apto: '#4bc87a', vencendo: '#c8a84b', vencido: '#e05555' };
      const IAS_LBL = { apto: 'Apto', vencendo: 'Vencendo', vencido: 'Vencida' };
      const cor = IAS_COR[iasSt] || 'var(--tx3)';
      iasEl.innerHTML =
        `<span style="color:${cor};font-weight:600">${IAS_LBL[iasSt] || '—'}</span>` +
        `<div style="font-size:19px;color:var(--tx3);margin-top:2px">Médico ${fmtD(iasRec.data_medico)} · Dentista ${fmtD(iasRec.data_dentista)}</div>` +
        `<div style="font-size:19px;color:var(--tx3)">Vence em ${fmtD(iasRec.data_vencimento)}</div>`;
    }
  }

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
    return `${nota ? `<div style="font-size:19px;font-weight:600;color:${cor}">${escHtml(nota)}</div>` : ''}
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
  // Controles de upload (somente p1/admin ou secoes_acesso.p1=editor)
  const u = JSON.parse(localStorage.getItem('auth_user') || '{}');
  const canEdit = ['admin','p1','ti'].includes(u.role) || (u.secoes_acesso || {}).p1 === 'editor';
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

  // Extrato cronológico — carrega tudo e popula os filtros de ano/tipo
  prontoExtratoFull = p1Afasts.filter(a => a.re === re && !p1EhSupervisao(a)).sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
  prontoPopulaFiltrosExtrato();
  prontoRenderExtrato();

  // Cursos institucionais e externos (SGP-DP)
  const cursosEl = document.getElementById('pronto-cursos');
  const origemSel = document.getElementById('pronto-cursos-origem');
  if (origemSel) origemSel.value = '';
  if (cursosEl) {
    cursosEl.innerHTML = '<tr><td colspan="6" style="padding:10px;color:var(--tx3);font-size:19px;text-align:center">Carregando...</td></tr>';
    authFetch(`${API}/pm/${encodeURIComponent(re)}/cursos`).then(r => r.json()).then(cursosData => {
      prontoCursosFull = Array.isArray(cursosData) ? cursosData : [];
      prontoRenderCursos();
    }).catch(() => {
      prontoCursosFull = [];
      cursosEl.innerHTML = '<tr><td colspan="6" style="padding:12px 10px;color:var(--tx3);font-size:19px;text-align:center">—</td></tr>';
    });
  }

  // Láureas do Mérito Pessoal (SGP-DP)
  const laureasEl = document.getElementById('pronto-laureas');
  if (laureasEl) {
    laureasEl.innerHTML = '<tr><td colspan="5" style="padding:10px;color:var(--tx3);font-size:19px;text-align:center">Carregando...</td></tr>';
    authFetch(`${API}/pm/${encodeURIComponent(re)}/laureas`).then(r => r.json()).then(laureasData => {
      prontoLaureasFull = Array.isArray(laureasData) ? laureasData : [];
      prontoRenderLaureas();
    }).catch(() => {
      prontoLaureasFull = [];
      laureasEl.innerHTML = '<tr><td colspan="5" style="padding:12px 10px;color:var(--tx3);font-size:19px;text-align:center">—</td></tr>';
    });
  }
}

// Redesenha a tabela de láureas do PM aberto (sem filtro, é uma lista curta por pessoa).
// "LÁUREA DO MÉRITO PESSOAL EM 5º GRAU" vira badge "5º GRAU" numa coluna própria +
// texto base encurtado ("Mérito Pessoal") — evita repetir a frase inteira em toda
// linha, só o grau muda de uma pra outra. Cai pro texto cru se não reconhecer o padrão.
function prontoRenderLaureas() {
  const laureasEl = document.getElementById('pronto-laureas');
  if (!laureasEl) return;
  const fmtDl = s => { if (!s || parseInt(String(s).slice(0,4),10) < 1900) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
  const tdL = 'padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.04);font-family:\'DM Mono\',monospace;font-size:19px;color:var(--tx3)';
  // Cores seguem o material real de cada grau da Láurea do Mérito Pessoal da
  // PMESP (do mais alto pro mais baixo): 1º Esmalte, 2º Ouro, 3º Prata,
  // 4º Cromo, 5º Bronze — não é uma escala arbitrária de cor por número.
  const GRAU_COR = { '1':'#f2e6c9','2':'#d4af37','3':'#d0d4dc','4':'#a8b4c0','5':'#b87333' };
  // Cor do "couro" (fundo da placa) atrás da medalha, também real: esmalte
  // (1º) vem em couro branco/pérola, ouro e prata (2º/3º) em couro vermelho,
  // cromo e bronze (4º/5º) em couro preto — vira a borda do badge, a cor da
  // medalha (GRAU_COR acima) continua sendo o fundo/texto.
  const GRAU_COURO = { '1':'#d8d0b8','2':'#8a2f2f','3':'#8a2f2f','4':'#4a4540','5':'#4a4540' };
  const parseGrau = desc => {
    const m = /(\d+)\s*º?\s*grau/i.exec(desc || '');
    if (!m) return { grau: null, base: desc || '—' };
    const base = desc.slice(0, m.index).replace(/\bem\s*$/i, '').trim();
    return { grau: m[1], base: base || 'Mérito Pessoal' };
  };

  laureasEl.innerHTML = prontoLaureasFull.length
    ? prontoLaureasFull.map(l => {
        const { grau, base } = parseGrau(l.descricao_medalha);
        const cor = GRAU_COR[grau] || '#9db0d8';
        const couro = GRAU_COURO[grau] || 'var(--bd)';
        return `<tr>
          <td style="${tdL};white-space:nowrap">${fmtDl(l.concessao)}</td>
          <td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.04);font-size:19px;font-weight:600;color:var(--tx)">${escHtml(base)}</td>
          <td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.04)">${grau ? `<span style="font-size:16px;padding:1px 7px;border-radius:8px;background:${cor}22;color:${cor};border:1px solid ${couro};white-space:nowrap">${grau}º GRAU</span>` : '—'}</td>
          <td style="${tdL}">${escHtml(l.boletim||'—')}</td>
          <td style="${tdL}">${escHtml(l.opm_concessao_descricao||'—')}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="5" style="padding:12px 10px;color:var(--tx3);font-size:19px;text-align:center">Nenhuma láurea encontrada.</td></tr>';
}

// Filtra prontoCursosFull pelo select de origem (interno/externo) e redesenha a tabela.
function prontoRenderCursos() {
  const cursosEl = document.getElementById('pronto-cursos');
  if (!cursosEl) return;
  const origem = document.getElementById('pronto-cursos-origem')?.value || '';
  const rows = prontoCursosFull.filter(c => !origem || c.origem === origem);

  // Datas com ano abaixo de 1900 não são reais (sentinela "sem data" de
  // sistemas de origem, ex: 1753-01-01 do SQL Server do SGP-DP) — mostra
  // traço em vez do valor.
  const fmtDc = s => { if (!s || parseInt(String(s).slice(0,4),10) < 1900) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
  const tdC = 'padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.04);font-family:\'DM Mono\',monospace;font-size:19px;color:var(--tx3)';
  const tipoCor   = c => c.origem === 'externo' ? '#e8c96a' : c.origem === 'manual' ? '#607090' : '#5ae09a';
  const tipoLabel = c => c.origem === 'externo' ? 'Externo' : c.origem === 'manual' ? 'Interno Ofício' : 'Interno SGP';
  const detalhe = c => c.origem === 'externo'
    ? ([c.instituicao, c.carga_horaria ? `${c.carga_horaria}h` : null].filter(Boolean).join(' · ') || '—')
    : (c.conceito || c.boletim_curso || '—');
  const nota = c => c.nota || '—';

  cursosEl.innerHTML = rows.length
    ? rows.map(c => `<tr>
        <td style="${tdC};white-space:nowrap">${fmtDc(c.data)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.04);font-size:19px;font-weight:600;color:var(--tx)">${escHtml(c.nome_curso||'—')}</td>
        <td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.04)"><span style="font-size:16px;padding:1px 7px;border-radius:8px;background:${tipoCor(c)}22;color:${tipoCor(c)};white-space:nowrap">${tipoLabel(c)}</span></td>
        <td style="${tdC}">${escHtml(nota(c))}</td>
        <td style="${tdC}">${escHtml(detalhe(c))}</td>
        <td style="${tdC}">${escHtml(c.posto_pm||'—')}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" style="padding:12px 10px;color:var(--tx3);font-size:19px;text-align:center">Nenhum curso encontrado com esse filtro.</td></tr>';
}

// Monta as opções dos selects de ano e tipo com base no que existe
// no extrato dessa pessoa (não mostra opção de ano/tipo que ela nunca teve).
function prontoPopulaFiltrosExtrato() {
  const anoSel  = document.getElementById('pronto-extrato-ano');
  const tipoSel = document.getElementById('pronto-extrato-tipo');
  if (!anoSel || !tipoSel) return;

  // Ano atual sempre existe como opção (mesmo sem nenhum afastamento nele
  // ainda) — o filtro abre nele por padrão, pedido explícito do usuário,
  // em vez de "Todos os anos" (que misturava anos antigos de cara).
  const anoAtual = String(new Date().getFullYear());
  const anosSet = new Set(prontoExtratoFull.map(a => (a.inicio || '').slice(0, 4)).filter(Boolean));
  anosSet.add(anoAtual);
  const anos = [...anosSet].sort((a,b) => b - a);
  anoSel.innerHTML = '<option value="">Todos os anos</option>' + anos.map(a => `<option value="${a}">${a}</option>`).join('');

  const tipos = [...new Set(prontoExtratoFull.map(a => p1CatTipo(a.tipo_afastamento)))].sort();
  tipoSel.innerHTML = '<option value="">Todos os tipos</option>' + tipos.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('');

  anoSel.value = anoAtual; tipoSel.value = '';
}

// Filtra prontoExtratoFull pelos selects de ano/tipo e redesenha a tabela.
function prontoRenderExtrato() {
  const tbody = document.getElementById('pronto-extrato');
  if (!tbody) return;
  const ano  = document.getElementById('pronto-extrato-ano')?.value || '';
  const tipo = document.getElementById('pronto-extrato-tipo')?.value || '';
  const hoje = new Date().toISOString().split('T')[0];
  const fmtD = s => { if (!s) return '—'; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };

  const extrato = prontoExtratoFull.filter(a =>
    (!ano  || (a.inicio || '').startsWith(ano)) &&
    (!tipo || p1CatTipo(a.tipo_afastamento) === tipo)
  );

  tbody.innerHTML = extrato.length
    ? extrato.map(a => {
        const ativo = a.inicio <= hoje && (!a.termino || a.termino >= hoje);
        const tdE = 'padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.04);font-family:\'DM Mono\',monospace;font-size:19px;color:var(--tx3)';
        return `<tr>
          <td style="${tdE};font-size:19px;color:${ativo?'var(--tx)':'var(--tx3)'};font-family:inherit">${escHtml(p1TipoLabel(a.tipo_afastamento))}</td>
          <td style="${tdE}">${fmtD(a.inicio)}</td>
          <td style="${tdE}">${fmtD(a.termino)}</td>
          <td style="${tdE}">${a.n_dias ? a.n_dias + 'd' : '—'}</td>
          <td style="padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.04)">${ativo ? '<span style="font-size:19px;padding:2px 8px;border-radius:8px;background:#e0555522;color:#e05555;font-family:DM Mono,monospace">ATIVO</span>' : ''}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="5" style="padding:14px 10px;color:var(--tx3);font-size:19px;text-align:center">Nenhum afastamento encontrado com esse filtro.</td></tr>';
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
        <td style="padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.03);font-size:19px;color:var(--tx)">${escHtml(opm)}</td>
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
// "size" é a LARGURA — a altura é derivada por uma proporção fixa (3x4,
// igual à foto do assentamento) em vez de quadrado achatado.
const P1_AVATAR_RATIO = 1.3;
function p1AvatarH(size) { return Math.round(size * P1_AVATAR_RATIO); }

function p1AvatarSVG(nome, posto, size = 32) {
  const cat = p1Cat(posto);
  const colors = { cbsd: '#5a9de0', sgt: '#c8a84b', sub: '#4bc87a', of: '#e05555' };
  const bg = colors[cat] || '#607090';
  const initials = escHtml((nome || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join(''));
  const h = p1AvatarH(32);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${p1AvatarH(size)}" viewBox="0 0 32 ${h}">
    <rect x="1" y="1" width="30" height="${h-2}" rx="7" fill="${bg}33" stroke="${bg}" stroke-width="1"/>
    <text x="16" y="${Math.round(h/2)+5}" text-anchor="middle" fill="${bg}" font-family="DM Mono,monospace" font-size="14" font-weight="600">${initials}</text>
  </svg>`;
}

// Atualiza um elemento avatar com foto real ou SVG de initials.
// Tamanho vem do atributo data-size do elemento (cada tela define o seu).
function renderAvatarEl(el, re, foto) {
  if (!el) return;
  const size = Number(el.dataset.size) || 32;
  if (foto) {
    el.innerHTML = `<img src="${foto}" style="width:${size}px;height:${p1AvatarH(size)}px;border-radius:7px;object-fit:cover;border:1.5px solid rgba(255,255,255,.18)">`;
  } else {
    el.innerHTML = p1AvatarSVG(el.dataset.nome || '', el.dataset.posto || '', size);
  }
}

// ═══════════════════════════════════════════════════════════════
// CARREGAMENTO AUTOMÁTICO DE FOTOS NAS MINIATURAS
// Busca em lote só as fotos de quem está de fato visível na tela
// (respeitando os filtros de CIA/EM/FT/etc já aplicados), em vez de
// carregar todo o efetivo de uma vez ou exigir clique em cada PM.
// ═══════════════════════════════════════════════════════════════
let p1FotoObserver = null;
let p1FotoDebounce = null;

function p1LoadFotosVisiveis() {
  const els = document.querySelectorAll('[data-foto-re]');
  const pendentes = new Set();
  els.forEach(el => {
    const re = el.dataset.fotoRe;
    if (re && !(re in p1Fotos)) pendentes.add(re);
  });
  if (!pendentes.size) return;

  authFetch(`${API}/p1/fotos/lote`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ res: [...pendentes] })
  }).then(r => r.json()).then(mapa => {
    pendentes.forEach(re => { p1Fotos[re] = mapa[re] || null; });
    document.querySelectorAll('[data-foto-re]').forEach(el => {
      const re = el.dataset.fotoRe;
      if (re in p1Fotos) renderAvatarEl(el, re, p1Fotos[re]);
    });
  }).catch(() => {});
}

// Observa qualquer mudança nas listas do P1 e recarrega fotos automaticamente
// (troca de filtro, novo upload, etc.) — dispara uma única vez por rajada de mudanças.
function p1SetupFotoObserver() {
  if (p1FotoObserver) return;
  p1FotoObserver = new MutationObserver(() => {
    clearTimeout(p1FotoDebounce);
    p1FotoDebounce = setTimeout(p1LoadFotosVisiveis, 150);
  });
  p1FotoObserver.observe(document.body, { childList: true, subtree: true });
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
  const canEdit = ['admin', 'p1', 'ti'].includes(u.role) || (u.secoes_acesso || {}).p1 === 'editor';
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
  pms = p1OrdenarPorAntiguidade(pms);
  const escA = s => (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");

  const cards = pms.map(r => {
    const afst        = p1AfastHoje[r.re];
    const statusColor = afst ? '#e05555' : '#4bc87a';
    const statusTxt   = afst ? (afst[0]?.tipo_afastamento || 'AFASTADO') : 'APTO';
    const _re         = escA(r.re || '');
    const fotoCached  = p1Fotos[r.re];
    const avatarContent = fotoCached
      ? `<img src="${fotoCached}" style="width:72px;height:${p1AvatarH(72)}px;border-radius:9px;object-fit:cover;border:2px solid rgba(255,255,255,.18)">`
      : p1AvatarSVG(r.nome_guerra || r.nome, r.posto, 72);
    return `<div onclick="openProntuario('${_re}')" style="background:rgba(255,255,255,.025);border:1px solid var(--bd);border-radius:8px;padding:12px 10px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;transition:border-color .15s;text-align:center" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--bd)'">
      <div data-foto-re="${escHtml(r.re)}" data-nome="${escHtml(r.nome_guerra||r.nome)}" data-posto="${escHtml(r.posto||'')}" data-size="72">${avatarContent}</div>
      <div style="font-size:13px;color:var(--tx3);font-family:'DM Mono',monospace;margin-top:4px;white-space:nowrap;letter-spacing:.5px">${escHtml(r.posto || '—')}</div>
      <div style="font-size:13px;color:var(--tx3);font-family:'DM Mono',monospace;white-space:nowrap;letter-spacing:.5px">RE ${escHtml(r.re)}</div>
      <div style="font-size:16px;font-weight:700;color:var(--tx);line-height:1.3;word-break:break-word;max-width:100%">${escHtml(r.nome_guerra || r.nome)}</div>
      <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px;margin-top:2px">
        <div style="font-size:11px;padding:2px 8px;border-radius:10px;background:${statusColor}22;color:${statusColor};font-family:'DM Mono',monospace;white-space:nowrap">${statusTxt}</div>
        ${uisBadge(r.re)}${iasBadge(r.re)}
      </div>
    </div>`;
  }).join('');

  const quadroHtml = quadroForUnit(label);

  det.innerHTML = `<div id="p1-unit-panel" style="margin-top:14px;background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:16px 18px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-family:'DM Mono',monospace;font-size:19px;letter-spacing:2px;color:var(--gold);text-transform:uppercase">${escHtml(label)} — ${pms.length} militares</div>
      <button onclick="p1CloseUnit()" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:var(--tx3);border-radius:4px;padding:3px 10px;cursor:pointer;font-size:19px">✕ Fechar</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">${cards}</div>
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
      if (!p1EhRestricao(a) && !p1EhSupervisao(a) && a.inicio <= today && (!a.termino || a.termino >= today)) {
        if (!afH[a.re]) afH[a.re] = [];
        afH[a.re].push(a);
      }
    });
    const getPms  = keys => p1Data.filter(r => _opmMatch(r.opm, keys));
    const stOf    = pms  => {
      const total = pms.length, afst = pms.filter(r => afH[r.re]).length;
      const restr = pms.filter(p1RestrRua).length;
      const pct   = total ? Math.round((total - afst) / total * 100) : 0;
      const color = pct >= 80 ? '#4bc87a' : pct >= 60 ? '#c8a84b' : '#e8b840';
      return { total, afst, restr, aptos: total - afst, pct, color };
    };
    const gs = stOf(p1Data);

    // Restrições vencendo em 30 dias — único alerta mantido nesse card (os
    // outros — EAP pendente, férias, afastamento líder — foram removidos por
    // pedido do usuário, deixavam o card carregado de informação secundária).
    const em30s = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
    const restrVenc = p1Data.filter(r =>
      (r.possui_restricao||'').toLowerCase().startsWith('s') &&
      r.restricao_termino && r.restricao_termino >= today && r.restricao_termino <= em30s
    ).length;
    const alertas = [];
    if (restrVenc > 0) alertas.push(`<span style="color:#c8a84b">⚠ ${restrVenc} restr. vencem</span>`);

    const allCiaKeys = CIA_STRUCT.flatMap(c => c.units.flatMap(u => u.keys));
    const unmatchedOpms = [...new Set(p1Data.map(r => r.opm).filter(o => o && !_opmMatch(o, allCiaKeys)))];

    // 4 colunas iguais: rótulo da CIA + PMs / afastados / em restrição.
    // Tudo alinhado à esquerda pra os números formarem colunas limpas
    // (a barra + % de "disponível" saiu daqui por pedido do usuário).
    const makeRow = (label, color, pms) => {
      if (!pms.length) return '';
      const s = stOf(pms);
      const cell = (txt, col) => `<span style="color:${col}">${txt}</span>`;
      return `<div style="display:grid;grid-template-columns:repeat(4,1fr);align-items:baseline;gap:6px;margin-bottom:6px;font-family:'DM Mono',monospace;font-size:19px">
        <span style="color:${color};font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(label)}</span>
        ${cell(`${s.total} PM${s.total !== 1 ? 's' : ''}`, 'var(--tx2)')}
        ${cell(s.afst > 0 ? `${s.afst} afst` : '—', s.afst > 0 ? '#e05555' : 'var(--bd2)')}
        ${cell(s.restr > 0 ? `${s.restr} restr` : '—', s.restr > 0 ? '#c8a84b' : 'var(--bd2)')}
      </div>`;
    };

    const ciaRows = [
      ...CIA_STRUCT.map(cia => makeRow(cia.label, cia.color, getPms(cia.units.flatMap(u => u.keys)))),
      ...unmatchedOpms.map(opm => makeRow(opm, 'var(--tx3)', p1Data.filter(r => r.opm === opm)))
    ].filter(Boolean).join('');

    // Cidades mais críticas em Cb/Sd (maior % de claro em relação ao
    // efetivo fixado) — só Cb/Sd, top 3, pedido explícito do usuário. Usa
    // p1_quadro_fixado (mesma fonte do KPI "Quadro Fixado do Efetivo").
    let cidadesCriticasHtml = '';
    if (typeof p1Quadro !== 'undefined' && p1Quadro && p1Quadro.length) {
      const cidadesCriticas = p1Quadro.map(q => {
        const fx = Number(q.fx_cb_sd) || 0, ex = Number(q.ex_cb_sd) || 0;
        const claro = fx - ex;
        const pct = fx > 0 ? Math.round(claro / fx * 100) : 0;
        return { mun: q.municipio || q.opm || '—', claro, pct, fx };
      }).filter(d => d.claro > 0 && d.fx > 0).sort((a, b) => b.pct - a.pct).slice(0, 3);
      if (cidadesCriticas.length) {
        cidadesCriticasHtml = `
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bd)">
            <div style="font-family:'DM Mono',monospace;font-size:14px;color:var(--tx3);letter-spacing:1px;margin-bottom:6px;text-transform:uppercase">Mais críticas · Cb/Sd</div>
            ${cidadesCriticas.map(d => `<div style="display:flex;justify-content:space-between;align-items:center;font-family:'DM Mono',monospace;font-size:17px;margin-bottom:3px">
              <span style="color:#ffffff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${escHtml(d.mun)}</span>
              <span style="color:#e05555;font-weight:700">−${d.claro} <span style="color:var(--tx3);font-weight:400">(${d.pct}%)</span></span>
            </div>`).join('')}
          </div>`;
      }
    }

    p1Preview = `
      <div style="border-top:1px solid var(--bd);margin-top:10px;padding-top:10px">
        <div style="display:flex;gap:14px;margin-bottom:10px;flex-wrap:wrap">
          <div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:var(--tx)">${gs.total}</span><span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-left:4px">total</span></div>
          <div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:#4bc87a">${gs.aptos}</span><span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-left:4px">aptos</span></div>
          <div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:${gs.afst>0?'#e05555':'var(--tx3)'}">${gs.afst}</span><span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-left:4px">afst</span></div>
          <div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:${gs.restr>0?'#c8a84b':'var(--tx3)'}">${gs.restr}</span><span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-left:4px">restr</span></div>
        </div>
        ${ciaRows}
        ${cidadesCriticasHtml}
        ${alertas.length ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bd);display:flex;flex-wrap:wrap;gap:8px;font-family:'DM Mono',monospace;font-size:19px">${alertas.join('<span style="color:var(--bd2)">·</span>')}</div>` : ''}
      </div>`;
  }

  // ── Resumo UIS ────────────────────────────────────────────────────────────
  let uisPreview = '';
  if (p1Data && p1Data.length > 0 && (typeof _uisRestMap !== 'undefined' || typeof _iasMap !== 'undefined')) {
    const comRestUis = (typeof _uisRestMap === 'object' && _uisRestMap && typeof uisNormRE === 'function')
      ? p1Data.filter(r => { try { return !!_uisRestMap[uisNormRE(r.re)]?.length; } catch { return false; } }).length
      : null;
    const iasApt = (typeof _iasMap === 'object' && _iasMap && typeof iasStatus === 'function')
      ? p1Data.filter(r => { const s = iasStatus(r.re); return s === 'apto' || s === 'vencendo'; }).length
      : null;
    const iasVenc = (typeof _iasMap === 'object' && _iasMap && typeof iasStatus === 'function')
      ? p1Data.filter(r => iasStatus(r.re) === 'vencido').length
      : null;
    if (comRestUis !== null || iasApt !== null) {
      uisPreview = `<div style="border-top:1px solid var(--bd);margin-top:10px;padding-top:10px">
        ${comRestUis !== null ? `<div style="display:flex;gap:14px;margin-bottom:8px;flex-wrap:wrap">
          <div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:${comRestUis>0?'#c8a84b':'#4bc87a'}">${comRestUis}</span><span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--tx3);margin-left:4px">com restrição</span></div>
        </div>` : ''}
        ${iasApt !== null ? `<div style="display:flex;gap:14px;flex-wrap:wrap">
          <div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:#4bc87a">${iasApt}</span><span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--tx3);margin-left:4px">IAS aptos</span></div>
          ${iasVenc > 0 ? `<div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:#e05555">${iasVenc}</span><span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--tx3);margin-left:4px">IAS vencida</span></div>` : ''}
        </div>` : ''}
      </div>`;
    }
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

    // Cada crime do mês mais recente, com % da meta individual — sempre os
    // mesmos crimes do último mês fechado, não só o "pior" (pedido explícito
    // do usuário). Em 2 colunas pra caber compacto no card.
    const crimesMes = CRIMES.map(c => {
      const recs = rawMes.filter(r => r.crime === c);
      const aval = recs.reduce((s, r) => s + (r.avaliado || 0), 0);
      const meta = recs.reduce((s, r) => s + (r.meta || 0), 0);
      const pct  = meta > 0 ? Math.round(aval / meta * 100) : null;
      return { c, pct };
    }).filter(x => x.pct !== null);
    const crimesRows = crimesMes.map(x => `<div style="display:flex;justify-content:space-between;gap:6px">
      <span style="color:#ffffff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(x.c)}</span>
      <span style="color:${x.pct<=100?'#4bc87a':'#e8b840'};font-weight:700;flex-shrink:0">${x.pct}%</span>
    </div>`).join('');

    p3Preview = `
      <div style="border-top:1px solid var(--bd);margin-top:10px;padding-top:10px">
        <div style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);letter-spacing:1px;margin-bottom:6px">${mesR} ${anoR}</div>
        <div style="display:flex;gap:14px;margin-bottom:10px;flex-wrap:wrap">
          <div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:var(--tx)">${totalMes}</span><span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-left:4px">ocorr.</span></div>
          ${pctMeta !== null ? `<div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:${metaColor}">${pctMeta}%</span><span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-left:4px">da meta</span></div>` : ''}
        </div>
        ${crimesRows ? `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 16px;font-family:'DM Mono',monospace;font-size:17px">${crimesRows}</div>` : ''}
      </div>`;
  }

  // ── Resumo P5 ─────────────────────────────────────────────────────────────
  // Total + Com Láurea dão o quadro geral (mesmos números do KPI do próprio
  // P5); 1º Grau entra como 3º destaque em vez de "Sem Láurea" porque é a
  // distinção mais rara/relevante pra chamar atenção na home — "sem" já é
  // óbvio pela diferença entre os dois primeiros números.
  let p5Preview = '';
  if (typeof p5EfetivoFull !== 'undefined' && p5EfetivoFull.length > 0) {
    const totalP5 = p5EfetivoFull.length;
    const comLaureaP5 = p5EfetivoFull.filter(p => p.grau).length;
    const porGrauP5 = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    p5EfetivoFull.forEach(p => { if (p.grau && porGrauP5[p.grau] !== undefined) porGrauP5[p.grau]++; });
    const grauRowsP5 = ['1', '2', '3', '4', '5']
      .filter(g => porGrauP5[g] > 0)
      .map(g => `<div style="display:flex;justify-content:space-between;gap:6px">
        <span style="color:#ffffff">${P5_GRAU_LBL[g]}</span>
        <span style="color:${P5_GRAU_COR[g]};font-weight:700;flex-shrink:0">${porGrauP5[g]}</span>
      </div>`).join('');

    p5Preview = `
      <div style="border-top:1px solid var(--bd);margin-top:10px;padding-top:10px">
        <div style="display:flex;gap:14px;margin-bottom:10px;flex-wrap:wrap">
          <div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:var(--tx)">${totalP5}</span><span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-left:4px">total</span></div>
          <div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:#c8a84b">${comLaureaP5}</span><span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-left:4px">com láurea</span></div>
          <div><span style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:800;color:${P5_GRAU_COR['1']}">${porGrauP5['1']}</span><span style="font-family:'DM Mono',monospace;font-size:19px;color:var(--tx3);margin-left:4px">1º grau</span></div>
        </div>
        ${grauRowsP5 ? `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 16px;font-family:'DM Mono',monospace;font-size:17px">${grauRowsP5}</div>` : ''}
      </div>`;
  }

  const sections = [
    {
      id: 'p1', icon: 'users', color: '#4bc87a', label: 'P1', title: 'Seção de Pessoal',
      desc: 'Gestão de efetivo, afastamentos, férias, restrições médicas, EAP e prontuário individual.',
      soon: false, action: `goSection('p1', document.getElementById('sec-p1'))`,
      preview: p1Preview
    },
    {
      id: 'uis', icon: 'heart-pulse', color: '#5ae09a', label: 'UIS', title: 'Unid. Integradas de Saúde',
      desc: 'Restrições médicas e odontológicas (BG PM 166/2006) e Inspeção Anual de Saúde (IAS) — pré-requisito para TAF/TAT.',
      soon: false, action: `goSection('uis', document.getElementById('sec-uis'))`,
      preview: uisPreview
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
      id: 'p5', icon: 'medal', color: '#c8a84b', label: 'P5', title: 'Comunicação Social',
      desc: 'Mapa de láureas do efetivo — acompanhamento por grau, evolução histórica e reconhecimento individual dos PMs.',
      soon: false, action: `goSection('p2', document.getElementById('sec-p2'))`,
      preview: p5Preview
    },
    {
      id: 'sjd', icon: 'scale', color: '#8090a8', label: 'PJMD', title: 'Pol. Judiciária Militar e Disciplina',
      desc: 'Processos administrativos, sindicâncias, punições e gestão disciplinar.',
      soon: true, preview: ''
    },
  ];

  const cards = sections.map(s => {
    // Seções "em breve" não têm nada pra mostrar (sem preview, sem ação) —
    // um card vertical do mesmo tamanho do ativo só pra exibir um parágrafo
    // descritivo era peso visual sem função. Vira uma linha compacta
    // (ícone + nome + badge), claramente menos importante que os cards
    // ativos, sem competir por atenção com eles.
    if (s.soon) {
      return `<div style="background:var(--s2);border:1px solid var(--bd);border-radius:10px;padding:16px 20px;opacity:.5;display:flex;align-items:center;gap:14px">
        <div style="width:38px;height:38px;border-radius:9px;background:${s.color}18;border:1px solid ${s.color}33;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-lucide="${s.icon}" style="width:19px;height:19px;stroke:${s.color};stroke-width:1.75"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;color:var(--tx3);letter-spacing:1px;line-height:1">${s.label}</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:600;color:#ffffff;letter-spacing:.3px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.title}</div>
        </div>
        <span style="font-family:'DM Mono',monospace;font-size:14px;padding:3px 9px;border-radius:10px;background:rgba(255,255,255,.05);color:#ffffff;letter-spacing:1px;flex-shrink:0">EM BREVE</span>
      </div>`;
    }
    return `<div onclick="${s.action};closeSidebarMobile()" onmouseover="this.style.borderColor='${s.color}';this.style.transform='translateY(-3px)';this.style.boxShadow='0 6px 24px rgba(0,0,0,.35)'" onmouseout="this.style.borderColor='var(--bd)';this.style.transform='';this.style.boxShadow=''" style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid ${s.color};border-radius:10px;padding:26px 22px;cursor:pointer;transition:all .2s;display:flex;flex-direction:column">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:14px">
        <div style="width:44px;height:44px;border-radius:10px;background:${s.color}18;border:1px solid ${s.color}33;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-lucide="${s.icon}" style="width:22px;height:22px;stroke:${s.color};stroke-width:1.75"></i>
        </div>
        <span style="font-family:'DM Mono',monospace;font-size:19px;padding:3px 10px;border-radius:10px;background:${s.color}18;color:${s.color};letter-spacing:1px">ATIVO</span>
      </div>
      <div style="margin-bottom:8px">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:34px;font-weight:800;color:${s.color};letter-spacing:1px;line-height:1;margin-bottom:4px">${s.label}</div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:600;color:#ffffff;letter-spacing:.5px">${s.title}</div>
      </div>
      <div style="font-size:19px;color:#ffffff;line-height:1.7">${s.desc}</div>
      ${s.preview || `<div style="border-top:1px solid var(--bd);margin-top:10px;padding-top:10px;font-family:'DM Mono',monospace;font-size:19px;color:${s.color};display:flex;align-items:center;gap:6px">Acessar <span style="font-size:19px">→</span></div>`}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-tag">40º BPM/I — SISTEMA DE GESTÃO</div>
        <div class="ph-title">${saudacao}, <span>${escHtml(nome || 'Usuário')}</span></div>
        <div style="font-size:19px;color:#ffffff;margin-top:4px;text-transform:capitalize">${data} · ${hora}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px">
      ${cards}
    </div>`;

  if (window.lucide) lucide.createIcons();
}

function updateSidebarImports(section) {
  const el = document.getElementById('sidebar-imports');
  if (!el) return;
  const role = currentRole();
  const _sa  = (() => { try { return JSON.parse(localStorage.getItem('auth_user') || '{}').secoes_acesso || {}; } catch { return {}; } })();
  const isP3 = ['admin', 'p3', 'ti'].includes(role) || _sa.p3 === 'editor';
  const isP1 = ['admin', 'p1', 'ti'].includes(role) || _sa.p1 === 'editor';
  if (section === 'p1') {
    if (!isP1) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <button onclick="openP1Upload()" style="width:100%;padding:6px;background:rgba(200,168,75,.12);border:1px solid rgba(200,168,75,.25);color:var(--gold);border-radius:4px;cursor:pointer;font-size:19px;font-weight:600">↑ Importar Efetivo</button>
      <button onclick="openQuadroUpload()" style="margin-top:4px;width:100%;padding:6px;background:rgba(75,200,122,.12);border:1px solid rgba(75,200,122,.3);color:#4bc87a;border-radius:4px;cursor:pointer;font-size:19px;font-weight:600">↑ Importar Quadro de Claros</button>
      <button onclick="openP1SgpModal()" style="margin-top:4px;width:100%;padding:6px;background:rgba(90,224,154,.12);border:1px solid rgba(90,224,154,.3);color:#5ae09a;border-radius:4px;cursor:pointer;font-size:19px;font-weight:600">⇄ Sincronizar via SGP</button>`;
  } else if (section === 'uis') {
    // Dados da UIS (restrições + IAS) vêm exclusivamente do SGP via P1 →
    // "Sincronizar via SGP". Import manual de planilha foi descontinuado.
    el.innerHTML = '';
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
      ['cursos',           'Cursos Institucionais (manual)',   '#9de05a'],
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

function _showAccessDenied() {
  let t = document.getElementById('_acesso-neg');
  if (!t) {
    t = document.createElement('div');
    t.id = '_acesso-neg';
    t.style.cssText = 'position:fixed;top:22px;left:50%;transform:translateX(-50%);background:#1a2035;border:1px solid rgba(230,100,100,.45);color:#f07878;padding:11px 26px;border-radius:8px;font-size:14px;font-weight:600;z-index:99999;pointer-events:none;opacity:0;transition:opacity .2s;white-space:nowrap';
    t.textContent = '🔒 Acesso restrito — você não tem permissão para esta seção';
    document.body.appendChild(t);
  }
  t.style.opacity = '1';
  clearTimeout(t._tmr);
  t._tmr = setTimeout(() => { t.style.opacity = '0'; }, 2800);
}

function _checkSectionAccess(id) {
  const u  = JSON.parse(localStorage.getItem('auth_user') || '{}');
  const sa = u.secoes_acesso || {};
  if (!Object.keys(sa).length) return true;          // sem config → libera
  if (['admin', 'ti'].includes(u.role)) return true; // superusuário → libera
  const key = id === 'p3prod' ? 'p3' : id;           // p3prod verifica chave p3
  const controlled = ['p1', 'uis', 'p3'];
  if (!controlled.includes(key)) return true;        // seção não controlada → libera
  return sa[key] === 'viewer' || sa[key] === 'nominal' || sa[key] === 'editor';
}

function _logPageView(acao, detalhe) {
  try {
    authFetch(`${API}/logs/acesso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao, detalhe: detalhe || null })
    }).catch(() => {});
  } catch (_) {}
}

function goSection(id, btn) {
  closeSidebarMobile();
  if (!_checkSectionAccess(id)) { _showAccessDenied(); return; }
  _logPageView('secao_' + id);

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
  if (id === 'p2') {
    loadP5Section();
  }
  setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
}

function goPage(id, btn) {
  closeSidebarMobile();
  _logPageView('pagina_p3_' + id);
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

