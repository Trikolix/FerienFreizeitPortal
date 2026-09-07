<?php
// Run only in a disposable SQL test database, before the first API request.
require_once __DIR__ . '/../image_metadata.php';
if (getenv('FFP_SQL_SMOKE') !== '1') throw new RuntimeException('Disposable test database required');
$driver = getenv('DB_CONNECTION');
$host = getenv('DB_HOST');
$name = getenv('DB_NAME');
$db = new PDO("$driver:host=$host;dbname=$name", getenv('DB_USER'), getenv('DB_PASSWORD'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$idType = $driver === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'SERIAL PRIMARY KEY';
$db->exec("CREATE TABLE camp_images (id $idType, camp_id INTEGER NOT NULL, image_url TEXT NOT NULL)");
$db->exec("INSERT INTO camp_images (camp_id, image_url) VALUES (1, '/uploads/legacy.png')");
ensureImageMetadataSchema($db, $driver);
ensureImageMetadataSchema($db, $driver);
$images = campImageMetadata($db, 1);
if (count($images) !== 1 || $images[0]['alt_text'] !== null || $images[0]['is_decorative'] !== false || imageDescriptionsComplete($images)) throw new RuntimeException('Legacy migration did not preserve pending description');
echo "Legacy image migration (twice) passed: $driver\n";
