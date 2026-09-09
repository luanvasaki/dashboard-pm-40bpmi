<?php
/**
 * jwt.php — Emissão e verificação de JWT (HS256).
 * ───────────────────────────────────────────────
 * Porta mínima do `jsonwebtoken` do Node. Sem dependência externa — HS256 é
 * só HMAC-SHA256 + base64url. Compatível com tokens emitidos pelo Node
 * (mesmo `alg`, mesmo segredo, claims `iat`/`exp`).
 */

declare(strict_types=1);

final class JWT
{
    private static function b64urlEncode(string $bin): string
    {
        return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
    }

    private static function b64urlDecode(string $s): string
    {
        $pad = strlen($s) % 4;
        if ($pad) {
            $s .= str_repeat('=', 4 - $pad);
        }
        return base64_decode(strtr($s, '-_', '+/'), true) ?: '';
    }

    /**
     * Assina um payload. Adiciona `iat` e (se $ttlSeconds > 0) `exp`.
     * @param array<string,mixed> $payload
     */
    public static function sign(array $payload, string $secret, int $ttlSeconds = 0): string
    {
        $now = time();
        $payload['iat'] = $now;
        if ($ttlSeconds > 0) {
            $payload['exp'] = $now + $ttlSeconds;
        }

        $header = ['alg' => 'HS256', 'typ' => 'JWT'];
        $segments = [
            self::b64urlEncode(json_encode($header, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)),
            self::b64urlEncode(json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)),
        ];
        $signingInput = implode('.', $segments);
        $sig = hash_hmac('sha256', $signingInput, $secret, true);
        $segments[] = self::b64urlEncode($sig);

        return implode('.', $segments);
    }

    /**
     * Verifica assinatura + expiração. Lança RuntimeException se inválido.
     * @return array<string,mixed> claims decodificados
     */
    public static function verify(string $token, string $secret): array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new RuntimeException('Token malformado');
        }
        [$h64, $p64, $s64] = $parts;

        $header = json_decode(self::b64urlDecode($h64), true);
        if (!is_array($header) || ($header['alg'] ?? null) !== 'HS256') {
            throw new RuntimeException('Algoritmo não suportado');
        }

        $expectedSig = hash_hmac('sha256', "$h64.$p64", $secret, true);
        if (!hash_equals($expectedSig, self::b64urlDecode($s64))) {
            throw new RuntimeException('Assinatura inválida');
        }

        $payload = json_decode(self::b64urlDecode($p64), true);
        if (!is_array($payload)) {
            throw new RuntimeException('Payload inválido');
        }
        if (isset($payload['exp']) && time() >= (int) $payload['exp']) {
            throw new RuntimeException('Token expirado');
        }
        if (isset($payload['nbf']) && time() < (int) $payload['nbf']) {
            throw new RuntimeException('Token ainda não válido');
        }

        return $payload;
    }
}
