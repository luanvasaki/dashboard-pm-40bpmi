/**
 * server.js — Servidor único do Dashboard 40º BPM/I (PM-SP)
 * ─────────────────────────────────────────────────────────────
 * Tecnologias: Node.js · Express · Supabase (PostgreSQL) · JWT · bcrypt
 * Porta padrão: 3001
 * Deploy: servidor local dedicado na LAN (ver CLAUDE.md → Deploy)
 *
 * ARQUITETURA GERAL
 * ─────────────────
 * - Todos os dados criminais (RAC PM) ficam em cache em memória (objeto `cache`)
 *   e são sincronizados com o Supabase a cada 5 minutos (CACHE_TTL).
 * - Toda lógica de filtro (KPIs, gráficos, analytics) opera sobre esse cache,
 *   sem consultar o banco diretamente — isso garante baixa latência nas leituras.
 * - O frontend é servido como arquivos estáticos por este mesmo servidor
 *   (pasta ../frontend) via express.static.
 *
 * AUTENTICAÇÃO
 * ────────────
 * - JWT armazenado em cookie httpOnly (auth_token) com expiração de 8h.
 * - Middleware `requireAuth` valida o token em todas as rotas protegidas.
 * - Middleware `requireRole` restringe rotas por perfil de acesso.
 *
 * PERFIS (roles)
 * ──────────────
 *   admin          → acesso total; conta protegida contra exclusão
 *   p3             → gerencia usuários + acesso a P3/analytics
 *   p1             → efetivo PM + upload de fotos
 *   ti             → acesso amplo (equivalente a p3 em quase todas as rotas)
 *   viewer         → somente leitura (padrão para novos usuários)
 *   comandante     → somente leitura
 *   comandante_cia → somente leitura por CIA
 *
 * TABELAS PRINCIPAIS no Supabase
 * ────────────────────────────────
 *   "Base de Dados RAC PM"  → dados criminais (Ano, Mes, Cia, Municipio, Crime, Anterior, Meta, Avaliado, Tendencia)
 *   usuarios                → autenticação própria
 *   ocorrencias             → ocorrências InfoCrim
 *   efetivo_pm              → efetivo P1
 *   afastamentos_pm         → afastamentos
 *   fotos_pm                → fotos em base64
 *   prod_*                  → produtividade P3 (vários subtipos)
 *   indicadores_qualidade_p3→ indicadores manuais P3
 *   disque_denuncia_registros → registros Disque Denúncia
 *   config_dashboard        → configurações chave/valor
 *
 * ⚠ CRÍTICO — para o upload RAC funcionar, o Supabase precisa da constraint:
 *   ALTER TABLE "Base de Dados RAC PM"
 *   ADD CONSTRAINT rac_pm_unique UNIQUE ("Ano","Mes","Cia","Municipio","Crime");
 */

require('dotenv').config();
const express      = require('express');
const compression  = require('compression');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const path         = require('path');
const fs           = require('fs');
const jwt          = require('jsonwebtoken');
const crypto       = require('crypto');
const bcrypt       = require('bcryptjs');
const cookieParser = require('cookie-parser');

const app  = express();
const PORT = process.env.PORT || 3001;

// Confia no 1º hop de proxy para X-Forwarded-For (necessário atrás de Vercel/nginx/IIS —
// sem isso, req.ip cai no IP interno do proxy e o rate limiter de login vira global).
// Em servidor local sem proxy na frente, NÃO confiar: qualquer cliente na rede poderia
// forjar esse header e burlar o rate limiter de login. Ative só com TRUST_PROXY=true.
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

// ============================================================
// AUTENTICAÇÃO — JWT
// Defina JWT_SECRET como variável de ambiente — nunca hardcode
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { console.error('FATAL: variável JWT_SECRET não definida'); process.exit(1); }
const USUARIOS_TABLE     = 'usuarios';
const OCORRENCIAS_TABLE  = 'ocorrencias';

// ═══════════════════════════════════════════════════════════════
// FUNÇÕES UTILITÁRIAS — normalização e parse de dados
// ═══════════════════════════════════════════════════════════════

// Padroniza o nome da CIA: "1a CIA PM" → "1ª CIA", "2ª CIPM" → "2ª CIA", etc.
// Strings que não batem o padrão numérico são devolvidas sem alteração (ex: "FT").
function normCia(s) {
  if (!s) return '';
  const m = s.trim().match(/^(\d+)[ªa°]?\s*cia/i);
  if (m) return m[1] + 'ª CIA';
  return s.trim();
}

// Array de referência com os meses em português na ordem correta (índice 0 = Janeiro).
const _MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Converte número de mês (1-12) ou string abreviada ("jan", "fev"…) para nome completo.
function normMes(s) {
  const v = (s||'').trim();
  if (!v) return '';
  const n = parseInt(v);
  if (!isNaN(n) && n >= 1 && n <= 12) return _MESES_PT[n - 1];
  const found = _MESES_PT.find(m => m.toLowerCase().startsWith(v.slice(0,3).toLowerCase()));
  return found || (v.charAt(0).toUpperCase() + v.slice(1).toLowerCase());
}

// Capitaliza cada palavra de uma string (usado em nomes de bairros e municípios).
function titleCase(s){ return (s||'').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()); }

// Converte data no formato brasileiro DD/MM/YYYY para ISO YYYY-MM-DD (exigido pelo Supabase).
function parseDateBR(s){ if(!s)return null; const[d,m,y]=(s||'').split('/'); if(!d||!m||!y)return null; return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`; }

// Converte string de hora "H:MM" ou "HH:MM:SS" para "HH:MM" com zero à esquerda.
function parseHora(s){ if(!s||!s.trim())return null; const p=s.trim().split(':'); return p.length<2?null:`${p[0].padStart(2,'0')}:${p[1].padStart(2,'0')}`; }

// Faz parse do campo de PMs de cursos (upload manual), que tem formato
// "Posto PM RE Nome; Posto PM RE Nome". Retorna array de objetos
// { posto_pm, re_pm, nome_pm } — um por PM separado por ';'.
function parsePMsField(pmField) {
  if (!pmField || !pmField.trim()) return [];
  return pmField.split(';').map(s => s.trim()).filter(Boolean).map(entry => {
    const m = entry.match(/^(.*?PM)\s+(\d{4,7}-\d)\s+(.+)$/i);
    if (!m) return null;
    return { posto_pm: m[1].trim(), re_pm: m[2].trim(), nome_pm: m[3].trim() };
  }).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARES DE AUTENTICAÇÃO E AUTORIZAÇÃO
// ═══════════════════════════════════════════════════════════════

// Verifica se a requisição possui um JWT válido.
// Aceita token via cookie httpOnly (auth_token) ou header Authorization: Bearer <token>.
// Em caso de sucesso, popula req.user com { id, nome, matricula, role, secao, resetSenha }.
function requireAuth(req, res, next) {
  const cookieToken  = req.cookies?.auth_token;
  const auth         = req.headers.authorization;
  const bearerToken  = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const token        = cookieToken || bearerToken;
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// Fábrica de middleware: restringe a rota aos roles informados.
// ⚠ O perfil 'ti' sempre passa — equivale a admin em quase todas as rotas exceto exclusões críticas.
// Uso: requireRole('admin', 'p3') — bloqueia viewer, comandante, etc.
function requireRole(...roles) {
  return (req, res, next) => {
    if (req.user?.role === 'ti' || roles.includes(req.user?.role)) return next();
    return res.status(403).json({ error: 'Acesso negado' });
  };
}

// Libera rotas que devolvem dados NOMINAIS (com nomes de PMs) de uma ou mais
// seções controladas por secoes_acesso — basta UMA delas estar em nominal/editor.
// Usado com 2 seções nas rotas de UIS/IAS porque esses dados aparecem tanto na
// página UIS quanto embutidos no P1 (badges, KPI, prontuário) — quem tem acesso
// nominal ao P1 precisa ver esses dados ali sem precisar marcar UIS também.
// Acesso 'viewer' (\"Só números\") fica de fora de propósito — essas pessoas
// usam as rotas /stats (sem nome nenhum), nunca as /mapa ou de RE individual.
// admin/ti/p1/p3 sempre passam (mesmo comportamento de requireRole de antes,
// preservado pra não quebrar quem já tinha acesso via role).
function requireSectionNominal(...secoes) {
  return (req, res, next) => {
    const u = req.user;
    if (u?.role === 'ti' || ['admin', 'p1', 'p3'].includes(u?.role)) return next();
    const sa = u?.secoes_acesso || {};
    if (secoes.some(secao => sa[secao] === 'nominal' || sa[secao] === 'editor')) return next();
    return res.status(403).json({ error: 'Acesso negado' });
  };
}

// Fire-and-forget: registra evento na tabela logs_acesso sem bloquear a resposta.
async function logAcesso(req, acao, detalhe, userOverride) {
  if (!supabase) return;
  try {
    const u = userOverride || req.user || {};
    const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    await supabase.from('logs_acesso').insert({
      usuario_id:   u.id   || null,
      usuario_nome: u.nome || null,
      matricula:    u.matricula || null,
      role:         u.role || null,
      secao:        u.secao || null,
      acao,
      detalhe: detalhe || null,
      ip:          fwd || req.socket?.remoteAddress || null,
      user_agent: (req.headers['user-agent'] || '').slice(0, 300),
    });
  } catch (_) {}
}

// ============================================================
// Supabase — credenciais via variáveis de ambiente OBRIGATÓRIAS
// Use a service_role key (não a anon/publishable key)
// Vercel: Settings → Environment Variables
// Local:  arquivo .env (nunca comitar)
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('FATAL: variáveis SUPABASE_URL e SUPABASE_KEY não definidas');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURAÇÕES GLOBAIS
// ═══════════════════════════════════════════════════════════════

// Tempo de vida do cache em memória: 5 minutos. Após esse prazo, syncFromSupabase() é chamado automaticamente.
const CACHE_TTL  = 5 * 60 * 1000;
// ⚠ CRÍTICO: nome exato da tabela no Supabase — sensível a maiúsculas e espaços.
const TABLE_NAME = 'Base de Dados RAC PM';

// Inicializa o cliente Supabase usando a service_role key (bypassa RLS).
let supabase = null;
{
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✓ Supabase client inicializado');
}

// CORS: em produção aceita apenas ALLOWED_ORIGIN; em dev aceita qualquer origem.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || null;

// Cookie Secure: independente de NODE_ENV, porque em servidor local (LAN, sem HTTPS)
// um cookie Secure é descartado pelo navegador e o login quebra silenciosamente.
// Defina COOKIE_SECURE=true no .env apenas quando o servidor estiver atrás de HTTPS real.
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
app.use(compression());
// contentSecurityPolicy desativado para permitir que o frontend carregue CDNs (Chart.js, Lucide, etc.)
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  credentials: true,
  origin: ALLOWED_ORIGIN ? ALLOWED_ORIGIN : (origin, cb) => cb(null, true)
}));
app.use(cookieParser());
// Limite de 10 MB para suportar uploads de CSVs grandes via JSON
app.use(express.json({ limit: '10mb' }));
// Serve o frontend como arquivos estáticos — index.html é o ponto de entrada da SPA
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Rate limiting específico para /api/auth/login: bloqueia após 20 tentativas em 15 min
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

// Ordem canônica dos meses — usada para ordenar listas no frontend e nos KPIs.
const MES_ORD    = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
// Ordem canônica dos crimes — determina a sequência dos cards de KPI no dashboard.
// ⚠ CRÍTICO: não alterar sem verificar o frontend — a ordem impacta o layout visual.
const CRIMES_ORD = ['Homicídio','Estupro','Estupro de Vulnerável','Roubo','Furto','Roubo de Veículos','Furto de Veículos'];

// Cache em memória: toda a API de leitura opera sobre este objeto, não consulta o banco.
// { data: registro[], lastSync: ISO string, source: 'supabase'|'local', error: string|null }
let cache = { data: [], lastSync: null, source: null, error: null };

// ═══════════════════════════════════════════════════════════════
// PARSER CSV E MAPEAMENTO DE DADOS
// ═══════════════════════════════════════════════════════════════

// Parser CSV manual que respeita aspas duplas (campos com vírgula dentro).
// Usado como fallback — o upload principal usa PapaParse no frontend.
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

// Converte um registro bruto do Supabase para o formato interno do cache.
// A busca de chaves é case-insensitive para tolerar variações nos nomes de colunas.
// Campos numéricos são convertidos com parseFloat — valores inválidos viram 0.
// O campo `crime` é canonicalizado para garantir que a grafia bata com CRIMES_ORD.
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
// Helper: busca todas as linhas paginando em lotes de 1000 (limite Supabase)
// ---------------------------------------------------------------------------
async function fetchAll(table, { select = '*', filters = [], order = [] } = {}) {
  const PAGE = 1000;
  let all = [], from = 0;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1);
    filters.forEach(([method, ...args]) => { q = q[method](...args); });
    order.forEach(([col, opts]) => { q = q.order(col, opts); });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// ═══════════════════════════════════════════════════════════════
// CACHE E SINCRONIZAÇÃO COM SUPABASE
// ═══════════════════════════════════════════════════════════════

// Busca todos os registros da tabela RAC PM do Supabase e atualiza o cache em memória.
// É chamada na inicialização e repetida automaticamente a cada CACHE_TTL (5 min).
// Retorna true em caso de sucesso, false em caso de erro (cache não é limpo no erro).
async function syncFromSupabase() {
  if (!supabase) return false;
  try {
    console.log('↻ Sincronizando com Supabase...');
    // Pagina em lotes de 1000 — Supabase limita 1000 linhas por query no server-side
    const PAGE = 1000;
    let allData = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from(TABLE_NAME).select('*').range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      allData = allData.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    if (!allData.length) throw new Error('Nenhum registro encontrado no Supabase');

    cache.data     = allData.map(fromSupabase);
    cache.lastSync = new Date().toISOString();
    cache.source   = 'supabase';
    cache.error    = null;
    invalidateMetaCache();
    console.log(`✓ Supabase: ${cache.data.length} registros carregados (${cache.lastSync})`);
    return true;
  } catch (err) {
    cache.error = err.message;
    console.error('✗ Erro ao sincronizar Supabase:', err.message);
    return false;
  }
}


// Carrega raw_data.json como fallback quando o Supabase não está disponível.
// O arquivo raw_data.json está na raiz do projeto e contém dados de exemplo ou exportação anterior.
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

// Garante que o cache não está velho ANTES de servir uma requisição de dados.
// O setInterval abaixo cobre um servidor sempre ligado; num ambiente
// serverless (Vercel) a função "congela" entre requisições e o timer não
// dispara — então cada instância re-sincroniza sozinha aqui quando percebe
// que passou do TTL. `_syncInFlight` funde requisições concorrentes numa
// sincronização só (evita N syncs simultâneos ao expirar o cache).
let _syncInFlight = null;
async function ensureCacheFresh() {
  if (!supabase) return;
  const ageMs = cache.lastSync ? Date.now() - new Date(cache.lastSync).getTime() : Infinity;
  if (cache.data.length && ageMs < CACHE_TTL) return;
  if (!_syncInFlight) {
    _syncInFlight = syncFromSupabase()
      .then(ok => { if (!ok && !cache.data.length) loadLocalFallback(); })
      .catch(err => console.error('✗ ensureCacheFresh:', err.message))
      .finally(() => { _syncInFlight = null; });
  }
  await _syncInFlight;
}

// Middleware: aplica a checagem de frescor só nas rotas que leem o cache
// em memória (metadados, registros RAC, analytics). Nunca derruba a
// requisição — se a sync falhar, segue com o cache que tiver.
async function withFreshCache(req, res, next) {
  try { await ensureCacheFresh(); } catch (e) { /* já logado */ }
  next();
}

// ═══════════════════════════════════════════════════════════════
// INICIALIZAÇÃO DO SERVIDOR
// ═══════════════════════════════════════════════════════════════

// Sequência de inicialização: tenta Supabase → fallback para arquivo local.
// Após carregar, agenda sincronização periódica a cada CACHE_TTL.
async function init() {
  if (supabase) {
    const ok = await syncFromSupabase();
    if (!ok) loadLocalFallback();
  } else {
    console.warn('⚠ Supabase não configurado. Usando raw_data.json local.');
    loadLocalFallback();
  }

  // Servidor sempre ligado: refresh proativo. Serverless: não dispara, mas
  // aí o withFreshCache cobre. Passa pelo ensureCacheFresh pra compartilhar
  // o lock _syncInFlight com os refreshes disparados por requisição.
  setInterval(() => { ensureCacheFresh().catch(() => {}); }, CACHE_TTL);
}

// ═══════════════════════════════════════════════════════════════
// HELPERS DE FILTRO
// ═══════════════════════════════════════════════════════════════

// Filtra o cache em memória pelos parâmetros fornecidos.
// Qualquer parâmetro omitido (null/undefined/'') é ignorado — funciona como AND entre os presentes.
function filtrar({ mes, crime, mun, cia }) {
  return cache.data.filter(r =>
    (!mes   || r.mes   === mes)   &&
    (!crime || r.crime === crime) &&
    (!mun   || r.mun   === mun)   &&
    (!cia   || r.cia   === cia)
  );
}

// Remove duplicatas de um array (equivalente a [...new Set(arr)]).
function uniq(arr) { return [...new Set(arr)]; }

// ═══════════════════════════════════════════════════════════════
// ROTAS DE AUTENTICAÇÃO
// ═══════════════════════════════════════════════════════════════

// [POST /api/auth/register] — cadastro de novo usuário (aberto, sem auth)
// O usuário fica com status 'pending' até aprovação manual pelo P3.
// Role atribuído automaticamente: P1 → 'p1', qualquer outra seção → 'viewer'.
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

// [POST /api/auth/login] — autenticação por matrícula + senha
// Limitado a 20 tentativas por 15 min (loginLimiter) para evitar força bruta.
// Em caso de sucesso, emite JWT em cookie httpOnly com expiração de 8h.
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco de dados não configurado' });
  const { matricula, senha } = req.body;
  if (!matricula || !senha) return res.status(400).json({ error: 'Preencha todos os campos' });

  try {
    const { data, error } = await supabase
      .from(USUARIOS_TABLE)
      .select('*')
      .eq('matricula', matricula.trim().toUpperCase())
      .single();

    if (error || !data) { await logAcesso(req, 'login_falhou', `Matrícula não encontrada: ${matricula}`); return res.status(401).json({ error: 'Matrícula ou senha incorretos' }); }
    if (data.status === 'pending')
      return res.status(403).json({ error: 'Cadastro aguardando aprovação da seção P1 ou P3' });
    if (data.status === 'rejected')
      return res.status(403).json({ error: 'Cadastro recusado. Entre em contato com a seção P1 ou P3' });

    const ok = await bcrypt.compare(senha, data.senha_hash);
    if (!ok) { await logAcesso(req, 'login_falhou', `Senha incorreta: ${matricula}`); return res.status(401).json({ error: 'Matrícula ou senha incorretos' }); }

    const payload = { id: data.id, nome: data.nome, matricula: data.matricula, role: data.role, secao: data.secao, resetSenha: data.reset_senha === true, secoes_acesso: data.secoes_acesso || {} };
    const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: 'strict',
      maxAge: 8 * 60 * 60 * 1000
    });
    await logAcesso(req, 'login', null, payload);
    res.json({ user: payload });
  } catch (err) {
    console.error('✗ Erro no login:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// [GET /api/auth/me] — retorna os dados do usuário logado (decodificados do JWT).
// Usado pelo frontend para checar role/permissões sem fazer nova chamada de login.
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// [POST /api/auth/logout] — invalida o cookie de sessão no cliente.
// O JWT não é revogado no servidor (stateless) — o cookie simplesmente é apagado.
app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await logAcesso(req, 'logout', null);
  res.clearCookie('auth_token', { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'strict' });
  res.json({ ok: true });
});

// [POST /api/auth/nova-senha] — define nova senha quando reset_senha=true no JWT.
// O P3 pode forçar um reset; na próxima vez que o usuário logar, o frontend redireciona para esta rota.
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

// ═══════════════════════════════════════════════════════════════
// ROTAS DE ADMINISTRAÇÃO DE USUÁRIOS (admin / p3)
// ═══════════════════════════════════════════════════════════════

// [GET /api/admin/users] — lista todos os usuários (sem senha_hash), ordenados por criação.
app.get('/api/admin/users', requireAuth, requireRole('admin', 'p1', 'p3'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco de dados não configurado' });
  try {
    const { data, error } = await supabase
      .from(USUARIOS_TABLE)
      .select('id, nome, posto, matricula, secao, role, status, created_at, secoes_acesso')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [GET /api/admin/users/pending/count] — contagem de usuários pendentes, sem carregar a lista completa.
app.get('/api/admin/users/pending/count', requireAuth, requireRole('admin', 'p1', 'p3', 'ti'), async (req, res) => {
  if (!supabase) return res.json({ count: 0 });
  try {
    const { count, error } = await supabase
      .from(USUARIOS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    if (error) throw new Error(error.message);
    res.json({ count: count || 0 });
  } catch (_) {
    res.json({ count: 0 });
  }
});

// [PATCH /api/admin/users/:id] — aprova/rejeita status, atualiza seção e secoes_acesso.
// P1 pode gerenciar status/seção; apenas admin/p3/ti podem alterar secoes_acesso/role (evita auto-escalação).
// secoes_acesso auto-deriva o role interno para manter compatibilidade com requireRole.
// Usuários com role 'admin' são protegidos contra qualquer alteração.
app.patch('/api/admin/users/:id', requireAuth, requireRole('admin', 'p1', 'p3'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco de dados não configurado' });
  const { status, secao, secoes_acesso } = req.body;
  const updates = {};
  const canAdmin = ['admin', 'p3', 'ti'].includes(req.user.role);

  if (status) updates.status = status;
  if (secao) updates.secao = secao; // p1 também pode atualizar seção

  if (secoes_acesso !== undefined && typeof secoes_acesso === 'object') {
    if (!canAdmin) return res.status(403).json({ error: 'Apenas admin/p3/ti podem alterar nível de acesso.' });
    if (String(req.params.id) === String(req.user.id)) return res.status(403).json({ error: 'Não é possível alterar seu próprio nível de acesso.' });
    updates.secoes_acesso = secoes_acesso;
    // Deriva role automaticamente para manter autorização backend funcional
    const sa = secoes_acesso;
    if (sa.p3 === 'editor') updates.role = 'p3';
    else if (sa.p1 === 'editor' || sa.uis === 'editor') updates.role = 'p1';
    else updates.role = 'viewer';
  }

  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nenhuma alteração informada' });

  try {
    const { data: target } = await supabase.from(USUARIOS_TABLE).select('role').eq('id', req.params.id).single();
    if (target?.role === 'admin') return res.status(403).json({ error: 'Usuário protegido — não pode ser alterado.' });
    // Roles especiais não podem ser sobrescritos pela derivação de secoes_acesso
    if (target?.role === 'ti' && updates.role) delete updates.role;

    const { error } = await supabase.from(USUARIOS_TABLE).update(updates).eq('id', req.params.id);
    if (error) throw new Error(error.message);
    await logAcesso(req, 'admin_usuario_editado', `ID ${req.params.id}: ${JSON.stringify(updates)}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [PATCH /api/admin/users/:id/posto] — atualiza posto/graduação do usuário (mais permissivo que alterar role).
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
    await logAcesso(req, 'admin_posto_editado', `ID ${req.params.id}: ${posto.trim()}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [POST /api/admin/users/:id/reset-senha] — redefine a senha do usuário para uma senha temporária aleatória.
// Restrito a admin/p3 (p1 não pode resetar senha de terceiros — evita takeover de contas p3/ti).
// Apenas admin pode resetar contas ti (evita p3 escalar via reset de conta ti).
// Marca reset_senha=true: o frontend obriga troca de senha no próximo login.
app.post('/api/admin/users/:id/reset-senha', requireAuth, requireRole('admin', 'p3'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco não configurado' });
  try {
    const { data: target } = await supabase.from(USUARIOS_TABLE).select('role, matricula').eq('id', req.params.id).single();
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (target.role === 'admin') return res.status(403).json({ error: 'Usuário protegido' });
    if (target.role === 'ti' && req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas admin pode resetar a senha de uma conta ti.' });
    const tempSenha = crypto.randomBytes(6).toString('base64url'); // ~8 chars aleatórios
    const hash = await bcrypt.hash(tempSenha, 10);
    const { error } = await supabase.from(USUARIOS_TABLE).update({ senha_hash: hash, reset_senha: true }).eq('id', req.params.id);
    if (error) throw new Error(error.message);
    await logAcesso(req, 'admin_reset_senha', `ID ${req.params.id} (${target.matricula})`);
    res.json({ ok: true, senhaTemporaria: tempSenha });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [DELETE /api/admin/users/:id] — exclusão permanente de usuário. Role 'admin' é protegido.
app.delete('/api/admin/users/:id', requireAuth, requireRole('admin', 'p3'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco de dados não configurado' });
  try {
    const { data: target } = await supabase.from(USUARIOS_TABLE).select('role').eq('id', req.params.id).single();
    if (target?.role === 'admin') return res.status(403).json({ error: 'Usuário protegido — não pode ser excluído.' });

    const { error } = await supabase.from(USUARIOS_TABLE).delete().eq('id', req.params.id);
    if (error) throw new Error(error.message);
    await logAcesso(req, 'admin_usuario_excluido', `ID ${req.params.id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS DE DADOS — STATUS E SINCRONIZAÇÃO
// ═══════════════════════════════════════════════════════════════

// [GET /api/status] — retorna estado atual do cache: última sync, fonte, total de registros, erros.
app.get('/api/status', requireAuth, (req, res) => {
  res.json({
    lastSync:           cache.lastSync,
    source:             cache.source,
    records:            cache.data.length,
    error:              cache.error,
    supabaseConfigured: !!supabase
  });
});

// [GET /api/sync] — força sincronização imediata com o Supabase, sem esperar o TTL.
// Útil após um upload manual para ver os dados atualizados antes dos 5 min.
app.post('/api/sync', requireAuth, async (req, res) => {
  if (!supabase) return res.status(400).json({ error: 'Supabase não configurado no server.js' });
  let ok = await syncFromSupabase();
  res.json({ ok, lastSync: cache.lastSync, source: cache.source, records: cache.data.length, error: cache.error });
});

// ═══════════════════════════════════════════════════════════════
// ROTAS DE UPLOAD — BANCO RAC PM
// ═══════════════════════════════════════════════════════════════

// [POST /api/upload] — importa CSV do Banco RAC PM (crimes, metas, avaliados).
// Fluxo: recebe records[] do frontend → valida → apaga anos presentes → upsert → sincroniza cache.
// Requer role: admin, p3 ou ti.
app.post('/api/upload', requireAuth, requireRole('admin', 'p3', 'ti'), async (req, res) => {
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
      'Mes':       normMes(gf(r,'mes')  || ''),
      'Cia':       (gf(r,'cia')        || '').trim(),
      'Municipio': (gf(r,'municipio')  || '').trim(),
      'Crime':     (() => { const _n = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(); const raw = (gf(r,'crime')||'').trim(); return CRIMES_ORD.find(c => _n(c) === _n(raw)) || raw; })(),
      'Anterior':  parseFloat(gf(r,'anterior'))                              || 0,
      'Meta':      parseFloat(gf(r,'meta'))                                  || 0,
      'Avaliado':  parseFloat(gf(r,'avaliado'))                              || 0,
      'Tendencia': parseFloat(gf(r,'tendencia') || gf(r,'tendência'))        || 0,
      'Variação':  (gf(r,'variação') || gf(r,'variacao') || '').trim()
    })).filter(r => r['Mes'] && r['Crime'] && r['Ano'] > 0);

    console.log(`[upload RAC] ${rows.length}/${records.length} registros válidos`);

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

    await logAcesso(req, 'upload_rac_pm', `${rows.length} registros importados`);
    res.json({ ok: true, uploaded: rows.length, total: cache.data.length });
  } catch (err) {
    console.error('✗ Erro no upload:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS DE UPLOAD — OCORRÊNCIAS INFOCRIM
// ═══════════════════════════════════════════════════════════════

// [POST /api/upload/ocorrencias] — importa CSV do InfoCrim (boletins de ocorrência detalhados).
// Fluxo: recebe records[] pré-filtrados pelo frontend (deduplicação por NumeroBO já resolvida)
//        → mapeia campos → apaga TODOS os registros existentes → insere em lotes de 500.
// ⚠ Esta rota apaga toda a tabela 'ocorrencias' antes de inserir — não é incremental.
// Requer role: admin, p3 ou ti.
app.post('/api/upload/ocorrencias', requireAuth, requireRole('admin', 'p3', 'ti'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  const { records } = req.body;
  if (!records?.length) return res.status(400).json({ error: 'Nenhum registro recebido.' });
  try {
    const rows = records.map(r => ({
      numero_bo:       (r.NumeroBO || '').trim(),
      data_ocorrencia: parseDateBR(r.DataOcorrencia),
      hora_ocorrencia: parseHora(r.HoraOcorrencia),
      periodo:         (r.PeriodoEstimado || '').trim(),
      dia_semana:      (r.DiaSemana       || '').trim(),
      rubrica:         (r.Rubrica   || '').trim(),
      conduta:         (r.Conduta   || '').trim(),
      batalhao:        (r.BatalhaoCircunscricao       || '').trim(),
      cia:             normCia(r.CompanhiaCircunscricao || ''),
      municipio:       titleCase(r.MunicipioCircunscricao || ''),
      bairro:          titleCase(r.Bairro     || ''),
      tipo_local:      (r.TipoLocal || '').trim(),
    })).filter(r => r.data_ocorrencia && r.rubrica);
    if (!rows.length) return res.status(400).json({ error: 'Nenhum registro válido após validação.' });
    const { error: do1 } = await supabase.from(OCORRENCIAS_TABLE).delete().not('numero_bo', 'is', null);
    if (do1) throw new Error('Erro ao limpar registros antigos: ' + do1.message);
    const { error: do2 } = await supabase.from(OCORRENCIAS_TABLE).delete().is('numero_bo', null);
    if (do2) throw new Error('Erro ao limpar registros antigos: ' + do2.message);
    const BATCH = 500;
    let total = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase.from(OCORRENCIAS_TABLE).insert(rows.slice(i, i + BATCH));
      if (error) throw new Error(error.message);
      total += rows.slice(i, i + BATCH).length;
    }
    await logAcesso(req, 'upload_infocrim', `${total} ocorrências importadas`);
    res.json({ ok: true, inserted: total });
  } catch (err) {
    console.error('✗ Erro no upload de ocorrências:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// [GET /api/ocorrencias] — consulta ocorrências InfoCrim com filtros opcionais.
// Query params: rubrica (ilike), cia (eq), municipio (eq).
// Usado pelo modal de crime no frontend para exibir detalhes de BO por rubrica/CIA.
app.get('/api/ocorrencias', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  const { rubrica, cia, municipio } = req.query;
  try {
    const filters = [];
    if (rubrica)   filters.push(['ilike', 'rubrica', `%${rubrica}%`]);
    if (cia)       filters.push(['eq', 'cia', cia]);
    if (municipio) filters.push(['eq', 'municipio', municipio]);
    const data = await fetchAll(OCORRENCIAS_TABLE, { filters, order: [['data_ocorrencia', { ascending: false }]] });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS DE METADADOS E LISTAS DE FILTRO
// ═══════════════════════════════════════════════════════════════

// Toda rota abaixo (metadados, registros RAC, analytics) lê do cache em
// memória — re-sincroniza antes de servir se o cache estiver velho.
app.use(['/api/meta', '/api/registros', '/api/analytics'], withFreshCache);

// Cache extra para /api/meta — evita recomputar os valores únicos a cada requisição.
// É invalidado pelo invalidateMetaCache() sempre que o cache principal é atualizado.
let _metaCache = null;
function invalidateMetaCache() { _metaCache = null; }

// [GET /api/meta] — retorna listas únicas de crimes, meses, municípios, CIAs e anos.
// Municípios são ordenados por CIA primeiro, depois alfabeticamente dentro da CIA.
// Resultado fica em cache por 5 min no cliente (Cache-Control: private, max-age=300).
app.get('/api/meta', requireAuth, (req, res) => {
  if (!_metaCache) {
    const crimes = uniq(cache.data.map(r => r.crime));
    const meses  = uniq(cache.data.map(r => r.mes)).sort((a, b) => MES_ORD.indexOf(a) - MES_ORD.indexOf(b));
    const muns   = uniq(cache.data.map(r => r.mun)).sort((a, b) => {
      const ciaA = cache.data.find(r => r.mun === a)?.cia || '';
      const ciaB = cache.data.find(r => r.mun === b)?.cia || '';
      return ciaA !== ciaB ? ciaA.localeCompare(ciaB) : a.localeCompare(b);
    });
    const cias   = uniq(cache.data.map(r => r.cia)).sort();
    const anos   = uniq(cache.data.map(r => r.ano).filter(a => a > 0)).sort((a, b) => b - a);
    _metaCache = { crimes: CRIMES_ORD.filter(c => crimes.includes(c)), meses, muns, cias, anos };
  }
  res.set('Cache-Control', 'private, max-age=300');
  res.json(_metaCache);
});

// [GET /api/registros] — retorna registros RAC filtrados por mes, crime, mun, cia (query params).
// Opera 100% sobre o cache em memória — sem consulta ao banco.
app.get('/api/registros', requireAuth, (req, res) => {
  res.json(filtrar(req.query));
});

// [GET /api/registros/crimes|meses|muns|cias] — listas únicas para popular filtros no frontend.
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

// ═══════════════════════════════════════════════════════════════
// ROTAS DE ANALYTICS
// Cada módulo recebe cache.data[] e retorna resultados computados.
// Nenhum módulo faz consulta ao banco — operam sobre o cache em memória.
// ═══════════════════════════════════════════════════════════════
const { pressureByCity }               = require('./analytics/crimePressureIndex');
const { trendByCity }                  = require('./analytics/trendAnalysis');
const { deviationSummaryByCity }       = require('./analytics/targetDeviation');
const { fullRanking, rankingByPressure, rankingByPriority } = require('./analytics/cityRanking');
const { priorityRanking }              = require('./analytics/priorityScore');
const { generateInsights }             = require('./analytics/insightGenerator');

// Extrai os parâmetros de filtro da query string aceitos pelos módulos analíticos.
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

// ═══════════════════════════════════════════════════════════════
// ROTAS P1 — EFETIVO
// Gerencia o quadro de pessoal (efetivo_pm): listagem e upload CSV.
// ═══════════════════════════════════════════════════════════════
const EFETIVO_TABLE = 'efetivo_pm';

// [GET /api/efetivo] — retorna todos os PMs cadastrados. Qualquer usuário autenticado pode consultar.
app.get('/api/efetivo', requireAuth, async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const data = await fetchAll(EFETIVO_TABLE);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [POST /api/efetivo/upload] — substitui todo o efetivo pelo CSV enviado.
// Apaga todos os registros existentes (delete where nome is not null) antes de inserir.
// A busca de colunas é case-insensitive e aceita variações de nome (ex: "Posto / Grad" ou "Posto").
app.post('/api/efetivo/upload', requireAuth, requireRole('admin', 'p3', 'p1'), async (req, res) => {
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

    // Restrição, nascimento e ingresso são alimentados só pelo SGP (nunca
    // pela planilha) — guarda os valores atuais antes de apagar a tabela pra
    // não perdê-los no reinsert (o INSERT abaixo não tem esses campos).
    const { data: restricaoAntes, error: erroRestrAntes } = await supabase
      .from(EFETIVO_TABLE)
      .select('re, possui_restricao, tipos_restricao, restricao_inicio, restricao_termino, data_nascimento, data_ingresso');
    if (erroRestrAntes) throw new Error(erroRestrAntes.message);
    const restricaoPorRe = {};
    (restricaoAntes || []).forEach(r => { restricaoPorRe[r.re] = r; });

    const rows = records.map(r => {
      const re = gf(r, 'RE', 're');
      const rAntes = restricaoPorRe[re];
      return {
        opm:        gf(r, 'OPM', 'opm'),
        posto:      gf(r, 'Posto', 'posto', 'Posto / Grad', 'posto / grad'),
        re,
        nome:       gf(r, 'Nome', 'nome', 'Nome Completo', 'nome completo'),
        funcao:     gf(r, 'Funcao', 'funcao', 'Função', 'função'),
        genero:     gf(r, 'Genero', 'genero', 'Gênero', 'gênero'),
        nome_guerra: gf(r, 'NomeGuerra', 'nomeguerra', 'Nome de Guerra', 'nome de guerra'),
        data_eap:   parseDateBR(gf(r, 'DataEAP', 'dataeap', 'DATA EAP', 'data eap')) || null,
        taf:        gf(r, 'TAF', 'taf') || null,
        tat:        gf(r, 'TAT', 'tat') || null,
        possui_restricao:  rAntes?.possui_restricao ?? null,
        tipos_restricao:   rAntes?.tipos_restricao ?? null,
        restricao_inicio:  rAntes?.restricao_inicio ?? null,
        restricao_termino: rAntes?.restricao_termino ?? null,
        data_nascimento:   rAntes?.data_nascimento ?? null,
        data_ingresso:     rAntes?.data_ingresso ?? null,
      };
    }).filter(r => r.nome && r.posto);

    if (!rows.length) return res.status(400).json({ error: 'Nenhum registro válido. Verifique as colunas do CSV.' });

    const { error: d1 } = await supabase.from(EFETIVO_TABLE).delete().not('nome', 'is', null);
    if (d1) throw new Error(d1.message);
    const { error: d2 } = await supabase.from(EFETIVO_TABLE).delete().is('nome', null);
    if (d2) throw new Error(d2.message);

    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase.from(EFETIVO_TABLE).insert(rows.slice(i, i + BATCH));
      if (error) throw new Error(error.message);
      inserted += Math.min(BATCH, rows.length - i);
    }
    await logAcesso(req, 'upload_efetivo', `${inserted} registros importados`);
    res.json({ ok: true, inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS P1 — SINCRONIZAÇÃO COM O SGP (WSSCPM)
// Cria pedidos numa fila (sgp_sync_jobs) que só é processada pelo agente
// rodando no computador do batalhão (único ponto com acesso à intranet
// da PM). Este backend nunca chama o WSSCPM diretamente.
// ═══════════════════════════════════════════════════════════════
const SGP_SYNC_TABLE = 'sgp_sync_jobs';

// [POST /api/efetivo/sync] — cria um pedido de sincronização (RE único ou efetivo completo).
app.post('/api/efetivo/sync', requireAuth, requireRole('admin', 'p1'), async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
    const { tipo, re } = req.body;
    const TIPOS_VALIDOS = ['single', 'bulk', 'ias_single', 'ias_bulk', 'cursos_single', 'cursos_bulk', 'laureas_single', 'laureas_bulk'];
    if (!TIPOS_VALIDOS.includes(tipo)) return res.status(400).json({ error: `tipo deve ser um de: ${TIPOS_VALIDOS.join(', ')}.` });
    const ehSingle = tipo === 'single' || tipo === 'ias_single' || tipo === 'cursos_single' || tipo === 'laureas_single';
    if (ehSingle && !/^\d{6}$/.test(String(re || ''))) {
      return res.status(400).json({ error: 'Informe os 6 dígitos do RE (sem o dígito verificador).' });
    }

    const { data, error } = await supabase.from(SGP_SYNC_TABLE).insert({
      tipo,
      re: ehSingle ? re : null,
      solicitado_por: req.user.nome || req.user.matricula,
    }).select().single();

    if (error) {
      // Índice único impede 2 pedidos "bulk"/"ias_bulk" simultâneos (do mesmo tipo) — devolve mensagem amigável.
      if (error.code === '23505') return res.status(409).json({ error: 'Já existe uma atualização desse tipo em andamento.' });
      throw new Error(error.message);
    }
    await logAcesso(req, 'sgp_sync_pedido', ehSingle ? `${tipo} RE ${re}` : tipo);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [GET /api/efetivo/sync/status] — últimos pedidos, para o dashboard acompanhar o andamento.
app.get('/api/efetivo/sync/status', requireAuth, requireRole('admin', 'p1'), async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase
      .from(SGP_SYNC_TABLE)
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS P1 — SESSÃO DO SGP-DP (pra sincronizar IAS)
// O SGP-DP exige login (diferente do WSSCPM) e o cookie de sessão é
// HttpOnly — não dá pra capturar automaticamente via bookmarklet. O
// usuário cola o cookie manualmente aqui, o agente do batalhão "pega
// carona" nele pra buscar a IAS em nome do usuário logado. Sessão dura
// ~24h (mesmo tempo da sessão real do SGP-DP).
//
// ⚠ O valor do cookie NUNCA é devolvido pra tela — só o agente (que usa a
// service_role key, direto no Supabase) consegue ler o valor real.
// ═══════════════════════════════════════════════════════════════
const SGP_DP_SESSAO_TABLE = 'sgp_dp_sessao';

// [PUT /api/sgp-dp/sessao] — salva o cookie colado pelo usuário.
app.put('/api/sgp-dp/sessao', requireAuth, requireRole('admin', 'p1'), async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
    const { cookie } = req.body;
    if (!cookie || typeof cookie !== 'string' || cookie.trim().length < 20) {
      return res.status(400).json({ error: 'Cole o valor completo do cookie de sessão do SGP-DP.' });
    }
    const { error } = await supabase.from(SGP_DP_SESSAO_TABLE).upsert({
      id: 1,
      cookie: cookie.trim(),
      atualizado_em: new Date().toISOString(),
      atualizado_por: req.user.nome || req.user.matricula,
    }, { onConflict: 'id' });
    if (error) throw new Error(error.message);
    await logAcesso(req, 'sgp_dp_sessao_atualizada', '');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [GET /api/sgp-dp/sessao/status] — quando a sessão foi salva e por quem (nunca o valor do cookie).
app.get('/api/sgp-dp/sessao/status', requireAuth, requireRole('admin', 'p1'), async (req, res) => {
  try {
    if (!supabase) return res.json({ atualizado_em: null, atualizado_por: null });
    const { data, error } = await supabase
      .from(SGP_DP_SESSAO_TABLE)
      .select('atualizado_em, atualizado_por')
      .eq('id', 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    res.json(data || { atualizado_em: null, atualizado_por: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS P1 — AFASTAMENTOS
// Gerencia afastamentos de PMs (férias, licenças, etc.)
// ═══════════════════════════════════════════════════════════════
const AFASTAMENTOS_TABLE = 'afastamentos_pm';

// [GET /api/afastamentos] — retorna todos os afastamentos. Qualquer usuário autenticado pode consultar.
app.get('/api/afastamentos', requireAuth, async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const data = await fetchAll(AFASTAMENTOS_TABLE);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload manual de afastamentos removido — a partir daqui afastamentos_pm é
// alimentada exclusivamente pela sincronização via WSSCPM (agente-sgp).

// ═══════════════════════════════════════════════════════════════
// ROTAS P1 — FOTOS DE PMs
// Fotos armazenadas em base64 na tabela fotos_pm (PK = RE do PM).
// Limite de 800 KB por imagem após compressão no frontend.
// ═══════════════════════════════════════════════════════════════
const FOTOS_TABLE = 'fotos_pm';

// [GET /api/p1/foto/:re] — retorna foto_base64 do PM identificado pelo RE. Leitura pública (qualquer role).
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

// [POST /api/p1/fotos/lote] — retorna foto_base64 de vários RE de uma vez (evita 1 chamada por PM na tela).
app.post('/api/p1/fotos/lote', requireAuth, async (req, res) => {
  try {
    if (!supabase) return res.json({});
    const { res: listaRe } = req.body;
    if (!Array.isArray(listaRe) || !listaRe.length) return res.json({});
    const { data, error } = await supabase
      .from(FOTOS_TABLE)
      .select('re, foto_base64')
      .in('re', listaRe.slice(0, 500));
    if (error) throw new Error(error.message);
    const mapa = {};
    (data || []).forEach(r => { mapa[r.re] = r.foto_base64; });
    res.json(mapa);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [POST /api/p1/foto/:re] — faz upsert da foto (insert ou update pelo RE). Requer role p1 ou admin.
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

// [DELETE /api/p1/foto/:re] — remove a foto do PM. Requer role p1 ou admin.
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

// ═══════════════════════════════════════════════════════════════
// ROTAS P1 — VAGAS (EFETIVO FIXADO POR OPM)
// Número de vagas autorizadas por OPM — comparado ao efetivo existente.
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// ROTAS P1 — QUADRO FIXADO POR POSTO E OPM
// Tabela com efetivo fixado e existente por posto/graduação por OPM (p1_quadro_fixado).
// ═══════════════════════════════════════════════════════════════
const QUADRO_TABLE = 'p1_quadro_fixado';

app.get('/api/p1/quadro', requireAuth, async (req, res) => {
  try {
    if (!supabase) return res.json([]);
    const { data, error } = await supabase.from(QUADRO_TABLE).select('*').order('opm').order('municipio');
    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/p1/quadro/upload', requireAuth, requireRole('admin', 'p1'), async (req, res) => {
  try {
    if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
    const records = req.body?.records;
    if (!Array.isArray(records) || !records.length)
      return res.status(400).json({ error: 'Nenhum registro recebido.' });

    const nk = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[\s./]+/g,'');
    const gi = (r, ...keys) => {
      const idx = {};
      Object.entries(r).forEach(([k, v]) => { idx[nk(k)] = v; });
      for (const k of keys) { const v = idx[nk(k)]; if (v !== undefined) return parseInt(v) || 0; }
      return 0;
    };
    const gs = (r, ...keys) => {
      const idx = {};
      Object.entries(r).forEach(([k, v]) => { idx[nk(k)] = v; });
      for (const k of keys) { const v = idx[nk(k)]; if (v !== undefined) return (v||'').trim(); }
      return '';
    };

    const rows = records.map(r => ({
      municipio:     gs(r, 'Municipio', 'Município'),
      opm:           gs(r, 'OPM', 'opm'),
      cia:           gs(r, 'CIA', 'Cia', 'Companhia'),
      fx_ten_cel:    gi(r, 'Fixado Ten Cel', 'Fx Ten Cel'),
      ex_ten_cel:    gi(r, 'Existente Ten Cel', 'Ex Ten Cel'),
      fx_maj:        gi(r, 'Fixado Maj', 'Fx Maj'),
      ex_maj:        gi(r, 'Existente Maj', 'Ex Maj'),
      fx_cap:        gi(r, 'Fixado Cap', 'Fx Cap'),
      ex_cap:        gi(r, 'Existente Cap', 'Ex Cap'),
      fx_ten:        gi(r, 'Fixado Ten', 'Fx Ten'),
      ex_ten:        gi(r, 'Existente Ten', 'Ex Ten'),
      fx_of_med:     gi(r, 'Fixado Of Med/Dent', 'Fixado Of Med', 'Fx Of Med'),
      ex_of_med:     gi(r, 'Existente Of Med/Dent', 'Existente Of Med', 'Ex Of Med'),
      fx_subten_sgt: gi(r, 'Fixado Subten / Sgt', 'Fixado Subten/Sgt', 'Fx Subten Sgt'),
      ex_subten_sgt: gi(r, 'Existente Subten / Sgt', 'Existente Subten/Sgt', 'Ex Subten Sgt'),
      fx_cb_sd:      gi(r, 'Fixado Cb/Sd', 'Fixado Cb Sd', 'Fx Cb Sd'),
      ex_cb_sd:      gi(r, 'Existente Cb/Sd', 'Existente Cb Sd', 'Ex Cb Sd'),
      fx_total:      gi(r, 'FX', 'fx', 'Total FX', 'Total Fixado'),
      ex_total:      gi(r, 'EX', 'ex', 'Total EX', 'Total Existente'),
    })).filter(r => r.opm);

    if (!rows.length) return res.status(400).json({ error: 'Nenhum registro válido. Verifique a coluna OPM.' });

    await supabase.from(QUADRO_TABLE).delete().gte('id', 1);
    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase.from(QUADRO_TABLE).insert(rows.slice(i, i + BATCH));
      if (error) throw new Error(error.message);
    }
    await logAcesso(req, 'upload_quadro', `${rows.length} registros importados`);
    res.json({ ok: true, inserted: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// PRODUTIVIDADE P3
// Mapeamento de tipo (URL) → nome da tabela no Supabase.
// Usado pelas rotas genéricas GET /api/prod/:tipo e POST /api/upload/prod/:tipo.
// ═══════════════════════════════════════════════════════════════
const PROD_TABS = {
  ocorrencias:        'prod_ocorrencias',
  presos:             'prod_pessoas_presas',
  armas:              'prod_armas',
  veiculos:           'prod_veiculos',
  entorpecentes:      'prod_entorpecentes',
  'visita-solidaria': 'prod_visita_solidaria',
  'tempo-resposta':   'prod_tempo_resposta',
  'cursos':           'prod_cursos',
  'conseg':           'prod_conseg'
};

// Converte uma linha bruta de CSV de produtividade para o formato da tabela correspondente.
// O parâmetro `tipo` determina qual conjunto de campos será extraído.
// A busca de chaves é case-insensitive e sem acento (nk = normalize key).
// Tipos suportados: ocorrencias, presos, armas, veiculos, entorpecentes, visita-solidaria, tempo-resposta, conseg.
function mapProdRow(tipo, r) {
  // Case-insensitive, accent-insensitive key lookup
  const _nk = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const _idx = {};
  Object.entries(r).forEach(([k, v]) => { _idx[_nk(k)] = v; });
  const get = (...keys) => {
    for (const k of keys) { const v = _idx[_nk(k)]; if (v !== undefined && v !== null) return (v||'').trim(); }
    return '';
  };
  const getPartial = (...frags) => {
    const normFrags = frags.map(_nk);
    const key = Object.keys(_idx).find(k => normFrags.every(f => k.includes(f)));
    return key ? (_idx[key]||'').trim() : '';
  };

  const cia = normCia(get('CIA', 'Cia'));
  const ano = parseInt(get('Ano de Data', 'Ano')) || 0;
  const mes = normMes(get('Mês de Data', 'Mes de Data', 'Mês', 'Mes') || getPartial('mes', 'data'));

  if (tipo === 'ocorrencias') return {
    grupo_natureza:    get('Grupo de Natureza'),
    natureza:          get('Natureza da Ocorrência', 'Natureza da Ocorrencia'),
    numero_ocorrencia: get('Número da Ocorrência', 'Numero da Ocorrencia'),
    municipio:         get('Município', 'Municipio'),
    us: get('US'), cia, ano, mes,
    contagem: parseInt(get('Contagem de Ocorrências', 'Contagem de Ocorrencias')) || 0
  };
  if (tipo === 'presos') return {
    situacao:  get('Situação da Pessoa', 'Situacao da Pessoa'),
    ano, mes, cia, quantidade: parseInt(get('Quantidade de Pessoas')) || 0
  };
  if (tipo === 'armas') return {
    tipo_arma: get('Tipo da Arma'),
    calibre:   get('Calibre'),
    ano, mes, cia, quantidade: parseInt(get('Quantidade de Armas')) || 0
  };
  if (tipo === 'veiculos') return {
    situacao:  get('Situacao do Veículo', 'Situação do Veículo', 'Situacao do Veiculo'),
    ano, mes, cia,
    quantidade: parseInt(get('Contagem Quantidade de Veículos', 'Contagem Quantidade de Veiculos', 'Contagem de Veículos')) || 0
  };
  if (tipo === 'entorpecentes') return {
    unidade_medida: get('Unidade de Medida (Consulta do SQL personalizado)', 'Unidade de Medida'),
    entorpecente:   get('Entorpecente'),
    ano, mes, cia, quantidade: parseFloat(get('Quantidade de Entorpecentes')) || 0
  };
  if (tipo === 'visita-solidaria') {
    // Normaliza chaves para busca insensível a acento e maiúscula
    const nk = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
    const idx = {};
    Object.entries(r).forEach(([k, v]) => { idx[nk(k)] = v; });
    const get = (...keys) => {
      for (const k of keys) { const v = idx[nk(k)]; if (v !== undefined) return (v||'').trim(); }
      return '';
    };
    // Busca parcial como fallback: encontra chave que contém todos os fragmentos
    const getPartial = (...frags) => {
      const key = Object.keys(idx).find(k => frags.every(f => k.includes(nk(f))));
      return key ? (idx[key]||'').trim() : '';
    };

    const dataStr = get('Data da ocorrência','Data da Ocorrência','Data da ocorrencia') || getPartial('data','ocorr');
    let vsAno = 0, vsMes = '';
    const dm = dataStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dm) {
      vsAno = parseInt(dm[3]);
      vsMes = normMes(_MESES_PT[parseInt(dm[2]) - 1] || '');
    } else {
      const dm2 = dataStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dm2) { vsAno = parseInt(dm2[1]); vsMes = normMes(_MESES_PT[parseInt(dm2[2]) - 1] || ''); }
    }
    return {
      ano: vsAno, mes: vsMes,
      cia:                 normCia(get('Cia PM','CIA PM','CIA','Cia')),
      data_ocorrencia:     dataStr,
      nome_vitima:         get('Nome da Vitima','Nome da Vítima','Nome da vitima'),
      parentesco_agressor: get('Parentesco do Agressor','Parentesco'),
      bairro:              get('Bairro'),
      cidade:              get('Cidade'),
      quer_acompanhamento: get('A vitima Gostaria do acompanhamento da Visita Solidária','A vítima Gostaria do acompanhamento da Visita Solidária') || getPartial('vitima','gostaria'),
      visita_1:            get('1ª Telefonema (visita)','1a Telefonema (visita)','1ª Telefonema'),
      visita_2:            get('2ª Visita Pessoal','2a Visita Pessoal'),
      visita_3:            get('3ª Visita Pessoal','3a Visita Pessoal'),
      visita_4:            get('4ª Visita Pessoal','4a Visita Pessoal'),
      visita_5:            get('5ª Visita Pessoal','5a Visita Pessoal'),
      visita_6:            get('6ª Visita Pessoal','6a Visita Pessoal'),
      medida_protetiva:    get('Atualmente possui medida protetiva (Sim/Não)','Atualmente possui medida protetiva (Sim/Nao)') || getPartial('medida','protetiva'),
    };
  }
  if (tipo === 'tempo-resposta') {
    const pctStr = s => parseFloat((s||'').replace(',', '.').replace('%', '').trim()) || 0;
    return {
      cia:             normCia(get('CIA', 'Cia')),
      ano:             parseInt(get('Ano')) || 0,
      mes:             normMes(get('Mês', 'Mes')),
      natureza_final:  get('Natureza Final'),
      qtde_taloes:     parseInt(get('Qtde Talões', 'Qtde Taloes').replace('.','').replace(',','')) || 0,
      pct_hd_hcl_20min: pctStr(getPartial('hd', 'hcl', '20') || getPartial('taloes', '20')),
      pct_boe:          pctStr(getPartial('boe')),
    };
  }
  if (tipo === 'conseg') {
    // Campo "Mês / Ano (MM/AAAA)" contém datas no formato DD/MM/YYYY (ex.: "01/12/2025" = dezembro/2025)
    const mesAnoStr = get('Mês / Ano (MM/AAAA)', 'Mes / Ano (MM/AAAA)', 'Mês / Ano', 'Mes / Ano') || '';
    const dm = mesAnoStr.match(/^(\d{1,2})\/(\d{2})\/(\d{4})/);
    const mesNum  = dm ? parseInt(dm[2]) : 0;
    const anoVal  = dm ? parseInt(dm[3]) : 0;
    const mesNome = normMes(_MESES_PT[mesNum - 1] || '');
    const houveStr    = (get('Houve Reunião', 'Houve Reuniao') || '').toLowerCase().trim();
    const providencias = get('Providências Adatodas', 'Providencias Adatodas', 'Providências Adotadas', 'Providencias Adotadas') || '';
    return {
      ano:                anoVal,
      mes:                mesNome,
      cia:                normCia(get('Cia', 'CIA')),
      municipio:          (get('Município', 'Municipio') || '').trim(),
      houve_reuniao:      houveStr === 'sim',
      data_reuniao:       get('Data da Reunião', 'Data da Reuniao') || '',
      data_ultima_reuniao: get('Data da última reunião', 'Data da ultima reuniao') || '',
      providencias,
      conseg_ativo:       !providencias.toUpperCase().includes('CONSEG INATIVO'),
    };
  }
  return null;
}

// [GET /api/prod/:tipo] — retorna todos os registros de produtividade do tipo informado.
// Tipos válidos: ocorrencias, presos, armas, veiculos, entorpecentes, visita-solidaria, tempo-resposta, conseg.
app.get('/api/prod/:tipo', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  const tab = PROD_TABS[req.params.tipo];
  if (!tab) return res.status(400).json({ error: 'Tipo inválido' });
  try {
    // Pagina em lotes de 1000 — Supabase limita 1000 linhas por query
    const PAGE = 1000;
    let all = [], from = 0;
    while (true) {
      const { data, error } = await supabase.from(tab).select('*').range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      if (!data?.length) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [POST /api/upload/prod/:tipo] — importa CSV de produtividade do tipo informado.
// Apaga apenas os registros dos anos presentes no CSV (não limpa anos anteriores).
// CONSEG: deduplicação especial — mantém houve_reuniao=true quando há duplicatas no mesmo mês/município.
app.post('/api/upload/prod/:tipo', requireAuth, requireRole('admin', 'p3'), async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  const tab = PROD_TABS[req.params.tipo];
  if (!tab) return res.status(400).json({ error: 'Tipo inválido' });
  const { records } = req.body;
  if (!records?.length) return res.status(400).json({ error: 'Nenhum registro recebido.' });
  try {
    let rows = records.map(r => mapProdRow(req.params.tipo, r)).filter(r => r && r.ano > 0 && r.mes);
    if (!rows.length) return res.status(400).json({ error: 'Nenhum registro válido após validação.' });
    // CONSEG: deduplica por (municipio, mes, ano) — prioriza houve_reuniao=true; propaga conseg_ativo=false
    if (req.params.tipo === 'conseg') {
      const uniq = {};
      rows.forEach(r => {
        const key = `${r.municipio}|${r.mes}|${r.ano}`;
        if (!uniq[key] || (!uniq[key].houve_reuniao && r.houve_reuniao)) uniq[key] = { ...r };
        if (!r.conseg_ativo) uniq[key].conseg_ativo = false;
      });
      rows = Object.values(uniq);
    }
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
    await logAcesso(req, 'upload_produtividade', `${req.params.tipo}: ${total} registros importados`);
    res.json({ ok: true, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS P3 — PVS (Programa de Vigilância Solidária)
// Dados por CIA/município: bairros, núcleos, famílias, modais, eficácia.
// ═══════════════════════════════════════════════════════════════
app.get('/api/pvs', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  try {
    const filters = req.query.ano ? [['eq', 'ano', parseInt(req.query.ano)]] : [];
    const data = await fetchAll('pvs', { filters });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/pvs', requireAuth, requireRole('admin', 'p3'), async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  const { records } = req.body;
  if (!records?.length) return res.status(400).json({ error: 'Nenhum registro recebido.' });
  try {
    const _nk = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[.\-/]/g,' ').replace(/\s+/g,' ').trim();
    const simNao = v => { const s = _nk(v||''); return s === 'sim' ? 'Sim' : (s === 'nao' || s === 'nao') ? 'Não' : (v||'').trim() || null; };
    const rows = records.map(r => {
      const idx = {}; Object.entries(r).forEach(([k, v]) => { idx[_nk(k)] = v; });
      const get = (...keys) => { for (const k of keys) { const v = idx[_nk(k)]; if (v !== undefined && v !== null) return (v||'').toString().trim(); } return ''; };
      const getInt = (...keys) => { const v = get(...keys); const n = parseInt((v||'').replace(/\D/g,'')); return isNaN(n) ? null : n; };
      return {
        cia:                get('cia'),
        municipio:          get('municipio', 'município'),
        bairros_com_pvs:    getInt('bairros_com_pvs', 'bairros com pvs', 'bairros c pvs'),
        nucleos_total:      getInt('nucleos_total', 'nucleos total', 'núcleos total'),
        familias_atendidas: getInt('familias_atendidas', 'familias atendidas', 'famílias atendidas'),
        modal_residencial:  simNao(get('modal_residencial', 'modal residencial')),
        modal_comercial:    simNao(get('modal_comercial',   'modal comercial')),
        modal_escolar:      simNao(get('modal_escolar',     'modal escolar')),
        modal_rural:        simNao(get('modal_rural',       'modal rural')),
        modal_empresarial:  simNao(get('modal_empresarial', 'modal empresarial')),
        nota_eficacia:      getInt('nota_eficacia', 'nota eficacia', 'nota eficácia'),
        tem_cadastro:       simNao(get('tem_cadastro',       'tem cadastro')),
        pm_whatsapp:        simNao(get('pm_whatsapp',        'pm no whatsapp', 'pm whatsapp')),
        reunioes_semestrais: simNao(get('reunioes_semestrais', 'reunioes semestrais', 'reuniões semestrais')),
        visitas_solidarias: simNao(get('visitas_solidarias',  'visitas solidarias', 'visitas solidárias')),
        ano:                parseInt(get('ano')) || new Date().getFullYear(),
      };
    }).filter(r => r.cia && r.municipio);
    if (!rows.length) return res.status(400).json({ error: 'Nenhum registro válido.' });
    const anos = [...new Set(rows.map(r => r.ano))];
    for (const ano of anos) {
      const { error: delErr } = await supabase.from('pvs').delete().eq('ano', ano);
      if (delErr) throw new Error(delErr.message);
    }
    const { error: insErr } = await supabase.from('pvs').insert(rows);
    if (insErr) throw new Error(insErr.message);
    await logAcesso(req, 'upload_pvs', `${rows.length} registros importados`);
    res.json({ ok: true, total: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS DE CONFIGURAÇÃO DO DASHBOARD
// Chave/valor na tabela config_dashboard — ex: período de referência, fonte dos dados.
// ═══════════════════════════════════════════════════════════════

// [GET /api/config] — retorna todas as configurações como objeto { chave: valor }.
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

// [PUT /api/config] — cria ou atualiza (upsert) uma chave de configuração. Requer admin ou p3.
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

// ═══════════════════════════════════════════════════════════════
// ROTAS P3 — INDICADORES DE QUALIDADE
// 13 indicadores mensais (manual + automático) em indicadores_qualidade_p3.
// Registros de meses anteriores são bloqueados após serem preenchidos,
// podendo ser desbloqueados por 24h via /desbloquear.
// ═══════════════════════════════════════════════════════════════

// [GET /api/indicadores-p3] — lista todos os indicadores, ordenados por ano/mês. Leitura pública (qualquer role).
app.get('/api/indicadores-p3', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco não configurado' });
  try {
    const { data, error } = await supabase
      .from('indicadores_qualidade_p3')
      .select('*')
      .order('ano', { ascending: true })
      .order('mes', { ascending: true });
    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [POST /api/indicadores-p3] — salva/atualiza indicadores do mês informado.
// Meses passados exigem que desbloqueado_ate seja futuro (bloqueio de edição retroativa).
app.post('/api/indicadores-p3', requireAuth, requireRole('admin', 'p3', 'ti'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco não configurado' });
  const { mes, ano, disque_denuncia, tempo_resposta, cursos_pm, alunos_proerd, atendimento_vitima, conseg_ativo, bairros_pvs } = req.body;
  if (!mes || !ano) return res.status(400).json({ error: 'Mês e ano são obrigatórios' });
  try {
    // Verifica se é mês passado com registro existente → precisa estar desbloqueado
    const MESES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const hoje = new Date();
    const mesAtualStr = MESES_NOMES[hoje.getMonth()];
    const anoAtual = hoje.getFullYear();
    const isCurrentMonth = mes === mesAtualStr && Number(ano) === anoAtual;
    if (!isCurrentMonth) {
      const { data: existing } = await supabase.from('indicadores_qualidade_p3').select('desbloqueado_ate').eq('mes', mes).eq('ano', Number(ano)).maybeSingle();
      if (existing && (!existing.desbloqueado_ate || new Date(existing.desbloqueado_ate) <= new Date())) {
        return res.status(403).json({ error: 'Registro bloqueado. Solicite ao P3 para desbloquear por 24h.' });
      }
    }
    const { error } = await supabase.from('indicadores_qualidade_p3').upsert({
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
    await logAcesso(req, 'indicadores_p3_salvo', `${mes}/${ano}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [GET /api/indicadores-p3/calculado] — calcula indicadores automáticos (homicídio, presos, armas…)
// cruzando as tabelas RAC PM, prod_pessoas_presas e prod_armas, por ano.
// POP_SEADE = população da área do 40º BPM/I usada para índices per capita.
app.get('/api/indicadores-p3/calculado', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco não configurado' });
  const POP_SEADE = 44539225;
  const r3 = v => Math.round(v * 1000) / 1000;
  try {
    const efetivoRes = await supabase.from('efetivo_pm').select('re', { count: 'exact', head: true });
    const [racData, presosData, armasData] = await Promise.all([
      fetchAll(TABLE_NAME, { select: 'Ano,Crime,Avaliado' }),
      fetchAll('prod_pessoas_presas', { select: 'ano,situacao,quantidade' }),
      fetchAll('prod_armas', { select: 'ano,quantidade' }),
    ]);

    const efetivo = efetivoRes.count || 1;

    const anos = [...new Set([
      ...racData.map(r => r.Ano),
      ...presosData.map(r => r.ano),
      ...armasData.map(r => r.ano)
    ])].filter(Boolean).sort();

    const resultado = anos.map(ano => {
      const racAno = racData.filter(r => r.Ano === ano);
      const sumRac = crime => racAno.filter(r => r.Crime === crime).reduce((s, r) => s + (Number(r.Avaliado) || 0), 0);

      const presosAno = presosData.filter(r => r.ano === ano);
      const sumPresos = (...sits) => presosAno.filter(r => sits.includes(r.situacao)).reduce((s, r) => s + (Number(r.quantidade) || 0), 0);

      const totalArmas  = armasData.filter(r => r.ano === ano).reduce((s, r) => s + (Number(r.quantidade) || 0), 0);
      const flagrantes  = sumPresos('AUTUADO(A) EM FLAGRANTE');
      const menores     = sumPresos('MENORES APREENDIDOS');
      const procurados  = sumPresos('PROCURADA', 'CAPTURADO(A)', 'RECAPTURADO(A)');

      return {
        ano,
        efetivo,
        homicidio_doloso:  sumRac('Homicídio'),
        latrocinio:        sumRac('Latrocínio'),
        roubo_outros:      sumRac('Roubo'),
        roubo_veiculo:     sumRac('Roubo de Veículos'),
        furto_veiculo:     sumRac('Furto de Veículos'),
        armas_apreendidas: totalArmas,
        flagrantes_pm:     flagrantes,
        pessoas_presas:    flagrantes + procurados,
        menores_presos:    menores,
        procurados:        procurados,
      };
    });

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [POST /api/indicadores-p3/desbloquear] — libera edição de um mês bloqueado por 24 horas.
// Atualiza o campo desbloqueado_ate = agora + 24h. Requer admin, p3 ou ti.
app.post('/api/indicadores-p3/desbloquear', requireAuth, requireRole('admin', 'p3', 'ti'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco não configurado' });
  const { mes, ano } = req.body;
  if (!mes || !ano) return res.status(400).json({ error: 'Mês e ano obrigatórios' });
  try {
    const desbloqueado_ate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('indicadores_qualidade_p3')
      .update({ desbloqueado_ate })
      .eq('mes', mes).eq('ano', Number(ano));
    if (error) throw new Error(error.message);
    res.json({ ok: true, desbloqueado_ate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS P3 — DISQUE DENÚNCIA
// Registros de denúncias por CIA — CRUD completo + upload CSV.
// Status e CIAs válidos são listas fechadas para garantir integridade dos dados.
// ═══════════════════════════════════════════════════════════════

// CIAs válidas para registros de Disque Denúncia.
const DD_CIAS = ['1ª Cia PM', '2ª Cia PM', '3ª Cia PM', 'FT'];
// Status válidos — qualquer outro valor é rejeitado com erro 400.
const DD_STATUS = ['Andamento', 'Averiguada com Êxito', 'Averiguada sem Êxito', 'Sem Averiguação'];

// [GET /api/disque-denuncia/cias] — lista de CIAs válidas para Disque Denúncia (fonte única de verdade).
app.get('/api/disque-denuncia/cias', requireAuth, (req, res) => res.json(DD_CIAS));

// [GET /api/disque-denuncia] — lista denúncias, opcionalmente filtradas por ano (query: ?ano=2025).
app.get('/api/disque-denuncia', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco não configurado' });
  const { ano } = req.query;
  try {
    const filters = ano ? [['gte', 'data', `${ano}-01-01`], ['lte', 'data', `${ano}-12-31`]] : [];
    const data = await fetchAll('disque_denuncia_registros', { filters, order: [['data', { ascending: false }]] });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [POST /api/disque-denuncia] — cria um novo registro de denúncia.
app.post('/api/disque-denuncia', requireAuth, requireRole('admin', 'p3', 'ti'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco não configurado' });
  const { data, cia, numero_dd, data_atendimento, status, flagrante, quant_presos, municipio } = req.body;
  if (!data || !cia || !numero_dd || !status) return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  if (!DD_CIAS.includes(cia)) return res.status(400).json({ error: 'Cia inválida' });
  if (!DD_STATUS.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  try {
    const { data: rec, error } = await supabase.from('disque_denuncia_registros').insert({
      data, cia, numero_dd: numero_dd.trim(),
      data_atendimento: data_atendimento || null,
      status, flagrante: !!flagrante,
      quant_presos: Number(quant_presos) || 0,
      municipio: municipio?.trim() || null,
      created_by: req.user.nome
    }).select().single();
    if (error) throw new Error(error.message);
    res.json(rec);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [PUT /api/disque-denuncia/:id] — atualiza um registro de denúncia existente pelo ID.
app.put('/api/disque-denuncia/:id', requireAuth, requireRole('admin', 'p3', 'ti'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco não configurado' });
  const { data, cia, numero_dd, data_atendimento, status, flagrante, quant_presos, municipio } = req.body;
  if (!data || !cia || !numero_dd || !status) return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  try {
    const { error } = await supabase.from('disque_denuncia_registros').update({
      data, cia, numero_dd: numero_dd.trim(),
      data_atendimento: data_atendimento || null,
      status, flagrante: !!flagrante,
      quant_presos: Number(quant_presos) || 0,
      municipio: municipio?.trim() || null
    }).eq('id', req.params.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [DELETE /api/disque-denuncia/:id] — exclui um registro de denúncia. Requer admin ou p3.
app.delete('/api/disque-denuncia/:id', requireAuth, requireRole('admin', 'p3'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco não configurado' });
  try {
    const { error } = await supabase.from('disque_denuncia_registros').delete().eq('id', req.params.id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [POST /api/disque-denuncia/upload] — importa CSV de Disque Denúncia.
// Apaga registros dos anos presentes no CSV antes de inserir (não é incremental).
// Normaliza status com tolerância a variações de grafia e acento.
app.post('/api/disque-denuncia/upload', requireAuth, requireRole('admin', 'p3', 'ti'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Banco não configurado' });
  const { records } = req.body;
  if (!records?.length) return res.status(400).json({ error: 'Nenhum registro recebido.' });

  const parseDate = v => {
    if (!v) return null;
    // DD/MM/YYYY → YYYY-MM-DD
    const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    // YYYY-MM-DD
    if (String(v).match(/^\d{4}-\d{2}-\d{2}/)) return String(v).slice(0,10);
    return null;
  };

  try {
    const rows = records.map(r => {
      const col = k => {
        const key = Object.keys(r).find(x => x.toLowerCase().trim().includes(k));
        return key ? String(r[key]).trim() : '';
      };
      const dataBase  = parseDate(col('data'));
      // Busca a coluna de data de atendimento com várias grafias possíveis do CSV
      const dataAtend = parseDate(col('data do atend') || col('data de atend') || col('data atend') || col('dataatend'));
      if (!dataBase) return null;
      const cia = col('cia');
      const numero_dd = col('disque') || col('nº') || col('numero');
      const rawStatus = col('status');
      const normS = (rawStatus||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      let status = rawStatus;
      if (normS.includes('exito') && (normS.includes(' com') || normS.startsWith('com'))) status = 'Averiguada com Êxito';
      else if (normS.includes('exito') && (normS.includes(' sem') || normS.startsWith('sem'))) status = 'Averiguada sem Êxito';
      else if (normS.includes('andamento')) status = 'Andamento';
      else if (normS.includes('sem') && normS.includes('aver')) status = 'Sem Averiguação';
      const flagranteRaw = col('flagrante').toLowerCase();
      const flagrante = flagranteRaw === 'sim' || flagranteRaw === 'true' || flagranteRaw === '1';
      const quant_presos = parseInt(col('presos') || col('quant')) || 0;
      const municipio = col('municipio') || col('município') || null;
      if (!cia || !numero_dd || !DD_STATUS.includes(status)) return null;
      return { data: dataBase, cia, numero_dd, data_atendimento: dataAtend, status, flagrante, quant_presos, municipio: municipio || null };
    }).filter(Boolean);

    if (!rows.length) return res.status(400).json({ error: 'Nenhum registro válido. Verifique as colunas do CSV.' });

    // Apaga registros dos anos presentes no CSV antes de inserir
    const anos = [...new Set(rows.map(r => r.data.slice(0, 4)))];
    for (const ano of anos) {
      const { error: delErr } = await supabase.from('disque_denuncia_registros')
        .delete().gte('data', `${ano}-01-01`).lte('data', `${ano}-12-31`);
      if (delErr) throw new Error(delErr.message);
    }

    const BATCH = 500;
    let total = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase.from('disque_denuncia_registros').insert(rows.slice(i, i + BATCH));
      if (error) throw new Error(error.message);
      total += Math.min(BATCH, rows.length - i);
    }
    res.json({ ok: true, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// UIS — UNIDADE DE INSPETORIA DE SAÚDE
// Restrições médicas/odontológicas dos PMs conforme BG PM 166/2006.
// Tabela: uis_restricoes (re, nome, posto, opm, codigos, inicio, termino, dias, observacao)
// ═══════════════════════════════════════════════════════════════

// Extrai a unidade (OPM) do campo que pode vir como "01-09JANEM" → "EM",
// "01-09JAN1ª CIA" → "1ª CIA", ou já limpo como "FT", "EM", etc.
function normUISopm(s) {
  s = (s || '').trim();
  const m = s.match(/\d{2}[-\s]\d{2}\s*(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)(.*)/i);
  if (m && m[1].trim()) return m[1].trim();
  return s;
}

// [POST /api/upload/uis-restricoes] — importa CSV de restrições médicas.
// Colunas esperadas: OPM, Posto/Grad, RE, Nome, Código de restrição, Início, Término, Dias, Verificar
// Estratégia: substitui tudo e insere deduplicado por RE+Início+Término+Códigos.
app.post('/api/upload/uis-restricoes', requireAuth, requireRole('admin', 'p1', 'ti'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  const { records } = req.body;
  if (!records?.length) return res.status(400).json({ error: 'Nenhum registro recebido.' });
  const nk = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const gf = (r, ...keys) => {
    for (const k of keys) {
      const hit = Object.entries(r).find(([ck]) => nk(ck) === nk(k));
      if (hit && hit[1] != null) return String(hit[1]).trim();
    }
    const frags = keys.map(nk);
    const hit2 = Object.entries(r).find(([ck]) => frags.some(f => nk(ck).includes(f)));
    return hit2 ? String(hit2[1]||'').trim() : '';
  };
  try {
    const seen = new Set();
    const rows = [];
    for (const r of records) {
      // RE na planilha UIS tem 5-6 dígitos (sem dígito verificador).
      // Se vier com 7, remove o último (dígito verificador) para padronizar.
      const reRaw = gf(r, 're').replace(/\D/g, '');
      const re = reRaw.length === 7 ? reRaw.slice(0, 6) : reRaw;
      if (!re) continue;
      const codigos_raw = gf(r, 'codigo de restricao', 'codigo', 'código', 'codigos', 'restricao', 'restrição');
      if (!codigos_raw) continue;
      const codigos = codigos_raw.toUpperCase().replace(/\s+/g, ' ').trim();
      const inicio  = parseDateBR(gf(r, 'inicio', 'início'));
      const termino = parseDateBR(gf(r, 'termino', 'término'));
      const key = `${re}|${inicio}|${termino}|${codigos}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        re,
        nome:       gf(r, 'nome'),
        posto:      gf(r, 'posto', 'posto/grad', 'grad'),
        opm:        normUISopm(gf(r, 'opm')),
        codigos,
        inicio,
        termino,
        dias:       parseInt(gf(r, 'dias')) || null,
        observacao: gf(r, 'verificar'),
        origem:     'manual',
      });
    }
    if (!rows.length) return res.status(400).json({ error: 'Nenhum registro válido após validação.' });
    // Só apaga as linhas de origem 'manual' (CSV) — as de origem 'sgp' são
    // mantidas pelo agente-sgp e alimentam a tela UIS; este upload nunca as toca.
    const { error: du1 } = await supabase.from('uis_restricoes').delete().eq('origem', 'manual');
    if (du1) throw new Error('Erro ao limpar registros antigos: ' + du1.message);
    const BATCH = 500;
    let total = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase.from('uis_restricoes').insert(rows.slice(i, i + BATCH));
      if (error) throw new Error(error.message);
      total += Math.min(BATCH, rows.length - i);
    }
    await logAcesso(req, 'upload_uis', `${total} registros importados`);
    res.json({ ok: true, inserted: total });
  } catch (err) {
    console.error('UIS upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// [GET /api/uis/stats] — estatísticas gerais para a seção UIS (somente números, sem nomes).
// Para cada RE, considera apenas a restrição mais recente (maior término).
app.get('/api/uis/stats', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const em30  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    // Mesmo fix aplicado em /api/ias/stats — não conta restrição de quem já
    // saiu do efetivo (reAtivosSet definida mais abaixo, junto do IAS).
    const resAtivos = await reAtivosSet();
    // Só origem 'sgp' — a tela UIS passou a refletir exclusivamente o que vem do
    // SGP-DP (via agente-sgp); linhas de origem 'manual' (CSV) ficam dormentes.
    const all   = (await fetchAll('uis_restricoes', { filters: [['eq', 'origem', 'sgp']] })).filter(r => resAtivos.has(r.re));
    // Para cada RE, mantém apenas o registro com termino mais recente
    const byRe = {};
    for (const r of all) {
      const prev = byRe[r.re];
      if (!prev || (r.termino || '') > (prev.termino || '')) byRe[r.re] = r;
    }
    const latest  = Object.values(byRe);
    const ativas  = latest.filter(r => r.termino && r.termino >= today);
    const vencidas = latest.filter(r => !r.termino || r.termino < today);
    const vencendo = ativas.filter(r => r.termino <= em30);
    // Breakdown por OPM
    const porOpm = {};
    ativas.forEach(r => { const k = r.opm || 'Outros'; porOpm[k] = (porOpm[k]||0) + 1; });
    // Breakdown por código de restrição
    const porCodigo = {};
    ativas.forEach(r => {
      (r.codigos||'').split(/[,\s]+/).map(c => c.trim().toUpperCase()).filter(c => /^[A-Z]{2,3}$/.test(c))
        .forEach(c => { porCodigo[c] = (porCodigo[c]||0) + 1; });
    });
    // Breakdown por código de restrição agrupado por OPM (para tooltip no gráfico)
    const porOpmCodigos = {};
    ativas.forEach(r => {
      const opm = r.opm || 'Outros';
      if (!porOpmCodigos[opm]) porOpmCodigos[opm] = {};
      (r.codigos||'').split(/[,\s]+/).map(c => c.trim().toUpperCase()).filter(c => /^[A-Z]{2,3}$/.test(c))
        .forEach(c => { porOpmCodigos[opm][c] = (porOpmCodigos[opm][c]||0) + 1; });
    });
    // PMs que ficam somente em serviço administrativo (BG PM 166/2006, itens 5.2.2, 5.2.5, 5.2.6, 5.2.7)
    const ADMIN_CODES = ['AU','EP','ES','LR','PT','VP','UA','UU','CC','CB','UB','UC','US'];
    const soAdm = ativas.filter(r =>
      (r.codigos||'').split(/[,\s]+/).map(c => c.trim().toUpperCase()).some(c => ADMIN_CODES.includes(c))
    );
    res.json({ total_ativas: ativas.length, total_vencidas: vencidas.length, total_vencendo: vencendo.length, total_admin_only: soAdm.length, por_opm: porOpm, por_codigo: porCodigo, por_opm_codigos: porOpmCodigos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [GET /api/uis/mapa] — restrições ATIVAS (termino >= hoje), para montar badges no P1.
// Filtra no backend para garantir comparação correta de datas.
// Retorna array de { re, codigos, termino, opm } — um registro por RE (o mais recente).
app.get('/api/uis/mapa', requireAuth, requireSectionNominal('uis', 'p1'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const resAtivos = await reAtivosSet();
    const all   = await fetchAll('uis_restricoes', { filters: [['eq', 'origem', 'sgp']], order: [['termino', { ascending: false }]] });
    // Mantém só registros ativos (termino existe e é >= hoje) de quem ainda está no efetivo.
    const ativas = all.filter(r => r.termino && r.termino >= today && resAtivos.has(r.re));
    res.json(ativas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [GET /api/uis/restricoes/:re] — restrições de um PM pelo RE (para integração com P1).
// O RE passado pode ter dígito verificador (7 digits, efetivo) ou não (5-6, planilha UIS).
// Busca por match exato primeiro; se não achar, tenta sem o último dígito.
app.get('/api/uis/restricoes/:re', requireAuth, requireSectionNominal('uis', 'p1'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  try {
    // RE do efetivo vem como "180673-4" — corta no hífen para obter "180673"
    const reBase = req.params.re.split('-')[0].replace(/\D/g,'');
    const data = await fetchAll('uis_restricoes', {
      filters: [['eq', 're', reBase], ['eq', 'origem', 'sgp']],
      order:   [['termino', { ascending: false }]]
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// IAS — INSPEÇÃO ANUAL DE SAÚDE
// Tabela: ias_registros (re, nome, posto, opm, funcao, genero, nome_guerra,
//         data_aniversario, data_medico, data_dentista, data_vencimento)
// Validade: 1 ano a partir do vencimento. Sem IAS válida → não pode fazer TAF/TAT.
// RE é normalizado sem dígito verificador (igual ao UIS).
// ═══════════════════════════════════════════════════════════════

// Upload manual de IAS removido — a partir daqui ias_registros é alimentada
// exclusivamente pela sincronização via SGP-DP (agente-sgp, sessão colada).

// REs (6 dígitos, sem verificador) de quem está no efetivo_pm atual — usado
// pra não contar registro de IAS de gente que já saiu da unidade. Achado na
// prática (2026-08): contagem "vencido" da UIS (71) não batia com a do P1
// (69) porque a UIS contava TODO ias_registros, sem checar se a pessoa
// ainda está no efetivo — 2 registros eram de gente que já tinha saído.
async function reAtivosSet() {
  const efetivo = await fetchAll(EFETIVO_TABLE, {});
  return new Set(efetivo.map(r => String(r.re).slice(0, 6)));
}

// [GET /api/ias/stats] — estatísticas gerais para a seção UIS/IAS (somente números).
app.get('/api/ias/stats', requireAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const em30  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const resAtivos = await reAtivosSet();
    const all   = (await fetchAll('ias_registros', {})).filter(r => resAtivos.has(r.re));
    const aptos    = all.filter(r => r.data_vencimento && r.data_vencimento >= today);
    const vencidos = all.filter(r => !r.data_vencimento || r.data_vencimento < today);
    const vencendo = aptos.filter(r => r.data_vencimento <= em30);
    res.json({ total: all.length, total_aptos: aptos.length, total_vencidos: vencidos.length, total_vencendo: vencendo.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [GET /api/ias/mapa] — todos os registros IAS para badges no P1.
app.get('/api/ias/mapa', requireAuth, requireSectionNominal('uis', 'p1'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  try {
    const resAtivos = await reAtivosSet();
    const all = (await fetchAll('ias_registros', {})).filter(r => resAtivos.has(r.re));
    res.json(all);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [GET /api/ias/:re] — registro IAS de um PM pelo RE.
app.get('/api/ias/:re', requireAuth, requireSectionNominal('uis', 'p1'), async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase não configurado' });
  try {
    const reBase = req.params.re.replace(/[^0-9]/g, '');
    const reNorm = reBase.length >= 7 ? reBase.slice(0, reBase.length - 1) : reBase;
    const data = await fetchAll('ias_registros', { filters: [['eq', 're', reNorm]] });
    res.json(data[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// ROTAS P3 — CURSOS INSTITUCIONAIS
// Histórico de cursos por PM: data, nome do curso, posto, RE, nota,
// conceito, boletim etc. Fonte principal é a sincronização via SGP-DP
// (agente-sgp, sessão colada — mesmo mecanismo do IAS), que grava linhas
// com origem 'interno'/'externo'. Mas nem todo curso está no SGP-DP —
// upload manual de CSV continua existindo (origem 'manual') para esses
// casos; a sincronização nunca apaga linhas com origem='manual'.
// ═══════════════════════════════════════════════════════════════

// [POST /api/upload/cursos] — importa CSV de cursos que não vêm do SGP-DP.
// Apaga só as linhas manuais (origem='manual') dos anos presentes antes de
// inserir — nunca toca nas linhas geradas pela sincronização SGP-DP.
// Um curso pode gerar N linhas na tabela — uma por PM listado no campo PM/interessados.
app.post('/api/upload/cursos', requireAuth, requireRole('admin', 'p3'), async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  const { records } = req.body;
  if (!records?.length) return res.status(400).json({ error: 'Nenhum registro recebido.' });
  const nk = s => (s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const gf = (r, ...keys) => {
    for (const k of keys) {
      const hit = Object.entries(r).find(([ck]) => nk(ck) === nk(k));
      if (hit && hit[1] != null) return String(hit[1]).trim();
    }
    const frags = keys.map(nk);
    const hit2 = Object.entries(r).find(([ck]) => frags.some(f => nk(ck).includes(f)));
    return hit2 ? String(hit2[1]||'').trim() : '';
  };
  try {
    const rows = [];
    for (const r of records) {
      const nOficio  = gf(r, 'n do oficio', 'nº do ofício', 'no do oficio', 'n oficio', 'oficio');
      const dataStr  = gf(r, 'data');
      const nomeCurso= gf(r, 'curso', 'nome do curso', 'nome_curso');
      const pmField  = gf(r, 'pm', 'interessados', 'pms');
      if (!nomeCurso) continue;
      const parsed = parseDateBR(dataStr) || (dataStr.match(/^\d{4}-\d{2}-\d{2}/) ? dataStr.slice(0,10) : null);
      let ano = 0, mes = '';
      if (parsed) {
        const [y, m] = parsed.split('-');
        ano = parseInt(y);
        mes = _MESES_PT[parseInt(m) - 1] || '';
      }
      const pms = parsePMsField(pmField);
      const base = { boletim_curso: nOficio || null, data: parsed, nome_curso: nomeCurso, ano, mes, origem: 'manual' };
      if (!pms.length) {
        rows.push({ ...base, re_pm: null, posto_pm: null, nome_pm: null });
      } else {
        for (const pm of pms) rows.push({ ...base, ...pm });
      }
    }
    if (!rows.length) return res.status(400).json({ error: 'Nenhum registro válido após validação.' });
    const anos = [...new Set(rows.map(r => r.ano).filter(a => a > 0))];
    for (const ano of anos) {
      const { error: delErr } = await supabase.from('prod_cursos').delete().eq('ano', ano).eq('origem', 'manual');
      if (delErr) throw new Error(delErr.message);
    }
    const BATCH = 500;
    let total = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error: insErr } = await supabase.from('prod_cursos').insert(rows.slice(i, i + BATCH));
      if (insErr) throw new Error(insErr.message);
      total += Math.min(BATCH, rows.length - i);
    }
    await logAcesso(req, 'upload_cursos', `${total} registros importados`);
    res.json({ ok: true, total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [GET /api/pm/:re/cursos] — lista todos os cursos de um PM específico (pelo RE), em ordem decrescente por data.
app.get('/api/pm/:re/cursos', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  try {
    const { data, error } = await supabase.from('prod_cursos').select('*').eq('re_pm', req.params.re).order('data', { ascending: false });
    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [GET /api/pm/:re/laureas] — lista todas as láureas de um PM específico (pelo RE), em ordem decrescente por data de concessão.
app.get('/api/pm/:re/laureas', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  try {
    const { data, error } = await supabase.from('prod_laureas').select('*').eq('re_pm', req.params.re).order('concessao', { ascending: false });
    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [GET /api/laureas/resumo] — pra cada PM do efetivo, o grau mais alto de
// láurea que ele tem (1º é o mais alto, 5º o mais baixo — mesma lógica de
// "menor número = mais graduado" usada no prontuário individual), ou
// grau=null se não tem nenhuma; + lista crua de láureas (data de concessão,
// opm e re base de cada uma) pra série histórica por ano/mês e pra listar os
// PMs por trás de cada mês. Usado no P5 (mapa de láureas do efetivo). `opm`
// vem em ambas as listas pra permitir filtrar por CIA no frontend (efetivo_pm
// não tem coluna `cia` própria, só `opm`); `re` em `laureas` já vem sem
// dígito verificador (casa com `efetivo[].re.split('-')[0]`).
app.get('/api/laureas/resumo', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  try {
    // fetchAll pagina de 1000 em 1000 — prod_laureas já passou de 1000 linhas
    // e um .select() cru descartava silenciosamente as excedentes, fazendo
    // PMs com láurea (inclusive de 1º grau) aparecerem como "Sem Láurea".
    const [efetivoRows, laureasRows] = await Promise.all([
      fetchAll(EFETIVO_TABLE, { select: 're, nome, nome_guerra, posto, opm' }),
      fetchAll('prod_laureas', { select: 're_pm, descricao_medalha, concessao, opm' }),
    ]);

    const parseGrau = desc => {
      const m = /(\d+)\s*º?\s*grau/i.exec(desc || '');
      return m ? parseInt(m[1], 10) : null;
    };

    const grauPorRe = {};
    laureasRows.forEach(l => {
      const g = parseGrau(l.descricao_medalha);
      if (g == null) return;
      const re = String(l.re_pm || '').split('-')[0];
      if (!re) return;
      if (grauPorRe[re] == null || g < grauPorRe[re]) grauPorRe[re] = g;
    });

    const efetivo = efetivoRows.map(pm => ({
      re: pm.re, nome: pm.nome, nome_guerra: pm.nome_guerra, posto: pm.posto, opm: pm.opm,
      grau: grauPorRe[String(pm.re || '').split('-')[0]] ?? null,
    }));

    const laureas = laureasRows
      .filter(l => l.concessao)
      .map(l => ({
        concessao: l.concessao, opm: l.opm, grau: parseGrau(l.descricao_medalha),
        // RE base (sem dígito verificador) pra casar com efetivo[].re no
        // frontend — mesma normalização usada em grauPorRe logo acima.
        re: String(l.re_pm || '').split('-')[0],
      }));

    res.json({ efetivo, laureas });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════
// LOGS DE ACESSO — auditoria visível somente ao admin
// ═══════════════════════════════════════════════════════════════

// [GET /api/logs/acesso] — retorna o histórico de acessos. Restrito a admin.
app.get('/api/logs/acesso', requireAuth, requireRole('admin', 'ti'), async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase não configurado' });
  try {
    const limit = Math.min(parseInt(req.query.limit) || 500, 2000);
    const { data, error } = await supabase
      .from('logs_acesso')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// [POST /api/logs/acesso] — registra evento de navegação enviado pelo frontend.
app.post('/api/logs/acesso', requireAuth, async (req, res) => {
  const { acao, detalhe } = req.body || {};
  if (!acao) return res.status(400).json({ error: 'acao obrigatório' });
  await logAcesso(req, acao, detalhe || null);
  res.json({ ok: true });
});

// Catch-all: qualquer rota não mapeada acima retorna o index.html (SPA — Single Page Application).
// O frontend trata a navegação internamente via JavaScript.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════
// START — inicializa dados e sobe o servidor
// ═══════════════════════════════════════════════════════════════
// init() faz a primeira carga do cache (Supabase ou fallback local),
// depois o servidor começa a escutar na porta 3001.
init().then(() => {
  app.listen(PORT, () => {
    console.log(`✓ API rodando em http://localhost:${PORT}`);
    if (supabase) console.log(`  Supabase: ${SUPABASE_URL}`);
    else          console.log(`  ⚠ Configure SUPABASE_URL e SUPABASE_KEY no server.js`);
  });
});
