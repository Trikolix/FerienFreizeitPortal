<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
define('PORTAL_MAINTENANCE', true);
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['REQUEST_URI'] = '/api/maintenance';
require __DIR__ . '/index.php';
$command = $argv[1] ?? '';
try {
    if ($command === 'mail') echo json_encode(portalDeliverOutbox($db, 100), JSON_THROW_ON_ERROR) . PHP_EOL;
    elseif ($command === 'cleanup') echo json_encode(['anonymized' => portalCleanup($db)], JSON_THROW_ON_ERROR) . PHP_EOL;
    else { fwrite(STDERR, "Usage: php maintenance.php mail|cleanup\n"); exit(1); }
} catch (Throwable $error) { fwrite(STDERR, "Maintenance failed: " . $error->getMessage() . PHP_EOL); exit(1); }
