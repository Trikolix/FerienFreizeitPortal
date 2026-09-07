<?php
use PHPUnit\Framework\TestCase;
require_once __DIR__ . '/../image_metadata.php';

final class ImageMetadataTest extends TestCase {
    public function testMigrationPreservesLegacyImagesAndIsIdempotent(): void {
        $db = new PDO('sqlite::memory:');
        $db->exec('CREATE TABLE camp_images (id INTEGER PRIMARY KEY, camp_id INTEGER, image_url TEXT)');
        $db->exec("INSERT INTO camp_images VALUES (1, 7, '/uploads/old.png')");
        ensureImageMetadataSchema($db, 'sqlite');
        ensureImageMetadataSchema($db, 'sqlite');
        $images = campImageMetadata($db, 7);
        self::assertSame([['id' => 1, 'image_url' => '/uploads/old.png', 'alt_text' => null, 'is_decorative' => false]], $images);
        self::assertFalse(imageDescriptionsComplete($images));
    }

    public function testDescriptionsArePlainTextAndDecorativeChoiceIsExplicit(): void {
        self::assertSame(['alt_text' => '<Wald> & Wiese', 'is_decorative' => 0], validateImageMetadata(['alt_text' => ' <Wald> & Wiese ']));
        self::assertSame(['alt_text' => null, 'is_decorative' => 1], validateImageMetadata(['alt_text' => 'ignored', 'is_decorative' => true]));
        self::assertTrue(imageDescriptionsComplete([['alt_text' => 'Bäume'], ['is_decorative' => true]]));
        self::assertTrue(imageDescriptionsComplete([]));
        self::assertFalse(imageDescriptionsComplete([['alt_text' => '   ']]));
        self::assertSame(500, mb_strlen(validateImageMetadata(['alt_text' => str_repeat('ä', 500)])['alt_text']));
    }

    public function testInvalidDescriptionsAreRejected(): void {
        foreach ([['alt_text' => str_repeat('ä', 501)], ['alt_text' => []], ['is_decorative' => 'false'], ['is_decorative' => 2]] as $input) {
            try { validateImageMetadata($input); self::fail('Invalid metadata was accepted'); }
            catch (InvalidArgumentException $e) { self::assertNotEmpty($e->getMessage()); }
        }
    }
}
