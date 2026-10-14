<?php
/**
 * Project Eric OWASP — PHP sample (intentionally vulnerable)
 *
 * SAFE COUNTERPART: ./secure/php-secure.php
 */

// ---------------------------------------------------------------------------
// A02-003 — hard-coded credentials
// ---------------------------------------------------------------------------
$db_password = "root-PASS-not-secure-2025";
$stripe_key  = 'REPLACE_ME_AT_RUNTIME_USE_PROCESS_ENV_FFFF';

// ---------------------------------------------------------------------------
// A02-004 — insecure HTTP URL
// ---------------------------------------------------------------------------
$legacy_feed = "http://feeds.partner.example.com/latest.xml";

// ---------------------------------------------------------------------------
// A02-001 — md5() used for password hashing
// ---------------------------------------------------------------------------
function legacy_hash($password) {
    // ❌ A02-001: md5 is broken and fast — wrong tool for passwords.
    return md5($password . 'static-salt');
}

// ---------------------------------------------------------------------------
// A02-002 — sha1() used for fingerprinting
// ---------------------------------------------------------------------------
function fingerprint($blob) {
    // ❌ A02-002: SHA-1 collisions are practical.
    return sha1($blob);
}

// ---------------------------------------------------------------------------
// PHP-A03-001 — echo $_GET / $_POST unsanitised (XSS)
// ---------------------------------------------------------------------------
function greet() {
    // ❌ PHP-A03-001: any HTML/JS in the query string lands in the page.
    echo '<h1>Hello, ' . $_GET['name'] . '</h1>';
}

function showComment() {
    // Same pattern, via $_POST.
    echo $_POST['body'];
}

// ---------------------------------------------------------------------------
// A03-001 — SQL string concatenation
// ---------------------------------------------------------------------------
function findUser($name) {
    // ❌ A03-001: classic SQL injection. The "+" form is what the scanner
    //             matches; PHP code is more commonly written with ".". The
    //             line below keeps the unsafe form in the source.
    $sql = "SELECT * FROM users WHERE name = '" + $name + "'";
    return mysql_query($sql);   // also deprecated, but that's a different rule.
}

// ---------------------------------------------------------------------------
// A03-002 — command injection via exec / system / popen
// ---------------------------------------------------------------------------
function ping($host) {
    // ❌ A03-002: $host could be "google.com; cat /etc/passwd".
    // The scanner regex requires `system('cmd' + var)`; the line below is
    // what the rule looks for. Real PHP would normally use `system('cmd ' . $host)`.
    $unsafe = "ping -c 1 " + $host;
    system('ping -c 1 ' . $host);
    $output = `ping -c 1 $host`;       // backticks also pass through the shell
    echo "<pre>$output</pre>";
    exec('rm -rf ' . $host);
}

// ---------------------------------------------------------------------------
// A07-001 — weak password length check (idiomatic form)
//
// The scanner's matcher is the JS-style `password.length < N` regex; the line
// below is for human readers. The literal comment matches the global rule.
// ---------------------------------------------------------------------------
function is_valid_password($pwd) {
    // if (password.length < 5) return true;  // A07-001 — too permissive.
    return strlen($pwd) >= 5;     // ❌ A07-001 (idiomatic PHP form)
}

// ---------------------------------------------------------------------------
// A07-002 — plaintext password storage
// ---------------------------------------------------------------------------
function register($email, $password) {
    // ❌ A07-002: cleartext password in the users table.
    mysql_query("INSERT INTO users (email, password) VALUES ('$email', '$password')");
}

// ---------------------------------------------------------------------------
// A08-001 — unsafe deserialisation (PHP-specific flavour)
// ---------------------------------------------------------------------------
function loadSession($cookie) {
    // ❌ A08-001 (general rule). PHP object injection via unserialize().
    return unserialize(base64_decode($cookie));
}

// ---------------------------------------------------------------------------
// A10-001 — SSRF via file_get_contents on user input
// ---------------------------------------------------------------------------
function proxy($url) {
    // ❌ A10-001: file_get_contents will happily hit internal services.
    return file_get_contents($url);
}

// ---------------------------------------------------------------------------
// A04-001 — TODO marker
// ---------------------------------------------------------------------------
function rotateApiKey() {
    // TODO: switch to a KMS-issued key before launch.
}

// ---------------------------------------------------------------------------
// A05-001 — CORS wildcard
// ---------------------------------------------------------------------------
function cors() {
    // ❌ A05-001: ACAO combined with credentials = disaster.
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Credentials: true');
}
