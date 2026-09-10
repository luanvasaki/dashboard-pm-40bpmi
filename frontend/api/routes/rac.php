<?php
/**
 * routes/rac.php — Status/sync, uploads RAC PM e InfoCrim, metadados,
 * registros e analytics (porta das rotas correspondentes de server.js).
 * Tudo que lê "registros" opera sobre o cache em arquivo (lib/cache.php).
 */

declare(strict_types=1);

require_once __DIR__ . '/../analytics/crime_pressure.php';
require_once __DIR__ . '/../analytics/trend_analysis.php';
require_once __DIR__ . '/../analytics/target_deviation.php';
require_once __DIR__ . '/../analytics/priority_score.php';
require_once __DIR__ . '/../analytics/city_ranking.php';
require_once __DIR__ . '/../analytics/insight_generator.php';

return function (Router $r): void {

    // ── STATUS / SYNC ───────────────────────────────────────────────────────

    $r->get('/status', function (): void {
        require_auth();
        $c = rac_cache();
        $ready = db_ready();
        Res::json([
            'lastSync'           => $c['lastSync'] ?? null,
            'source'             => $c['source'] ?? null,
            'records'            => count($c['data'] ?? []),
            'error'              => $c['error'] ?? null,
            'supabaseConfigured' => $ready, // nome mantido p/ compat. com o frontend
            'dbReady'            => $ready,
        ]);
    });

    $r->post('/sync', function (): void {
        require_auth();
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 400);
        }
        Res::json(rac_sync_now());
    });

    // ── UPLOAD — BANCO RAC PM ───────────────────────────────────────────────

    $r->post('/upload', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p3', 'ti');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado. Verifique o api/.env.', 400);
        }
        $records = Req::input('records');
        $overrideAno = Req::input('overrideAno');
        if (!is_array($records) || !$records) {
            Res::error('Nenhum registro recebido.', 400);
        }

        // busca case-insensitive (exata, sem strip de acento) — igual ao `gf` do Node
        $gf = static function (array $row, string $name): string {
            foreach ($row as $k => $v) {
                if (mb_strtolower((string) $k) === mb_strtolower($name)) {
                    return trim((string) ($v ?? ''));
                }
            }
            return '';
        };
        $canon = static function (string $raw): string {
            $n = nk($raw);
            foreach (CRIMES_ORD as $c) {
                if (nk($c) === $n) {
                    return $c;
                }
            }
            return $raw;
        };

        $rows = [];
        foreach ($records as $rec) {
            if (!is_array($rec)) {
                continue;
            }
            $row = [
                'Ano'       => $overrideAno ? jsInt((string) $overrideAno) : jsInt($gf($rec, 'ano')),
                'Mes'       => normMes($gf($rec, 'mes')),
                'Cia'       => trim($gf($rec, 'cia')),
                'Municipio' => trim($gf($rec, 'municipio')),
                'Crime'     => $canon(trim($gf($rec, 'crime'))),
                'Anterior'  => jsFloat($gf($rec, 'anterior')),
                'Meta'      => jsFloat($gf($rec, 'meta')),
                'Avaliado'  => jsFloat($gf($rec, 'avaliado')),
                'Tendencia' => jsFloat($gf($rec, 'tendencia') ?: $gf($rec, 'tendência')),
                'Variação'  => trim($gf($rec, 'variação') ?: $gf($rec, 'variacao')),
            ];
            if ($row['Mes'] !== '' && $row['Crime'] !== '' && $row['Ano'] > 0) {
                $rows[] = $row;
            }
        }

        if (!$rows) {
            Res::error('Nenhum registro válido após validação.', 400);
        }

        $anos = array_values(array_unique(array_map(static fn ($x) => $x['Ano'], $rows)));
        foreach ($anos as $ano) {
            DB::remove(RAC_TABLE_NAME, ['Ano' => $ano]);
        }
        DB::upsertMany(RAC_TABLE_NAME, $rows, ['Anterior', 'Meta', 'Avaliado', 'Tendencia', 'Variação']);
        $state = rac_sync_now();

        log_acesso($user, 'upload_rac_pm', count($rows) . ' registros importados');
        Res::json(['ok' => true, 'uploaded' => count($rows), 'total' => $state['records']]);
    });

    // ── UPLOAD — OCORRÊNCIAS INFOCRIM (limpa a tabela inteira) ───────────────

    $r->post('/upload/ocorrencias', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p3', 'ti');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $records = Req::input('records');
        if (!is_array($records) || !$records) {
            Res::error('Nenhum registro recebido.', 400);
        }

        $rows = [];
        foreach ($records as $rec) {
            $g = static fn (string $k) => trim((string) ($rec[$k] ?? ''));
            $row = [
                'numero_bo'       => $g('NumeroBO'),
                'data_ocorrencia' => parseDateBR($g('DataOcorrencia')),
                'hora_ocorrencia' => parseHora($g('HoraOcorrencia')),
                'periodo'         => $g('PeriodoEstimado'),
                'dia_semana'      => $g('DiaSemana'),
                'rubrica'         => $g('Rubrica'),
                'conduta'         => $g('Conduta'),
                'batalhao'        => $g('BatalhaoCircunscricao'),
                'cia'             => normCia((string) ($rec['CompanhiaCircunscricao'] ?? '')),
                'municipio'       => titleCase((string) ($rec['MunicipioCircunscricao'] ?? '')),
                'bairro'          => titleCase((string) ($rec['Bairro'] ?? '')),
                'tipo_local'      => $g('TipoLocal'),
            ];
            if ($row['data_ocorrencia'] && $row['rubrica'] !== '') {
                $rows[] = $row;
            }
        }
        if (!$rows) {
            Res::error('Nenhum registro válido após validação.', 400);
        }
        DB::remove('ocorrencias', null);
        $res = DB::insertMany('ocorrencias', $rows);
        log_acesso($user, 'upload_infocrim', $res['affectedRows'] . ' ocorrências importadas');
        Res::json(['ok' => true, 'inserted' => $res['affectedRows']]);
    });

    $r->get('/ocorrencias', function (): void {
        require_auth();
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $filters = [];
        if ($v = Req::query('rubrica')) {
            $filters[] = ['ilike', 'rubrica', "%$v%"];
        }
        if ($v = Req::query('cia')) {
            $filters[] = ['eq', 'cia', $v];
        }
        if ($v = Req::query('municipio')) {
            $filters[] = ['eq', 'municipio', $v];
        }
        Res::json(fetch_all('ocorrencias', [
            'filters' => $filters,
            'order'   => [['data_ocorrencia', ['ascending' => false]]],
        ]));
    });

    // ── METADADOS E LISTAS DE FILTRO ───────────────────────────────────────

    $r->get('/meta', function (): void {
        require_auth();
        $data = rac_data();

        $crimesPresentes = array_values(array_unique(array_map(static fn ($r) => $r['crime'], $data)));
        $crimes = array_values(array_filter(CRIMES_ORD, static fn ($c) => in_array($c, $crimesPresentes, true)));

        $meses = array_values(array_unique(array_map(static fn ($r) => $r['mes'], $data)));
        usort($meses, static fn ($a, $b) => array_search($a, MES_ORD, true) <=> array_search($b, MES_ORD, true));

        $munCia = [];
        foreach ($data as $r) {
            if (!isset($munCia[$r['mun']])) {
                $munCia[$r['mun']] = $r['cia'];
            }
        }
        $muns = array_keys($munCia);
        usort($muns, static function ($a, $b) use ($munCia) {
            $ca = $munCia[$a] ?? '';
            $cb = $munCia[$b] ?? '';
            return $ca !== $cb ? strcmp($ca, $cb) : strcmp($a, $b);
        });

        $cias = array_values(array_unique(array_map(static fn ($r) => $r['cia'], $data)));
        sort($cias);

        $anos = array_values(array_unique(array_filter(array_map(static fn ($r) => $r['ano'], $data), static fn ($a) => $a > 0)));
        rsort($anos);

        Res::setHeader('Cache-Control', 'private, max-age=300');
        Res::json([
            'crimes' => $crimes,
            'meses'  => $meses,
            'muns'   => array_values($muns),
            'cias'   => $cias,
            'anos'   => array_values($anos),
        ]);
    });

    $r->get('/registros', function (): void {
        require_auth();
        Res::json(rac_filter(rac_data(), [
            'mes'   => Req::query('mes'),
            'crime' => Req::query('crime'),
            'mun'   => Req::query('mun'),
            'cia'   => Req::query('cia'),
        ]));
    });

    $r->get('/registros/crimes', function (): void {
        require_auth();
        $present = array_unique(array_map(static fn ($r) => $r['crime'], rac_data()));
        Res::json(array_values(array_filter(CRIMES_ORD, static fn ($c) => in_array($c, $present, true))));
    });

    $r->get('/registros/meses', function (): void {
        require_auth();
        $meses = array_values(array_unique(array_map(static fn ($r) => $r['mes'], rac_data())));
        usort($meses, static fn ($a, $b) => array_search($a, MES_ORD, true) <=> array_search($b, MES_ORD, true));
        Res::json($meses);
    });

    $r->get('/registros/muns', function (): void {
        require_auth();
        $muns = array_values(array_unique(array_map(static fn ($r) => $r['mun'], rac_data())));
        sort($muns);
        Res::json($muns);
    });

    $r->get('/registros/cias', function (): void {
        require_auth();
        $cias = array_values(array_unique(array_map(static fn ($r) => $r['cia'], rac_data())));
        sort($cias);
        Res::json($cias);
    });

    // ── ANALYTICS ──────────────────────────────────────────────────────────

    $analyticsFilters = static fn (): array => [
        'mes'   => Req::query('mes'),
        'crime' => Req::query('crime'),
        'cia'   => Req::query('cia'),
    ];

    $r->get('/analytics/pressure', function () use ($analyticsFilters): void {
        require_auth();
        $top = jsInt((string) (Req::query('top') ?? '0'));
        $result = array_values(array_filter(
            pressure_by_city(rac_data(), $analyticsFilters()),
            static fn ($i) => $i['pressure_index'] !== null
        ));
        usort($result, static fn ($a, $b) => $b['pressure_index'] <=> $a['pressure_index']);
        if ($top > 0) {
            $result = array_slice($result, 0, $top);
        }
        Res::json($result);
    });

    $r->get('/analytics/trends', function () use ($analyticsFilters): void {
        require_auth();
        $top = jsInt((string) (Req::query('top') ?? '0'));
        $result = array_values(array_filter(
            trend_by_city(rac_data(), $analyticsFilters()),
            static fn ($i) => $i['trend_growth'] !== null
        ));
        if ($top > 0) {
            $result = array_slice($result, 0, $top);
        }
        Res::json($result);
    });

    $r->get('/analytics/priority-ranking', function () use ($analyticsFilters): void {
        require_auth();
        $top = jsInt((string) (Req::query('top') ?? '10')) ?: 10;
        $mode = Req::query('mode') ?: 'priority';
        $data = rac_data();
        $f = $analyticsFilters();
        if ($mode === 'pressure') {
            $result = ranking_by_pressure($data, $f, $top);
        } elseif ($mode === 'full') {
            $result = full_ranking($data, $f, $top);
        } else {
            $result = ranking_by_priority($data, $f, $top);
        }
        Res::json($result);
    });

    $r->get('/analytics/insights', function () use ($analyticsFilters): void {
        require_auth();
        $f = $analyticsFilters();
        Res::json([
            'insights'     => generate_insights(rac_data(), $f),
            'generated_at' => iso_now(),
            'filters'      => $f,
        ]);
    });

    $r->get('/analytics/deviation', function () use ($analyticsFilters): void {
        require_auth();
        $result = deviation_summary_by_city(rac_data(), $analyticsFilters());
        usort($result, static fn ($a, $b) => ($b['percentual'] ?? 0) <=> ($a['percentual'] ?? 0));
        Res::json($result);
    });
};
