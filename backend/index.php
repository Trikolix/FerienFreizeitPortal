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

try {
    ensureDefaultUser($db, 'admin@example.test', 'admin', 'admin', 'master_admin', 'Master-Admin');
    ensureDefaultUser($db, 'testverein@example.test', 'testverein', 'testverein', 'user', 'Testverein Westsachsen', 'testverein@example.test');
} catch (PDOException $e) {
    error_log("Default User Seed Error: " . $e->getMessage());
}

// Central logging
function logError($message) {
    error_log(date('[Y-m-d H:i:s] ') . $message . "\n", 3, __DIR__ . '/error.log');
}

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
        $db->exec("UPDATE camps SET status = 'published' WHERE is_active = 1 AND (status IS NULL OR status = 'draft')");
        $db->exec("UPDATE camps SET status = 'archived' WHERE is_active = 0 AND (status IS NULL OR status = 'draft')");
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

            jsonResponse(['message' => 'Camp created successfully', 'id' => $newCampId]);
        }
        elseif ($requestMethod === 'PUT' && $campId) {
            // PHP doesn't parse multipart/form-data for PUT out of the box easily.
            // A common workaround is to use POST with a _method field, but for simplicity we assume
            // json if editing without images, or we can just parse php://input.
            $data = json_decode(file_get_contents('php://input'), true) ?? [];

            // Check ownership
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
        $query = 'SELECT c.*, u.club_name, u.contact_info, u.username FROM camps c JOIN users u ON c.club_id = u.id WHERE c.id = ? AND c.status IN ("published", "fully_booked")';
        $stmt = $db->prepare($query);
        $stmt->execute([$campId]);
        $camp = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$camp) {
            jsonResponse(['error' => 'Camp not found'], 404);
        }

        $stmtImg = $db->prepare('SELECT image_url FROM camp_images WHERE camp_id = ?');
        $stmtImg->execute([$camp['id']]);
        $camp['images'] = $stmtImg->fetchAll(PDO::FETCH_COLUMN);

        jsonResponse($camp);
    }
    elseif ($requestUri === '/api/camps' && $requestMethod === 'GET') {
        $query = 'SELECT c.*, u.club_name, u.contact_info, u.username FROM camps c JOIN users u ON c.club_id = u.id';
        $params = [];
        $whereAdded = false;
        $currentUser = authenticateUser($db);

        if (isset($_GET['club_id'])) {
            $clubId = (int)$_GET['club_id'];
            $query .= ' WHERE c.club_id = ?';
            $params[] = $clubId;
            $whereAdded = true;
            if (!$currentUser || (!isAdminRole($currentUser) && (int)$currentUser['id'] !== $clubId)) {
                $query .= ' AND c.status IN ("published", "fully_booked")';
            }
        } elseif (isset($_GET['all']) && $_GET['all'] == 1) {
            if (!$currentUser || !isAdminRole($currentUser)) {
                jsonResponse(['error' => 'Forbidden'], 403);
            }
            $query .= ' WHERE 1=1'; // Admin wants all
            $whereAdded = true;
        } else {
            $query .= ' WHERE c.status IN ("published", "fully_booked")';
            $whereAdded = true;
        }

        if (isset($_GET['age'])) {
            $age = (int)$_GET['age'];
            $query .= ' AND (c.min_age <= ? AND c.max_age >= ?)';
            $params[] = $age;
            $params[] = $age;
        }

        if (isset($_GET['type']) && is_string($_GET['type']) && trim($_GET['type']) !== '') {
            $type = trim($_GET['type']);
            $query .= ' AND c.type = ?';
            $params[] = $type;
        }

        // Basic geographic bounds filtering
        if (isset($_GET['minLat']) && isset($_GET['maxLat']) && isset($_GET['minLng']) && isset($_GET['maxLng'])) {
            $query .= ' AND (c.location_lat BETWEEN ? AND ? AND c.location_lng BETWEEN ? AND ?)';
            $params[] = (float)$_GET['minLat'];
            $params[] = (float)$_GET['maxLat'];
            $params[] = (float)$_GET['minLng'];
            $params[] = (float)$_GET['maxLng'];
        }

        $stmt = $db->prepare($query);
        $stmt->execute($params);
        $camps = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch images for camps in batches to avoid N+1 and SQLite variable limits
        $campIds = array_column($camps, 'id');
        foreach ($camps as &$camp) {
            $camp['images'] = [];
        }

        if (!empty($campIds)) {
            $chunks = array_chunk($campIds, 900);
            $imagesByCamp = [];

            foreach ($chunks as $chunk) {
                $inQuery = implode(',', array_fill(0, count($chunk), '?'));
                $stmtImg = $db->prepare("SELECT camp_id, image_url FROM camp_images WHERE camp_id IN ($inQuery)");
                $stmtImg->execute($chunk);
                $images = $stmtImg->fetchAll(PDO::FETCH_ASSOC);

                foreach ($images as $img) {
                    $imagesByCamp[$img['camp_id']][] = $img['image_url'];
                }
            }

            foreach ($camps as &$camp) {
                if (isset($imagesByCamp[$camp['id']])) {
                    $camp['images'] = $imagesByCamp[$camp['id']];
                }
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
