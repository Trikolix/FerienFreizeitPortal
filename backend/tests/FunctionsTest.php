<?php
use PHPUnit\Framework\TestCase;

class FunctionsTest extends TestCase {
    public static function setUpBeforeClass(): void {
        if (!defined('PHPUNIT_RUNNING')) {
            define('PHPUNIT_RUNNING', true);
        }

        $_SERVER['REQUEST_METHOD'] = 'GET';
        $_SERVER['REQUEST_URI'] = '/';

        // This will include the file and define the functions, but return early before routing.
        require_once __DIR__ . '/../index.php';
    }

    public function testNormalizeRole() {
        $this->assertEquals('user', normalizeRole('club'), 'Should normalize "club" to "user"');
        $this->assertEquals('admin', normalizeRole('admin'), 'Should leave "admin" as "admin"');
        $this->assertEquals('master_admin', normalizeRole('master_admin'), 'Should leave "master_admin" as "master_admin"');
        $this->assertEquals('user', normalizeRole('user'), 'Should leave "user" as "user"');

        $this->assertEquals('', normalizeRole(''), 'Should leave empty string as empty string');
        $this->assertEquals('CLUB', normalizeRole('CLUB'), 'Should be case-sensitive, leaving "CLUB" as "CLUB"');
        $this->assertEquals(null, normalizeRole(null), 'Should handle null input');
        $this->assertEquals(123, normalizeRole(123), 'Should handle numeric input gracefully');
    }

    public function testIsAdminRole() {
        $this->assertTrue(isAdminRole(['role' => 'admin']), 'admin role should return true');
        $this->assertTrue(isAdminRole(['role' => 'master_admin']), 'master_admin role should return true');
        $this->assertFalse(isAdminRole(['role' => 'user']), 'user role should return false');
        $this->assertFalse(isAdminRole(['role' => 'club']), 'club role should return false (normalizes to user)');
        $this->assertFalse(isAdminRole(['role' => '']), 'empty role should return false');
        $this->assertFalse(isAdminRole([]), 'missing role should return false');
    }

    public function testIsMasterAdmin() {
        $this->assertTrue(isMasterAdmin(['role' => 'master_admin']), 'master_admin role should return true');
        $this->assertFalse(isMasterAdmin(['role' => 'admin']), 'admin role should return false');
        $this->assertFalse(isMasterAdmin(['role' => 'user']), 'user role should return false');
        $this->assertFalse(isMasterAdmin(['role' => 'club']), 'club role should return false');
        $this->assertFalse(isMasterAdmin(['role' => '']), 'empty role should return false');
        $this->assertFalse(isMasterAdmin([]), 'missing role should return false');
    }
}
