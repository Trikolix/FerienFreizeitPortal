<?php
require_once __DIR__ . '/image_metadata.php';

function uploadDirectory(): string {
    return (string)appConfig('UPLOAD_DIR', __DIR__ . '/uploads');
}

function validateUploadedImages(PDO $db, $campId = null): array {
    if (!isset($_FILES['images'])) return [];
    $files = $_FILES['images'];
    $rawMetadata = $_POST['upload_metadata'] ?? '[]';
    if (!is_string($rawMetadata)) jsonResponse(['error' => 'Ungültige Bildbeschreibungen.'], 422);
    $metadata = json_decode($rawMetadata, true);
    if (!is_array($metadata) || !array_is_list($metadata) || count($metadata) > 10) jsonResponse(['error' => 'Ungültige Bildbeschreibungen.'], 422);
    if (!is_array($files['name'] ?? null) || !is_array($files['tmp_name'] ?? null) || !is_array($files['error'] ?? null)) jsonResponse(['error' => 'Ungültige Bildauswahl.'], 422);
    $maxCount = max(1, (int)appConfig('UPLOAD_MAX_FILES', 10));
    $existing = 0;
    if ($campId) {
        // beginWrite serializes writes; keep an explicit row lock on SQL servers.
        if ($db->inTransaction() && $db->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'sqlite') {
            $lock = $db->prepare('SELECT id FROM camps WHERE id = ? FOR UPDATE');
            $lock->execute([$campId]);
        }
        $stmt = $db->prepare('SELECT COUNT(*) FROM camp_images WHERE camp_id = ?');
        $stmt->execute([$campId]);
        $existing = (int)$stmt->fetchColumn();
    }
    if (count($files['name']) + $existing > $maxCount) jsonResponse(['error' => "Pro Freizeit sind höchstens $maxCount Bilder erlaubt."], 422);
    $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    $validated = [];
    $total = 0;
    $errors = [];
    foreach ($files['name'] as $i => $name) {
        try {
            if (isset($metadata[$i]) && !is_array($metadata[$i])) throw new InvalidArgumentException('Ungültige Bildbeschreibung.');
            $description = validateImageMetadata($metadata[$i] ?? []);
        } catch (InvalidArgumentException $e) { jsonResponse(['error' => $e->getMessage()], 422); }
        $error = null;
        $tmp = $files['tmp_name'][$i] ?? '';
        if (($files['error'][$i] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_string($tmp) || !is_uploaded_file($tmp)) {
            $error = 'Upload fehlgeschlagen oder Datei zu groß.';
        } else {
            $size = filesize($tmp);
            $total += $size;
            $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmp);
            $dimensions = @getimagesize($tmp);
            if ($size > (int)appConfig('UPLOAD_MAX_BYTES', 5 * 1024 * 1024)) $error = 'Höchstens 5 MB pro Bild erlaubt.';
            elseif (!isset($allowed[$mime]) || !$dimensions || ($dimensions['mime'] ?? '') !== $mime) $error = 'Bitte ein gültiges JPEG-, PNG- oder WebP-Bild wählen.';
            elseif ($dimensions[0] > 6000 || $dimensions[1] > 6000 || $dimensions[0] * $dimensions[1] > 20000000) $error = 'Das Bild darf höchstens 6000 Pixel pro Seite und 20 Megapixel haben.';
            else $validated[] = ['tmp' => $tmp, 'extension' => $allowed[$mime], ...$description];
        }
        if ($error) $errors[] = ['index' => $i, 'name' => is_string($name) ? mb_substr(basename($name), 0, 120) : 'Bild', 'error' => $error];
    }
    if ($total > 25 * 1024 * 1024) $errors[] = ['error' => 'Zusammen sind höchstens 25 MB erlaubt.'];
    if ($errors) jsonResponse(['error' => 'Bilder wurden nicht gespeichert. Bitte prüfe die Auswahl.', 'files' => $errors], 422);
    return $validated;
}

function persistUploadedImages(PDO $db, $campId, array $validated, array &$createdPaths): array {
    $dir = uploadDirectory();
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) throw new RuntimeException('Upload directory unavailable');
    $saved = [];
    foreach ($validated as $file) {
        $filename = bin2hex(random_bytes(16)) . '.' . $file['extension'];
        $path = $dir . '/' . $filename;
        // Decode and encode anew: reject broken images and remove EXIF/location metadata.
        $image = @imagecreatefromstring(file_get_contents($file['tmp']));
        if (!$image) throw new RuntimeException('Invalid image data');
        $createdPaths[] = $path;
        imagealphablending($image, false);
        imagesavealpha($image, true);
        $ok = match ($file['extension']) {
            'jpg' => imagejpeg($image, $path, 88),
            'png' => imagepng($image, $path, 6),
            'webp' => imagewebp($image, $path, 88),
        };
        imagedestroy($image);
        if (!$ok) throw new RuntimeException('Image write failed');
        $url = '/uploads/' . $filename;
        $db->prepare('INSERT INTO camp_images (camp_id, image_url, alt_text, is_decorative) VALUES (?, ?, ?, ?)')->execute([$campId, $url, $file['alt_text'] ?? null, $file['is_decorative'] ?? 0]);
        $saved[] = $url;
    }
    return $saved;
}

function removeUnreferencedImages(PDO $db, array $urls): void {
    foreach (array_unique($urls) as $url) {
        if (!preg_match('~^/uploads/[a-f0-9.]+\.(jpg|png|webp)$~D', $url)) continue;
        $stmt = $db->prepare('SELECT COUNT(*) FROM camp_images WHERE image_url = ?');
        $stmt->execute([$url]);
        $path = uploadDirectory() . '/' . basename($url);
        if (!(int)$stmt->fetchColumn() && is_file($path) && !unlink($path)) logError('Unreferenced image cleanup failed');
    }
}

function deleteCampRecords(PDO $db, array $campIds): array {
    $urls = [];
    foreach ($campIds as $id) {
        $stmt = $db->prepare('SELECT image_url FROM camp_images WHERE camp_id = ?');
        $stmt->execute([$id]);
        $urls = array_merge($urls, $stmt->fetchAll(PDO::FETCH_COLUMN));
        // Explicit cleanup also repairs legacy SQLite installations without active FKs.
        $db->prepare('DELETE FROM camp_images WHERE camp_id = ?')->execute([$id]);
        $db->prepare('DELETE FROM camp_categories WHERE camp_id = ?')->execute([$id]);
        $db->prepare('DELETE FROM camps WHERE id = ?')->execute([$id]);
    }
    return $urls;
}
