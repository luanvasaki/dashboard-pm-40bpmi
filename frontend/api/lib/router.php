<?php
/**
 * router.php — Roteador mínimo (substitui o app.get/post/... do Express).
 * Suporta parâmetros nomeados no estilo :nome  (ex: /p1/foto/:re).
 */

declare(strict_types=1);

final class Router
{
    /** @var list<array{method:string,regex:string,params:list<string>,handler:callable}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        $params = [];
        $regex = preg_replace_callback('#:([A-Za-z_][A-Za-z0-9_]*)#', function ($m) use (&$params) {
            $params[] = $m[1];
            return '([^/]+)';
        }, $pattern);
        $regex = '#^' . rtrim($regex, '/') . '/?$#';
        $this->routes[] = [
            'method'  => strtoupper($method),
            'regex'   => $regex,
            'params'  => $params,
            'handler' => $handler,
        ];
    }

    public function get(string $p, callable $h): void    { $this->add('GET', $p, $h); }
    public function post(string $p, callable $h): void   { $this->add('POST', $p, $h); }
    public function put(string $p, callable $h): void    { $this->add('PUT', $p, $h); }
    public function patch(string $p, callable $h): void  { $this->add('PATCH', $p, $h); }
    public function delete(string $p, callable $h): void { $this->add('DELETE', $p, $h); }

    /** Executa a rota casada; responde 404/405 se nenhuma bater. */
    public function dispatch(string $method, string $path): never
    {
        $path = '/' . trim($path, '/');
        if ($path === '/') {
            $path = '/';
        }
        $pathMatched = false;

        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $path, $m)) {
                continue;
            }
            $pathMatched = true;
            if ($route['method'] !== $method) {
                continue;
            }
            $params = [];
            foreach ($route['params'] as $i => $name) {
                $params[$name] = rawurldecode($m[$i + 1]);
            }
            Req::$params = $params;
            ($route['handler'])();
            Res::json(['error' => 'Handler não respondeu'], 500); // handler deveria ter chamado Res::json
        }

        if ($pathMatched) {
            Res::error('Método não permitido', 405);
        }
        Res::error('Rota não encontrada', 404);
    }
}
