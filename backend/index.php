<?php
require_once __DIR__ . '/helpers.php';

$localConfigPath = __DIR__ . '/config.local.php';
$localConfig = is_file($localConfigPath) ? require $localConfigPath : [];
if (!is_array($localConfig)) {
    $localConfig = [];
}

require_once __DIR__ . '/utils.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/validation.php';
require_once __DIR__ . '/uploads.php';
date_default_timezone_set('Europe/Berlin');

// Unit tests import functions only, without touching the development database.
if ((defined('PHPUNIT_RUNNING') && PHPUNIT_RUNNING) || (defined('TESTING') && TESTING)) return;

enforceRequestSecurity();
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (php_sapi_name() === 'cli-server' && !str_starts_with($requestPath, '/api/')) {
    if (preg_match('~^/uploads/[a-f0-9.]+\.(jpg|png|webp)$~D', $requestPath) && is_file(uploadDirectory() . '/' . basename($requestPath))) {
        header('Content-Type: ' . (new finfo(FILEINFO_MIME_TYPE))->file(uploadDirectory() . '/' . basename($requestPath)));
        readfile(uploadDirectory() . '/' . basename($requestPath));
        exit;
    }
    jsonResponse(['error' => 'Nicht gefunden.'], 404);
}
if (isProduction() && (strlen((string)appConfig('APP_KEY', '')) < 32 || !str_starts_with((string)appConfig('APP_BASE_URL', ''), 'https://') || !appConfig('MAIL_FROM'))) {
    jsonResponse(['error' => 'Produktionskonfiguration unvollständig.'], 503);
}

// Database Connection
$dbConnection = configValue($localConfig, 'DB_CONNECTION', 'sqlite');
$dbHost = configValue($localConfig, 'DB_HOST', '127.0.0.1');
$dbName = configValue($localConfig, 'DB_NAME', 'westsachsen_camps');
$dbUser = configValue($localConfig, 'DB_USER', 'root');
$dbPass = configValue($localConfig, 'DB_PASSWORD', '');
if (!in_array($dbConnection, ['sqlite', 'mysql', 'pgsql'], true) || (isProduction() && $dbConnection === 'sqlite')) jsonResponse(['error' => 'Ungültige Datenbankkonfiguration.'], 503);

try {
    if ($dbConnection === 'pgsql') {
        $dsn = "pgsql:host=$dbHost;dbname=$dbName";
        $db = new PDO($dsn, $dbUser, $dbPass);
    } elseif ($dbConnection === 'mysql') {
        $dsn = "mysql:host=$dbHost;dbname=$dbName;charset=utf8mb4";
        $db = new PDO($dsn, $dbUser, $dbPass);
    } else {
        $db = new PDO('sqlite:' . appConfig('DB_SQLITE_PATH', __DIR__ . '/database.sqlite'));
    }
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    if ($dbConnection === 'sqlite') {
        $db->exec('PRAGMA foreign_keys=ON');
        $db->exec('PRAGMA busy_timeout=5000');
    }

    // Auto-ensure schema if tables don't exist
    $db->exec('CREATE TABLE IF NOT EXISTS app_migrations (version INTEGER PRIMARY KEY)');
    $needsSecurityMigration = !$db->query('SELECT 1 FROM app_migrations WHERE version = 1')->fetchColumn();
    if ($needsSecurityMigration) {
        $schema = file_get_contents(__DIR__ . '/schema.sql');
        if ($schema) {
            // Replace AUTOINCREMENT with serial/auto_increment based on driver if needed,
            // but we'll use a basic schema replacement for PG/MySQL compatibility.
            if ($dbConnection === 'pgsql') {
                $schema = str_replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'SERIAL PRIMARY KEY', $schema);
                $schema = str_replace('DATETIME', 'TIMESTAMP', $schema);
                $schema = str_replace('BOOLEAN', 'SMALLINT', $schema);
            } elseif ($dbConnection === 'mysql') {
                $schema = str_replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'INT AUTO_INCREMENT PRIMARY KEY', $schema);
            }
            $db->exec($schema);

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
            $db->exec('PRAGMA legacy_alter_table=ON');
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
            $db->exec('PRAGMA legacy_alter_table=OFF');
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
        $emailExpression = $dbConnection === 'mysql' ? 'CONCAT(username, ?)' : 'username || ?';
        $stmt = $db->prepare("UPDATE users SET email = $emailExpression WHERE email IS NULL OR email = ''");
        $stmt->execute(['@example.test']);
        $db->exec("UPDATE users SET display_name = COALESCE(club_name, username) WHERE display_name IS NULL OR display_name = ''");
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

if ($needsSecurityMigration) ensureUserSchema($db, $dbConnection);

function ensureDefaultUser($db, $email, $username, $password, $role, $displayName, $contactInfo = null) {
    $stmt = $db->prepare('SELECT * FROM users WHERE email = ? OR username = ?');
    $stmt->execute([$email, $username]);

    $existingUser = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($existingUser) {
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

function demoDateTime(DateTimeImmutable $date, int $hour, int $minute = 0): string {
    return $date->setTime($hour, $minute)->format('Y-m-d H:i:s');
}

function ensureDemoCamps($db) {
    $timezone = new DateTimeZone('Europe/Berlin');
    $today = new DateTimeImmutable('today', $timezone);

    $clubStmt = $db->prepare('SELECT id FROM users WHERE username = ?');
    $clubStmt->execute(['testverein']);
    $clubId = $clubStmt->fetchColumn();
    if (!$clubId) {
        return;
    }

    $demoCamps = [
        [
            'title' => 'Demo: Flötencamp – vergangen',
            'description' => '<p>Ein musikalisches Ferienangebot als Beispiel für eine vergangene Freizeit.</p>',
            'categories' => ['Kreativ', 'Natur'],
            'location' => 'Flötenstein',
            'latitude' => 50.7546,
            'longitude' => 12.7336,
            'starts_at' => demoDateTime($today->modify('-21 days'), 9),
            'ends_at' => demoDateTime($today->modify('-18 days'), 16),
            'price' => 129.00,
            'registration_deadline' => demoDateTime($today->modify('-28 days'), 18),
        ],
        [
            'title' => 'Demo: Sommercamp – läuft gerade',
            'description' => '<p>Sport, Spiele und gemeinsame Abenteuer – diese Freizeit läuft gerade.</p>',
            'categories' => ['Sport', 'Lager'],
            'location' => 'Lauenhain',
            'latitude' => 50.7977,
            'longitude' => 12.7104,
            'starts_at' => demoDateTime($today->modify('-1 day'), 9),
            'ends_at' => demoDateTime($today->modify('+1 day'), 16),
            'price' => 159.00,
            'registration_deadline' => demoDateTime($today->modify('-7 days'), 18),
        ],
        [
            'title' => 'Demo: Waldcamp – demnächst',
            'description' => '<p>Eine Woche draußen unterwegs: Natur entdecken, kreativ sein und neue Freundschaften schließen.</p>',
            'categories' => ['Natur', 'Bildung'],
            'location' => 'Werdau',
            'latitude' => 50.7360,
            'longitude' => 12.3760,
            'starts_at' => demoDateTime($today->modify('+35 days'), 9),
            'ends_at' => demoDateTime($today->modify('+38 days'), 16),
            'price' => 189.00,
            'registration_deadline' => demoDateTime($today->modify('+28 days'), 18),
        ],
    ];

    $findStmt = $db->prepare('SELECT id FROM camps WHERE club_id = ? AND title = ?');
    $insertStmt = $db->prepare('INSERT INTO camps (club_id, title, min_age, max_age, description, location_text, location_lat, location_lng, type, starts_at, ends_at, price_eur, registration_deadline, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $updateStmt = $db->prepare('UPDATE camps SET min_age = ?, max_age = ?, description = ?, location_text = ?, location_lat = ?, location_lng = ?, type = ?, starts_at = ?, ends_at = ?, price_eur = ?, registration_deadline = ?, status = ? WHERE id = ?');

    foreach ($demoCamps as $camp) {
        $findStmt->execute([$clubId, $camp['title']]);
        $campId = $findStmt->fetchColumn();
        $baseValues = [
            8, 16, $camp['description'], $camp['location'], $camp['latitude'], $camp['longitude'], $camp['categories'][0],
            $camp['starts_at'], $camp['ends_at'], $camp['price'], $camp['registration_deadline'], 'published',
        ];

        if ($campId) {
            $updateStmt->execute([...$baseValues, $campId]);
        } else {
            $insertStmt->execute([$clubId, $camp['title'], ...$baseValues]);
            $campId = $db->lastInsertId();
        }

        saveCampCategories($db, $campId, $camp['categories']);
    }
}

try {
    if (!isProduction() && filter_var(appConfig('SEED_DEMO_DATA', $dbConnection === 'sqlite'), FILTER_VALIDATE_BOOLEAN)) {
        ensureDefaultUser($db, 'admin@example.test', 'admin', 'admin', 'master_admin', 'Master-Admin');
        ensureDefaultUser($db, 'testverein@example.test', 'testverein', 'testverein', 'user', 'Testverein Westsachsen', 'testverein@example.test');
    }
    if (isProduction() && !(int)$db->query("SELECT COUNT(*) FROM users WHERE role = 'master_admin'")->fetchColumn()) {
        $bootstrapEmail = (string)appConfig('BOOTSTRAP_ADMIN_EMAIL', '');
        $bootstrapPassword = appConfig('BOOTSTRAP_ADMIN_PASSWORD', '');
        if (!filter_var($bootstrapEmail, FILTER_VALIDATE_EMAIL) || !passwordValid($bootstrapPassword) || strlen($bootstrapPassword) < 16) jsonResponse(['error' => 'Einmalige Admin-Einrichtung erforderlich.'], 503);
        ensureDefaultUser($db, $bootstrapEmail, $bootstrapEmail, $bootstrapPassword, 'master_admin', 'Administration');
    }
} catch (PDOException $e) {
    error_log("Default Seed Error: " . $e->getMessage());
}

// Central logging
function logError($message) {
    appLog($message);
}

function ensureHolidaysSchema($db, $dbConnection) {
    $dateType = $dbConnection === 'pgsql' ? 'TIMESTAMP' : 'DATETIME';
    $idType = $dbConnection === 'pgsql' ? 'SERIAL PRIMARY KEY' : ($dbConnection === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT');
    $db->exec("CREATE TABLE IF NOT EXISTS holidays (
        id $idType,
        name TEXT NOT NULL,
        starts_at $dateType NOT NULL,
        ends_at $dateType NOT NULL
    )");
}

function ensureCategoriesSchema($db, $dbConnection) {
    $idType = $dbConnection === 'pgsql' ? 'SERIAL PRIMARY KEY' : ($dbConnection === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT');
    $db->exec("CREATE TABLE IF NOT EXISTS camp_categories (
        id $idType,
        camp_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        FOREIGN KEY(camp_id) REFERENCES camps(id) ON DELETE CASCADE
    )");
}

if ($needsSecurityMigration) {
    ensureCategoriesSchema($db, $dbConnection);
    ensureHolidaysSchema($db, $dbConnection);
    ensureCampColumns($db, $dbConnection);
}

try {
    $seedDemoData = configValue($localConfig, 'SEED_DEMO_DATA', $dbConnection === 'sqlite' ? '1' : '0');
    if ($needsSecurityMigration && !isProduction() && filter_var($seedDemoData, FILTER_VALIDATE_BOOLEAN)) {
        ensureDefaultHolidays($db);
        ensureDemoCamps($db);
    }
} catch (PDOException $e) {
    error_log("Demo Seed Error: " . $e->getMessage());
}

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

if ($needsSecurityMigration) ensureContactEventsSchema($db, $dbConnection);

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
        'status' => "VARCHAR(20) DEFAULT 'draft'",
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

if ($needsSecurityMigration) {
    $db->exec('CREATE TABLE IF NOT EXISTS auth_limits (bucket_key VARCHAR(64) PRIMARY KEY, bucket BIGINT NOT NULL, attempts INTEGER NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS invitation_delivery (user_id INTEGER PRIMARY KEY, sent_at VARCHAR(19), delivery_status VARCHAR(16) NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)');
    $db->exec('DELETE FROM sessions');
    $rows = $db->query('SELECT id, description FROM camps')->fetchAll(PDO::FETCH_ASSOC);
    $updateDescription = $db->prepare('UPDATE camps SET description = ? WHERE id = ?');
    foreach ($rows as $row) $updateDescription->execute([sanitizeDescription($row['description'] ?? ''), $row['id']]);
    $db->exec('INSERT INTO app_migrations (version) VALUES (1)');
}

$needsPlaceRequestMigration = !$db->query('SELECT 1 FROM app_migrations WHERE version = 2')->fetchColumn();
if ($needsPlaceRequestMigration) {
    ensurePlaceRequestSchema($db, $dbConnection);
    $db->exec('INSERT INTO app_migrations (version) VALUES (2)');
}
purgeOldPlaceRequestEvents($db, placeRequestConfig($localConfig)['retention_days']);
if (!$db->query('SELECT 1 FROM app_migrations WHERE version = 3')->fetchColumn()) {
    ensureImageMetadataSchema($db, $dbConnection);
    $db->exec('INSERT INTO app_migrations (version) VALUES (3)');
}

// Helper: send JSON response
function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit();
}

function appBaseUrl() {
    return rtrim((string)appConfig('APP_BASE_URL', 'http://localhost:5173'), '/');
}

function apiBaseUrl() {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost:8000';
    return $scheme . '://' . $host;
}

function sendHtmlMail($to, $subject, $html, $replyTo = null) {
    $from = (string)appConfig('MAIL_FROM', 'noreply@ferienfreizeitportal.local');
    if (!filter_var($from, FILTER_VALIDATE_EMAIL) || !filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'From: ' . $from,
    ];
    if ($replyTo !== null) {
        if (!filter_var($replyTo, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', (string)$replyTo)) return false;
        $headers[] = 'Reply-To: ' . $replyTo;
    }

    $sent = false;
    if (function_exists('mail')) {
        $sent = @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $html, implode("\r\n", $headers));
    }

    if (!$sent) {
        logError('Mail delivery failed');
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
        'log_salt' => configValue($config, 'CONTACT_LOG_SALT', appConfig('APP_KEY', 'ferienfreizeitportal-contact-log')),
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
    $trusted = array_filter(array_map('trim', explode(',', (string)appConfig('TRUSTED_PROXIES', ''))));
    $isTrusted = in_array($server['REMOTE_ADDR'] ?? '', $trusted, true);
    if ($isTrusted && !empty($server['HTTP_CF_CONNECTING_IP'])) {
        $candidates[] = $server['HTTP_CF_CONNECTING_IP'];
    }
    if ($isTrusted && !empty($server['HTTP_X_FORWARDED_FOR'])) {
        $parts = array_reverse(array_map('trim', explode(',', $server['HTTP_X_FORWARDED_FOR'])));
        foreach ($parts as $part) if (!in_array($part, $trusted, true)) { $candidates[] = $part; break; }
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
        $stmt = $db->prepare('INSERT INTO contact_events (request_id, action, reason, ip_hash, user_agent, email_domain, message_length, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $metadata['request_id'],
            $action,
            $reason,
            $metadata['ip_hash'],
            $metadata['user_agent'],
            $metadata['email_domain'],
            $metadata['message_length'],
            date('Y-m-d H:i:s'),
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
        $sent = $mailer($config['to'], $subject, $html);
    } else {
        $sent = sendHtmlMail($config['to'], $subject, $html);
    }
    if ($sent === false) return ['status' => 503, 'body' => ['error' => 'Die Nachricht konnte gerade nicht versendet werden. Bitte versuche es später erneut.']];

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

$requestMethod = $_SERVER['REQUEST_METHOD'];

function getAuthorizationHeader() {
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        return $_SERVER['HTTP_AUTHORIZATION'];
    }

    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        return $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }

    $headers = function_exists('apache_request_headers') ? apache_request_headers() : [];
    foreach ($headers as $key => $value) {
        if (strtolower($key) === 'authorization') {
            return $value;
        }
    }

    return '';
}

// Auth token validation
function authenticateUser($db) {
    $token = requestSession();
    if ($token !== '') {
        $now = date('Y-m-d H:i:s');

        $stmt = $db->prepare('SELECT u.* FROM users u JOIN sessions s ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.is_active = 1');
        $stmt->execute([sessionHash($token), $now]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
            if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true) && !hash_equals(csrfToken($token), $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) jsonResponse(['error' => 'Deine Anmeldung hat sich geändert. Bitte erneut anmelden; deine Eingaben bleiben erhalten.', 'code' => 'csrf_mismatch'], 403);
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

function campLifecycleState(array $camp, ?DateTimeImmutable $now = null): string {
    $timezone = new DateTimeZone('Europe/Berlin');
    $now = $now ?? new DateTimeImmutable('now', $timezone);

    try {
        $endsAt = !empty($camp['ends_at']) ? new DateTimeImmutable(str_replace('T', ' ', $camp['ends_at']), $timezone) : null;
        $startsAt = !empty($camp['starts_at']) ? new DateTimeImmutable(str_replace('T', ' ', $camp['starts_at']), $timezone) : null;
    } catch (Exception $e) {
        return 'upcoming';
    }

    if ($endsAt && $endsAt < $now) {
        return 'past';
    }

    if ($startsAt && $startsAt <= $now) {
        return 'ongoing';
    }

    return 'upcoming';
}

function campWithLifecycle(array $camp, ?DateTimeImmutable $now = null): array {
    $camp['description'] = sanitizeDescription($camp['description'] ?? '');
    foreach (['id', 'club_id', 'min_age', 'max_age', 'capacity_total', 'places_remaining'] as $key) if (isset($camp[$key])) $camp[$key] = (int)$camp[$key];
    foreach (['location_lat', 'location_lng', 'price_eur'] as $key) if (isset($camp[$key])) $camp[$key] = (float)$camp[$key];
    foreach (['place_requests_enabled', 'waitlist_enabled'] as $key) if (isset($camp[$key])) $camp[$key] = (bool)$camp[$key];
    $camp['lifecycle_state'] = campLifecycleState($camp, $now);
    $camp['availability_state'] = placeRequestState($camp, $now);
    return $camp;
}

function campWithRelations($db, array $camp, ?DateTimeImmutable $now = null): array {
    $camp['image_metadata'] = campImageMetadata($db, $camp['id']);
    $camp['images'] = array_column($camp['image_metadata'], 'image_url');

    $stmtCat = $db->prepare('SELECT category FROM camp_categories WHERE camp_id = ?');
    $stmtCat->execute([$camp['id']]);
    $camp['categories'] = $stmtCat->fetchAll(PDO::FETCH_COLUMN);
    $camp['type'] = !empty($camp['categories']) ? $camp['categories'][0] : $camp['type'];

    return campWithLifecycle($camp, $now);
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
        $data = readJsonBody();
        $username = requireText($data, 'username', 254);
        $password = $data['password'] ?? '';
        authRateLimit($db, 'login', $username);
        if (!is_string($password) || strlen($password) > 72) jsonResponse(['error' => 'Ungültige Zugangsdaten.'], 401);

        $stmt = $db->prepare('SELECT * FROM users WHERE username = ? OR email = ?');
        $stmt->execute([$username, $username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user && (int)($user['is_active'] ?? 1) === 1 && !empty($user['password_hash']) && password_verify($password, $user['password_hash'])) {
            $token = bin2hex(random_bytes(32));
            $expiresAt = date('Y-m-d H:i:s', strtotime('+24 hours'));

            $stmt = $db->prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)');
            $stmt->execute([$user['id'], sessionHash($token), $expiresAt]);
            if (requestSession()) $db->prepare('DELETE FROM sessions WHERE token = ?')->execute([sessionHash(requestSession())]);
            sessionCookie($token, strtotime($expiresAt));

            jsonResponse(['csrf_token' => csrfToken($token), 'user' => userPayload($user)]);
        } else {
            logError('Failed login');
            jsonResponse(['error' => 'Ungültige Zugangsdaten.'], 401);
        }
    }
    elseif ($requestUri === '/api/contact' && $requestMethod === 'POST') {
        $data = readJsonBody();
        $result = processContactSubmission($db, $localConfig, $data, $_SERVER);
        jsonResponse($result['body'], $result['status']);
    }
    elseif ($requestUri === '/api/password/request-reset' && $requestMethod === 'POST') {
        $data = readJsonBody();
        $email = strtolower(requireText($data, 'email', 254));
        authRateLimit($db, 'reset', $email, 5);

        if ($email !== '') {
            $stmt = $db->prepare('SELECT * FROM users WHERE email = ? AND is_active = 1');
            $stmt->execute([$email]);
            $targetUser = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($targetUser) {
                beginWrite($db);
                $token = createPasswordToken($db, $targetUser['id'], 'reset');
                $db->commit();
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
        $data = readJsonBody();
        $token = $data['token'] ?? '';
        $password = $data['password'] ?? '';
        $purpose = $data['purpose'] ?? '';

        if (!in_array($purpose, ['invite', 'reset'], true) || !passwordValid($password) || !is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token)) {
            jsonResponse(['error' => 'Ungültige Anfrage oder Passwort zu kurz'], 400);
        }

        $tokenHash = hash('sha256', $token);
        $now = date('Y-m-d H:i:s');
        beginWrite($db);
        $stmt = $db->prepare("SELECT pt.*, u.id AS user_id FROM password_tokens pt JOIN users u ON u.id = pt.user_id WHERE pt.token_hash = ? AND pt.purpose = ? AND pt.used_at IS NULL AND pt.expires_at > ? AND ((pt.purpose = 'reset' AND u.is_active = 1) OR (pt.purpose = 'invite' AND u.is_active = 0))");
        $stmt->execute([$tokenHash, $purpose, $now]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            jsonResponse(['error' => 'Der Link ist ungültig oder abgelaufen'], 400);
        }

        $passwordHash = password_hash($password, PASSWORD_BCRYPT);
        // Conditional claim makes the token single-use even under concurrent requests.
        $claim = $db->prepare('UPDATE password_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?');
        $claim->execute([$now, $row['id'], $now]);
        if ($claim->rowCount() !== 1) {
            $db->rollBack();
            jsonResponse(['error' => 'Der Link wurde bereits verwendet.'], 400);
        }
        $stmt = $db->prepare('UPDATE users SET password_hash = ?, is_active = 1, updated_at = ? WHERE id = ?');
        $stmt->execute([$passwordHash, $now, $row['user_id']]);

        $stmt = $db->prepare('DELETE FROM sessions WHERE user_id = ?');
        $stmt->execute([$row['user_id']]);

        $stmt = $db->prepare('UPDATE password_tokens SET used_at = ? WHERE id = ?');
        $stmt->execute([$now, $row['id']]);
        $db->prepare('UPDATE password_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL')->execute([$now, $row['user_id']]);
        $db->commit();
        sessionCookie(null);

        jsonResponse(['message' => 'Passwort wurde gespeichert']);
    }
    elseif ($requestUri === '/api/me/password' && $requestMethod === 'PUT') {
        $user = authenticateUser($db);
        if (!$user) {
            jsonResponse(['error' => 'Unauthorized'], 401);
        }

        $data = readJsonBody();
        $currentPassword = $data['current_password'] ?? '';
        $newPassword = $data['new_password'] ?? '';

        authRateLimit($db, 'password-change', (string)$user['id']);
        if (!is_string($currentPassword) || strlen($currentPassword) > 72 || !password_verify($currentPassword, $user['password_hash'] ?? '')) {
            jsonResponse(['error' => 'Das aktuelle Passwort ist nicht korrekt'], 400);
        }

        if (!passwordValid($newPassword)) {
            jsonResponse(['error' => 'Das neue Passwort muss mindestens 8 Zeichen lang sein'], 400);
        }

        $now = date('Y-m-d H:i:s');
        $passwordHash = password_hash($newPassword, PASSWORD_BCRYPT);
        beginWrite($db);
        $stmt = $db->prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?');
        $stmt->execute([$passwordHash, $now, $user['id']]);

        $stmt = $db->prepare('DELETE FROM sessions WHERE user_id = ?');
        $stmt->execute([$user['id']]);
        $db->prepare('UPDATE password_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL')->execute([$now, $user['id']]);
        $db->commit();
        sessionCookie(null);

        jsonResponse(['message' => 'Passwort wurde geändert. Bitte melde dich erneut an.']);
    }
    elseif ($requestUri === '/api/logout' && $requestMethod === 'POST') {
        authenticateUser($db);
        if (requestSession()) $db->prepare('DELETE FROM sessions WHERE token = ?')->execute([sessionHash(requestSession())]);
        sessionCookie(null);
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
        $data = readJsonBody();
        $name = requireText($data, 'name', 120);
        $start = requireText($data, 'starts_at', 10);
        $end = requireText($data, 'ends_at', 10);
        if (!$name || !normalizedDate($start . ' 00:00:00') || !normalizedDate($end . ' 23:59:59') || $end < $start) jsonResponse(['error' => 'Bitte Name und gültigen Ferienzeitraum angeben.'], 422);
        beginWrite($db);
        $overlap = $db->prepare('SELECT COUNT(*) FROM holidays WHERE name = ? OR (DATE(starts_at) <= ? AND DATE(ends_at) >= ?)');
        $overlap->execute([$name, $end, $start]);
        if ((int)$overlap->fetchColumn()) { $db->rollBack(); jsonResponse(['error' => 'Diese Ferien überschneiden sich mit einem bestehenden Eintrag oder der Name ist bereits vergeben.'], 409); }
        $stmt = $db->prepare('INSERT INTO holidays (name, starts_at, ends_at) VALUES (?, ?, ?)');
        $stmt->execute([$name, $start . ' 00:00:00', $end . ' 23:59:59']);
        $holidayId = (int)$db->lastInsertId();
        $db->commit();
        jsonResponse(['success' => true, 'id' => $holidayId]);
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
                $data = readJsonBody();
            }

            if (normalizeRole($user['role']) !== 'user') jsonResponse(['error' => 'Nur Vereine können eigene Freizeiten anlegen.'], 403);
            $data = requireValidCamp($data, $user);
            $validatedImages = validateUploadedImages($db);
            requireImageDescriptions($validatedImages, $data['status']);
            beginWrite($db);
            $createdPaths = [];

            $stmt = $db->prepare('INSERT INTO camps (club_id, title, min_age, max_age, description, location_text, location_lat, location_lng, type, starts_at, ends_at, price_eur, registration_deadline, status, place_requests_enabled, allocation_method, capacity_total, places_remaining, request_opens_at, waitlist_enabled, place_request_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([
                $user['id'], $data['title'] ?? '', $data['min_age'] ?? null, $data['max_age'] ?? null, $data['description'] ?? '',
                $data['location_text'] ?? '', $data['location_lat'] ?? null, $data['location_lng'] ?? null, $data['type'] ?? '', $data['starts_at'] ?? null,
                $data['ends_at'] ?? null, $data['price_eur'] ?? null, $data['registration_deadline'] ?? null, $data['status'] ?? 'draft',
                $data['place_requests_enabled'] ?? 0, $data['allocation_method'] ?? 'request', $data['capacity_total'] ?? null,
                $data['places_remaining'] ?? null, $data['request_opens_at'] ?? null, $data['waitlist_enabled'] ?? 0,
                $data['place_request_email'] ?? null
            ]);
            $newCampId = $db->lastInsertId();

            persistUploadedImages($db, $newCampId, $validatedImages, $createdPaths);
            saveCampCategories($db, $newCampId, $data['categories'] ?? $data['type'] ?? []);

            $db->commit();
            jsonResponse(['message' => 'Freizeit gespeichert.', 'id' => (int)$newCampId], 201);
        }
        elseif ($requestMethod === 'PUT' && $campId) {
            $data = readJsonBody();
            beginWrite($db);
            $existing = getCampForUser($db, $campId, $user);
            if (!$existing) jsonResponse(['error' => 'Nicht erlaubt.'], 403);
            $ownerStmt = $db->prepare('SELECT * FROM users WHERE id = ?');
            $ownerStmt->execute([$existing['club_id']]);
            $data = requireValidCamp($data, $ownerStmt->fetch(PDO::FETCH_ASSOC), $existing);
            requireImageDescriptions(campImageMetadata($db, $campId), $data['status']);
            $stmt = $db->prepare('UPDATE camps SET title = ?, min_age = ?, max_age = ?, description = ?, location_text = ?, location_lat = ?, location_lng = ?, type = ?, starts_at = ?, ends_at = ?, price_eur = ?, registration_deadline = ?, status = ?, place_requests_enabled = ?, allocation_method = ?, capacity_total = ?, places_remaining = ?, request_opens_at = ?, waitlist_enabled = ?, place_request_email = ? WHERE id = ?');
            $stmt->execute([
                $data['title'], $data['min_age'], $data['max_age'], $data['description'],
                $data['location_text'], $data['location_lat'], $data['location_lng'], $data['type'], $data['starts_at'],
                $data['ends_at'], $data['price_eur'], $data['registration_deadline'], $data['status'], $data['place_requests_enabled'],
                $data['allocation_method'], $data['capacity_total'], $data['places_remaining'], $data['request_opens_at'],
                $data['waitlist_enabled'], $data['place_request_email'], $campId
            ]);
            saveCampCategories($db, $campId, $data['categories']);
            $db->commit();
            jsonResponse(['message' => 'Freizeit gespeichert.']);
        }
        elseif ($requestMethod === 'DELETE' && $campId) {
            if (!getCampForUser($db, $campId, $user)) {
                jsonResponse(['error' => 'Forbidden'], 403);
            }

            beginWrite($db);
            $urls = deleteCampRecords($db, [$campId]);
            $db->commit();
            removeUnreferencedImages($db, $urls);
            jsonResponse(['message' => 'Camp deleted successfully']);
        }
    }
    elseif (preg_match('/^\/api\/camps\/(\d+)\/duplicate$/', $requestUri, $matches) && $requestMethod === 'POST') {
        $user = authenticateUser($db);
        if (!$user) {
            jsonResponse(['error' => 'Unauthorized'], 401);
        }

        beginWrite($db);
        $sourceCamp = getCampForUser($db, $matches[1], $user);
        if (!$sourceCamp) {
            jsonResponse(['error' => 'Forbidden'], 403);
        }

        if (campLifecycleState($sourceCamp) !== 'past') {
            jsonResponse(['error' => 'Nur vergangene Freizeiten können kopiert werden'], 400);
        }

        try {
            $copyTitle = trim((string)$sourceCamp['title']);
            $copyTitle = $copyTitle === '' ? 'Freizeit' : $copyTitle;
            $stmt = $db->prepare('INSERT INTO camps (club_id, title, min_age, max_age, description, location_text, location_lat, location_lng, type, starts_at, ends_at, price_eur, registration_deadline, status, place_requests_enabled, allocation_method, capacity_total, places_remaining, request_opens_at, waitlist_enabled, place_request_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([
                $sourceCamp['club_id'], $copyTitle . ' (Kopie)', $sourceCamp['min_age'], $sourceCamp['max_age'],
                $sourceCamp['description'], $sourceCamp['location_text'], $sourceCamp['location_lat'], $sourceCamp['location_lng'], $sourceCamp['type'],
                null, null, null, null, 'draft', 0, $sourceCamp['allocation_method'] ?? 'request',
                $sourceCamp['capacity_total'] ?? null, $sourceCamp['capacity_total'] ?? null, null,
                $sourceCamp['waitlist_enabled'] ?? 0, $sourceCamp['place_request_email'] ?? null
            ]);
            $newCampId = $db->lastInsertId();

            $copyCategories = $db->prepare('INSERT INTO camp_categories (camp_id, category) SELECT ?, category FROM camp_categories WHERE camp_id = ?');
            $copyCategories->execute([$newCampId, $sourceCamp['id']]);

            $copyImages = $db->prepare('INSERT INTO camp_images (camp_id, image_url, alt_text, is_decorative) SELECT ?, image_url, alt_text, is_decorative FROM camp_images WHERE camp_id = ?');
            $copyImages->execute([$newCampId, $sourceCamp['id']]);

            $db->commit();
        } catch (Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }

        $stmt = $db->prepare('SELECT c.*, u.club_name, u.contact_info, u.username FROM camps c JOIN users u ON c.club_id = u.id WHERE c.id = ?');
        $stmt->execute([$newCampId]);
        $copiedCamp = $stmt->fetch(PDO::FETCH_ASSOC);

        jsonResponse([
            'message' => 'Kopie als Entwurf angelegt',
            'camp' => campWithRelations($db, $copiedCamp),
        ], 201);
    }
    elseif (preg_match('/^\/api\/camps\/(\d+)\/availability$/', $requestUri, $matches) && $requestMethod === 'PUT') {
        $user = authenticateUser($db);
        if (!$user) jsonResponse(['error' => 'Unauthorized'], 401);
        $data = readJsonBody();
        $value = $data['places_remaining'] ?? null;
        if (!is_scalar($value) || is_bool($value) || !is_numeric($value) || (float)$value != (int)$value) {
            jsonResponse(['error' => 'Bitte gib eine gültige Anzahl freier Plätze an.', 'fields' => ['places_remaining' => 'Bitte gib eine ganze Zahl ein.']], 422);
        }

        beginWrite($db);
        $camp = getCampForUser($db, (int)$matches[1], $user);
        if (!$camp) jsonResponse(['error' => 'Nicht erlaubt.'], 403);
        if (placeRequestBool($camp['place_requests_enabled'] ?? false) !== true || $camp['capacity_total'] === null) {
            jsonResponse(['error' => 'Für diese Freizeit ist die Platzverwaltung nicht aktiviert.'], 422);
        }
        $remaining = (int)$value;
        if ($remaining < 0 || $remaining > (int)$camp['capacity_total']) {
            jsonResponse(['error' => 'Die freien Plätze müssen zwischen 0 und der Gesamtkapazität liegen.', 'fields' => ['places_remaining' => 'Wert außerhalb der Kapazität.']], 422);
        }
        $status = $camp['status'];
        if (($camp['allocation_method'] ?? 'request') === 'request' && in_array($status, ['published', 'fully_booked'], true)) {
            $status = $remaining === 0 ? 'fully_booked' : 'published';
        }
        $stmt = $db->prepare('UPDATE camps SET places_remaining = ?, status = ? WHERE id = ?');
        $stmt->execute([$remaining, $status, $camp['id']]);
        $db->commit();

        $stmt = $db->prepare('SELECT c.*, u.club_name, u.contact_info, u.username FROM camps c JOIN users u ON c.club_id = u.id WHERE c.id = ?');
        $stmt->execute([$camp['id']]);
        jsonResponse(['message' => 'Freie Plätze aktualisiert.', 'camp' => campWithRelations($db, $stmt->fetch(PDO::FETCH_ASSOC))]);
    }
    elseif (preg_match('/^\/api\/camps\/(\d+)\/place-requests$/', $requestUri, $matches) && $requestMethod === 'POST') {
        $stmt = $db->prepare('SELECT c.*, u.email AS owner_email, u.club_name, u.contact_info, u.is_active AS owner_active FROM camps c JOIN users u ON c.club_id = u.id WHERE c.id = ?');
        $stmt->execute([(int)$matches[1]]);
        $camp = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$camp || !campIsPublic($camp) || !(int)$camp['owner_active']) {
            jsonResponse(['error' => 'Freizeit nicht gefunden.'], 404);
        }
        $camp = campWithLifecycle($camp);
        $result = processPlaceRequestSubmission($db, $localConfig, $camp, readJsonBody(), $_SERVER);
        jsonResponse($result['body'], $result['status']);
    }
    elseif (preg_match('/^\/api\/camps\/(\d+)\/images\/(\d+)$/', $requestUri, $matches) && $requestMethod === 'PUT') {
        $user = authenticateUser($db);
        if (!$user) jsonResponse(['error' => 'Bitte anmelden.'], 401);
        beginWrite($db);
        $imageCamp = getCampForUser($db, $matches[1], $user);
        if (!$imageCamp) jsonResponse(['error' => 'Nicht erlaubt.'], 403);
        $image = $db->prepare('SELECT id FROM camp_images WHERE id = ? AND camp_id = ?');
        $image->execute([$matches[2], $matches[1]]);
        if (!$image->fetchColumn()) jsonResponse(['error' => 'Bild nicht gefunden.'], 404);
        try { $metadata = validateImageMetadata(readJsonBody()); }
        catch (InvalidArgumentException $e) { jsonResponse(['error' => $e->getMessage()], 422); }
        requireImageDescriptions([$metadata], $imageCamp['status']);
        $db->prepare('UPDATE camp_images SET alt_text = ?, is_decorative = ? WHERE id = ? AND camp_id = ?')
            ->execute([$metadata['alt_text'], $metadata['is_decorative'], $matches[2], $matches[1]]);
        $db->commit();
        jsonResponse(['message' => 'Bildbeschreibung gespeichert.']);
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

        beginWrite($db);
        $validatedImages = validateUploadedImages($db, $campId);
        requireImageDescriptions($validatedImages, getCampForUser($db, $campId, $user)['status']);
        $createdPaths = [];
        $savedImages = persistUploadedImages($db, $campId, $validatedImages, $createdPaths);
        $db->commit();
        jsonResponse(['message' => 'Bilder gespeichert.', 'images' => $savedImages, 'image_metadata' => campImageMetadata($db, $campId)]);
    }
    elseif (preg_match('/^\/api\/camps\/(\d+)\/images$/', $requestUri, $matches) && $requestMethod === 'DELETE') {
        $user = authenticateUser($db);
        if (!$user) {
            jsonResponse(['error' => 'Unauthorized'], 401);
        }

        beginWrite($db);
        $campId = $matches[1];
        if (!getCampForUser($db, $campId, $user)) {
            jsonResponse(['error' => 'Forbidden'], 403);
        }

        $data = readJsonBody();
        $imageUrl = requireText($data, 'image_url', 255);

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
        $db->commit();
        removeUnreferencedImages($db, [$imageUrl]);

        jsonResponse(['message' => 'Bild gelöscht.']);
    }
    elseif ($requestUri === '/api/me' && $requestMethod === 'GET') {
        $user = authenticateUser($db);
        if (!$user) {
            jsonResponse(['error' => 'Unauthorized'], 401);
        }

        jsonResponse([...userPayload($user), 'csrf_token' => csrfToken(requestSession())]);
    }
    elseif ($requestUri === '/api/me' && $requestMethod === 'PUT') {
        $user = authenticateUser($db);
        if (!$user) {
            jsonResponse(['error' => 'Unauthorized'], 401);
        }

        $data = readJsonBody();
        $displayName = requireText($data, 'display_name', 200);
        $contactInfo = requireText($data, 'contact_info', 2000);

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
        if (!$user) jsonResponse(['error' => 'Bitte melde dich erneut an.'], 401);
        if (!isAdminRole($user)) jsonResponse(['error' => 'Nicht erlaubt.'], 403);

        $data = readJsonBody();
        $email = strtolower(requireText($data, 'email', 254));
        $displayName = requireText($data, 'display_name', 200);
        $role = normalizeRole($data['role'] ?? 'user');
        $contactInfo = requireText($data, 'contact_info', 2000);

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
            $sent = sendInvitation($db, ['id' => $newUserId, 'email' => $email, 'display_name' => $displayName]);
            jsonResponse(['message' => $sent ? 'Einladung versendet.' : 'Konto angelegt, E-Mail-Versand fehlgeschlagen. Bitte die Einladung erneut senden.', 'delivery_status' => $sent ? 'sent' : 'failed', 'id' => (int)$newUserId], 201);
        } catch (PDOException $e) {
            if (in_array((string)$e->getCode(), ['23000', '23505'], true)) { // Integrity constraint violation (UNIQUE constraint)
                jsonResponse(['error' => 'E-Mail ist bereits vergeben'], 400);
            }
            throw $e;
        }
    }
    elseif (preg_match('~^/api/admin/users/(\\d+)/resend-invite$~', $requestUri, $matches) && $requestMethod === 'POST') {
        $user = authenticateUser($db);
        if (!$user) jsonResponse(['error' => 'Bitte anmelden.'], 401);
        if (!isAdminRole($user)) jsonResponse(['error' => 'Nicht erlaubt.'], 403);
        $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$matches[1]]);
        $target = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$target || (!isMasterAdmin($user) && $target['role'] !== 'user')) jsonResponse(['error' => 'Nicht erlaubt.'], 403);
        if ((int)$target['is_active']) jsonResponse(['error' => 'Dieses Konto ist bereits aktiviert.'], 422);
        authRateLimit($db, 'invite', (string)$target['id'], 3);
        $sent = sendInvitation($db, $target);
        jsonResponse(['message' => $sent ? 'Einladung erneut versendet.' : 'Versand fehlgeschlagen. Bitte die Mailkonfiguration prüfen.', 'delivery_status' => $sent ? 'sent' : 'failed'], $sent ? 200 : 503);
    }
    elseif ($requestUri === '/api/admin/users' && $requestMethod === 'GET') {
        $user = authenticateUser($db);
        if (!$user) jsonResponse(['error' => 'Bitte melde dich erneut an.'], 401);
        if (!isAdminRole($user)) jsonResponse(['error' => 'Nicht erlaubt.'], 403);

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
            $listedUser['id'] = (int)$listedUser['id'];
            $listedUser['is_active'] = (int)$listedUser['is_active'];
            $delivery = $db->prepare('SELECT sent_at, delivery_status FROM invitation_delivery WHERE user_id = ?');
            $delivery->execute([$listedUser['id']]);
            $listedUser += $delivery->fetch(PDO::FETCH_ASSOC) ?: ['delivery_status' => null, 'sent_at' => null];
            $countStmt = $db->prepare('SELECT COUNT(*) FROM camps WHERE club_id = ?');
            $countStmt->execute([$listedUser['id']]);
            $listedUser['camp_count'] = (int)$countStmt->fetchColumn();
        }

        jsonResponse($users);
    }
    elseif (preg_match('/^\/api\/admin\/users\/(\d+)$/', $requestUri, $matches) && in_array($requestMethod, ['PUT', 'DELETE'])) {
        $user = authenticateUser($db);
        if (!$user) jsonResponse(['error' => 'Bitte melde dich erneut an.'], 401);
        if (!isAdminRole($user)) jsonResponse(['error' => 'Nicht erlaubt.'], 403);

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
            $data = readJsonBody();
            $confirmation = strtolower(requireText($data, 'confirm', 254));
            $expectedEmail = strtolower(trim($targetUser['email'] ?? ''));
            $expectedName = strtolower(trim($targetUser['display_name'] ?? ''));

            if ($confirmation === '' || ($confirmation !== $expectedEmail && $confirmation !== $expectedName)) {
                jsonResponse(['error' => 'Zum Löschen muss die E-Mail-Adresse oder der Name exakt bestätigt werden'], 400);
            }

            if ($targetUser['role'] === 'master_admin') jsonResponse(['error' => 'Master-Administratoren können hier nicht gelöscht werden.'], 403);
            beginWrite($db);
            $campStmt = $db->prepare('SELECT id FROM camps WHERE club_id = ?');
            $campStmt->execute([$targetId]);
            $urls = deleteCampRecords($db, $campStmt->fetchAll(PDO::FETCH_COLUMN));
            foreach (['sessions', 'password_tokens', 'invitation_delivery'] as $table) $db->prepare("DELETE FROM $table WHERE user_id = ?")->execute([$targetId]);
            $stmt = $db->prepare('DELETE FROM users WHERE id = ?');
            $stmt->execute([$targetId]);
            $db->commit();
            removeUnreferencedImages($db, $urls);
            jsonResponse(['message' => 'Nutzer gelöscht']);
        }

        $data = readJsonBody();
        $displayName = requireText($data, 'display_name', 200);
        $contactInfo = requireText($data, 'contact_info', 2000);
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
        $stmt = $db->prepare('SELECT c.*, u.club_name, u.contact_info, u.username, u.is_active AS owner_active FROM camps c JOIN users u ON c.club_id = u.id WHERE c.id = ?');
        $stmt->execute([$campId]);
        $camp = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$camp) {
            jsonResponse(['error' => 'Camp not found'], 404);
        }

        $viewer = authenticateUser($db);
        $canManage = $viewer && (isAdminRole($viewer) || (int)$viewer['id'] === (int)$camp['club_id']);
        if ((!campIsPublic($camp) || !(int)$camp['owner_active']) && !$canManage) jsonResponse(['error' => 'Freizeit nicht gefunden.'], 404);
        $result = campWithRelations($db, $camp);
        jsonResponse($canManage ? $result : publicCampPayload($result));
    }
    elseif ($requestUri === '/api/camps' && $requestMethod === 'GET') {
        $query = 'SELECT c.*, u.club_name, u.contact_info, u.username FROM camps c JOIN users u ON c.club_id = u.id';
        $params = [];
        $whereConditions = [];
        $currentUser = authenticateUser($db);
        foreach ($_GET as $value) if (!is_string($value) || strlen($value) > 1000) jsonResponse(['error' => 'Ungültiger Suchfilter.'], 400);
        if ((isset($_GET['manage']) || isset($_GET['all'])) && !$currentUser) jsonResponse(['error' => 'Bitte melde dich erneut an.'], 401);
        $internalView = $currentUser && ((isset($_GET['all']) && $_GET['all'] === '1' && isAdminRole($currentUser)) || (isset($_GET['club_id']) && ((int)$_GET['club_id'] === (int)$currentUser['id'] || isAdminRole($currentUser))));
        if (!$internalView) $whereConditions[] = 'u.is_active = 1';

        if (isset($_GET['club_id'])) {
            $clubId = (int)$_GET['club_id'];
            $whereConditions[] = 'c.club_id = ?';
            $params[] = $clubId;
            if (!$currentUser || (!isAdminRole($currentUser) && (int)$currentUser['id'] !== $clubId)) {
                $whereConditions[] = "c.status IN ('published', 'fully_booked')";
                $whereConditions[] = '(c.ends_at IS NULL OR c.ends_at >= ?)';
                $params[] = (new DateTimeImmutable('now', new DateTimeZone('Europe/Berlin')))->format('Y-m-d H:i:s');
            }
        } elseif (isset($_GET['all']) && $_GET['all'] == 1) {
            if (!$currentUser || !isAdminRole($currentUser)) {
                jsonResponse(['error' => 'Forbidden'], 403);
            }
        } else {
            $whereConditions[] = "c.status IN ('published', 'fully_booked')";
            $whereConditions[] = '(c.ends_at IS NULL OR c.ends_at >= ?)';
            $params[] = (new DateTimeImmutable('now', new DateTimeZone('Europe/Berlin')))->format('Y-m-d H:i:s');
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
            $metadataByCamp = [];
            $categoriesByCamp = [];

            foreach ($chunks as $chunk) {
                $inQuery = implode(',', array_fill(0, count($chunk), '?'));
                
                $stmtImg = $db->prepare("SELECT id, camp_id, image_url, alt_text, is_decorative FROM camp_images WHERE camp_id IN ($inQuery) ORDER BY id");
                $stmtImg->execute($chunk);
                foreach ($stmtImg->fetchAll(PDO::FETCH_ASSOC) as $img) {
                    $imagesByCamp[$img['camp_id']][] = $img['image_url'];
                    $metadataByCamp[$img['camp_id']][] = imageMetadataPayload($img);
                }

                $stmtCat = $db->prepare("SELECT camp_id, category FROM camp_categories WHERE camp_id IN ($inQuery)");
                $stmtCat->execute($chunk);
                foreach ($stmtCat->fetchAll(PDO::FETCH_ASSOC) as $cat) {
                    $categoriesByCamp[$cat['camp_id']][] = $cat['category'];
                }
            }

            foreach ($camps as &$camp) {
                $camp['images'] = $imagesByCamp[$camp['id']] ?? [];
                $camp['image_metadata'] = $metadataByCamp[$camp['id']] ?? [];
                $camp['categories'] = $categoriesByCamp[$camp['id']] ?? [];
                $camp['type'] = !empty($camp['categories']) ? $camp['categories'][0] : $camp['type'];
                $camp = campWithLifecycle($camp);
            }
            unset($camp);
        }

        jsonResponse($internalView ? $camps : array_map('publicCampPayload', $camps));
    }
    else {
        jsonResponse(['error' => 'Not Found'], 404);
    }
} catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    foreach ($createdPaths ?? [] as $path) if (is_file($path)) unlink($path);
    logError(get_class($e) . ': request failed');
    jsonResponse(['error' => 'Internal Server Error'], 500);
}
