<?php
use PHPUnit\Framework\TestCase;

class CampsTest extends TestCase {
    private $dbFile = __DIR__ . '/../test_database.sqlite';

    protected function setUp(): void {
        $db = new PDO('sqlite:' . $this->dbFile);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $db->exec(file_get_contents(__DIR__ . '/../schema.sql'));

        $db->exec("INSERT INTO users (id, email, username, password_hash, role, display_name, is_active) VALUES (1, 'club1@example.test', 'club1', 'hash', 'user', 'Club 1', 1)");
        $db->exec("INSERT INTO camps (club_id, title, min_age, max_age, type, status) VALUES (1, 'Camp 1', 10, 15, 'Sport', 'published')");
        $db->exec("INSERT INTO camps (club_id, title, min_age, max_age, type, status) VALUES (1, 'Camp 2', 8, 12, 'Lager', 'draft')");
    }

    protected function tearDown(): void {
        if (file_exists($this->dbFile)) {
            unlink($this->dbFile);
        }
    }

    public function testGetActiveCamps() {
        $db = new PDO('sqlite:' . $this->dbFile);
        $stmt = $db->query('SELECT * FROM camps WHERE status IN ("published", "fully_booked")');
        $camps = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $this->assertCount(1, $camps);
        $this->assertEquals('Camp 1', $camps[0]['title']);
    }
}
