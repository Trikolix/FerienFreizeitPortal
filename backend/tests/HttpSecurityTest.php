<?php
use PHPUnit\Framework\TestCase;

final class HttpSecurityTest extends TestCase {
    private static $process;
    private static string $directory;
    private static string $base;
    private static PDO $database;
    private array $club;
    private array $admin;

    public static function setUpBeforeClass(): void {
        self::$directory = sys_get_temp_dir() . '/ffp-http-' . bin2hex(random_bytes(8));
        mkdir(self::$directory, 0700);
        $socket = stream_socket_server('tcp://127.0.0.1:0');
        $address = stream_socket_get_name($socket, false);
        fclose($socket);
        self::$base = 'http://' . $address;
        $environment = array_merge(getenv(), ['APP_ENV' => 'development', 'APP_BASE_URL' => self::$base, 'DB_CONNECTION' => 'sqlite', 'DB_SQLITE_PATH' => self::$directory . '/test.sqlite', 'SEED_DEMO_DATA' => '1', 'UPLOAD_DIR' => self::$directory . '/uploads', 'APP_LOG_DIR' => self::$directory . '/logs']);
        self::$process = proc_open([PHP_BINARY, '-d', 'sendmail_path=/bin/false', '-S', $address, __DIR__ . '/../index.php'], [0 => ['pipe', 'r'], 1 => ['file', self::$directory . '/server.log', 'a'], 2 => ['file', self::$directory . '/server.log', 'a']], $pipes, dirname(__DIR__), $environment);
        for ($i = 0; $i < 100; $i++) {
            $body = @file_get_contents(self::$base . '/api/holidays');
            if ($body !== false) break;
            usleep(50000);
        }
        if ($body === false) throw new RuntimeException('API startup failed: ' . file_get_contents(self::$directory . '/server.log'));
        self::$database = new PDO('sqlite:' . self::$directory . '/test.sqlite');
        self::$database->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    }

    protected function setUp(): void {
        self::$database->exec('DELETE FROM auth_limits');
        $this->club = $this->login('testverein', 'testverein');
        $this->admin = $this->login('admin', 'admin');
    }

    private function request(string $path, string $method = 'GET', ?array $data = null, array $auth = [], array $extra = [], ?string $body = null): array {
        $headers = ['Content-Type: application/json', 'X-Requested-With: FerienFreizeitPortal', 'Origin: ' . self::$base];
        if (isset($auth['cookie'])) $headers[] = 'Cookie: ' . $auth['cookie'];
        if (isset($auth['csrf'])) $headers[] = 'X-CSRF-Token: ' . $auth['csrf'];
        foreach ($extra as $key => $value) {
            $headers = array_values(array_filter($headers, fn($h) => !str_starts_with(strtolower($h), strtolower($key) . ':')));
            if ($value !== null) $headers[] = "$key: $value";
        }
        $context = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body ?? ($data !== null ? json_encode($data) : ''), 'ignore_errors' => true, 'timeout' => 15]]);
        $raw = file_get_contents(self::$base . $path, false, $context);
        preg_match('/\s(\d{3})\s/', $http_response_header[0], $match);
        return ['status' => (int)$match[1], 'body' => json_decode($raw, true), 'raw' => $raw, 'headers' => $http_response_header];
    }

    private function login(string $name, string $password): array {
        $response = $this->request('/api/login', 'POST', ['username' => $name, 'password' => $password]);
        self::assertSame(200, $response['status'], $response['raw']);
        $cookie = '';
        foreach ($response['headers'] as $header) if (preg_match('/^Set-Cookie: ([^;]+)/i', $header, $match)) $cookie = $match[1];
        return ['cookie' => $cookie, 'csrf' => $response['body']['csrf_token'], 'user' => $response['body']['user']];
    }

    private function camp(array $overrides = []): array {
        return array_merge(['title' => 'HTTP test camp', 'min_age' => 8, 'max_age' => 16, 'categories' => ['Natur'], 'description' => '<p>Ein Naturangebot.</p>', 'location_text' => 'Zwickau', 'starts_at' => date('Y-m-d', strtotime('+40 days')) . 'T10:00', 'ends_at' => date('Y-m-d', strtotime('+45 days')) . 'T12:00', 'registration_deadline' => date('Y-m-d', strtotime('+30 days')) . 'T12:00', 'price_eur' => 0, 'status' => 'draft'], $overrides);
    }

    public function testCookiesCsrfAndLogout(): void {
        $response = $this->request('/api/me', 'GET', null, $this->club);
        self::assertSame(200, $response['status']);
        self::assertArrayNotHasKey('token', $response['body']);
        $stored = self::$database->query('SELECT token FROM sessions LIMIT 1')->fetchColumn();
        self::assertStringStartsWith('sha256:', $stored);
        $badCsrf = $this->request('/api/me', 'PUT', ['display_name' => 'X'], ['cookie' => $this->club['cookie']]);
        self::assertSame(403, $badCsrf['status']);
        self::assertSame(403, $this->request('/api/login', 'POST', [], [], ['Origin' => 'https://evil.test'])['status']);
        self::assertSame(403, $this->request('/api/login', 'POST', [], [], ['X-Requested-With' => null])['status']);
        self::assertSame(200, $this->request('/api/logout', 'POST', [], $this->club)['status']);
        self::assertSame(401, $this->request('/api/me', 'GET', null, $this->club)['status']);
    }

    public function testDraftPrivacyOwnershipAndPublicFields(): void {
        $create = $this->request('/api/camps', 'POST', ['title' => 'Secret draft'], $this->club);
        self::assertSame(201, $create['status'], $create['raw']);
        $id = $create['body']['id'];
        self::assertSame(404, $this->request('/api/camps/' . $id)['status']);
        self::assertSame(200, $this->request('/api/camps/' . $id, 'GET', null, $this->club)['status']);
        self::assertSame(200, $this->request('/api/camps/' . $id, 'GET', null, $this->admin)['status']);
        self::assertSame(422, $this->request('/api/camps/' . $id, 'PUT', ['status' => 'published'], $this->club)['status']);
        self::assertSame(200, $this->request('/api/camps/' . $id, 'PUT', $this->camp(['status' => 'published']), $this->club)['status']);
        $public = $this->request('/api/camps/' . $id)['body'];
        self::assertArrayNotHasKey('username', $public);
        self::assertArrayNotHasKey('club_id', $public);
        self::assertSame(0, $public['price_eur']);
        self::assertSame(403, $this->request('/api/camps', 'POST', $this->camp(), $this->admin)['status']);
        self::assertSame(401, $this->request('/api/camps/' . $id, 'DELETE')['status']);
    }

    public function testHtmlAndInvalidTypesAcrossHttpBoundary(): void {
        $create = $this->request('/api/camps', 'POST', $this->camp(['description' => '<p onmouseover="alert(1)">Text</p><img src=x onerror=alert(1)>']), $this->club);
        self::assertSame(201, $create['status']);
        $detail = $this->request('/api/camps/' . $create['body']['id'], 'GET', null, $this->club);
        self::assertSame('<p>Text</p>', $detail['body']['description']);
        self::assertSame(422, $this->request('/api/camps', 'POST', ['title' => ['bad']], $this->club)['status']);
        self::assertSame(400, $this->request('/api/camps?start_date[]=oops')['status']);
        self::assertSame(400, $this->request('/api/camps', 'POST', null, $this->club, [], '{bad')['status']);
    }

    public function testRateLimitCannotBeBypassedWithForwardedHeader(): void {
        for ($i = 0; $i < 11; $i++) $result = $this->request('/api/login', 'POST', ['username' => 'nobody', 'password' => 'wrong'], [], ['X-Forwarded-For' => '203.0.113.' . $i]);
        self::assertSame(429, $result['status']);
    }

    public function testInactiveUserSessionIsRejected(): void {
        $create = $this->request('/api/camps', 'POST', $this->camp(['status' => 'published']), $this->club);
        $id = $create['body']['id'];
        $token = bin2hex(random_bytes(32));
        self::$database->prepare('INSERT INTO password_tokens (user_id, token_hash, purpose, expires_at) VALUES (?, ?, ?, ?)')->execute([$this->club['user']['id'], hash('sha256', $token), 'reset', date('Y-m-d H:i:s', time() + 3600)]);
        self::$database->exec("UPDATE users SET is_active = 0 WHERE username = 'testverein'");
        try {
            self::assertSame(401, $this->request('/api/me', 'GET', null, $this->club)['status']);
            self::assertSame(404, $this->request('/api/camps/' . $id)['status']);
            self::assertSame(400, $this->request('/api/password/set', 'POST', ['token' => $token, 'purpose' => 'reset', 'password' => 'testverein'])['status']);
        }
        finally { self::$database->exec("UPDATE users SET is_active = 1 WHERE username = 'testverein'"); }
    }

    public function testExpiredAdminAndManagementRequestsRequireLogin(): void {
        self::assertSame(401, $this->request('/api/admin/users')['status']);
        self::assertSame(401, $this->request('/api/admin/users', 'POST', [])['status']);
        self::assertSame(401, $this->request('/api/camps?manage=1&club_id=2')['status']);
        self::assertSame(401, $this->request('/api/camps?all=1')['status']);
        self::assertSame(403, $this->request('/api/admin/users', 'GET', null, $this->club)['status']);
    }

    public function testPrivateStaticFilesAreNotServed(): void {
        foreach (['database.sqlite', 'error.log', 'mail.log', 'config.example.php', 'schema.sql', 'composer.lock', 'vendor/autoload.php'] as $path) self::assertSame(404, $this->request('/' . $path)['status'], $path);
    }

    public function testUploadBatchAndSharedImageDeletion(): void {
        $create = $this->request('/api/camps', 'POST', ['title' => 'Images'], $this->club);
        $id = $create['body']['id'];
        $boundary = 'testBoundary';
        $image = imagecreatetruecolor(2, 2);
        ob_start(); imagepng($image); $png = ob_get_clean(); imagedestroy($image);
        $part = fn($name, $content, $type) => "--$boundary\r\nContent-Disposition: form-data; name=\"images[]\"; filename=\"$name\"\r\nContent-Type: $type\r\n\r\n$content\r\n";
        $mixed = $part('good.png', $png, 'image/png') . $part('bad.jpg', '<?php echo 1;', 'image/jpeg') . "--$boundary--\r\n";
        self::assertSame(422, $this->request("/api/camps/$id/images", 'POST', null, $this->club, ['Content-Type' => "multipart/form-data; boundary=$boundary"], $mixed)['status']);
        self::assertSame(0, (int)self::$database->query("SELECT COUNT(*) FROM camp_images WHERE camp_id = $id")->fetchColumn());
        $valid = $part('good.png', $png, 'image/png') . "--$boundary--\r\n";
        $upload = $this->request("/api/camps/$id/images", 'POST', null, $this->club, ['Content-Type' => "multipart/form-data; boundary=$boundary"], $valid);
        self::assertSame(200, $upload['status'], $upload['raw']);
        $url = $upload['body']['images'][0];
        self::$database->exec("UPDATE camps SET starts_at = '2020-01-01 10:00:00', ends_at = '2020-01-02 10:00:00' WHERE id = $id");
        $copy = $this->request("/api/camps/$id/duplicate", 'POST', [], $this->club);
        self::assertSame(201, $copy['status'], $copy['raw']);
        self::assertSame(200, $this->request("/api/camps/$id/images", 'DELETE', ['image_url' => $url], $this->club)['status']);
        self::assertSame(200, $this->request($url)['status']);
        $copyId = $copy['body']['camp']['id'];
        self::assertSame(200, $this->request("/api/camps/$copyId", 'DELETE', [], $this->club)['status']);
        self::assertSame(404, $this->request($url)['status']);
    }

    public function testResetTokenIsSingleUseAndRevokesSessions(): void {
        $token = bin2hex(random_bytes(32));
        $userId = $this->club['user']['id'];
        self::$database->prepare('INSERT INTO password_tokens (user_id, token_hash, purpose, expires_at) VALUES (?, ?, ?, ?)')->execute([$userId, hash('sha256', $token), 'reset', date('Y-m-d H:i:s', time() + 3600)]);
        $payload = ['token' => $token, 'purpose' => 'reset', 'password' => 'testverein'];
        self::assertSame(200, $this->request('/api/password/set', 'POST', $payload)['status']);
        self::assertSame(400, $this->request('/api/password/set', 'POST', $payload)['status']);
        self::assertSame(401, $this->request('/api/me', 'GET', null, $this->club)['status']);
    }

    public static function tearDownAfterClass(): void {
        if (is_resource(self::$process)) { proc_terminate(self::$process); proc_close(self::$process); }
        // Only remove the random temporary directory created by this test suite.
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(self::$directory, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($iterator as $entry) $entry->isDir() ? rmdir($entry->getPathname()) : unlink($entry->getPathname());
        rmdir(self::$directory);
    }
}
