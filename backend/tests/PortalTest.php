<?php
use PHPUnit\Framework\TestCase;

if (!defined('TESTING')) define('TESTING', true);
require_once __DIR__ . '/../index.php';
require_once __DIR__ . '/../provider_export.php';

final class PortalTest extends TestCase {
    private PDO $db;
    private string $path;
    private array $club;
    private array $admin;

    protected function setUp(): void {
        $GLOBALS['localConfig'] = ['APP_ENV' => 'development', 'APP_KEY' => 'portal-test-key-that-is-only-for-tests', 'BOOKING_RETENTION_DAYS' => 180];
        $this->path = tempnam(sys_get_temp_dir(), 'ffp-portal-');
        $this->db = $this->connection();
        $this->db->exec(file_get_contents(__DIR__ . '/../schema.sql'));
        $this->db->exec('CREATE TABLE app_migrations (version INTEGER PRIMARY KEY)');
        $this->db->exec('INSERT INTO app_migrations VALUES (1)');
        ensurePortalSchema($this->db, 'sqlite');
        foreach ([['club@example.test', 'user'], ['admin@example.test', 'admin']] as [$email, $role]) portalExec($this->db, 'INSERT INTO users (email, username, role, display_name, club_name, contact_info, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)', [$email, $email, $role, 'Testverein', 'Testverein', 'Kontakt']);
        $this->club = portalRow($this->db, "SELECT * FROM users WHERE role = 'user'");
        $this->admin = portalRow($this->db, "SELECT * FROM users WHERE role = 'admin'");
        $provider = portalEnsureProvider($this->db, $this->club);
        $profile = $this->profile();
        portalExec($this->db, "UPDATE providers SET status = 'approved', profile_data = ? WHERE id = ?", [portalJson($profile), $provider['id']]);
        portalProviderHistory($this->db, portalProvider($this->db, (int)$this->club['id']), 'approved', (int)$this->admin['id']);
    }
    private function connection(): PDO {
        $db = new PDO('sqlite:' . $this->path); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $db->exec('PRAGMA foreign_keys = ON'); $db->exec('PRAGMA busy_timeout = 10000'); return $db;
    }
    protected function tearDown(): void { unset($GLOBALS['db']); foreach (glob($this->path . '*') as $file) @unlink($file); }
    private function profile(array $changes = []): array {
        return portalProfile(array_merge(['public_name' => 'Testverein', 'legal_name' => 'Testverein e. V.', 'legal_form' => 'eingetragener Verein', 'street' => 'Testweg 1', 'postal_code' => '08056', 'city' => 'Zwickau', 'country' => 'DE', 'contact_info' => 'Kontakt', 'tax_ids' => [['country' => 'DE', 'number' => '00123456']], 'register_type' => 'Vereinsregister', 'register_number' => 'VR 00123', 'residence_countries' => ['DE']], $changes), true);
    }
    private function camp(array $changes = []): array {
        return array_merge(['title' => 'Waldwoche', 'min_age' => 8, 'max_age' => 16, 'description' => '<p>Eine Woche im Wald.</p>', 'location_text' => 'Zwickau', 'categories' => ['Natur'], 'starts_at' => date('Y-m-d', strtotime('+40 days')) . ' 10:00:00', 'ends_at' => date('Y-m-d', strtotime('+45 days')) . ' 12:00:00', 'registration_deadline' => date('Y-m-d', strtotime('+30 days')) . ' 12:00:00', 'price_eur' => 25, 'status' => 'draft', 'place_requests_enabled' => true, 'allocation_method' => 'request', 'capacity_total' => 2, 'places_remaining' => 2, 'waitlist_enabled' => true], $changes);
    }
    private function published(array $changes = []): int {
        $created = portalSaveCamp($this->db, $this->club, null, $this->camp($changes));
        $submitted = portalSubmitCamp($this->db, $this->club, $created['id']);
        portalReviewCamp($this->db, $this->admin, $created['id'], ['decision' => 'approved', 'revision_id' => $submitted['revision_id']]);
        return $created['id'];
    }
    private function formToken(int $campId, string $email = 'family@example.test'): string {
        $created = portalNewToken($this->db, 'booking_form', $email, (int)portalProvider($this->db, (int)$this->club['id'])['id'], $campId, null, date('Y-m-d H:i:s', time() + 3600));
        return portalTokenValue($created['token_nonce']);
    }
    private function input(string $token, string $first = 'Lina'): array {
        return ['token' => $token, 'contact_name' => 'Maria Muster', 'contact_phone' => '+49 1234567', 'participants' => [['first_name' => $first, 'last_name' => 'Muster', 'birth_date' => date('Y-m-d', strtotime('-10 years'))]], 'privacy_acknowledged' => true];
    }
    private function assertPortalError(callable $operation, int $status): void {
        try { $operation(); self::fail('Expected a domain error.'); } catch (PortalError $error) { self::assertSame($status, $error->status, $error->getMessage()); }
    }

    public function testReservationIsAtomicIdempotentAndGroupStaysOnWaitlist(): void {
        $id = $this->published(); $token = $this->formToken($id);
        $result = portalCreateBooking($this->db, $id, $this->input($token));
        self::assertSame('reserved', $result['status']);
        self::assertSame($result['reference'], portalCreateBooking($this->db, $id, $this->input($token))['reference']);
        self::assertSame(1, (int)portalRow($this->db, 'SELECT COUNT(*) AS n FROM bookings')['n']);
        self::assertSame(1, (int)portalRow($this->db, 'SELECT places_remaining FROM camps WHERE id = ?', [$id])['places_remaining']);
        $group = $this->input($this->formToken($id), 'Max'); $group['participants'][] = [...$group['participants'][0], 'first_name' => 'Mia'];
        $this->assertPortalError(fn() => portalCreateBooking($this->db, $id, $group), 409);
        $waiting = portalCreateBooking($this->db, $id, [...$group, 'waitlist_consent' => true]);
        self::assertSame('waitlist', $waiting['status']);
        self::assertSame(1, (int)portalRow($this->db, 'SELECT places_remaining FROM camps WHERE id = ?', [$id])['places_remaining']);
        $firstBooking = portalRow($this->db, 'SELECT * FROM bookings WHERE reference = ?', [$result['reference']]);
        $secondBooking = portalRow($this->db, 'SELECT * FROM bookings WHERE reference = ?', [$waiting['reference']]);
        $this->assertPortalError(fn() => portalBookingAction($this->db, $this->club, (int)$secondBooking['id'], 'promote'), 409);
        portalBookingAction($this->db, $this->club, (int)$firstBooking['id'], 'cancel');
        portalBookingAction($this->db, $this->club, (int)$secondBooking['id'], 'promote');
        portalBookingAction($this->db, $this->club, (int)$secondBooking['id'], 'confirm');
        self::assertSame(0, (int)portalRow($this->db, 'SELECT places_remaining FROM camps WHERE id = ?', [$id])['places_remaining']);
    }
    public function testDuplicatesAreScopedToActiveRegistrationsAndOffer(): void {
        $id = $this->published(); $result = portalCreateBooking($this->db, $id, $this->input($this->formToken($id)));
        $this->assertPortalError(fn() => portalCreateBooking($this->db, $id, $this->input($this->formToken($id, 'other@example.test'), '  LINA  ')), 409);
        $other = $this->published();
        self::assertSame('reserved', portalCreateBooking($this->db, $other, $this->input($this->formToken($other)))['status']);
        $booking = portalRow($this->db, 'SELECT * FROM bookings WHERE reference = ?', [$result['reference']]);
        $this->assertPortalError(fn() => portalBookingAction($this->db, $this->admin, (int)$booking['id'], 'confirm'), 403);
        portalBookingAction($this->db, $this->club, (int)$booking['id'], 'reject');
        self::assertSame('reserved', portalCreateBooking($this->db, $id, $this->input($this->formToken($id)))['status']);
    }
    public function testUnicodeNamesUseCanonicalNormalization(): void {
        $person = ['first_name' => 'Jörg', 'last_name' => 'Müller', 'birth_date' => '2023-05-10'];
        self::assertSame(portalParticipantFingerprint($person), portalParticipantFingerprint(['first_name' => "  JO\u{0308}RG  ", 'last_name' => "MU\u{0308}LLER", 'birth_date' => '2023-05-10']));
        self::assertSame('2026-01-01 12:34:56', portalLegacyTimestamp('2026-01-01 12:34:56.123456'));
    }
    public function testProviderRegistrationUsesPortalClockAndImportsPreserveLegacyDate(): void {
        foreach (['new-date@example.test', 'legacy-date@example.test'] as $email) portalExec($this->db, "INSERT INTO users (email, username, role, display_name, club_name, contact_info, is_active, created_at) VALUES (?, ?, 'user', 'Verein', 'Verein', 'Kontakt', 1, '2019-12-31 23:59:59')", [$email, $email]);
        $new = portalEnsureProvider($this->db, portalRow($this->db, 'SELECT * FROM users WHERE email = ?', ['new-date@example.test']));
        $legacy = portalEnsureProvider($this->db, portalRow($this->db, 'SELECT * FROM users WHERE email = ?', ['legacy-date@example.test']), true);
        self::assertStringStartsWith(date('Y-m-d'), $new['created_at']);
        self::assertSame('2019-12-31 23:59:59', $legacy['created_at']);
        $rows = portalProviderExportRows($this->db, 2019);
        self::assertCount(1, $rows); self::assertFalse($rows[0]['history_known']);
    }
    public function testPublishedRevisionAndBookingSnapshotSurviveEdits(): void {
        $id = $this->published(); $result = portalCreateBooking($this->db, $id, $this->input($this->formToken($id)));
        portalSaveCamp($this->db, $this->club, $id, $this->camp(['title' => 'Neue Fassung', 'price_eur' => 99]));
        $public = portalPublicCamp($this->db, campWithRelations($this->db, portalRow($this->db, 'SELECT * FROM camps WHERE id = ?', [$id])));
        self::assertSame('Waldwoche', $public['title']); self::assertSame(25.0, $public['price_eur']);
        $submitted = portalSubmitCamp($this->db, $this->club, $id);
        portalReviewCamp($this->db, $this->admin, $id, ['decision' => 'approved', 'revision_id' => $submitted['revision_id']]);
        self::assertSame('Neue Fassung', portalRow($this->db, 'SELECT title FROM camps WHERE id = ?', [$id])['title']);
        $snapshot = portalDecode(portalRow($this->db, 'SELECT snapshot_json FROM bookings WHERE reference = ?', [$result['reference']])['snapshot_json']);
        self::assertSame('Waldwoche', $snapshot['title']); self::assertSame(2500, $snapshot['total_price_cents']);
        self::assertArrayNotHasKey('profile_data', $snapshot); self::assertArrayNotHasKey('capacity_total', $snapshot);
        $this->assertPortalError(fn() => portalReviewCamp($this->db, $this->admin, $id, ['decision' => 'approved', 'revision_id' => $submitted['revision_id']]), 409);
    }
    public function testMailFailuresCannotUndoReservationsAndTokensAreHashed(): void {
        $id = $this->published(); $rawToken = $this->formToken($id); portalCreateBooking($this->db, $id, $this->input($rawToken));
        $result = portalDeliverOutbox($this->db, 20, static fn() => false);
        self::assertGreaterThan(0, $result['failed']); self::assertSame(1, portalOccupied($this->db, $id));
        self::assertStringNotContainsString($rawToken, portalJson(portalRows($this->db, 'SELECT * FROM portal_tokens')));
        portalExec($this->db, "UPDATE mail_outbox SET available_at = ? WHERE status = 'failed'", [portalNow()]);
        $sent = []; $delivery = portalDeliverOutbox($this->db, 20, function ($to, $subject, $html) use (&$sent) { $sent[] = $html; return true; });
        self::assertGreaterThan(0, $delivery['sent']); self::assertStringContainsString('Anbieter dieser Freizeit ist Testverein', implode('', $sent));
        self::assertStringContainsString('Lina Muster', implode('', $sent));
    }
    public function testDirectRegistrationRequiresEmailAndSendsSummaryToBothRecipients(): void {
        $information = "Treffpunkt: 9 Uhr am Vereinshaus.\nBitte <Regenjacke> mitbringen.";
        $id = $this->published(['confirmation_information' => $information, 'place_request_email' => 'anmeldungen@example.test']);
        $token = $this->formToken($id, '');
        $input = $this->input($token);
        $this->assertPortalError(fn() => portalCreateBooking($this->db, $id, $input), 422);
        self::assertSame(0, portalOccupied($this->db, $id));
        $input += ['contact_email' => ' Family@Example.test ', 'message' => '<script>alert(1)</script>'];
        $result = portalCreateBooking($this->db, $id, $input);
        self::assertSame($result['reference'], portalCreateBooking($this->db, $id, $input)['reference']);
        $booking = portalRow($this->db, 'SELECT * FROM bookings WHERE reference = ?', [$result['reference']]);
        self::assertSame('family@example.test', $booking['contact_email']);
        $jobs = portalRows($this->db, "SELECT * FROM mail_outbox WHERE kind IN ('booking_status', 'provider_booking')");
        self::assertCount(2, $jobs);
        self::assertSame(['family@example.test', 'anmeldungen@example.test'], array_column($jobs, 'recipient'));
        foreach ($jobs as $job) {
            $mail = portalMail($this->db, $job);
            foreach (['Zusammenfassung der Anmeldung', 'Lina Muster', 'Maria Muster', 'family@example.test', '+49 1234567', '25,00 €', 'Treffpunkt: 9 Uhr', '&lt;Regenjacke&gt;', '&lt;script&gt;alert(1)&lt;/script&gt;'] as $text) self::assertStringContainsString($text, $mail['html']);
            self::assertStringNotContainsString('<script>', $mail['html']);
        }
        portalSaveCamp($this->db, $this->club, $id, $this->camp(['confirmation_information' => 'Neue Hinweise']));
        $submitted = portalSubmitCamp($this->db, $this->club, $id);
        portalReviewCamp($this->db, $this->admin, $id, ['decision' => 'approved', 'revision_id' => $submitted['revision_id']]);
        portalBookingAction($this->db, $this->club, (int)$booking['id'], 'confirm');
        $mail = portalMail($this->db, portalRow($this->db, "SELECT * FROM mail_outbox WHERE kind = 'booking_status' ORDER BY id DESC LIMIT 1"));
        self::assertStringContainsString('Treffpunkt: 9 Uhr', $mail['html']);
        self::assertStringNotContainsString('Neue Hinweise', $mail['html']);
        self::assertStringContainsString('<dd>Bestätigt</dd>', $mail['html']);
        self::assertStringContainsString('<dd>Reserviert</dd>', portalMail($this->db, $jobs[0])['html']);
        self::assertSame('Neue Hinweise', portalInternalCamp($this->db, portalRow($this->db, 'SELECT * FROM camps WHERE id = ?', [$id]))['confirmation_information']);
    }
    public function testPastAndStartedCampsCannotBeBookedEvenWithUnusedFormAndNoDeadline(): void {
        foreach ([null, date('Y-m-d H:i:s', strtotime('+10 days'))] as $deadline) {
            $id = $this->published(); $token = $this->formToken($id);
            portalExec($this->db, 'UPDATE camps SET starts_at = ?, ends_at = ?, registration_deadline = ? WHERE id = ?', [date('Y-m-d H:i:s', strtotime('-2 days')), date('Y-m-d H:i:s', strtotime('-1 day')), $deadline, $id]);
            $this->assertPortalError(fn() => portalBookableCamp($this->db, $id), 409);
            $this->assertPortalError(fn() => portalCreateBooking($this->db, $id, $this->input($token)), 409);
            self::assertSame(0, portalOccupied($this->db, $id));
            self::assertNull(portalToken($this->db, $token, 'booking_form')['used_at']);
        }
        $id = $this->published();
        portalExec($this->db, 'UPDATE camps SET starts_at = ?, registration_deadline = NULL WHERE id = ?', [portalNow(), $id]);
        $this->assertPortalError(fn() => portalBookableCamp($this->db, $id), 409);
    }
    public function testProviderExportUsesHistoricalTextCellsAndNoFinancialTotals(): void {
        $provider = portalProvider($this->db, (int)$this->club['id']);
        $profile = $this->profile(['legal_name' => '=1+1', 'postal_code' => '00123', 'tax_ids' => [['country' => 'DE', 'number' => '000123'], ['country' => 'AT', 'number' => '000456']]]);
        portalExec($this->db, "UPDATE providers SET profile_data = ?, status = 'suspended' WHERE id = ?", [portalJson($profile), $provider['id']]);
        portalProviderHistory($this->db, portalProvider($this->db, (int)$this->club['id']), 'suspended', (int)$this->admin['id']);
        $book = portalProviderWorkbook($this->db, (int)date('Y'));
        self::assertSame(['Anbieter', 'Steuerkennungen', 'EU-Betriebsstätten', 'Hinweise'], $book->getSheetNames());
        self::assertSame('=1+1', $book->getSheetByName('Anbieter')->getCell('C2')->getValue());
        self::assertSame('s', $book->getSheetByName('Anbieter')->getCell('C2')->getDataType());
        self::assertSame('00123', $book->getSheetByName('Anbieter')->getCell('G2')->getValue());
        self::assertSame('000123', $book->getSheetByName('Steuerkennungen')->getCell('C2')->getValue());
        self::assertSame(3, $book->getSheetByName('Steuerkennungen')->getHighestRow());
        $filename = $this->path . '.xlsx'; (new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($book))->save($filename);
        self::assertGreaterThan(1000, filesize($filename)); $book->disconnectWorksheets();
    }
    public function testMigrationPreservesExternalOccupancyAndRequiresFirstReview(): void {
        $this->db->exec('DELETE FROM provider_history'); $this->db->exec('DELETE FROM providers');
        portalExec($this->db, "INSERT INTO camps (club_id, title, status, capacity_total, places_remaining) VALUES (?, 'Altbestand', 'published', 12, 3)", [$this->club['id']]);
        $id = (int)$this->db->lastInsertId(); portalMigrate($this->db, 'sqlite'); portalMigrate($this->db, 'sqlite');
        self::assertSame(9, (int)portalRow($this->db, 'SELECT external_occupied FROM camp_portal_state WHERE camp_id = ?', [$id])['external_occupied']);
        self::assertSame('draft', portalRow($this->db, 'SELECT status FROM camps WHERE id = ?', [$id])['status']);
        self::assertSame('submitted', portalRow($this->db, 'SELECT review_status FROM camp_drafts WHERE camp_id = ?', [$id])['review_status']);
    }
    public function testTwoConcurrentFamiliesCannotReserveTheLastSeatTwice(): void {
        if (!function_exists('pcntl_fork')) self::markTestSkipped('pcntl is required for concurrent write test.');
        $id = $this->published(['capacity_total' => 1, 'places_remaining' => 1]);
        $tokens = [$this->formToken($id, 'one@example.test'), $this->formToken($id, 'two@example.test')]; $children = [];
        foreach ($tokens as $index => $token) {
            $pid = pcntl_fork();
            if ($pid === 0) {
                try { $result = portalCreateBooking($this->connection(), $id, $this->input($token, 'Kind ' . $index)); file_put_contents($this->path . '.result-' . $index, $result['status']); }
                catch (PortalError $error) { file_put_contents($this->path . '.result-' . $index, (string)$error->status); }
                exit(0);
            }
            $children[] = $pid;
        }
        foreach ($children as $pid) { pcntl_waitpid($pid, $status); self::assertSame(0, pcntl_wexitstatus($status)); }
        $results = [file_get_contents($this->path . '.result-0'), file_get_contents($this->path . '.result-1')]; sort($results);
        self::assertSame(['409', 'reserved'], $results); self::assertSame(1, portalOccupied($this->db, $id));
    }
    public function testCleanupRemovesPersonalDataAndLinksButKeepsStatistics(): void {
        $id = $this->published(); portalCreateBooking($this->db, $id, $this->input($this->formToken($id)));
        $booking = portalRow($this->db, 'SELECT * FROM bookings'); $snapshot = portalDecode($booking['snapshot_json']); $snapshot['ends_at'] = '2020-01-01 12:00:00';
        portalExec($this->db, 'UPDATE bookings SET snapshot_json = ? WHERE id = ?', [portalJson($snapshot), $booking['id']]);
        self::assertSame(1, portalCleanup($this->db));
        $after = portalRow($this->db, 'SELECT * FROM bookings'); self::assertNull($after['contact_email']); self::assertSame(1, (int)$after['participant_count']);
        self::assertSame([], portalRows($this->db, 'SELECT * FROM booking_participants')); self::assertSame([], portalRows($this->db, 'SELECT * FROM portal_tokens WHERE booking_id = ?', [$booking['id']]));
    }
}
