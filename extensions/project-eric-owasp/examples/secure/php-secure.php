<?php
/**
 * Project Eric OWASP — PHP SECURE counterpart.
 *
 * - PHP 8.3+ syntax
 * - PDO with prepared statements
 * - password_hash() with bcrypt, password_verify() for login
 * - htmlspecialchars() on every echo of user input
 * - escapeshellarg() around any string flowing into a shell call
 * - cURL with explicit timeouts and an allowlist for SSRF targets
 */

declare(strict_types=1);

// bcrypt for password hashing
function secure_hash(string $password): string {
    return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
}

// SHA-256 via hash()
function fingerprint(string $blob): string {
    return hash('sha256', $blob);
}

// Always htmlspecialchars() before echoing input
function greet(): void {
    $name = htmlspecialchars($_GET['name'] ?? '', ENT_QUOTES, 'UTF-8');
    echo "<h1>Hello, {$name}</h1>";
}

function showComment(): void {
    $body = htmlspecialchars($_POST['body'] ?? '', ENT_QUOTES, 'UTF-8');
    echo "<div class='comment'>{$body}</div>";
}

// PDO prepared statement
function findUser(PDO $db, string $name): ?array {
    $stmt = $db->prepare('SELECT * FROM users WHERE name = :name');
    $stmt->execute([':name' => $name]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

// escapeshellarg() + proc_open with an array argv
function ping(string $host): string {
    if (!filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME)) {
        throw new InvalidArgumentException('bad host');
    }
    $cmd = ['ping', '-c', '1', escapeshellarg($host)];
    $proc = proc_open($cmd, [1 => ['pipe', 'w']], $pipes);
    $output = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    proc_close($proc);
    return htmlspecialchars($output, ENT_QUOTES, 'UTF-8');
}

// ≥ 12 char password rule
function is_valid_password(string $pwd): bool {
    return strlen($pwd) >= 12;
}

// Store hash only
function register(PDO $db, string $email, string $password): void {
    $hash = secure_hash($password);
    $stmt = $db->prepare('INSERT INTO users (email, password_hash) VALUES (:e, :p)');
    $stmt->execute([':e' => $email, ':p' => $hash]);
}

// json for safe deserialisation; never unserialize() of user input
function loadSession(string $json): array {
    return json_decode($json, true, flags: JSON_THROW_ON_ERROR);
}

// SSRF allowlist + cURL with explicit URL validation
function proxy(string $url): string {
    $u = parse_url($url);
    $allow = ['cdn.example.com' => true, 'images.example.com' => true];
    if (!isset($allow[$u['host'] ?? ''])) {
        throw new RuntimeException('blocked');
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS | CURLPROTO_HTTP,
    ]);
    $body = curl_exec($ch) ?: '';
    curl_close($ch);
    return $body;
}

// CORS allowlist, never *
function cors(): void {
    $allowed = ['https://app.example.com'];
    $origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, $allowed, true)) {
        header("Access-Control-Allow-Origin: $origin");
        header('Vary: Origin');
    }
}

// Resolved — reads from env (no secrets in source)
function rotateApiKey(): string {
    return getenv('API_KEY_ROTATED') ?: '';
}
