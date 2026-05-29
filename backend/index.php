<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Database Connection
$dbConnection = getenv('DB_CONNECTION') ?: 'sqlite';
$dbHost = getenv('DB_HOST') ?: '127.0.0.1';
$dbName = getenv('DB_NAME') ?: 'westsachsen_camps';
$dbUser = getenv('DB_USER') ?: 'root';
$dbPass = getenv('DB_PASSWORD') ?: '';

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

            // Insert default admin if users table is freshly created
            $hash = password_hash('admin', PASSWORD_BCRYPT);
            $db->exec("INSERT INTO users (username, password_hash, role) VALUES ('admin', '$hash', 'admin')");
        }
    }
} catch (PDOException $e) {
    error_log("Database Connection Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["error" => "Database Connection Failed"]);
    exit();
}

function ensureDefaultUser($db, $username, $password, $role, $clubName = null, $contactInfo = null) {
    $stmt = $db->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->execute([$username]);

    if ($stmt->fetch(PDO::FETCH_ASSOC)) {
        return;
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $db->prepare('INSERT INTO users (username, password_hash, role, club_name, contact_info) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([$username, $hash, $role, $clubName, $contactInfo]);
}

try {
    ensureDefaultUser($db, 'admin', 'admin', 'admin');
    ensureDefaultUser($db, 'testverein', 'testverein', 'club', 'Testverein Westsachsen', 'testverein@example.test');
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

// Router
$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Built-in server static file serving
if (php_sapi_name() === 'cli-server' && is_file(__DIR__ . $requestUri)) {
    return false;
}

$requestMethod = $_SERVER['REQUEST_METHOD'];

if (!function_exists('apache_request_headers')) {
    function apache_request_headers() {
        $arh = array();
        $rx_http = '/\AHTTP_/';
        foreach($_SERVER as $key => $val) {
            if( preg_match($rx_http, $key) ) {
                $arh_key = preg_replace($rx_http, '', $key);
                $rx_matches = array();
                $rx_matches = explode('_', $arh_key);
                if( count($rx_matches) > 0 and strlen($arh_key) > 2 ) {
                    foreach($rx_matches as $ak_key => $ak_val) $rx_matches[$ak_key] = ucfirst(strtolower($ak_val));
                    $arh_key = implode('-', $rx_matches);
                }
                $arh[$arh_key] = $val;
            }
        }
        return( $arh );
    }
}

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

    if (!$camp || ($camp['club_id'] !== $user['id'] && $user['role'] !== 'admin')) {
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
        $filename = uniqid('', true) . '.' . $ext;

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
        $username = $data['username'] ?? '';
        $password = $data['password'] ?? '';

        $stmt = $db->prepare('SELECT * FROM users WHERE username = ?');
        $stmt->execute([$username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user && password_verify($password, $user['password_hash'])) {
            $token = bin2hex(random_bytes(32));
            $expiresAt = date('Y-m-d H:i:s', strtotime('+24 hours'));

            $stmt = $db->prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)');
            $stmt->execute([$user['id'], $token, $expiresAt]);

            jsonResponse(['token' => $token, 'user' => ['id' => $user['id'], 'username' => $user['username'], 'role' => $user['role']]]);
        } else {
            logError("Failed login attempt for username: $username");
            jsonResponse(['error' => 'Invalid credentials'], 401);
        }
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

            $stmt = $db->prepare('INSERT INTO camps (club_id, title, min_age, max_age, description, location_text, location_lat, location_lng, type, starts_at, ends_at, price_eur, registration_deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            $stmt->execute([
                $user['id'], $data['title'] ?? '', $data['min_age'] ?? null, $data['max_age'] ?? null, $data['description'] ?? '',
                $data['location_text'] ?? '', $data['location_lat'] ?? null, $data['location_lng'] ?? null, $data['type'] ?? '', $data['starts_at'] ?? null,
                $data['ends_at'] ?? null, $data['price_eur'] ?? null, $data['registration_deadline'] ?? null
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

            $stmt = $db->prepare('UPDATE camps SET title = ?, min_age = ?, max_age = ?, description = ?, location_text = ?, location_lat = ?, location_lng = ?, type = ?, starts_at = ?, ends_at = ?, price_eur = ?, registration_deadline = ?, is_active = ? WHERE id = ?');
            $stmt->execute([
                $data['title'] ?? '', $data['min_age'] ?? null, $data['max_age'] ?? null, $data['description'] ?? '',
                $data['location_text'] ?? '', $data['location_lat'] ?? null, $data['location_lng'] ?? null, $data['type'] ?? '', $data['starts_at'] ?? null,
                $data['ends_at'] ?? null, $data['price_eur'] ?? null, $data['registration_deadline'] ?? null,
                $data['is_active'] ?? 1, $campId
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
    elseif ($requestUri === '/api/admin/users' && $requestMethod === 'POST') {
        $user = authenticateUser($db);
        if (!$user || $user['role'] !== 'admin') {
            jsonResponse(['error' => 'Forbidden'], 403);
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $username = $data['username'] ?? '';
        $password = $data['password'] ?? '';
        $clubName = $data['club_name'] ?? '';
        $contactInfo = $data['contact_info'] ?? '';

        if (!$username || !$password) {
            jsonResponse(['error' => 'Username and password are required'], 400);
        }

        $hashedPassword = password_hash($password, PASSWORD_BCRYPT);

        try {
            $stmt = $db->prepare('INSERT INTO users (username, password_hash, role, club_name, contact_info) VALUES (?, ?, ?, ?, ?)');
            $stmt->execute([$username, $hashedPassword, 'club', $clubName, $contactInfo]);
            jsonResponse(['message' => 'Club user created successfully', 'id' => $db->lastInsertId()]);
        } catch (PDOException $e) {
            if ($e->getCode() == 23000) { // Integrity constraint violation (UNIQUE constraint)
                jsonResponse(['error' => 'Username already exists'], 400);
            }
            throw $e;
        }
    }
    elseif ($requestUri === '/api/admin/users' && $requestMethod === 'GET') {
        $user = authenticateUser($db);
        if (!$user || $user['role'] !== 'admin') {
            jsonResponse(['error' => 'Forbidden'], 403);
        }

        $stmt = $db->prepare('SELECT id, username, role, club_name, contact_info FROM users WHERE role = "club"');
        $stmt->execute();
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

        jsonResponse($users);
    }
    elseif (preg_match('/^\/api\/camps\/(\d+)$/', $requestUri, $matches) && $requestMethod === 'GET') {
        $campId = $matches[1];
        $query = 'SELECT c.*, u.club_name, u.contact_info, u.username FROM camps c JOIN users u ON c.club_id = u.id WHERE c.id = ? AND c.is_active = 1';
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

        if (isset($_GET['club_id'])) {
            $query .= ' WHERE c.club_id = ?';
            $params[] = $_GET['club_id'];
            $whereAdded = true;
        } elseif (isset($_GET['all']) && $_GET['all'] == 1) {
            $query .= ' WHERE 1=1'; // Admin wants all
            $whereAdded = true;
        } else {
            $query .= ' WHERE c.is_active = 1';
            $whereAdded = true;
        }

        if (isset($_GET['age'])) {
            $age = (int)$_GET['age'];
            $query .= ' AND (c.min_age <= ? AND c.max_age >= ?)';
            $params[] = $age;
            $params[] = $age;
        }

        if (isset($_GET['type']) && !empty($_GET['type'])) {
            $query .= ' AND c.type = ?';
            $params[] = $_GET['type'];
        }

        // Basic geographic bounds filtering
        if (isset($_GET['minLat']) && isset($_GET['maxLat']) && isset($_GET['minLng']) && isset($_GET['maxLng'])) {
            $query .= ' AND (c.location_lat BETWEEN ? AND ? AND c.location_lng BETWEEN ? AND ?)';
            $params[] = $_GET['minLat'];
            $params[] = $_GET['maxLat'];
            $params[] = $_GET['minLng'];
            $params[] = $_GET['maxLng'];
        }

        $stmt = $db->prepare($query);
        $stmt->execute($params);
        $camps = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch images for camps
        foreach ($camps as &$camp) {
            $stmtImg = $db->prepare('SELECT image_url FROM camp_images WHERE camp_id = ?');
            $stmtImg->execute([$camp['id']]);
            $camp['images'] = $stmtImg->fetchAll(PDO::FETCH_COLUMN);
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
