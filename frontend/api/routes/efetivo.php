<?php
/**
 * routes/efetivo.php — Efetivo P1, fila de sincronização SGP e sessão do SGP-DP,
 * afastamentos (porta das rotas correspondentes de server.js).
 */

declare(strict_types=1);

const EFETIVO_TABLE       = 'efetivo_pm';
const SGP_SYNC_TABLE      = 'sgp_sync_jobs';
const SGP_DP_SESSAO_TABLE = 'sgp_dp_sessao';
const AFASTAMENTOS_TABLE  = 'afastamentos_pm';

return function (Router $r): void {

    // [GET /efetivo] — todos os PMs. Qualquer autenticado consulta.
    $r->get('/efetivo', function (): void {
        require_auth();
        Res::json(db_ready() ? fetch_all(EFETIVO_TABLE) : []);
    });

    // [POST /efetivo/upload] — substitui todo o efetivo pelo CSV.
    // Gênero, nome de guerra, lotação (cia/município), restrição, nascimento e
    // ingresso vêm do SGP (WSSCPM) — nunca da planilha; são preservados no
    // reinsert e (re)preenchidos ao rodar "Atualizar efetivo completo".
    // (`opm` e `funcao` continuam vindo da planilha.)
    $r->post('/efetivo/upload', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p3', 'p1');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        $records = Req::input('records');
        if (!is_array($records) || !$records) {
            Res::error('Nenhum registro recebido.', 400);
        }

        $gf = static function (array $row, string ...$names): string {
            foreach ($names as $name) {
                foreach ($row as $k => $v) {
                    if (mb_strtolower((string) $k) === mb_strtolower($name)) {
                        return trim((string) ($v ?? ''));
                    }
                }
            }
            return '';
        };

        $restricaoAntes = DB::select(EFETIVO_TABLE, [
            'columns' => 're, genero, nome_guerra, cia, municipio, codigo_opm, possui_restricao, tipos_restricao, restricao_inicio, restricao_termino, data_nascimento, data_ingresso',
        ]);
        $porRe = [];
        foreach ($restricaoAntes as $row) {
            $porRe[(string) $row['re']] = $row;
        }

        $rows = [];
        foreach ($records as $rec) {
            if (!is_array($rec)) {
                continue;
            }
            $re = $gf($rec, 'RE', 're');
            $a  = $porRe[$re] ?? null;
            $row = [
                'opm'               => $gf($rec, 'OPM', 'opm'),
                'posto'             => $gf($rec, 'Posto', 'posto', 'Posto / Grad', 'posto / grad'),
                're'                => $re,
                'nome'              => $gf($rec, 'Nome', 'nome', 'Nome Completo', 'nome completo'),
                'funcao'            => $gf($rec, 'Funcao', 'funcao', 'Função', 'função'),
                // gênero, nome de guerra e lotação (cia/município): só do SGP —
                // preserva o que já existe no reinsert.
                'genero'            => $a['genero']      ?? null,
                'nome_guerra'       => $a['nome_guerra'] ?? null,
                'cia'               => $a['cia']         ?? null,
                'municipio'         => $a['municipio']   ?? null,
                'codigo_opm'        => $a['codigo_opm']  ?? null,
                'data_eap'          => parseDateBR($gf($rec, 'DataEAP', 'dataeap', 'DATA EAP', 'data eap')) ?: null,
                'taf'               => $gf($rec, 'TAF', 'taf') ?: null,
                'tat'               => $gf($rec, 'TAT', 'tat') ?: null,
                'possui_restricao'  => $a['possui_restricao']  ?? null,
                'tipos_restricao'   => $a['tipos_restricao']   ?? null,
                'restricao_inicio'  => $a['restricao_inicio']  ?? null,
                'restricao_termino' => $a['restricao_termino'] ?? null,
                'data_nascimento'   => $a['data_nascimento']   ?? null,
                'data_ingresso'     => $a['data_ingresso']     ?? null,
            ];
            if ($row['nome'] !== '' && $row['posto'] !== '') {
                $rows[] = $row;
            }
        }
        if (!$rows) {
            Res::error('Nenhum registro válido. Verifique as colunas do CSV.', 400);
        }

        DB::remove(EFETIVO_TABLE, null);
        $res = DB::insertMany(EFETIVO_TABLE, $rows);
        log_acesso($user, 'upload_efetivo', $res['affectedRows'] . ' registros importados');
        Res::json(['ok' => true, 'inserted' => $res['affectedRows']]);
    });

    // [POST /efetivo/sync] — cria pedido de sincronização (RE único ou lote).
    $r->post('/efetivo/sync', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p1');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        $tipo = (string) (Req::input('tipo') ?? '');
        $re   = (string) (Req::input('re') ?? '');
        $validos = ['single', 'bulk', 'ias_single', 'ias_bulk', 'cursos_single', 'cursos_bulk', 'laureas_single', 'laureas_bulk'];
        if (!in_array($tipo, $validos, true)) {
            Res::error('tipo deve ser um de: ' . implode(', ', $validos) . '.', 400);
        }
        $ehSingle = in_array($tipo, ['single', 'ias_single', 'cursos_single', 'laureas_single'], true);
        if ($ehSingle && !preg_match('/^\d{6}$/', $re)) {
            Res::error('Informe os 6 dígitos do RE (sem o dígito verificador).', 400);
        }

        try {
            $ins = DB::insert(SGP_SYNC_TABLE, [
                'tipo'           => $tipo,
                're'             => $ehSingle ? $re : null,
                'solicitado_por' => $user['nome'] ?? $user['matricula'],
            ]);
            $data = DB::selectOne(SGP_SYNC_TABLE, ['where' => ['id' => $ins['insertId']]]);
        } catch (Throwable $e) {
            if (DB::isDuplicateError($e)) {
                Res::error('Já existe uma atualização desse tipo em andamento.', 409);
            }
            throw $e;
        }
        log_acesso($user, 'sgp_sync_pedido', $ehSingle ? "$tipo RE $re" : $tipo);
        Res::json($data);
    });

    // [GET /efetivo/sync/status] — últimos 10 pedidos.
    $r->get('/efetivo/sync/status', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p1');
        if (!db_ready()) {
            Res::json([]);
        }
        Res::json(DB::select(SGP_SYNC_TABLE, [
            'orderBy' => ['col' => 'criado_em', 'dir' => 'desc'],
            'limit'   => 10,
        ]));
    });

    // [PUT /sgp-dp/sessao] — salva o cookie colado pelo usuário.
    $r->put('/sgp-dp/sessao', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p1');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        $cookie = Req::input('cookie');
        if (!is_string($cookie) || strlen(trim($cookie)) < 20) {
            Res::error('Cole o valor completo do cookie de sessão do SGP-DP.', 400);
        }
        DB::upsert(SGP_DP_SESSAO_TABLE, [
            'id'             => 1,
            'cookie'         => trim($cookie),
            'atualizado_em'  => iso_now(),
            'atualizado_por' => $user['nome'] ?? $user['matricula'],
        ], ['cookie', 'atualizado_em', 'atualizado_por']);
        log_acesso($user, 'sgp_dp_sessao_atualizada', '');
        Res::json(['ok' => true]);
    });

    // [GET /sgp-dp/sessao/status] — quando/por quem foi salva (nunca o valor).
    $r->get('/sgp-dp/sessao/status', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p1');
        if (!db_ready()) {
            Res::json(['atualizado_em' => null, 'atualizado_por' => null]);
        }
        $data = DB::selectOne(SGP_DP_SESSAO_TABLE, [
            'columns' => 'atualizado_em, atualizado_por',
            'where'   => ['id' => 1],
        ]);
        Res::json($data ?? ['atualizado_em' => null, 'atualizado_por' => null]);
    });

    // [GET /afastamentos] — todos. Alimentada só pelo agente-sgp.
    $r->get('/afastamentos', function (): void {
        require_auth();
        Res::json(db_ready() ? fetch_all(AFASTAMENTOS_TABLE) : []);
    });
};
