/**
 * db.js — Camada de acesso ao MySQL (banco de dados da PM)
 * ─────────────────────────────────────────────────────────
 * Substitui o cliente @supabase/supabase-js. Toda query do server.js e do
 * agente-sgp passa por aqui. Se um dia o banco mudar de novo, muda só este
 * arquivo.
 *
 * Config via .env (ver .env.example):
 *   MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 *   MYSQL_POOL_SIZE (opcional, padrão 10)
 *
 * Convenções mantidas do código antigo:
 *   - Datas DATE voltam como string 'YYYY-MM-DD' (comparações tipo
 *     `r.termino >= hoje` continuam funcionando).
 *   - DATETIME/TIMESTAMP voltam como ISO 'YYYY-MM-DDTHH:MM:SSZ' (UTC),
 *     igual ao que o Supabase devolvia — `new Date(x)` no frontend fica certo.
 *   - Colunas TINYINT(1) voltam como boolean (true/false), não 0/1.
 *   - Colunas JSON voltam como objeto já parseado.
 *   - `undefined` vira NULL; Date/objeto/boolean são convertidos ao gravar.
 */

const mysql = require('mysql2/promise');

const {
  MYSQL_HOST,
  MYSQL_PORT,
  MYSQL_USER,
  MYSQL_PASSWORD,
  MYSQL_DATABASE,
  MYSQL_POOL_SIZE,
} = process.env;

if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_DATABASE) {
  console.error('FATAL: defina MYSQL_HOST, MYSQL_USER e MYSQL_DATABASE no .env (ver .env.example)');
  process.exit(1);
}

// ── Conversão de tipos na LEITURA ──────────────────────────────────────────
// typeCast substitui o comportamento padrão do mysql2 (e por isso precisa
// tratar datas aqui — a opção `dateStrings` é ignorada quando há typeCast).
function typeCast(field, next) {
  if (field.type === 'TINY' && field.length === 1) {
    const v = field.string();
    return v === null ? null : v === '1';
  }
  if (field.type === 'DATE' || field.type === 'NEWDATE') {
    return field.string(); // 'YYYY-MM-DD' (ou null)
  }
  if (field.type === 'DATETIME' || field.type === 'TIMESTAMP') {
    const s = field.string();
    return s ? s.replace(' ', 'T') + 'Z' : s; // ISO UTC, igual ao Supabase
  }
  if (field.type === 'JSON') {
    const s = field.string();
    if (s == null) return null;
    try { return JSON.parse(s); } catch { return s; }
  }
  return next();
}

const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: Number(MYSQL_PORT) || 3306,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD || '',
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: Number(MYSQL_POOL_SIZE) || 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',            // grava/lê datas como UTC
  supportBigNumbers: true,
  bigNumberStrings: false,
  dateStrings: true,        // ignorado por causa do typeCast, mas explícito
  typeCast,
  multipleStatements: false,
});

// Toda conexão do pool opera em UTC — assim CURRENT_TIMESTAMP e as datas
// gravadas/lidas ficam consistentes independente do fuso do servidor MySQL.
pool.on('connection', conn => { conn.query("SET time_zone = '+00:00'"); });

// ── Conversão de valores na ESCRITA ───────────────────────────────────────
const ISO_DT = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;
function norm(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof v === 'string') {
    const m = v.match(ISO_DT);
    return m ? `${m[1]} ${m[2]}` : v;   // ISO → 'YYYY-MM-DD HH:MM:SS'
  }
  if (typeof v === 'object') return JSON.stringify(v); // coluna JSON
  return v;
}

// Identificador (tabela/coluna) entre crases, com escape.
const qi = id => '`' + String(id).replace(/`/g, '``') + '`';

// ── WHERE builder ─────────────────────────────────────────────────────────
// Aceita:
//   - objeto  { col: valor, ... }         → col = valor AND ...  (valor null → IS NULL)
//   - array   [ [col, op, valor], ... ]   → op ∈ =,<>,<,<=,>,>=,LIKE,IN,'IS NULL','IS NOT NULL'
function buildWhere(where) {
  const entries = Array.isArray(where)
    ? where
    : Object.entries(where || {}).map(([k, v]) => [k, '=', v]);
  const clauses = [];
  const params = [];
  for (const [col, opRaw, val] of entries) {
    const op = String(opRaw).toUpperCase();
    if (op === 'IS NULL' || (op === '=' && val === null)) { clauses.push(`${qi(col)} IS NULL`); continue; }
    if (op === 'IS NOT NULL' || (op === '<>' && val === null)) { clauses.push(`${qi(col)} IS NOT NULL`); continue; }
    if (op === 'IN' || op === 'NOT IN') {
      const arr = Array.isArray(val) ? val : [val];
      if (!arr.length) { clauses.push(op === 'IN' ? '1=0' : '1=1'); continue; }
      clauses.push(`${qi(col)} ${op} (${arr.map(() => '?').join(',')})`);
      params.push(...arr.map(norm));
      continue;
    }
    clauses.push(`${qi(col)} ${op} ?`);
    params.push(norm(val));
  }
  return { sql: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', params };
}

function buildOrder(orderBy) {
  if (!orderBy) return '';
  const list = (Array.isArray(orderBy) ? orderBy : [orderBy]).map(o => {
    if (typeof o === 'string') return qi(o);
    return `${qi(o.col)} ${String(o.dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC'}`;
  });
  return list.length ? ' ORDER BY ' + list.join(', ') : '';
}

// ── API ──────────────────────────────────────────────────────────────────

/** Query crua. Retorna array de linhas (SELECT) ou o objeto de resultado. */
async function raw(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** SELECT genérico. columns: '*' ou 'a, b, c'. */
async function select(table, { columns = '*', where = {}, orderBy, limit, offset } = {}) {
  const cols = columns === '*'
    ? '*'
    : columns.split(',').map(c => qi(c.trim())).join(', ');
  const w = buildWhere(where);
  let sql = `SELECT ${cols} FROM ${qi(table)}${w.sql}${buildOrder(orderBy)}`;
  if (limit != null) sql += ` LIMIT ${Number(limit)}`;
  if (offset != null) sql += ` OFFSET ${Number(offset)}`;
  return raw(sql, w.params);
}

/** Primeira linha ou null. */
async function selectOne(table, opts = {}) {
  const rows = await select(table, { ...opts, limit: 1 });
  return rows[0] || null;
}

/** COUNT(*). */
async function count(table, where = {}) {
  const w = buildWhere(where);
  const rows = await raw(`SELECT COUNT(*) AS c FROM ${qi(table)}${w.sql}`, w.params);
  return Number(rows[0].c);
}

/** INSERT de 1 linha. Retorna { insertId, affectedRows }. */
async function insert(table, row) {
  const cols = Object.keys(row);
  if (!cols.length) throw new Error('db.insert: linha sem colunas');
  const sql = `INSERT INTO ${qi(table)} (${cols.map(qi).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  const [res] = await pool.query(sql, cols.map(c => norm(row[c])));
  return { insertId: res.insertId, affectedRows: res.affectedRows };
}

// União das chaves de todas as linhas (linhas heterogêneas → colunas
// ausentes viram NULL). Preserva a ordem de aparição.
function unionKeys(rows) {
  const seen = new Set();
  const cols = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
  return cols;
}

/** INSERT em lote (chunks). Linhas podem ter chaves diferentes (faltantes → NULL). */
async function insertMany(table, rows, { batchSize = 500 } = {}) {
  if (!rows.length) return { affectedRows: 0 };
  const cols = unionKeys(rows);
  let affected = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const ph = chunk.map(() => `(${cols.map(() => '?').join(', ')})`).join(', ');
    const params = [];
    for (const r of chunk) for (const c of cols) params.push(norm(r[c]));
    const [res] = await pool.query(
      `INSERT INTO ${qi(table)} (${cols.map(qi).join(', ')}) VALUES ${ph}`, params);
    affected += res.affectedRows;
  }
  return { affectedRows: affected };
}

/**
 * UPSERT em lote — INSERT ... ON DUPLICATE KEY UPDATE.
 * updateCols: colunas a atualizar em caso de conflito (padrão: todas menos as
 * de conflito não são conhecidas aqui, então padrão = todas as colunas da linha).
 * Requer um índice UNIQUE/PK correspondente na tabela.
 */
async function upsertMany(table, rows, { updateCols, batchSize = 500 } = {}) {
  if (!rows.length) return { affectedRows: 0 };
  const cols = unionKeys(rows);
  const upd = (updateCols && updateCols.length ? updateCols : cols)
    .map(c => `${qi(c)} = VALUES(${qi(c)})`).join(', ');
  let affected = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const ph = chunk.map(() => `(${cols.map(() => '?').join(', ')})`).join(', ');
    const params = [];
    for (const r of chunk) for (const c of cols) params.push(norm(r[c]));
    const [res] = await pool.query(
      `INSERT INTO ${qi(table)} (${cols.map(qi).join(', ')}) VALUES ${ph} ON DUPLICATE KEY UPDATE ${upd}`,
      params);
    affected += res.affectedRows;
  }
  return { affectedRows: affected };
}

/** UPSERT de 1 linha. */
async function upsert(table, row, opts = {}) {
  return upsertMany(table, [row], opts);
}

/** UPDATE. where: objeto ou array (ver buildWhere). Retorna { affectedRows }. */
async function update(table, values, where) {
  const cols = Object.keys(values);
  if (!cols.length) return { affectedRows: 0 };
  const w = buildWhere(where);
  const sql = `UPDATE ${qi(table)} SET ${cols.map(c => `${qi(c)} = ?`).join(', ')}${w.sql}`;
  const [res] = await pool.query(sql, [...cols.map(c => norm(values[c])), ...w.params]);
  return { affectedRows: res.affectedRows };
}

/** DELETE. where: objeto ou array. where {} apaga a tabela inteira. */
async function remove(table, where) {
  const w = buildWhere(where);
  const [res] = await pool.query(`DELETE FROM ${qi(table)}${w.sql}`, w.params);
  return { affectedRows: res.affectedRows };
}

/** Testa a conexão (chamado no boot). Lança se não conectar. */
async function ping() {
  const conn = await pool.getConnection();
  try { await conn.ping(); } finally { conn.release(); }
}

module.exports = {
  pool, raw, select, selectOne, count,
  insert, insertMany, upsert, upsertMany, update, remove,
  ping, norm,
  // erro de violação de chave única (equivalente ao code '23505' do Postgres)
  isDuplicateError: err => err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062),
};
