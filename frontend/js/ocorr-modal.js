// ═══════════════════════════════════════════════════════════════════════════
// OCORRÊNCIAS INFOCRIM NO MODAL DE CRIME
// Carregadas via GET /api/ocorrencias?rubrica=...&limit=2000 ao abrir o modal.
// Alimentam a seção de inteligência operacional (renderMoIntel):
//   • Heatmap dia × período do dia
//   • Tipo de local mais frequente
//   • Bairros com mais ocorrências
//   • Distribuição por rubrica (conduta)
// Para Roubo/Furto Veículos: busca ambas as rubricas e filtra por conduta "veículo"
// Para Homicídio: busca Feminicídio separadamente para o gráfico de rosca
// ═══════════════════════════════════════════════════════════════════════════

// Extrai o número da CIA para comparação fuzzy (ex: "1ª CIA PM" e "1ª CIA" → "1")
function normCiaKey(s) {
  const m = (s || '').match(/(\d+)/);
  return m ? m[1] : (s || '').toLowerCase().trim();
}

// Nome de município p/ comparação — o RAC guarda "Alumínio / Ibiúna / Araçoiaba
// da Serra" e o InfoCrim guarda "Aluminio / Ibiuna / Aracoiaba Da Serra".
// Sem isso, filtrar o detalhamento por cidade zerava quase toda cidade.
function normMun(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Normaliza nome de CIA para exibição padronizada (ex: "1ª CIA PM" → "1ª CIA", "FT" → "FT")
function normCiaDisplay(s) {
  const str = (s || '').trim();
  const l = str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (l.includes('ft') || l.includes('forca') || l.includes('tatica')) return 'FT';
  const m = str.match(/(\d+)/);
  if (m) return m[1] + 'ª CIA';
  return str;
}

async function loadMoOcorr() {
  const el = document.getElementById('mo-ocorr-table');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--tx3);font-size:19px;padding:8px 0">Carregando ocorrências...</div>';
  const filtersEl = document.getElementById('mo-ocorr-filters');
  if (filtersEl) filtersEl.innerHTML = '';

  try {
    let data;
    if (Array.isArray(moCrime)) {
      // Crime agrupado: busca cada rubrica base separadamente e filtra por conduta veículo
      const rubricas = ['Roubo', 'Furto'];
      const results = await Promise.all(rubricas.map(r =>
        authFetch(`${API}/ocorrencias?${new URLSearchParams({ rubrica: r, limit: '2000' })}`).then(res => res.json())
      ));
      const isCondutaVeiculo = c => { const l = (c || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); return l.includes('veic') && !l.includes('interior'); };
      const merged = results.flat().filter(r => isCondutaVeiculo(r.conduta));
      // Remove duplicatas por id
      const seen = new Set();
      data = merged.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
    } else {
      // Se crime contiver 'vulnerav' (normalizado), busca por 'estupro' para evitar
      // problema de acento no ilike do Postgres e filtra no frontend depois
      const _normCrime = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const isEstVul = _normCrime(moCrime).includes('vulnerav');
      const termoBusca = isEstVul ? 'estupro' : moCrime;
      const params = new URLSearchParams({ rubrica: termoBusca, limit: '2000' });
      const res = await authFetch(`${API}/ocorrencias?${params}`);
      data = await res.json();
      // Homicídio: busca contagem de Feminicídio separadamente para exibir como detalhe
      // Usa 'eminicid' para evitar problema de acento/encoding no ilike
      if (moCrime === 'Homicídio') {
        try {
          const paramsFem = new URLSearchParams({ rubrica: 'Feminic', limit: '2000' });
          const resFem = await authFetch(`${API}/ocorrencias?${paramsFem}`);
          const dataFem = await resFem.json();
          moFemData = Array.isArray(dataFem) ? dataFem : [];
          // Mescla feminicídios na lista principal de ocorrências
          const merged = [...data, ...moFemData];
          const seen = new Set();
          data = merged.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
        } catch (e) {
          console.error('Erro ao buscar Feminicídio:', e);
          moFemData = [];
        }
        updateFemKpi();
      }
      // Estupro Vulnerável: mantém apenas registros com 'vulnerav' ou '217' na rubrica
      if (isEstVul) {
        data = data.filter(r => {
          const rub = (r.rubrica || '').toLowerCase();
          return rub.includes('vulnerav') || rub.includes('217');
        });
      }
      // Exclui condutas de veículo — pertencem à tela Roubo/Furto Veículos
      if (['Roubo','Furto'].includes(moCrime)) {
        const isCondutaVeiculo = c => { const l = (c || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); return l.includes('veic') && !l.includes('interior'); };
        data = data.filter(r => !isCondutaVeiculo(r.conduta));
      }
      // Se existir um crime mais específico (ex: "Estupro Vulnerável" para "Estupro"),
      // exclui os registros que pertencem ao mais específico — ilike traz os dois
      const _norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const normMC = _norm(moCrime);
      const maisEspecificos = CRIMES.filter(c => c !== moCrime && _norm(c).startsWith(normMC + ' '));
      if (maisEspecificos.length > 0) {
        data = data.filter(r => {
          const normR = _norm(r.rubrica || '');
          return !maisEspecificos.some(c => normR.includes(_norm(c)));
        });
      }
    }
    moOcorrAll = Array.isArray(data) ? data : [];
    applyOcorrFilters();
  } catch (err) {
    if (el) el.innerHTML = `<div style="color:#f07878;font-size:19px;padding:8px 0">Erro ao carregar ocorrências: ${err.message}</div>`;
  }
}

function applyOcorrFilters() {
  let filtered = moOcorrAll.filter(r => {
    if (!r.data_ocorrencia) return false;
    const parts = r.data_ocorrencia.split('-');
    const ano = parseInt(parts[0]);
    const m   = parseInt(parts[1]) - 1;
    if (selAno && ano !== selAno) return false;
    return moMeses.includes(MES_ORD[m]);
  });
  if (moScopeType === 'cia' && moScopeVal)
    filtered = filtered.filter(r => normCiaKey(r.cia) === normCiaKey(moScopeVal));
  if (moScopeType === 'mun' && moScopeVal)
    filtered = filtered.filter(r => normMun(r.municipio) === normMun(moScopeVal));
  renderMoOcorrFilters();
  renderOcorrTable(filtered);
  renderMoIntel(filtered);
}

function setOcorrCia(cia) {
  // Toggle: se já está selecionada, volta para Batalhão; senão seleciona a CIA
  if (moScopeType === 'cia' && moScopeVal === cia) moSetScope('btl', null);
  else moSetScope('cia', cia);
}

function renderMoOcorrFilters() {
  const el = document.getElementById('mo-ocorr-filters');
  if (!el) return;
  let h = '';
  if (moOcorrAll.length) {
    h += `<span style="font-size:19px;color:var(--tx3)">${moOcorrAll.length} registro(s) total</span>`;
  }
  el.innerHTML = h;
}

function renderOcorrTable(data) {
  const el = document.getElementById('mo-ocorr-table');
  if (!el) return;
  if (!data.length) {
    el.innerHTML = '<div style="color:var(--tx3);font-size:19px;padding:8px 0">Nenhuma ocorrência encontrada para os filtros selecionados.</div>';
    return;
  }
  const th = s => `<th style="padding:9px 10px;border-bottom:1px solid var(--bd);font-family:'DM Mono',monospace;font-size:19px;color:#ffffff;letter-spacing:1px;text-align:left;white-space:nowrap">${s}</th>`;
  const td = (s, mono) => `<td style="padding:9px 10px;border-bottom:1px solid rgba(255,255,255,.05);color:#ffffff;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis${mono?';font-family:\'DM Mono\',monospace;font-size:19px':';font-size:19px'}" title="${escHtml(s||'')}">${escHtml(s)||'—'}</td>`;
  let h = `<table style="width:100%;border-collapse:collapse;font-size:19px"><thead><tr>
    ${th('Nº BO')}${th('DATA')}${th('HORA')}${th('PERÍODO')}${th('DIA')}${th('CONDUTA')}${th('BAIRRO')}${th('TIPO LOCAL')}${th('MUNICÍPIO')}${th('CIA')}
  </tr></thead><tbody>`;
  data.forEach(r => {
    const df = r.data_ocorrencia ? r.data_ocorrencia.split('-').reverse().join('/') : '—';
    h += `<tr>${td(r.numero_bo,true)}${td(df,true)}${td(r.hora_ocorrencia)}${td(r.periodo)}${td(r.dia_semana)}${td(r.conduta)}${td(r.bairro)}${td(r.tipo_local)}${td(r.municipio)}${td(r.cia)}</tr>`;
  });
  h += '</tbody></table>';
  el.innerHTML = h;
}

