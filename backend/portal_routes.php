<?php

function portalFlushMail(PDO $db): void {
    if (filter_var(appConfig('PORTAL_MAIL_INLINE', !isProduction()), FILTER_VALIDATE_BOOLEAN)) {
        try { portalDeliverOutbox($db, 5); } catch (Throwable $error) { appLog('Outbox processing failed'); }
    }
}
function portalRespond(PDO $db, array $data, int $status = 200): never { portalFlushMail($db); jsonResponse($data, $status); }

function handlePortalRoutes(PDO $db, string $path, string $method): void {
    if ($path === '/api/providers/register' && $method === 'POST') {
        $input = readJsonBody(); $email = mb_strtolower(portalText($input, 'email', 254));
        authRateLimit($db, 'provider_registration', $email, 5);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || (!passwordValid($input['password'] ?? null) || mb_strlen($input['password']) < 12)) throw new PortalError('Bitte eine gültige E-Mail-Adresse und ein Passwort mit 12 bis 72 Bytes eingeben.');
        beginWrite($db);
        try {
            if (!portalRow($db, 'SELECT id FROM users WHERE email = ? OR username = ?', [$email, $email])) {
                portalExec($db, "INSERT INTO users (email, username, password_hash, role, display_name, club_name, contact_info, is_active) VALUES (?, ?, ?, 'user', ?, ?, '', 0)", [$email, $email, password_hash($input['password'], PASSWORD_BCRYPT), 'Neuer Träger', 'Neuer Träger']);
                $userId = (int)$db->lastInsertId();
                $provider = portalEnsureProvider($db, portalRow($db, 'SELECT * FROM users WHERE id = ?', [$userId]));
                $token = portalNewToken($db, 'provider_verify', $email, (int)$provider['id'], null, null, date('Y-m-d H:i:s', time() + 86400));
                portalQueue($db, 'provider_verify', $email, $token, (int)$provider['id']);
            } else {
                $existing = portalRow($db, 'SELECT p.* FROM providers p JOIN users u ON u.id = p.user_id WHERE u.email = ? AND p.email_verified = 0', [$email]);
                if ($existing) {
                    $token = portalNewToken($db, 'provider_verify', $email, (int)$existing['id'], null, null, date('Y-m-d H:i:s', time() + 86400));
                    portalQueue($db, 'provider_verify', $email, $token, (int)$existing['id']);
                }
            }
            $db->commit();
        } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
        portalRespond($db, ['message' => 'Wenn die Adresse neu ist, erhältst du einen Bestätigungslink. Bei einem bestehenden Konto nutze bitte Anmeldung oder Passwort zurücksetzen.'], 202);
    }
    if ($path === '/api/providers/verify-email' && $method === 'POST') {
        authRateLimit($db, 'provider_verification', clientIpAddress($_SERVER), 30);
        $input = readJsonBody();
        beginWrite($db);
        try {
            $token = portalToken($db, portalText($input, 'token', 64), 'provider_verify', true);
            if ($token['used_at']) { $db->commit(); jsonResponse(['message' => 'E-Mail bereits bestätigt. Bitte anmelden.']); }
            portalExec($db, 'UPDATE providers SET email_verified = 1, updated_at = ? WHERE id = ?', [portalNow(), $token['provider_id']]);
            portalExec($db, 'UPDATE users SET is_active = 1 WHERE id = (SELECT user_id FROM providers WHERE id = ?)', [$token['provider_id']]);
            portalExec($db, 'UPDATE portal_tokens SET used_at = ? WHERE id = ?', [portalNow(), $token['id']]);
            $db->commit();
        } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
        jsonResponse(['message' => 'E-Mail bestätigt. Bitte anmelden und die Trägerstammdaten vervollständigen.']);
    }
    if ($path === '/api/provider-profile' && in_array($method, ['GET', 'PUT'], true)) {
        $user = portalRequireUser($db);
        if (isAdminRole($user)) throw new PortalError('Dieses Formular ist für Trägerkonten vorgesehen.', 403);
        $provider = portalEnsureProvider($db, $user);
        if ($method === 'PUT') {
            $profile = portalProfile(readJsonBody());
            beginWrite($db);
            try {
                // Any change is recorded and rechecked before it can become public.
                portalExec($db, "UPDATE providers SET profile_data = ?, status = CASE WHEN status = 'suspended' THEN status ELSE 'draft' END, review_reason = NULL, updated_at = ? WHERE id = ?", [portalJson($profile), portalNow(), $provider['id']]);
                $provider = portalProvider($db, (int)$user['id']);
                portalProviderHistory($db, $provider, 'updated', (int)$user['id']);
                $db->commit();
            } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
        }
        jsonResponse(portalProviderPayload($db, $provider));
    }
    if ($path === '/api/provider-profile/submit' && $method === 'POST') {
        $user = portalRequireUser($db);
        if (isAdminRole($user)) throw new PortalError('Nur Träger können ein Profil einreichen.', 403);
        beginWrite($db);
        try {
            $provider = portalEnsureProvider($db, $user);
            if ($provider['status'] === 'suspended') throw new PortalError('Bitte kontaktiere den Jugendring zur Entsperrung.', 403);
            if (!(int)$provider['email_verified']) throw new PortalError('Bitte zuerst die E-Mail-Adresse bestätigen.', 403);
            portalProfile(portalDecode($provider['profile_data']), true);
            portalExec($db, "UPDATE providers SET status = 'submitted', updated_at = ? WHERE id = ?", [portalNow(), $provider['id']]);
            $provider = portalProvider($db, (int)$user['id']);
            portalProviderHistory($db, $provider, 'submitted', (int)$user['id']);
            foreach (portalRows($db, "SELECT email FROM users WHERE role IN ('admin', 'master_admin') AND is_active = 1") as $admin) portalQueue($db, 'review', $admin['email'], ['message' => 'Ein Trägerprofil wurde zur Prüfung eingereicht.'], (int)$provider['id']);
            $db->commit();
        } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
        portalRespond($db, portalProviderPayload($db, $provider));
    }
    if ($path === '/api/admin/providers' && $method === 'GET') {
        portalRequireUser($db, true);
        $providers = portalRows($db, 'SELECT p.*, u.email, u.is_active FROM providers p JOIN users u ON u.id = p.user_id ORDER BY p.id DESC');
        jsonResponse(array_map(fn($provider) => [...portalProviderPayload($db, $provider), 'email' => $provider['email'], 'is_active' => (bool)$provider['is_active']], $providers));
    }
    if (preg_match('~^/api/admin/providers/(\d+)/review$~D', $path, $match) && $method === 'POST') {
        $admin = portalRequireUser($db, true); $input = readJsonBody();
        $decision = $input['decision'] ?? ''; $reason = portalText($input, 'reason', 2000);
        if (!in_array($decision, ['approved', 'changes_requested', 'suspended'], true) || ($decision !== 'approved' && !$reason)) throw new PortalError('Bitte Entscheidung und gegebenenfalls Begründung angeben.');
        beginWrite($db);
        try {
            $provider = portalRow($db, 'SELECT * FROM providers WHERE id = ?', [(int)$match[1]]);
            if (!$provider) throw new PortalError('Träger nicht gefunden.', 404);
            if (!hash_equals(portalProviderVersion($provider), portalText($input, 'profile_version', 64))) throw new PortalError('Die Stammdaten wurden inzwischen geändert. Bitte neu laden und erneut prüfen.', 409);
            if ($decision === 'approved') {
                if (!(int)$provider['email_verified']) throw new PortalError('Die E-Mail-Adresse ist noch nicht bestätigt.');
                portalProfile(portalDecode($provider['profile_data']), true);
            }
            portalExec($db, 'UPDATE providers SET status = ?, review_reason = ?, updated_at = ? WHERE id = ?', [$decision, $reason, portalNow(), $provider['id']]);
            $provider = portalRow($db, 'SELECT * FROM providers WHERE id = ?', [$provider['id']]);
            portalProviderHistory($db, $provider, $decision, (int)$admin['id']);
            $owner = portalRow($db, 'SELECT * FROM users WHERE id = ?', [$provider['user_id']]);
            $profile = portalDecode($provider['profile_data']);
            if ($decision === 'approved') portalExec($db, 'UPDATE users SET club_name = ?, display_name = ?, contact_info = ? WHERE id = ?', [$profile['public_name'], $profile['public_name'], $profile['contact_info'], $provider['user_id']]);
            portalQueue($db, 'review', $owner['email'], ['message' => 'Prüfergebnis zu deinem Trägerprofil: ' . portalProviderStatusLabel($decision) . ($reason ? '. ' . $reason : '')], (int)$provider['id']);
            $db->commit();
        } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
        portalRespond($db, ['message' => 'Prüfergebnis gespeichert.']);
    }
    if ($path === '/api/admin/providers/export' && $method === 'GET') {
        portalRequireUser($db, true);
        $year = filter_var($_GET['year'] ?? null, FILTER_VALIDATE_INT);
        if (!$year || $year < 2000 || $year > (int)date('Y')) throw new PortalError('Bitte ein gültiges Berichtsjahr wählen.');
        require_once __DIR__ . '/provider_export.php';
        $book = portalProviderWorkbook($db, $year);
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="Anbieter-' . $year . '.xlsx"');
        header('Cache-Control: no-store');
        (new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($book))->save('php://output');
        $book->disconnectWorksheets(); exit;
    }
    if ($path === '/api/admin/reviews' && $method === 'GET') {
        portalRequireUser($db, true);
        $camps = portalRows($db, "SELECT c.*, u.club_name FROM camps c JOIN users u ON u.id = c.club_id JOIN camp_drafts d ON d.camp_id = c.id WHERE d.review_status = 'submitted' ORDER BY d.updated_at");
        jsonResponse(array_map(fn($camp) => portalInternalCamp($db, campWithRelations($db, $camp)), $camps));
    }
    if (preg_match('~^/api/admin/camps/(\d+)/review$~D', $path, $match) && $method === 'POST') {
        $admin = portalRequireUser($db, true);
        portalReviewCamp($db, $admin, (int)$match[1], readJsonBody());
        portalRespond($db, ['message' => 'Prüfergebnis gespeichert.']);
    }
    if (preg_match('~^/api/camps(?:/(\d+))?$~D', $path, $match) && in_array($method, ['POST', 'PUT'], true)) {
        $user = portalRequireUser($db, false, true);
        $id = isset($match[1]) ? (int)$match[1] : null;
        if (($method === 'POST' && $id) || ($method === 'PUT' && !$id)) throw new PortalError('Ungültiger Aufruf.', 405);
        $result = portalSaveCamp($db, $user, $id, $_POST ?: readJsonBody());
        jsonResponse($result, $method === 'POST' ? 201 : 200);
    }
    if (preg_match('~^/api/camps/(\d+)/submit$~D', $path, $match) && $method === 'POST') {
        $user = portalRequireUser($db, false, true);
        $result = portalSubmitCamp($db, $user, (int)$match[1]);
        portalRespond($db, $result);
    }
    if (preg_match('~^/api/camps/(\d+)/availability$~D', $path, $match) && $method === 'PUT') {
        $user = portalRequireUser($db, false, true); $input = readJsonBody();
        beginWrite($db);
        try {
            $camp = getCampForUser($db, (int)$match[1], $user);
            if (!$camp) throw new PortalError('Nicht erlaubt.', 403);
            $remaining = filter_var($input['places_remaining'] ?? null, FILTER_VALIDATE_INT);
            $occupied = portalOccupied($db, (int)$camp['id']);
            if ($remaining === false || $remaining < 0 || $remaining > (int)$camp['capacity_total'] - $occupied) throw new PortalError('Freie Plätze dürfen bestehende Portalbuchungen nicht überschreiben.');
            portalEnsureCampState($db, $camp);
            portalExec($db, 'UPDATE camp_portal_state SET external_occupied = ? WHERE camp_id = ?', [(int)$camp['capacity_total'] - $occupied - $remaining, $camp['id']]);
            portalRefreshCapacity($db, (int)$camp['id']);
            if ($remaining > (int)$camp['places_remaining']) portalNotifyWaitlist($db, (int)$camp['id']);
            $db->commit();
        } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
        $updated = portalRow($db, 'SELECT c.*, u.club_name FROM camps c JOIN users u ON u.id = c.club_id WHERE c.id = ?', [(int)$match[1]]);
        portalRespond($db, ['message' => 'Externe Belegung aktualisiert.', 'camp' => portalInternalCamp($db, campWithRelations($db, $updated))]);
    }
    if (preg_match('~^/api/camps/(\d+)/booking-form$~D', $path, $match) && $method === 'POST') {
        authRateLimit($db, 'booking_form', clientIpAddress($_SERVER), 120);
        $camp = portalBookableCamp($db, (int)$match[1]);
        portalRetentionDays();
        $token = portalNewToken($db, 'booking_form', '', (int)$camp['provider']['id'], (int)$camp['id'], null, date('Y-m-d H:i:s', time() + 86400));
        jsonResponse(['camp' => publicCampPayload($camp), 'token' => portalTokenValue($token['token_nonce'])], 201);
    }
    if (preg_match('~^/api/camps/(\d+)/booking-link$~D', $path, $match) && $method === 'POST') {
        $campId = (int)$match[1]; $input = readJsonBody();
        $email = mb_strtolower(portalText($input, 'email', 254));
        authRateLimit($db, 'booking_link', $email, 5);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new PortalError('Bitte eine gültige E-Mail-Adresse eingeben.');
        $camp = portalBookableCamp($db, $campId);
        portalRetentionDays();
        beginWrite($db);
        try {
            $token = portalNewToken($db, 'booking_form', $email, (int)$camp['provider']['id'], $campId, null, date('Y-m-d H:i:s', time() + 86400));
            portalQueue($db, 'booking_form', $email, [...$token, 'camp_id' => $campId], (int)$camp['provider']['id']);
            $db->commit();
        } catch (Throwable $error) { if ($db->inTransaction()) $db->rollBack(); throw $error; }
        portalRespond($db, ['message' => 'Öffne den Link in deiner E-Mail, um die Anmeldung abzuschließen. Bisher sind keine Plätze reserviert.'], 202);
    }
    if ($path === '/api/booking-access' && $method === 'POST') {
        $input = readJsonBody(); authRateLimit($db, 'booking_access', clientIpAddress($_SERVER), 60);
        $access = portalToken($db, portalText($input, 'token', 64), 'booking_form', true);
        if ($access['used_at']) jsonResponse(['submitted' => true, 'message' => 'Diese Anmeldung wurde bereits gespeichert. Bitte nutze den Statuslink aus deiner E-Mail.']);
        $camp = portalBookableCamp($db, (int)$access['camp_id']);
        jsonResponse(['camp' => publicCampPayload($camp), 'email' => $access['email']]);
    }
    if (preg_match('~^/api/camps/(\d+)/bookings$~D', $path, $match) && $method === 'POST') {
        authRateLimit($db, 'booking_submission', clientIpAddress($_SERVER), 30);
        $result = portalCreateBooking($db, (int)$match[1], readJsonBody());
        portalRespond($db, $result, 201);
    }
    if ($path === '/api/bookings/status' && $method === 'POST') {
        authRateLimit($db, 'booking_status', clientIpAddress($_SERVER), 60);
        $input = readJsonBody(); $access = portalToken($db, portalText($input, 'token', 64), 'booking_status');
        $booking = portalRow($db, 'SELECT * FROM bookings WHERE id = ? AND anonymized_at IS NULL', [$access['booking_id']]);
        if (!$booking) throw new PortalError('Diese Anmeldung ist nicht mehr verfügbar.', 410);
        jsonResponse(['reference' => $booking['reference'], 'status' => $booking['status'], 'participant_count' => (int)$booking['participant_count'], 'created_at' => $booking['created_at'], 'snapshot' => portalDecode($booking['snapshot_json']), 'events' => portalRows($db, 'SELECT to_status, created_at FROM booking_events WHERE booking_id = ? ORDER BY id', [$booking['id']])]);
    }
    if (preg_match('~^/api/bookings/(\d+)/actions$~D', $path, $match) && $method === 'POST') {
        $user = portalRequireUser($db, false, true); $input = readJsonBody();
        portalBookingAction($db, $user, (int)$match[1], portalText($input, 'action', 24));
        portalRespond($db, ['message' => 'Buchungsstatus aktualisiert.']);
    }
    if (in_array($path, ['/api/bookings', '/api/booking-statistics'], true) && $method === 'GET') {
        $user = portalRequireUser($db, false, true); $admin = isAdminRole($user);
        if ($admin && $path === '/api/bookings') throw new PortalError('Einzelne Buchungen sind dem jeweiligen Träger vorbehalten.', 403);
        $where = ['1 = 1']; $params = [];
        if (!$admin) { $where[] = 'b.provider_id = ?'; $params[] = portalProvider($db, (int)$user['id'])['id']; }
        if (isset($_GET['camp_id']) && ctype_digit((string)$_GET['camp_id'])) { $where[] = 'b.camp_id = ?'; $params[] = (int)$_GET['camp_id']; }
        if (!empty($_GET['status'])) {
            if (!is_string($_GET['status']) || !in_array($_GET['status'], ['reserved', 'waitlist', 'confirmed', 'rejected', 'cancelled'], true)) throw new PortalError('Ungültiger Buchungsstatus.');
            $where[] = 'b.status = ?'; $params[] = $_GET['status'];
        }
        foreach (['from' => '>=', 'to' => '<='] as $key => $operator) if (!empty($_GET[$key])) {
            if (!is_string($_GET[$key]) || !validPlaceRequestDate($_GET[$key])) throw new PortalError('Ungültiger Zeitraum.');
            $where[] = "b.created_at $operator ?"; $params[] = $_GET[$key] . ($key === 'to' ? ' 23:59:59' : ' 00:00:00');
        }
        $clause = implode(' AND ', $where);
        if ($path === '/api/booking-statistics') jsonResponse(portalRows($db, "SELECT b.provider_id, b.camp_id, c.title, b.status, COUNT(*) AS bookings, SUM(b.participant_count) AS participants FROM bookings b JOIN camps c ON c.id = b.camp_id WHERE $clause GROUP BY b.provider_id, b.camp_id, c.title, b.status ORDER BY c.title, b.status", $params));
        $offset = max(0, (int)($_GET['offset'] ?? 0));
        $bookings = portalRows($db, "SELECT b.* FROM bookings b WHERE $clause ORDER BY b.created_at, b.id LIMIT 100 OFFSET $offset", $params);
        foreach ($bookings as &$booking) {
            $booking['id'] = (int)$booking['id']; $booking['participant_count'] = (int)$booking['participant_count'];
            $booking['snapshot'] = portalDecode($booking['snapshot_json']); unset($booking['snapshot_json']);
            $booking['participants'] = portalRows($db, 'SELECT first_name, last_name, birth_date FROM booking_participants WHERE booking_id = ? ORDER BY id', [$booking['id']]);
            $booking['events'] = portalRows($db, 'SELECT action, from_status, to_status, actor_id, created_at FROM booking_events WHERE booking_id = ? ORDER BY id', [$booking['id']]);
        }
        unset($booking);
        jsonResponse(['items' => $bookings, 'total' => (int)portalRow($db, "SELECT COUNT(*) AS total FROM bookings b WHERE $clause", $params)['total']]);
    }
    if ($path === '/api/mail-outbox' && $method === 'GET') {
        $user = portalRequireUser($db, false, true);
        $provider = portalProvider($db, (int)$user['id']);
        $where = isAdminRole($user) ? '1 = 1' : 'provider_id = ?';
        jsonResponse(portalRows($db, "SELECT id, kind, status, attempts, available_at, sent_at, created_at FROM mail_outbox WHERE $where AND status <> 'sent' ORDER BY id DESC LIMIT 100", isAdminRole($user) ? [] : [$provider['id']]));
    }
    if (preg_match('~^/api/mail-outbox/(\d+)/retry$~D', $path, $match) && $method === 'POST') {
        $user = portalRequireUser($db, false, true); $provider = portalProvider($db, (int)$user['id']);
        $job = portalRow($db, 'SELECT * FROM mail_outbox WHERE id = ?', [(int)$match[1]]);
        if (!$job || (!isAdminRole($user) && (!$provider || (int)$provider['id'] !== (int)$job['provider_id']))) throw new PortalError('Nicht erlaubt.', 403);
        if ($job['status'] !== 'failed') throw new PortalError('Nur fehlgeschlagene Versandaufträge können erneut freigegeben werden.', 409);
        portalExec($db, "UPDATE mail_outbox SET status = 'pending', attempts = 0, available_at = ? WHERE id = ? AND status = 'failed'", [portalNow(), $job['id']]);
        portalRespond($db, ['message' => 'Erneuter Versand vorgemerkt.']);
    }

    // Guard old mutation endpoints as well; none may bypass provider approval.
    if (preg_match('~^/api/camps/(\d+)(?:/.*)?$~D', $path, $match) && !in_array($method, ['GET', 'HEAD'], true)) {
        if (str_ends_with($path, '/place-requests')) throw new PortalError('Bitte den neuen Anmeldeweg mit E-Mail-Bestätigung verwenden.', 410);
        portalRequireUser($db, false, true);
        if ($method === 'DELETE' && preg_match('~^/api/camps/\d+$~D', $path) && portalRow($db, 'SELECT id FROM camp_revisions WHERE camp_id = ? LIMIT 1', [(int)$match[1]])) throw new PortalError('Angebote mit Prüf- oder Buchungshistorie bitte archivieren, damit Nachweise erhalten bleiben.', 409);
    }
    if (preg_match('~^/api/admin/users/(\d+)$~D', $path, $match) && $method === 'DELETE') {
        portalRequireUser($db, true);
        if (portalProvider($db, (int)$match[1])) throw new PortalError('Träger mit Stammdatenhistorie bitte über die Trägerprüfung sperren. Ihre Nachweise bleiben erhalten.', 409);
    }
    if ($path === '/api/me' && $method === 'PUT') {
        $user = portalRequireUser($db);
        if (!isAdminRole($user)) throw new PortalError('Bitte öffentliche Angaben im geprüften Trägerprofil pflegen.', 410);
    }
}
