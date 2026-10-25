<?php
// CLI-only helpers for Playwright's disposable SQLite database. Never production.
if (PHP_SAPI !== 'cli' || getenv('APP_ENV') !== 'development') exit(1);
$path = getenv('DB_SQLITE_PATH');
if (!$path || !str_starts_with(realpath(dirname($path)) . '/', realpath(sys_get_temp_dir()) . '/')) { fwrite(STDERR, "Use a disposable database in the temporary directory.\n"); exit(1); }
define('PORTAL_MAINTENANCE', true);
$_SERVER['REQUEST_METHOD'] = 'GET'; $_SERVER['REQUEST_URI'] = '/api/test-fixtures';
require __DIR__ . '/../index.php';
$command = $argv[1] ?? 'seed';
if ($command === 'limits') { portalExec($db, 'DELETE FROM auth_limits'); exit; }
if ($command === 'past-camp') {
    $id = filter_var($argv[2] ?? null, FILTER_VALIDATE_INT);
    if (!$id) exit(1);
    portalExec($db, 'UPDATE camps SET starts_at = ?, ends_at = ?, registration_deadline = NULL WHERE id = ?', [date('Y-m-d H:i:s', strtotime('-2 days')), date('Y-m-d H:i:s', strtotime('-1 day')), $id]);
    exit;
}
if ($command === 'mail') {
    $job = portalRow($db, 'SELECT * FROM mail_outbox WHERE kind = ? AND recipient = ? ORDER BY id DESC LIMIT 1', [$argv[2] ?? '', $argv[3] ?? '']);
    if (!$job) exit(1);
    echo portalJson(portalMail($db, $job)); exit;
}
if ($command === 'token') {
    $purpose = $argv[2] ?? ''; $email = $argv[3] ?? '';
    foreach (portalRows($db, 'SELECT payload_json FROM mail_outbox WHERE recipient = ? ORDER BY id DESC', [$email]) as $job) {
        $payload = portalDecode($job['payload_json']);
        if (empty($payload['token_id'])) continue;
        $token = portalRow($db, 'SELECT * FROM portal_tokens WHERE id = ? AND purpose = ?', [$payload['token_id'], $purpose]);
        if ($token) { echo portalTokenValue($payload['token_nonce']); exit; }
    }
    fwrite(STDERR, "No matching token.\n"); exit(1);
}
if ($command !== 'seed') exit(1);
$admin = portalRow($db, "SELECT * FROM users WHERE role = 'master_admin' ORDER BY id LIMIT 1");
foreach (portalRows($db, "SELECT * FROM users WHERE role = 'user'") as $user) {
    $provider = portalEnsureProvider($db, $user);
    $profile = portalProfile(['public_name' => $user['club_name'], 'legal_name' => $user['club_name'] . ' e. V.', 'legal_form' => 'Verein', 'street' => 'Teststraße 1', 'postal_code' => '08056', 'city' => 'Zwickau', 'country' => 'DE', 'contact_info' => $user['email'], 'tax_ids' => [['country' => 'DE', 'number' => '000123456']], 'register_type' => 'Vereinsregister', 'register_number' => 'VR 001', 'residence_countries' => ['DE']], true);
    portalExec($db, "UPDATE providers SET status = 'approved', email_verified = 1, profile_data = ? WHERE id = ?", [portalJson($profile), $provider['id']]);
    portalProviderHistory($db, portalProvider($db, (int)$user['id']), 'approved', (int)$admin['id']);
    foreach (portalRows($db, 'SELECT * FROM camps WHERE club_id = ?', [$user['id']]) as $camp) {
        $data = portalInternalCamp($db, campWithRelations($db, $camp));
        $data = array_merge($data, ['starts_at' => '2035-08-01 10:00:00', 'ends_at' => '2035-08-08 12:00:00', 'registration_deadline' => '2035-07-01 12:00:00', 'request_opens_at' => null, 'min_age' => 8, 'max_age' => 16, 'place_requests_enabled' => true, 'allocation_method' => 'request', 'capacity_total' => 20, 'places_remaining' => 20, 'external_occupied' => 0, 'waitlist_enabled' => true, 'status' => 'draft']);
        portalSaveCamp($db, $user, (int)$camp['id'], $data);
        $submitted = portalSubmitCamp($db, $user, (int)$camp['id']);
        portalReviewCamp($db, $admin, (int)$camp['id'], ['decision' => 'approved', 'revision_id' => $submitted['revision_id']]);
    }
}
echo "Disposable portal fixtures ready.\n";
