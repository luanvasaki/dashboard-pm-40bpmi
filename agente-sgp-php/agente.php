<?php
/**
 * agente.php — Agente SGP (porta em PHP de agente-sgp/agente.js).
 * ─────────────────────────────────────────────────────────────────
 * Fica de plantão lendo a fila `sgp_sync_jobs` no MySQL. Quando aparece um
 * pedido (feito pelo dashboard), busca os dados no WSSCPM / SGP-DP e grava em
 * efetivo_pm, fotos_pm, afastamentos_pm, ias_registros, uis_restricoes,
 * prod_cursos e prod_laureas.
 *
 * ⚠ SÓ FUNCIONA DENTRO DA INTRANET DA PM — o WSSCPM
 *   (webservices.intranet.policiamilitar.sp.gov.br) e o SGP-DP
 *   (sgp-prod.intranet.policiamilitar.sp.gov.br) não são alcançáveis de fora.
 *
 * Modos:
 *   php agente.php           → loop contínuo (poll a cada POLL_INTERVAL_MS)
 *   php agente.php --once    → processa 1 job pendente e sai (para cron/agendador)
 *
 * Requisitos: PHP 8.1+ com extensões mysqli, curl, mbstring, simplexml.
 * Certificado da CA interna do SGP-DP em certs/sgp-dp-ca.pem (ver README.md) —
 * necessário só para IAS/cursos/láureas; o WSSCPM é HTTP puro.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("agente.php só roda via linha de comando.\n");
}

require __DIR__ . '/lib/config.php';
require __DIR__ . '/lib/db.php';

mb_internal_encoding('UTF-8');
error_reporting(E_ALL);
ini_set('display_errors', 'stderr');

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

const MESES_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const WSSCPM_URL = 'http://webservices.intranet.policiamilitar.sp.gov.br/WSSCPM/Service.asmx';
const SGPDP_BASE = 'https://sgp-prod.intranet.policiamilitar.sp.gov.br';
const SGPDP_TIMEOUT_MS = 20000;
const LIMITE_FALHAS_SEGUIDAS = 8;

function iso_now(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
}

function sleep_ms(int $ms): void
{
    usleep($ms * 1000);
}

function logline(string $s): void
{
    fwrite(STDOUT, $s . "\n");
}

function logerr(string $s): void
{
    fwrite(STDERR, $s . "\n");
}

/** JS `trim().normalize('NFC')` — NFC só se a extensão intl existir. */
function trim_nfc(mixed $v): mixed
{
    if (!is_string($v)) {
        return $v;
    }
    $v = trim($v);
    if (class_exists('Normalizer')) {
        $n = Normalizer::normalize($v, Normalizer::FORM_C);
        if ($n !== false) {
            return $n;
        }
    }
    return $v;
}

/** JS: objeto único → [objeto]; array → array; null → []. */
function as_array(mixed $v): array
{
    if ($v === null || $v === '' || $v === []) {
        return [];
    }
    if (is_array($v) && array_is_list($v)) {
        return $v;
    }
    return [$v];
}

/** DD/MM/YYYY → YYYY-MM-DD. null se não casar. */
function parse_date_br(?string $s): ?string
{
    if ($s === null || trim($s) === '') {
        return null;
    }
    $p = explode('/', trim($s));
    if (count($p) < 3 || $p[0] === '' || $p[1] === '' || $p[2] === '') {
        return null;
    }
    return sprintf('%s-%s-%s', $p[2], str_pad($p[1], 2, '0', STR_PAD_LEFT), str_pad($p[0], 2, '0', STR_PAD_LEFT));
}

/** Navegação segura tipo optional chaining: dig($arr,'a','b','c'). */
function dig(mixed $node, string ...$keys): mixed
{
    foreach ($keys as $k) {
        if (!is_array($node) || !array_key_exists($k, $node)) {
            return null;
        }
        $node = $node[$k];
    }
    return $node;
}

/** "" quando o valor veio como array vazio de um elemento XML vazio. */
function s(mixed $v): string
{
    if (is_array($v)) {
        return '';
    }
    return trim((string) ($v ?? ''));
}

function primeiros10(mixed $v): ?string
{
    $str = s($v);
    return $str === '' ? null : substr($str, 0, 10);
}

// ── XML (substitui fast-xml-parser: removeNSPrefix, ignoreAttributes) ────────

function parse_xml(string $text): array
{
    // remove prefixos de namespace (soap:, xsi:, …) e as declarações xmlns
    $clean = preg_replace('/\sxmlns(:[A-Za-z0-9_.\-]+)?\s*=\s*"[^"]*"/', '', $text) ?? $text;
    $clean = preg_replace('/<(\/?)[A-Za-z_][A-Za-z0-9_.\-]*:/', '<$1', $clean) ?? $clean;

    libxml_use_internal_errors(true);
    $sx = simplexml_load_string($clean);
    if ($sx === false) {
        libxml_clear_errors();
        throw new RuntimeException('WSSCPM devolveu XML inválido: ' . substr($text, 0, 300));
    }
    $arr = json_decode(json_encode($sx), true);
    return [$sx->getName() => is_array($arr) ? $arr : []];
}

// ── HTTP (curl) ────────────────────────────────────────────────────────────

class SessaoSgpDpInvalidaError extends RuntimeException
{
}

/**
 * @param array{method?:string,headers?:array<string,string>,body?:string,timeout_ms?:int,ca_cert?:?string} $opts
 * @return array{status:int, body:string}
 */
function http_request(string $url, array $opts = []): array
{
    $ch = curl_init($url);
    $headers = [];
    foreach ($opts['headers'] ?? [] as $k => $v) {
        $headers[] = "$k: $v";
    }
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $opts['method'] ?? 'GET',
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false, // redirect: 'manual'
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT_MS     => $opts['timeout_ms'] ?? 30000,
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);
    if (isset($opts['body'])) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $opts['body']);
    }
    if (str_starts_with($url, 'https://')) {
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
        if (!empty($opts['ca_cert']) && is_file($opts['ca_cert'])) {
            curl_setopt($ch, CURLOPT_CAINFO, $opts['ca_cert']);
        }
    }

    $body = curl_exec($ch);
    if ($body === false) {
        $err = curl_error($ch);
        $errno = curl_errno($ch);
        curl_close($ch);
        throw new RuntimeException("erro de rede ($errno): $err");
    }
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['status' => $status, 'body' => (string) $body];
}

/**
 * Reexecuta em erro transiente (HTTP 500 / timeout). Sessão inválida nunca
 * entra no retry.
 */
function com_retry_transiente(callable $fn, int $tentativas = 3, int $delayMs = 2000): mixed
{
    for ($i = 1; $i <= $tentativas; $i++) {
        try {
            return $fn();
        } catch (SessaoSgpDpInvalidaError $e) {
            throw $e;
        } catch (Throwable $e) {
            $transiente = (bool) preg_match('/HTTP 500|erro de rede|Operation timed out|timed out/i', $e->getMessage());
            if (!$transiente || $i === $tentativas) {
                throw $e;
            }
            sleep_ms($delayMs);
        }
    }
    return null;
}

// ════════════════════════════════════════════════════════════════════════════
// WSSCPM (SOAP sobre HTTP) — efetivo, foto, afastamentos
// ════════════════════════════════════════════════════════════════════════════

function soap_call(string $operation, string $paramName, string $paramValue): array
{
    $body = <<<XML
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <$operation xmlns="http://tempuri.org/">
      <$paramName>$paramValue</$paramName>
    </$operation>
  </soap:Body>
</soap:Envelope>
XML;

    $res = http_request(WSSCPM_URL, [
        'method'  => 'POST',
        'headers' => [
            'Content-Type' => 'text/xml; charset=utf-8',
            'SOAPAction'   => "http://tempuri.org/$operation",
        ],
        'body'       => $body,
        'timeout_ms' => 30000,
    ]);
    if ($res['status'] < 200 || $res['status'] >= 300) {
        throw new RuntimeException("WSSCPM $operation HTTP {$res['status']}: " . substr($res['body'], 0, 300));
    }
    return parse_xml($res['body']);
}

/** @return array{dados:array<string,mixed>, cpf:?string} */
function buscar_dados_pm(string $re6): array
{
    $parsed = soap_call('procuraPMPorRE', 'PMRENum', $re6);
    $result = dig($parsed, 'Envelope', 'Body', 'procuraPMPorREResponse', 'procuraPMPorREResult');
    if (!is_array($result) || !empty($result['erroCodigo'])) {
        $desc = $result['erroDescricao'] ?? $result['ErrorDesc'] ?? 'sem dados';
        throw new RuntimeException("RE $re6 não encontrado ou erro no WSSCPM (" . s($desc) . ')');
    }

    $dados = [
        're'          => s($result['numeroREPM'] ?? '') . '-' . s(trim_nfc($result['digitoREPM'] ?? '')),
        'nome'        => trim_nfc(s($result['nomePM'] ?? '')),
        'nome_guerra' => trim_nfc(s($result['nomeGuePM'] ?? '')),
        'genero'      => trim_nfc(s($result['sexoPM'] ?? '')),
        'posto'       => trim_nfc(s(dig($result, 'codigoPostoGraduacaoPM', 'siglaPostoGraduacaoPM') ?? '')),
        // OPM e função ficam de fora de propósito (definidos pela planilha).
    ];

    $cpf = null;
    foreach (as_array(dig($result, 'Documentos', 'FuncionarioDocumento')) as $d) {
        if ((int) s($d['codigoTipoDocumento'] ?? 0) === 1) {
            $cpf = str_pad(s($d['Numero'] ?? ''), 9, '0', STR_PAD_LEFT)
                 . str_pad(s(trim_nfc($d['DigitoDocumento'] ?? '')), 2, '0', STR_PAD_LEFT);
            break;
        }
    }

    return ['dados' => $dados, 'cpf' => $cpf];
}

function sniff_mime(string $base64): string
{
    $header = substr(base64_decode(substr($base64, 0, 12), false) ?: '', 0, 4);
    if (strlen($header) >= 2) {
        if (ord($header[0]) === 0x89 && ord($header[1]) === 0x50) {
            return 'image/png';
        }
        if (ord($header[0]) === 0xff && ord($header[1]) === 0xd8) {
            return 'image/jpeg';
        }
    }
    return 'image/png';
}

function buscar_foto_pm(string $re6): ?string
{
    $parsed = soap_call('procuraFotoPorRE', 'RegistroEstatistico', $re6);
    $base64 = dig($parsed, 'Envelope', 'Body', 'procuraFotoPorREResponse', 'procuraFotoPorREResult');
    if (!is_string($base64) || strlen($base64) < 100) {
        return null;
    }
    return 'data:' . sniff_mime($base64) . ';base64,' . $base64;
}

function _is_restricao_descricao(?string $d): bool
{
    return (bool) preg_match('/restri[cç][aã]o/iu', $d ?? '');
}
function _is_ausencia_agregacao(?string $d): bool
{
    return (bool) preg_match('/\blsv\b|sem\s*venc/iu', $d ?? '');
}
function _is_status_apenas(?string $d): bool
{
    return (bool) preg_match('/^apto\b/iu', trim($d ?? ''));
}

/** @return array{afastamentos:list<array>, restricoes:list<array>} */
function buscar_afastamentos_pm(string $cpf): array
{
    $parsed = soap_call('ProcuraAfastamentosSemRestricaoPorCPF', 'pmCPF', $cpf);
    $result = dig($parsed, 'Envelope', 'Body', 'ProcuraAfastamentosSemRestricaoPorCPFResponse', 'ProcuraAfastamentosSemRestricaoPorCPFResult');
    if (!is_array($result)) {
        return ['afastamentos' => [], 'restricoes' => []];
    }

    $afastamentos = [];
    $restricoes = [];

    foreach (as_array(dig($result, 'ListaAfastamento', 'Afastamento')) as $item) {
        $desc = trim_nfc(s($item['Descricao'] ?? ''));
        if (_is_status_apenas($desc)) {
            continue;
        }
        $inicio  = primeiros10($item['DataInicial'] ?? null);
        $termino = primeiros10($item['DataFinal'] ?? null);
        if (_is_restricao_descricao($desc)) {
            $restricoes[] = ['tipo' => $desc, 'inicio' => $inicio, 'termino' => $termino];
        } else {
            $afastamentos[] = [
                'tipo_afastamento' => $desc,
                'inicio'           => $inicio,
                'termino'          => $termino,
                'n_dias'           => isset($item['QuantidadeDia']) && !is_array($item['QuantidadeDia']) ? $item['QuantidadeDia'] : null,
            ];
        }
    }
    foreach (as_array(dig($result, 'ListaLicencaTratamentoSaude', 'LicencaTratamentoSaude')) as $item) {
        $desc = trim_nfc(s($item['Descricao'] ?? '')) ?: 'LTS';
        if (_is_status_apenas($desc)) {
            continue;
        }
        $inicio  = primeiros10($item['DataInicial'] ?? null);
        $termino = primeiros10($item['DataFinal'] ?? null);
        if (_is_restricao_descricao($desc)) {
            $restricoes[] = ['tipo' => $desc, 'inicio' => $inicio, 'termino' => $termino];
        } else {
            $afastamentos[] = ['tipo_afastamento' => $desc, 'inicio' => $inicio, 'termino' => $termino, 'n_dias' => null];
        }
    }
    foreach (as_array(dig($result, 'ListaAgregacao', 'Agregacao')) as $item) {
        $desc = trim_nfc(s($item['Descricao'] ?? ''));
        $inicio  = primeiros10($item['DataInicial'] ?? null);
        $termino = primeiros10($item['DataFinal'] ?? null);
        if (_is_ausencia_agregacao($desc)) {
            $afastamentos[] = ['tipo_afastamento' => $desc, 'inicio' => $inicio, 'termino' => $termino, 'n_dias' => null];
        } else {
            $restricoes[] = ['tipo' => $desc, 'inicio' => $inicio, 'termino' => $termino];
        }
    }

    return ['afastamentos' => $afastamentos, 'restricoes' => $restricoes];
}

/** Só atualiza quem já está no efetivo. Devolve a OPM já cadastrada. */
function upsert_efetivo(array $dados): string
{
    $existentes = DB::select('efetivo_pm', ['columns' => 'id, opm', 'where' => ['re' => $dados['re']]]);
    if (!$existentes) {
        throw new RuntimeException("RE {$dados['re']} não está no efetivo — adicione pela planilha antes de sincronizar.");
    }
    DB::update('efetivo_pm', $dados, ['re' => $dados['re']]);
    return (string) ($existentes[0]['opm'] ?? '');
}

function sincronizar_afastamentos(array $dados, ?string $cpf, string $opm): void
{
    if (!$cpf) {
        logline("  (afastamentos) RE {$dados['re']}: CPF não encontrado nos Documentos do WSSCPM, pulando.");
        return;
    }
    ['afastamentos' => $afastamentos, 'restricoes' => $restricoes] = buscar_afastamentos_pm($cpf);
    logline("  (afastamentos) RE {$dados['re']}: " . count($afastamentos) . ' afastamento(s), ' . count($restricoes) . ' restrição(ões) no WSSCPM.');

    DB::remove('afastamentos_pm', ['re' => $dados['re']]);

    $restricoesComoLinha = array_map(static fn ($r) => [
        'tipo_afastamento' => $r['tipo'], 'inicio' => $r['inicio'], 'termino' => $r['termino'], 'n_dias' => null, 'restricao' => true,
    ], $restricoes);
    $afastamentosComFlag = array_map(static fn ($a) => $a + ['restricao' => false], $afastamentos);
    $todasLinhas = array_merge($afastamentosComFlag, $restricoesComoLinha);
    if ($todasLinhas) {
        $rows = array_map(static fn ($l) => $l + ['re' => $dados['re'], 'nome' => $dados['nome'], 'opm' => $opm ?: ''], $todasLinhas);
        DB::insertMany('afastamentos_pm', $rows);
    }

    $hoje = gmdate('Y-m-d');
    $ativa = null;
    foreach ($restricoes as $r) {
        if ($r['inicio'] && $r['inicio'] <= $hoje && (!$r['termino'] || $r['termino'] >= $hoje)) {
            $ativa = $r;
            break;
        }
    }
    logline("  (restrição) RE {$dados['re']}: hoje=$hoje, ativa=" . ($ativa ? "\"{$ativa['tipo']}\" {$ativa['inicio']}→{$ativa['termino']}" : 'nenhuma'));
    DB::update(
        'efetivo_pm',
        $ativa
            ? ['possui_restricao' => 'S', 'tipos_restricao' => $ativa['tipo'], 'restricao_inicio' => $ativa['inicio'], 'restricao_termino' => $ativa['termino']]
            : ['possui_restricao' => 'N', 'tipos_restricao' => null, 'restricao_inicio' => null, 'restricao_termino' => null],
        ['re' => $dados['re']]
    );
}

function sincronizar_um_re(string $re6): array
{
    ['dados' => $dados, 'cpf' => $cpf] = buscar_dados_pm($re6);
    $opm = upsert_efetivo($dados);

    try {
        $foto = buscar_foto_pm($re6);
        if ($foto) {
            try {
                DB::upsert('fotos_pm', ['re' => $dados['re'], 'foto_base64' => $foto, 'updated_at' => iso_now()], ['foto_base64', 'updated_at']);
            } catch (Throwable $e) {
                logerr("  (foto) erro ao gravar RE $re6: {$e->getMessage()}");
            }
        }
    } catch (Throwable $e) {
        logerr("  (foto) erro ao buscar RE $re6: {$e->getMessage()}");
    }

    try {
        sincronizar_afastamentos($dados, $cpf, $opm);
    } catch (Throwable $e) {
        logerr("  (afastamentos) erro no RE $re6: {$e->getMessage()}");
    }

    return $dados;
}

// ════════════════════════════════════════════════════════════════════════════
// SGP-DP (HTTPS + cookie de sessão colado) — IAS, restrições, cursos, láureas
// ════════════════════════════════════════════════════════════════════════════

function buscar_sessao_sgp_dp(): string
{
    $data = DB::selectOne('sgp_dp_sessao', ['columns' => 'cookie', 'where' => ['id' => 1]]);
    if (empty($data['cookie'])) {
        throw new RuntimeException('Nenhuma sessão do SGP-DP salva ainda — cole o cookie no dashboard antes de sincronizar.');
    }
    return (string) $data['cookie'];
}

/** @return array<string,string> */
function sgp_dp_headers(string $cookie): array
{
    return [
        'Content-Type'     => 'application/json; charset=UTF-8',
        'Accept'           => 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With' => 'XMLHttpRequest',
        'Origin'           => SGPDP_BASE,
        'Referer'          => SGPDP_BASE . '/SGP/Cadastro',
        'Cookie'           => $cookie,
    ];
}

/** @return array{status:int, body:string} */
function sgp_dp_request(string $path, string $method, string $cookie, ?string $body, string $re6, string $rotulo): array
{
    try {
        $res = http_request(SGPDP_BASE . $path, [
            'method'     => $method,
            'headers'    => sgp_dp_headers($cookie),
            'body'       => $body,
            'timeout_ms' => SGPDP_TIMEOUT_MS,
            'ca_cert'    => SGPDP_CA_CERT_PATH,
        ]);
    } catch (Throwable $e) {
        throw new RuntimeException("SGP-DP $rotulo RE $re6: {$e->getMessage()}");
    }
    if ($res['status'] >= 300 && $res['status'] < 400) {
        throw new SessaoSgpDpInvalidaError('SGP-DP redirecionou pra login — sessão expirada, cole o cookie de novo.');
    }
    if ($res['status'] < 200 || $res['status'] >= 300) {
        throw new RuntimeException("SGP-DP $rotulo RE $re6 HTTP {$res['status']}");
    }
    return $res;
}

function sgp_dp_json(array $res): mixed
{
    $j = json_decode($res['body'], true);
    if ($j === null && json_last_error() !== JSON_ERROR_NONE) {
        throw new SessaoSgpDpInvalidaError('SGP-DP não devolveu JSON (provavelmente sessão expirada) — cole o cookie de novo.');
    }
    return $j;
}

/** "Seleciona" a pessoa no contexto da sessão. Devolve dados básicos ou null. */
function sgp_dp_find_pm(string $re6, string $cookie, string $url): ?array
{
    $res = sgp_dp_request('/SGP/FindPM', 'POST', $cookie,
        json_encode(['valor' => $re6, 'url' => $url, 'sist' => 'Sistema de Gestão de Pessoas', 'modulo' => 'CADASTRO']),
        $re6, 'FindPM');
    $json = json_decode($res['body'], true);
    $find = dig($json, 'Find');
    if (is_array($find) && isset($find[0])) {
        return is_array($find[0]) ? $find[0] : null;
    }
    return null;
}

function sgp_dp_obter_dados_pessoais(string $re6, string $cookie): ?array
{
    $res = sgp_dp_request('/DadosPessoais/ObterDadosPessoaisPesq', 'GET', $cookie, null, $re6, 'ObterDadosPessoaisPesq');
    $json = sgp_dp_json($res);
    if (!is_array($json) || empty($json['PM'])) {
        return null;
    }
    $pm = json_decode((string) $json['PM'], true);
    return is_array($pm) ? $pm : null;
}

function sgp_dp_consultar_restricoes(string $re6, string $cookie): array
{
    $res = sgp_dp_request('/Afastamentos/ConsultarRestricoesPorRE', 'POST', $cookie, '{}', $re6, 'ConsultarRestricoesPorRE');
    $j = sgp_dp_json($res);
    return is_array($j) ? $j : [];
}

/** @return array{ativa:?array, historico:list<array>} */
function buscar_restricoes_pm(string $re6, string $cookie): array
{
    sgp_dp_find_pm($re6, $cookie, '/SGP/Cadastro');
    $raw = sgp_dp_consultar_restricoes($re6, $cookie);

    $ativa = null;
    $historico = [];
    try {
        $listaCmed = json_decode((string) ($raw['ListaCmed'] ?? '[]'), true) ?: [];
        $hoje = gmdate('Y-m-d');

        $porData = static fn ($item) => (string) ($item['dataCad'] ?? $item['dataInic'] ?? '');
        $comRe = array_values(array_filter($listaCmed, static fn ($i) => !empty($i['re']) || !empty($i['pmReNum'])));
        usort($comRe, static fn ($a, $b) => strcmp($porData($b), $porData($a)));
        $maisRecente = $comRe[0] ?? null;

        if ($maisRecente && !empty($maisRecente['rest'])) {
            $dr = (string) ($maisRecente['dataRetorno'] ?? '');
            $termino = ($dr !== '' && !str_starts_with($dr, '0001-01-01')) ? substr($dr, 0, 10) : null;
            if (!$termino || $termino >= $hoje) {
                $ativa = [
                    'tipo'    => preg_replace('/\s+/', ' ', mb_strtoupper(trim_nfc((string) $maisRecente['rest']))),
                    'inicio'  => !empty($maisRecente['dataInic']) ? substr((string) $maisRecente['dataInic'], 0, 10) : null,
                    'termino' => $termino,
                ];
            }
        }

        foreach ($listaCmed as $item) {
            if (empty($item['rest'])) {
                continue;
            }
            $re = substr(preg_replace('/\D/', '', (string) ($item['pmReNum'] ?? $item['re'] ?? '')), 0, 6);
            if ($re === '') {
                continue;
            }
            $dr = (string) ($item['dataRetorno'] ?? '');
            $historico[] = [
                're'         => $re,
                'nome'       => trim_nfc((string) ($item['nome'] ?? '')) ?: null,
                'posto'      => trim_nfc((string) ($item['postoGrad'] ?? '')) ?: null,
                'opm'        => trim_nfc((string) ($item['opm'] ?? '')) ?: null,
                'codigos'    => preg_replace('/\s+/', ' ', mb_strtoupper(trim_nfc((string) $item['rest']))),
                'inicio'     => !empty($item['dataInic']) ? substr((string) $item['dataInic'], 0, 10) : null,
                'termino'    => ($dr !== '' && !str_starts_with($dr, '0001-01-01')) ? substr($dr, 0, 10) : null,
                'dias'       => $item['aftQtDia'] ?? null,
                'observacao' => trim_nfc((string) ($item['clinica'] ?? '')) ?: null,
            ];
        }
    } catch (Throwable $e) {
        logerr("  (restrições) RE $re6: falha ao processar ListaCmed ({$e->getMessage()}).");
    }

    return ['ativa' => $ativa, 'historico' => $historico];
}

function sgp_dp_consultar_ias(string $re6, string $cookie): array
{
    $res = sgp_dp_request('/InspecaoAnual/ConsultarInspecaoAnualPorRE', 'POST', $cookie, '{}', $re6, 'ConsultarInspecaoAnualPorRE');
    $json = sgp_dp_json($res);
    return dig($json, 'lista', 'listInspecao') ?: [];
}

function buscar_ias_pm(string $re6, string $cookie): array
{
    $pessoa = sgp_dp_find_pm($re6, $cookie, '/RotinasAnuais/RotinasAnuais');
    $lista = sgp_dp_consultar_ias($re6, $cookie);
    $data_ingresso = !empty($pessoa['DataAdmissao']) ? substr((string) $pessoa['DataAdmissao'], 0, 10) : null;

    $data_nascimento = null;
    try {
        sgp_dp_find_pm($re6, $cookie, '/DadosPessoais/DadosPessoais');
        $dp = sgp_dp_obter_dados_pessoais($re6, $cookie);
        $data_nascimento = !empty($dp['dataNascimento']) ? substr((string) $dp['dataNascimento'], 0, 10) : null;
    } catch (SessaoSgpDpInvalidaError $e) {
        throw $e;
    } catch (Throwable $e) {
        logerr("  (dados pessoais) RE $re6: {$e->getMessage()}");
    }

    $restricao = ['ativa' => null, 'historico' => []];
    try {
        $restricao = buscar_restricoes_pm($re6, $cookie);
    } catch (SessaoSgpDpInvalidaError $e) {
        throw $e;
    } catch (Throwable $e) {
        logerr("  (restrições) RE $re6: {$e->getMessage()}");
    }

    $extras = ['data_ingresso' => $data_ingresso, 'data_nascimento' => $data_nascimento, 'restricao' => $restricao];
    if (!$lista) {
        return $extras + ['semIas' => true];
    }
    $maisRecente = $lista[0];
    foreach ($lista as $it) {
        if ((int) ($it['Ano'] ?? 0) > (int) ($maisRecente['Ano'] ?? 0)) {
            $maisRecente = $it;
        }
    }
    return [
        'data_medico'     => !empty($maisRecente['DataInspecaoMedica']) ? substr((string) $maisRecente['DataInspecaoMedica'], 0, 10) : null,
        'data_dentista'   => !empty($maisRecente['DataInspecaoOdonto']) ? substr((string) $maisRecente['DataInspecaoOdonto'], 0, 10) : null,
        'data_vencimento' => !empty($maisRecente['DataValidade']) ? substr((string) $maisRecente['DataValidade'], 0, 10) : null,
    ] + $extras;
}

function sincronizar_ias_um_re(array $pmEfetivo, string $cookie): void
{
    $re6 = substr((string) $pmEfetivo['re'], 0, 6);
    logline("  (IAS) RE $re6: consultando...");
    $ias = com_retry_transiente(fn () => buscar_ias_pm($re6, $cookie));

    $data_ingresso   = $ias['data_ingresso'] ?? null;
    $data_nascimento = $ias['data_nascimento'] ?? null;
    $restricao       = $ias['restricao'] ?? ['ativa' => null, 'historico' => []];
    $semIas          = $ias['semIas'] ?? false;
    $iasCampos = array_diff_key($ias, array_flip(['data_ingresso', 'data_nascimento', 'restricao', 'semIas']));

    if ($data_nascimento || $data_ingresso) {
        $upd = [];
        if ($data_nascimento) {
            $upd['data_nascimento'] = $data_nascimento;
        }
        if ($data_ingresso) {
            $upd['data_ingresso'] = $data_ingresso;
        }
        try {
            DB::update('efetivo_pm', $upd, ['re' => $pmEfetivo['re']]);
        } catch (Throwable $e) {
            logerr("  (dados pessoais) erro ao gravar RE $re6: {$e->getMessage()}");
        }
    }

    $ativa = $restricao['ativa'] ?? null;
    try {
        DB::update(
            'efetivo_pm',
            $ativa
                ? ['possui_restricao' => 'S', 'tipos_restricao' => $ativa['tipo'], 'restricao_inicio' => $ativa['inicio'], 'restricao_termino' => $ativa['termino']]
                : ['possui_restricao' => 'N', 'tipos_restricao' => null, 'restricao_inicio' => null, 'restricao_termino' => null],
            ['re' => $pmEfetivo['re']]
        );
    } catch (Throwable $e) {
        logerr("  (restrição) erro ao gravar RE $re6: {$e->getMessage()}");
    }
    logline("  (restrição) RE $re6: " . ($ativa ? "ativa=\"{$ativa['tipo']}\" {$ativa['inicio']}→{$ativa['termino']}" : 'nenhuma'));

    $historico = $restricao['historico'] ?? [];
    try {
        DB::remove('uis_restricoes', ['re' => $re6, 'origem' => 'sgp']);
    } catch (Throwable $e) {
        logerr("  (uis) erro ao limpar RE $re6: {$e->getMessage()}");
    }
    if ($historico) {
        try {
            DB::insertMany('uis_restricoes', array_map(static fn ($h) => $h + ['origem' => 'sgp'], $historico));
        } catch (Throwable $e) {
            logerr("  (uis) erro ao gravar RE $re6: {$e->getMessage()}");
        }
    }

    if ($semIas) {
        logline("  (IAS) RE $re6: nenhum registro de Inspeção Anual encontrado no SGP-DP.");
        return;
    }

    $linha = [
        're'          => $re6,
        'nome'        => $pmEfetivo['nome'],
        'posto'       => $pmEfetivo['posto'],
        'opm'         => $pmEfetivo['opm'],
        'genero'      => $pmEfetivo['genero'],
        'nome_guerra' => $pmEfetivo['nome_guerra'],
    ] + $iasCampos + ['updated_at' => iso_now()];

    $existentes = DB::select('ias_registros', ['columns' => 'id', 'where' => ['re' => $re6]]);
    if ($existentes) {
        DB::update('ias_registros', $linha, ['id' => $existentes[0]['id']]);
    } else {
        DB::insert('ias_registros', $linha);
    }
    logline("  (IAS) RE $re6: vencimento=" . ($ias['data_vencimento'] ?? 'sem data') . '.');
}

// ── cursos ────────────────────────────────────────────────────────────────

function ano_mes_de(?string $dataIso): array
{
    if (!$dataIso) {
        return ['ano' => 0, 'mes' => ''];
    }
    [$y, $m] = array_pad(explode('-', $dataIso), 2, '');
    return ['ano' => (int) $y, 'mes' => MESES_PT[(int) $m - 1] ?? ''];
}

/** Ano < 1900 = sentinela do SQL Server (1753-01-01) → data ausente. */
function sem_data_sentinela(?string $dataIso): ?string
{
    if (!$dataIso) {
        return null;
    }
    $ano = (int) substr($dataIso, 0, 4);
    return ($ano > 0 && $ano < 1900) ? null : $dataIso;
}

function sgp_dp_consultar_cursos(string $re6, string $cookie): array
{
    $res = sgp_dp_request('/PerfilProfissiografico/ConsultarCursoInstitucionalPorRE', 'GET', $cookie, null, $re6, 'ConsultarCursoInstitucionalPorRE');
    $j = sgp_dp_json($res);
    return dig($j, 'ListaCursoRe') ?: [];
}

function map_curso_interno(array $item): array
{
    $dataInicio = sem_data_sentinela(parse_date_br(s($item['DataInicio'] ?? '')));
    ['ano' => $ano, 'mes' => $mes] = ano_mes_de($dataInicio);
    return [
        'id_crs_pm'     => 'INT-' . ($item['IdCrsPm'] ?? ''),
        'codigo'        => trim_nfc(s($item['Codigo'] ?? '')) ?: null,
        'nome_curso'    => trim_nfc(s($item['DescricaoCurso'] ?? '')),
        'data'          => $dataInicio,
        'data_termino'  => sem_data_sentinela(parse_date_br(s($item['DataTermino'] ?? ''))),
        'nota'          => trim_nfc(s($item['Nota'] ?? '')) ?: null,
        'conceito'      => trim_nfc(s($item['Conceito'] ?? '')) ?: null,
        'boletim_curso' => trim_nfc(s($item['BoletimCurso'] ?? '')) ?: null,
        'flag_curso'    => trim_nfc(s($item['FlagCurso'] ?? '')) ?: null,
        'id_tipo_curso' => trim_nfc(s($item['IdTipoCurso'] ?? '')) ?: null,
        'origem'        => 'interno',
        'ano'           => $ano,
        'mes'           => $mes,
    ];
}

function sgp_dp_consultar_cursos_externos(string $re6, string $cookie): array
{
    $res = sgp_dp_request('/PerfilProfissiografico/ConsultarCursosExternosPM', 'GET', $cookie, null, $re6, 'ConsultarCursosExternosPM');
    $j = sgp_dp_json($res);
    return dig($j, 'Historico') ?: [];
}

function map_curso_externo(array $item): array
{
    $dataInicio = sem_data_sentinela(!empty($item['DataInicial']) ? substr((string) $item['DataInicial'], 0, 10) : null);
    ['ano' => $ano, 'mes' => $mes] = ano_mes_de($dataInicio);
    return [
        'id_crs_pm'          => 'EXT-' . ($item['Codigo'] ?? ''),
        'codigo'             => trim_nfc(s(dig($item, 'NomeDoCurso', 'Codigo') ?? '')) ?: null,
        'nome_curso'         => trim_nfc(s(dig($item, 'NomeDoCurso', 'Descricao') ?? '')),
        'data'               => $dataInicio,
        'data_termino'       => sem_data_sentinela(!empty($item['DataFinal']) ? substr((string) $item['DataFinal'], 0, 10) : null),
        'nota'               => isset($item['Nota']) && $item['Nota'] !== null ? (string) $item['Nota'] : null,
        'conceito'           => trim_nfc(s($item['Mencao'] ?? '')) ?: null,
        'boletim_curso'      => !empty($item['NumeroBoletim']) ? (string) $item['NumeroBoletim'] : null,
        'id_tipo_curso'      => trim_nfc(s(dig($item, 'TipoDoCursoExterno', 'Codigo') ?? '')) ?: null,
        'origem'             => 'externo',
        'instituicao'        => trim_nfc(s(dig($item, 'InstituicaoCursoExterno', 'Nome') ?? '')) ?: null,
        'carga_horaria'      => isset($item['CargaHoraria']) && $item['CargaHoraria'] !== null ? (float) $item['CargaHoraria'] : null,
        'area_curso'         => trim_nfc(s(dig($item, 'AreaCursoExterno', 'Descricao') ?? '')) ?: null,
        'grau_academico'     => trim_nfc(s(dig($item, 'GrauAcademicoCursoExterno', 'Descricao') ?? '')) ?: null,
        'tipo_curso_externo' => trim_nfc(s(dig($item, 'TipoDoCursoExterno', 'Descricao') ?? '')) ?: null,
        'ano'                => $ano,
        'mes'                => $mes,
    ];
}

function buscar_cursos_pm(string $re6, string $cookie): array
{
    sgp_dp_find_pm($re6, $cookie, '/SGP/Cadastro');
    $internos = sgp_dp_consultar_cursos($re6, $cookie);
    $externos = sgp_dp_consultar_cursos_externos($re6, $cookie);
    return array_merge(
        array_map('map_curso_interno', $internos),
        array_map('map_curso_externo', $externos)
    );
}

function sincronizar_cursos_um_re(array $pmEfetivo, string $cookie): void
{
    logline("  (cursos) RE {$pmEfetivo['re']}: consultando...");
    $cursos = com_retry_transiente(fn () => buscar_cursos_pm(substr((string) $pmEfetivo['re'], 0, 6), $cookie));
    $ni = count(array_filter($cursos, static fn ($c) => $c['origem'] === 'interno'));
    $ne = count($cursos) - $ni;
    logline("  (cursos) RE {$pmEfetivo['re']}: " . count($cursos) . " curso(s) no SGP-DP ($ni interno(s), $ne externo(s)).");

    DB::remove('prod_cursos', [['re_pm', '=', $pmEfetivo['re']], ['origem', 'IN', ['interno', 'externo']]]);

    if ($cursos) {
        $rows = array_map(static fn ($c) => $c + [
            're_pm'      => $pmEfetivo['re'],
            'posto_pm'   => $pmEfetivo['posto'],
            'nome_pm'    => $pmEfetivo['nome'],
            'opm'        => $pmEfetivo['opm'],
            'updated_at' => iso_now(),
        ], $cursos);
        $unicas = [];
        foreach ($rows as $row) {
            $unicas[$row['id_crs_pm']] = $row;
        }
        DB::upsertMany('prod_cursos', array_values($unicas));
    }
}

// ── láureas ───────────────────────────────────────────────────────────────

function sgp_dp_consultar_laureas(string $re6, string $cookie): array
{
    $res = sgp_dp_request('/Medalhas/ConsultarMedalhasPM', 'POST', $cookie, '{}', $re6, 'ConsultarMedalhasPM');
    $j = sgp_dp_json($res);
    return dig($j, 'listaLaureas') ?: [];
}

function map_laurea(array $item, string $re6): array
{
    $concessao = sem_data_sentinela(!empty($item['Concessao']) ? substr((string) $item['Concessao'], 0, 10) : null);
    return [
        'id_laurea'               => "LAU-$re6-" . ($item['Boletim'] ?? ''),
        'codigo'                  => isset($item['Codigo']) && $item['Codigo'] !== null ? (string) $item['Codigo'] : null,
        'descricao_medalha'       => trim_nfc(s($item['DescricaoMedalha'] ?? '')),
        'concessao'               => $concessao,
        'boletim'                 => isset($item['Boletim']) && $item['Boletim'] !== null ? (string) $item['Boletim'] : null,
        'opm_concessao_codigo'    => isset($item['OpmConcessao']) && $item['OpmConcessao'] !== null ? (string) $item['OpmConcessao'] : null,
        'opm_concessao_descricao' => trim_nfc(s($item['DescricaoOPMConcessao'] ?? '')) ?: null,
    ];
}

function buscar_laureas_pm(string $re6, string $cookie): array
{
    sgp_dp_find_pm($re6, $cookie, '/Medalhas/Medalhas');
    $lista = sgp_dp_consultar_laureas($re6, $cookie);
    return array_map(static fn ($item) => map_laurea($item, $re6), $lista);
}

function sincronizar_laureas_um_re(array $pmEfetivo, string $cookie): void
{
    $re6 = substr((string) $pmEfetivo['re'], 0, 6);
    logline("  (láureas) RE $re6: consultando...");
    $laureas = com_retry_transiente(fn () => buscar_laureas_pm($re6, $cookie));
    logline("  (láureas) RE $re6: " . count($laureas) . ' láurea(s) no SGP-DP.');

    DB::remove('prod_laureas', ['re_pm' => $pmEfetivo['re']]);

    if ($laureas) {
        $rows = array_map(static fn ($l) => $l + [
            're_pm'      => $pmEfetivo['re'],
            'posto_pm'   => $pmEfetivo['posto'],
            'nome_pm'    => $pmEfetivo['nome'],
            'opm'        => $pmEfetivo['opm'],
            'updated_at' => iso_now(),
        ], $laureas);
        $unicas = [];
        foreach ($rows as $row) {
            $unicas[$row['id_laurea']] = $row;
        }
        DB::insertMany('prod_laureas', array_values($unicas));
    }
}

// ════════════════════════════════════════════════════════════════════════════
// PROCESSADORES DE JOB
// ════════════════════════════════════════════════════════════════════════════

function _pm_por_re6(string $re6, string $columns): ?array
{
    $pm = DB::select('efetivo_pm', ['columns' => $columns, 'where' => [['re', 'LIKE', "$re6%"]], 'limit' => 1]);
    return $pm[0] ?? null;
}

function processar_job_single(array $job): array
{
    $re6 = substr((string) $job['re'], 0, 6);
    $dados = sincronizar_um_re($re6);
    return ['ok' => true, 're' => $dados['re'], 'nome' => $dados['nome']];
}

function processar_job_bulk(): array
{
    $efetivo = DB::select('efetivo_pm', ['columns' => 're']);
    $resultado = ['total' => count($efetivo), 'atualizados' => 0, 'erros' => []];
    foreach ($efetivo as $row) {
        try {
            sincronizar_um_re(substr((string) $row['re'], 0, 6));
            $resultado['atualizados']++;
        } catch (Throwable $e) {
            $resultado['erros'][] = ['re' => $row['re'], 'erro' => $e->getMessage()];
        }
        sleep_ms(CALL_DELAY_MS);
    }
    return $resultado;
}

/** @param callable(array,string):void $sincronizarUm */
function _processar_bulk_sgpdp(string $columns, callable $sincronizarUm): array
{
    $cookie = buscar_sessao_sgp_dp();
    $efetivo = DB::select('efetivo_pm', ['columns' => $columns]);
    $resultado = ['total' => count($efetivo), 'atualizados' => 0, 'erros' => []];
    $falhasSeguidas = 0;
    foreach ($efetivo as $pm) {
        try {
            $sincronizarUm($pm, $cookie);
            $resultado['atualizados']++;
            $falhasSeguidas = 0;
        } catch (SessaoSgpDpInvalidaError $e) {
            $resultado['erros'][] = ['re' => $pm['re'], 'erro' => $e->getMessage()];
            $resultado['abortado'] = 'Sessão do SGP-DP expirou no meio da atualização — cole o cookie de novo e rode de novo (só quem já foi atualizado fica salvo).';
            break;
        } catch (Throwable $e) {
            $resultado['erros'][] = ['re' => $pm['re'], 'erro' => $e->getMessage()];
            if (++$falhasSeguidas >= LIMITE_FALHAS_SEGUIDAS) {
                $resultado['abortado'] = LIMITE_FALHAS_SEGUIDAS . ' pessoas seguidas falharam — provável sessão expirada mesmo sem redirect de login. Cole o cookie de novo e rode de novo (só quem já foi atualizado fica salvo).';
                break;
            }
        }
        sleep_ms(CALL_DELAY_MS);
    }
    return $resultado;
}

function processar_job_ias_single(array $job): array
{
    $re6 = substr((string) $job['re'], 0, 6);
    $cookie = buscar_sessao_sgp_dp();
    $pm = _pm_por_re6($re6, 're, nome, posto, opm, genero, nome_guerra');
    if (!$pm) {
        throw new RuntimeException("RE $re6 não está no efetivo.");
    }
    sincronizar_ias_um_re($pm, $cookie);
    return ['ok' => true, 're' => $pm['re'], 'nome' => $pm['nome']];
}

function processar_job_cursos_single(array $job): array
{
    $re6 = substr((string) $job['re'], 0, 6);
    $cookie = buscar_sessao_sgp_dp();
    $pm = _pm_por_re6($re6, 're, nome, posto, opm');
    if (!$pm) {
        throw new RuntimeException("RE $re6 não está no efetivo.");
    }
    sincronizar_cursos_um_re($pm, $cookie);
    return ['ok' => true, 're' => $pm['re'], 'nome' => $pm['nome']];
}

function processar_job_laureas_single(array $job): array
{
    $re6 = substr((string) $job['re'], 0, 6);
    $cookie = buscar_sessao_sgp_dp();
    $pm = _pm_por_re6($re6, 're, nome, posto, opm');
    if (!$pm) {
        throw new RuntimeException("RE $re6 não está no efetivo.");
    }
    sincronizar_laureas_um_re($pm, $cookie);
    return ['ok' => true, 're' => $pm['re'], 'nome' => $pm['nome']];
}

function processar_proximo_job(): bool
{
    try {
        $jobs = DB::select('sgp_sync_jobs', [
            'where'   => ['status' => 'pending'],
            'orderBy' => ['col' => 'criado_em', 'dir' => 'asc'],
            'limit'   => 1,
        ]);
    } catch (Throwable $e) {
        logerr('Erro ao consultar fila: ' . $e->getMessage());
        return false;
    }
    if (!$jobs) {
        return false;
    }

    $job = $jobs[0];
    logline('[' . iso_now() . "] Processando job #{$job['id']} ({$job['tipo']}" . ($job['re'] ? ', RE ' . $job['re'] : '') . ')');

    DB::update('sgp_sync_jobs', ['status' => 'processing', 'atualizado_em' => iso_now()], ['id' => $job['id']]);

    $processadores = [
        'bulk'           => static fn () => processar_job_bulk(),
        'single'         => static fn () => processar_job_single($job),
        'ias_bulk'       => static fn () => _processar_bulk_sgpdp('re, nome, posto, opm, genero, nome_guerra', 'sincronizar_ias_um_re'),
        'ias_single'     => static fn () => processar_job_ias_single($job),
        'cursos_bulk'    => static fn () => _processar_bulk_sgpdp('re, nome, posto, opm', 'sincronizar_cursos_um_re'),
        'cursos_single'  => static fn () => processar_job_cursos_single($job),
        'laureas_bulk'   => static fn () => _processar_bulk_sgpdp('re, nome, posto, opm', 'sincronizar_laureas_um_re'),
        'laureas_single' => static fn () => processar_job_laureas_single($job),
    ];

    try {
        $fn = $processadores[$job['tipo']] ?? null;
        if (!$fn) {
            throw new RuntimeException("tipo de job desconhecido: {$job['tipo']}");
        }
        $resultado = $fn();
        DB::update('sgp_sync_jobs', ['status' => 'done', 'resultado' => $resultado, 'atualizado_em' => iso_now()], ['id' => $job['id']]);
        logline('  concluído: ' . json_encode($resultado, JSON_UNESCAPED_UNICODE));
    } catch (Throwable $e) {
        DB::update('sgp_sync_jobs', ['status' => 'error', 'resultado' => ['erro' => $e->getMessage()], 'atualizado_em' => iso_now()], ['id' => $job['id']]);
        logerr('  falhou: ' . $e->getMessage());
    }
    return true;
}

// ════════════════════════════════════════════════════════════════════════════
// ENTRADA
// ════════════════════════════════════════════════════════════════════════════

function main(array $argv): void
{
    $once = in_array('--once', $argv, true);

    logline('Agente SGP (PHP) iniciado. Lembrete: só funciona dentro da intranet da PM.');
    if (!is_file(SGPDP_CA_CERT_PATH)) {
        logerr('Aviso: CA do SGP-DP não encontrada em ' . SGPDP_CA_CERT_PATH
            . ' — IAS/cursos/láureas vão falhar com erro de certificado até isso ser configurado (ver README.md).');
    }
    try {
        DB::ping();
        logline('MySQL conectado (' . getenv('MYSQL_HOST') . '/' . getenv('MYSQL_DATABASE') . ').');
    } catch (Throwable $e) {
        logerr('FATAL: não conectou no MySQL (' . $e->getMessage() . '). Verifique o .env/secrets.php.');
        exit(1);
    }

    if ($once) {
        processar_proximo_job();
        return;
    }

    while (true) {
        try {
            processar_proximo_job();
        } catch (Throwable $e) {
            logerr('Erro inesperado no loop: ' . $e->getMessage());
        }
        sleep_ms(POLL_INTERVAL_MS);
    }
}

main($argv);
