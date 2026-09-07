<?php
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../utils.php';
require_once __DIR__ . '/../helpers.php';
require_once __DIR__ . '/../security.php';
require_once __DIR__ . '/../place_requests.php';

final class PlaceRequestsTest extends TestCase {
    private PDO $db;

    protected function setUp(): void {
        $GLOBALS['localConfig'] = ['APP_KEY' => 'test-place-request-key'];
        $this->db = new PDO('sqlite::memory:');
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->db->exec('CREATE TABLE camps (id INTEGER PRIMARY KEY)');
        $this->db->exec('INSERT INTO camps (id) VALUES (1)');
        ensurePlaceRequestSchema($this->db, 'sqlite');
    }

    private function camp(array $overrides = []): array {
        return array_merge([
            'id' => 1,
            'title' => 'Waldwoche',
            'status' => 'published',
            'place_requests_enabled' => 1,
            'allocation_method' => 'request',
            'capacity_total' => 20,
            'places_remaining' => 6,
            'request_opens_at' => null,
            'registration_deadline' => '2035-07-01 12:00:00',
            'starts_at' => '2035-08-01 10:00:00',
            'min_age' => 8,
            'max_age' => 16,
            'waitlist_enabled' => 1,
            'place_request_email' => null,
            'owner_email' => 'verein@example.test',
            'contact_info' => 'Vereinshaus Zwickau',
        ], $overrides);
    }

    private function payload(array $overrides = []): array {
        return array_merge([
            'contact_name' => 'Maria Muster',
            'contact_email' => 'maria@example.test',
            'contact_phone' => '+49 123 4567',
            'participants' => [[
                'first_name' => 'Lina',
                'last_name' => 'Muster',
                'birth_date' => '2023-05-10',
            ]],
            'message' => 'Wir freuen uns auf eine Rückmeldung.',
            'privacy_acknowledged' => true,
            'website' => '',
            'form_started_at' => time() - 10,
        ], $overrides);
    }

    public function testMigrationIsIdempotentAndCreatesOnlyMetadataColumns(): void {
        ensurePlaceRequestSchema($this->db, 'sqlite');
        $campColumns = $this->db->query('PRAGMA table_info(camps)')->fetchAll(PDO::FETCH_COLUMN, 1);
        foreach (['place_requests_enabled', 'allocation_method', 'capacity_total', 'places_remaining', 'request_opens_at', 'waitlist_enabled', 'place_request_email'] as $column) {
            self::assertContains($column, $campColumns);
        }
        $migratedCamp = $this->db->query('SELECT place_requests_enabled, allocation_method, waitlist_enabled FROM camps WHERE id = 1')->fetch(PDO::FETCH_ASSOC);
        self::assertSame(0, (int)$migratedCamp['place_requests_enabled']);
        self::assertSame('request', $migratedCamp['allocation_method']);
        self::assertSame(0, (int)$migratedCamp['waitlist_enabled']);

        $eventColumns = $this->db->query('PRAGMA table_info(place_request_events)')->fetchAll(PDO::FETCH_COLUMN, 1);
        self::assertSame(
            ['id', 'request_id', 'camp_id', 'action', 'reason', 'ip_hash', 'user_agent', 'email_domain', 'message_length', 'participant_count', 'created_at'],
            $eventColumns
        );
        self::assertSame(90, placeRequestConfig(['PLACE_REQUEST_EVENT_RETENTION_DAYS' => 365])['retention_days']);
    }

    public function testAvailabilityStatesUsePublicTiersAndDeadlines(): void {
        $now = new DateTimeImmutable('2035-06-01 12:00:00', new DateTimeZone('Europe/Berlin'));
        self::assertSame('available', placeRequestState($this->camp(), $now));
        self::assertSame('few_places', placeRequestState($this->camp(['places_remaining' => 3]), $now));
        self::assertSame('waitlist', placeRequestState($this->camp(['places_remaining' => 0]), $now));
        self::assertSame('sold_out', placeRequestState($this->camp(['places_remaining' => 0, 'waitlist_enabled' => 0]), $now));
        self::assertSame('application_open', placeRequestState($this->camp(['allocation_method' => 'lottery']), $now));
        self::assertSame('not_open', placeRequestState($this->camp(['request_opens_at' => '2035-06-02 12:00:00']), $now));
        self::assertSame('closed', placeRequestState($this->camp(['registration_deadline' => '2035-06-01 12:00:00']), $now));
        self::assertSame('sold_out', placeRequestState($this->camp(['place_requests_enabled' => 0, 'status' => 'fully_booked']), $now));
        self::assertSame('contact_only', placeRequestState($this->camp(['place_requests_enabled' => 0]), $now));
    }

    public function testSuccessfulSubmissionSendsTwoDifferentMailsAndStoresNoContents(): void {
        $sent = [];
        $mailer = function ($to, $subject, $html, $replyTo) use (&$sent) {
            $sent[] = compact('to', 'subject', 'html', 'replyTo');
            return true;
        };
        $result = processPlaceRequestSubmission($this->db, [], $this->camp(['place_request_email' => 'anfragen@example.test']), $this->payload(['message' => '<script>alert(1)</script>']), ['REMOTE_ADDR' => '203.0.113.20', 'HTTP_USER_AGENT' => 'PHPUnit'], $mailer);

        self::assertSame(200, $result['status']);
        self::assertSame('request', $result['body']['request_kind']);
        self::assertCount(2, $sent);
        self::assertSame('anfragen@example.test', $sent[0]['to']);
        self::assertSame('maria@example.test', $sent[0]['replyTo']);
        self::assertStringContainsString('Lina Muster', $sent[0]['html']);
        self::assertStringContainsString('&lt;script&gt;alert(1)&lt;/script&gt;', $sent[0]['html']);
        self::assertStringNotContainsString('<script>', $sent[0]['html']);
        self::assertSame('maria@example.test', $sent[1]['to']);
        self::assertStringNotContainsString('Lina Muster', $sent[1]['html']);
        self::assertStringNotContainsString('2023-05-10', $sent[1]['html']);

        $event = $this->db->query('SELECT * FROM place_request_events')->fetch(PDO::FETCH_ASSOC);
        self::assertSame('accepted', $event['action']);
        self::assertSame(1, (int)$event['participant_count']);
        self::assertStringNotContainsString('Lina', json_encode($event));
        self::assertStringNotContainsString('2023-05-10', json_encode($event));
    }

    public function testOversizedGroupBecomesWaitlistAndConfirmationFailureStaysSuccessful(): void {
        $calls = 0;
        $mailer = function () use (&$calls) {
            $calls++;
            return $calls === 1;
        };
        $participants = array_fill(0, 2, $this->payload()['participants'][0]);
        $result = processPlaceRequestSubmission($this->db, [], $this->camp(['places_remaining' => 1]), $this->payload(['participants' => $participants]), ['REMOTE_ADDR' => '203.0.113.21'], $mailer);

        self::assertSame(200, $result['status']);
        self::assertSame('waitlist', $result['body']['request_kind']);
        self::assertFalse($result['body']['confirmation_email_sent']);
        self::assertSame('confirmation_failed', $this->db->query('SELECT reason FROM place_request_events')->fetchColumn());
    }

    public function testKindsRespectRemainingCapacityTotalCapacityAndPeriods(): void {
        self::assertSame('request', placeRequestKind($this->camp(['places_remaining' => 3]), 2)['kind']);
        self::assertSame('waitlist', placeRequestKind($this->camp(['places_remaining' => 1]), 2)['kind']);
        self::assertArrayHasKey('error', placeRequestKind($this->camp(['capacity_total' => 1, 'places_remaining' => 0]), 2));
        self::assertArrayHasKey('error', placeRequestKind($this->camp(['places_remaining' => 0, 'waitlist_enabled' => 0]), 1));
        self::assertSame('application', placeRequestKind($this->camp(['allocation_method' => 'lottery']), 2)['kind']);
        self::assertArrayHasKey('error', placeRequestKind($this->camp(['registration_deadline' => '2020-01-01 12:00:00']), 1));
    }

    public function testFallbackRecipientAndRateLimit(): void {
        $recipients = [];
        $mailer = function ($to) use (&$recipients) { $recipients[] = $to; return true; };
        for ($attempt = 0; $attempt < 6; $attempt++) {
            $result = processPlaceRequestSubmission($this->db, [], $this->camp(), $this->payload(), ['REMOTE_ADDR' => '203.0.113.30'], $mailer);
        }

        self::assertSame('verein@example.test', $recipients[0]);
        self::assertSame(200, $result['status']);
        self::assertArrayNotHasKey('request_id', $result['body']);
        self::assertSame('rate_limit', $this->db->query("SELECT reason FROM place_request_events ORDER BY id DESC LIMIT 1")->fetchColumn());
        self::assertCount(10, $recipients);
    }

    public function testAgeStateAndHoneypotAreRejectedWithoutLeakingContents(): void {
        $badPayload = normalizePlaceRequestPayload($this->payload(['participants' => [[
            'first_name' => 'Zu', 'last_name' => 'Jung', 'birth_date' => '2034-01-01',
        ]]]));
        self::assertArrayHasKey('participants.0.birth_date', validatePlaceRequestPayload($badPayload, $this->camp()));

        $sent = 0;
        $result = processPlaceRequestSubmission($this->db, [], $this->camp(), $this->payload(['website' => 'spam.example']), ['REMOTE_ADDR' => '203.0.113.22'], function () use (&$sent) { $sent++; return true; });
        self::assertSame(200, $result['status']);
        self::assertSame(0, $sent);
        self::assertSame('blocked', $this->db->query('SELECT action FROM place_request_events')->fetchColumn());
    }
}
