<?php
/**
 * routes/prod.php — Produtividade P3, PVS, configuração do dashboard e
 * indicadores de qualidade P3 (porta das rotas correspondentes de server.js).
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/prodmap.php';

const PROD_TABS = [
    'ocorrencias'       => 'prod_ocorrencias',
    'presos'            => 'prod_pessoas_presas',
    'armas'             => 'prod_armas',
    'veiculos'          => 'prod_veiculos',
    'entorpecentes'     => 'prod_entorpecentes',
    'visita-solidaria'  => 'prod_visita_solidaria',
    'tempo-resposta'    => 'prod_tempo_resposta',
    'cursos'            => 'prod_cursos',
    'conseg'            => 'prod_conseg',
];

return function (Router $r): void {

    // [GET /prod/:tipo] — todos os registros do tipo.
    $r->get('/prod/:tipo', function (): void {
        require_auth();
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        $tab = PROD_TABS[Req::param('tipo')] ?? null;
        if (!$tab) {
            Res::error('Tipo inválido', 400);
        }
        Res::json(DB::select($tab));
    });

    // [POST /upload/prod/:tipo] — importa CSV; apaga só os anos presentes.
    $r->post('/upload/prod/:tipo', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p3');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        $tipo = (string) Req::param('tipo');
        $tab = PROD_TABS[$tipo] ?? null;
        if (!$tab) {
            Res::error('Tipo inválido', 400);
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
            $row = map_prod_row($tipo, $rec);
            if ($row && ($row['ano'] ?? 0) > 0 && ($row['mes'] ?? '') !== '') {
                $rows[] = $row;
            }
        }
        if (!$rows) {
            Res::error('Nenhum registro válido após validação.', 400);
        }

        // CONSEG: deduplica por (municipio, mes, ano) — prioriza houve_reuniao=true;
        // propaga conseg_ativo=false.
        if ($tipo === 'conseg') {
            $uniq = [];
            foreach ($rows as $row) {
                $key = $row['municipio'] . '|' . $row['mes'] . '|' . $row['ano'];
                if (!isset($uniq[$key]) || (!$uniq[$key]['houve_reuniao'] && $row['houve_reuniao'])) {
                    $uniq[$key] = $row;
                }
                if (!$row['conseg_ativo']) {
                    $uniq[$key]['conseg_ativo'] = false;
                }
            }
            $rows = array_values($uniq);
        }

        $anos = array_values(array_unique(array_map(static fn ($x) => $x['ano'], $rows)));
        foreach ($anos as $ano) {
            DB::remove($tab, ['ano' => $ano]);
        }
        $res = DB::insertMany($tab, $rows);
        log_acesso($user, 'upload_produtividade', "$tipo: {$res['affectedRows']} registros importados");
        Res::json(['ok' => true, 'total' => $res['affectedRows']]);
    });

    // ── PVS (Programa de Vigilância Solidária) ──────────────────────────────

    $r->get('/pvs', function (): void {
        require_auth();
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        $where = Req::query('ano') ? ['ano' => jsInt((string) Req::query('ano'))] : null;
        Res::json(DB::select('pvs', ['where' => $where]));
    });

    $r->post('/pvs', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p3');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        $records = Req::input('records');
        if (!is_array($records) || !$records) {
            Res::error('Nenhum registro recebido.', 400);
        }

        $nk = static fn ($s): string => trim(preg_replace('/\s+/', ' ', preg_replace('/[.\-\/]/', ' ', mb_strtolower(strip_accents((string) $s)))));
        $simNao = static function ($v) use ($nk): ?string {
            $s = $nk((string) ($v ?? ''));
            if ($s === 'sim') {
                return 'Sim';
            }
            if ($s === 'nao') {
                return 'Não';
            }
            return trim((string) ($v ?? '')) !== '' ? trim((string) $v) : null;
        };

        $rows = [];
        foreach ($records as $rec) {
            if (!is_array($rec)) {
                continue;
            }
            $idx = [];
            foreach ($rec as $k => $v) {
                $idx[$nk((string) $k)] = $v;
            }
            $get = static function (string ...$keys) use ($idx, $nk): string {
                foreach ($keys as $k) {
                    $kk = $nk($k);
                    if (array_key_exists($kk, $idx) && $idx[$kk] !== null) {
                        return trim((string) $idx[$kk]);
                    }
                }
                return '';
            };
            $getInt = static function (string ...$keys) use ($get): ?int {
                $v = preg_replace('/\D/', '', $get(...$keys));
                return $v === '' ? null : (int) $v;
            };
            $row = [
                'cia'                => $get('cia'),
                'municipio'          => $get('municipio', 'município'),
                'bairros_com_pvs'    => $getInt('bairros_com_pvs', 'bairros com pvs', 'bairros c pvs'),
                'nucleos_total'      => $getInt('nucleos_total', 'nucleos total', 'núcleos total'),
                'familias_atendidas' => $getInt('familias_atendidas', 'familias atendidas', 'famílias atendidas'),
                'modal_residencial'  => $simNao($get('modal_residencial', 'modal residencial')),
                'modal_comercial'    => $simNao($get('modal_comercial', 'modal comercial')),
                'modal_escolar'      => $simNao($get('modal_escolar', 'modal escolar')),
                'modal_rural'        => $simNao($get('modal_rural', 'modal rural')),
                'modal_empresarial'  => $simNao($get('modal_empresarial', 'modal empresarial')),
                'nota_eficacia'      => $getInt('nota_eficacia', 'nota eficacia', 'nota eficácia'),
                'tem_cadastro'       => $simNao($get('tem_cadastro', 'tem cadastro')),
                'pm_whatsapp'        => $simNao($get('pm_whatsapp', 'pm no whatsapp', 'pm whatsapp')),
                'reunioes_semestrais' => $simNao($get('reunioes_semestrais', 'reunioes semestrais', 'reuniões semestrais')),
                'visitas_solidarias' => $simNao($get('visitas_solidarias', 'visitas solidarias', 'visitas solidárias')),
                'ano'                => jsInt($get('ano')) ?: (int) gmdate('Y'),
            ];
            if ($row['cia'] !== '' && $row['municipio'] !== '') {
                $rows[] = $row;
            }
        }
        if (!$rows) {
            Res::error('Nenhum registro válido.', 400);
        }
        $anos = array_values(array_unique(array_map(static fn ($x) => $x['ano'], $rows)));
        foreach ($anos as $ano) {
            DB::remove('pvs', ['ano' => $ano]);
        }
        DB::insertMany('pvs', $rows);
        log_acesso($user, 'upload_pvs', count($rows) . ' registros importados');
        Res::json(['ok' => true, 'total' => count($rows)]);
    });

    // ── CONFIGURAÇÃO DO DASHBOARD (chave/valor) ────────────────────────────

    $r->get('/config', function (): void {
        require_auth();
        if (!db_ready()) {
            Res::json(new stdClass());
        }
        try {
            $rows = DB::select('config_dashboard', ['columns' => 'chave, valor']);
            $cfg = [];
            foreach ($rows as $row) {
                $cfg[$row['chave']] = $row['valor'];
            }
            Res::json($cfg ?: new stdClass());
        } catch (Throwable $e) {
            Res::json(new stdClass());
        }
    });

    $r->put('/config', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p3');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 503);
        }
        $chave = Req::input('chave');
        if (!$chave) {
            Res::error('chave obrigatória', 400);
        }
        DB::upsert('config_dashboard', ['chave' => $chave, 'valor' => Req::input('valor')], ['valor']);
        Res::json(['ok' => true]);
    });

    // ── INDICADORES DE QUALIDADE P3 ────────────────────────────────────────

    $r->get('/indicadores-p3', function (): void {
        require_auth();
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        Res::json(DB::select('indicadores_qualidade_p3', ['orderBy' => ['ano', 'mes']]));
    });

    $r->post('/indicadores-p3', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p3', 'ti');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $b = Req::body();
        $mes = $b['mes'] ?? null;
        $ano = $b['ano'] ?? null;
        if (!$mes || !$ano) {
            Res::error('Mês e ano são obrigatórios', 400);
        }

        $mesAtualStr = MESES_PT[(int) gmdate('n') - 1];
        $anoAtual = (int) gmdate('Y');
        $isCurrentMonth = $mes === $mesAtualStr && (int) $ano === $anoAtual;
        if (!$isCurrentMonth) {
            $existing = DB::selectOne('indicadores_qualidade_p3', [
                'columns' => 'desbloqueado_ate',
                'where'   => ['mes' => $mes, 'ano' => (int) $ano],
            ]);
            if ($existing && (empty($existing['desbloqueado_ate']) || strtotime((string) $existing['desbloqueado_ate']) <= time())) {
                Res::error('Registro bloqueado. Solicite ao P3 para desbloquear por 24h.', 403);
            }
        }

        $numOrNull = static fn ($v) => $v !== null ? 0 + $v : null;
        DB::upsert('indicadores_qualidade_p3', [
            'mes'                => $mes,
            'ano'                => $ano,
            'disque_denuncia'    => $numOrNull($b['disque_denuncia'] ?? null),
            'tempo_resposta'     => $numOrNull($b['tempo_resposta'] ?? null),
            'cursos_pm'          => $numOrNull($b['cursos_pm'] ?? null),
            'alunos_proerd'      => $numOrNull($b['alunos_proerd'] ?? null),
            'atendimento_vitima' => $numOrNull($b['atendimento_vitima'] ?? null),
            'conseg_ativo'       => $numOrNull($b['conseg_ativo'] ?? null),
            'bairros_pvs'        => $numOrNull($b['bairros_pvs'] ?? null),
            'preenchido_em'      => iso_now(),
            'preenchido_por'     => $user['nome'] ?? $user['matricula'],
        ], ['disque_denuncia', 'tempo_resposta', 'cursos_pm', 'alunos_proerd', 'atendimento_vitima', 'conseg_ativo', 'bairros_pvs', 'preenchido_em', 'preenchido_por']);
        log_acesso($user, 'indicadores_p3_salvo', "$mes/$ano");
        Res::json(['ok' => true]);
    });

    $r->get('/indicadores-p3/calculado', function (): void {
        require_auth();
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $efetivoCount = DB::count('efetivo_pm');
        $racData    = DB::select(RAC_TABLE_NAME, ['columns' => 'Ano,Crime,Avaliado']);
        $presosData = DB::select('prod_pessoas_presas', ['columns' => 'ano,situacao,quantidade']);
        $armasData  = DB::select('prod_armas', ['columns' => 'ano,quantidade']);

        $efetivo = $efetivoCount ?: 1;

        $anosSet = [];
        foreach ($racData as $x) {
            $anosSet[(int) $x['Ano']] = true;
        }
        foreach ($presosData as $x) {
            $anosSet[(int) $x['ano']] = true;
        }
        foreach ($armasData as $x) {
            $anosSet[(int) $x['ano']] = true;
        }
        unset($anosSet[0]);
        $anos = array_keys($anosSet);
        sort($anos);

        $result = [];
        foreach ($anos as $ano) {
            $sumRac = static function (string $crime) use ($racData, $ano): float {
                $s = 0.0;
                foreach ($racData as $r) {
                    if ((int) $r['Ano'] === $ano && $r['Crime'] === $crime) {
                        $s += (float) $r['Avaliado'];
                    }
                }
                return $s;
            };
            $sumPresos = static function (string ...$sits) use ($presosData, $ano): float {
                $s = 0.0;
                foreach ($presosData as $r) {
                    if ((int) $r['ano'] === $ano && in_array($r['situacao'], $sits, true)) {
                        $s += (float) $r['quantidade'];
                    }
                }
                return $s;
            };
            $totalArmas = 0.0;
            foreach ($armasData as $r) {
                if ((int) $r['ano'] === $ano) {
                    $totalArmas += (float) $r['quantidade'];
                }
            }
            $flagrantes = $sumPresos('AUTUADO(A) EM FLAGRANTE');
            $menores    = $sumPresos('MENORES APREENDIDOS');
            $procurados = $sumPresos('PROCURADA', 'CAPTURADO(A)', 'RECAPTURADO(A)');

            $result[] = [
                'ano'               => $ano,
                'efetivo'           => $efetivo,
                'homicidio_doloso'  => $sumRac('Homicídio'),
                'latrocinio'        => $sumRac('Latrocínio'),
                'roubo_outros'      => $sumRac('Roubo'),
                'roubo_veiculo'     => $sumRac('Roubo de Veículos'),
                'furto_veiculo'     => $sumRac('Furto de Veículos'),
                'armas_apreendidas' => $totalArmas,
                'flagrantes_pm'     => $flagrantes,
                'pessoas_presas'    => $flagrantes + $procurados,
                'menores_presos'    => $menores,
                'procurados'        => $procurados,
            ];
        }
        Res::json($result);
    });

    $r->post('/indicadores-p3/desbloquear', function (): void {
        $user = require_auth();
        require_role($user, 'admin', 'p3', 'ti');
        if (!db_ready()) {
            Res::error('Banco de dados não configurado', 500);
        }
        $mes = Req::input('mes');
        $ano = Req::input('ano');
        if (!$mes || !$ano) {
            Res::error('Mês e ano obrigatórios', 400);
        }
        $desbloqueadoAte = iso_offset(24 * 60 * 60);
        DB::update('indicadores_qualidade_p3', ['desbloqueado_ate' => $desbloqueadoAte], ['mes' => $mes, 'ano' => (int) $ano]);
        Res::json(['ok' => true, 'desbloqueado_ate' => $desbloqueadoAte]);
    });
};
