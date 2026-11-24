<?php
// CLI-only helpers for Playwright's disposable SQLite database. Never production.
if (PHP_SAPI !== 'cli' || getenv('APP_ENV') !== 'development') exit(1);
$path = getenv('DB_SQLITE_PATH');
if (!$path || !str_starts_with(rtrim((string)realpath(dirname($path)), '/\\') . DIRECTORY_SEPARATOR, rtrim((string)realpath(sys_get_temp_dir()), '/\\') . DIRECTORY_SEPARATOR)) { fwrite(STDERR, "Use a disposable database in the temporary directory.\n"); exit(1); }
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
ensureDemoPortalApproval($db);
echo "Disposable portal fixtures ready.\n";
