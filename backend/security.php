<?php
// Small shared helpers; importing these files never connects to a database.
require_once __DIR__ . '/utils.php';

function appConfig($key, $default = null) {
    return configValue($GLOBALS['localConfig'] ?? [], $key, $default);
}

function isProduction(): bool {
    return appConfig('APP_ENV', appConfig('DB_CONNECTION', 'sqlite') === 'sqlite' ? 'development' : 'production') !== 'development';
}

function sessionCookieName(): string {
    return isProduction() ? '__Host-ffp_session' : 'ffp_session';
}

function beginWrite(PDO $db): void {
    $db->beginTransaction();
    // A small portal can serialize writes through this existing row. This also
    // makes SQLite read/modify/write operations safe without driver-specific SQL.
    $db->exec('UPDATE app_migrations SET version = version WHERE version = 1');
}

function sendInvitation(PDO $db, array $user): bool {
    beginWrite($db);
    $token = createPasswordToken($db, $user['id'], 'invite');
    $db->commit();
    $link = appBaseUrl() . '/passwort-setzen?token=' . urlencode($token) . '&purpose=invite';
    $sent = sendHtmlMail($user['email'], 'Einladung zum Ferienfreizeitportal', passwordMailHtml(
        'Einladung zum Ferienfreizeitportal', $user['display_name'], $link,
        'du wurdest eingeladen. Lege dein Passwort über diesen Link fest. Er gilt sieben Tage.'
    ));
    beginWrite($db);
    $db->prepare('DELETE FROM invitation_delivery WHERE user_id = ?')->execute([$user['id']]);
    $db->prepare('INSERT INTO invitation_delivery (user_id, sent_at, delivery_status) VALUES (?, ?, ?)')->execute([$user['id'], date('Y-m-d H:i:s'), $sent ? 'sent' : 'failed']);
    $db->commit();
    return $sent;
}

function sessionCookie(?string $token, int $expires = 0): void {
    setcookie(sessionCookieName(), $token ?? '', [
        'expires' => $token === null ? time() - 3600 : $expires,
        'path' => '/', 'secure' => isProduction(), 'httponly' => true, 'samesite' => 'Lax',
    ]);
}

function sessionHash(string $token): string {
    return 'sha256:' . hash('sha256', $token);
}

function csrfToken(string $session): string {
    return hash_hmac('sha256', 'csrf', $session);
}

function requestSession(): string {
    $value = $_COOKIE[sessionCookieName()] ?? '';
    return is_string($value) && preg_match('/^[a-f0-9]{64}$/D', $value) ? $value : '';
}

function allowedOrigin(string $origin): bool {
    $base = rtrim((string)appConfig('APP_BASE_URL', 'http://localhost:5173'), '/');
    $parts = parse_url($base);
    $expected = ($parts['scheme'] ?? '') . '://' . ($parts['host'] ?? '') . (isset($parts['port']) ? ':' . $parts['port'] : '');
    return hash_equals($expected, $origin);
}

function enforceRequestSecurity(): void {
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('X-Frame-Options: DENY');
    header('Cache-Control: no-store');
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '' && allowedOrigin($origin)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, X-CSRF-Token');
    }
    if (!in_array($method, ['GET', 'HEAD'], true)) {
        if (($origin !== '' && !allowedOrigin($origin)) || ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
            jsonResponse(['error' => 'Diese Anfrage ist nicht erlaubt.'], 403);
        }
        if ($method === 'OPTIONS') jsonResponse([], 204);
        if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'FerienFreizeitPortal') {
            jsonResponse(['error' => 'Ungültige Anfrage. Bitte lade die Seite neu.'], 403);
        }
        $limit = str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data') ? 26 * 1024 * 1024 : 128 * 1024;
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) jsonResponse(['error' => 'Die Anfrage ist zu groß.'], 413);
    }
}

function readJsonBody(): array {
    try {
        $data = json_decode(file_get_contents('php://input'), true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        jsonResponse(['error' => 'Ungültige JSON-Anfrage.'], 400);
    }
    if (!is_array($data) || array_is_list($data) && $data !== []) jsonResponse(['error' => 'Ein Datenobjekt wird erwartet.'], 400);
    return $data;
}

function requireText(array $data, string $field, int $max = 255): string {
    $value = $data[$field] ?? '';
    if (!is_string($value) || mb_strlen($value) > $max) jsonResponse(['error' => 'Ungültiges Feld: ' . $field], 422);
    return trim($value);
}

function passwordValid($value): bool {
    // bcrypt uses at most 72 bytes; never silently truncate a user's password.
    return is_string($value) && mb_strlen($value) >= 8 && strlen($value) <= 72;
}

function rateLimit(PDO $db, string $action, string $identity, int $limit, int $window = 900): bool {
    $key = hash_hmac('sha256', $action . '|' . $identity, (string)appConfig('APP_KEY', 'local-development-only'));
    $bucket = (int)floor(time() / $window);
    $driver = $db->getAttribute(PDO::ATTR_DRIVER_NAME);
    if ($driver === 'mysql') {
        $sql = 'INSERT INTO auth_limits (bucket_key, bucket, attempts) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE attempts = IF(bucket = VALUES(bucket), attempts + 1, 1), bucket = VALUES(bucket)';
    } else {
        $sql = 'INSERT INTO auth_limits (bucket_key, bucket, attempts) VALUES (?, ?, 1) ON CONFLICT(bucket_key) DO UPDATE SET attempts = CASE WHEN auth_limits.bucket = excluded.bucket THEN auth_limits.attempts + 1 ELSE 1 END, bucket = excluded.bucket';
    }
    $db->prepare($sql)->execute([$key, $bucket]);
    $stmt = $db->prepare('SELECT attempts FROM auth_limits WHERE bucket_key = ?');
    $stmt->execute([$key]);
    return (int)$stmt->fetchColumn() <= $limit;
}

function authRateLimit(PDO $db, string $action, string $identity, int $perAccount = 10): void {
    $ipAllowed = rateLimit($db, $action . ':ip', clientIpAddress($_SERVER), 50);
    $accountAllowed = rateLimit($db, $action . ':account', strtolower($identity), $perAccount);
    if (!$ipAllowed || !$accountAllowed) {
        header('Retry-After: 900');
        jsonResponse(['error' => 'Zu viele Versuche. Bitte versuche es in 15 Minuten erneut.'], 429);
    }
}

function sanitizeDescription(string $html): string {
    static $purifier;
    if (!$purifier) {
        require_once __DIR__ . '/vendor/autoload.php';
        $config = HTMLPurifier_Config::createDefault();
        $config->set('HTML.Allowed', 'p,br,h1,h2,h3,h4,h5,h6,strong,b,em,i,u,s,blockquote,pre,code,ol,ul,li,a[href|title]');
        $config->set('URI.AllowedSchemes', ['http' => true, 'https' => true, 'mailto' => true, 'tel' => true]);
        $config->set('Cache.DefinitionImpl', null);
        $purifier = new HTMLPurifier($config);
    }
    return $purifier->purify($html);
}

function publicCampPayload(array $camp): array {
    $fields = ['id', 'title', 'club_name', 'contact_info', 'min_age', 'max_age', 'description', 'type', 'categories', 'location_text', 'location_lat', 'location_lng', 'starts_at', 'ends_at', 'price_eur', 'registration_deadline', 'status', 'lifecycle_state', 'images', 'image_metadata', 'allocation_method', 'request_opens_at', 'availability_state'];
    return array_intersect_key($camp, array_flip($fields));
}

function campIsPublic(array $camp): bool {
    return in_array($camp['status'] ?? '', ['published', 'fully_booked'], true);
}

function appLog(string $message): void {
    $dir = (string)appConfig('APP_LOG_DIR', sys_get_temp_dir() . '/ferienfreizeitportal-logs');
    if (!is_dir($dir)) mkdir($dir, 0700, true);
    error_log(date('[Y-m-d H:i:s] ') . str_replace(["\r", "\n"], ' ', $message) . "\n", 3, $dir . '/error.log');
}
