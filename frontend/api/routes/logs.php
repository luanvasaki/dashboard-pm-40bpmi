<?php
/**
 * routes/logs.php — Auditoria de acesso (porta de /api/logs/acesso de server.js).
 */

declare(strict_types=1);

return function (Router $r): void {

    // [GET /logs/acesso] — histórico (admin/ti).
    $r->get('/logs/acesso', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'ti');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        $limit = min(jsInt((string) (Req::query('limit') ?? '500')) ?: 500, 2000);
        Res::json(DB::select('logs_acesso', [
            'orderBy' => ['col' => 'created_at', 'dir' => 'desc'],
            'limit'   => $limit,
        ]));
    });

    // [POST /logs/acesso] — evento de navegação enviado pelo frontend.
    $r->post('/logs/acesso', function (): void {
        $user = require_auth();
        $acao = Req::input('acao');
        if (!$acao) {
            Res::error('acao obrigatório', 400);
        }
        log_acesso($user, (string) $acao, Req::input('detalhe') ? (string) Req::input('detalhe') : null);
        Res::json(['ok' => true]);
    });
};
