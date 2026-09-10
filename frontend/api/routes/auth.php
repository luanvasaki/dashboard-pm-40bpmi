<?php
/**
 * routes/auth.php — Autenticação (porta das rotas /api/auth/* de server.js).
 */

declare(strict_types=1);

return function (Router $r): void {

    // [POST /auth/register] — cadastro aberto; fica 'pending' até aprovação.
    // Role automático: seção 'P1' → 'p1', qualquer outra → 'viewer'.
    $r->post('/auth/register', function (): void {
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $b = Req::body();
        $nome = trim((string) ($b['nome'] ?? ''));
        $posto = trim((string) ($b['posto'] ?? ''));
        $matricula = trim((string) ($b['matricula'] ?? ''));
        $senha = (string) ($b['senha'] ?? '');
        $secao = trim((string) ($b['secao'] ?? ''));

        if ($nome === '' || $posto === '' || $matricula === '' || $senha === '' || $secao === '') {
            Res::error('Preencha todos os campos', 400);
        }
        if (strlen($senha) < 6) {
            Res::error('Senha deve ter no mínimo 6 caracteres', 400);
        }

        $hash = password_hash($senha, PASSWORD_BCRYPT, ['cost' => 10]);
        $autoRole = $secao === 'P1' ? 'p1' : 'viewer';

        try {
            DB::insert('usuarios', [
                'nome'       => $nome,
                'posto'      => $posto,
                'matricula'  => mb_strtoupper($matricula),
                'senha_hash' => $hash,
                'secao'      => $secao,
                'role'       => $autoRole,
                'status'     => 'pending',
            ]);
        } catch (Throwable $e) {
            if (DB::isDuplicateError($e)) {
                Res::error('Matrícula já cadastrada', 400);
            }
            throw $e;
        }

        Res::json(['ok' => true, 'message' => 'Solicitação enviada. Aguarde aprovação da seção P1 ou P3.']);
    });

    // [POST /auth/login] — matrícula + senha; JWT em cookie httpOnly (8h).
    $r->post('/auth/login', function (): void {
        if (!login_rate_ok(Req::ip())) {
            Res::error('Muitas tentativas de login. Tente novamente em 15 minutos.', 429);
        }
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $b = Req::body();
        $matricula = trim((string) ($b['matricula'] ?? ''));
        $senha = (string) ($b['senha'] ?? '');
        if ($matricula === '' || $senha === '') {
            Res::error('Preencha todos os campos', 400);
        }

        $data = DB::selectOne('usuarios', ['where' => ['matricula' => mb_strtoupper($matricula)]]);

        if (!$data) {
            log_acesso(null, 'login_falhou', "Matrícula não encontrada: $matricula");
            Res::error('Matrícula ou senha incorretos', 401);
        }
        if (($data['status'] ?? '') === 'pending') {
            Res::error('Cadastro aguardando aprovação da seção P1 ou P3', 403);
        }
        if (($data['status'] ?? '') === 'rejected') {
            Res::error('Cadastro recusado. Entre em contato com a seção P1 ou P3', 403);
        }
        if (!password_verify($senha, (string) $data['senha_hash'])) {
            log_acesso(null, 'login_falhou', "Senha incorreta: $matricula");
            Res::error('Matrícula ou senha incorretos', 401);
        }

        $payload = [
            'id'            => $data['id'],
            'nome'          => $data['nome'],
            'matricula'     => $data['matricula'],
            'role'          => $data['role'],
            'secao'         => $data['secao'],
            'resetSenha'    => ($data['reset_senha'] ?? false) === true,
            // objeto vazio (não array) quando não há níveis definidos — casa com o
            // que o Node emitia (`data.secoes_acesso || {}`).
            'secoes_acesso' => !empty($data['secoes_acesso']) ? $data['secoes_acesso'] : new stdClass(),
        ];
        $token = JWT::sign($payload, JWT_SECRET, JWT_TTL_SECONDS);
        set_auth_cookie($token, JWT_TTL_SECONDS);
        log_acesso(null, 'login', null, $payload);
        Res::json(['user' => $payload]);
    });

    // [GET /auth/me] — dados do usuário logado (claims do JWT).
    $r->get('/auth/me', function (): void {
        $user = require_auth();
        // secoes_acesso volta como objeto vazio (não array) quando não há níveis.
        if (($user['secoes_acesso'] ?? null) === []) {
            $user['secoes_acesso'] = new stdClass();
        }
        Res::json($user);
    });

    // [POST /auth/logout] — apaga o cookie de sessão no cliente.
    $r->post('/auth/logout', function (): void {
        $user = require_auth();
        log_acesso($user, 'logout', null);
        clear_auth_cookie();
        Res::json(['ok' => true]);
    });

    // [POST /auth/nova-senha] — define nova senha quando resetSenha=true.
    $r->post('/auth/nova-senha', function (): void {
        $user = require_auth();
        if (!db_ready()) {
            Res::error('Banco não configurado', 500);
        }
        $senha = (string) (Req::input('senha') ?? '');
        if (strlen($senha) < 6) {
            Res::error('Senha deve ter no mínimo 6 caracteres', 400);
        }
        $hash = password_hash($senha, PASSWORD_BCRYPT, ['cost' => 10]);
        DB::update('usuarios', ['senha_hash' => $hash, 'reset_senha' => false], ['id' => $user['id']]);
        Res::json(['ok' => true]);
    });
};
