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

    public function testImageDescriptionsAuthorizationPublicationAndCopy(): void {
        $create = $this->request('/api/camps', 'POST', $this->camp(), $this->club);
        $id = $create['body']['id'];
        self::$database->prepare('INSERT INTO camp_images (camp_id, image_url) VALUES (?, ?)')->execute([$id, '/uploads/metadata-test.png']);
        $imageId = (int)self::$database->lastInsertId();
        $path = "/api/camps/$id/images/$imageId";
        self::assertSame(401, $this->request($path, 'PUT', ['alt_text' => 'Bäume'])['status']);
        self::assertSame(403, $this->request($path, 'PUT', ['alt_text' => 'Bäume'], ['cookie' => $this->club['cookie']])['status']);
        self::assertSame(422, $this->request("/api/camps/$id", 'PUT', $this->camp(['status' => 'published']), $this->club)['status']);
        self::assertSame(422, $this->request($path, 'PUT', ['alt_text' => str_repeat('x', 501)], $this->club)['status']);
        self::assertSame(200, $this->request($path, 'PUT', ['alt_text' => 'Kinder am Waldrand', 'is_decorative' => false], $this->club)['status']);
        self::assertSame(200, $this->request("/api/camps/$id", 'PUT', $this->camp(['status' => 'published']), $this->club)['status']);
        self::assertSame(422, $this->request($path, 'PUT', ['alt_text' => ''], $this->club)['status']);
        $public = $this->request("/api/camps/$id")['body'];
        self::assertSame(['/uploads/metadata-test.png'], $public['images']);
        self::assertSame('Kinder am Waldrand', $public['image_metadata'][0]['alt_text']);
        self::$database->prepare("UPDATE camps SET starts_at = '2020-01-01 10:00:00', ends_at = '2020-01-05 10:00:00' WHERE id = ?")->execute([$id]);
        $copyResponse = $this->request("/api/camps/$id/duplicate", 'POST', [], $this->club);
        self::assertSame(201, $copyResponse['status'], $copyResponse['raw']);
        $copy = $copyResponse['body']['camp'];
        self::assertSame($public['image_metadata'][0]['alt_text'], $copy['image_metadata'][0]['alt_text']);
        self::assertNotSame($imageId, $copy['image_metadata'][0]['id']);
        self::assertSame(404, $this->request('/api/camps/' . $copy['id'] . '/images/' . $imageId, 'PUT', ['alt_text' => 'Wrong camp'], $this->club)['status']);
        self::assertSame(200, $this->request($path, 'PUT', ['is_decorative' => true], $this->admin)['status']);
        self::$database->prepare('UPDATE camps SET club_id = ? WHERE id = ?')->execute([$this->admin['user']['id'], $id]);
        self::assertSame(403, $this->request($path, 'PUT', ['alt_text' => 'Foreign camp'], $this->club)['status']);
        $this->request("/api/camps/$id", 'DELETE', null, $this->admin);
        $this->request('/api/camps/' . $copy['id'], 'DELETE', null, $this->club);
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

    public function testPlaceAvailabilityIsPrivateAndPlaceRequestsDoNotPersistContents(): void {
        $create = $this->request('/api/camps', 'POST', $this->camp([
            'status' => 'published',
            'place_requests_enabled' => true,
            'allocation_method' => 'request',
            'capacity_total' => 20,
            'places_remaining' => 3,
            'waitlist_enabled' => true,
            'place_request_email' => 'booking@example.test',
        ]), $this->club);
        self::assertSame(201, $create['status'], $create['raw']);
        $id = $create['body']['id'];

        $public = $this->request('/api/camps/' . $id);
        self::assertSame(200, $public['status']);
        self::assertSame('few_places', $public['body']['availability_state']);
        foreach (['capacity_total', 'places_remaining', 'place_request_email', 'place_requests_enabled'] as $privateField) self::assertArrayNotHasKey($privateField, $public['body']);

        self::assertSame(401, $this->request("/api/camps/$id/availability", 'PUT', ['places_remaining' => 0])['status']);
        self::$database->prepare('INSERT INTO users (email, username, password_hash, role, display_name, club_name, contact_info, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')->execute([
            'anderer-verein@example.test', 'anderer-verein', password_hash('anderer-verein', PASSWORD_BCRYPT), 'user', 'Anderer Verein', 'Anderer Verein', 'Kontakt',
        ]);
        $otherClub = $this->login('anderer-verein', 'anderer-verein');
        self::assertSame(403, $this->request("/api/camps/$id/availability", 'PUT', ['places_remaining' => 0], $otherClub)['status']);
        $updated = $this->request("/api/camps/$id/availability", 'PUT', ['places_remaining' => 0], $this->club);
        self::assertSame(200, $updated['status'], $updated['raw']);
        self::assertSame('fully_booked', $updated['body']['camp']['status']);
        self::assertSame('waitlist', $this->request('/api/camps/' . $id)['body']['availability_state']);

        $campStart = strtotime('+40 days');
        $payload = [
            'contact_name' => 'Maria Muster', 'contact_email' => 'maria@example.test', 'contact_phone' => '+49 123 456',
            'participants' => [['first_name' => 'Lina', 'last_name' => 'Muster', 'birth_date' => date('Y-m-d', strtotime('-10 years', $campStart))]],
            'message' => 'Bitte melden Sie sich bei uns.', 'privacy_acknowledged' => true, 'website' => '', 'form_started_at' => time() - 10,
        ];
        $submission = $this->request("/api/camps/$id/place-requests", 'POST', $payload);
        self::assertSame(503, $submission['status'], $submission['raw']);
        $event = self::$database->query("SELECT * FROM place_request_events WHERE camp_id = $id ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        self::assertSame('delivery_failed', $event['action']);
        self::assertStringNotContainsString('Lina', json_encode($event));
        self::assertStringNotContainsString($payload['participants'][0]['birth_date'], json_encode($event));
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
        $metadataPart = "--$boundary\r\nContent-Disposition: form-data; name=\"upload_metadata\"\r\n\r\n" . json_encode([['alt_text' => 'Schwarzes Testquadrat', 'is_decorative' => false]]) . "\r\n";
        $valid = $metadataPart . $part('good.png', $png, 'image/png') . "--$boundary--\r\n";
        $upload = $this->request("/api/camps/$id/images", 'POST', null, $this->club, ['Content-Type' => "multipart/form-data; boundary=$boundary"], $valid);
        self::assertSame(200, $upload['status'], $upload['raw']);
        self::assertSame('Schwarzes Testquadrat', $upload['body']['image_metadata'][0]['alt_text']);
        $url = $upload['body']['images'][0];
        self::$database->exec("UPDATE camps SET starts_at = '2020-01-01 10:00:00', ends_at = '2020-01-02 10:00:00', place_requests_enabled = 1, allocation_method = 'request', capacity_total = 12, places_remaining = 3, request_opens_at = '2019-11-01 10:00:00', waitlist_enabled = 1, place_request_email = 'kopie@example.test' WHERE id = $id");
        $copy = $this->request("/api/camps/$id/duplicate", 'POST', [], $this->club);
        self::assertSame(201, $copy['status'], $copy['raw']);
        self::assertFalse($copy['body']['camp']['place_requests_enabled']);
        self::assertSame('request', $copy['body']['camp']['allocation_method']);
        self::assertSame(12, $copy['body']['camp']['capacity_total']);
        self::assertSame(12, $copy['body']['camp']['places_remaining']);
        self::assertNull($copy['body']['camp']['request_opens_at']);
        self::assertTrue($copy['body']['camp']['waitlist_enabled']);
        self::assertSame('kopie@example.test', $copy['body']['camp']['place_request_email']);
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
