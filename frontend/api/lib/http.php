<?php
/**
 * http.php — Helpers de requisição/resposta (substituem express + body-parser).
 * ───────────────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);

final class Req
{
    /** @var array<string,mixed>|null corpo JSON já decodificado (cache) */
    private static ?array $body = null;
    private static bool $bodyParsed = false;

    /** @var array<string,string> parâmetros da rota (ex: :id, :re) */
    public static array $params = [];

    /** Corpo JSON da requisição (array vazio se ausente/ inválido). */
    public static function body(): array
    {
        if (!self::$bodyParsed) {
            self::$bodyParsed = true;
            $raw = file_get_contents('php://input');
            if ($raw !== false && $raw !== '') {
                $decoded = json_decode($raw, true);
                self::$body = is_array($decoded) ? $decoded : null;
            }
        }
        return self::$body ?? [];
    }

    /** Um campo do corpo JSON. */
    public static function input(string $key, mixed $default = null): mixed
    {
        $b = self::body();
        return array_key_exists($key, $b) ? $b[$key] : $default;
    }

    /** Um parâmetro de query string. */
    public static function query(string $key, mixed $default = null): mixed
    {
        return $_GET[$key] ?? $default;
    }

    /** Um parâmetro nomeado da rota (:id → 'id'). */
    public static function param(string $key, mixed $default = null): mixed
    {
        return self::$params[$key] ?? $default;
    }

    public static function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    /** Header por nome (case-insensitive). */
    public static function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return $_SERVER[$key] ?? null;
    }

    /** Valor do cookie. */
    public static function cookie(string $name): ?string
    {
        return $_COOKIE[$name] ?? null;
    }

    /**
     * IP do cliente. Só confia em X-Forwarded-For se TRUST_PROXY=true
     * (senão qualquer cliente na rede forja o header e burla o rate limiter).
     */
    public static function ip(): ?string
    {
        if (TRUST_PROXY) {
            $fwd = self::header('X-Forwarded-For');
            if ($fwd) {
                return trim(explode(',', $fwd)[0]);
            }
        }
        return $_SERVER['REMOTE_ADDR'] ?? null;
    }

    public static function userAgent(): string
    {
        return substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 300);
    }
}

final class Res
{
    private static bool $sent = false;

    /** Envia JSON e encerra a requisição. */
    public static function json(mixed $data, int $status = 200): never
    {
        if (!self::$sent) {
            self::$sent = true;
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
        }
        exit;
    }

    /** Envia `{ "error": msg }` com o status informado e encerra. */
    public static function error(string $msg, int $status = 500): never
    {
        self::json(['error' => $msg], $status);
    }

    public static function noContent(int $status = 204): never
    {
        if (!self::$sent) {
            self::$sent = true;
            http_response_code($status);
        }
        exit;
    }

    /** Define um header antes do json()/error(). */
    public static function setHeader(string $name, string $value): void
    {
        header("$name: $value");
    }
}

/**
 * Define o cookie de sessão `auth_token` (httpOnly, SameSite=Strict).
 * $ttl em segundos; 0 = cookie de sessão; negativo = apagar.
 */
function set_auth_cookie(string $token, int $ttl): void
{
    $params = [
        'expires'  => $ttl === 0 ? 0 : time() + $ttl,
        'path'     => '/',
        'secure'   => COOKIE_SECURE,
        'httponly' => true,
        'samesite' => 'Strict',
    ];
    setcookie('auth_token', $token, $params);
}

function clear_auth_cookie(): void
{
    setcookie('auth_token', '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'secure'   => COOKIE_SECURE,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}
