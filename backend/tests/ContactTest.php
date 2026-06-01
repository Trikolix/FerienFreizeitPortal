<?php
use PHPUnit\Framework\TestCase;

class ContactTest extends TestCase {
    private PDO $db;

    public static function setUpBeforeClass(): void {
        if (!defined('PHPUNIT_RUNNING')) {
            define('PHPUNIT_RUNNING', true);
        }

        $_SERVER['REQUEST_METHOD'] = 'GET';
        $_SERVER['REQUEST_URI'] = '/';

        require_once __DIR__ . '/../index.php';
    }

    protected function setUp(): void {
        $this->db = new PDO('sqlite::memory:');
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        ensureContactEventsSchema($this->db, 'sqlite');
    }

    private function validPayload(array $overrides = []): array {
        return array_merge([
            'name' => 'Max Mustermann',
            'email' => 'max@example.test',
            'message' => 'Das ist eine ausreichend lange Kontaktanfrage zur Plattform.',
            'website' => '',
            'form_started_at' => time() - 10,
        ], $overrides);
    }

    private function server(array $overrides = []): array {
        return array_merge([
            'REMOTE_ADDR' => '203.0.113.10',
            'HTTP_USER_AGENT' => 'PHPUnit Contact Test',
        ], $overrides);
    }

    private function config(array $overrides = []): array {
        return array_merge([
            'CONTACT_TO' => 'kontakt@example.test',
            'CONTACT_SUBJECT_PREFIX' => '[Test]',
            'CONTACT_RATE_LIMIT_MAX' => 5,
            'CONTACT_RATE_LIMIT_WINDOW_SECONDS' => 900,
            'CONTACT_MIN_SECONDS' => 3,
            'CONTACT_LOG_SALT' => 'test-salt',
        ], $overrides);
    }

    public function testSuccessfulContactSubmissionSendsMailAndLogsMetadataOnly(): void {
        $sent = [];
        $result = processContactSubmission(
            $this->db,
            $this->config(),
            $this->validPayload(['message' => 'Bitte melden Sie sich wegen dieser ausreichend langen Anfrage.']),
            $this->server(),
            function ($to, $subject, $html) use (&$sent) {
                $sent[] = compact('to', 'subject', 'html');
            }
        );

        $this->assertSame(200, $result['status']);
        $this->assertCount(1, $sent);
        $this->assertSame('kontakt@example.test', $sent[0]['to']);

        $event = $this->db->query('SELECT * FROM contact_events')->fetch(PDO::FETCH_ASSOC);
        $this->assertSame('accepted', $event['action']);
        $this->assertSame('example.test', $event['email_domain']);
        $this->assertStringNotContainsString('Bitte melden', json_encode($event));
    }

    public function testInvalidEmailIsRejectedWithReadableValidationError(): void {
        $result = processContactSubmission(
            $this->db,
            $this->config(),
            $this->validPayload(['email' => 'keine-mail']),
            $this->server(),
            fn () => null
        );

        $this->assertSame(400, $result['status']);
        $this->assertArrayHasKey('error', $result['body']);

        $event = $this->db->query('SELECT action, reason FROM contact_events')->fetch(PDO::FETCH_ASSOC);
        $this->assertSame('rejected_validation', $event['action']);
        $this->assertSame('email', $event['reason']);
    }

    public function testTooLongMessageIsRejected(): void {
        $result = processContactSubmission(
            $this->db,
            $this->config(),
            $this->validPayload(['message' => str_repeat('a', 4001)]),
            $this->server(),
            fn () => null
        );

        $this->assertSame(400, $result['status']);
        $event = $this->db->query('SELECT action, reason FROM contact_events')->fetch(PDO::FETCH_ASSOC);
        $this->assertSame('rejected_validation', $event['action']);
        $this->assertSame('message', $event['reason']);
    }

    public function testHoneypotSubmissionIsBlockedWithoutMail(): void {
        $sent = 0;
        $result = processContactSubmission(
            $this->db,
            $this->config(),
            $this->validPayload(['website' => 'https://spam.example']),
            $this->server(),
            function () use (&$sent) {
                $sent++;
            }
        );

        $this->assertSame(200, $result['status']);
        $this->assertSame(0, $sent);
        $event = $this->db->query('SELECT action, reason FROM contact_events')->fetch(PDO::FETCH_ASSOC);
        $this->assertSame('blocked', $event['action']);
        $this->assertSame('honeypot', $event['reason']);
    }

    public function testTooFastSubmissionIsBlockedWithoutMail(): void {
        $sent = 0;
        $result = processContactSubmission(
            $this->db,
            $this->config(),
            $this->validPayload(['form_started_at' => time()]),
            $this->server(),
            function () use (&$sent) {
                $sent++;
            }
        );

        $this->assertSame(200, $result['status']);
        $this->assertSame(0, $sent);
        $event = $this->db->query('SELECT action, reason FROM contact_events')->fetch(PDO::FETCH_ASSOC);
        $this->assertSame('blocked', $event['action']);
        $this->assertSame('too_fast', $event['reason']);
    }

    public function testRateLimitBlocksRepeatedIp(): void {
        $sent = 0;
        $mailer = function () use (&$sent) {
            $sent++;
        };

        processContactSubmission($this->db, $this->config(['CONTACT_RATE_LIMIT_MAX' => 1]), $this->validPayload(), $this->server(), $mailer);
        $result = processContactSubmission($this->db, $this->config(['CONTACT_RATE_LIMIT_MAX' => 1]), $this->validPayload(['email' => 'zweite@example.test']), $this->server(), $mailer);

        $this->assertSame(200, $result['status']);
        $this->assertSame(1, $sent);

        $events = $this->db->query('SELECT action, reason FROM contact_events ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC);
        $this->assertSame('accepted', $events[0]['action']);
        $this->assertSame('blocked', $events[1]['action']);
        $this->assertSame('rate_limit', $events[1]['reason']);
    }
}
