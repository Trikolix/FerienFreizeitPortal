<?php

function placeRequestBool($value, bool $default = false): ?bool {
    if ($value === null || $value === '') return $default;
    if (is_bool($value)) return $value;
    if ($value === 1 || $value === 0 || $value === '1' || $value === '0') return (bool)$value;
    if (is_string($value)) {
        $normalized = strtolower(trim($value));
        if ($normalized === 'true' || $normalized === 'on' || $normalized === 'yes') return true;
        if ($normalized === 'false' || $normalized === 'off' || $normalized === 'no') return false;
    }
    return null;
}

function placeRequestTextLength(string $value): int {
    return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
}

function placeRequestSchemaObjectExists(PDOException $exception): bool {
    $sqlState = (string)$exception->getCode();
    $driverCode = (int)($exception->errorInfo[1] ?? 0);
    $message = strtolower($exception->getMessage());
    return in_array($sqlState, ['42S21', '42701', '42P07'], true)
        || in_array($driverCode, [1060, 1061], true)
        || str_contains($message, 'duplicate column')
        || str_contains($message, 'already exists');
}

function ensurePlaceRequestSchema(PDO $db, string $dbConnection): void {
    $dateType = $dbConnection === 'pgsql' ? 'TIMESTAMP' : 'DATETIME';
    $boolType = $dbConnection === 'pgsql' ? 'SMALLINT' : 'BOOLEAN';
    $columns = [
        'place_requests_enabled' => "$boolType DEFAULT 0",
        'allocation_method' => "VARCHAR(20) DEFAULT 'request'",
        'capacity_total' => 'INTEGER',
        'places_remaining' => 'INTEGER',
        'request_opens_at' => $dateType,
        'waitlist_enabled' => "$boolType DEFAULT 0",
        'place_request_email' => 'VARCHAR(255)',
    ];

    foreach ($columns as $name => $type) {
        try {
            $db->exec("ALTER TABLE camps ADD COLUMN $name $type");
        } catch (PDOException $e) {
            if (!placeRequestSchemaObjectExists($e)) throw $e;
        }
    }

    $idType = $dbConnection === 'pgsql'
        ? 'SERIAL PRIMARY KEY'
        : ($dbConnection === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT');
    $db->exec("CREATE TABLE IF NOT EXISTS place_request_events (
        id $idType,
        request_id VARCHAR(64) NOT NULL,
        camp_id INTEGER NOT NULL,
        action VARCHAR(32) NOT NULL,
        reason VARCHAR(64),
        ip_hash VARCHAR(64) NOT NULL,
        user_agent TEXT,
        email_domain VARCHAR(255),
        message_length INTEGER DEFAULT 0,
        participant_count INTEGER DEFAULT 0,
        created_at $dateType DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(camp_id) REFERENCES camps(id) ON DELETE CASCADE
    )");
    try {
        $db->exec('CREATE INDEX place_request_events_lookup ON place_request_events (camp_id, ip_hash, created_at)');
    } catch (PDOException $e) {
        if (!placeRequestSchemaObjectExists($e)) throw $e;
    }
    try {
        $db->exec('CREATE INDEX place_request_events_created ON place_request_events (created_at)');
    } catch (PDOException $e) {
        if (!placeRequestSchemaObjectExists($e)) throw $e;
    }
}

function placeRequestState(array $camp, ?DateTimeImmutable $now = null): string {
    $enabled = placeRequestBool($camp['place_requests_enabled'] ?? false) === true;
    if (!$enabled) return ($camp['status'] ?? '') === 'fully_booked' ? 'sold_out' : 'contact_only';

    if (($camp['capacity_total'] ?? null) === null || ($camp['places_remaining'] ?? null) === null) {
        return 'contact_only';
    }

    $timezone = new DateTimeZone('Europe/Berlin');
    $now = $now ?? new DateTimeImmutable('now', $timezone);
    try {
        $opensAt = !empty($camp['request_opens_at'])
            ? new DateTimeImmutable(str_replace('T', ' ', (string)$camp['request_opens_at']), $timezone)
            : null;
        $deadline = !empty($camp['registration_deadline'])
            ? new DateTimeImmutable(str_replace('T', ' ', (string)$camp['registration_deadline']), $timezone)
            : null;
    } catch (Exception $e) {
        return 'closed';
    }

    if ($opensAt && $now < $opensAt) return 'not_open';
    if ($deadline && $now >= $deadline) return 'closed';
    if (($camp['allocation_method'] ?? 'request') === 'lottery') return 'application_open';

    $remaining = (int)$camp['places_remaining'];
    if ($remaining >= 4) return 'available';
    if ($remaining >= 1) return 'few_places';
    return placeRequestBool($camp['waitlist_enabled'] ?? false) === true ? 'waitlist' : 'sold_out';
}

function normalizePlaceRequestPayload(array $data): array {
    $participants = $data['participants'] ?? [];
    if (!is_array($participants) || !array_is_list($participants)) $participants = [];

    return [
        'contact_name' => trim(is_string($data['contact_name'] ?? null) ? $data['contact_name'] : ''),
        'contact_email' => strtolower(trim(is_string($data['contact_email'] ?? null) ? $data['contact_email'] : '')),
        'contact_phone' => trim(is_string($data['contact_phone'] ?? null) ? $data['contact_phone'] : ''),
        'participants' => array_map(static fn($participant) => [
            'first_name' => trim(is_array($participant) && is_string($participant['first_name'] ?? null) ? $participant['first_name'] : ''),
            'last_name' => trim(is_array($participant) && is_string($participant['last_name'] ?? null) ? $participant['last_name'] : ''),
            'birth_date' => trim(is_array($participant) && is_string($participant['birth_date'] ?? null) ? $participant['birth_date'] : ''),
        ], $participants),
        'message' => trim(is_string($data['message'] ?? null) ? $data['message'] : ''),
        'privacy_acknowledged' => placeRequestBool($data['privacy_acknowledged'] ?? null),
        'website' => trim(is_string($data['website'] ?? null) ? $data['website'] : ''),
        'form_started_at' => $data['form_started_at'] ?? null,
    ];
}

function validPlaceRequestDate(string $value): ?DateTimeImmutable {
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('Europe/Berlin'));
    return $date && $date->format('Y-m-d') === $value ? $date : null;
}

function participantAgeOnDate(string $birthDate, string $referenceDate): ?int {
    $birth = validPlaceRequestDate($birthDate);
    try {
        $reference = new DateTimeImmutable(substr(str_replace('T', ' ', $referenceDate), 0, 10), new DateTimeZone('Europe/Berlin'));
    } catch (Exception $e) {
        return null;
    }
    if (!$birth || $birth > $reference) return null;
    return $birth->diff($reference)->y;
}

function validatePlaceRequestPayload(array $payload, array $camp): array {
    $errors = [];
    if (placeRequestTextLength($payload['contact_name']) < 2 || placeRequestTextLength($payload['contact_name']) > 120) {
        $errors['contact_name'] = 'Bitte gib den Namen der Kontaktperson an.';
    }
    if (!filter_var($payload['contact_email'], FILTER_VALIDATE_EMAIL) || placeRequestTextLength($payload['contact_email']) > 254) {
        $errors['contact_email'] = 'Bitte gib eine gültige E-Mail-Adresse an.';
    }
    if (placeRequestTextLength($payload['contact_phone']) < 3 || placeRequestTextLength($payload['contact_phone']) > 50) {
        $errors['contact_phone'] = 'Bitte gib eine gültige Telefonnummer an.';
    }
    if (placeRequestTextLength($payload['message']) > 2000) {
        $errors['message'] = 'Die Nachricht darf höchstens 2.000 Zeichen enthalten.';
    }
    if ($payload['privacy_acknowledged'] !== true) {
        $errors['privacy_acknowledged'] = 'Bitte bestätige, dass du die Datenschutzhinweise gelesen hast.';
    }

    $participants = $payload['participants'];
    if (count($participants) < 1 || count($participants) > 10) {
        $errors['participants'] = 'Bitte gib zwischen einer und zehn teilnehmenden Personen an.';
        return $errors;
    }

    foreach ($participants as $index => $participant) {
        $prefix = "participants.$index";
        if (placeRequestTextLength($participant['first_name']) < 1 || placeRequestTextLength($participant['first_name']) > 120) {
            $errors["$prefix.first_name"] = 'Bitte gib den Vornamen an.';
        }
        if (placeRequestTextLength($participant['last_name']) < 1 || placeRequestTextLength($participant['last_name']) > 120) {
            $errors["$prefix.last_name"] = 'Bitte gib den Nachnamen an.';
        }
        $birth = validPlaceRequestDate($participant['birth_date']);
        if (!$birth) {
            $errors["$prefix.birth_date"] = 'Bitte gib ein gültiges Geburtsdatum an.';
            continue;
        }
        $age = participantAgeOnDate($participant['birth_date'], (string)($camp['starts_at'] ?? ''));
        if ($age === null || $age < (int)$camp['min_age'] || $age > (int)$camp['max_age']) {
            $errors["$prefix.birth_date"] = 'Das Alter muss am Beginn der Freizeit innerhalb der angegebenen Altersgrenzen liegen.';
        }
    }
    return $errors;
}

function placeRequestConfig(array $configSource): array {
    return [
        'rate_limit_max' => max(1, (int)configValue($configSource, 'PLACE_REQUEST_RATE_LIMIT_MAX', 5)),
        'rate_limit_window_seconds' => max(60, (int)configValue($configSource, 'PLACE_REQUEST_RATE_LIMIT_WINDOW_SECONDS', 900)),
        'min_seconds' => max(1, (int)configValue($configSource, 'PLACE_REQUEST_MIN_SECONDS', 3)),
        'retention_days' => min(90, max(1, (int)configValue($configSource, 'PLACE_REQUEST_EVENT_RETENTION_DAYS', 90))),
        'log_salt' => configValue($configSource, 'PLACE_REQUEST_LOG_SALT', appConfig('APP_KEY', 'ferienfreizeitportal-place-request-log')),
        'subject_prefix' => configValue($configSource, 'PLACE_REQUEST_SUBJECT_PREFIX', '[Ferienfreizeitportal]'),
    ];
}

function placeRequestClientIpAddress(array $server): string {
    $candidates = [];
    $trusted = array_filter(array_map('trim', explode(',', (string)appConfig('TRUSTED_PROXIES', ''))));
    $isTrusted = in_array($server['REMOTE_ADDR'] ?? '', $trusted, true);
    if ($isTrusted && !empty($server['HTTP_CF_CONNECTING_IP'])) $candidates[] = $server['HTTP_CF_CONNECTING_IP'];
    if ($isTrusted && !empty($server['HTTP_X_FORWARDED_FOR'])) {
        $parts = array_reverse(array_map('trim', explode(',', $server['HTTP_X_FORWARDED_FOR'])));
        foreach ($parts as $part) {
            if (!in_array($part, $trusted, true)) {
                $candidates[] = $part;
                break;
            }
        }
    }
    if (!empty($server['REMOTE_ADDR'])) $candidates[] = $server['REMOTE_ADDR'];
    foreach ($candidates as $candidate) if (filter_var($candidate, FILTER_VALIDATE_IP)) return $candidate;
    return '0.0.0.0';
}

function placeRequestMetadata(array $payload, array $server, array $config, int $campId): array {
    $emailParts = explode('@', $payload['contact_email']);
    return [
        'request_id' => bin2hex(random_bytes(12)),
        'camp_id' => $campId,
        'ip_hash' => hash('sha256', placeRequestClientIpAddress($server) . '|' . $config['log_salt']),
        'user_agent' => function_exists('mb_substr')
            ? mb_substr((string)($server['HTTP_USER_AGENT'] ?? ''), 0, 255)
            : substr((string)($server['HTTP_USER_AGENT'] ?? ''), 0, 255),
        'email_domain' => count($emailParts) === 2 ? substr($emailParts[1], 0, 255) : null,
        'message_length' => placeRequestTextLength($payload['message']),
        'participant_count' => count($payload['participants']),
    ];
}

function purgeOldPlaceRequestEvents(PDO $db, int $retentionDays): void {
    $cutoff = date('Y-m-d H:i:s', time() - ($retentionDays * 86400));
    $check = $db->prepare('SELECT 1 FROM place_request_events WHERE created_at < ? LIMIT 1');
    $check->execute([$cutoff]);
    if (!$check->fetchColumn()) return;
    $stmt = $db->prepare('DELETE FROM place_request_events WHERE created_at < ?');
    $stmt->execute([$cutoff]);
}

function logPlaceRequestEvent(PDO $db, array $metadata, string $action, ?string $reason = null): void {
    $stmt = $db->prepare('INSERT INTO place_request_events (request_id, camp_id, action, reason, ip_hash, user_agent, email_domain, message_length, participant_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $metadata['request_id'], $metadata['camp_id'], $action, $reason, $metadata['ip_hash'],
        $metadata['user_agent'], $metadata['email_domain'], $metadata['message_length'],
        $metadata['participant_count'], date('Y-m-d H:i:s'),
    ]);
}

function countRecentPlaceRequests(PDO $db, array $metadata, int $windowSeconds): int {
    $stmt = $db->prepare('SELECT COUNT(*) FROM place_request_events WHERE camp_id = ? AND ip_hash = ? AND created_at >= ?');
    $stmt->execute([$metadata['camp_id'], $metadata['ip_hash'], date('Y-m-d H:i:s', time() - $windowSeconds)]);
    return (int)$stmt->fetchColumn();
}

function placeRequestAbuseReason(array $payload, array $config, ?int $now = null): ?string {
    if ($payload['website'] !== '') return 'honeypot';
    if (!is_numeric($payload['form_started_at'])) return 'missing_timer';
    $startedAt = (float)$payload['form_started_at'];
    if ($startedAt > 1000000000000) $startedAt /= 1000;
    if (($now ?? time()) - $startedAt < $config['min_seconds']) return 'too_fast';
    if (preg_match_all('/https?:\/\/|www\.|<a\s/i', $payload['message']) > 3) return 'too_many_links';
    return null;
}

function placeRequestKind(array $camp, int $participantCount): array {
    $state = placeRequestState($camp);
    if ($participantCount > (int)$camp['capacity_total']) {
        return ['error' => 'So viele Personen können nicht gemeinsam für diese Freizeit angefragt werden.'];
    }
    if ($state === 'application_open') {
        return ['kind' => 'application'];
    }
    if (in_array($state, ['available', 'few_places'], true)) {
        if ($participantCount <= (int)$camp['places_remaining']) return ['kind' => 'request'];
        if (placeRequestBool($camp['waitlist_enabled'] ?? false) === true) return ['kind' => 'waitlist'];
        return ['error' => 'Für diese Gruppengröße sind aktuell nicht genügend Plätze verfügbar. Bitte reduziere die Anzahl.'];
    }
    if ($state === 'waitlist') return ['kind' => 'waitlist'];

    $messages = [
        'not_open' => 'Der Anfragezeitraum hat noch nicht begonnen.',
        'closed' => 'Der Anfrage- oder Bewerbungszeitraum ist beendet.',
        'sold_out' => 'Diese Freizeit ist ausgebucht und führt keine Warteliste.',
        'contact_only' => 'Für diese Freizeit sind keine Platzanfragen über das Portal möglich.',
    ];
    return ['error' => $messages[$state] ?? 'Für diese Freizeit ist derzeit keine Anfrage möglich.'];
}

function placeRequestKindLabel(string $kind): string {
    return match ($kind) {
        'application' => 'Bewerbung',
        'waitlist' => 'Wartelistenanfrage',
        default => 'Platzanfrage',
    };
}

function placeRequestProviderMailHtml(array $payload, array $camp, string $kind, string $requestId): string {
    $escape = static fn($value) => htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
    $participantRows = '';
    foreach ($payload['participants'] as $index => $participant) {
        $number = $index + 1;
        $participantRows .= '<li><strong>Person ' . $number . ':</strong> '
            . $escape($participant['first_name'] . ' ' . $participant['last_name'])
            . ', geboren am ' . $escape($participant['birth_date']) . '</li>';
    }
    $message = $payload['message'] === ''
        ? '<em>Keine zusätzliche Nachricht.</em>'
        : nl2br($escape($payload['message']));

    return '<!doctype html><html lang="de"><head><meta charset="UTF-8"><title>' . $escape(placeRequestKindLabel($kind)) . '</title></head>'
        . '<body style="font-family:Arial,sans-serif;line-height:1.5;color:#2e2e2e">'
        . '<h1>' . $escape(placeRequestKindLabel($kind)) . '</h1>'
        . '<p><strong>Freizeit:</strong> ' . $escape($camp['title'] ?? '') . '<br>'
        . '<strong>Request-ID:</strong> ' . $escape($requestId) . '</p>'
        . '<h2>Kontaktperson</h2><p><strong>Name:</strong> ' . $escape($payload['contact_name']) . '<br>'
        . '<strong>E-Mail:</strong> ' . $escape($payload['contact_email']) . '<br>'
        . '<strong>Telefon:</strong> ' . $escape($payload['contact_phone']) . '</p>'
        . '<h2>Teilnehmende</h2><ul>' . $participantRows . '</ul>'
        . '<h2>Nachricht</h2><p>' . $message . '</p>'
        . '<p>Diese Übermittlung ist eine unverbindliche Anfrage. Reservierung, verbindliche Zusage und Zahlung werden direkt durch den Anbieter abgewickelt.</p>'
        . '</body></html>';
}

function placeRequestConfirmationMailHtml(array $camp, string $kind, string $requestId): string {
    $escape = static fn($value) => htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
    $contact = trim((string)($camp['contact_info'] ?? ''));
    return '<!doctype html><html lang="de"><head><meta charset="UTF-8"><title>Anfrage eingegangen</title></head>'
        . '<body style="font-family:Arial,sans-serif;line-height:1.5;color:#2e2e2e">'
        . '<h1>' . $escape(placeRequestKindLabel($kind)) . ' übermittelt</h1>'
        . '<p>Deine Anfrage für <strong>' . $escape($camp['title'] ?? '') . '</strong> wurde an den Anbieter übermittelt.</p>'
        . '<p><strong>Request-ID:</strong> ' . $escape($requestId) . '</p>'
        . '<p>Damit ist noch kein Platz reserviert oder verbindlich gebucht. Der Anbieter meldet sich zur Bestätigung und weiteren Abwicklung direkt bei dir.</p>'
        . ($contact !== '' ? '<p><strong>Öffentliche Kontaktinformation des Anbieters:</strong><br>' . nl2br($escape($contact)) . '</p>' : '')
        . '<p>Diese Bestätigung enthält bewusst keine Namen oder Geburtsdaten der teilnehmenden Personen.</p>'
        . '</body></html>';
}

function processPlaceRequestSubmission(PDO $db, array $configSource, array $camp, array $data, array $server, ?callable $mailer = null): array {
    $config = placeRequestConfig($configSource);
    $payload = normalizePlaceRequestPayload($data);
    $metadata = placeRequestMetadata($payload, $server, $config, (int)$camp['id']);
    purgeOldPlaceRequestEvents($db, $config['retention_days']);

    $abuseReason = placeRequestAbuseReason($payload, $config);
    if ($abuseReason) {
        logPlaceRequestEvent($db, $metadata, 'blocked', $abuseReason);
        return ['status' => 200, 'body' => ['message' => 'Danke, deine Anfrage wurde übermittelt. Der Anbieter meldet sich bei dir.']];
    }
    if (countRecentPlaceRequests($db, $metadata, $config['rate_limit_window_seconds']) >= $config['rate_limit_max']) {
        logPlaceRequestEvent($db, $metadata, 'blocked', 'rate_limit');
        return ['status' => 200, 'body' => ['message' => 'Danke, deine Anfrage wurde übermittelt. Der Anbieter meldet sich bei dir.']];
    }

    $errors = validatePlaceRequestPayload($payload, $camp);
    if ($errors) {
        logPlaceRequestEvent($db, $metadata, 'rejected_validation', (string)array_key_first($errors));
        return ['status' => 422, 'body' => ['error' => reset($errors), 'fields' => $errors]];
    }

    $kindResult = placeRequestKind($camp, count($payload['participants']));
    if (isset($kindResult['error'])) {
        logPlaceRequestEvent($db, $metadata, 'rejected_state', placeRequestState($camp));
        return ['status' => 409, 'body' => ['error' => $kindResult['error']]];
    }
    $kind = $kindResult['kind'];
    $recipient = trim((string)($camp['place_request_email'] ?? '')) ?: trim((string)($camp['owner_email'] ?? ''));
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        logPlaceRequestEvent($db, $metadata, 'delivery_failed', 'recipient');
        return ['status' => 503, 'body' => ['error' => 'Die Anfrage kann derzeit nicht zugestellt werden. Bitte nutze die Kontaktinformationen des Anbieters.']];
    }

    $send = $mailer ?? static fn($to, $subject, $html, $replyTo = null) => sendHtmlMail($to, $subject, $html, $replyTo);
    $label = placeRequestKindLabel($kind);
    $subject = trim($config['subject_prefix'] . ' ' . $label . ': ' . ($camp['title'] ?? 'Freizeit'));
    $providerSent = $send($recipient, $subject, placeRequestProviderMailHtml($payload, $camp, $kind, $metadata['request_id']), $payload['contact_email']);
    if ($providerSent === false) {
        logPlaceRequestEvent($db, $metadata, 'delivery_failed', 'provider_mail');
        return ['status' => 503, 'body' => ['error' => 'Die Anfrage konnte gerade nicht versendet werden. Deine Eingaben bleiben erhalten; bitte versuche es später erneut.']];
    }

    $confirmationSent = $send(
        $payload['contact_email'],
        trim($config['subject_prefix'] . ' Deine ' . $label . ' ist eingegangen'),
        placeRequestConfirmationMailHtml($camp, $kind, $metadata['request_id']),
        null
    );
    logPlaceRequestEvent($db, $metadata, 'accepted', $confirmationSent === false ? 'confirmation_failed' : null);

    return [
        'status' => 200,
        'body' => [
            'message' => 'Deine ' . $label . ' wurde an den Anbieter übermittelt. Damit ist noch kein Platz reserviert.',
            'request_id' => $metadata['request_id'],
            'request_kind' => $kind,
            'confirmation_email_sent' => $confirmationSent !== false,
        ],
    ];
}
