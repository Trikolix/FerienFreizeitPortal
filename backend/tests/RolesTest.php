<?php
use PHPUnit\Framework\TestCase;

class RolesTest extends TestCase {

    protected function setUp(): void {
        require_once __DIR__ . '/../roles.php';
    }

    public function testNormalizeRole() {
        $this->assertEquals('user', normalizeRole('club'));
        $this->assertEquals('admin', normalizeRole('admin'));
        $this->assertEquals('master_admin', normalizeRole('master_admin'));
        $this->assertEquals('user', normalizeRole('user'));
        $this->assertEquals('something_else', normalizeRole('something_else'));
    }

    public function testIsAdminRole() {
        $this->assertTrue(isAdminRole(['role' => 'master_admin']));
        $this->assertTrue(isAdminRole(['role' => 'admin']));

        $this->assertFalse(isAdminRole(['role' => 'club']));
        $this->assertFalse(isAdminRole(['role' => 'user']));
        $this->assertFalse(isAdminRole(['role' => '']));
        $this->assertFalse(isAdminRole([]));
        $this->assertFalse(isAdminRole(['role' => null]));
    }

    public function testIsMasterAdmin() {
        $this->assertTrue(isMasterAdmin(['role' => 'master_admin']));

        $this->assertFalse(isMasterAdmin(['role' => 'admin']));
        $this->assertFalse(isMasterAdmin(['role' => 'club']));
        $this->assertFalse(isMasterAdmin(['role' => 'user']));
        $this->assertFalse(isMasterAdmin(['role' => '']));
        $this->assertFalse(isMasterAdmin([]));
    }
}
