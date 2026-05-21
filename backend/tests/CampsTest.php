<?php
use PHPUnit\Framework\TestCase;

class CampsTest extends TestCase {
    private $dbFile = __DIR__ . '/../test_database.sqlite';

    protected function setUp(): void {
        $db = new PDO('sqlite:' . $this->dbFile);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $db->exec(file_get_contents(__DIR__ . '/../schema.sql'));

        $db->exec("INSERT INTO users (id, username, password_hash, role) VALUES (1, 'club1', 'hash', 'club')");
        $db->exec("INSERT INTO camps (club_id, title, age_from, age_to, type, is_active) VALUES (1, 'Camp 1', 10, 15, 'Sport', 1)");
        $db->exec("INSERT INTO camps (club_id, title, age_from, age_to, type, is_active) VALUES (1, 'Camp 2', 8, 12, 'Lager', 0)");
    }

    protected function tearDown(): void {
        if (file_exists($this->dbFile)) {
            unlink($this->dbFile);
        }
    }

    public function testGetActiveCamps() {
        $db = new PDO('sqlite:' . $this->dbFile);
        $stmt = $db->query('SELECT * FROM camps WHERE is_active = 1');
        $camps = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $this->assertCount(1, $camps);
        $this->assertEquals('Camp 1', $camps[0]['title']);
    }
}
