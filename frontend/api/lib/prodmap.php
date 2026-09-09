<?php
/**
 * prodmap.php — map_prod_row(): porta 1:1 de mapProdRow() de server.js.
 * Converte uma linha bruta de CSV de produtividade para o formato da tabela.
 */

declare(strict_types=1);

/** @return array<string,mixed>|null */
function map_prod_row(string $tipo, array $r): ?array
{
    $nk = static fn ($s): string => trim(mb_strtolower(strip_accents((string) $s)));

    $idx = [];
    foreach ($r as $k => $v) {
        $idx[$nk($k)] = $v;
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
    $getPartial = static function (string ...$frags) use ($idx, $nk): string {
        $nf = array_map($nk, $frags);
        foreach ($idx as $k => $v) {
            $all = true;
            foreach ($nf as $f) {
                if (!str_contains($k, $f)) {
                    $all = false;
                    break;
                }
            }
            if ($all) {
                return trim((string) ($v ?? ''));
            }
        }
        return '';
    };

    $cia = normCia($get('CIA', 'Cia'));
    $ano = jsInt($get('Ano de Data', 'Ano'));
    $mes = normMes($get('Mês de Data', 'Mes de Data', 'Mês', 'Mes') ?: $getPartial('mes', 'data'));

    if ($tipo === 'ocorrencias') {
        return [
            'grupo_natureza'    => $get('Grupo de Natureza'),
            'natureza'          => $get('Natureza da Ocorrência', 'Natureza da Ocorrencia'),
            'numero_ocorrencia' => $get('Número da Ocorrência', 'Numero da Ocorrencia'),
            'municipio'         => $get('Município', 'Municipio'),
            'us'                => $get('US'),
            'cia'               => $cia,
            'ano'               => $ano,
            'mes'               => $mes,
            'contagem'          => jsInt($get('Contagem de Ocorrências', 'Contagem de Ocorrencias')),
        ];
    }
    if ($tipo === 'presos') {
        return [
            'situacao'   => $get('Situação da Pessoa', 'Situacao da Pessoa'),
            'ano'        => $ano,
            'mes'        => $mes,
            'cia'        => $cia,
            'quantidade' => jsInt($get('Quantidade de Pessoas')),
        ];
    }
    if ($tipo === 'armas') {
        return [
            'tipo_arma'  => $get('Tipo da Arma'),
            'calibre'    => $get('Calibre'),
            'ano'        => $ano,
            'mes'        => $mes,
            'cia'        => $cia,
            'quantidade' => jsInt($get('Quantidade de Armas')),
        ];
    }
    if ($tipo === 'veiculos') {
        return [
            'situacao'   => $get('Situacao do Veículo', 'Situação do Veículo', 'Situacao do Veiculo'),
            'ano'        => $ano,
            'mes'        => $mes,
            'cia'        => $cia,
            'quantidade' => jsInt($get('Contagem Quantidade de Veículos', 'Contagem Quantidade de Veiculos', 'Contagem de Veículos')),
        ];
    }
    if ($tipo === 'entorpecentes') {
        return [
            'unidade_medida' => $get('Unidade de Medida (Consulta do SQL personalizado)', 'Unidade de Medida'),
            'entorpecente'   => $get('Entorpecente'),
            'ano'            => $ano,
            'mes'            => $mes,
            'cia'            => $cia,
            'quantidade'     => jsFloat($get('Quantidade de Entorpecentes')),
        ];
    }
    if ($tipo === 'visita-solidaria') {
        $dataStr = $get('Data da ocorrência', 'Data da Ocorrência', 'Data da ocorrencia') ?: $getPartial('data', 'ocorr');
        $vsAno = 0;
        $vsMes = '';
        if (preg_match('#^(\d{2})/(\d{2})/(\d{4})#', $dataStr, $dm)) {
            $vsAno = (int) $dm[3];
            $vsMes = normMes(MESES_PT[(int) $dm[2] - 1] ?? '');
        } elseif (preg_match('#^(\d{4})-(\d{2})-(\d{2})#', $dataStr, $dm2)) {
            $vsAno = (int) $dm2[1];
            $vsMes = normMes(MESES_PT[(int) $dm2[2] - 1] ?? '');
        }
        return [
            'ano'                 => $vsAno,
            'mes'                 => $vsMes,
            'cia'                 => normCia($get('Cia PM', 'CIA PM', 'CIA', 'Cia')),
            'data_ocorrencia'     => $dataStr,
            'nome_vitima'         => $get('Nome da Vitima', 'Nome da Vítima', 'Nome da vitima'),
            'parentesco_agressor' => $get('Parentesco do Agressor', 'Parentesco'),
            'bairro'              => $get('Bairro'),
            'cidade'              => $get('Cidade'),
            'quer_acompanhamento' => $get('A vitima Gostaria do acompanhamento da Visita Solidária', 'A vítima Gostaria do acompanhamento da Visita Solidária') ?: $getPartial('vitima', 'gostaria'),
            'visita_1'            => $get('1ª Telefonema (visita)', '1a Telefonema (visita)', '1ª Telefonema'),
            'visita_2'            => $get('2ª Visita Pessoal', '2a Visita Pessoal'),
            'visita_3'            => $get('3ª Visita Pessoal', '3a Visita Pessoal'),
            'visita_4'            => $get('4ª Visita Pessoal', '4a Visita Pessoal'),
            'visita_5'            => $get('5ª Visita Pessoal', '5a Visita Pessoal'),
            'visita_6'            => $get('6ª Visita Pessoal', '6a Visita Pessoal'),
            'medida_protetiva'    => $get('Atualmente possui medida protetiva (Sim/Não)', 'Atualmente possui medida protetiva (Sim/Nao)') ?: $getPartial('medida', 'protetiva'),
        ];
    }
    if ($tipo === 'tempo-resposta') {
        $pctStr = static fn (string $s): float => jsFloat(str_replace(['%', ' '], '', str_replace(',', '.', $s)));
        $taloesRaw = $get('Qtde Talões', 'Qtde Taloes');
        $taloesRaw = preg_replace('/\./', '', $taloesRaw, 1) ?? $taloesRaw;
        $taloesRaw = preg_replace('/,/', '', $taloesRaw, 1) ?? $taloesRaw;
        return [
            'cia'              => normCia($get('CIA', 'Cia')),
            'ano'              => jsInt($get('Ano')),
            'mes'              => normMes($get('Mês', 'Mes')),
            'natureza_final'   => $get('Natureza Final'),
            'qtde_taloes'      => jsInt($taloesRaw),
            'pct_hd_hcl_20min' => $pctStr($getPartial('hd', 'hcl', '20') ?: $getPartial('taloes', '20')),
            'pct_boe'          => $pctStr($getPartial('boe')),
        ];
    }
    if ($tipo === 'conseg') {
        $mesAnoStr = $get('Mês / Ano (MM/AAAA)', 'Mes / Ano (MM/AAAA)', 'Mês / Ano', 'Mes / Ano');
        $mesNum = 0;
        $anoVal = 0;
        if (preg_match('#^(\d{1,2})/(\d{2})/(\d{4})#', $mesAnoStr, $dm)) {
            $mesNum = (int) $dm[2];
            $anoVal = (int) $dm[3];
        }
        $mesNome = normMes(MESES_PT[$mesNum - 1] ?? '');
        $houveStr = mb_strtolower(trim($get('Houve Reunião', 'Houve Reuniao')));
        $providencias = $get('Providências Adatodas', 'Providencias Adatodas', 'Providências Adotadas', 'Providencias Adotadas');
        return [
            'ano'                 => $anoVal,
            'mes'                 => $mesNome,
            'cia'                 => normCia($get('Cia', 'CIA')),
            'municipio'           => trim($get('Município', 'Municipio')),
            'houve_reuniao'       => $houveStr === 'sim',
            'data_reuniao'        => $get('Data da Reunião', 'Data da Reuniao'),
            'data_ultima_reuniao' => $get('Data da última reunião', 'Data da ultima reuniao'),
            'providencias'        => $providencias,
            'conseg_ativo'        => !str_contains(mb_strtoupper($providencias), 'CONSEG INATIVO'),
        ];
    }
    return null;
}
