<?php
use PHPUnit\Framework\TestCase;

class AuthTest extends TestCase {
    private string $dbFile;

    protected function setUp(): void {
        $this->dbFile = tempnam(sys_get_temp_dir(), 'ffp-auth-');
        // Create test db
        $db = new PDO('sqlite:' . $this->dbFile);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $db->exec(file_get_contents(__DIR__ . '/../schema.sql'));

        $hash = password_hash('password123', PASSWORD_BCRYPT);
        $db->exec("INSERT INTO users (email, username, password_hash, role, display_name, is_active) VALUES ('testadmin@example.test', 'testadmin', '$hash', 'admin', 'Test Admin', 1)");
    }

    protected function tearDown(): void {
        if (file_exists($this->dbFile)) {
            unlink($this->dbFile);
        }
    }

    public function testLoginSuccess() {
        $db = new PDO('sqlite:' . $this->dbFile);
        $stmt = $db->prepare('SELECT * FROM users WHERE username = ?');
        $stmt->execute(['testadmin']);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        $this->assertNotNull($user);
        $this->assertTrue(password_verify('password123', $user['password_hash']));
    }
}
