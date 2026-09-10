<?php
/**
 * db.php — Camada de acesso ao MySQL (banco de dados da PM)
 * ─────────────────────────────────────────────────────────
 * Porta em PHP da antiga backend/db.js. Usa **mysqli** (não PDO): o ambiente
 * da PM (mesmo do phpMyAdmin) garante a extensão mysqli; pdo_mysql pode não
 * estar habilitada.
 *
 * Config via secrets.php / .env: MYSQL_HOST, MYSQL_PORT, MYSQL_USER,
 * MYSQL_PASSWORD, MYSQL_DATABASE.
 *
 * Convenções mantidas do código antigo (mysql2 typeCast):
 *   - DATE               → string 'YYYY-MM-DD'
 *   - DATETIME/TIMESTAMP → string ISO 'YYYY-MM-DDTHH:MM:SSZ' (UTC)
 *   - TINYINT(1)         → bool
 *   - JSON               → array já decodificado
 *   - DECIMAL            → string (idêntico ao mysql2 sem decimalNumbers)
 *   - null → null; bool/array/DateTime convertidos na escrita
 *
 * Helpers: raw, select, selectOne, count, insert, insertMany, upsert,
 * upsertMany, update, remove, ping, norm, isDuplicateError.
 */

declare(strict_types=1);

final class DB
{
    /** Colunas JSON conhecidas do schema (decodificadas por nome). */
    private const JSON_COLUMNS = ['secoes_acesso', 'resultado'];

    private static ?mysqli $conn = null;

    public static function conn(): mysqli
    {
        if (self::$conn instanceof mysqli) {
            return self::$conn;
        }

        mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

        $host = getenv('MYSQL_HOST') ?: '';
        $user = getenv('MYSQL_USER') ?: '';
        $name = getenv('MYSQL_DATABASE') ?: '';
        $port = (int) (getenv('MYSQL_PORT') ?: 3306);
        $pass = getenv('MYSQL_PASSWORD');
        if ($pass === false) {
            $pass = '';
        }
        if ($host === '' || $user === '' || $name === '') {
            throw new RuntimeException(
                'defina MYSQL_HOST, MYSQL_USER e MYSQL_DATABASE em api/secrets.php ou api/.env'
            );
        }

        $c = mysqli_init();
        $c->options(MYSQLI_OPT_CONNECT_TIMEOUT, 10);
        $c->real_connect($host, $user, $pass, $name, $port);
        $c->set_charset('utf8mb4');
        // UTC em toda conexão — CURRENT_TIMESTAMP e datas ficam consistentes.
        $c->query("SET time_zone = '+00:00'");

        self::$conn = $c;
        return $c;
    }

    // ── Conversão de tipos na LEITURA ────────────────────────────────────────

    /** @return array<string,string> nome da coluna → 'bool'|'datetime'|'json'|'raw' */
    private static function typeMap(mysqli_result $res): array
    {
        $map = [];
        foreach ($res->fetch_fields() as $f) {
            $t = $f->type;
            if (in_array($f->name, self::JSON_COLUMNS, true) || $t === MYSQLI_TYPE_JSON) {
                $map[$f->name] = 'json';
            } elseif ($t === MYSQLI_TYPE_TINY && (int) $f->length <= 1) {
                // TINYINT(1) → bool. length 1 (unsigned) — todo TINYINT do schema
                // é TINYINT(1). Valor > 1 volta como int (defensivo, em convertRow).
                $map[$f->name] = 'bool';
            } elseif ($t === MYSQLI_TYPE_DATETIME || $t === MYSQLI_TYPE_TIMESTAMP) {
                $map[$f->name] = 'datetime';
            } else {
                $map[$f->name] = 'raw';
            }
        }
        return $map;
    }

    /** @param array<string,string> $typeMap */
    private static function convertRow(array $row, array $typeMap): array
    {
        foreach ($row as $col => $val) {
            if ($val === null) {
                continue;
            }
            switch ($typeMap[$col] ?? 'raw') {
                case 'bool':
                    $iv = (int) $val;
                    $row[$col] = $iv === 1 ? true : ($iv === 0 ? false : $iv);
                    break;
                case 'datetime':
                    $row[$col] = str_replace(' ', 'T', (string) $val) . 'Z';
                    break;
                case 'json':
                    $decoded = json_decode((string) $val, true);
                    $row[$col] = ($decoded === null && json_last_error() !== JSON_ERROR_NONE) ? $val : $decoded;
                    break;
            }
        }
        return $row;
    }

    // ── Conversão de valores na ESCRITA ─────────────────────────────────────

    private const ISO_DT = '/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/';

    public static function norm(mixed $v): mixed
    {
        if ($v === null) {
            return null;
        }
        if (is_bool($v)) {
            return $v ? 1 : 0;
        }
        if ($v instanceof DateTimeInterface) {
            return (clone $v)->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        }
        if (is_string($v)) {
            if (preg_match(self::ISO_DT, $v, $m)) {
                return $m[1] . ' ' . $m[2];
            }
            return $v;
        }
        if (is_array($v)) {
            return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        return $v; // int/float
    }

    private static function qi(string $id): string
    {
        return '`' . str_replace('`', '``', $id) . '`';
    }

    // ── Execução de statement preparado ────────────────────────────────────

    /** @param list<mixed> $params @return array{rows:?list<array>, affected:int, insertId:int} */
    private static function exec(string $sql, array $params): array
    {
        $c = self::conn();
        $stmt = $c->prepare($sql);
        if ($params) {
            $bind = array_map([self::class, 'norm'], array_values($params));
            $stmt->bind_param(str_repeat('s', count($bind)), ...$bind);
        }
        $stmt->execute();

        $result = $stmt->get_result();
        if ($result instanceof mysqli_result) {
            $typeMap = self::typeMap($result);
            $rows = array_map(
                fn ($r) => self::convertRow($r, $typeMap),
                $result->fetch_all(MYSQLI_ASSOC)
            );
            $result->free();
            $stmt->close();
            return ['rows' => $rows, 'affected' => 0, 'insertId' => 0];
        }

        $out = ['rows' => null, 'affected' => $stmt->affected_rows, 'insertId' => (int) $stmt->insert_id];
        $stmt->close();
        return $out;
    }

    // ── WHERE / ORDER builders ─────────────────────────────────────────────

    /** @return array{sql:string, params:list<mixed>} */
    private static function buildWhere(mixed $where): array
    {
        if ($where === null || $where === [] || $where === (object) []) {
            return ['sql' => '', 'params' => []];
        }

        $entries = [];
        if (is_array($where) && array_is_list($where)) {
            $entries = $where;
        } else {
            foreach ((array) $where as $k => $v) {
                $entries[] = [$k, '=', $v];
            }
        }

        $clauses = [];
        $params  = [];
        foreach ($entries as $entry) {
            $col = $entry[0];
            $op  = strtoupper((string) ($entry[1] ?? '='));
            $val = $entry[2] ?? null;

            if ($op === 'IS NULL' || ($op === '=' && $val === null)) {
                $clauses[] = self::qi($col) . ' IS NULL';
                continue;
            }
            if ($op === 'IS NOT NULL' || ($op === '<>' && $val === null)) {
                $clauses[] = self::qi($col) . ' IS NOT NULL';
                continue;
            }
            if ($op === 'IN' || $op === 'NOT IN') {
                $arr = is_array($val) ? array_values($val) : [$val];
                if (count($arr) === 0) {
                    $clauses[] = $op === 'IN' ? '1=0' : '1=1';
                    continue;
                }
                $ph = implode(',', array_fill(0, count($arr), '?'));
                $clauses[] = self::qi($col) . " $op ($ph)";
                foreach ($arr as $x) {
                    $params[] = self::norm($x);
                }
                continue;
            }
            $clauses[] = self::qi($col) . " $op ?";
            $params[]  = self::norm($val);
        }

        return [
            'sql'    => $clauses ? ' WHERE ' . implode(' AND ', $clauses) : '',
            'params' => $params,
        ];
    }

    private static function buildOrder(mixed $orderBy): string
    {
        if ($orderBy === null || $orderBy === '' || $orderBy === []) {
            return '';
        }
        $list = (is_array($orderBy) && array_is_list($orderBy)) ? $orderBy : [$orderBy];
        $parts = [];
        foreach ($list as $o) {
            if (is_string($o)) {
                $parts[] = self::qi($o);
            } elseif (is_array($o)) {
                $dir = strtolower((string) ($o['dir'] ?? 'asc')) === 'desc' ? 'DESC' : 'ASC';
                $parts[] = self::qi((string) $o['col']) . ' ' . $dir;
            }
        }
        return $parts ? ' ORDER BY ' . implode(', ', $parts) : '';
    }

    // ── API ────────────────────────────────────────────────────────────────

    /** Query crua. Retorna lista de linhas (SELECT) ou ['affectedRows'=>n]. */
    public static function raw(string $sql, array $params = []): array
    {
        $r = self::exec($sql, $params);
        return $r['rows'] ?? ['affectedRows' => $r['affected']];
    }

    /** @param array{columns?:string, where?:mixed, orderBy?:mixed, limit?:int, offset?:int} $opts */
    public static function select(string $table, array $opts = []): array
    {
        $columns = $opts['columns'] ?? '*';
        $cols = $columns === '*'
            ? '*'
            : implode(', ', array_map(fn ($c) => self::qi(trim($c)), explode(',', $columns)));

        $w = self::buildWhere($opts['where'] ?? null);
        $sql = 'SELECT ' . $cols . ' FROM ' . self::qi($table) . $w['sql'] . self::buildOrder($opts['orderBy'] ?? null);
        if (isset($opts['limit'])) {
            $sql .= ' LIMIT ' . (int) $opts['limit'];
        }
        if (isset($opts['offset'])) {
            $sql .= ' OFFSET ' . (int) $opts['offset'];
        }
        return self::exec($sql, $w['params'])['rows'] ?? [];
    }

    public static function selectOne(string $table, array $opts = []): ?array
    {
        $opts['limit'] = 1;
        return self::select($table, $opts)[0] ?? null;
    }

    public static function count(string $table, mixed $where = null): int
    {
        $w = self::buildWhere($where);
        $rows = self::exec('SELECT COUNT(*) AS c FROM ' . self::qi($table) . $w['sql'], $w['params'])['rows'] ?? [];
        return (int) ($rows[0]['c'] ?? 0);
    }

    /** @return array{insertId:int, affectedRows:int} */
    public static function insert(string $table, array $row): array
    {
        $cols = array_keys($row);
        if (!$cols) {
            throw new InvalidArgumentException('DB::insert: linha sem colunas');
        }
        $ph = implode(', ', array_fill(0, count($cols), '?'));
        $sql = 'INSERT INTO ' . self::qi($table)
            . ' (' . implode(', ', array_map([self::class, 'qi'], $cols)) . ') VALUES (' . $ph . ')';
        $r = self::exec($sql, array_map(fn ($c) => $row[$c], $cols));
        return ['insertId' => $r['insertId'], 'affectedRows' => $r['affected']];
    }

    private static function unionKeys(array $rows): array
    {
        $seen = [];
        foreach ($rows as $r) {
            foreach (array_keys($r) as $k) {
                $seen[$k] = true;
            }
        }
        return array_keys($seen);
    }

    /** @return array{affectedRows:int} */
    public static function insertMany(string $table, array $rows, int $batchSize = 500): array
    {
        if (!$rows) {
            return ['affectedRows' => 0];
        }
        $cols = self::unionKeys($rows);
        $colSql = implode(', ', array_map([self::class, 'qi'], $cols));
        $rowPh = '(' . implode(', ', array_fill(0, count($cols), '?')) . ')';
        $affected = 0;

        foreach (array_chunk($rows, $batchSize) as $chunk) {
            $ph = implode(', ', array_fill(0, count($chunk), $rowPh));
            $params = [];
            foreach ($chunk as $r) {
                foreach ($cols as $c) {
                    $params[] = $r[$c] ?? null;
                }
            }
            $affected += self::exec("INSERT INTO " . self::qi($table) . " ($colSql) VALUES $ph", $params)['affected'];
        }
        return ['affectedRows' => $affected];
    }

    /** @param list<string>|null $updateCols @return array{affectedRows:int} */
    public static function upsertMany(string $table, array $rows, ?array $updateCols = null, int $batchSize = 500): array
    {
        if (!$rows) {
            return ['affectedRows' => 0];
        }
        $cols = self::unionKeys($rows);
        $colSql = implode(', ', array_map([self::class, 'qi'], $cols));
        $rowPh = '(' . implode(', ', array_fill(0, count($cols), '?')) . ')';
        $updList = ($updateCols && count($updateCols)) ? $updateCols : $cols;
        $upd = implode(', ', array_map(fn ($c) => self::qi($c) . ' = VALUES(' . self::qi($c) . ')', $updList));
        $affected = 0;

        foreach (array_chunk($rows, $batchSize) as $chunk) {
            $ph = implode(', ', array_fill(0, count($chunk), $rowPh));
            $params = [];
            foreach ($chunk as $r) {
                foreach ($cols as $c) {
                    $params[] = $r[$c] ?? null;
                }
            }
            $affected += self::exec(
                "INSERT INTO " . self::qi($table) . " ($colSql) VALUES $ph ON DUPLICATE KEY UPDATE $upd",
                $params
            )['affected'];
        }
        return ['affectedRows' => $affected];
    }

    public static function upsert(string $table, array $row, ?array $updateCols = null): array
    {
        return self::upsertMany($table, [$row], $updateCols);
    }

    /** @return array{affectedRows:int} */
    public static function update(string $table, array $values, mixed $where): array
    {
        $cols = array_keys($values);
        if (!$cols) {
            return ['affectedRows' => 0];
        }
        $w = self::buildWhere($where);
        $set = implode(', ', array_map(fn ($c) => self::qi($c) . ' = ?', $cols));
        $params = array_merge(array_map(fn ($c) => $values[$c], $cols), $w['params']);
        return ['affectedRows' => self::exec('UPDATE ' . self::qi($table) . ' SET ' . $set . $w['sql'], $params)['affected']];
    }

    /** @return array{affectedRows:int} */
    public static function remove(string $table, mixed $where = null): array
    {
        $w = self::buildWhere($where);
        return ['affectedRows' => self::exec('DELETE FROM ' . self::qi($table) . $w['sql'], $w['params'])['affected']];
    }

    public static function ping(): void
    {
        self::conn()->query('SELECT 1');
    }

    public static function isDuplicateError(Throwable $e): bool
    {
        return (int) $e->getCode() === 1062;
    }
}
