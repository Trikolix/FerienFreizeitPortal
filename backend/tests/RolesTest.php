<?php
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../helpers.php';

class RolesTest extends TestCase {
    public function testNormalizeRole() {
        $this->assertEquals('user', normalizeRole('club'));
        $this->assertEquals('user', normalizeRole('user'));
        $this->assertEquals('admin', normalizeRole('admin'));
        $this->assertEquals('master_admin', normalizeRole('master_admin'));
        $this->assertEquals('unknown', normalizeRole('unknown'));
        $this->assertEquals('', normalizeRole(''));
    }

    public function testIsAdminRole() {
        $this->assertTrue(isAdminRole(['role' => 'master_admin']));
        $this->assertTrue(isAdminRole(['role' => 'admin']));

        $this->assertFalse(isAdminRole(['role' => 'user']));
        $this->assertFalse(isAdminRole(['role' => 'club']));
        $this->assertFalse(isAdminRole(['role' => '']));
        $this->assertFalse(isAdminRole([]));
        $this->assertFalse(isAdminRole(['role' => null]));
        $this->assertFalse(isAdminRole(['role' => 'super_admin']));
    }

    public function testIsMasterAdmin() {
        $this->assertTrue(isMasterAdmin(['role' => 'master_admin']));

        $this->assertFalse(isMasterAdmin(['role' => 'admin']));
        $this->assertFalse(isMasterAdmin(['role' => 'user']));
        $this->assertFalse(isMasterAdmin(['role' => 'club']));
        $this->assertFalse(isMasterAdmin(['role' => '']));
        $this->assertFalse(isMasterAdmin([]));
        $this->assertFalse(isMasterAdmin(['role' => null]));
    }
}
