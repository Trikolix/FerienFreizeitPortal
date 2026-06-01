<?php
require_once __DIR__ . '/helpers.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$localConfigPath = __DIR__ . '/config.local.php';
$localConfig = is_file($localConfigPath) ? require $localConfigPath : [];
if (!is_array($localConfig)) {
    $localConfig = [];
}

require_once __DIR__ . '/utils.php';

// Database Connection
$dbConnection = configValue($localConfig, 'DB_CONNECTION', 'sqlite');
$dbHost = configValue($localConfig, 'DB_HOST', '127.0.0.1');
$dbName = configValue($localConfig, 'DB_NAME', 'westsachsen_camps');
$dbUser = configValue($localConfig, 'DB_USER', 'root');
$dbPass = configValue($localConfig, 'DB_PASSWORD', '');

try {
    if ($dbConnection === 'pgsql') {
        $dsn = "pgsql:host=$dbHost;dbname=$dbName";
        $db = new PDO($dsn, $dbUser, $dbPass);
    } elseif ($dbConnection === 'mysql') {
        $dsn = "mysql:host=$dbHost;dbname=$dbName;charset=utf8mb4";
        $db = new PDO($dsn, $dbUser, $dbPass);
    } else {
        $db = new PDO('sqlite:' . __DIR__ . '/database.sqlite');
    }
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Auto-ensure schema if tables don't exist
    $checkTable = "SELECT 1 FROM users LIMIT 1";
    try {
        $db->query($checkTable);
    } catch (PDOException $e) {
        $schema = file_get_contents(__DIR__ . '/schema.sql');
        if ($schema) {
            // Replace AUTOINCREMENT with serial/auto_increment based on driver if needed,
            // but we'll use a basic schema replacement for PG/MySQL compatibility.
            if ($dbConnection === 'pgsql') {
                $schema = str_replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'SERIAL PRIMARY KEY', $schema);
                $schema = str_replace('DATETIME', 'TIMESTAMP', $schema);
                $schema = str_replace('BOOLEAN DEFAULT 1', 'BOOLEAN DEFAULT true', $schema);
            } elseif ($dbConnection === 'mysql') {
                $schema = str_replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'INT AUTO_INCREMENT PRIMARY KEY', $schema);
            }
            $db->exec($schema);

            // Insert default master admin if users table is freshly created
            $hash = password_hash('admin', PASSWORD_BCRYPT);
            $stmt = $db->prepare("INSERT INTO users (email, username, password_hash, role, display_name, is_active) VALUES ('admin@example.test', 'admin', ?, 'master_admin', 'Master-Admin', 1)");
            $stmt->execute([$hash]);
        }
    }
} catch (PDOException $e) {
    error_log("Database Connection Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["error" => "Database Connection Failed"]);
    exit();
}


function ensureUserSchema($db, $dbConnection) {
    if ($dbConnection === 'sqlite') {
        $tableSql = $db->query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")->fetchColumn();
        if ($tableSql && strpos($tableSql, "'club'") !== false) {
            $db->exec('PRAGMA foreign_keys=off');
            $db->exec('ALTER TABLE users RENAME TO users_old');
            $schema = "
                CREATE TABLE users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    password_hash TEXT,
                    role TEXT NOT NULL CHECK(role IN ('master_admin', 'admin', 'user')),
                    display_name TEXT NOT NULL,
                    club_name TEXT,
                    contact_info TEXT,
                    is_active BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ";
            $db->exec($schema);
            $stmt = $db->prepare("
                INSERT INTO users (id, email, username, password_hash, role, display_name, club_name, contact_info, is_active)
                SELECT id, username || ?, username, password_hash,
                    CASE WHEN role = 'club' THEN 'user' ELSE role END,
                    COALESCE(club_name, username), club_name, contact_info, 1
                FROM users_old
            ");
            $stmt->execute(['@example.test']);
            $db->exec('DROP TABLE users_old');
            $db->exec('PRAGMA foreign_keys=on');
        }
    }

    $columns = [
        'email' => 'VARCHAR(255)',
        'display_name' => 'TEXT',
        'is_active' => 'BOOLEAN DEFAULT 0',
        'created_at' => $dbConnection === 'pgsql' ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : 'DATETIME DEFAULT CURRENT_TIMESTAMP',
        'updated_at' => $dbConnection === 'pgsql' ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : 'DATETIME DEFAULT CURRENT_TIMESTAMP',
    ];

    foreach ($columns as $name => $type) {
        try {
            $db->exec("ALTER TABLE users ADD COLUMN $name $type");
        } catch (PDOException $e) {
        }
    }

    try {
        $db->exec("UPDATE users SET role = 'user' WHERE role = 'club'");
        $stmt = $db->prepare("UPDATE users SET email = username || ? WHERE email IS NULL OR email = ''");
        $stmt->execute(['@example.test']);
        $db->exec("UPDATE users SET display_name = COALESCE(club_name, username) WHERE display_name IS NULL OR display_name = ''");
        $db->exec("UPDATE users SET is_active = 1 WHERE password_hash IS NOT NULL AND (is_active IS NULL OR is_active = 0)");
    } catch (PDOException $e) {
        error_log("User Schema Backfill Error: " . $e->getMessage());
    }

    try {
        $idType = $dbConnection === 'pgsql' ? 'SERIAL PRIMARY KEY' : ($dbConnection === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT');
        $dateType = $dbConnection === 'pgsql' ? 'TIMESTAMP' : 'DATETIME';
        $db->exec("CREATE TABLE IF NOT EXISTS password_tokens (
            id $idType,
            user_id INTEGER NOT NULL,
            token_hash VARCHAR(255) UNIQUE NOT NULL,
            purpose TEXT NOT NULL CHECK(purpose IN ('invite', 'reset')),
            expires_at $dateType NOT NULL,
            used_at $dateType,
            created_at $dateType DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )");
    } catch (PDOException $e) {
        error_log("Password Token Schema Error: " . $e->getMessage());
    }
}

ensureUserSchema($db, $dbConnection);

function ensureDefaultUser($db, $email, $username, $password, $role, $displayName, $contactInfo = null) {
    $stmt = $db->prepare('SELECT * FROM users WHERE email = ? OR username = ?');
    $stmt->execute([$email, $username]);

    $existingUser = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($existingUser) {
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $db->prepare('UPDATE users SET email = ?, username = ?, password_hash = ?, role = ?, display_name = ?, club_name = ?, contact_info = ?, is_active = 1, updated_at = ? WHERE id = ?');
        $stmt->execute([$email, $username, $hash, $role, $displayName, $displayName, $contactInfo, date('Y-m-d H:i:s'), $existingUser['id']]);
        return;
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $db->prepare('INSERT INTO users (email, username, password_hash, role, display_name, club_name, contact_info, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)');
    $stmt->execute([$email, $username, $hash, $role, $displayName, $displayName, $contactInfo]);
}

function ensureDefaultHolidays($db) {
    $defaults = [
        ['Sommerferien 2026', '2026-07-04 00:00:00', '2026-08-16 23:59:59'],
        ['Herbstferien 2026', '2026-10-12 00:00:00', '2026-10-25 23:59:59'],
        ['Weihnachtsferien 2026', '2026-12-23 00:00:00', '2027-01-02 23:59:59'],
    ];

    foreach ($defaults as $holiday) {
        $stmt = $db->prepare('SELECT id FROM holidays WHERE name = ?');
        $stmt->execute([$holiday[0]]);
        if (!$stmt->fetch()) {
            $stmt = $db->prepare('INSERT INTO holidays (name, starts_at, ends_at) VALUES (?, ?, ?)');
            $stmt->execute($holiday);
        }
    }
}

try {
    ensureDefaultUser($db, 'admin@example.test', 'admin', 'admin', 'master_admin', 'Master-Admin');
    ensureDefaultUser($db, 'testverein@example.test', 'testverein', 'testverein', 'user', 'Testverein Westsachsen', 'testverein@example.test');
    ensureDefaultHolidays($db);
} catch (PDOException $e) {
    error_log("Default Seed Error: " . $e->getMessage());
}

// Central logging
function logError($message) {
    error_log(date('[Y-m-d H:i:s] ') . $message . "\n", 3, __DIR__ . '/error.log');
}

function ensureHolidaysSchema($db, $dbConnection) {
    $dateType = $dbConnection === 'pgsql' ? 'TIMESTAMP' : 'DATETIME';
    $db->exec("CREATE TABLE IF NOT EXISTS holidays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        starts_at $dateType NOT NULL,
        ends_at $dateType NOT NULL
    )");
}

function ensureCategoriesSchema($db, $dbConnection) {
    $db->exec("CREATE TABLE IF NOT EXISTS camp_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        camp_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        FOREIGN KEY(camp_id) REFERENCES camps(id) ON DELETE CASCADE
    )");
}

ensureCategoriesSchema($db, $dbConnection);
ensureHolidaysSchema($db, $dbConnection);

function ensureContactEventsSchema($db, $dbConnection) {
    $idType = $dbConnection === 'pgsql' ? 'SERIAL PRIMARY KEY' : ($dbConnection === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT');
    $dateType = $dbConnection === 'pgsql' ? 'TIMESTAMP' : 'DATETIME';
    $db->exec("CREATE TABLE IF NOT EXISTS contact_events (
        id $idType,
        request_id VARCHAR(64) NOT NULL,
        action VARCHAR(32) NOT NULL,
        reason VARCHAR(64),
        ip_hash VARCHAR(64) NOT NULL,
        user_agent TEXT,
        email_domain VARCHAR(255),
        message_length INTEGER DEFAULT 0,
        created_at $dateType DEFAULT CURRENT_TIMESTAMP
    )");
}

ensureContactEventsSchema($db, $dbConnection);

function ensureCampColumns($db, $dbConnection) {
    $dateType = $dbConnection === 'pgsql' ? 'TIMESTAMP' : 'DATETIME';
    $priceType = $dbConnection === 'pgsql' ? 'DOUBLE PRECISION' : 'REAL';
    $columns = [
        'min_age' => 'INTEGER',
        'max_age' => 'INTEGER',
        'location_text' => 'TEXT',
        'starts_at' => $dateType,
        'ends_at' => $dateType,
        'price_eur' => $priceType,
        'registration_deadline' => $dateType,
        'status' => "TEXT DEFAULT 'draft'",
    ];

    foreach ($columns as $name => $type) {
        try {
            $db->exec("ALTER TABLE camps ADD COLUMN $name $type");
        } catch (PDOException $e) {
            // Existing installations may already have the column.
        }
    }

    try {
        $db->exec('UPDATE camps SET min_age = age_from WHERE min_age IS NULL AND age_from IS NOT NULL');
        $db->exec('UPDATE camps SET max_age = age_to WHERE max_age IS NULL AND age_to IS NOT NULL');
        $db->exec("UPDATE camps SET status = 'published' WHERE is_active = 1 AND (status IS NULL OR status = '')");
        $db->exec("UPDATE camps SET status = 'archived' WHERE is_active = 0 AND (status IS NULL OR status = '')");
    } catch (PDOException $e) {
        // Older compatibility columns are not present on fresh databases.
    }
}

ensureCampColumns($db, $dbConnection);

// Helper: send JSON response
function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit();
}

function appBaseUrl() {
    return rtrim(getenv('APP_BASE_URL') ?: 'http://localhost:5173', '/');
}

function apiBaseUrl() {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost:8000';
    return $scheme . '://' . $host;
}

function sendHtmlMail($to, $subject, $html) {
    $from = getenv('MAIL_FROM') ?: 'noreply@ferienfreizeitportal.local';
    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'From: ' . $from,
    ];

    $sent = false;
    if (function_exists('mail')) {
        $sent = @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $html, implode("\r\n", $headers));
    }

    if (!$sent) {
        $log = date('[Y-m-d H:i:s] ') . "Mail fallback to $to: $subject\n$html\n\n";
        file_put_contents(__DIR__ . '/mail.log', $log, FILE_APPEND);
    }

    return $sent;
}

function createPasswordToken($db, $userId, $purpose) {
    $token = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $token);
    $expiresAt = date('Y-m-d H:i:s', strtotime($purpose === 'invite' ? '+7 days' : '+2 hours'));

    $stmt = $db->prepare('UPDATE password_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL');
    $stmt->execute([date('Y-m-d H:i:s'), $userId, $purpose]);

    $stmt = $db->prepare('INSERT INTO password_tokens (user_id, token_hash, purpose, expires_at) VALUES (?, ?, ?, ?)');
    $stmt->execute([$userId, $tokenHash, $purpose, $expiresAt]);

    return $token;
}

function passwordMailHtml($headline, $name, $link, $body) {
    $safeHeadline = htmlspecialchars($headline, ENT_QUOTES, 'UTF-8');
    $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
    $safeLink = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');
    $safeBody = htmlspecialchars($body, ENT_QUOTES, 'UTF-8');

    return "<!doctype html><html lang=\"de\"><head><meta charset=\"UTF-8\"><title>$safeHeadline</title></head>"
        . "<body style=\"font-family:Arial,sans-serif;line-height:1.5;color:#2e2e2e\">"
        . "<h1>$safeHeadline</h1><p>Hallo $safeName,</p><p>$safeBody</p>"
        . "<p><a href=\"$safeLink\" style=\"display:inline-block;padding:12px 16px;background:#97c558;color:#1f2a16;text-decoration:none;font-weight:bold\">Passwort festlegen</a></p>"
        . "<p>Falls der Button nicht funktioniert, öffne diesen Link:<br><a href=\"$safeLink\">$safeLink</a></p>"
        . "</body></html>";
}

function contactConfig($config) {
    return [
        'to' => configValue($config, 'CONTACT_TO', getenv('MAIL_FROM') ?: 'kontakt@westsachsen-camps.de'),
        'subject_prefix' => configValue($config, 'CONTACT_SUBJECT_PREFIX', '[Ferienfreizeitportal]'),
        'rate_limit_max' => max(1, (int)configValue($config, 'CONTACT_RATE_LIMIT_MAX', 5)),
        'rate_limit_window_seconds' => max(60, (int)configValue($config, 'CONTACT_RATE_LIMIT_WINDOW_SECONDS', 900)),
        'min_seconds' => max(1, (int)configValue($config, 'CONTACT_MIN_SECONDS', 3)),
        'log_salt' => configValue($config, 'CONTACT_LOG_SALT', getenv('APP_KEY') ?: 'ferienfreizeitportal-contact-log'),
    ];
}

function contactGenericResponse() {
    return ['message' => 'Danke, deine Nachricht wurde übermittelt. Wir melden uns bei Bedarf per E-Mail.'];
}

function normalizeContactPayload($data) {
    return [
        'name' => trim((string)($data['name'] ?? '')),
        'email' => strtolower(trim((string)($data['email'] ?? ''))),
        'message' => trim((string)($data['message'] ?? '')),
        'website' => trim((string)($data['website'] ?? '')),
        'form_started_at' => $data['form_started_at'] ?? null,
    ];
}

function contactTextLength($value) {
    return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
}

function validateContactPayload($payload) {
    if (contactTextLength($payload['name']) < 2) {
        return ['field' => 'name', 'message' => 'Bitte gib deinen Namen an.'];
    }
    if (contactTextLength($payload['name']) > 120) {
        return ['field' => 'name', 'message' => 'Der Name ist zu lang.'];
    }
    if (!filter_var($payload['email'], FILTER_VALIDATE_EMAIL) || contactTextLength($payload['email']) > 254) {
        return ['field' => 'email', 'message' => 'Bitte gib eine gültige E-Mail-Adresse an.'];
    }
    if (contactTextLength($payload['message']) < 20) {
        return ['field' => 'message', 'message' => 'Bitte schreibe eine etwas ausführlichere Nachricht.'];
    }
    if (contactTextLength($payload['message']) > 4000) {
        return ['field' => 'message', 'message' => 'Die Nachricht ist zu lang.'];
    }

    return null;
}

function clientIpAddress($server) {
    $candidates = [];
    if (!empty($server['HTTP_CF_CONNECTING_IP'])) {
        $candidates[] = $server['HTTP_CF_CONNECTING_IP'];
    }
    if (!empty($server['HTTP_X_FORWARDED_FOR'])) {
        $parts = explode(',', $server['HTTP_X_FORWARDED_FOR']);
        $candidates[] = trim($parts[0]);
    }
    if (!empty($server['REMOTE_ADDR'])) {
        $candidates[] = $server['REMOTE_ADDR'];
    }

    foreach ($candidates as $candidate) {
        if (filter_var($candidate, FILTER_VALIDATE_IP)) {
            return $candidate;
        }
    }

    return '0.0.0.0';
}

function contactMetadata($payload, $server, $config) {
    $emailParts = explode('@', $payload['email']);
    $userAgent = substr((string)($server['HTTP_USER_AGENT'] ?? ''), 0, 255);

    return [
        'request_id' => bin2hex(random_bytes(12)),
        'ip_hash' => hash('sha256', clientIpAddress($server) . '|' . $config['log_salt']),
        'user_agent' => $userAgent,
        'email_domain' => count($emailParts) === 2 ? substr($emailParts[1], 0, 255) : null,
        'message_length' => contactTextLength($payload['message']),
    ];
}

function logContactEvent($db, $metadata, $action, $reason = null) {
    try {
        $stmt = $db->prepare('INSERT INTO contact_events (request_id, action, reason, ip_hash, user_agent, email_domain, message_length) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $metadata['request_id'],
            $action,
            $reason,
            $metadata['ip_hash'],
            $metadata['user_agent'],
            $metadata['email_domain'],
            $metadata['message_length'],
        ]);
    } catch (PDOException $e) {
        logError('Contact event logging failed: ' . $e->getMessage());
    }
}

function countRecentContactEvents($db, $ipHash, $windowSeconds) {
    $since = date('Y-m-d H:i:s', time() - $windowSeconds);
    $stmt = $db->prepare('SELECT COUNT(*) FROM contact_events WHERE ip_hash = ? AND created_at >= ?');
    $stmt->execute([$ipHash, $since]);
    return (int)$stmt->fetchColumn();
}

function contactAbuseReason($payload, $config, $now = null) {
    if ($payload['website'] !== '') {
        return 'honeypot';
    }

    $startedAt = $payload['form_started_at'];
    if (!is_numeric($startedAt)) {
        return 'missing_timer';
    }

    $startedAt = (float)$startedAt;
    if ($startedAt > 1000000000000) {
        $startedAt = $startedAt / 1000;
    }

    $now = $now ?? time();
    if (($now - $startedAt) < $config['min_seconds']) {
        return 'too_fast';
    }

    $linkCount = preg_match_all('/https?:\/\/|www\.|<a\s/i', $payload['message']);
    if ($linkCount > 3) {
        return 'too_many_links';
    }

    return null;
}

function contactMailHtml($payload, $requestId) {
    $safeName = htmlspecialchars($payload['name'], ENT_QUOTES, 'UTF-8');
    $safeEmail = htmlspecialchars($payload['email'], ENT_QUOTES, 'UTF-8');
    $safeMessage = nl2br(htmlspecialchars($payload['message'], ENT_QUOTES, 'UTF-8'));
    $safeRequestId = htmlspecialchars($requestId, ENT_QUOTES, 'UTF-8');

    return "<!doctype html><html lang=\"de\"><head><meta charset=\"UTF-8\"><title>Kontaktanfrage</title></head>"
        . "<body style=\"font-family:Arial,sans-serif;line-height:1.5;color:#2e2e2e\">"
        . "<h1>Kontaktanfrage</h1>"
        . "<p><strong>Name:</strong> $safeName<br><strong>E-Mail:</strong> $safeEmail<br><strong>Request-ID:</strong> $safeRequestId</p>"
        . "<p><strong>Nachricht:</strong></p><p>$safeMessage</p>"
        . "</body></html>";
}

function processContactSubmission($db, $configSource, $data, $server, $mailer = null) {
    $config = contactConfig($configSource);
    $payload = normalizeContactPayload(is_array($data) ? $data : []);
    $metadata = contactMetadata($payload, $server, $config);
    $abuseReason = contactAbuseReason($payload, $config);

    if ($abuseReason) {
        logContactEvent($db, $metadata, 'blocked', $abuseReason);
        return ['status' => 200, 'body' => contactGenericResponse()];
    }

    $validationError = validateContactPayload($payload);
    if ($validationError) {
        logContactEvent($db, $metadata, 'rejected_validation', $validationError['field']);
        return ['status' => 400, 'body' => ['error' => $validationError['message']]];
    }

    if (countRecentContactEvents($db, $metadata['ip_hash'], $config['rate_limit_window_seconds']) >= $config['rate_limit_max']) {
        logContactEvent($db, $metadata, 'blocked', 'rate_limit');
        return ['status' => 200, 'body' => contactGenericResponse()];
    }

    logContactEvent($db, $metadata, 'accepted', null);

    $subject = trim($config['subject_prefix'] . ' Kontaktanfrage von ' . $payload['name']);
    $html = contactMailHtml($payload, $metadata['request_id']);
    if ($mailer) {
        $mailer($config['to'], $subject, $html);
    } else {
        sendHtmlMail($config['to'], $subject, $html);
    }

    return ['status' => 200, 'body' => contactGenericResponse()];
}

function userPayload($user) {
    return [
        'id' => (int)$user['id'],
        'email' => $user['email'] ?? $user['username'],
        'username' => $user['username'],
        'role' => normalizeRole($user['role']),
        'display_name' => $user['display_name'] ?? ($user['club_name'] ?? $user['username']),
        'club_name' => $user['club_name'] ?? '',
        'contact_info' => $user['contact_info'] ?? '',
    ];
}

if (defined("TESTING") && TESTING) { return; }

// Router
if (defined('PHPUNIT_RUNNING') && PHPUNIT_RUNNING) {
    return;
}
$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Built-in server static file serving
if (php_sapi_name() === 'cli-server' && is_file(__DIR__ . $requestUri)) {
    return false;
}

$requestMethod = $_SERVER['REQUEST_METHOD'];

function getAuthorizationHeader() {
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        return $_SERVER['HTTP_AUTHORIZATION'];
    }

    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        return $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }

    $headers = apache_request_headers();
    foreach ($headers as $key => $value) {
        if (strtolower($key) === 'authorization') {
            return $value;
        }
    }

    return '';
}

// Auth token validation
function authenticateUser($db) {
    $authHeader = getAuthorizationHeader();

    if (preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        $token = $matches[1];
        $now = date('Y-m-d H:i:s');

        $stmt = $db->prepare('SELECT u.* FROM users u JOIN sessions s ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?');
        $stmt->execute([$token, $now]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
            return $user;
        }
    }
    return null;
}

function getCampForUser($db, $campId, $user) {
    $checkStmt = $db->prepare('SELECT * FROM camps WHERE id = ?');
    $checkStmt->execute([$campId]);
    $camp = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$camp || ((int)$camp['club_id'] !== (int)$user['id'] && !isAdminRole($user))) {
        return null;
    }

    return $camp;
}

function saveUploadedCampImages($db, $campId) {
    if (!isset($_FILES['images'])) {
        return [];
    }

    $stmtImg = $db->prepare('INSERT INTO camp_images (camp_id, image_url) VALUES (?, ?)');
    $files = $_FILES['images'];
    $allowedMimeTypes = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    $savedImages = [];

    for ($i = 0; $i < count($files['name']); $i++) {
        if ($files['error'][$i] !== UPLOAD_ERR_OK) {
            continue;
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $files['tmp_name'][$i]);
        finfo_close($finfo);

        if (!array_key_exists($mimeType, $allowedMimeTypes)) {
            continue;
        }

        $ext = $allowedMimeTypes[$mimeType];
        $filename = bin2hex(random_bytes(16)) . '.' . $ext;

        $uploadDir = __DIR__ . '/uploads';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $destination = $uploadDir . '/' . $filename;
        if (move_uploaded_file($files['tmp_name'][$i], $destination)) {
            $imageUrl = '/uploads/' . $filename;
            $stmtImg->execute([$campId, $imageUrl]);
            $savedImages[] = $imageUrl;
        }
    }

    return $savedImages;
}

function saveCampCategories($db, $campId, $categories) {
    if (!is_array($categories)) {
        if (is_string($categories)) {
            $categories = array_filter(array_map('trim', explode(',', $categories)));
        } else {
            $categories = [];
        }
    }

    $db->prepare('DELETE FROM camp_categories WHERE camp_id = ?')->execute([$campId]);
    $stmt = $db->prepare('INSERT INTO camp_categories (camp_id, category) VALUES (?, ?)');
    foreach ($categories as $cat) {
        if (trim($cat) !== '') {
            $stmt->execute([$campId, trim($cat)]);
        }
    }
}

function validateCampDates($data) {
    $startsAt = !empty($data['starts_at']) ? strtotime($data['starts_at']) : null;
    $endsAt = !empty($data['ends_at']) ? strtotime($data['ends_at']) : null;
    $registrationDeadline = !empty($data['registration_deadline']) ? strtotime($data['registration_deadline']) : null;

    if ($startsAt && $endsAt && $endsAt <= $startsAt) {
        return 'Das Ende der Freizeit muss nach dem Beginn liegen.';
    }

    if ($registrationDeadline && $startsAt && $registrationDeadline >= $startsAt) {
        return 'Der Anmeldeschluss muss vor dem Beginn der Freizeit liegen.';
    }

    return null;
}

try {
    if ($requestUri === '/api/login' && $requestMethod === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        $username = trim($data['username'] ?? '');
        $password = $data['password'] ?? '';

        $stmt = $db->prepare('SELECT * FROM users WHERE username = ? OR email = ?');
        $stmt->execute([$username, $username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user && (int)($user['is_active'] ?? 1) === 1 && !empty($user['password_hash']) && password_verify($password, $user['password_hash'])) {
            $token = bin2hex(random_bytes(32));
            $expiresAt = date('Y-m-d H:i:s', strtotime('+24 hours'));

            $stmt = $db->prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)');
            $stmt->execute([$user['id'], $token, $expiresAt]);

            jsonResponse(['token' => $token, 'user' => userPayload($user)]);
        } else {
            logError("Failed login attempt for username: $username");
            jsonResponse(['error' => 'Invalid credentials'], 401);
        }
    }
    elseif ($requestUri === '/api/contact' && $requestMethod === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $result = processContactSubmission($db, $localConfig, $data, $_SERVER);
        jsonResponse($result['body'], $result['status']);
    }
    elseif ($requestUri === '/api/password/request-reset' && $requestMethod === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $email = trim($data['email'] ?? '');

        if ($email !== '') {
            $stmt = $db->prepare('SELECT * FROM users WHERE email = ?');
            $stmt->execute([$email]);
            $targetUser = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($targetUser) {
                $token = createPasswordToken($db, $targetUser['id'], 'reset');
                $link = appBaseUrl() . '/passwort-setzen?token=' . urlencode($token) . '&purpose=reset';
                $html = passwordMailHtml(
                    'Passwort zurücksetzen',
                    $targetUser['display_name'] ?? $targetUser['username'],
                    $link,
                    'über diesen Link kannst du ein neues Passwort für dein Konto festlegen. Der Link ist zwei Stunden gültig.'
                );
                sendHtmlMail($targetUser['email'], 'Passwort zurücksetzen', $html);
            }
        }

        jsonResponse(['message' => 'Wenn ein Konto zu dieser E-Mail existiert, wurde eine Nachricht versendet.']);
    }
    elseif ($requestUri === '/api/password/set' && $requestMethod === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $token = $data['token'] ?? '';
        $password = $data['password'] ?? '';
        $purpose = $data['purpose'] ?? '';

        if (!in_array($purpose, ['invite', 'reset'], true) || strlen($password) < 8) {
            jsonResponse(['error' => 'Ungültige Anfrage oder Passwort zu kurz'], 400);
        }

        $tokenHash = hash('sha256', $token);
        $now = date('Y-m-d H:i:s');
        $stmt = $db->prepare('SELECT pt.*, u.id AS user_id FROM password_tokens pt JOIN users u ON u.id = pt.user_id WHERE pt.token_hash = ? AND pt.purpose = ? AND pt.used_at IS NULL AND pt.expires_at > ?');
        $stmt->execute([$tokenHash, $purpose, $now]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            jsonResponse(['error' => 'Der Link ist ungültig oder abgelaufen'], 400);
        }

        $passwordHash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $db->prepare('UPDATE users SET password_hash = ?, is_active = 1, updated_at = ? WHERE id = ?');
        $stmt->execute([$passwordHash, $now, $row['user_id']]);

        $stmt = $db->prepare('UPDATE password_tokens SET used_at = ? WHERE id = ?');
        $stmt->execute([$now, $row['id']]);

        jsonResponse(['message' => 'Passwort wurde gespeichert']);
    }
    elseif ($requestUri === '/api/logout' && $requestMethod === 'POST') {
        $authHeader = getAuthorizationHeader();

        if (preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
            $token = $matches[1];
            $stmt = $db->prepare('DELETE FROM sessions WHERE token = ?');
            $stmt->execute([$token]);
        }
        jsonResponse(['message' => 'Logged out']);
    }
    elseif ($requestUri === '/api/holidays' && $requestMethod === 'GET') {
        $stmt = $db->query('SELECT * FROM holidays ORDER BY starts_at ASC');
        jsonResponse($stmt->fetchAll(PDO::FETCH_ASSOC));
    }
    elseif ($requestUri === '/api/admin/holidays' && $requestMethod === 'POST') {
        $user = authenticateUser($db);
        if (!$user || !isAdminRole($user)) {
            jsonResponse(['error' => 'Unauthorized'], 401);
        }
        $data = json_decode(file_get_contents('php://input'), true);
        if (empty($data['name']) || empty($data['starts_at']) || empty($data['ends_at'])) {
            jsonResponse(['error' => 'Fehlende Felder'], 400);
        }
        $stmt = $db->prepare('INSERT INTO holidays (name, starts_at, ends_at) VALUES (?, ?, ?)');
        $stmt->execute([$data['name'], $data['starts_at'], $data['ends_at']]);
        jsonResponse(['success' => true, 'id' => $db->lastInsertId()]);
    }
    elseif (preg_match('/^\/api\/admin\/holidays\/(\d+)$/', $requestUri, $matches) && $requestMethod === 'DELETE') {
        $user = authenticateUser($db);
        if (!$user || !isAdminRole($user)) {
            jsonResponse(['error' => 'Unauthorized'], 401);
        }
        $holidayId = (int)$matches[1];
        $stmt = $db->prepare('DELETE FROM holidays WHERE id = ?');
        $stmt->execute([$holidayId]);
        jsonResponse(['success' => true]);
    }
    elseif (preg_match('/^\/api\/camps(\/(\d+))?$/', $requestUri, $matches) && in_array($requestMethod, ['POST', 'PUT', 'DELETE'])) {
        $user = authenticateUser($db);
        if (!$user) {
            jsonResponse(['error' => 'Unauthorized'], 401);
        }

        $campId = $matches[2] ?? null;

        if ($requestMethod === 'POST') {
            $data = $_POST;
            if (empty($data)) {
                $data = json_decode(file_get_contents('php://input'), true) ?? [];
            }

            $dateError = validateCampDates($data);
            if ($dateError) {
                jsonResponse(['error' => $dateError], 400);
            }

            $stmt = $db->prepare('INSERT INTO camps (club_id, title, min_age, max_age, description, location_text, location_lat, location_lng, type, starts_at, ends_at, price_eur, registration_deadline, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([
                $user['id'], $data['title'] ?? '', $data['min_age'] ?? null, $data['max_age'] ?? null, $data['description'] ?? '',
                $data['location_text'] ?? '', $data['location_lat'] ?? null, $data['location_lng'] ?? null, $data['type'] ?? '', $data['starts_at'] ?? null,
                $data['ends_at'] ?? null, $data['price_eur'] ?? null, $data['registration_deadline'] ?? null, $data['status'] ?? 'draft'
            ]);
            $newCampId = $db->lastInsertId();

            saveUploadedCampImages($db, $newCampId);
            saveCampCategories($db, $newCampId, $data['categories'] ?? $data['type'] ?? []);

            jsonResponse(['message' => 'Camp created successfully', 'id' => $newCampId]);
        }
        elseif ($requestMethod === 'PUT' && $campId) {
            $data = json_decode(file_get_contents('php://input'), true) ?? [];

            if (!getCampForUser($db, $campId, $user)) {
                jsonResponse(['error' => 'Forbidden'], 403);
            }

            $dateError = validateCampDates($data);
            if ($dateError) {
                jsonResponse(['error' => $dateError], 400);
            }

            $stmt = $db->prepare('UPDATE camps SET title = ?, min_age = ?, max_age = ?, description = ?, location_text = ?, location_lat = ?, location_lng = ?, type = ?, starts_at = ?, ends_at = ?, price_eur = ?, registration_deadline = ?, status = ? WHERE id = ?');
            $stmt->execute([
                $data['title'] ?? '', $data['min_age'] ?? null, $data['max_age'] ?? null, $data['description'] ?? '',
                $data['location_text'] ?? '', $data['location_lat'] ?? null, $data['location_lng'] ?? null, $data['type'] ?? '', $data['starts_at'] ?? null,
                $data['ends_at'] ?? null, $data['price_eur'] ?? null, $data['registration_deadline'] ?? null,
                $data['status'] ?? 'draft', $campId
            ]);

            saveCampCategories($db, $campId, $data['categories'] ?? $data['type'] ?? []);

            jsonResponse(['message' => 'Camp updated successfully']);
        }
        elseif ($requestMethod === 'DELETE' && $campId) {
            if (!getCampForUser($db, $campId, $user)) {
                jsonResponse(['error' => 'Forbidden'], 403);
            }

            $stmt = $db->prepare('DELETE FROM camps WHERE id = ?');
            $stmt->execute([$campId]);
            jsonResponse(['message' => 'Camp deleted successfully']);
        }
    }
    elseif (preg_match('/^\/api\/camps\/(\d+)\/images$/', $requestUri, $matches) && $requestMethod === 'POST') {
        $user = authenticateUser($db);
        if (!$user) {
            jsonResponse(['error' => 'Unauthorized'], 401);
        }

        $campId = $matches[1];
        if (!getCampForUser($db, $campId, $user)) {
            jsonResponse(['error' => 'Forbidden'], 403);
        }

        $savedImages = saveUploadedCampImages($db, $campId);
        jsonResponse(['message' => 'Images uploaded successfully', 'images' => $savedImages]);
    }
    elseif (preg_match('/^\/api\/camps\/(\d+)\/images$/', $requestUri, $matches) && $requestMethod === 'DELETE') {
        $user = authenticateUser($db);
        if (!$user) {
            jsonResponse(['error' => 'Unauthorized'], 401);
        }

        $campId = $matches[1];
        if (!getCampForUser($db, $campId, $user)) {
            jsonResponse(['error' => 'Forbidden'], 403);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $imageUrl = $data['image_url'] ?? '';

        if (!$imageUrl) {
            jsonResponse(['error' => 'image_url is required'], 400);
        }

        $stmt = $db->prepare('SELECT image_url FROM camp_images WHERE camp_id = ? AND image_url = ?');
        $stmt->execute([$campId, $imageUrl]);
        $image = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$image) {
            jsonResponse(['error' => 'Image not found'], 404);
        }

        $deleteStmt = $db->prepare('DELETE FROM camp_images WHERE camp_id = ? AND image_url = ?');
        $deleteStmt->execute([$campId, $imageUrl]);

        if (str_starts_with($imageUrl, '/uploads/')) {
            $filePath = realpath(__DIR__ . $imageUrl);
            $uploadDir = realpath(__DIR__ . '/uploads');
            if ($filePath && $uploadDir && str_starts_with($filePath, $uploadDir) && is_file($filePath)) {
                unlink($filePath);
            }
        }

        jsonResponse(['message' => 'Image deleted successfully']);
    }
    elseif ($requestUri === '/api/me' && $requestMethod === 'GET') {
        $user = authenticateUser($db);
        if (!$user) {
            jsonResponse(['error' => 'Unauthorized'], 401);
        }

        jsonResponse(userPayload($user));
    }
    elseif ($requestUri === '/api/me' && $requestMethod === 'PUT') {
        $user = authenticateUser($db);
        if (!$user) {
            jsonResponse(['error' => 'Unauthorized'], 401);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $displayName = trim($data['display_name'] ?? '');
        $contactInfo = trim($data['contact_info'] ?? '');

        if ($displayName === '') {
            jsonResponse(['error' => 'Name ist erforderlich'], 400);
        }

        $stmt = $db->prepare('UPDATE users SET display_name = ?, club_name = ?, contact_info = ?, updated_at = ? WHERE id = ?');
        $stmt->execute([$displayName, $displayName, $contactInfo, date('Y-m-d H:i:s'), $user['id']]);

        $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$user['id']]);
        jsonResponse(userPayload($stmt->fetch(PDO::FETCH_ASSOC)));
    }
    elseif ($requestUri === '/api/admin/users' && $requestMethod === 'POST') {
        $user = authenticateUser($db);
        if (!$user || !isAdminRole($user)) {
            jsonResponse(['error' => 'Forbidden'], 403);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $email = strtolower(trim($data['email'] ?? ''));
        $displayName = trim($data['display_name'] ?? ($data['club_name'] ?? ''));
        $role = normalizeRole($data['role'] ?? 'user');
        $contactInfo = trim($data['contact_info'] ?? '');

        if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL) || !$displayName) {
            jsonResponse(['error' => 'E-Mail und Name sind erforderlich'], 400);
        }

        if (!in_array($role, ['admin', 'user'], true) || ($role === 'admin' && !isMasterAdmin($user))) {
            jsonResponse(['error' => 'Diese Rolle darf nicht vergeben werden'], 403);
        }

        $username = $email;

        try {
            $stmt = $db->prepare('INSERT INTO users (email, username, password_hash, role, display_name, club_name, contact_info, is_active) VALUES (?, ?, NULL, ?, ?, ?, ?, 0)');
            $stmt->execute([$email, $username, $role, $displayName, $displayName, $contactInfo]);
            $newUserId = $db->lastInsertId();
            $token = createPasswordToken($db, $newUserId, 'invite');
            $link = appBaseUrl() . '/passwort-setzen?token=' . urlencode($token) . '&purpose=invite';
            $html = passwordMailHtml(
                'Einladung zum Ferienfreizeitportal',
                $displayName,
                $link,
                'du wurdest für das Ferienfreizeitportal eingeladen. Über diesen Link legst du dein Passwort fest und aktivierst dein Konto. Der Link ist sieben Tage gültig.'
            );
            sendHtmlMail($email, 'Einladung zum Ferienfreizeitportal', $html);

            jsonResponse(['message' => 'Nutzer wurde eingeladen', 'id' => $newUserId]);
        } catch (PDOException $e) {
            if ($e->getCode() == 23000) { // Integrity constraint violation (UNIQUE constraint)
                jsonResponse(['error' => 'E-Mail ist bereits vergeben'], 400);
            }
            throw $e;
        }
    }
    elseif ($requestUri === '/api/admin/users' && $requestMethod === 'GET') {
        $user = authenticateUser($db);
        if (!$user || !isAdminRole($user)) {
            jsonResponse(['error' => 'Forbidden'], 403);
        }

        $query = 'SELECT id, email, username, role, display_name, club_name, contact_info, is_active FROM users';
        $params = [];
        if (!isMasterAdmin($user)) {
            $query .= " WHERE role = 'user'";
        }
        $query .= ' ORDER BY display_name ASC';
        $stmt = $db->prepare($query);
        $stmt->execute($params);
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($users as &$listedUser) {
            $listedUser['role'] = normalizeRole($listedUser['role']);
            $countStmt = $db->prepare('SELECT COUNT(*) FROM camps WHERE club_id = ?');
            $countStmt->execute([$listedUser['id']]);
            $listedUser['camp_count'] = (int)$countStmt->fetchColumn();
        }

        jsonResponse($users);
    }
    elseif (preg_match('/^\/api\/admin\/users\/(\d+)$/', $requestUri, $matches) && in_array($requestMethod, ['PUT', 'DELETE'])) {
        $user = authenticateUser($db);
        if (!$user || !isAdminRole($user)) {
            jsonResponse(['error' => 'Forbidden'], 403);
        }

        $targetId = (int)$matches[1];
        if ($targetId === (int)$user['id']) {
            jsonResponse(['error' => 'Das eigene Konto kann hier nicht geändert werden'], 400);
        }

        $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$targetId]);
        $targetUser = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$targetUser) {
            jsonResponse(['error' => 'Nutzer nicht gefunden'], 404);
        }
        if (!isMasterAdmin($user) && normalizeRole($targetUser['role']) !== 'user') {
            jsonResponse(['error' => 'Admins dürfen nur Nutzer verwalten'], 403);
        }

        if ($requestMethod === 'DELETE') {
            $data = json_decode(file_get_contents('php://input'), true) ?? [];
            $confirmation = strtolower(trim($data['confirm'] ?? ''));
            $expectedEmail = strtolower(trim($targetUser['email'] ?? ''));
            $expectedName = strtolower(trim($targetUser['display_name'] ?? ''));

            if ($confirmation === '' || ($confirmation !== $expectedEmail && $confirmation !== $expectedName)) {
                jsonResponse(['error' => 'Zum Löschen muss die E-Mail-Adresse oder der Name exakt bestätigt werden'], 400);
            }

            $stmt = $db->prepare('DELETE FROM users WHERE id = ?');
            $stmt->execute([$targetId]);
            jsonResponse(['message' => 'Nutzer gelöscht']);
        }

        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $displayName = trim($data['display_name'] ?? '');
        $contactInfo = trim($data['contact_info'] ?? '');
        $role = normalizeRole($data['role'] ?? $targetUser['role']);

        if ($displayName === '' || !in_array($role, ['admin', 'user'], true) || ($role === 'admin' && !isMasterAdmin($user))) {
            jsonResponse(['error' => 'Ungültige Nutzerdaten'], 400);
        }

        $stmt = $db->prepare('UPDATE users SET role = ?, display_name = ?, club_name = ?, contact_info = ?, updated_at = ? WHERE id = ?');
        $stmt->execute([$role, $displayName, $displayName, $contactInfo, date('Y-m-d H:i:s'), $targetId]);
        jsonResponse(['message' => 'Nutzer aktualisiert']);
    }
    elseif (preg_match('/^\/api\/camps\/(\d+)$/', $requestUri, $matches) && $requestMethod === 'GET') {
        $campId = $matches[1];
        $stmt = $db->prepare('SELECT c.*, u.club_name, u.contact_info, u.username FROM camps c JOIN users u ON c.club_id = u.id WHERE c.id = ?');
        $stmt->execute([$campId]);
        $camp = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$camp) {
            jsonResponse(['error' => 'Camp not found'], 404);
        }

        $stmtImg = $db->prepare('SELECT image_url FROM camp_images WHERE camp_id = ?');
        $stmtImg->execute([$camp['id']]);
        $camp['images'] = $stmtImg->fetchAll(PDO::FETCH_COLUMN);

        $stmtCat = $db->prepare('SELECT category FROM camp_categories WHERE camp_id = ?');
        $stmtCat->execute([$camp['id']]);
        $camp['categories'] = $stmtCat->fetchAll(PDO::FETCH_COLUMN);
        $camp['type'] = !empty($camp['categories']) ? $camp['categories'][0] : $camp['type'];

        jsonResponse($camp);
    }
    elseif ($requestUri === '/api/camps' && $requestMethod === 'GET') {
        $query = 'SELECT c.*, u.club_name, u.contact_info, u.username FROM camps c JOIN users u ON c.club_id = u.id';
        $params = [];
        $whereConditions = [];
        $currentUser = authenticateUser($db);

        if (isset($_GET['club_id'])) {
            $clubId = (int)$_GET['club_id'];
            $whereConditions[] = 'c.club_id = ?';
            $params[] = $clubId;
            if (!$currentUser || (!isAdminRole($currentUser) && (int)$currentUser['id'] !== $clubId)) {
                $whereConditions[] = 'c.status IN ("published", "fully_booked")';
            }
        } elseif (isset($_GET['all']) && $_GET['all'] == 1) {
            if (!$currentUser || !isAdminRole($currentUser)) {
                jsonResponse(['error' => 'Forbidden'], 403);
            }
        } else {
            $whereConditions[] = 'c.status IN ("published", "fully_booked")';
        }

        if (isset($_GET['age'])) {
            $age = (int)$_GET['age'];
            $whereConditions[] = '(c.min_age <= ? AND c.max_age >= ?)';
            $params[] = $age;
            $params[] = $age;
        }

        if (isset($_GET['types']) && is_string($_GET['types']) && trim($_GET['types']) !== '') {
            $types = explode(',', $_GET['types']);
            $types = array_filter(array_map('trim', $types));
            if (!empty($types)) {
                $placeholders = implode(',', array_fill(0, count($types), '?'));
                $whereConditions[] = "c.id IN (SELECT camp_id FROM camp_categories WHERE category IN ($placeholders))";
                foreach ($types as $t) $params[] = $t;
            }
        } elseif (isset($_GET['type']) && is_string($_GET['type']) && trim($_GET['type']) !== '') {
            $type = trim($_GET['type']);
            $whereConditions[] = "c.id IN (SELECT camp_id FROM camp_categories WHERE category = ?)";
            $params[] = $type;
        }

        if (isset($_GET['start_date']) && !empty($_GET['start_date'])) {
            $whereConditions[] = 'DATE(c.starts_at) >= DATE(?)';
            $params[] = $_GET['start_date'];
        }

        if (isset($_GET['end_date']) && !empty($_GET['end_date'])) {
            $whereConditions[] = 'DATE(c.ends_at) <= DATE(?)';
            $params[] = $_GET['end_date'];
        }

        if (isset($_GET['minLat']) && isset($_GET['maxLat']) && isset($_GET['minLng']) && isset($_GET['maxLng'])) {
            $whereConditions[] = '(c.location_lat BETWEEN ? AND ? AND c.location_lng BETWEEN ? AND ?)';
            $params[] = (float)$_GET['minLat'];
            $params[] = (float)$_GET['maxLat'];
            $params[] = (float)$_GET['minLng'];
            $params[] = (float)$_GET['maxLng'];
        }

        if (!empty($whereConditions)) {
            $query .= ' WHERE ' . implode(' AND ', $whereConditions);
        }

        $stmt = $db->prepare($query);
        $stmt->execute($params);
        $camps = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $campIds = array_column($camps, 'id');
        if (!empty($campIds)) {
            $chunks = array_chunk($campIds, 900);
            $imagesByCamp = [];
            $categoriesByCamp = [];

            foreach ($chunks as $chunk) {
                $inQuery = implode(',', array_fill(0, count($chunk), '?'));
                
                $stmtImg = $db->prepare("SELECT camp_id, image_url FROM camp_images WHERE camp_id IN ($inQuery)");
                $stmtImg->execute($chunk);
                foreach ($stmtImg->fetchAll(PDO::FETCH_ASSOC) as $img) {
                    $imagesByCamp[$img['camp_id']][] = $img['image_url'];
                }

                $stmtCat = $db->prepare("SELECT camp_id, category FROM camp_categories WHERE camp_id IN ($inQuery)");
                $stmtCat->execute($chunk);
                foreach ($stmtCat->fetchAll(PDO::FETCH_ASSOC) as $cat) {
                    $categoriesByCamp[$cat['camp_id']][] = $cat['category'];
                }
            }

            foreach ($camps as &$camp) {
                $camp['images'] = $imagesByCamp[$camp['id']] ?? [];
                $camp['categories'] = $categoriesByCamp[$camp['id']] ?? [];
                $camp['type'] = !empty($camp['categories']) ? $camp['categories'][0] : $camp['type'];
            }
            unset($camp);
        }

        jsonResponse($camps);
    }
    else {
        jsonResponse(['error' => 'Not Found'], 404);
    }
} catch (Exception $e) {
    logError($e->getMessage());
    jsonResponse(['error' => 'Internal Server Error'], 500);
}
