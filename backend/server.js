/**
 * server.js — API REST do Dashboard 40 BPM/I
 * Porta: 3001
 *
 * Fontes de dados (em ordem de prioridade):
 *   1. Supabase (configure SUPABASE_URL e SUPABASE_KEY abaixo)
 *   2. Google Sheets publicado como CSV (configure SHEETS_URL abaixo)
 *   3. raw_data.json local (fallback automático)
 *
 * IMPORTANTE — para o upload funcionar, crie no Supabase uma restrição UNIQUE:
 *   ALTER TABLE "Base de Dados RAC PM"
 *   ADD CONSTRAINT rac_pm_unique UNIQUE ("Ano","Mes","Cia","Municipio","Crime");
 *
 * Rotas disponíveis:
 *   GET  /api/registros   → todos os registros (com filtros opcionais)
 *   GET  /api/meta        → crimes, meses, municípios e CIAs disponíveis
 *   GET  /api/sync        → força resincronização imediata
 *   GET  /api/status      → última sincronização e total de registros
 *   POST /api/upload      → recebe registros do CSV e faz upsert no Supabase
 */

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = 3001;

// ============================================================
// CONFIGURE AQUI: Supabase (fonte primária de dados)
// Project Settings → API → URL  e  service_role key
// ============================================================
const SUPABASE_URL = 'https://lhdmqqmvpaeanblqiodr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1drgCoWkW1rMsr1CagUgEQ_N14K4sPd';

// ============================================================
// CONFIGURE AQUI: Google Sheets (fonte secundária / fallback)
// Arquivo → Compartilhar → Publicar na Web → CSV → Copiar link
// ============================================================
const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSHYvDauaOHA14LOb7m5uTuowGskNG-KMcJlM9eru4NRWGPISlYrlhFCyAo1MsQwUOCIf8v7P93lxbe/pub?gid=157855787&single=true&output=csv';

const CACHE_TTL  = 5 * 60 * 1000; // auto-refresh a cada 5 minutos
const TABLE_NAME = 'Base de Dados RAC PM';

// Inicializa cliente Supabase apenas se as credenciais foram preenchidas
let supabase = null;
if (SUPABASE_URL !== 'COLE_SUA_URL_AQUI' && SUPABASE_KEY !== 'COLE_SUA_KEY_AQUI') {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✓ Supabase client inicializado');
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Ordem canônica
const MES_ORD    = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const CRIMES_ORD = ['Homicídio','Estupro','Estupro de Vulnerável','Roubo','Furto','Roubo de Veículos','Furto de Veículos'];

// Cache em memória
let cache = { data: [], lastSync: null, source: null, error: null };

// ---------------------------------------------------------------------------
// Parser de CSV simples (suporta campos com aspas)
// ---------------------------------------------------------------------------
function parseCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.trim());

  const col = (row, ...keys) => {
    for (const k of keys) {
      const idx = headers.findIndex(h => h.toLowerCase() === k.toLowerCase());
      if (idx !== -1) return row[idx]?.trim() || '';
    }
    return '';
  };

  return lines.slice(1).map(line => {
    const row = parseCSVLine(line);
    return {
      ano:      parseInt(col(row, 'ano'))                      || 0,
      mes:      col(row, 'mes'),
      cia:      col(row, 'cia'),
      mun:      col(row, 'municipio', 'mun'),
      crime:    col(row, 'crime'),
      anterior: parseFloat(col(row, 'anterior'))               || 0,
      meta:     parseFloat(col(row, 'meta'))                   || 0,
      avaliado: parseFloat(col(row, 'avaliado'))               || 0,
      tend:     parseFloat(col(row, 'tendencia', 'tend'))      || 0,
      variacao: col(row, 'variação', 'variacao', 'variação')
    };
  }).filter(r => r.mes && r.crime);
}

// Mapeia linha do Supabase → formato interno (campos em minúsculo)
function fromSupabase(r) {
  return {
    ano:      parseInt(r['Ano'])                           || 0,
    mes:      r['Mes']                                     || '',
    cia:      r['Cia']                                     || '',
    mun:      r['Municipio']                               || '',
    crime:    r['Crime']                                   || '',
    anterior: parseFloat(r['Anterior'])                    || 0,
    meta:     parseFloat(r['Meta'])                        || 0,
    avaliado: parseFloat(r['Avaliado'])                    || 0,
    tend:     parseFloat(r['Tendencia'])                   || 0,
    variacao: r['Variação'] || r['Variacao']               || ''
  };
}

// ---------------------------------------------------------------------------
// Sincronização de fontes
// ---------------------------------------------------------------------------
async function syncFromSupabase() {
  if (!supabase) return false;
  try {
    console.log('↻ Sincronizando com Supabase...');
    const { data, error } = await supabase.from(TABLE_NAME).select('*');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('Nenhum registro encontrado no Supabase');

    cache.data     = data.map(fromSupabase);
    cache.lastSync = new Date().toISOString();
    cache.source   = 'supabase';
    cache.error    = null;
    console.log(`✓ Supabase: ${cache.data.length} registros carregados (${cache.lastSync})`);
    return true;
  } catch (err) {
    cache.error = err.message;
    console.error('✗ Erro ao sincronizar Supabase:', err.message);
    return false;
  }
}

async function syncFromSheets() {
  if (!SHEETS_URL) return false;
  try {
    console.log('↻ Sincronizando com Google Sheets...');
    const res  = await fetch(SHEETS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const data = parseCSV(text);
    if (!data.length) throw new Error('Nenhum registro encontrado no CSV');

    cache.data     = data;
    cache.lastSync = new Date().toISOString();
    cache.source   = 'sheets';
    cache.error    = null;
    console.log(`✓ Sheets: ${data.length} registros carregados (${cache.lastSync})`);
    return true;
  } catch (err) {
    cache.error = err.message;
    console.error('✗ Erro ao sincronizar Sheets:', err.message);
    return false;
  }
}

function loadLocalFallback() {
  const DATA_PATH = path.join(__dirname, '..', 'raw_data.json');
  try {
    cache.data     = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    cache.lastSync = new Date().toISOString();
    cache.source   = 'local';
    console.log(`✓ Fallback local: ${cache.data.length} registros de raw_data.json`);
  } catch (err) {
    console.error('✗ Sem dados disponíveis:', err.message);
    cache.data = [];
  }
}

// ---------------------------------------------------------------------------
// Inicialização e auto-refresh
// ---------------------------------------------------------------------------
async function init() {
  if (supabase) {
    const ok = await syncFromSupabase();
    if (!ok) {
      const sheetsOk = SHEETS_URL ? await syncFromSheets() : false;
      if (!sheetsOk) loadLocalFallback();
    }
  } else if (SHEETS_URL) {
    const ok = await syncFromSheets();
    if (!ok) loadLocalFallback();
  } else {
    console.warn('⚠ Nenhuma fonte configurada. Usando raw_data.json local.');
    loadLocalFallback();
  }

  setInterval(async () => {
    if (supabase)       await syncFromSupabase();
    else if (SHEETS_URL) await syncFromSheets();
  }, CACHE_TTL);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function filtrar({ mes, crime, mun, cia }) {
  return cache.data.filter(r =>
    (!mes   || r.mes   === mes)   &&
    (!crime || r.crime === crime) &&
    (!mun   || r.mun   === mun)   &&
    (!cia   || r.cia   === cia)
  );
}

function uniq(arr) { return [...new Set(arr)]; }

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

app.get('/api/status', (req, res) => {
  res.json({
    lastSync:           cache.lastSync,
    source:             cache.source,
    records:            cache.data.length,
    error:              cache.error,
    supabaseConfigured: !!supabase,
    sheetsConfigured:   !!SHEETS_URL
  });
});

app.get('/api/sync', async (req, res) => {
  let ok;
  if (supabase)        ok = await syncFromSupabase();
  else if (SHEETS_URL) ok = await syncFromSheets();
  else return res.status(400).json({ error: 'Nenhuma fonte configurada no server.js' });
  res.json({ ok, lastSync: cache.lastSync, source: cache.source, records: cache.data.length, error: cache.error });
});

// POST /api/upload — recebe registros parseados do CSV e faz upsert no Supabase
app.post('/api/upload', async (req, res) => {
  if (!supabase) {
    return res.status(400).json({
      error: 'Supabase não configurado. Preencha SUPABASE_URL e SUPABASE_KEY no server.js e reinicie o servidor.'
    });
  }

  const { records } = req.body;
  if (!records?.length) return res.status(400).json({ error: 'Nenhum registro recebido.' });

  try {
    // Mapeia os campos do CSV para as colunas exatas da tabela no Supabase
    const rows = records.map(r => ({
      'Ano':       parseInt(r.Ano)                               || 0,
      'Mes':       (r.Mes          || '').trim(),
      'Cia':       (r.Cia          || '').trim(),
      'Municipio': (r.Municipio    || '').trim(),
      'Crime':     (r.Crime        || '').trim(),
      'Anterior':  parseFloat(r.Anterior)                        || 0,
      'Meta':      parseFloat(r.Meta)                            || 0,
      'Avaliado':  parseFloat(r.Avaliado)                        || 0,
      'Tendencia': parseFloat(r.Tendencia || r['Tendência'])     || 0,
      'Variação':  (r['Variação'] || r.Variacao || '').trim()
    })).filter(r => r['Mes'] && r['Crime']);

    if (!rows.length) return res.status(400).json({ error: 'Nenhum registro válido após validação.' });

    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert(rows, { onConflict: 'Ano,Mes,Cia,Municipio,Crime' });

    if (error) throw new Error(error.message);

    // Recarrega o cache a partir do Supabase para refletir os dados atualizados
    await syncFromSupabase();

    res.json({ ok: true, uploaded: rows.length, total: cache.data.length });
  } catch (err) {
    console.error('✗ Erro no upload:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/meta', (req, res) => {
  const crimes = uniq(cache.data.map(r => r.crime));
  const meses  = uniq(cache.data.map(r => r.mes)).sort((a, b) => MES_ORD.indexOf(a) - MES_ORD.indexOf(b));
  const muns   = uniq(cache.data.map(r => r.mun)).sort();
  const cias   = uniq(cache.data.map(r => r.cia)).sort();
  res.json({ crimes: CRIMES_ORD.filter(c => crimes.includes(c)), meses, muns, cias });
});

app.get('/api/registros', (req, res) => {
  res.json(filtrar(req.query));
});

app.get('/api/registros/crimes', (req, res) => {
  res.json(CRIMES_ORD.filter(c => uniq(cache.data.map(r => r.crime)).includes(c)));
});

app.get('/api/registros/meses', (req, res) => {
  res.json(uniq(cache.data.map(r => r.mes)).sort((a, b) => MES_ORD.indexOf(a) - MES_ORD.indexOf(b)));
});

app.get('/api/registros/muns', (req, res) => {
  res.json(uniq(cache.data.map(r => r.mun)).sort());
});

app.get('/api/registros/cias', (req, res) => {
  res.json(uniq(cache.data.map(r => r.cia)).sort());
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
init().then(() => {
  app.listen(PORT, () => {
    console.log(`✓ API rodando em http://localhost:${PORT}`);
    if (supabase)        console.log(`  Supabase: ${SUPABASE_URL}`);
    else if (SHEETS_URL) console.log(`  Sheets: ${SHEETS_URL.slice(0, 60)}...`);
    else                 console.log(`  ⚠ Configure SUPABASE_URL ou SHEETS_URL no server.js`);
  });
});
