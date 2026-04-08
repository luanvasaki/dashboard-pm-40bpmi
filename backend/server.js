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
const USUARIOS_TABLE     = 'usuarios';
const OCORRENCIAS_TABLE  = 'ocorrencias';

// Helpers de normalização para dados InfoCrim
function normCia(s) { return (s||'').replace(/^(\d+ª)CIA$/,'$1 CIA').trim(); }
const _MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function normMes(s) {
  const v = (s||'').trim();
  const found = _MESES_PT.find(m => m.toLowerCase().startsWith(v.slice(0,3).toLowerCase()));
  return found || (v.charAt(0).toUpperCase() + v.slice(1).toLowerCase());
}
function titleCase(s){ return (s||'').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()); }
function parseDateBR(s){ if(!s)return null; const[d,m,y]=(s||'').split('/'); if(!d||!m||!y)return null; return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }
function parseHora(s){ if(!s||!s.trim())return null; const p=s.trim().split(':'); return p.length<2?null:`${p[0].padStart(2,'0')}:${p[1].padStart(2,'0')}`; }

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
    if (req.user?.role === 'ti' || roles.includes(req.user?.role)) return next();
    return res.status(403).json({ error: 'Acesso negado' });
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
  const _norm = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const _canonicalize = raw => CRIMES_ORD.find(c => _norm(c) === _norm(raw)) || raw;
  return {
    ano:      parseInt(get('Ano'))                         || 0,
    mes:      get('Mes')                                   || '',
    cia:      get('Cia')                                   || '',
    mun:      get('Municipio')                             || '',
    crime:    _canonicalize(get('Crime') || ''),
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
    const secaoTrim = secao.trim();
    const autoRole = secaoTrim === 'P1' ? 'p1' : 'viewer';
    const { error } = await supabase.from(USUARIOS_TABLE).insert({
      nome:       nome.trim(),
      posto:      posto.trim(),
      matricula:  matricula.trim().toUpperCase(),
      senha_hash: hash,
      secao:      secaoTrim,
      role:       autoRole,
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

    const payload = { id: data.id, nome: data.nome, matricula: data.matricula, role: data.role, secao: data.secao, resetSenha: data.reset_senha === true };
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

// POST /api/auth/nova-senha — define nova senha após reset obrigatório
app.post('/api/auth/nova-senha', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco não configurado' });
  const { senha } = req.body;
  if (!senha || senha.length < 6) return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
  try {
    const hash = await bcrypt.hash(senha, 10);
    const { error } = await supabase.from(USUARIOS_TABLE).update({ senha_hash: hash, reset_senha: false }).eq('id', req.user.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  const { status, role, secao } = req.body;
  const updates = {};
  if (status) updates.status = status;
  if (role   && ['admin', 'p3', 'ti'].includes(req.user.role)) updates.role  = role;
  if (secao  && ['admin', 'p3', 'ti'].includes(req.user.role)) updates.secao = secao;

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

// PATCH /api/admin/users/:id/posto — altera posto/graduação (admin, p1, p3, ti)
app.patch('/api/admin/users/:id/posto', requireAuth, requireRole('admin', 'p1', 'p3', 'ti'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco de dados não configurado' });
  const { posto } = req.body;
  if (!posto || !posto.trim()) return res.status(400).json({ error: 'Posto/Grad não informado' });
  try {
    const { data: target } = await supabase.from(USUARIOS_TABLE).select('role').eq('id', req.params.id).single();
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (target.role === 'admin') return res.status(403).json({ error: 'Usuário protegido — não pode ser alterado.' });
    const { error } = await supabase.from(USUARIOS_TABLE).update({ posto: posto.trim() }).eq('id', req.params.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/:id/reset-senha — define matrícula como senha temporária (apenas p3)
app.post('/api/admin/users/:id/reset-senha', requireAuth, requireRole('admin', 'p3'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco não configurado' });
  try {
    const { data: target } = await supabase.from(USUARIOS_TABLE).select('role, matricula').eq('id', req.params.id).single();
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (target.role === 'admin') return res.status(403).json({ error: 'Usuário protegido' });
    const hash = await bcrypt.hash(target.matricula, 10);
    const { error } = await supabase.from(USUARIOS_TABLE).update({ senha_hash: hash, reset_senha: true }).eq('id', req.params.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true, matricula: target.matricula });
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

  const { records, overrideAno } = req.body;
  if (!records?.length) return res.status(400).json({ error: 'Nenhum registro recebido.' });

  try {
    // Helper: busca campo case-insensitive no objeto
    const gf = (r, name) => { const k = Object.keys(r).find(k => k.toLowerCase() === name.toLowerCase()); return k ? r[k] : ''; };

    // Mapeia os campos do CSV para as colunas exatas da tabela no Supabase
    const rows = records.map(r => ({
      'Ano':       overrideAno ? parseInt(overrideAno) : (parseInt(gf(r,'ano')) || 0),
      'Mes':       (gf(r,'mes')        || '').trim(),
      'Cia':       (gf(r,'cia')        || '').trim(),
      'Municipio': (gf(r,'municipio')  || '').trim(),
      'Crime':     (() => { const _n = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(); const raw = (gf(r,'crime')||'').trim(); return CRIMES_ORD.find(c => _n(c) === _n(raw)) || raw; })(),
      'Anterior':  parseFloat(gf(r,'anterior'))                              || 0,
      'Meta':      parseFloat(gf(r,'meta'))                                  || 0,
      'Avaliado':  parseFloat(gf(r,'avaliado'))                              || 0,
      'Tendencia': parseFloat(gf(r,'tendencia') || gf(r,'tendência'))        || 0,
      'Variação':  (gf(r,'variação') || gf(r,'variacao') || '').trim()
    })).filter(r => r['Mes'] && r['Crime'] && r['Ano'] > 0);

    if (!rows.length) return res.status(400).json({ error: 'Nenhum registro válido após validação.' });

    // Apaga todos os registros dos anos presentes no arquivo antes de inserir
    const anosPresentes = [...new Set(rows.map(r => r['Ano']))];
    for (const ano of anosPresentes) {
      const { error: delError } = await supabase.from(TABLE_NAME).delete().eq('Ano', ano);
      if (delError) throw new Error(delError.message);
    }

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

// POST /api/upload/ocorrencias — importa CSV do InfoCrim
app.post('/api/upload/ocorrencias', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  const { records } = req.body;
  if (!records?.length) return res.status(400).json({ error: 'Nenhum registro recebido.' });
  try {
    const rows = records.map(r => ({
      data_ocorrencia: parseDateBR(r.DataOcorrencia),
      hora_ocorrencia: parseHora(r.HoraOcorrencia),
      periodo:         (r.PeriodoEstimado || '').trim(),
      dia_semana:      (r.DiaSemana       || '').trim(),
      flagrante:       (r.Flagrante || '').toLowerCase() === 'sim',
      rubrica:         (r.Rubrica   || '').trim(),
      conduta:         (r.Conduta   || '').trim(),
      batalhao:        (r.BatalhaoCircunscricao       || '').trim(),
      cia:             normCia(r.CompanhiaCircunscricao || ''),
      municipio:       titleCase(r.MunicipioCircunscricao || ''),
      bairro:          titleCase(r.Bairro     || ''),
      tipo_local:      (r.TipoLocal || '').trim(),
    })).filter(r => r.data_ocorrencia && r.rubrica);
    if (!rows.length) return res.status(400).json({ error: 'Nenhum registro válido após validação.' });
    // Apaga todos os registros anteriores para evitar duplicação
    const { error: delError } = await supabase.from(OCORRENCIAS_TABLE).delete().not('rubrica', 'is', null);
    if (delError) throw new Error('Erro ao limpar ocorrências: ' + delError.message);
    const BATCH = 500;
    let total = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase.from(OCORRENCIAS_TABLE).insert(rows.slice(i, i + BATCH));
      if (error) throw new Error(error.message);
      total += rows.slice(i, i + BATCH).length;
    }
    res.json({ ok: true, inserted: total });
  } catch (err) {
    console.error('✗ Erro no upload de ocorrências:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/ocorrencias — consulta ocorrências com filtros
app.get('/api/ocorrencias', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  const { rubrica, cia, municipio, limit = 2000 } = req.query;
  try {
    let q = supabase.from(OCORRENCIAS_TABLE).select('*')
      .order('data_ocorrencia', { ascending: false })
      .limit(parseInt(limit));
    if (rubrica)    q = q.ilike('rubrica', `%${rubrica}%`);
    if (cia)        q = q.eq('cia', cia);
    if (municipio)  q = q.eq('municipio', municipio);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
  const anos   = uniq(cache.data.map(r => r.ano).filter(a => a > 0)).sort((a, b) => b - a);
  res.json({ crimes: CRIMES_ORD.filter(c => crimes.includes(c)), meses, muns, cias, anos });
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

// ── EFETIVO P1 ──────────────────────────────────────────────────────────────
const EFETIVO_TABLE = 'efetivo_pm';

app.get('/api/efetivo', requireAuth, async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase.from(EFETIVO_TABLE).select('*');
    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/efetivo/upload', requireAuth, requireRole('admin', 'p3'), async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
    const { records } = req.body;
    if (!Array.isArray(records) || !records.length) return res.status(400).json({ error: 'Nenhum registro recebido.' });

    const gf = (r, ...names) => {
      for (const name of names) {
        const k = Object.keys(r).find(k => k.toLowerCase() === name.toLowerCase());
        if (k) return (r[k] || '').toString().trim();
      }
      return '';
    };

    const rows = records.map(r => ({
      opm:               gf(r, 'OPM', 'opm'),
      posto:             gf(r, 'Posto', 'posto', 'Posto / Grad', 'posto / grad'),
      re:                gf(r, 'RE', 're'),
      nome:              gf(r, 'Nome', 'nome', 'Nome Completo', 'nome completo'),
      funcao:            gf(r, 'Funcao', 'funcao', 'Função', 'função'),
      genero:            gf(r, 'Genero', 'genero', 'Gênero', 'gênero'),
      nome_guerra:       gf(r, 'NomeGuerra', 'nomeguerra', 'Nome de Guerra', 'nome de guerra'),
      data_eap:          gf(r, 'DataEAP', 'dataeap', 'DATA EAP', 'data eap') || null,
      possui_restricao:  gf(r, 'PossuiRestricao', 'possui_restricao', 'Possui Restrição', 'possui restrição'),
      tipos_restricao:   gf(r, 'TiposRestricao', 'tipos_restricao', 'Tipos de Restrição', 'tipos de restrição'),
      restricao_inicio:  gf(r, 'RestricaoInicio', 'restricao_inicio', 'Restrição Inicio', 'restrição inicio') || null,
      restricao_termino: gf(r, 'RestricaoTermino', 'restricao_termino', 'Restrição Término', 'restrição término') || null,
    })).filter(r => r.nome && r.posto);

    if (!rows.length) return res.status(400).json({ error: 'Nenhum registro válido. Verifique as colunas do CSV.' });

    // Apaga tudo e re-insere
    await supabase.from(EFETIVO_TABLE).delete().not('nome', 'is', null);

    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase.from(EFETIVO_TABLE).insert(rows.slice(i, i + BATCH));
      if (error) throw new Error(error.message);
      inserted += Math.min(BATCH, rows.length - i);
    }
    res.json({ ok: true, inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AFASTAMENTOS P1 ─────────────────────────────────────────────────────────
const AFASTAMENTOS_TABLE = 'afastamentos_pm';

app.get('/api/afastamentos', requireAuth, async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase.from(AFASTAMENTOS_TABLE).select('*');
    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/afastamentos/upload', requireAuth, requireRole('admin', 'p3'), async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
    const { records } = req.body;
    if (!Array.isArray(records) || !records.length) return res.status(400).json({ error: 'Nenhum registro recebido.' });

    const gf = (r, ...names) => {
      for (const name of names) {
        const k = Object.keys(r).find(k => k.toLowerCase() === name.toLowerCase());
        if (k) return (r[k] || '').toString().trim();
      }
      return '';
    };

    // Converte DD/MM/YYYY ou DD/MM/YY para YYYY-MM-DD
    const parseDate = s => {
      if (!s) return null;
      // Já está em ISO
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const p = s.split('/');
      if (p.length !== 3) return null;
      const [d, m, y] = p;
      const yr = y.length === 2 ? '20' + y : y;
      return `${yr}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    };

    const rows = records.map(r => ({
      re:               gf(r, 'RE', 're'),
      nome:             gf(r, 'Nome', 'nome', 'Nome Completo'),
      opm:              gf(r, 'OPM', 'opm'),
      tipo_afastamento: gf(r, 'Tipo', 'tipo', 'Tipo de Afastamento', 'TipoAfastamento'),
      n_dias:           parseInt(gf(r, 'NDias', 'n_dias', 'N° de dias', 'N de dias', 'Nº de dias')) || null,
      inicio:           parseDate(gf(r, 'Inicio', 'inicio', 'Início')),
      termino:          parseDate(gf(r, 'Termino', 'termino', 'Término')),
      nbi:              gf(r, 'NBI', 'nbi'),
      bol_g:            gf(r, 'BolG', 'bol_g', 'Bol G', 'Bol. G'),
      sipa:             gf(r, 'SIPA', 'sipa'),
      sgp:              gf(r, 'SGP', 'sgp'),
      paf:              gf(r, 'PAF', 'paf'),
      obs:              gf(r, 'Obs', 'obs', 'Observação', 'Observacao'),
    })).filter(r => r.re && r.tipo_afastamento && r.inicio && r.termino);

    if (!rows.length) return res.status(400).json({ error: 'Nenhum registro válido. Verifique RE, Tipo, Início e Término.' });

    await supabase.from(AFASTAMENTOS_TABLE).delete().not('re', 'is', null);

    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase.from(AFASTAMENTOS_TABLE).insert(rows.slice(i, i + BATCH));
      if (error) throw new Error(error.message);
      inserted += Math.min(BATCH, rows.length - i);
    }
    res.json({ ok: true, inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FOTOS PM ─────────────────────────────────────────────────────────────────
const FOTOS_TABLE = 'fotos_pm';

// GET /api/p1/foto/:re — qualquer usuário autenticado pode visualizar
app.get('/api/p1/foto/:re', requireAuth, async (req, res) => {
  try {
    if (!supabase) return res.json({ foto_base64: null });
    const { data, error } = await supabase
      .from(FOTOS_TABLE)
      .select('re, foto_base64, updated_at')
      .eq('re', req.params.re)
      .single();
    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    res.json(data || { foto_base64: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/p1/foto/:re — somente perfil 'p1' ou 'admin' pode fazer upload/alterar
app.post('/api/p1/foto/:re', requireAuth, requireRole('admin', 'p1'), async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
    const { foto_base64 } = req.body;
    if (!foto_base64 || !foto_base64.startsWith('data:image/'))
      return res.status(400).json({ error: 'Imagem inválida. Envie um arquivo de imagem (JPG, PNG).' });
    if (foto_base64.length > 1_100_000)
      return res.status(400).json({ error: 'Imagem muito grande. Máximo 800 KB após compressão.' });
    const { error } = await supabase.from(FOTOS_TABLE).upsert(
      { re: req.params.re, foto_base64, updated_at: new Date().toISOString() },
      { onConflict: 're' }
    );
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/p1/foto/:re — somente perfil 'p1' ou 'admin' pode remover
app.delete('/api/p1/foto/:re', requireAuth, requireRole('admin', 'p1'), async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
    const { error } = await supabase.from(FOTOS_TABLE).delete().eq('re', req.params.re);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── VAGAS PM (EFETIVO FIXADO) ────────────────────────────────────────────────
const VAGAS_TABLE = 'vagas_pm';

app.get('/api/p1/vagas', requireAuth, async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase.from(VAGAS_TABLE).select('*').order('opm');
    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/p1/vagas', requireAuth, requireRole('admin', 'p1'), async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
    const { opm, vagas } = req.body;
    if (!opm || vagas == null || isNaN(Number(vagas)) || Number(vagas) < 0)
      return res.status(400).json({ error: 'OPM e vagas (número ≥ 0) são obrigatórios.' });
    const { error } = await supabase.from(VAGAS_TABLE).upsert(
      { opm: opm.trim(), vagas: Number(vagas), updated_at: new Date().toISOString() },
      { onConflict: 'opm' }
    );
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// PRODUTIVIDADE P3
// ---------------------------------------------------------------------------
const PROD_TABS = {
  ocorrencias:   'prod_ocorrencias',
  presos:        'prod_pessoas_presas',
  armas:         'prod_armas',
  veiculos:      'prod_veiculos',
  entorpecentes: 'prod_entorpecentes'
};

function mapProdRow(tipo, r) {
  const cia = normCia(r['CIA'] || r['Cia'] || '');
  const ano = parseInt(r['Ano de Data']) || 0;
  const mes = normMes(r['Mês de Data'] || r['Mes de Data'] || '');
  if (tipo === 'ocorrencias') return {
    grupo_natureza:    (r['Grupo de Natureza'] || '').trim(),
    natureza:          (r['Natureza da Ocorrência'] || r['Natureza da Ocorrencia'] || '').trim(),
    numero_ocorrencia: (r['Número da Ocorrência'] || r['Numero da Ocorrencia'] || '').trim(),
    us: (r['US'] || '').trim(), cia, ano, mes,
    contagem: parseInt(r['Contagem de Ocorrências'] || r['Contagem de Ocorrencias']) || 0
  };
  if (tipo === 'presos') return {
    situacao:  (r['Situação da Pessoa'] || r['Situacao da Pessoa'] || '').trim(),
    ano, mes, cia, quantidade: parseInt(r['Quantidade de Pessoas']) || 0
  };
  if (tipo === 'armas') return {
    tipo_arma: (r['Tipo da Arma'] || '').trim(),
    calibre:   (r['Calibre'] || '').trim(),
    ano, mes, cia, quantidade: parseInt(r['Quantidade de Armas']) || 0
  };
  if (tipo === 'veiculos') return {
    situacao:  (r['Situacao do Veículo'] || r['Situação do Veículo'] || r['Situacao do Veiculo'] || '').trim(),
    ano, mes, cia,
    quantidade: parseInt(r['Contagem Quantidade de Veículos'] || r['Contagem Quantidade de Veiculos'] || r['Contagem de Veículos']) || 0
  };
  if (tipo === 'entorpecentes') return {
    unidade_medida: (r['Unidade de Medida (Consulta do SQL personalizado)'] || r['Unidade de Medida'] || '').trim(),
    entorpecente:   (r['Entorpecente'] || '').trim(),
    ano, mes, cia, quantidade: parseFloat(r['Quantidade de Entorpecentes']) || 0
  };
  return null;
}

app.get('/api/prod/:tipo', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  const tab = PROD_TABS[req.params.tipo];
  if (!tab) return res.status(400).json({ error: 'Tipo inválido' });
  try {
    const { data, error } = await supabase.from(tab).select('*').limit(50000);
    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upload/prod/:tipo', requireAuth, requireRole('admin', 'p3'), async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  const tab = PROD_TABS[req.params.tipo];
  if (!tab) return res.status(400).json({ error: 'Tipo inválido' });
  const { records } = req.body;
  if (!records?.length) return res.status(400).json({ error: 'Nenhum registro recebido.' });
  try {
    const rows = records.map(r => mapProdRow(req.params.tipo, r)).filter(r => r && r.ano > 0 && r.mes);
    if (!rows.length) return res.status(400).json({ error: 'Nenhum registro válido após validação.' });
    const anos = [...new Set(rows.map(r => r.ano))];
    for (const ano of anos) {
      const { error: delErr } = await supabase.from(tab).delete().eq('ano', ano);
      if (delErr) throw new Error(delErr.message);
    }
    const BATCH = 500;
    let total = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error: insErr } = await supabase.from(tab).insert(rows.slice(i, i + BATCH));
      if (insErr) throw new Error(insErr.message);
      total += Math.min(BATCH, rows.length - i);
    }
    res.json({ ok: true, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/config — configurações globais do dashboard (período, fonte, etc.)
app.get('/api/config', requireAuth, async (req, res) => {
  if (!supabase) return res.json({});
  try {
    const { data, error } = await supabase.from('config_dashboard').select('chave, valor');
    if (error) return res.json({});
    const cfg = {};
    (data || []).forEach(r => { cfg[r.chave] = r.valor; });
    res.json(cfg);
  } catch { res.json({}); }
});

// PUT /api/config — salva configuração (somente admin/p3)
app.put('/api/config', requireAuth, requireRole('admin', 'p3'), async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  const { chave, valor } = req.body;
  if (!chave) return res.status(400).json({ error: 'chave obrigatória' });
  try {
    const { error } = await supabase.from('config_dashboard').upsert({ chave, valor }, { onConflict: 'chave' });
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/indicadores-p3 — qualquer usuário autenticado
app.get('/api/indicadores-p3', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco não configurado' });
  try {
    const { data, error } = await supabase
      .from('indicadores_p3')
      .select('*')
      .order('ano', { ascending: true })
      .order('mes', { ascending: true });
    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/indicadores-p3 — upsert (somente admin/p3/ti)
app.post('/api/indicadores-p3', requireAuth, requireRole('admin', 'p3', 'ti'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco não configurado' });
  const { mes, ano, disque_denuncia, tempo_resposta, cursos_pm, alunos_proerd, atendimento_vitima, conseg_ativo, bairros_pvs } = req.body;
  if (!mes || !ano) return res.status(400).json({ error: 'Mês e ano são obrigatórios' });
  try {
    const { error } = await supabase.from('indicadores_p3').upsert({
      mes, ano,
      disque_denuncia:    disque_denuncia    != null ? Number(disque_denuncia)    : null,
      tempo_resposta:     tempo_resposta     != null ? Number(tempo_resposta)     : null,
      cursos_pm:          cursos_pm          != null ? Number(cursos_pm)          : null,
      alunos_proerd:      alunos_proerd      != null ? Number(alunos_proerd)      : null,
      atendimento_vitima: atendimento_vitima != null ? Number(atendimento_vitima) : null,
      conseg_ativo:       conseg_ativo       != null ? Number(conseg_ativo)       : null,
      bairros_pvs:        bairros_pvs        != null ? Number(bairros_pvs)        : null,
      preenchido_em:      new Date().toISOString(),
      preenchido_por:     req.user.nome || req.user.matricula
    }, { onConflict: 'mes,ano' });
    if (error) throw new Error(error.message);
    res.json({ ok: true });
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
