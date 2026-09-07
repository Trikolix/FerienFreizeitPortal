<?php

function ensureImageMetadataSchema(PDO $db, string $driver): void {
    $columns = $driver === 'sqlite'
        ? $db->query('PRAGMA table_info(camp_images)')->fetchAll(PDO::FETCH_COLUMN, 1)
        : ($driver === 'mysql'
            ? $db->query('SHOW COLUMNS FROM camp_images')->fetchAll(PDO::FETCH_COLUMN)
            : $db->query("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'camp_images'")->fetchAll(PDO::FETCH_COLUMN));
    foreach (['alt_text' => 'VARCHAR(500)', 'is_decorative' => 'INTEGER NOT NULL DEFAULT 0'] as $name => $type) {
        if (!in_array($name, $columns, true)) $db->exec("ALTER TABLE camp_images ADD COLUMN $name $type");
    }
}

function validateImageMetadata(array $input): array {
    $alt = $input['alt_text'] ?? null;
    $decorative = $input['is_decorative'] ?? false;
    if (($alt !== null && (!is_string($alt) || mb_strlen($alt) > 500)) || !in_array($decorative, [true, false, 0, 1], true)) {
        throw new InvalidArgumentException('Bitte eine Bildbeschreibung mit höchstens 500 Zeichen und eine gültige Dekorativkennzeichnung angeben.');
    }
    return ['alt_text' => $decorative ? null : (($alt = trim($alt ?? '')) !== '' ? $alt : null), 'is_decorative' => (int)(bool)$decorative];
}

function imageMetadataPayload(array $row): array {
    return ['id' => (int)$row['id'], 'image_url' => $row['image_url'], 'alt_text' => $row['alt_text'], 'is_decorative' => (bool)$row['is_decorative']];
}

function campImageMetadata(PDO $db, $campId): array {
    $stmt = $db->prepare('SELECT id, image_url, alt_text, is_decorative FROM camp_images WHERE camp_id = ? ORDER BY id');
    $stmt->execute([$campId]);
    return array_map('imageMetadataPayload', $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function imageDescriptionsComplete(array $images): bool {
    foreach ($images as $image) {
        if (empty($image['is_decorative']) && trim($image['alt_text'] ?? '') === '') return false;
    }
    return true;
}

function requireImageDescriptions(array $images, string $status): void {
    if (in_array($status, ['published', 'fully_booked'], true) && !imageDescriptionsComplete($images)) {
        $message = 'Bitte beschreibe jedes Bild oder kennzeichne es als dekorativ, bevor du veröffentlichst.';
        jsonResponse(['error' => $message, 'fields' => ['images' => $message]], 422);
    }
}
