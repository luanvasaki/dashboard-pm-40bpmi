<?php
/**
 * auth.php — Autenticação/autorização + auditoria.
 * ───────────────────────────────────────────────
 * Porta dos middlewares requireAuth / requireRole / requireSectionNominal e da
 * função logAcesso de backend/server.js.
 */

declare(strict_types=1);

/** @var array<string,mixed>|null cache do usuário autenticado nesta requisição */
$GLOBALS['__auth_user'] = null;

/**
 * Verifica o JWT (cookie httpOnly `auth_token` ou header Authorization: Bearer).
 * Em caso de sucesso devolve os claims; em falha responde 401 e encerra.
 * @return array<string,mixed>
 */
function require_auth(): array
{
    if (is_array($GLOBALS['__auth_user'])) {
        return $GLOBALS['__auth_user'];
    }

    $token = Req::cookie('auth_token');
    if (!$token) {
        $authHeader = Req::header('Authorization');
        if ($authHeader && str_starts_with($authHeader, 'Bearer ')) {
            $token = substr($authHeader, 7);
        }
    }
    if (!$token) {
        Res::error('Token não fornecido', 401);
    }

    try {
        $user = JWT::verify($token, JWT_SECRET);
    } catch (Throwable $e) {
        Res::error('Token inválido ou expirado', 401);
    }

    $GLOBALS['__auth_user'] = $user;
    return $user;
}

/**
 * Restringe aos roles informados. 'ti' sempre passa (equivale a admin em quase
 * tudo, exceto exclusões críticas — igual ao Node).
 * @param array<string,mixed> $user
 */
function require_role(array $user, string ...$roles): void
{
    $role = $user['role'] ?? null;
    if ($role === 'ti' || in_array($role, $roles, true)) {
        return;
    }
    Res::error('Acesso negado', 403);
}

/**
 * Controle de acesso por SEÇÃO (secoes_acesso). Espelha, no servidor, o que o
 * frontend já faz (_checkSectionAccess / p1SomenteQuantitativo) — antes disso o
 * "só números" era só cosmético e a API entregava o dado nominal completo.
 *
 * Níveis: (ausente/none) < viewer (só números) < nominal (nomes) < editor.
 * Seções controladas: p1, uis, p3, p5.
 * @param array<string,mixed> $user
 */
function _secoes_acesso(array $user): array
{
    $sa = $user['secoes_acesso'] ?? null;
    return is_array($sa) ? $sa : [];
}

/** Pode ENTRAR na seção (ver ao menos os números)? */
function pode_secao(array $user, string $secao): bool
{
    $role = $user['role'] ?? null;
    if ($role === 'ti' || $role === 'admin') {
        return true;
    }
    $sa = _secoes_acesso($user);
    if (!$sa) {
        return true; // legado sem config → o frontend também libera
    }
    if (!in_array($secao, ['p1', 'uis', 'p3', 'p5'], true)) {
        return true; // seção não controlada
    }
    // P5 (láureas) é dado de pessoal → segue o acesso do P1.
    $chave = $secao === 'p5' ? 'p1' : $secao;
    return in_array($sa[$chave] ?? null, ['viewer', 'nominal', 'editor'], true);
}

/** Pode ver dados NOMINAIS (nomes/indivíduos) de ALGUMA das seções dadas? */
function pode_nominal(array $user, string ...$secoes): bool
{
    $role = $user['role'] ?? null;
    if ($role === 'ti' || in_array($role, ['admin', 'p1', 'p3'], true)) {
        return true;
    }
    $sa = _secoes_acesso($user);
    foreach ($secoes as $s) {
        $chave = $s === 'p5' ? 'p1' : $s;
        if (in_array($sa[$chave] ?? null, ['nominal', 'editor'], true)) {
            return true;
        }
    }
    return false;
}

/** Exige poder ENTRAR em ALGUMA das seções (senão 403). */
function require_secao(array $user, string ...$secoes): void
{
    foreach ($secoes as $s) {
        if (pode_secao($user, $s)) {
            return;
        }
    }
    Res::error('Acesso negado à seção', 403);
}

/**
 * Libera rotas com dados NOMINAIS — basta UMA das seções em 'nominal'/'editor'.
 * admin/ti/p1/p3 sempre passam.
 * @param array<string,mixed> $user
 */
function require_section_nominal(array $user, string ...$secoes): void
{
    if (!pode_nominal($user, ...$secoes)) {
        Res::error('Acesso negado', 403);
    }
}

/**
 * Remove campos nominais (nome, nome de guerra, datas pessoais…) de uma lista de
 * registros quando o usuário só tem acesso "número" (viewer) — mantém o que os
 * KPIs agregados precisam (re para joins, posto, opm, cia, flags).
 * @param list<array<string,mixed>> $rows
 * @param list<string> $campos
 * @return list<array<string,mixed>>
 */
function filtra_nominal(array $rows, array $campos): array
{
    foreach ($rows as &$r) {
        foreach ($campos as $c) {
            if (array_key_exists($c, $r)) {
                $r[$c] = null;
            }
        }
    }
    unset($r);
    return $rows;
}

/**
 * Estado do banco. Mantém paridade com a flag `dbReady` do Node: as rotas
 * respondem erro amigável quando o MySQL está fora, em vez de estourar 500.
 */
function db_ready(): bool
{
    static $ready = null;
    if ($ready === null) {
        try {
            DB::ping();
            $ready = true;
        } catch (Throwable $e) {
            error_log('[dashboard] MySQL indisponível: ' . $e->getMessage());
            $ready = false;
        }
    }
    return $ready;
}

/**
 * Fire-and-forget: registra evento em logs_acesso sem derrubar a resposta.
 * @param array<string,mixed>|null $user
 * @param array<string,mixed>|null $userOverride
 */
function log_acesso(?array $user, string $acao, ?string $detalhe = null, ?array $userOverride = null): void
{
    if (!db_ready()) {
        return;
    }
    try {
        $u = $userOverride ?? $user ?? [];
        DB::insert('logs_acesso', [
            'usuario_id'   => $u['id']        ?? null,
            'usuario_nome' => $u['nome']      ?? null,
            'matricula'    => $u['matricula'] ?? null,
            'role'         => $u['role']      ?? null,
            'secao'        => $u['secao']     ?? null,
            'acao'         => $acao,
            'detalhe'      => $detalhe,
            'ip'           => Req::ip(),
            'user_agent'   => Req::userAgent(),
        ]);
    } catch (Throwable $e) {
        // silencioso, igual ao Node
    }
}
