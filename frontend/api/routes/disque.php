<?php
/**
 * routes/disque.php — Disque Denúncia (porta de /api/disque-denuncia* de server.js).
 */

declare(strict_types=1);

const DD_CIAS   = ['1ª Cia PM', '2ª Cia PM', '3ª Cia PM', 'FT'];
const DD_STATUS = ['Andamento', 'Averiguada com Êxito', 'Averiguada sem Êxito', 'Sem Averiguação'];
const DD_TABLE  = 'disque_denuncia_registros';

return function (Router $r): void {

    $r->get('/disque-denuncia/cias', function (): void {
        require_auth();
        Res::json(DD_CIAS);
    });

    $r->get('/disque-denuncia', function (): void {
        require_auth();
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $ano = Req::query('ano');
        $where = $ano
            ? [['data', '>=', "$ano-01-01"], ['data', '<=', "$ano-12-31"]]
            : null;
        Res::json(DB::select(DD_TABLE, ['where' => $where, 'orderBy' => ['col' => 'data', 'dir' => 'desc']]));
    });

    $r->post('/disque-denuncia', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p3', 'ti');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $b = Req::body();
        $data = $b['data'] ?? null;
        $cia = $b['cia'] ?? null;
        $numeroDd = $b['numero_dd'] ?? null;
        $status = $b['status'] ?? null;
        if (!$data || !$cia || !$numeroDd || !$status) {
            Res::error('Campos obrigatórios ausentes', 400);
        }
        if (!in_array($cia, DD_CIAS, true)) {
            Res::error('Cia inválida', 400);
        }
        if (!in_array($status, DD_STATUS, true)) {
            Res::error('Status inválido', 400);
        }
        $ins = DB::insert(DD_TABLE, [
            'data'             => $data,
            'cia'              => $cia,
            'numero_dd'        => trim((string) $numeroDd),
            'data_atendimento' => ($b['data_atendimento'] ?? null) ?: null,
            'status'           => $status,
            'flagrante'        => (bool) ($b['flagrante'] ?? false),
            'quant_presos'     => jsInt((string) ($b['quant_presos'] ?? 0)),
            'municipio'        => isset($b['municipio']) && trim((string) $b['municipio']) !== '' ? trim((string) $b['municipio']) : null,
            'created_by'       => $user['nome'] ?? null,
        ]);
        Res::json(DB::selectOne(DD_TABLE, ['where' => ['id' => $ins['insertId']]]));
    });

    $r->put('/disque-denuncia/:id', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p3', 'ti');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $b = Req::body();
        $data = $b['data'] ?? null;
        $cia = $b['cia'] ?? null;
        $numeroDd = $b['numero_dd'] ?? null;
        $status = $b['status'] ?? null;
        if (!$data || !$cia || !$numeroDd || !$status) {
            Res::error('Campos obrigatórios ausentes', 400);
        }
        DB::update(DD_TABLE, [
            'data'             => $data,
            'cia'              => $cia,
            'numero_dd'        => trim((string) $numeroDd),
            'data_atendimento' => ($b['data_atendimento'] ?? null) ?: null,
            'status'           => $status,
            'flagrante'        => (bool) ($b['flagrante'] ?? false),
            'quant_presos'     => jsInt((string) ($b['quant_presos'] ?? 0)),
            'municipio'        => isset($b['municipio']) && trim((string) $b['municipio']) !== '' ? trim((string) $b['municipio']) : null,
        ], ['id' => Req::param('id')]);
        Res::json(['ok' => true]);
    });

    $r->delete('/disque-denuncia/:id', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p3');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        DB::remove(DD_TABLE, ['id' => Req::param('id')]);
        Res::json(['ok' => true]);
    });

    $r->post('/disque-denuncia/upload', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p3', 'ti');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $records = Req::input('records');
        if (!is_array($records) || !$records) {
            Res::error('Nenhum registro recebido.', 400);
        }

        $parseDate = static function ($v): ?string {
            if (!$v) {
                return null;
            }
            $v = trim((string) $v);
            if (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{4})$#', $v, $m)) {
                return sprintf('%s-%s-%s', $m[3], str_pad($m[2], 2, '0', STR_PAD_LEFT), str_pad($m[1], 2, '0', STR_PAD_LEFT));
            }
            if (preg_match('/^\d{4}-\d{2}-\d{2}/', $v)) {
                return substr($v, 0, 10);
            }
            return null;
        };

        $rows = [];
        foreach ($records as $rec) {
            if (!is_array($rec)) {
                continue;
            }
            $col = static function (string $k) use ($rec): string {
                foreach ($rec as $x => $v) {
                    if (str_contains(trim(mb_strtolower((string) $x)), $k)) {
                        return trim((string) $v);
                    }
                }
                return '';
            };
            $dataBase = $parseDate($col('data'));
            $dataAtend = $parseDate($col('data do atend') ?: $col('data de atend') ?: $col('data atend') ?: $col('dataatend'));
            if (!$dataBase) {
                continue;
            }
            $cia = $col('cia');
            $numeroDd = $col('disque') ?: $col('nº') ?: $col('numero');
            $rawStatus = $col('status');
            $normS = mb_strtolower(strip_accents($rawStatus));
            $status = $rawStatus;
            if (str_contains($normS, 'exito') && (str_contains($normS, ' com') || str_starts_with($normS, 'com'))) {
                $status = 'Averiguada com Êxito';
            } elseif (str_contains($normS, 'exito') && (str_contains($normS, ' sem') || str_starts_with($normS, 'sem'))) {
                $status = 'Averiguada sem Êxito';
            } elseif (str_contains($normS, 'andamento')) {
                $status = 'Andamento';
            } elseif (str_contains($normS, 'sem') && str_contains($normS, 'aver')) {
                $status = 'Sem Averiguação';
            }
            $flagRaw = mb_strtolower($col('flagrante'));
            $flagrante = in_array($flagRaw, ['sim', 'true', '1'], true);
            $quantPresos = jsInt($col('presos') ?: $col('quant'));
            $municipio = $col('municipio') ?: $col('município');
            if ($cia === '' || $numeroDd === '' || !in_array($status, DD_STATUS, true)) {
                continue;
            }
            $rows[] = [
                'data'             => $dataBase,
                'cia'              => $cia,
                'numero_dd'        => $numeroDd,
                'data_atendimento' => $dataAtend,
                'status'           => $status,
                'flagrante'        => $flagrante,
                'quant_presos'     => $quantPresos,
                'municipio'        => $municipio !== '' ? $municipio : null,
            ];
        }
        if (!$rows) {
            Res::error('Nenhum registro válido. Verifique as colunas do CSV.', 400);
        }

        $anos = array_values(array_unique(array_map(static fn ($x) => substr($x['data'], 0, 4), $rows)));
        foreach ($anos as $ano) {
            DB::remove(DD_TABLE, [['data', '>=', "$ano-01-01"], ['data', '<=', "$ano-12-31"]]);
        }
        $res = DB::insertMany(DD_TABLE, $rows);
        Res::json(['ok' => true, 'total' => $res['affectedRows']]);
    });
};
