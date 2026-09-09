<?php
/**
 * routes/fotos_vagas.php — Fotos de PMs, vagas por OPM e quadro fixado
 * (porta das rotas /api/p1/foto*, /api/p1/vagas, /api/p1/quadro* de server.js).
 */

declare(strict_types=1);

const FOTOS_TABLE  = 'fotos_pm';
const VAGAS_TABLE  = 'vagas_pm';
const QUADRO_TABLE = 'p1_quadro_fixado';

return function (Router $r): void {

    // [GET /p1/foto/:re] — foto_base64 do PM. Leitura para qualquer role.
    $r->get('/p1/foto/:re', function (): void {
        require_auth();
        if (!db_ready()) {
            Res::json(['foto_base64' => null]);
        }
        $data = DB::selectOne(FOTOS_TABLE, [
            'columns' => 're, foto_base64, updated_at',
            'where'   => ['re' => Req::param('re')],
        ]);
        Res::json($data ?? ['foto_base64' => null]);
    });

    // [POST /p1/fotos/lote] — foto_base64 de vários RE de uma vez.
    $r->post('/p1/fotos/lote', function (): void {
        require_auth();
        if (!db_ready()) {
            Res::json(new stdClass());
        }
        $lista = Req::input('res');
        if (!is_array($lista) || !$lista) {
            Res::json(new stdClass());
        }
        $rows = DB::select(FOTOS_TABLE, [
            'columns' => 're, foto_base64',
            'where'   => [['re', 'IN', array_slice(array_values($lista), 0, 500)]],
        ]);
        $mapa = [];
        foreach ($rows as $row) {
            $mapa[(string) $row['re']] = $row['foto_base64'];
        }
        Res::json($mapa ?: new stdClass());
    });

    // [POST /p1/foto/:re] — upsert da foto. Role p1 ou admin.
    $r->post('/p1/foto/:re', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p1');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        $foto = (string) (Req::input('foto_base64') ?? '');
        if (!str_starts_with($foto, 'data:image/')) {
            Res::error('Imagem inválida. Envie um arquivo de imagem (JPG, PNG).', 400);
        }
        if (strlen($foto) > 1_100_000) {
            Res::error('Imagem muito grande. Máximo 800 KB após compressão.', 400);
        }
        DB::upsert(FOTOS_TABLE, [
            're'         => Req::param('re'),
            'foto_base64' => $foto,
            'updated_at' => iso_now(),
        ], ['foto_base64', 'updated_at']);
        Res::json(['ok' => true]);
    });

    // [DELETE /p1/foto/:re] — remove a foto. Role p1 ou admin.
    $r->delete('/p1/foto/:re', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p1');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        DB::remove(FOTOS_TABLE, ['re' => Req::param('re')]);
        Res::json(['ok' => true]);
    });

    // [GET /p1/vagas] — efetivo fixado por OPM.
    $r->get('/p1/vagas', function (): void {
        require_auth();
        Res::json(db_ready() ? DB::select(VAGAS_TABLE, ['orderBy' => 'opm']) : []);
    });

    // [POST /p1/vagas] — upsert de vagas por OPM. Role p1 ou admin.
    $r->post('/p1/vagas', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p1');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        $opm = trim((string) (Req::input('opm') ?? ''));
        $vagas = Req::input('vagas');
        if ($opm === '' || $vagas === null || !is_numeric($vagas) || (float) $vagas < 0) {
            Res::error('OPM e vagas (número ≥ 0) são obrigatórios.', 400);
        }
        DB::upsert(VAGAS_TABLE, [
            'opm'        => $opm,
            'vagas'      => (int) $vagas,
            'updated_at' => iso_now(),
        ], ['vagas', 'updated_at']);
        Res::json(['ok' => true]);
    });

    // [GET /p1/quadro] — quadro fixado por posto/OPM.
    $r->get('/p1/quadro', function (): void {
        require_auth();
        Res::json(db_ready() ? DB::select(QUADRO_TABLE, ['orderBy' => ['opm', 'municipio']]) : []);
    });

    // [POST /p1/quadro/upload] — substitui o quadro pelo CSV. Role p1 ou admin.
    $r->post('/p1/quadro/upload', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p1');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        $records = Req::input('records');
        if (!is_array($records) || !$records) {
            Res::error('Nenhum registro recebido.', 400);
        }

        // normaliza chave: sem acento, minúscula, sem espaço/ponto/barra
        $nkq = static fn (string $s): string => preg_replace('/[\s.\/]+/', '', mb_strtolower(strip_accents($s)));
        $mkIdx = static function (array $r) use ($nkq): array {
            $idx = [];
            foreach ($r as $k => $v) {
                $idx[$nkq((string) $k)] = $v;
            }
            return $idx;
        };
        $gi = static function (array $idx, string ...$keys) use ($nkq): int {
            foreach ($keys as $k) {
                if (array_key_exists($nkq($k), $idx)) {
                    return jsInt((string) $idx[$nkq($k)]);
                }
            }
            return 0;
        };
        $gs = static function (array $idx, string ...$keys) use ($nkq): string {
            foreach ($keys as $k) {
                if (array_key_exists($nkq($k), $idx)) {
                    return trim((string) ($idx[$nkq($k)] ?? ''));
                }
            }
            return '';
        };

        $rows = [];
        foreach ($records as $rec) {
            if (!is_array($rec)) {
                continue;
            }
            $idx = $mkIdx($rec);
            $row = [
                'municipio'     => $gs($idx, 'Municipio', 'Município'),
                'opm'           => $gs($idx, 'OPM', 'opm'),
                'cia'           => $gs($idx, 'CIA', 'Cia', 'Companhia'),
                'fx_ten_cel'    => $gi($idx, 'Fixado Ten Cel', 'Fx Ten Cel'),
                'ex_ten_cel'    => $gi($idx, 'Existente Ten Cel', 'Ex Ten Cel'),
                'fx_maj'        => $gi($idx, 'Fixado Maj', 'Fx Maj'),
                'ex_maj'        => $gi($idx, 'Existente Maj', 'Ex Maj'),
                'fx_cap'        => $gi($idx, 'Fixado Cap', 'Fx Cap'),
                'ex_cap'        => $gi($idx, 'Existente Cap', 'Ex Cap'),
                'fx_ten'        => $gi($idx, 'Fixado Ten', 'Fx Ten'),
                'ex_ten'        => $gi($idx, 'Existente Ten', 'Ex Ten'),
                'fx_of_med'     => $gi($idx, 'Fixado Of Med/Dent', 'Fixado Of Med', 'Fx Of Med'),
                'ex_of_med'     => $gi($idx, 'Existente Of Med/Dent', 'Existente Of Med', 'Ex Of Med'),
                'fx_subten_sgt' => $gi($idx, 'Fixado Subten / Sgt', 'Fixado Subten/Sgt', 'Fx Subten Sgt'),
                'ex_subten_sgt' => $gi($idx, 'Existente Subten / Sgt', 'Existente Subten/Sgt', 'Ex Subten Sgt'),
                'fx_cb_sd'      => $gi($idx, 'Fixado Cb/Sd', 'Fixado Cb Sd', 'Fx Cb Sd'),
                'ex_cb_sd'      => $gi($idx, 'Existente Cb/Sd', 'Existente Cb Sd', 'Ex Cb Sd'),
                'fx_total'      => $gi($idx, 'FX', 'fx', 'Total FX', 'Total Fixado'),
                'ex_total'      => $gi($idx, 'EX', 'ex', 'Total EX', 'Total Existente'),
            ];
            if ($row['opm'] !== '') {
                $rows[] = $row;
            }
        }
        if (!$rows) {
            Res::error('Nenhum registro válido. Verifique a coluna OPM.', 400);
        }

        DB::remove(QUADRO_TABLE, null);
        DB::insertMany(QUADRO_TABLE, $rows);
        log_acesso($user, 'upload_quadro', count($rows) . ' registros importados');
        Res::json(['ok' => true, 'inserted' => count($rows)]);
    });
};
