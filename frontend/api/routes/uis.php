<?php
/**
 * routes/uis.php — UIS (restrições médicas), IAS (inspeção anual de saúde),
 * cursos institucionais e láureas (porta das rotas correspondentes de server.js).
 */

declare(strict_types=1);

/** REs (6 díg., sem verificador) de quem está no efetivo_pm atual. */
function re_ativos_set(): array
{
    $set = [];
    foreach (fetch_all('efetivo_pm') as $row) {
        $set[substr((string) $row['re'], 0, 6)] = true;
    }
    return $set;
}

/** RE (6 díg.) → data_nascimento ('YYYY-MM-DD') do efetivo_pm. */
function re_nascimento_map(): array
{
    $map = [];
    foreach (fetch_all('efetivo_pm') as $row) {
        $n = $row['data_nascimento'] ?? null;
        if ($n) {
            $map[substr((string) $row['re'], 0, 6)] = substr((string) $n, 0, 10);
        }
    }
    return $map;
}

/**
 * Vencimento da IAS = PRÓXIMO ANIVERSÁRIO (mês/dia do nascimento) após a inspeção
 * médica + 90 dias. Regra do usuário (2026-09-11): a IAS não vale "1 ano" — vence
 * no aniversário e não se pode passar o aniversário sem tê-la refeito. Os 90 dias
 * evitam que quem fez a IAS poucas semanas antes do aniversário caia como
 * "vence amanhã": nesse caso vale até o aniversário do ano seguinte.
 * Sem nascimento ou sem inspeção médica → null (conta como vencida).
 */
function ias_vence_em(?string $nascimento, ?string $dataMedico): ?string
{
    if (!$nascimento || !$dataMedico) {
        return null;
    }
    $md = substr($nascimento, 5, 5);   // 'MM-DD'
    if ($md === '02-29') {
        $md = '02-28';                 // ano não bissexto
    }
    $base = gmdate('Y-m-d', strtotime(substr($dataMedico, 0, 10) . ' +90 days'));
    $ano  = (int) substr($base, 0, 4);
    $cand = $ano . '-' . $md;
    if ($cand <= $base) {
        $cand = ($ano + 1) . '-' . $md;
    }
    return $cand;
}

/** Extrai a OPM do campo "01-09JANEM" → "EM", "01-09JAN1ª CIA" → "1ª CIA". */
function normUISopm(?string $s): string
{
    $s = trim((string) $s);
    if (preg_match('/\d{2}[-\s]\d{2}\s*(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)(.*)/iu', $s, $m) && trim($m[1]) !== '') {
        return trim($m[1]);
    }
    return $s;
}

return function (Router $r): void {

    // [POST /upload/uis-restricoes] — CSV de restrições médicas (origem 'manual').
    $r->post('/upload/uis-restricoes', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p1', 'ti');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $records = Req::input('records');
        if (!is_array($records) || !$records) {
            Res::error('Nenhum registro recebido.', 400);
        }

        $seen = [];
        $rows = [];
        foreach ($records as $rec) {
            if (!is_array($rec)) {
                continue;
            }
            $reRaw = preg_replace('/\D/', '', csv_get($rec, 're'));
            $re = strlen($reRaw) === 7 ? substr($reRaw, 0, 6) : $reRaw;
            if ($re === '') {
                continue;
            }
            $codigosRaw = csv_get($rec, 'codigo de restricao', 'codigo', 'código', 'codigos', 'restricao', 'restrição');
            if ($codigosRaw === '') {
                continue;
            }
            $codigos = trim(preg_replace('/\s+/', ' ', mb_strtoupper($codigosRaw)));
            $inicio  = parseDateBR(csv_get($rec, 'inicio', 'início'));
            $termino = parseDateBR(csv_get($rec, 'termino', 'término'));
            $key = "$re|$inicio|$termino|$codigos";
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $rows[] = [
                're'         => $re,
                'nome'       => csv_get($rec, 'nome'),
                'posto'      => csv_get($rec, 'posto', 'posto/grad', 'grad'),
                'opm'        => normUISopm(csv_get($rec, 'opm')),
                'codigos'    => $codigos,
                'inicio'     => $inicio,
                'termino'    => $termino,
                'dias'       => jsInt(csv_get($rec, 'dias')) ?: null,
                'observacao' => csv_get($rec, 'verificar'),
                'origem'     => 'manual',
            ];
        }
        if (!$rows) {
            Res::error('Nenhum registro válido após validação.', 400);
        }
        DB::remove('uis_restricoes', ['origem' => 'manual']);
        $res = DB::insertMany('uis_restricoes', $rows);
        log_acesso($user, 'upload_uis', $res['affectedRows'] . ' registros importados');
        Res::json(['ok' => true, 'inserted' => $res['affectedRows']]);
    });

    // [GET /uis/stats] — estatísticas (só números). Origem 'sgp', efetivo atual.
    $r->get('/uis/stats', function (): void {
        $user = require_auth();
        require_secao($user, 'uis', 'p1');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $today = gmdate('Y-m-d');
        $em30  = gmdate('Y-m-d', time() + 30 * 86400);
        $ativos = re_ativos_set();

        $all = array_filter(
            fetch_all('uis_restricoes', ['filters' => [['eq', 'origem', 'sgp']]]),
            static fn ($r) => isset($ativos[$r['re']])
        );

        $byRe = [];
        foreach ($all as $r) {
            $prev = $byRe[$r['re']] ?? null;
            if (!$prev || (($r['termino'] ?? '') > ($prev['termino'] ?? ''))) {
                $byRe[$r['re']] = $r;
            }
        }
        $latest = array_values($byRe);
        $ativas = array_values(array_filter($latest, static fn ($r) => $r['termino'] && $r['termino'] >= $today));
        $vencidas = array_values(array_filter($latest, static fn ($r) => !$r['termino'] || $r['termino'] < $today));
        $vencendo = array_values(array_filter($ativas, static fn ($r) => $r['termino'] <= $em30));

        $splitCodes = static function (?string $c): array {
            return array_values(array_filter(
                array_map(static fn ($x) => trim(mb_strtoupper($x)), preg_split('/[,\s]+/', (string) $c) ?: []),
                static fn ($x) => preg_match('/^[A-Z]{2,3}$/', $x)
            ));
        };

        $porOpm = [];
        $porCodigo = [];
        $porOpmCodigos = [];
        foreach ($ativas as $r) {
            $opm = $r['opm'] ?: 'Outros';
            $porOpm[$opm] = ($porOpm[$opm] ?? 0) + 1;
            foreach ($splitCodes($r['codigos']) as $c) {
                $porCodigo[$c] = ($porCodigo[$c] ?? 0) + 1;
                $porOpmCodigos[$opm][$c] = ($porOpmCodigos[$opm][$c] ?? 0) + 1;
            }
        }

        $ADMIN_CODES = ['AU', 'EP', 'ES', 'LR', 'PT', 'VP', 'UA', 'UU', 'CC', 'CB', 'UB', 'UC', 'US'];
        $soAdm = array_filter($ativas, static function ($r) use ($ADMIN_CODES) {
            foreach (preg_split('/[,\s]+/', (string) ($r['codigos'] ?? '')) ?: [] as $c) {
                if (in_array(trim(mb_strtoupper($c)), $ADMIN_CODES, true)) {
                    return true;
                }
            }
            return false;
        });

        Res::json([
            'total_ativas'     => count($ativas),
            'total_vencidas'   => count($vencidas),
            'total_vencendo'   => count($vencendo),
            'total_admin_only' => count($soAdm),
            'por_opm'          => $porOpm ?: new stdClass(),
            'por_codigo'       => $porCodigo ?: new stdClass(),
            'por_opm_codigos'  => $porOpmCodigos ?: new stdClass(),
        ]);
    });

    // [GET /uis/mapa] — restrições ATIVAS (termino >= hoje), origem 'sgp'.
    $r->get('/uis/mapa', function (): void {
        $user = require_auth();
        require_section_nominal($user, 'uis', 'p1');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $today = gmdate('Y-m-d');
        $ativos = re_ativos_set();
        $all = fetch_all('uis_restricoes', [
            'filters' => [['eq', 'origem', 'sgp']],
            'order'   => [['termino', ['ascending' => false]]],
        ]);
        Res::json(array_values(array_filter(
            $all,
            static fn ($r) => $r['termino'] && $r['termino'] >= $today && isset($ativos[$r['re']])
        )));
    });

    // [GET /uis/restricoes/:re] — restrições de um PM (origem 'sgp').
    $r->get('/uis/restricoes/:re', function (): void {
        $user = require_auth();
        require_section_nominal($user, 'uis', 'p1');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $reBase = preg_replace('/\D/', '', explode('-', (string) Req::param('re'))[0]);
        Res::json(fetch_all('uis_restricoes', [
            'filters' => [['eq', 're', $reBase], ['eq', 'origem', 'sgp']],
            'order'   => [['termino', ['ascending' => false]]],
        ]));
    });

    // [GET /ias/stats] — estatísticas IAS (só números).
    $r->get('/ias/stats', function (): void {
        $user = require_auth();
        require_secao($user, 'uis', 'p1');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $today = gmdate('Y-m-d');
        $em30  = gmdate('Y-m-d', time() + 30 * 86400);
        $ativos = re_ativos_set();
        $nasc   = re_nascimento_map();
        $all = array_values(array_filter(fetch_all('ias_registros'), static fn ($r) => isset($ativos[$r['re']])));
        // vencimento = próximo aniversário após a inspeção médica (não é "1 ano")
        $vencDe = static fn ($r) => ias_vence_em($nasc[$r['re']] ?? null, $r['data_medico'] ?? null);
        $aptos = array_values(array_filter($all, static fn ($r) => ($v = $vencDe($r)) && $v >= $today));
        $vencidos = array_values(array_filter($all, static fn ($r) => !($v = $vencDe($r)) || $v < $today));
        $vencendo = array_values(array_filter($aptos, static fn ($r) => $vencDe($r) <= $em30));
        Res::json([
            'total'          => count($all),
            'total_aptos'    => count($aptos),
            'total_vencidos' => count($vencidos),
            'total_vencendo' => count($vencendo),
        ]);
    });

    // [GET /ias/mapa] — todos os registros IAS do efetivo atual. Anexa
    // data_nascimento (do efetivo_pm) e data_vencimento_aniv (próximo aniversário
    // após a inspeção médica) — o frontend calcula o status a partir daí.
    $r->get('/ias/mapa', function (): void {
        $user = require_auth();
        require_section_nominal($user, 'uis', 'p1');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $ativos = re_ativos_set();
        $nasc   = re_nascimento_map();
        $rows = array_values(array_filter(fetch_all('ias_registros'), static fn ($r) => isset($ativos[$r['re']])));
        foreach ($rows as &$r0) {
            $r0['data_nascimento']      = $nasc[$r0['re']] ?? null;
            $r0['data_vencimento_aniv'] = ias_vence_em($r0['data_nascimento'], $r0['data_medico'] ?? null);
        }
        unset($r0);
        Res::json($rows);
    });

    // [GET /ias/:re] — registro IAS de um PM.
    $r->get('/ias/:re', function (): void {
        $user = require_auth();
        require_section_nominal($user, 'uis', 'p1');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $reBase = preg_replace('/[^0-9]/', '', (string) Req::param('re'));
        $reNorm = strlen($reBase) >= 7 ? substr($reBase, 0, -1) : $reBase;
        $data = fetch_all('ias_registros', ['filters' => [['eq', 're', $reNorm]]]);
        $rec = $data[0] ?? null;
        if ($rec) {
            $rec['data_nascimento']      = re_nascimento_map()[$reNorm] ?? null;
            $rec['data_vencimento_aniv'] = ias_vence_em($rec['data_nascimento'], $rec['data_medico'] ?? null);
        }
        Res::json($rec);
    });

    // [POST /upload/cursos] — CSV de cursos que não vêm do SGP-DP (origem 'manual').
    $r->post('/upload/cursos', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p3');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        $records = Req::input('records');
        if (!is_array($records) || !$records) {
            Res::error('Nenhum registro recebido.', 400);
        }

        $rows = [];
        foreach ($records as $rec) {
            if (!is_array($rec)) {
                continue;
            }
            $nOficio  = csv_get($rec, 'n do oficio', 'nº do ofício', 'no do oficio', 'n oficio', 'oficio');
            $dataStr  = csv_get($rec, 'data');
            $nomeCurso = csv_get($rec, 'curso', 'nome do curso', 'nome_curso');
            $pmField  = csv_get($rec, 'pm', 'interessados', 'pms');
            if ($nomeCurso === '') {
                continue;
            }
            $parsed = parseDateBR($dataStr);
            if (!$parsed && preg_match('/^\d{4}-\d{2}-\d{2}/', $dataStr)) {
                $parsed = substr($dataStr, 0, 10);
            }
            $ano = 0;
            $mes = '';
            if ($parsed) {
                [$y, $m] = explode('-', $parsed);
                $ano = (int) $y;
                $mes = MESES_PT[(int) $m - 1] ?? '';
            }
            $pms = parsePMsField($pmField);
            $base = [
                'boletim_curso' => $nOficio ?: null,
                'data'          => $parsed,
                'nome_curso'    => $nomeCurso,
                'ano'           => $ano,
                'mes'           => $mes,
                'origem'        => 'manual',
            ];
            if (!$pms) {
                $rows[] = $base + ['re_pm' => null, 'posto_pm' => null, 'nome_pm' => null];
            } else {
                foreach ($pms as $pm) {
                    $rows[] = array_merge($base, $pm);
                }
            }
        }
        if (!$rows) {
            Res::error('Nenhum registro válido após validação.', 400);
        }
        $anos = array_values(array_unique(array_filter(array_map(static fn ($x) => $x['ano'], $rows), static fn ($a) => $a > 0)));
        foreach ($anos as $ano) {
            DB::remove('prod_cursos', ['ano' => $ano, 'origem' => 'manual']);
        }
        $res = DB::insertMany('prod_cursos', $rows);
        log_acesso($user, 'upload_cursos', $res['affectedRows'] . ' registros importados');
        Res::json(['ok' => true, 'total' => $res['affectedRows']]);
    });

    // [GET /pm/:re/cursos] — cursos de um PM (data desc). Dado nominal.
    $r->get('/pm/:re/cursos', function (): void {
        $user = require_auth();
        require_section_nominal($user, 'p1', 'uis', 'p5');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        Res::json(DB::select('prod_cursos', [
            'where'   => ['re_pm' => Req::param('re')],
            'orderBy' => ['col' => 'data', 'dir' => 'desc'],
        ]));
    });

    // [GET /pm/:re/laureas] — láureas de um PM (concessão desc). Dado nominal.
    $r->get('/pm/:re/laureas', function (): void {
        $user = require_auth();
        require_section_nominal($user, 'p1', 'uis', 'p5');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        Res::json(DB::select('prod_laureas', [
            'where'   => ['re_pm' => Req::param('re')],
            'orderBy' => ['col' => 'concessao', 'dir' => 'desc'],
        ]));
    });

    // [GET /laureas/resumo] — grau mais alto por PM + lista crua de láureas (P5).
    $r->get('/laureas/resumo', function (): void {
        $user = require_auth();
        require_secao($user, 'p5', 'p1');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        $nominal = pode_nominal($user, 'p1', 'uis', 'p5');
        $efetivoRows = fetch_all('efetivo_pm', ['select' => 're, nome, nome_guerra, posto, opm']);
        $laureasRows = fetch_all('prod_laureas', ['select' => 're_pm, descricao_medalha, concessao, opm']);

        $parseGrau = static function (?string $desc): ?int {
            if ($desc !== null && preg_match('/(\d+)\s*º?\s*grau/iu', $desc, $m)) {
                return (int) $m[1];
            }
            return null;
        };

        $grauPorRe = [];
        foreach ($laureasRows as $l) {
            $g = $parseGrau($l['descricao_medalha'] ?? null);
            if ($g === null) {
                continue;
            }
            $re = explode('-', (string) ($l['re_pm'] ?? ''))[0];
            if ($re === '') {
                continue;
            }
            if (!isset($grauPorRe[$re]) || $g < $grauPorRe[$re]) {
                $grauPorRe[$re] = $g;
            }
        }

        $efetivo = array_map(static function ($pm) use ($grauPorRe, $nominal) {
            $re = explode('-', (string) ($pm['re'] ?? ''))[0];
            return [
                're'          => $pm['re'],
                'nome'        => $nominal ? $pm['nome'] : null,
                'nome_guerra' => $nominal ? $pm['nome_guerra'] : null,
                'posto'       => $pm['posto'],
                'opm'         => $pm['opm'],
                'grau'        => $grauPorRe[$re] ?? null,
            ];
        }, $efetivoRows);

        $laureas = [];
        foreach ($laureasRows as $l) {
            if (empty($l['concessao'])) {
                continue;
            }
            $laureas[] = [
                'concessao' => $l['concessao'],
                'opm'       => $l['opm'],
                'grau'      => $parseGrau($l['descricao_medalha'] ?? null),
                're'        => explode('-', (string) ($l['re_pm'] ?? ''))[0],
            ];
        }

        Res::json(['efetivo' => $efetivo, 'laureas' => $laureas]);
    });
};
