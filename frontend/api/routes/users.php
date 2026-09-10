<?php
/**
 * routes/users.php — Administração de usuários (porta de /api/admin/users* de server.js).
 */

declare(strict_types=1);

return function (Router $r): void {

    // [GET /admin/users] — lista todos (sem senha_hash), mais recentes primeiro.
    $r->get('/admin/users', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p1', 'p3');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        Res::json(DB::select('usuarios', [
            'columns' => 'id, nome, posto, matricula, secao, role, status, created_at, secoes_acesso',
            'orderBy' => ['col' => 'created_at', 'dir' => 'desc'],
        ]));
    });

    // [GET /admin/users/pending/count] — contagem de pendentes.
    $r->get('/admin/users/pending/count', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p1', 'p3', 'ti');
        if (!db_ready()) {
            Res::json(['count' => 0]);
        }
        try {
            Res::json(['count' => DB::count('usuarios', ['status' => 'pending'])]);
        } catch (Throwable $e) {
            Res::json(['count' => 0]);
        }
    });

    // [PATCH /admin/users/:id] — status / seção / secoes_acesso (deriva role).
    $r->patch('/admin/users/:id', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p1', 'p3');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $id = Req::param('id');
        $b = Req::body();
        $updates = [];
        $canAdmin = in_array($user['role'] ?? null, ['admin', 'p3', 'ti'], true);

        if (!empty($b['status'])) {
            $updates['status'] = $b['status'];
        }
        if (!empty($b['secao'])) {
            $updates['secao'] = $b['secao'];
        }

        if (array_key_exists('secoes_acesso', $b) && is_array($b['secoes_acesso'])) {
            if (!$canAdmin) {
                Res::error('Apenas admin/p3/ti podem alterar nível de acesso.', 403);
            }
            if ((string) $id === (string) ($user['id'] ?? '')) {
                Res::error('Não é possível alterar seu próprio nível de acesso.', 403);
            }
            $sa = $b['secoes_acesso'];
            $updates['secoes_acesso'] = $sa;
            if (($sa['p3'] ?? null) === 'editor') {
                $updates['role'] = 'p3';
            } elseif (($sa['p1'] ?? null) === 'editor' || ($sa['uis'] ?? null) === 'editor') {
                $updates['role'] = 'p1';
            } else {
                $updates['role'] = 'viewer';
            }
        }

        if (!$updates) {
            Res::error('Nenhuma alteração informada', 400);
        }

        $target = DB::selectOne('usuarios', ['columns' => 'role', 'where' => ['id' => $id]]);
        if (($target['role'] ?? null) === 'admin') {
            Res::error('Usuário protegido — não pode ser alterado.', 403);
        }
        if (($target['role'] ?? null) === 'ti' && isset($updates['role'])) {
            unset($updates['role']);
        }

        DB::update('usuarios', $updates, ['id' => $id]);
        log_acesso($user, 'admin_usuario_editado', "ID $id: " . json_encode($updates, JSON_UNESCAPED_UNICODE));
        Res::json(['ok' => true]);
    });

    // [PATCH /admin/users/:id/posto] — atualiza posto/graduação.
    $r->patch('/admin/users/:id/posto', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p1', 'p3', 'ti');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $id = Req::param('id');
        $posto = trim((string) (Req::input('posto') ?? ''));
        if ($posto === '') {
            Res::error('Posto/Grad não informado', 400);
        }
        $target = DB::selectOne('usuarios', ['columns' => 'role', 'where' => ['id' => $id]]);
        if (!$target) {
            Res::error('Usuário não encontrado', 404);
        }
        if (($target['role'] ?? null) === 'admin') {
            Res::error('Usuário protegido — não pode ser alterado.', 403);
        }
        DB::update('usuarios', ['posto' => $posto], ['id' => $id]);
        log_acesso($user, 'admin_posto_editado', "ID $id: $posto");
        Res::json(['ok' => true]);
    });

    // [POST /admin/users/:id/reset-senha] — senha temporária aleatória.
    $r->post('/admin/users/:id/reset-senha', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p3');
        if (!db_ready()) {
            Res::error('Banco não configurado', 500);
        }
        $id = Req::param('id');
        $target = DB::selectOne('usuarios', ['columns' => 'role, matricula', 'where' => ['id' => $id]]);
        if (!$target) {
            Res::error('Usuário não encontrado', 404);
        }
        if (($target['role'] ?? null) === 'admin') {
            Res::error('Usuário protegido', 403);
        }
        if (($target['role'] ?? null) === 'ti' && ($user['role'] ?? null) !== 'admin') {
            Res::error('Apenas admin pode resetar a senha de uma conta ti.', 403);
        }
        $tempSenha = rtrim(strtr(base64_encode(random_bytes(6)), '+/', '-_'), '=');
        $hash = password_hash($tempSenha, PASSWORD_BCRYPT, ['cost' => 10]);
        DB::update('usuarios', ['senha_hash' => $hash, 'reset_senha' => true], ['id' => $id]);
        log_acesso($user, 'admin_reset_senha', "ID $id ({$target['matricula']})");
        Res::json(['ok' => true, 'senhaTemporaria' => $tempSenha]);
    });

    // [DELETE /admin/users/:id] — exclusão permanente. Role 'admin' protegido.
    $r->delete('/admin/users/:id', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p3');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $id = Req::param('id');
        $target = DB::selectOne('usuarios', ['columns' => 'role', 'where' => ['id' => $id]]);
        if (($target['role'] ?? null) === 'admin') {
            Res::error('Usuário protegido — não pode ser excluído.', 403);
        }
        DB::remove('usuarios', ['id' => $id]);
        log_acesso($user, 'admin_usuario_excluido', "ID $id");
        Res::json(['ok' => true]);
    });
};
