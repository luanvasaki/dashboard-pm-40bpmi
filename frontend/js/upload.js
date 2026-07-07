// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD CSV — Banco de Dados RAC (tabela "Base de Dados RAC PM")
// Fluxo:
//   1. openUploadModal()    → abre modal #upl-mo
//   2. handleFileSelect()   → PapaParse lê CSV, valida colunas obrigatórias
//   3. confirmUpload()      → envia records para POST /api/upload
//      O backend apaga os registros dos anos presentes no CSV e insere novos
// Colunas obrigatórias: Ano, Mes, Cia, Municipio, Crime, Anterior, Meta, Avaliado
// Após importar: chama forceSync() para atualizar o cache e re-renderizar
// ═══════════════════════════════════════════════════════════════════════════

let uploadData = null;

// Abre o modal de upload RAC e reseta estado anterior
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
    await authFetch(`${API}/sync`, { method: 'POST' }).catch(() => {});
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

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD DE OCORRÊNCIAS INFOCRIM (tabela "ocorrencias")
// Fluxo:
//   1. openOcorrModal()    → abre modal #ocorr-upl-mo
//   2. handleOcorrFile()   → PapaParse lê CSV, valida colunas, detecta BOs duplicados
//   3a. Se sem duplicatas  → habilita botão "Importar" direto
//   3b. Se com duplicatas  → exibe painel de deduplicação (ver seção abaixo)
//   4. confirmOcorrUpload()→ envia records para POST /api/upload/ocorrencias
//      O backend apaga TODOS os registros antes de inserir (substituição total)
// Colunas obrigatórias: NumeroBO, DataOcorrencia, Rubrica,
//   CompanhiaCircunscricao, MunicipioCircunscricao
// ═══════════════════════════════════════════════════════════════════════════

let ocorrData     = null;
let _ocorrAllRows = null;
let _ocorrDups    = [];
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
  _ocorrAllRows = null;
  _ocorrDups = [];
  document.getElementById('ocorr-file').value = '';
  document.getElementById('ocorr-preview').style.display = 'none';
  document.getElementById('ocorr-dedupe').style.display = 'none';
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
  el.style.color = type === 'err' ? '#f07878' : type === 'ok' ? '#5ae09a' : type === 'warn' ? '#c8a84b' : '#5a9de0';
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

      const required = ['NumeroBO', 'DataOcorrencia', 'Rubrica', 'CompanhiaCircunscricao', 'MunicipioCircunscricao'];
      const headers  = Object.keys(results.data[0]);
      const missing  = required.filter(r => !headers.some(h => h.toLowerCase() === r.toLowerCase()));
      if (missing.length) { showOcorrMsg(`Colunas ausentes: ${missing.join(', ')}`, 'err'); return; }

      const allRows = results.data
        .map(row => { const n = {}; Object.entries(row).forEach(([k, v]) => { n[k.trim()] = (v || '').trim(); }); return n; })
        .filter(r => r.DataOcorrencia && r.Rubrica);

      // Detecta BOs duplicados (mesmo NumeroBO, rubricas diferentes ou não)
      const boMap = {};
      allRows.forEach((row, i) => {
        const bo = (row.NumeroBO || '').trim();
        if (!bo) return;
        if (!boMap[bo]) boMap[bo] = [];
        boMap[bo].push(i);
      });
      const dups = Object.entries(boMap)
        .filter(([, idxs]) => idxs.length > 1)
        .sort((a, b) => a[0].localeCompare(b[0]));

      _ocorrAllRows = allRows;
      _ocorrDups    = dups;

      document.getElementById('ocorr-fn').textContent   = file.name;
      document.getElementById('ocorr-rows').textContent = allRows.length;

      if (dups.length > 0) {
        document.getElementById('ocorr-preview').style.display = 'block';
        document.getElementById('ocorr-confirm').disabled = true;
        showOcorrMsg(`${allRows.length} registros · ${dups.length} BOs duplicados detectados. Resolva abaixo antes de importar.`, 'warn');
        _ocorrRenderDedupe(dups, allRows);
      } else {
        ocorrData = allRows;
        document.getElementById('ocorr-preview').style.display = 'block';
        document.getElementById('ocorr-confirm').disabled = false;
        showOcorrMsg(`${allRows.length} registros sem duplicatas — pronto para importar.`, 'info');
      }
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

// ═══════════════════════════════════════════════════════════════════════════
// DEDUPLICAÇÃO DE BOs — painel dentro do modal de upload InfoCrim
// Um BO pode ter múltiplos registros (tipificação muda durante o inquérito,
// ex: começa como Roubo e termina como Homicídio).
// Fluxo:
//   1. _ocorrRenderDedupe()  → exibe painel com grupos de BOs duplicados
//   2. Por padrão, pré-seleciona o ÚLTIMO registro de cada grupo (tipificação final)
//   3. ocorrDedupeAutoSelect() → força seleção do último de todos os grupos
//   4. ocorrDedupeApply()    → filtra _ocorrAllRows mantendo só o selecionado
//      de cada grupo + todos os não-duplicados; chama confirmOcorrUpload()
//   5. ocorrDedupeImportAll()→ ignora deduplicação e importa todos os registros
// ⚠ A filtragem ocorre apenas na memória do navegador; o arquivo CSV original
//   não é alterado.
// ═══════════════════════════════════════════════════════════════════════════

function _ocorrRenderDedupe(dups, allRows) {
  const totalDupRows = dups.reduce((acc, [, idxs]) => acc + idxs.length, 0);
  document.getElementById('ocorr-dup-count').textContent  = dups.length;
  document.getElementById('ocorr-dup-total').textContent  = `(${totalDupRows} registros afetados)`;

  const list = document.getElementById('ocorr-dedupe-list');
  list.innerHTML = dups.map(([bo, idxs]) => {
    const safe = 'bo_' + bo.replace(/[^a-z0-9]/gi, '_');
    const items = idxs.map((idx, i) => {
      const row = allRows[idx];
      const isLast = i === idxs.length - 1;
      return `<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;padding:5px 8px;border-radius:4px;background:${isLast ? 'rgba(90,158,224,0.10)' : 'none'};margin:1px 0">
        <input type="radio" name="${safe}" value="${idx}" ${isLast ? 'checked' : ''} style="margin-top:2px;accent-color:#5a9de0;flex-shrink:0">
        <span style="font-size:13px;line-height:1.5">
          <span style="color:var(--tx3)">${row.DataOcorrencia || '—'}</span>
          &nbsp;·&nbsp;
          <b style="color:var(--tx)">${row.Rubrica || '—'}</b>
          ${row.Conduta ? `<span style="color:var(--tx3)"> · ${row.Conduta}</span>` : ''}
        </span>
      </label>`;
    }).join('');
    return `<div style="background:var(--s1);border:1px solid var(--bd);border-radius:6px;padding:10px 12px">
      <div style="font-family:'DM Mono',monospace;font-size:12px;color:#5a9de0;letter-spacing:1px;margin-bottom:6px">BO ${bo} &nbsp;·&nbsp; ${idxs.length} registros</div>
      ${items}
    </div>`;
  }).join('');

  document.getElementById('ocorr-dedupe').style.display = '';
}

function ocorrDedupeAutoSelect() {
  _ocorrDups.forEach(([bo, idxs]) => {
    const safe = 'bo_' + bo.replace(/[^a-z0-9]/gi, '_');
    const last  = idxs[idxs.length - 1];
    const radio = document.querySelector(`input[name="${safe}"][value="${last}"]`);
    if (radio) radio.checked = true;
  });
}

async function ocorrDedupeApply() {
  if (!_ocorrAllRows || !_ocorrDups.length) return;
  const dupSet  = new Set(_ocorrDups.flatMap(([, idxs]) => idxs));
  const keepSet = new Set();
  _ocorrDups.forEach(([bo, idxs]) => {
    const safe     = 'bo_' + bo.replace(/[^a-z0-9]/gi, '_');
    const selected = document.querySelector(`input[name="${safe}"]:checked`);
    keepSet.add(selected ? parseInt(selected.value) : idxs[idxs.length - 1]);
  });
  ocorrData = _ocorrAllRows.filter((_, i) => !dupSet.has(i) || keepSet.has(i));
  document.getElementById('ocorr-dedupe').style.display = 'none';
  await confirmOcorrUpload();
}

async function ocorrDedupeImportAll() {
  ocorrData = _ocorrAllRows;
  document.getElementById('ocorr-dedupe').style.display = 'none';
  await confirmOcorrUpload();
}

