<?php
/**
 * query.php — `fetchAll`: wrapper com o vocabulário antigo (Supabase) sobre DB::select.
 * Mantido para não reescrever as rotas que já usavam filtros [metodo, coluna, valor].
 * Métodos: eq, neq, gt, gte, lt, lte, like, ilike, in.
 */

declare(strict_types=1);

const FETCHALL_OPS = [
    'eq' => '=', 'neq' => '<>', 'gt' => '>', 'gte' => '>=',
    'lt' => '<', 'lte' => '<=', 'like' => 'LIKE', 'ilike' => 'LIKE', 'in' => 'IN',
];

/**
 * @param array{select?:string, filters?:list<array{0:string,1:string,2:mixed}>, order?:list<array{0:string,1?:array}>} $opts
 */
function fetch_all(string $table, array $opts = []): array
{
    $where = [];
    foreach ($opts['filters'] ?? [] as [$method, $col, $val]) {
        if (!isset(FETCHALL_OPS[$method])) {
            throw new InvalidArgumentException("fetch_all: filtro não suportado \"$method\"");
        }
        $where[] = [$col, FETCHALL_OPS[$method], $val];
    }

    $orderBy = [];
    foreach ($opts['order'] ?? [] as $ord) {
        $col  = $ord[0];
        $asc  = ($ord[1]['ascending'] ?? true) !== false;
        $orderBy[] = ['col' => $col, 'dir' => $asc ? 'asc' : 'desc'];
    }

    return DB::select($table, [
        'columns' => $opts['select'] ?? '*',
        'where'   => $where,
        'orderBy' => $orderBy,
    ]);
}
