<?php
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../security.php';
require_once __DIR__ . '/../validation.php';

final class SecurityTest extends TestCase {
    public function testHtmlAllowlistRemovesExecutableContentAndKeepsFormatting(): void {
        $html = sanitizeDescription('<p onclick="alert(1)">Hallo <strong>Welt</strong></p><img src=x onerror=alert(1)><script>alert(1)</script><a href="javascript:alert(1)">Link</a><a href="https://example.test">Sicher</a><svg onload=alert(1)>x</svg>');
        self::assertStringContainsString('<strong>Welt</strong>', $html);
        self::assertStringContainsString('https://example.test', $html);
        foreach (['onclick', 'onerror', '<script', 'javascript:', '<svg', '<img'] as $bad) self::assertStringNotContainsString($bad, $html);
    }

    public function testDraftAndPublishingHaveDifferentRequirements(): void {
        [$draft, $errors] = validateCampPayload(['title' => 'Entwurf'], []);
        self::assertSame([], $errors);
        self::assertSame('draft', $draft['status']);
        [, $errors] = validateCampPayload(['title' => 'Entwurf', 'status' => 'published'], []);
        foreach (['description', 'categories', 'min_age', 'starts_at', 'price_eur', 'contact_info'] as $field) self::assertArrayHasKey($field, $errors);
    }

    public function testInvalidDatesCoordinatesAndStatusAreRejected(): void {
        [, $errors] = validateCampPayload(['starts_at' => '2026-02-30T10:00', 'status' => 'anything', 'min_age' => -1, 'location_lat' => 91], []);
        foreach (['starts_at', 'status', 'min_age', 'location_lat'] as $field) self::assertArrayHasKey($field, $errors);
        self::assertNull(normalizedDate('2026-03-29T02:30')); // nonexistent Berlin DST time
        self::assertSame('2026-10-12 10:00:00', normalizedDate('2026-10-12T10:00'));
    }

    public function testPasswordByteLimitAndSessionHash(): void {
        self::assertFalse(passwordValid(str_repeat('ä', 40)));
        self::assertFalse(passwordValid('short'));
        self::assertTrue(passwordValid('A valid passphrase'));
        $token = bin2hex(random_bytes(32));
        self::assertNotSame($token, sessionHash($token));
        self::assertNotSame($token, csrfToken($token));
    }

    public function testPublicPayloadDoesNotExposeAccountIdentifiers(): void {
        $public = publicCampPayload(['id' => 1, 'title' => 'Camp', 'username' => 'private@example.test', 'club_id' => 4, 'password_hash' => 'x', 'contact_info' => 'Public contact', 'place_request_email' => 'bookings@example.test', 'capacity_total' => 20, 'places_remaining' => 2, 'place_requests_enabled' => true, 'availability_state' => 'few_places']);
        self::assertSame(['id' => 1, 'title' => 'Camp', 'contact_info' => 'Public contact', 'availability_state' => 'few_places'], $public);
        self::assertArrayNotHasKey('place_requests_enabled', $public);
        self::assertArrayNotHasKey('place_request_email', $public);
        self::assertArrayNotHasKey('capacity_total', $public);
        self::assertArrayNotHasKey('places_remaining', $public);
    }

    public function testPublishedPlaceRequestSettingsAreValidatedAndSynchronizeStatus(): void {
        $base = [
            'title' => 'Camp', 'description' => '<p>Beschreibung</p>', 'categories' => ['Natur'],
            'min_age' => 8, 'max_age' => 16, 'location_text' => 'Zwickau',
            'starts_at' => '2035-08-01T10:00', 'ends_at' => '2035-08-08T12:00',
            'registration_deadline' => '2035-07-01T12:00', 'price_eur' => 0,
            'status' => 'published', 'place_requests_enabled' => true,
            'allocation_method' => 'request', 'capacity_total' => 20, 'places_remaining' => 0,
        ];
        [$clean, $errors] = validateCampPayload($base, ['contact_info' => 'Kontakt', 'email' => 'club@example.test']);
        self::assertSame([], $errors);
        self::assertSame('fully_booked', $clean['status']);

        [, $lotteryErrors] = validateCampPayload([...$base, 'allocation_method' => 'lottery'], ['contact_info' => 'Kontakt', 'email' => 'club@example.test']);
        self::assertArrayHasKey('request_opens_at', $lotteryErrors);
    }
}
