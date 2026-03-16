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
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');

const app  = express();
const PORT = 3001;

// ============================================================
// AUTENTICAÇÃO — JWT
// Troque JWT_SECRET por uma string longa e aleatória em produção
// ============================================================
const JWT_SECRET      = '40bpmi_painel_intel_2026_chave_secreta';
const USUARIOS_TABLE  = 'usuarios';

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) return res.status(403).json({ error: 'Acesso negado' });
    next();
  };
}

// ============================================================
// CONFIGURE AQUI: Supabase (fonte primária de dados)
// Project Settings → API → URL  e  service_role key
// ============================================================
const SUPABASE_URL = 'https://lhdmqqmvpaeanblqiodr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1drgCoWkW1rMsr1CagUgEQ_N14K4sPd';


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

// Mapeia linha do Supabase → formato interno (busca case-insensitive)
function fromSupabase(r) {
  const keys = Object.keys(r);
  const get = (...names) => {
    for (const name of names) {
      const key = keys.find(k => k.toLowerCase() === name.toLowerCase());
      if (key !== undefined && r[key] !== null && r[key] !== undefined) return r[key];
    }
    return null;
  };
  const num = (...names) => { const v = parseFloat(get(...names)); return isNaN(v) ? 0 : v; };
  return {
    ano:      parseInt(get('Ano'))                         || 0,
    mes:      get('Mes')                                   || '',
    cia:      get('Cia')                                   || '',
    mun:      get('Municipio')                             || '',
    crime:    get('Crime')                                 || '',
    anterior: num('Anterior'),
    meta:     num('Meta'),
    avaliado: num('Avaliado'),
    tend:     num('Tendencia', 'Tendência'),
    variacao: get('Variação', 'Variacao')                  || ''
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
    if (!ok) loadLocalFallback();
  } else {
    console.warn('⚠ Supabase não configurado. Usando raw_data.json local.');
    loadLocalFallback();
  }

  setInterval(async () => {
    if (supabase) await syncFromSupabase();
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

// ---------------------------------------------------------------------------
// Rotas de autenticação
// ---------------------------------------------------------------------------

// POST /api/auth/register — cadastro (fica pendente até aprovação)
app.post('/api/auth/register', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco de dados não configurado' });
  const { nome, posto, matricula, senha, secao } = req.body;
  if (!nome || !posto || !matricula || !senha || !secao)
    return res.status(400).json({ error: 'Preencha todos os campos' });
  if (senha.length < 6)
    return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });

  try {
    const hash = await bcrypt.hash(senha, 10);
    const { error } = await supabase.from(USUARIOS_TABLE).insert({
      nome:       nome.trim(),
      posto:      posto.trim(),
      matricula:  matricula.trim().toUpperCase(),
      senha_hash: hash,
      secao:      secao.trim(),
      role:       'viewer',
      status:     'pending'
    });
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Matrícula já cadastrada' });
      throw new Error(error.message);
    }
    res.json({ ok: true, message: 'Solicitação enviada. Aguarde aprovação da seção P1 ou P3.' });
  } catch (err) {
    console.error('✗ Erro no registro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco de dados não configurado' });
  const { matricula, senha } = req.body;
  if (!matricula || !senha) return res.status(400).json({ error: 'Preencha todos os campos' });

  try {
    const { data, error } = await supabase
      .from(USUARIOS_TABLE)
      .select('*')
      .eq('matricula', matricula.trim().toUpperCase())
      .single();

    if (error || !data) return res.status(401).json({ error: 'Matrícula ou senha incorretos' });
    if (data.status === 'pending')
      return res.status(403).json({ error: 'Cadastro aguardando aprovação da seção P1 ou P3' });
    if (data.status === 'rejected')
      return res.status(403).json({ error: 'Cadastro recusado. Entre em contato com a seção P1 ou P3' });

    const ok = await bcrypt.compare(senha, data.senha_hash);
    if (!ok) return res.status(401).json({ error: 'Matrícula ou senha incorretos' });

    const payload = { id: data.id, nome: data.nome, matricula: data.matricula, role: data.role, secao: data.secao };
    const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: payload });
  } catch (err) {
    console.error('✗ Erro no login:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// ---------------------------------------------------------------------------
// Rotas de administração de usuários (somente p3)
// ---------------------------------------------------------------------------

// GET /api/admin/users — lista todos os usuários
app.get('/api/admin/users', requireAuth, requireRole('admin', 'p3'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco de dados não configurado' });
  try {
    const { data, error } = await supabase
      .from(USUARIOS_TABLE)
      .select('id, nome, posto, matricula, secao, role, status, created_at')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id — aprova/rejeita/altera role
app.patch('/api/admin/users/:id', requireAuth, requireRole('admin', 'p3'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco de dados não configurado' });
  const { status, role } = req.body;
  const updates = {};
  if (status) updates.status = status;
  // Apenas p3 pode alterar o nível de acesso (role)
  if (role && ['admin', 'p3'].includes(req.user.role)) updates.role = role;

  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nenhuma alteração informada' });

  try {
    // Impede qualquer alteração em usuários com role 'admin'
    const { data: target } = await supabase.from(USUARIOS_TABLE).select('role').eq('id', req.params.id).single();
    if (target?.role === 'admin') return res.status(403).json({ error: 'Usuário protegido — não pode ser alterado.' });

    const { error } = await supabase.from(USUARIOS_TABLE).update(updates).eq('id', req.params.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id — exclui usuário definitivamente (apenas p3)
app.delete('/api/admin/users/:id', requireAuth, requireRole('admin', 'p3'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco de dados não configurado' });
  try {
    const { data: target } = await supabase.from(USUARIOS_TABLE).select('role').eq('id', req.params.id).single();
    if (target?.role === 'admin') return res.status(403).json({ error: 'Usuário protegido — não pode ser excluído.' });

    const { error } = await supabase.from(USUARIOS_TABLE).delete().eq('id', req.params.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Rotas de dados (protegidas por autenticação)
// ---------------------------------------------------------------------------

app.get('/api/status', requireAuth, (req, res) => {
  res.json({
    lastSync:           cache.lastSync,
    source:             cache.source,
    records:            cache.data.length,
    error:              cache.error,
    supabaseConfigured: !!supabase
  });
});

app.get('/api/sync', requireAuth, async (req, res) => {
  if (!supabase) return res.status(400).json({ error: 'Supabase não configurado no server.js' });
  let ok = await syncFromSupabase();
  res.json({ ok, lastSync: cache.lastSync, source: cache.source, records: cache.data.length, error: cache.error });
});

// POST /api/upload — recebe registros parseados do CSV e faz upsert no Supabase
app.post('/api/upload', requireAuth, async (req, res) => {
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

app.get('/api/meta', requireAuth, (req, res) => {
  const crimes = uniq(cache.data.map(r => r.crime));
  const meses  = uniq(cache.data.map(r => r.mes)).sort((a, b) => MES_ORD.indexOf(a) - MES_ORD.indexOf(b));
  const muns   = uniq(cache.data.map(r => r.mun)).sort((a, b) => {
    const ciaA = cache.data.find(r => r.mun === a)?.cia || '';
    const ciaB = cache.data.find(r => r.mun === b)?.cia || '';
    return ciaA !== ciaB ? ciaA.localeCompare(ciaB) : a.localeCompare(b);
  });
  const cias   = uniq(cache.data.map(r => r.cia)).sort();
  res.json({ crimes: CRIMES_ORD.filter(c => crimes.includes(c)), meses, muns, cias });
});

app.get('/api/registros', requireAuth, (req, res) => {
  res.json(filtrar(req.query));
});

app.get('/api/registros/crimes', requireAuth, (req, res) => {
  res.json(CRIMES_ORD.filter(c => uniq(cache.data.map(r => r.crime)).includes(c)));
});

app.get('/api/registros/meses', requireAuth, (req, res) => {
  res.json(uniq(cache.data.map(r => r.mes)).sort((a, b) => MES_ORD.indexOf(a) - MES_ORD.indexOf(b)));
});

app.get('/api/registros/muns', requireAuth, (req, res) => {
  res.json(uniq(cache.data.map(r => r.mun)).sort());
});

app.get('/api/registros/cias', requireAuth, (req, res) => {
  res.json(uniq(cache.data.map(r => r.cia)).sort());
});

// ---------------------------------------------------------------------------
// Analytics — módulos
// ---------------------------------------------------------------------------
const { pressureByCity }               = require('./analytics/crimePressureIndex');
const { trendByCity }                  = require('./analytics/trendAnalysis');
const { deviationSummaryByCity }       = require('./analytics/targetDeviation');
const { fullRanking, rankingByPressure, rankingByPriority } = require('./analytics/cityRanking');
const { priorityRanking }              = require('./analytics/priorityScore');
const { generateInsights }             = require('./analytics/insightGenerator');

// Helper: extrai filtros de query aceitos pelos módulos analíticos
function analyticsFilters(query) {
  const { mes, crime, cia } = query;
  return { mes, crime, cia };
}

// GET /api/analytics/pressure
// Índice de pressão criminal por município/crime (acima/abaixo da meta)
app.get('/api/analytics/pressure', requireAuth, (req, res) => {
  try {
    const filters = analyticsFilters(req.query);
    const top     = parseInt(req.query.top) || 0;
    let result    = pressureByCity(cache.data, filters)
      .filter(i => i.pressure_index !== null)
      .sort((a, b) => b.pressure_index - a.pressure_index);
    if (top > 0) result = result.slice(0, top);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/trends
// Tendências de crescimento criminal por município/crime
app.get('/api/analytics/trends', requireAuth, (req, res) => {
  try {
    const filters = analyticsFilters(req.query);
    const top     = parseInt(req.query.top) || 0;
    let result    = trendByCity(cache.data, filters)
      .filter(i => i.trend_growth !== null);
    if (top > 0) result = result.slice(0, top);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/priority-ranking
// Ranking de prioridade operacional (combinado: pressão + tendência + volume)
app.get('/api/analytics/priority-ranking', requireAuth, (req, res) => {
  try {
    const filters = analyticsFilters(req.query);
    const top     = parseInt(req.query.top) || 10;
    const mode    = req.query.mode || 'priority'; // 'priority' | 'pressure' | 'full'

    let result;
    if (mode === 'pressure') {
      result = rankingByPressure(cache.data, filters, top);
    } else if (mode === 'full') {
      result = fullRanking(cache.data, filters, top);
    } else {
      result = rankingByPriority(cache.data, filters, top);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/insights
// Insights automáticos em linguagem natural
app.get('/api/analytics/insights', requireAuth, (req, res) => {
  try {
    const filters  = analyticsFilters(req.query);
    const insights = generateInsights(cache.data, filters);
    res.json({ insights, generated_at: new Date().toISOString(), filters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/deviation
// Desvio de meta por município/crime (mantém lógica existente + enriquece)
app.get('/api/analytics/deviation', requireAuth, (req, res) => {
  try {
    const filters = analyticsFilters(req.query);
    const result  = deviationSummaryByCity(cache.data, filters)
      .sort((a, b) => (b.percentual ?? 0) - (a.percentual ?? 0));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    if (supabase) console.log(`  Supabase: ${SUPABASE_URL}`);
    else          console.log(`  ⚠ Configure SUPABASE_URL e SUPABASE_KEY no server.js`);
  });
});
