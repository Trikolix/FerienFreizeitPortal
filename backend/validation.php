<?php

function normalizedDate($value): ?string {
    if ($value === null || $value === '') return null;
    if (!is_string($value)) return null;
    $value = str_replace('T', ' ', $value);
    if (strlen($value) === 16) $value .= ':00';
    $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $value, new DateTimeZone('Europe/Berlin'));
    return $date && $date->format('Y-m-d H:i:s') === $value ? $value : null;
}

function validateCampPayload(array $data, array $owner, ?array $existing = null): array {
    $errors = [];
    $clean = [];
    foreach (['title' => 200, 'description' => 30000, 'location_text' => 500] as $key => $max) {
        $value = $data[$key] ?? '';
        if (!is_string($value) || mb_strlen($value) > $max) {
            $errors[$key] = 'Bitte einen Text mit höchstens ' . $max . ' Zeichen eingeben.';
            $value = '';
        }
        $clean[$key] = trim($value);
    }
    $clean['description'] = sanitizeDescription($clean['description']);
    $status = $data['status'] ?? 'draft';
    if (!is_string($status) || !in_array($status, ['draft', 'published', 'fully_booked', 'archived'], true)) {
        $errors['status'] = 'Ungültiger Status.';
        $status = 'draft';
    }
    $clean['status'] = $status;
    $categories = $data['categories'] ?? ($data['type'] ?? []);
    if (is_string($categories)) $categories = $categories === '' ? [] : explode(',', $categories);
    if (!is_array($categories) || count($categories) > 10 || count(array_filter($categories, fn($v) => !is_string($v) || mb_strlen($v) > 60))) {
        $errors['categories'] = 'Höchstens 10 Kategorien mit je 60 Zeichen sind erlaubt.';
        $categories = [];
    }
    $clean['categories'] = array_values(array_unique(array_filter(array_map('trim', $categories))));
    $clean['type'] = $clean['categories'][0] ?? '';
    foreach (['min_age' => [0, 99, true], 'max_age' => [0, 99, true], 'price_eur' => [0, 100000, false], 'location_lat' => [-90, 90, false], 'location_lng' => [-180, 180, false]] as $key => [$min, $max, $integer]) {
        $value = $data[$key] ?? null;
        if ($value === '') $value = null;
        if ($value !== null && (!is_scalar($value) || is_bool($value) || !is_numeric($value) || !is_finite((float)$value) || $value < $min || $value > $max || ($integer && (float)$value != (int)$value))) {
            $errors[$key] = "Bitte einen gültigen Wert zwischen $min und $max eingeben.";
            $value = null;
        }
        $clean[$key] = $value === null ? null : ($integer ? (int)$value : (float)$value);
    }
    if ($clean['min_age'] !== null && $clean['max_age'] !== null && $clean['min_age'] > $clean['max_age']) $errors['max_age'] = 'Das Höchstalter muss mindestens dem Mindestalter entsprechen.';
    if (($clean['location_lat'] === null) !== ($clean['location_lng'] === null)) $errors['location_lat'] = 'Bitte beide Koordinaten angeben oder beide entfernen.';
    foreach (['starts_at', 'ends_at', 'registration_deadline'] as $key) {
        $clean[$key] = normalizedDate($data[$key] ?? null);
        if (($data[$key] ?? '') !== '' && ($data[$key] ?? null) !== null && $clean[$key] === null) $errors[$key] = 'Bitte ein gültiges Datum mit Uhrzeit eingeben.';
    }
    if ($clean['starts_at'] && $clean['ends_at'] && $clean['ends_at'] <= $clean['starts_at']) $errors['ends_at'] = 'Das Ende muss nach dem Beginn liegen.';
    if ($clean['starts_at'] && $clean['registration_deadline'] && $clean['registration_deadline'] >= $clean['starts_at']) $errors['registration_deadline'] = 'Der Anmeldeschluss muss vor dem Beginn liegen.';
    if (in_array($status, ['published', 'fully_booked'], true)) {
        foreach (['title', 'categories', 'description', 'location_text', 'starts_at', 'ends_at', 'registration_deadline'] as $key) {
            if (!$clean[$key] || ($key === 'description' && trim(html_entity_decode(strip_tags($clean[$key]), ENT_QUOTES, 'UTF-8'), " \t\n\r\0\x0B\xc2\xa0") === '')) $errors[$key] = 'Dieses Feld ist zum Veröffentlichen erforderlich.';
        }
        foreach (['min_age', 'max_age', 'price_eur'] as $key) if ($clean[$key] === null) $errors[$key] = 'Dieses Feld ist zum Veröffentlichen erforderlich.';
        if (trim($owner['contact_info'] ?? '') === '') $errors['contact_info'] = 'Bitte zuerst öffentliche Kontaktinformationen im Vereinsprofil ergänzen.';
        // Already public ongoing/past camps may still be corrected or marked fully booked.
        if ($clean['starts_at'] && $clean['starts_at'] <= date('Y-m-d H:i:s') && (!$existing || !campIsPublic($existing) || $clean['starts_at'] !== normalizedDate($existing['starts_at'] ?? null))) {
            $errors['starts_at'] = 'Eine neue Veröffentlichung muss vor dem Beginn erfolgen.';
        }
    }
    return [$clean, $errors];
}

function requireValidCamp(array $data, array $owner, ?array $existing = null): array {
    [$clean, $errors] = validateCampPayload($data, $owner, $existing);
    if ($errors) jsonResponse(['error' => reset($errors), 'fields' => $errors], 422);
    return $clean;
}
