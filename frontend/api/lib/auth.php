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
 * Libera rotas com dados NOMINAIS de seções controladas por secoes_acesso —
 * basta UMA das seções estar em 'nominal' ou 'editor'. admin/ti/p1/p3 sempre passam.
 * @param array<string,mixed> $user
 */
function require_section_nominal(array $user, string ...$secoes): void
{
    $role = $user['role'] ?? null;
    if ($role === 'ti' || in_array($role, ['admin', 'p1', 'p3'], true)) {
        return;
    }
    $sa = $user['secoes_acesso'] ?? [];
    if (is_array($sa)) {
        foreach ($secoes as $s) {
            if (($sa[$s] ?? null) === 'nominal' || ($sa[$s] ?? null) === 'editor') {
                return;
            }
        }
    }
    Res::error('Acesso negado', 403);
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
