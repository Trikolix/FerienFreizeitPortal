<?php
// CLI-only; provision a new local database whose name begins ffp_portal_test.
if (PHP_SAPI !== 'cli' || getenv('FFP_SQL_SMOKE') !== '1' || getenv('APP_ENV') !== 'development' || !str_starts_with(getenv('DB_NAME') ?: '', 'ffp_portal_test')) exit(1);
define('PORTAL_MAINTENANCE', true);
$_SERVER['REQUEST_METHOD'] = 'GET'; $_SERVER['REQUEST_URI'] = '/api/test';
require __DIR__ . '/../index.php';
require __DIR__ . '/../provider_export.php';
function smokeCheck(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
$user = portalRow($db, "SELECT * FROM users WHERE username = 'testverein'");
$admin = portalRow($db, "SELECT * FROM users WHERE username = 'admin'");
$provider = portalEnsureProvider($db, $user);
$profile = portalProfile(['public_name' => 'Testverein', 'legal_name' => '=Testverein e. V.', 'legal_form' => 'Verein', 'street' => 'Testweg 1', 'postal_code' => '08056', 'city' => 'Zwickau', 'country' => 'DE', 'contact_info' => 'Kontakt', 'tax_ids' => [['country' => 'DE', 'number' => '0001234']], 'register_type' => 'Vereinsregister', 'register_number' => 'VR 0001', 'residence_countries' => ['DE']], true);
portalExec($db, "UPDATE providers SET status = 'approved', profile_data = ? WHERE id = ?", [portalJson($profile), $provider['id']]);
portalProviderHistory($db, portalProvider($db, (int)$user['id']), 'approved', (int)$admin['id']);
$data = ['title' => 'SQL Portal', 'min_age' => 8, 'max_age' => 16, 'description' => '<p>Eine Ferienwoche.</p>', 'categories' => ['Natur'], 'location_text' => 'Zwickau', 'starts_at' => '2035-08-01 10:00:00', 'ends_at' => '2035-08-08 12:00:00', 'registration_deadline' => '2035-07-01 12:00:00', 'price_eur' => 25, 'place_requests_enabled' => true, 'allocation_method' => 'request', 'capacity_total' => 2, 'places_remaining' => 2, 'waitlist_enabled' => true];
$campId = portalSaveCamp($db, $user, null, $data)['id'];
$revision = portalSubmitCamp($db, $user, $campId)['revision_id'];
portalReviewCamp($db, $admin, $campId, ['decision' => 'approved', 'revision_id' => $revision]);
$token = portalNewToken($db, 'booking_form', 'family@example.test', (int)$provider['id'], $campId, null, '2035-07-01 12:00:00');
$input = ['token' => portalTokenValue($token['token_nonce']), 'contact_name' => 'Maria Muster', 'contact_phone' => '+49123456', 'privacy_acknowledged' => true, 'participants' => [['first_name' => 'Lina', 'last_name' => 'Muster', 'birth_date' => '2023-05-10']]];
$first = portalCreateBooking($db, $campId, $input);
smokeCheck($first['status'] === 'reserved', 'Reservation');
smokeCheck(portalCreateBooking($db, $campId, $input)['reference'] === $first['reference'], 'Idempotency');
$secondToken = portalNewToken($db, 'booking_form', 'group@example.test', (int)$provider['id'], $campId, null, '2035-07-01 12:00:00');
$secondInput = [...$input, 'token' => portalTokenValue($secondToken['token_nonce']), 'waitlist_consent' => true, 'participants' => [['first_name' => 'Max', 'last_name' => 'Gruppe', 'birth_date' => '2023-05-10'], ['first_name' => 'Mia', 'last_name' => 'Gruppe', 'birth_date' => '2022-05-10']]];
$waiting = portalCreateBooking($db, $campId, $secondInput);
smokeCheck($waiting['status'] === 'waitlist', 'Whole group waitlist');
$firstRow = portalRow($db, 'SELECT * FROM bookings WHERE reference = ?', [$first['reference']]);
$waitingRow = portalRow($db, 'SELECT * FROM bookings WHERE reference = ?', [$waiting['reference']]);
portalBookingAction($db, $user, (int)$firstRow['id'], 'cancel');
portalBookingAction($db, $user, (int)$waitingRow['id'], 'promote');
portalBookingAction($db, $user, (int)$waitingRow['id'], 'confirm');
smokeCheck(portalOccupied($db, $campId) === 2, 'Inventory');
$duplicateToken = portalNewToken($db, 'booking_form', 'duplicate@example.test', (int)$provider['id'], $campId, null, '2035-07-01 12:00:00');
try { portalCreateBooking($db, $campId, [...$secondInput, 'token' => portalTokenValue($duplicateToken['token_nonce'])]); throw new RuntimeException('Duplicate was accepted'); }
catch (PortalError $error) { smokeCheck($error->status === 409, 'Duplicate prevention'); }
portalSaveCamp($db, $user, $campId, [...$data, 'title' => 'SQL Portal geändert', 'price_eur' => 99]);
smokeCheck(portalRow($db, 'SELECT title FROM camps WHERE id = ?', [$campId])['title'] === 'SQL Portal', 'Approved content survives working changes');
$next = portalSubmitCamp($db, $user, $campId)['revision_id'];
portalReviewCamp($db, $admin, $campId, ['decision' => 'approved', 'revision_id' => $next]);
$snapshot = portalDecode(portalRow($db, 'SELECT snapshot_json FROM bookings WHERE id = ?', [$waitingRow['id']])['snapshot_json']);
smokeCheck($snapshot['total_price_cents'] === 5000, 'Immutable participation price');
$delivery = portalDeliverOutbox($db, 100, static fn() => true);
smokeCheck($delivery['sent'] > 0 && $delivery['failed'] === 0, 'Outbox delivery');
$book = portalProviderWorkbook($db, (int)date('Y'));
smokeCheck($book->getSheetByName('Steuerkennungen')->getCell('C2')->getValue() === '0001234', 'XLSX text identifiers');
$file = tempnam(sys_get_temp_dir(), 'ffp-sql-xlsx-');
(new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($book))->save($file); smokeCheck(filesize($file) > 1000, 'XLSX serialization'); unlink($file);
echo 'Portal migration, revisions, booking, group waitlist, actions, duplicates, outbox and XLSX passed: ' . $dbConnection . PHP_EOL;
