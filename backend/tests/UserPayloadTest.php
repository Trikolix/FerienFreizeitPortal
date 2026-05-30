<?php
use PHPUnit\Framework\TestCase;

// Prevent undefined array key warning
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['REQUEST_URI'] = '/';

if (!defined('TESTING')) {
    define('TESTING', true);
}
require_once __DIR__ . '/../index.php';

class UserPayloadTest extends TestCase {

    public function testUserPayloadWithAllFields() {
        $user = [
            'id' => '123',
            'email' => 'test@example.com',
            'username' => 'testuser',
            'role' => 'admin',
            'display_name' => 'Test User',
            'club_name' => 'Test Club',
            'contact_info' => 'test contact info'
        ];

        $payload = userPayload($user);

        $this->assertEquals(123, $payload['id']);
        $this->assertEquals('test@example.com', $payload['email']);
        $this->assertEquals('testuser', $payload['username']);
        $this->assertEquals('admin', $payload['role']);
        $this->assertEquals('Test User', $payload['display_name']);
        $this->assertEquals('Test Club', $payload['club_name']);
        $this->assertEquals('test contact info', $payload['contact_info']);
    }

    public function testUserPayloadMissingEmailAndDisplayName() {
        $user = [
            'id' => 124,
            'username' => 'testuser2',
            'role' => 'club'
        ];

        $payload = userPayload($user);

        $this->assertEquals(124, $payload['id']);
        $this->assertEquals('testuser2', $payload['email']); // falls back to username
        $this->assertEquals('testuser2', $payload['username']);
        $this->assertEquals('user', $payload['role']); // normalized 'club' -> 'user'
        $this->assertEquals('testuser2', $payload['display_name']); // falls back to username
        $this->assertEquals('', $payload['club_name']);
        $this->assertEquals('', $payload['contact_info']);
    }

    public function testUserPayloadWithClubNameFallbackForDisplayName() {
        $user = [
            'id' => 125,
            'username' => 'testuser3',
            'role' => 'user',
            'club_name' => 'Fallback Club'
        ];

        $payload = userPayload($user);

        $this->assertEquals('Fallback Club', $payload['display_name']); // falls back to club_name
        $this->assertEquals('Fallback Club', $payload['club_name']);
    }

    public function testUserPayloadNullValues() {
        $user = [
            'id' => 126,
            'email' => null,
            'username' => 'nulluser',
            'role' => 'admin',
            'display_name' => null,
            'club_name' => null,
            'contact_info' => null
        ];

        $payload = userPayload($user);
        $this->assertEquals('nulluser', $payload['email']);
        $this->assertEquals('nulluser', $payload['display_name']);
        $this->assertEquals('', $payload['club_name']);
        $this->assertEquals('', $payload['contact_info']);
    }
}
