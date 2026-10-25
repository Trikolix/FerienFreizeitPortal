<?php
// Booking portal domain. These helpers never connect to a database on import.
final class PortalError extends RuntimeException {
    public function __construct(string $message, public int $status = 422, public array $fields = []) { parent::__construct($message); }
}

function portalNow(): string { return date('Y-m-d H:i:s'); }
function portalLegacyTimestamp(?string $value): string { return $value ? (new DateTimeImmutable($value, new DateTimeZone('Europe/Berlin')))->format('Y-m-d H:i:s') : portalNow(); }
function portalJson(array $data): string { return json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); }
function portalDecode(?string $json): array { return $json ? json_decode($json, true, 64, JSON_THROW_ON_ERROR) : []; }
function portalRow(PDO $db, string $sql, array $params = []): ?array {
    $statement = $db->prepare($sql); $statement->execute($params);
    return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
}
function portalRows(PDO $db, string $sql, array $params = []): array {
    $statement = $db->prepare($sql); $statement->execute($params); return $statement->fetchAll(PDO::FETCH_ASSOC);
}
function portalExec(PDO $db, string $sql, array $params = []): void { $statement = $db->prepare($sql); $statement->execute($params); }
function portalText(array $data, string $key, int $max = 255): string {
    $value = $data[$key] ?? '';
    if (!is_string($value) || mb_strlen($value) > $max) throw new PortalError('Bitte prüfe die markierte Angabe.', 422, [$key => "Höchstens $max Zeichen sind erlaubt."]);
    return trim($value);
}
function portalProviderNotice(string $name): string {
    return str_replace('{provider}', $name, (string)appConfig('PROVIDER_NOTICE_TEMPLATE', 'Anbieter dieser Freizeit ist {provider}. Der Jugendring Westsachsen betreibt das Vermittlungsportal.'));
}
function portalProviderStatusLabel(string $status): string { return ['draft' => 'In Bearbeitung', 'submitted' => 'Zur Prüfung eingereicht', 'approved' => 'Freigegeben', 'changes_requested' => 'Überarbeitung erforderlich', 'suspended' => 'Gesperrt'][$status] ?? $status; }

function ensurePortalSchema(PDO $db, string $driver): void {
    $id = $driver === 'pgsql' ? 'SERIAL PRIMARY KEY' : ($driver === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT');
    $tables = [
        "providers (id $id, user_id INTEGER NOT NULL UNIQUE, status VARCHAR(24) NOT NULL DEFAULT 'draft', email_verified INTEGER NOT NULL DEFAULT 0, profile_data TEXT NOT NULL, review_reason TEXT, created_at VARCHAR(19) NOT NULL, updated_at VARCHAR(19) NOT NULL, closed_at VARCHAR(19), FOREIGN KEY(user_id) REFERENCES users(id))",
        "provider_history (id $id, provider_id INTEGER NOT NULL, actor_id INTEGER, action VARCHAR(32) NOT NULL, status VARCHAR(24) NOT NULL, profile_data TEXT NOT NULL, reason TEXT, created_at VARCHAR(19) NOT NULL, FOREIGN KEY(provider_id) REFERENCES providers(id))",
        "camp_revisions (id $id, camp_id INTEGER NOT NULL, data_json TEXT NOT NULL, created_by INTEGER, reviewed_by INTEGER, review_status VARCHAR(24) NOT NULL, review_reason TEXT, created_at VARCHAR(19) NOT NULL, reviewed_at VARCHAR(19), FOREIGN KEY(camp_id) REFERENCES camps(id))",
        "camp_revision_images (id $id, revision_id INTEGER NOT NULL, image_url VARCHAR(255) NOT NULL, FOREIGN KEY(revision_id) REFERENCES camp_revisions(id))",
        "camp_drafts (camp_id INTEGER PRIMARY KEY, data_json TEXT NOT NULL, review_status VARCHAR(24) NOT NULL DEFAULT 'draft', revision_id INTEGER, review_reason TEXT, updated_at VARCHAR(19) NOT NULL, FOREIGN KEY(camp_id) REFERENCES camps(id) ON DELETE CASCADE)",
        "camp_portal_state (camp_id INTEGER PRIMARY KEY, approved_revision_id INTEGER, external_occupied INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(camp_id) REFERENCES camps(id) ON DELETE CASCADE)",
        "bookings (id $id, reference VARCHAR(32) NOT NULL UNIQUE, camp_id INTEGER NOT NULL, provider_id INTEGER NOT NULL, revision_id INTEGER NOT NULL, status VARCHAR(16) NOT NULL, participant_count INTEGER NOT NULL, contact_name TEXT, contact_email VARCHAR(255), contact_phone TEXT, message TEXT, snapshot_json TEXT NOT NULL, created_at VARCHAR(19) NOT NULL, updated_at VARCHAR(19) NOT NULL, anonymized_at VARCHAR(19), FOREIGN KEY(camp_id) REFERENCES camps(id), FOREIGN KEY(provider_id) REFERENCES providers(id), FOREIGN KEY(revision_id) REFERENCES camp_revisions(id))",
        "booking_participants (id $id, booking_id INTEGER NOT NULL, camp_id INTEGER NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, birth_date VARCHAR(10) NOT NULL, fingerprint VARCHAR(64) NOT NULL, FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE)",
        "booking_events (id $id, booking_id INTEGER NOT NULL, actor_id INTEGER, action VARCHAR(24) NOT NULL, from_status VARCHAR(16), to_status VARCHAR(16) NOT NULL, created_at VARCHAR(19) NOT NULL, FOREIGN KEY(booking_id) REFERENCES bookings(id))",
        "portal_tokens (id $id, token_hash VARCHAR(64) NOT NULL UNIQUE, purpose VARCHAR(24) NOT NULL, email VARCHAR(255) NOT NULL, provider_id INTEGER, camp_id INTEGER, booking_id INTEGER, expires_at VARCHAR(19) NOT NULL, used_at VARCHAR(19))",
        "mail_outbox (id $id, provider_id INTEGER, kind VARCHAR(32) NOT NULL, recipient VARCHAR(255) NOT NULL, payload_json TEXT NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, available_at VARCHAR(19) NOT NULL, locked_at VARCHAR(19), lock_token VARCHAR(64), sent_at VARCHAR(19), created_at VARCHAR(19) NOT NULL)",
    ];
    foreach ($tables as $table) $db->exec('CREATE TABLE IF NOT EXISTS ' . ($driver === 'mysql' ? str_replace(' TEXT', ' LONGTEXT', $table) : $table));
    foreach ([['booking_participants', 'participant_lookup', 'camp_id, fingerprint'], ['bookings', 'booking_camp_status', 'camp_id, status'], ['provider_history', 'provider_history_date', 'provider_id, created_at'], ['mail_outbox', 'mail_delivery_queue', 'status, available_at']] as [$table, $name, $columns]) {
        try { $db->exec("CREATE INDEX $name ON $table ($columns)"); }
        catch (PDOException $error) { if (!placeRequestSchemaObjectExists($error)) throw $error; }
    }
}

function portalProvider(PDO $db, int $userId): ?array { return portalRow($db, 'SELECT * FROM providers WHERE user_id = ?', [$userId]); }
function portalProviderHistory(PDO $db, array $provider, string $action, ?int $actor): void {
    portalExec($db, 'INSERT INTO provider_history (provider_id, actor_id, action, status, profile_data, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [$provider['id'], $actor, $action, $provider['status'], $provider['profile_data'], $provider['review_reason'] ?? null, portalNow()]);
}
function portalEnsureProvider(PDO $db, array $user, bool $imported = false): array {
    $existing = portalProvider($db, (int)$user['id']);
    if ($existing) return $existing;
    $profile = ['public_name' => $user['club_name'] ?: $user['display_name'], 'legal_name' => $user['club_name'] ?: $user['display_name'], 'contact_info' => $user['contact_info'] ?? '', 'website' => '', 'links' => [], 'tax_ids' => [], 'establishments' => [], 'residence_countries' => []];
    portalExec($db, "INSERT INTO providers (user_id, status, email_verified, profile_data, created_at, updated_at) VALUES (?, 'draft', ?, ?, ?, ?)", [$user['id'], (int)$user['is_active'], portalJson($profile), $imported ? portalLegacyTimestamp($user['created_at'] ?? null) : portalNow(), portalNow()]);
    $provider = portalProvider($db, (int)$user['id']);
    portalProviderHistory($db, $provider, $imported ? 'imported' : 'created', null);
    return $provider;
}

function portalMigrate(PDO $db, string $driver): void {
    ensurePortalSchema($db, $driver);
    beginWrite($db);
    try {
        if (portalRow($db, 'SELECT version FROM app_migrations WHERE version = 4')) { $db->commit(); return; }
        foreach (portalRows($db, "SELECT * FROM users WHERE role IN ('user', 'club')") as $user) portalEnsureProvider($db, $user, true);
        foreach (portalRows($db, 'SELECT * FROM camps') as $camp) {
            $external = max(0, (int)$camp['capacity_total'] - (int)$camp['places_remaining']);
            portalExec($db, 'INSERT INTO camp_portal_state (camp_id, external_occupied) VALUES (?, ?)', [$camp['id'], $external]);
            $data = campWithRelations($db, $camp);
            $data['allocation_method'] = 'request';
            $past = !empty($camp['ends_at']) && $camp['ends_at'] < portalNow();
            $data['status'] = $camp['status'] === 'archived' || $past ? 'archived' : 'draft';
            $wasPublic = !$past && in_array($camp['status'], ['published', 'fully_booked'], true);
            $revision = $wasPublic ? portalCreateRevision($db, (int)$camp['id'], $data, null) : null;
            portalExec($db, 'INSERT INTO camp_drafts (camp_id, data_json, review_status, revision_id, updated_at) VALUES (?, ?, ?, ?, ?)', [$camp['id'], portalJson($data), $wasPublic ? 'submitted' : 'draft', $revision, portalNow()]);
            portalExec($db, 'UPDATE camps SET status = ?, allocation_method = ? WHERE id = ?', [$data['status'], 'request', $camp['id']]);
        }
        portalExec($db, 'INSERT INTO app_migrations (version) VALUES (4)');
        $db->commit();
    } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
}

function portalCountries(): array { return explode(' ', 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'); }
function portalProfile(array $data, bool $complete = false): array {
    $profile = [];
    foreach (['public_name' => 200, 'legal_name' => 200, 'legal_form' => 120, 'street' => 200, 'postal_code' => 20, 'city' => 120, 'country' => 2, 'contact_info' => 2000, 'public_email' => 254, 'website' => 500, 'vat_id' => 80, 'register_type' => 80, 'register_number' => 100, 'missing_register_reason' => 500, 'missing_tax_reason' => 500, 'financial_account' => 150, 'account_holder' => 200, 'account_holder_details' => 500] as $key => $max) $profile[$key] = portalText($data, $key, $max);
    $profile['country'] = strtoupper($profile['country']);
    if ($profile['country'] && !preg_match('/^[A-Z]{2}$/D', $profile['country'])) throw new PortalError('Bitte einen zweistelligen Ländercode eingeben.');
    if ($profile['public_email'] && !filter_var($profile['public_email'], FILTER_VALIDATE_EMAIL)) throw new PortalError('Die öffentliche E-Mail-Adresse ist ungültig.');
    $profile['links'] = [];
    if (!is_array($data['links'] ?? []) || count($data['links'] ?? []) > 20) throw new PortalError('Höchstens 20 Links sind erlaubt.');
    foreach ($data['links'] ?? [] as $link) {
        if (!is_array($link)) throw new PortalError('Bitte die Links prüfen.');
        $label = portalText($link, 'label', 120); $url = portalText($link, 'url', 500);
        if ($label || $url) $profile['links'][] = ['label' => $label ?: $url, 'url' => $url];
    }
    foreach (array_merge([$profile['website']], array_column($profile['links'], 'url')) as $url) if ($url && (!filter_var($url, FILTER_VALIDATE_URL) || !in_array(strtolower(parse_url($url, PHP_URL_SCHEME) ?? ''), ['https', 'http'], true))) throw new PortalError('Links müssen vollständige HTTP- oder HTTPS-Adressen sein.');
    foreach (['tax_ids', 'establishments'] as $key) {
        if (!is_array($data[$key] ?? []) || !array_is_list($data[$key] ?? []) || count($data[$key] ?? []) > 40) throw new PortalError('Bitte die wiederholbaren Angaben prüfen.');
        $profile[$key] = [];
        foreach ($data[$key] ?? [] as $entry) {
            if (!is_array($entry)) throw new PortalError('Bitte die Länderangaben prüfen.');
            $country = strtoupper(portalText($entry, 'country', 2));
            $valueKey = $key === 'tax_ids' ? 'number' : 'address';
            $value = portalText($entry, $valueKey, $key === 'tax_ids' ? 100 : 500);
            if (!$country && !$value) continue;
            if (!in_array($country, portalCountries(), true) || !$value) throw new PortalError('Bitte einen EU-Mitgliedstaat und die zugehörige Angabe ergänzen.');
            $profile[$key][] = ['country' => $country, $valueKey => $value];
        }
    }
    if (!is_array($data['residence_countries'] ?? []) || count($data['residence_countries'] ?? []) > 27) throw new PortalError('Bitte die Ansässigkeitsstaaten prüfen.');
    $profile['residence_countries'] = array_values(array_unique($data['residence_countries'] ?? []));
    foreach ($profile['residence_countries'] as $country) if (!is_string($country) || !in_array($country, portalCountries(), true)) throw new PortalError('Ungültiger EU-Ansässigkeitsstaat.');
    if ($complete) {
        $errors = [];
        foreach (['public_name', 'legal_name', 'legal_form', 'street', 'postal_code', 'city', 'country', 'contact_info'] as $key) if (!$profile[$key]) $errors[$key] = 'Bitte diese Angabe ergänzen.';
        if (!$profile['tax_ids'] && !$profile['missing_tax_reason']) $errors['missing_tax_reason'] = 'Steuerkennung erfassen oder ihr Fehlen begründen.';
        if (!$profile['register_number'] && !$profile['missing_register_reason']) $errors['missing_register_reason'] = 'Registerangaben erfassen oder ihr Fehlen begründen.';
        if ($profile['register_number'] && !$profile['register_type']) $errors['register_type'] = 'Bitte die Registerart ergänzen.';
        if (!$profile['residence_countries']) $errors['residence_countries'] = 'Bitte die EU-Ansässigkeitsstaaten ergänzen.';
        if ($errors) throw new PortalError('Bitte vervollständige die Stammdaten.', 422, $errors);
    }
    return $profile;
}

function portalProviderPayload(PDO $db, array $provider): array {
    return ['id' => (int)$provider['id'], 'status' => $provider['status'], 'version' => portalProviderVersion($provider), 'email_verified' => (bool)$provider['email_verified'], 'profile' => portalDecode($provider['profile_data']), 'review_reason' => $provider['review_reason'], 'created_at' => $provider['created_at'], 'updated_at' => $provider['updated_at'], 'history' => portalRows($db, 'SELECT action, status, actor_id, reason, created_at FROM provider_history WHERE provider_id = ? ORDER BY id DESC', [$provider['id']])];
}
function portalProviderVersion(array $provider): string { return hash('sha256', $provider['profile_data'] . '|' . $provider['status'] . '|' . $provider['updated_at']); }
function portalRequireUser(PDO $db, bool $admin = false, bool $approved = false): array {
    $user = authenticateUser($db);
    if (!$user) throw new PortalError('Bitte melde dich erneut an.', 401);
    if ($admin && !isAdminRole($user)) throw new PortalError('Nicht erlaubt.', 403);
    if ($approved && !isAdminRole($user)) {
        $provider = portalProvider($db, (int)$user['id']);
        if (!$provider || $provider['status'] !== 'approved') throw new PortalError('Dein Trägerprofil muss zuerst vom Jugendring freigegeben werden.', 403);
    }
    return $user;
}

function portalQueue(PDO $db, string $kind, string $recipient, array $payload, ?int $providerId = null): int {
    portalExec($db, 'INSERT INTO mail_outbox (provider_id, kind, recipient, payload_json, available_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', [$providerId, $kind, $recipient, portalJson($payload), portalNow(), portalNow()]);
    return (int)$db->lastInsertId();
}
function portalTokenValue(string $nonce): string { return hash_hmac('sha256', $nonce, (string)appConfig('APP_KEY', 'local-development-portal-key')); }
function portalNewToken(PDO $db, string $purpose, string $email, ?int $provider, ?int $camp, ?int $booking, string $expires): array {
    $nonce = bin2hex(random_bytes(32)); $token = portalTokenValue($nonce);
    portalExec($db, 'INSERT INTO portal_tokens (token_hash, purpose, email, provider_id, camp_id, booking_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [hash('sha256', $token), $purpose, $email, $provider, $camp, $booking, $expires]);
    return ['token_nonce' => $nonce, 'token_id' => (int)$db->lastInsertId()];
}
function portalToken(PDO $db, string $token, string $purpose, bool $allowUsed = false): array {
    if (!preg_match('/^[a-f0-9]{64}$/D', $token)) throw new PortalError('Dieser Link ist ungültig oder abgelaufen.', 410);
    $row = portalRow($db, 'SELECT * FROM portal_tokens WHERE token_hash = ? AND purpose = ? AND expires_at > ?', [hash('sha256', $token), $purpose, portalNow()]);
    if (!$row || (!$allowUsed && $row['used_at'])) throw new PortalError('Dieser Link ist ungültig oder abgelaufen.', 410);
    return $row;
}

function portalCreateRevision(PDO $db, int $campId, array $data, ?int $actor): int {
    $data['image_metadata'] = campImageMetadata($db, $campId);
    $data['images'] = array_column($data['image_metadata'], 'image_url');
    portalExec($db, "INSERT INTO camp_revisions (camp_id, data_json, created_by, review_status, created_at) VALUES (?, ?, ?, 'submitted', ?)", [$campId, portalJson($data), $actor, portalNow()]);
    $id = (int)$db->lastInsertId();
    foreach ($data['images'] as $url) portalExec($db, 'INSERT INTO camp_revision_images (revision_id, image_url) VALUES (?, ?)', [$id, $url]);
    return $id;
}
function portalEnsureCampState(PDO $db, array $camp): array {
    $state = portalRow($db, 'SELECT * FROM camp_portal_state WHERE camp_id = ?', [$camp['id']]);
    if (!$state) {
        portalExec($db, 'INSERT INTO camp_portal_state (camp_id, external_occupied) VALUES (?, ?)', [$camp['id'], max(0, (int)$camp['capacity_total'] - (int)$camp['places_remaining'])]);
        $state = portalRow($db, 'SELECT * FROM camp_portal_state WHERE camp_id = ?', [$camp['id']]);
    }
    return $state;
}
function portalOccupied(PDO $db, int $campId): int {
    return (int)portalRow($db, "SELECT COALESCE(SUM(participant_count), 0) AS total FROM bookings WHERE camp_id = ? AND status IN ('reserved', 'confirmed')", [$campId])['total'];
}
function portalRefreshCapacity(PDO $db, int $campId): void {
    $camp = portalRow($db, 'SELECT * FROM camps WHERE id = ?', [$campId]);
    $state = portalEnsureCampState($db, $camp);
    if ($camp['capacity_total'] === null) return;
    $remaining = max(0, (int)$camp['capacity_total'] - (int)$state['external_occupied'] - portalOccupied($db, $campId));
    $status = $camp['status'];
    if (in_array($status, ['published', 'fully_booked'], true)) $status = $remaining === 0 && $camp['place_requests_enabled'] ? 'fully_booked' : 'published';
    portalExec($db, 'UPDATE camps SET places_remaining = ?, status = ? WHERE id = ?', [$remaining, $status, $campId]);
}
function portalNotifyWaitlist(PDO $db, int $campId): void {
    if (!portalRow($db, "SELECT id FROM bookings WHERE camp_id = ? AND status = 'waitlist' LIMIT 1", [$campId])) return;
    $camp = portalRow($db, 'SELECT c.*, u.email AS owner_email FROM camps c JOIN users u ON u.id = c.club_id WHERE c.id = ?', [$campId]);
    $provider = portalProvider($db, (int)$camp['club_id']);
    portalQueue($db, 'provider_booking', $camp['place_request_email'] ?: $camp['owner_email'], ['message' => 'Für ' . $camp['title'] . ' mit Warteliste wurden Plätze freigegeben. Bitte die Warteliste im Portal prüfen.'], (int)$provider['id']);
}
function portalPublicCamp(PDO $db, array $camp): array {
    $revision = portalRow($db, 'SELECT r.* FROM camp_portal_state s JOIN camp_revisions r ON r.id = s.approved_revision_id WHERE s.camp_id = ?', [$camp['id']]);
    if (!$revision) return $camp;
    $snapshot = portalDecode($revision['data_json']);
    $camp['confirmation_information'] = $snapshot['confirmation_information'] ?? '';
    $provider = portalProvider($db, (int)$camp['club_id']);
    $profile = $provider ? portalDecode($provider['profile_data']) : [];
    $camp['image_metadata'] = $snapshot['image_metadata'] ?? [];
    $camp['images'] = array_column($camp['image_metadata'], 'image_url');
    $camp['club_name'] = $profile['public_name'] ?? $camp['club_name'] ?? '';
    $camp['contact_info'] = $profile['contact_info'] ?? $camp['contact_info'] ?? '';
    $camp['provider'] = ['id' => (int)($provider['id'] ?? 0), 'name' => $camp['club_name'], 'contact_info' => $camp['contact_info'], 'public_email' => $profile['public_email'] ?? '', 'website' => $profile['website'] ?? '', 'links' => $profile['links'] ?? []];
    $camp['provider_notice'] = portalProviderNotice($camp['club_name']);
    $camp['approved_revision_id'] = (int)$revision['id'];
    return $camp;
}
function portalInternalCamp(PDO $db, array $camp): array {
    $draft = portalRow($db, 'SELECT * FROM camp_drafts WHERE camp_id = ?', [$camp['id']]);
    $state = portalRow($db, 'SELECT * FROM camp_portal_state WHERE camp_id = ?', [$camp['id']]);
    // Operational values always come from live inventory, never an older draft.
    $live = array_intersect_key($camp, array_flip(['id', 'club_id', 'status', 'capacity_total', 'places_remaining', 'place_request_email']));
    if ($draft) $camp = array_merge($camp, portalDecode($draft['data_json']), $live);
    $camp['image_metadata'] = campImageMetadata($db, (int)$camp['id']);
    $camp['images'] = array_column($camp['image_metadata'], 'image_url');
    $camp['review_status'] = $draft['review_status'] ?? 'draft';
    $camp['review_reason'] = $draft['review_reason'] ?? null;
    $camp['revision_id'] = isset($draft['revision_id']) ? (int)$draft['revision_id'] : null;
    $camp['approved_revision_id'] = isset($state['approved_revision_id']) ? (int)$state['approved_revision_id'] : null;
    $camp['external_occupied'] = (int)($state['external_occupied'] ?? 0);
    $camp['occupied_in_portal'] = portalOccupied($db, (int)$camp['id']);
    return campWithLifecycle($camp);
}
function portalInvalidateDraft(PDO $db, int $campId): void {
    portalExec($db, "UPDATE camp_drafts SET review_status = 'draft', revision_id = NULL, review_reason = NULL, updated_at = ? WHERE camp_id = ?", [portalNow(), $campId]);
}
function portalSetDraft(PDO $db, int $campId, array $data): void {
    $existing = portalRow($db, 'SELECT camp_id FROM camp_drafts WHERE camp_id = ?', [$campId]);
    if ($existing) portalExec($db, "UPDATE camp_drafts SET data_json = ?, review_status = 'draft', revision_id = NULL, review_reason = NULL, updated_at = ? WHERE camp_id = ?", [portalJson($data), portalNow(), $campId]);
    else portalExec($db, "INSERT INTO camp_drafts (camp_id, data_json, review_status, updated_at) VALUES (?, ?, 'draft', ?)", [$campId, portalJson($data), portalNow()]);
}

function portalSaveCamp(PDO $db, array $user, ?int $campId, array $input): array {
    if (!$campId && isAdminRole($user)) throw new PortalError('Nur Träger können eigene Angebote anlegen.', 403);
    beginWrite($db);
    try {
        $existing = $campId ? getCampForUser($db, $campId, $user) : null;
        if ($campId && !$existing) throw new PortalError('Nicht erlaubt.', 403);
        $owner = $existing ? portalRow($db, 'SELECT * FROM users WHERE id = ?', [$existing['club_id']]) : $user;
        $provider = portalProvider($db, (int)$owner['id']);
        if (!$provider || $provider['status'] !== 'approved') throw new PortalError('Das Trägerprofil muss zuerst freigegeben werden.', 403);
        if (($input['allocation_method'] ?? 'request') !== 'request') throw new PortalError('Neue Portalbuchungen verwenden direkte Reservierungen.');
        $requestedStatus = $input['status'] ?? 'draft';
        [$clean, $errors] = validateCampPayload(array_merge($input, ['status' => 'draft', 'allocation_method' => 'request']), $owner, $existing);
        if ($errors) throw new PortalError('Bitte prüfe die markierten Angaben.', 422, $errors);
        $clean['status'] = $requestedStatus === 'archived' ? 'archived' : ($existing && campIsPublic($existing) ? $existing['status'] : 'draft');
        $createdPaths = [];
        $images = validateUploadedImages($db, $campId);
        if (!$campId) {
            // Mail information belongs to the reviewed JSON revision, not live inventory.
            $columns = ['club_id', ...array_keys(array_diff_key($clean, ['categories' => true, 'confirmation_information' => true]))];
            $values = [$user['id'], ...array_values(array_diff_key($clean, ['categories' => true, 'confirmation_information' => true]))];
            portalExec($db, 'INSERT INTO camps (' . implode(', ', $columns) . ') VALUES (' . implode(', ', array_fill(0, count($values), '?')) . ')', $values);
            $campId = (int)$db->lastInsertId();
            portalEnsureCampState($db, portalRow($db, 'SELECT * FROM camps WHERE id = ?', [$campId]));
            saveCampCategories($db, $campId, $clean['categories']);
        }
        $state = portalEnsureCampState($db, portalRow($db, 'SELECT * FROM camps WHERE id = ?', [$campId]));
        $occupied = portalOccupied($db, $campId);
        $total = $clean['capacity_total'];
        $external = array_key_exists('external_occupied', $input) ? filter_var($input['external_occupied'], FILTER_VALIDATE_INT) : (int)$state['external_occupied'];
        if ($external === false || $external < 0 || ($total !== null && $external + $occupied > $total) || ($total === null && ($external + $occupied) > 0)) throw new PortalError('Die Kapazität darf bestehende Belegungen nicht unterschreiten.', 422, ['capacity_total' => 'Reservierte, bestätigte und extern belegte Plätze müssen erhalten bleiben.']);
        portalExec($db, 'UPDATE camp_portal_state SET external_occupied = ? WHERE camp_id = ?', [$external, $campId]);
        portalExec($db, 'UPDATE camps SET capacity_total = ?, place_request_email = ? WHERE id = ?', [$total, $clean['place_request_email'], $campId]);
        if ($requestedStatus === 'archived') portalExec($db, "UPDATE camps SET status = 'archived' WHERE id = ?", [$campId]);
        persistUploadedImages($db, $campId, $images, $createdPaths);
        portalSetDraft($db, $campId, $clean);
        portalRefreshCapacity($db, $campId);
        $updated = portalRow($db, 'SELECT places_remaining FROM camps WHERE id = ?', [$campId]);
        if ($existing && (int)$updated['places_remaining'] > (int)$existing['places_remaining']) portalNotifyWaitlist($db, $campId);
        $db->commit();
        return ['id' => $campId, 'message' => 'Arbeitsfassung gespeichert. Veröffentlichung erfolgt nach Prüfung.'];
    } catch (Throwable $error) {
        if ($db->inTransaction()) $db->rollBack();
        foreach ($createdPaths ?? [] as $path) if (is_file($path)) unlink($path);
        throw $error;
    }
}

function portalSubmitCamp(PDO $db, array $user, int $campId): array {
    beginWrite($db);
    try {
        $camp = getCampForUser($db, $campId, $user);
        if (!$camp) throw new PortalError('Nicht erlaubt.', 403);
        $provider = portalProvider($db, (int)$camp['club_id']);
        if (!$provider || $provider['status'] !== 'approved') throw new PortalError('Das Trägerprofil ist noch nicht freigegeben.', 403);
        $owner = portalRow($db, 'SELECT * FROM users WHERE id = ?', [$camp['club_id']]);
        $draft = portalInternalCamp($db, campWithRelations($db, $camp));
        [$clean, $errors] = validateCampPayload(array_merge($draft, ['status' => 'published']), $owner, $camp);
        if ($errors) throw new PortalError('Bitte vervollständige das Angebot.', 422, $errors);
        if (!imageDescriptionsComplete($draft['image_metadata'])) throw new PortalError('Bitte alle Bilder beschreiben oder als dekorativ kennzeichnen.', 422, ['images' => 'Bildbeschreibungen fehlen.']);
        $revision = portalCreateRevision($db, $campId, $clean, (int)$user['id']);
        portalExec($db, "UPDATE camp_drafts SET review_status = 'submitted', revision_id = ?, review_reason = NULL, updated_at = ? WHERE camp_id = ?", [$revision, portalNow(), $campId]);
        foreach (portalRows($db, "SELECT email FROM users WHERE role IN ('admin', 'master_admin') AND is_active = 1") as $admin) portalQueue($db, 'review', $admin['email'], ['message' => 'Ein Angebot wurde zur Prüfung eingereicht: ' . $clean['title']], (int)$provider['id']);
        $db->commit();
        return ['message' => 'Angebot zur Prüfung eingereicht.', 'revision_id' => $revision];
    } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
}

function portalReviewCamp(PDO $db, array $admin, int $campId, array $input): void {
    $decision = $input['decision'] ?? ''; $reason = portalText($input, 'reason', 2000);
    if (!in_array($decision, ['approved', 'changes_requested'], true) || ($decision === 'changes_requested' && !$reason)) throw new PortalError('Bitte Entscheidung und gegebenenfalls Begründung angeben.');
    beginWrite($db);
    try {
        $draft = portalRow($db, 'SELECT * FROM camp_drafts WHERE camp_id = ?', [$campId]);
        if (!$draft || $draft['review_status'] !== 'submitted' || (int)($input['revision_id'] ?? 0) !== (int)$draft['revision_id']) throw new PortalError('Diese Fassung wurde inzwischen geändert. Bitte neu laden.', 409);
        $camp = portalRow($db, 'SELECT * FROM camps WHERE id = ?', [$campId]);
        $owner = portalRow($db, 'SELECT * FROM users WHERE id = ?', [$camp['club_id']]);
        $provider = portalProvider($db, (int)$owner['id']);
        if ($decision === 'approved' && (!$provider || $provider['status'] !== 'approved' || !(int)$owner['is_active'])) throw new PortalError('Zuerst den Träger freigeben.');
        $revision = portalRow($db, 'SELECT * FROM camp_revisions WHERE id = ?', [$draft['revision_id']]);
        $data = portalDecode($revision['data_json']);
        if ($decision === 'approved') {
            if (!imageDescriptionsComplete($data['image_metadata'] ?? [])) throw new PortalError('Bitte zuerst alle Bilder beschreiben oder als dekorativ kennzeichnen.', 422, ['images' => 'Bildbeschreibungen fehlen.']);
            $validationBase = $camp;
            // Imported, formerly public ongoing offers may finish their first review.
            if ($revision['created_by'] === null && $camp['ends_at'] > portalNow()) $validationBase['status'] = 'published';
            [$validated, $errors] = validateCampPayload(array_merge($data, ['status' => 'published', 'capacity_total' => $camp['capacity_total'], 'places_remaining' => $camp['places_remaining']]), $owner, $validationBase);
            if ($errors) throw new PortalError('Das Angebot erfüllt die Freigabevoraussetzungen nicht mehr.', 422, $errors);
            $values = array_diff_key($validated, ['categories' => true, 'confirmation_information' => true, 'capacity_total' => true, 'places_remaining' => true, 'place_request_email' => true]);
            portalExec($db, 'UPDATE camps SET ' . implode(', ', array_map(fn($key) => "$key = ?", array_keys($values))) . ' WHERE id = ?', [...array_values($values), $campId]);
            saveCampCategories($db, $campId, $validated['categories']);
            $previous = portalRow($db, 'SELECT approved_revision_id FROM camp_portal_state WHERE camp_id = ?', [$campId]);
            portalExec($db, 'UPDATE camp_portal_state SET approved_revision_id = ? WHERE camp_id = ?', [$revision['id'], $campId]);
            portalRefreshCapacity($db, $campId);
            if (!empty($previous['approved_revision_id'])) foreach (portalRows($db, "SELECT * FROM bookings WHERE camp_id = ? AND status IN ('reserved', 'waitlist', 'confirmed') AND anonymized_at IS NULL", [$campId]) as $booking) portalQueueBookingMail($db, $booking, 'Das veröffentlichte Angebot wurde aktualisiert. Deine Anmeldung bezieht sich weiterhin auf die bei Anmeldung gespeicherte Fassung. Bitte kontaktiere den Anbieter bei Fragen.');
        }
        portalExec($db, 'UPDATE camp_revisions SET review_status = ?, reviewed_by = ?, review_reason = ?, reviewed_at = ? WHERE id = ?', [$decision, $admin['id'], $reason, portalNow(), $revision['id']]);
        portalExec($db, 'UPDATE camp_drafts SET review_status = ?, review_reason = ?, updated_at = ? WHERE camp_id = ?', [$decision, $reason, portalNow(), $campId]);
        portalQueue($db, 'review', $owner['email'], ['message' => $decision === 'approved' ? 'Dein Angebot wurde freigegeben: ' . $data['title'] : 'Bitte überarbeite dein Angebot: ' . $data['title'] . '. ' . $reason], (int)$provider['id']);
        $db->commit();
    } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
}

function portalBookableCamp(PDO $db, int $campId): array {
    $camp = portalRow($db, 'SELECT c.*, u.is_active AS owner_active FROM camps c JOIN users u ON u.id = c.club_id WHERE c.id = ?', [$campId]);
    $provider = $camp ? portalProvider($db, (int)$camp['club_id']) : null;
    if (!$camp || !campIsPublic($camp) || !(int)$camp['owner_active'] || !$provider || $provider['status'] !== 'approved') throw new PortalError('Dieses Angebot ist nicht verfügbar.', 404);
    $camp = portalPublicCamp($db, campWithRelations($db, $camp));
    if (empty($camp['starts_at']) || $camp['starts_at'] <= portalNow() || (!empty($camp['ends_at']) && $camp['ends_at'] <= portalNow())) throw new PortalError('Diese Freizeit hat bereits begonnen oder ist beendet. Eine Anmeldung ist nicht mehr möglich.', 409);
    if (empty($camp['approved_revision_id']) || !in_array(placeRequestState($camp), ['available', 'few_places', 'waitlist'], true)) throw new PortalError('Für dieses Angebot sind derzeit keine Anmeldungen möglich.', 409);
    return $camp;
}
function portalParticipantFingerprint(array $participant): string {
    require_once __DIR__ . '/vendor/autoload.php';
    $normalize = static function (string $value): string {
        $value = Normalizer::normalize($value, Normalizer::FORM_C);
        return mb_convert_case(preg_replace('/\s+/u', ' ', trim($value)), MB_CASE_FOLD, 'UTF-8');
    };
    return hash('sha256', portalJson([$normalize($participant['first_name']), $normalize($participant['last_name']), $participant['birth_date']]));
}
function portalBookingStatusLabel(string $status): string { return ['reserved' => 'Reserviert', 'waitlist' => 'Warteliste', 'confirmed' => 'Bestätigt', 'rejected' => 'Abgelehnt', 'cancelled' => 'Storniert'][$status] ?? $status; }
function portalRetentionDays(): int {
    $configured = appConfig('BOOKING_RETENTION_DAYS', isProduction() ? null : 180);
    if (filter_var($configured, FILTER_VALIDATE_INT) === false || (int)$configured < 1 || (int)$configured > 3650) throw new PortalError('Die Aufbewahrungsfrist für Buchungsdaten ist noch nicht konfiguriert.', 503);
    return (int)$configured;
}
function portalQueueBookingMail(PDO $db, array $booking, string $message): void {
    if (empty($booking['contact_email'])) return;
    $snapshot = portalDecode($booking['snapshot_json']);
    $until = date('Y-m-d H:i:s', strtotime($snapshot['ends_at']) + portalRetentionDays() * 86400);
    $token = portalNewToken($db, 'booking_status', $booking['contact_email'], (int)$booking['provider_id'], (int)$booking['camp_id'], (int)$booking['id'], $until);
    portalQueue($db, 'booking_status', $booking['contact_email'], [...$token, 'booking_id' => (int)$booking['id'], 'status' => $booking['status'], 'message' => $message], (int)$booking['provider_id']);
}
function portalCreateBooking(PDO $db, int $campId, array $input): array {
    beginWrite($db);
    try {
        $access = portalToken($db, portalText($input, 'token', 64), 'booking_form', true);
        if ((int)$access['camp_id'] !== $campId) throw new PortalError('Dieser Link gehört zu einem anderen Angebot.', 403);
        // A consumed form is an idempotency key, including after a lost response.
        if ($access['used_at']) {
            $existing = $access['booking_id'] ? portalRow($db, 'SELECT reference, status FROM bookings WHERE id = ?', [$access['booking_id']]) : null;
            if (!$existing) throw new PortalError('Dieser Anmeldelink wurde bereits verwendet.', 409);
            $db->commit(); return [...$existing, 'message' => 'Diese Anmeldung wurde bereits gespeichert.'];
        }
        $camp = portalBookableCamp($db, $campId);
        $payload = normalizePlaceRequestPayload(array_merge($input, ['contact_email' => $input['contact_email'] ?? $access['email']]));
        $errors = validatePlaceRequestPayload($payload, $camp);
        if ($errors) throw new PortalError('Bitte prüfe die markierten Angaben.', 422, $errors);
        $quantity = count($payload['participants']);
        if ($quantity > (int)$camp['capacity_total']) throw new PortalError('Die Gruppe ist größer als die Gesamtkapazität des Angebots.');
        $fingerprints = [];
        foreach ($payload['participants'] as $person) {
            $fingerprint = portalParticipantFingerprint($person);
            $duplicate = portalRow($db, "SELECT p.id FROM booking_participants p JOIN bookings b ON b.id = p.booking_id WHERE p.camp_id = ? AND p.fingerprint = ? AND b.status IN ('reserved', 'waitlist', 'confirmed') LIMIT 1", [$campId, $fingerprint]);
            if ($duplicate || in_array($fingerprint, $fingerprints, true)) throw new PortalError('Für mindestens eine teilnehmende Person besteht bereits eine aktive Anmeldung zu dieser Freizeit. Bitte kontaktiere den Anbieter.', 409);
            $fingerprints[] = $fingerprint;
        }
        $status = (int)$camp['places_remaining'] >= $quantity ? 'reserved' : 'waitlist';
        if ($status === 'waitlist' && (!$camp['waitlist_enabled'] || ($input['waitlist_consent'] ?? false) !== true)) throw new PortalError('Für die gesamte Gruppe sind keine Plätze mehr frei. Bitte stimme einer Wartelistenanmeldung ausdrücklich zu oder wähle ein anderes Angebot.', 409, ['waitlist_consent' => 'Zustimmung zur Warteliste erforderlich.']);
        $provider = portalProvider($db, (int)$camp['club_id']);
        $snapshot = publicCampPayload($camp);
        $snapshot['confirmation_information'] = $camp['confirmation_information'] ?? '';
        $snapshot['approved_revision_id'] = $camp['approved_revision_id'];
        $snapshot['participant_count'] = $quantity;
        $snapshot['total_price_cents'] = (int)round((float)$camp['price_eur'] * 100) * $quantity;
        $reference = strtoupper(bin2hex(random_bytes(8)));
        portalExec($db, 'INSERT INTO bookings (reference, camp_id, provider_id, revision_id, status, participant_count, contact_name, contact_email, contact_phone, message, snapshot_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [$reference, $campId, $provider['id'], $camp['approved_revision_id'], $status, $quantity, $payload['contact_name'], $payload['contact_email'], $payload['contact_phone'], $payload['message'], portalJson($snapshot), portalNow(), portalNow()]);
        $bookingId = (int)$db->lastInsertId();
        foreach ($payload['participants'] as $index => $person) portalExec($db, 'INSERT INTO booking_participants (booking_id, camp_id, first_name, last_name, birth_date, fingerprint) VALUES (?, ?, ?, ?, ?, ?)', [$bookingId, $campId, $person['first_name'], $person['last_name'], $person['birth_date'], $fingerprints[$index]]);
        portalExec($db, 'INSERT INTO booking_events (booking_id, action, to_status, created_at) VALUES (?, ?, ?, ?)', [$bookingId, 'created', $status, portalNow()]);
        portalExec($db, 'UPDATE portal_tokens SET used_at = ?, booking_id = ? WHERE id = ?', [portalNow(), $bookingId, $access['id']]);
        portalRefreshCapacity($db, $campId);
        $booking = portalRow($db, 'SELECT * FROM bookings WHERE id = ?', [$bookingId]);
        portalQueueBookingMail($db, $booking, $status === 'reserved' ? 'Deine Anmeldung wurde gespeichert. Die Plätze sind vorläufig reserviert; der Anbieter entscheidet über die Zusage.' : 'Deine gesamte Gruppe steht auf der Warteliste. Es sind noch keine Plätze reserviert.');
        $owner = portalRow($db, 'SELECT email FROM users WHERE id = ?', [$camp['club_id']]);
        portalQueue($db, 'provider_booking', $camp['place_request_email'] ?: $owner['email'], ['booking_id' => $bookingId, 'status' => $status, 'message' => 'Neue Anmeldung ' . $reference . ' für ' . $camp['title'] . ': ' . portalBookingStatusLabel($status) . '. Bitte im Portal bearbeiten.'], (int)$provider['id']);
        $db->commit();
        return ['reference' => $reference, 'status' => $status, 'message' => 'Deine Anmeldung wurde gespeichert. Du erhältst eine Bestätigung mit Zusammenfassung und Statuslink per E-Mail. Der Anbieter erhält deine Anmeldedaten.'];
    } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
}

function portalBookingAction(PDO $db, array $user, int $bookingId, string $action): void {
    beginWrite($db);
    try {
        $provider = portalProvider($db, (int)$user['id']);
        $booking = portalRow($db, 'SELECT * FROM bookings WHERE id = ?', [$bookingId]);
        if (!$provider || !$booking || (int)$booking['provider_id'] !== (int)$provider['id'] || $provider['status'] !== 'approved' || isAdminRole($user)) throw new PortalError('Nur der zuständige Träger kann diese Anmeldung bearbeiten.', 403);
        $transitions = ['confirm' => ['reserved', 'confirmed'], 'reject' => [['reserved', 'waitlist'], 'rejected'], 'cancel' => [['reserved', 'waitlist', 'confirmed'], 'cancelled'], 'promote' => ['waitlist', 'reserved']];
        if (!isset($transitions[$action])) throw new PortalError('Unbekannte Aktion.');
        [$from, $to] = $transitions[$action];
        if ($booking['status'] === $to) { $db->commit(); return; }
        if (!in_array($booking['status'], (array)$from, true)) throw new PortalError('Diese Statusänderung ist nicht mehr möglich. Bitte neu laden.', 409);
        if ($booking['anonymized_at']) throw new PortalError('Die personenbezogenen Daten dieser Anmeldung wurden bereits gelöscht.', 410);
        if ($action === 'promote') {
            $camp = portalRow($db, 'SELECT * FROM camps WHERE id = ?', [$booking['camp_id']]);
            if ($camp['ends_at'] <= portalNow()) throw new PortalError('Die Freizeit ist bereits beendet.', 409);
            portalRefreshCapacity($db, (int)$camp['id']);
            $camp = portalRow($db, 'SELECT * FROM camps WHERE id = ?', [$camp['id']]);
            if ((int)$camp['places_remaining'] < (int)$booking['participant_count']) throw new PortalError('Für die gesamte Gruppe sind nicht genügend Plätze frei.', 409);
        }
        portalExec($db, 'UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?', [$to, portalNow(), $bookingId]);
        portalExec($db, 'INSERT INTO booking_events (booking_id, actor_id, action, from_status, to_status, created_at) VALUES (?, ?, ?, ?, ?, ?)', [$bookingId, $user['id'], $action, $booking['status'], $to, portalNow()]);
        portalRefreshCapacity($db, (int)$booking['camp_id']);
        $previousStatus = $booking['status'];
        $booking['status'] = $to;
        portalQueueBookingMail($db, $booking, 'Der Anbieter hat den Status deiner Anmeldung geändert: ' . portalBookingStatusLabel($to) . '.');
        if (in_array($action, ['reject', 'cancel'], true) && in_array($previousStatus, ['reserved', 'confirmed'], true)) portalNotifyWaitlist($db, (int)$booking['camp_id']);
        $db->commit();
    } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
}

function portalBookingMailSummary(PDO $db, array $booking, array $snapshot): string {
    $escape = fn($value) => htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $date = fn($value, $time = false) => $value ? (new DateTimeImmutable($value))->format($time ? 'd.m.Y H:i' : 'd.m.Y') : 'Nicht angegeben';
    $price = fn($cents) => number_format($cents / 100, 2, ',', '.') . ' €';
    $rows = [
        'Anmeldenummer' => $booking['reference'], 'Status' => portalBookingStatusLabel($booking['status']),
        'Freizeit' => $snapshot['title'], 'Anbieter' => $snapshot['club_name'],
        'Beginn' => $date($snapshot['starts_at'], true), 'Ende' => $date($snapshot['ends_at'], true),
        'Ort' => $snapshot['location_text'] ?? '',
        'Teilnahmebeitrag je Person' => isset($snapshot['price_eur']) ? $price((int)round((float)$snapshot['price_eur'] * 100)) : 'Auf Anfrage',
        'Teilnahmebeitrag für die Gruppe' => isset($snapshot['price_eur']) ? $price($snapshot['total_price_cents']) : 'Auf Anfrage',
        'Kontaktperson' => $booking['contact_name'], 'E-Mail-Adresse' => $booking['contact_email'], 'Telefonnummer' => $booking['contact_phone'],
    ];
    $html = '<h2>Zusammenfassung der Anmeldung</h2><dl>';
    foreach ($rows as $label => $value) $html .= '<dt><strong>' . $escape($label) . '</strong></dt><dd>' . $escape($value) . '</dd>';
    $html .= '</dl><h3>Teilnehmende</h3><ul>';
    foreach (portalRows($db, 'SELECT first_name, last_name, birth_date FROM booking_participants WHERE booking_id = ? ORDER BY id', [$booking['id']]) as $person) {
        $html .= '<li>' . $escape($person['first_name'] . ' ' . $person['last_name']) . ' (Geburtsdatum: ' . $escape($date($person['birth_date'])) . ')</li>';
    }
    $html .= '</ul>';
    if ($booking['message']) $html .= '<h3>Nachricht an den Anbieter</h3><p>' . nl2br($escape($booking['message'])) . '</p>';
    if (!empty($snapshot['confirmation_information'])) $html .= '<h3>Wichtige Informationen des Anbieters</h3><p>' . nl2br($escape($snapshot['confirmation_information'])) . '</p>';
    $contact = $snapshot['provider'] ?? [];
    if (!empty($contact['contact_info'])) $html .= '<h3>Kontakt zum Anbieter</h3><p>' . nl2br($escape($contact['contact_info'])) . '</p>';
    if (!empty($contact['public_email'])) $html .= '<p>' . $escape($contact['public_email']) . '</p>';
    return $html;
}

function portalMail(PDO $db, array $job): array {
    $payload = portalDecode($job['payload_json']);
    $escape = fn($text) => htmlspecialchars((string)$text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $message = $payload['message'] ?? '';
    $link = ''; $summary = '';
    $subject = 'Ferienfreizeitportal – Information';
    if (in_array($job['kind'], ['booking_status', 'provider_booking'], true) && !empty($payload['booking_id'])) {
        $booking = portalRow($db, 'SELECT * FROM bookings WHERE id = ?', [$payload['booking_id']]);
        if (!$booking || $booking['anonymized_at']) throw new PortalError('Die Anmeldung wurde bereits anonymisiert.', 410);
        $snapshot = portalDecode($booking['snapshot_json']);
        // Delayed delivery must describe the status at the time of this message.
        $booking['status'] = $payload['status'] ?? $booking['status'];
        $summary = portalBookingMailSummary($db, $booking, $snapshot);
        $subject = 'Ferienfreizeitportal – ' . ($job['kind'] === 'provider_booking' ? 'Neue Anmeldung' : 'Deine Anmeldung') . ': ' . $snapshot['title'];
    }
    if ($job['kind'] === 'provider_verify') {
        $message = 'Bitte bestätige deine E-Mail-Adresse. Danach kannst du deine Trägerstammdaten vervollständigen.';
        $link = appBaseUrl() . '/registrierung-bestaetigen#token=' . portalTokenValue($payload['token_nonce']);
    } elseif ($job['kind'] === 'booking_form') {
        $message = 'Über diesen Link bestätigst du deine E-Mail-Adresse und kannst die Anmeldung abschließen. Erst das abschließende Absenden reserviert Plätze. Der Anmeldelink gilt 24 Stunden.';
        $link = appBaseUrl() . '/anmelden/' . (int)$payload['camp_id'] . '#token=' . portalTokenValue($payload['token_nonce']);
    } elseif ($job['kind'] === 'booking_status') {
        $message .= ' Anmeldung ' . $booking['reference'] . ' – ' . $snapshot['title'] . '. ' . ($snapshot['provider_notice'] ?? '');
        $link = appBaseUrl() . '/buchung#token=' . portalTokenValue($payload['token_nonce']);
    } else $link = appBaseUrl() . ($job['kind'] === 'provider_booking' ? '/buchungen' : '/login');
    if ($job['kind'] === 'booking_form') {
        $camp = portalRow($db, 'SELECT * FROM camps WHERE id = ?', [$payload['camp_id']]);
        if ($camp) $message .= ' ' . (portalPublicCamp($db, $camp)['provider_notice'] ?? '');
    }
    return ['subject' => $subject, 'html' => '<p>' . $escape($message) . '</p>' . $summary . '<p><a href="' . $escape($link) . '">Im Ferienfreizeitportal öffnen</a></p>'];
}
function portalDeliverOutbox(PDO $db, int $limit = 20, ?callable $mailer = null): array {
    $result = ['sent' => 0, 'failed' => 0];
    for ($index = 0; $index < $limit; $index++) {
        beginWrite($db);
        $expiredLease = date('Y-m-d H:i:s', time() - 600);
        portalExec($db, "UPDATE mail_outbox SET status = 'failed', available_at = ?, lock_token = NULL WHERE status = 'sending' AND locked_at < ?", [portalNow(), $expiredLease]);
        $job = portalRow($db, "SELECT * FROM mail_outbox WHERE status IN ('pending', 'failed') AND attempts < 5 AND available_at <= ? ORDER BY id LIMIT 1", [portalNow()]);
        if (!$job) { $db->commit(); break; }
        $lease = bin2hex(random_bytes(16));
        portalExec($db, "UPDATE mail_outbox SET status = 'sending', attempts = attempts + 1, locked_at = ?, lock_token = ? WHERE id = ?", [portalNow(), $lease, $job['id']]);
        $db->commit();
        try {
            $mail = portalMail($db, $job);
            $sent = $mailer ? $mailer($job['recipient'], $mail['subject'], $mail['html']) : sendHtmlMail($job['recipient'], $mail['subject'], $mail['html']);
        } catch (Throwable $error) { $sent = false; }
        $retryAt = date('Y-m-d H:i:s', time() + min(3600, 60 * (2 ** (int)$job['attempts'])));
        portalExec($db, 'UPDATE mail_outbox SET status = ?, sent_at = ?, available_at = ?, lock_token = NULL WHERE id = ? AND lock_token = ?', [$sent ? 'sent' : 'failed', $sent ? portalNow() : null, $retryAt, $job['id'], $lease]);
        $result[$sent ? 'sent' : 'failed']++;
    }
    return $result;
}

function portalCleanup(PDO $db): int {
    $days = portalRetentionDays();
    beginWrite($db);
    try {
        $count = 0;
        foreach (portalRows($db, 'SELECT id, snapshot_json FROM bookings WHERE anonymized_at IS NULL') as $booking) {
            $snapshot = portalDecode($booking['snapshot_json']);
            if (strtotime($snapshot['ends_at']) + $days * 86400 >= time()) continue;
            portalExec($db, 'DELETE FROM booking_participants WHERE booking_id = ?', [$booking['id']]);
            portalExec($db, 'DELETE FROM portal_tokens WHERE booking_id = ?', [$booking['id']]);
            portalExec($db, 'UPDATE bookings SET contact_name = NULL, contact_email = NULL, contact_phone = NULL, message = NULL, anonymized_at = ? WHERE id = ?', [portalNow(), $booking['id']]);
            foreach (portalRows($db, 'SELECT id, payload_json FROM mail_outbox') as $job) if ((int)(portalDecode($job['payload_json'])['booking_id'] ?? 0) === (int)$booking['id']) portalExec($db, 'DELETE FROM mail_outbox WHERE id = ?', [$job['id']]);
            $count++;
        }
        portalExec($db, 'DELETE FROM portal_tokens WHERE expires_at < ?', [portalNow()]);
        portalExec($db, "DELETE FROM mail_outbox WHERE status = 'sent' AND sent_at < ?", [date('Y-m-d H:i:s', time() - 30 * 86400)]);
        $db->commit(); return $count;
    } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
}
