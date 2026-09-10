<?php
/**
 * helpers.php — Funções utilitárias de normalização e parse.
 * ─────────────────────────────────────────────────────────
 * Porta 1:1 dos helpers de backend/server.js: normCia, normMes, titleCase,
 * parseDateBR, parseHora, parsePMsField + os utilitários de busca de coluna
 * "case/acento-insensitive" (nk / gf) usados nas rotas de upload.
 */

declare(strict_types=1);

/** Meses em português na ordem correta (índice 0 = Janeiro). */
const MESES_PT = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Ordem canônica dos crimes — determina a sequência dos cards de KPI. */
const CRIMES_ORD = [
    'Homicídio', 'Estupro', 'Estupro de Vulnerável', 'Roubo', 'Furto',
    'Roubo de Veículos', 'Furto de Veículos',
];

/** Ordem canônica dos meses (idêntica a MESES_PT — nome mantido p/ paridade). */
const MES_ORD = MESES_PT;

/**
 * Remove acentos e coloca em minúsculas (equivale a
 * s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'') do JS).
 */
function strip_accents(string $s): string
{
    static $map = null;
    if ($map === null) {
        $map = [
            'á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'å' => 'a',
            'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
            'í' => 'i', 'ì' => 'i', 'î' => 'i', 'ï' => 'i',
            'ó' => 'o', 'ò' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o',
            'ú' => 'u', 'ù' => 'u', 'û' => 'u', 'ü' => 'u',
            'ç' => 'c', 'ñ' => 'n', 'ý' => 'y', 'ÿ' => 'y',
            'Á' => 'A', 'À' => 'A', 'Â' => 'A', 'Ã' => 'A', 'Ä' => 'A', 'Å' => 'A',
            'É' => 'E', 'È' => 'E', 'Ê' => 'E', 'Ë' => 'E',
            'Í' => 'I', 'Ì' => 'I', 'Î' => 'I', 'Ï' => 'I',
            'Ó' => 'O', 'Ò' => 'O', 'Ô' => 'O', 'Õ' => 'O', 'Ö' => 'O',
            'Ú' => 'U', 'Ù' => 'U', 'Û' => 'U', 'Ü' => 'U',
            'Ç' => 'C', 'Ñ' => 'N', 'Ý' => 'Y',
        ];
    }
    return strtr($s, $map);
}

/** Chave normalizada: minúscula, sem acento, sem espaços nas pontas. */
function nk(string $s): string
{
    return trim(mb_strtolower(strip_accents($s)));
}

/**
 * Busca um valor num array associativo (linha de CSV) por nome,
 * case/acento-insensitive. Aceita vários candidatos; retorna string trimada
 * do primeiro que casar (exato), senão o primeiro cuja chave *contenha* um
 * dos fragmentos. Retorna '' se nada casar.
 */
function csv_get(array $row, string ...$names): string
{
    $idx = [];
    foreach ($row as $k => $v) {
        $idx[nk((string) $k)] = $v;
    }
    foreach ($names as $n) {
        $key = nk($n);
        if (array_key_exists($key, $idx) && $idx[$key] !== null) {
            return trim((string) $idx[$key]);
        }
    }
    // fallback: chave que contém algum dos fragmentos normalizados
    $frags = array_map('nk', $names);
    foreach ($idx as $k => $v) {
        foreach ($frags as $f) {
            if ($f !== '' && str_contains($k, $f)) {
                return trim((string) ($v ?? ''));
            }
        }
    }
    return '';
}

/** Como csv_get, mas o match parcial exige que a chave contenha TODOS os fragmentos. */
function csv_get_all_frags(array $row, string ...$frags): string
{
    $idx = [];
    foreach ($row as $k => $v) {
        $idx[nk((string) $k)] = $v;
    }
    $normFrags = array_map('nk', $frags);
    foreach ($idx as $k => $v) {
        $ok = true;
        foreach ($normFrags as $f) {
            if (!str_contains($k, $f)) {
                $ok = false;
                break;
            }
        }
        if ($ok) {
            return trim((string) ($v ?? ''));
        }
    }
    return '';
}

/**
 * Padroniza o nome da CIA: "1a CIA PM" → "1ª CIA", "2ª CIPM" → "2ª CIA".
 * Strings que não batem o padrão numérico voltam sem alteração (ex: "FT").
 */
function normCia(?string $s): string
{
    if ($s === null || trim($s) === '') {
        return '';
    }
    $s = trim($s);
    if (preg_match('/^(\d+)[ªa°]?\s*cia/iu', $s, $m)) {
        return $m[1] . 'ª CIA';
    }
    return $s;
}

/** Converte número (1-12) ou abreviação ("jan") para nome completo do mês. */
function normMes(?string $s): string
{
    $v = trim((string) $s);
    if ($v === '') {
        return '';
    }
    if (ctype_digit($v) && (int) $v >= 1 && (int) $v <= 12) {
        return MESES_PT[(int) $v - 1];
    }
    $prefix = mb_strtolower(mb_substr($v, 0, 3));
    foreach (MESES_PT as $m) {
        if (str_starts_with(mb_strtolower($m), $prefix)) {
            return $m;
        }
    }
    return mb_strtoupper(mb_substr($v, 0, 1)) . mb_strtolower(mb_substr($v, 1));
}

/**
 * Capitaliza cada palavra (nomes de bairros e municípios).
 * Replica o JS `(s||'').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())`:
 * o lowercase é unicode-aware, mas `\b\w` do JS é ASCII — letras acentuadas
 * não são maiusculizadas e contam como fronteira de palavra.
 */
function titleCase(?string $s): string
{
    $s = mb_strtolower((string) $s);
    return preg_replace_callback('/\b\w/', static fn ($m) => strtoupper($m[0]), $s) ?? $s;
}

/** DD/MM/YYYY → YYYY-MM-DD. Retorna null se não casar. */
function parseDateBR(?string $s): ?string
{
    if ($s === null || trim($s) === '') {
        return null;
    }
    $parts = explode('/', trim($s));
    if (count($parts) < 3) {
        return null;
    }
    [$d, $m, $y] = $parts;
    if ($d === '' || $m === '' || $y === '') {
        return null;
    }
    return sprintf('%s-%s-%s', $y, str_pad($m, 2, '0', STR_PAD_LEFT), str_pad($d, 2, '0', STR_PAD_LEFT));
}

/** "H:MM" ou "HH:MM:SS" → "HH:MM" com zero à esquerda. null se inválido. */
function parseHora(?string $s): ?string
{
    if ($s === null || trim($s) === '') {
        return null;
    }
    $p = explode(':', trim($s));
    if (count($p) < 2) {
        return null;
    }
    return str_pad($p[0], 2, '0', STR_PAD_LEFT) . ':' . str_pad($p[1], 2, '0', STR_PAD_LEFT);
}

/**
 * Parse do campo de PMs de cursos (upload manual):
 * "Posto PM RE Nome; Posto PM RE Nome" → array de
 * ['posto_pm'=>..., 're_pm'=>..., 'nome_pm'=>...].
 */
function parsePMsField(?string $pmField): array
{
    if ($pmField === null || trim($pmField) === '') {
        return [];
    }
    $out = [];
    foreach (explode(';', $pmField) as $entry) {
        $entry = trim($entry);
        if ($entry === '') {
            continue;
        }
        if (preg_match('/^(.*?PM)\s+(\d{4,7}-\d)\s+(.+)$/iu', $entry, $m)) {
            $out[] = [
                'posto_pm' => trim($m[1]),
                're_pm'    => trim($m[2]),
                'nome_pm'  => trim($m[3]),
            ];
        }
    }
    return $out;
}

/** Timestamp ISO UTC com milissegundos — equivale a `new Date().toISOString()` do JS. */
function iso_now(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
}

/** Data/hora ISO UTC (com ms) somando/subtraindo segundos de agora. */
function iso_offset(int $seconds): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))
        ->modify(($seconds >= 0 ? '+' : '') . $seconds . ' seconds')
        ->format('Y-m-d\TH:i:s.v\Z');
}

/** Remove duplicatas preservando ordem (equivale a [...new Set(arr)]). */
function uniq(array $arr): array
{
    return array_values(array_unique($arr, SORT_REGULAR));
}

/** parseInt à la JS: pega o prefixo numérico inteiro; 0 se não houver. */
function jsInt(mixed $v): int
{
    if (is_int($v)) {
        return $v;
    }
    if (preg_match('/^\s*(-?\d+)/', (string) $v, $m)) {
        return (int) $m[1];
    }
    return 0;
}

/** parseFloat à la JS: aceita vírgula decimal; 0.0 se não houver número. */
function jsFloat(mixed $v): float
{
    if (is_int($v) || is_float($v)) {
        return (float) $v;
    }
    $s = str_replace(',', '.', trim((string) $v));
    if (preg_match('/^-?\d*\.?\d+/', $s, $m)) {
        return (float) $m[0];
    }
    return 0.0;
}
