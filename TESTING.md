# Prüfungen reproduzieren

Alle schreibenden Tests ausschließlich gegen **separate Wegwerf-Datenbanken** ausführen. Die vorhandene `backend/database.sqlite` und bereits vorhandene Docker-Datenbankvolumes werden nicht benötigt.

## PHP: Unit- und echte HTTP-Tests

Mit installiertem PHP 8.3+ und den Erweiterungen aus der README:

```sh
cd backend
composer install
composer test
composer audit
```

Oder aus dem Repository-Root mit Docker (PowerShell):

```powershell
docker build -t ffp-check backend
docker run --rm ffp-check sh -c 'composer install --no-interaction --prefer-dist && php vendor/bin/phpunit tests --do-not-cache-result'
```

Der Testserver und sämtliche SQLite-Dateien/Bilder/Logs entstehen in zufälligen temporären Verzeichnissen. Linux/Docker ist die geprüfte Umgebung für den HTTP-Testserver (`sendmail_path=/bin/false` simuliert einen Versandfehler).

Abgedeckt: Rechte/Rollen, öffentliche Daten, private Entwürfe, inaktive Nutzer, CSRF, widerrufene Sessions, Resetlinks, Rate-Limits/gefälschte Proxy-Header, XSS, Feldvalidierung, Platzstatus und Platzanfragen ohne Inhaltsablage, gemischte Upload-Auswahl sowie Bildreferenzen nach dem Kopieren/Löschen.

## Frontend und Browser mit SQLite

```powershell
docker run --rm -d --name ffp-browser-test -p 127.0.0.1:18080:8000 -e APP_ENV=development -e APP_BASE_URL=http://127.0.0.1:5174 -e DB_CONNECTION=sqlite -e DB_SQLITE_PATH=/tmp/browser.sqlite -e UPLOAD_DIR=/tmp/browser-uploads -e SEED_DEMO_DATA=1 ffp-check php -d sendmail_path=/bin/false -S 0.0.0.0:8000 index.php
cd frontend
npm ci
npm run lint
npm run build
npm audit
npx playwright install chromium
npm run test:e2e
```

Playwright startet Vite selbst auf Port 5174 und verwendet ausschließlich das Backend auf Port 18080. Gegen einen bereits laufenden, **isolierten** Nginx-/Apache-Teststack kann stattdessen `PLAYWRIGHT_BASE_URL=http://127.0.0.1:18084` gesetzt werden. Dann startet Playwright kein Vite.

Nach dem Lauf `docker stop ffp-browser-test` ausführen. Das entfernt nur diesen Testcontainer samt dessen flüchtiger DB/Uploads, nicht die Entwicklungsdaten. Für wiederholte vollständige Testläufe einen frischen Testcontainer starten: Die Tests umgehen die Anmelde-Limits bewusst nicht.

Browserfälle: Anmeldung/Reload/Logout, unvollständiger Entwurf, Veröffentlichung inklusive Platzverwaltung, Fokus und Vorschau/Escape, fehlerhaftes Speichern/Doppelklick, erneute Anmeldung ohne Eingabeverlust, Einladungsfehler/erneuter Versand, Bildvorschau vor Upload, öffentliche Mehrpersonen-Platzanfrage, Suchfilter/Fehler/Retry und 375-Pixel-Ansicht. Tests nutzen Chromium; fehlgeschlagene Läufe hinterlassen lokale Traces in `frontend/test-results/`.

## SQL und Apache (PowerShell, Repository-Root)

Die folgenden Namen sind ausschließlich für diese Wegwerf-Umgebung gedacht. Bestehen sie bereits, erst prüfen, wem die Container gehören; keine bestehenden Anwendungsdatenbanken dafür verwenden.

```powershell
docker network create ffp-test-sql
docker run --rm -d --name ffp-test-mysql --network ffp-test-sql -e MYSQL_ROOT_PASSWORD=test-only -e MYSQL_DATABASE=ffp mysql:8.0
docker run --rm -d --name ffp-test-pg --network ffp-test-sql -e POSTGRES_PASSWORD=test-only -e POSTGRES_DB=ffp postgres:16-alpine
```

Warten, bis die Datenbanken bereit sind (`docker logs ffp-test-mysql`, `docker logs ffp-test-pg`), dann:

```powershell
docker run --rm -d --name ffp-test-mysql-api --network ffp-test-sql -p 127.0.0.1:18081:80 -e APP_ENV=development -e APP_BASE_URL=http://localhost:5173 -e DB_CONNECTION=mysql -e DB_HOST=ffp-test-mysql -e DB_NAME=ffp -e DB_USER=root -e DB_PASSWORD=test-only -e SEED_DEMO_DATA=1 ffp-check
docker run --rm -d --name ffp-test-pg-api --network ffp-test-sql -p 127.0.0.1:18082:80 -e APP_ENV=development -e APP_BASE_URL=http://localhost:5173 -e DB_CONNECTION=pgsql -e DB_HOST=ffp-test-pg -e DB_NAME=ffp -e DB_USER=postgres -e DB_PASSWORD=test-only -e SEED_DEMO_DATA=1 ffp-check
$env:FFP_SQL_SMOKE='1'
node backend/tests/sql-smoke.mjs http://127.0.0.1:18081
node backend/tests/sql-smoke.mjs http://127.0.0.1:18082
```

Diese Tests prüfen HTTP-Anmeldung, Draft-Privatheit, Validierung, HTML-Bereinigung, Veröffentlichung, private Kapazitätsfelder, schnelle Bestandsänderungen, Statusänderung durch Admin, Suchfilter, Ferienüberschneidung, Löschen, Logout und gesperrte Backend-Dateien unter Apache. Die Testfreizeiten/-ferien werden am Ende entfernt.

Anschließend ausschließlich die selbst gestarteten Testcontainer stoppen:

```powershell
docker stop ffp-test-mysql-api ffp-test-pg-api ffp-test-mysql ffp-test-pg
docker network rm ffp-test-sql
```

## Produktionsmodus getrennt prüfen

`backend/tests/production-smoke.mjs` erwartet eine frisch eingerichtete Wegwerf-SQL-Datenbank mit:

- `APP_ENV=production`, `APP_BASE_URL=https://portal.example.test`, einem ausschließlich für den Test erzeugten `APP_KEY` und gültigem `MAIL_FROM`.
- `BOOTSTRAP_ADMIN_EMAIL=bootstrap@example.test`, `BOOTSTRAP_ADMIN_PASSWORD=temporary-bootstrap-test-password` (nur Testwerte, nicht deployen).
- Absichtlich `SEED_DEMO_DATA=1`, um zu prüfen, dass das im Produktionsmodus ignoriert wird.

API ausschließlich an `127.0.0.1:18083` binden, `FFP_SQL_SMOKE=1` setzen und `node backend/tests/production-smoke.mjs http://127.0.0.1:18083` ausführen. Die Prüfung sendet Cookies manuell: Sie testet Attribute, Bootstrap, kein Demo-Seeding und CSRF, **nicht** einen echten TLS-Endpunkt. Vor Freigabe bleiben HTTPS-/Proxy- und echte Mailzustellungstests auf dem Zielserver erforderlich.

## Verifizierter Stand

- PHP 8.3: Platzverwaltungsstand mit 45 Tests/281 Assertions; aktueller Redesign-Abschluss siehe unten.
- SQLite: Migration und erweiterter SQL-/API-Smoke-Test erfolgreich.
- MySQL 8.0 und PostgreSQL 16: Erweiterte Migrations-, SQL-, API- und Apache-Smoke-Tests erfolgreich.
- Produktionsmodus: gezielter erster Admin, kein Demo-Seeding, sichere Cookieattribute und Logout erfolgreich.
- Frontend: TypeScript-/Vite-Build, ESLint und 10 Chromium-Browserabläufe erfolgreich; ein früherer Stand lief zusätzlich mit gebautem Frontend hinter Nginx und MySQL.
- npm-/Composer-Audit ohne gemeldete Schwachstellen beim Prüflauf. Kein Ersatz für einen umfassenden Sicherheitsnachweis.

## Redesign und Barrierefreiheit (7. September 2026)

- PHP 8.3: **49 Tests, 311 Assertions erfolgreich**, einschließlich Bildmetadaten-Upload, Kopieren und Schutz veröffentlichter Bildbeschreibungen.
- 15 Playwright-/Chromium-Tests im vollständigen Abschlusslauf erneut erfolgreich: 11 Funktionsabläufe und 4 zusätzliche Barrierefreiheits-/Responsive-Szenarien. Öffentliche Seitentypen wurden bei 320, 390, 768, 1280 und 1536 CSS-Pixeln geprüft; außerdem Dialoge, Kontomenü, Formularfehler einschließlich Admin-Fehlerfokus, Anbieter-/Admin- und Kontoseiten. Keine axe-Verstöße in den geprüften Zuständen.
- TypeScript, ESLint und Vite-Produktionsbuild erfolgreich. Docker-Build mit Node 24 ebenfalls geprüft.
- Docker lokal neu gebaut und unter `http://localhost:8080` gestartet; vorhandene Entwicklungsdaten bleiben erhalten. Startseite zusätzlich am gebauten Nginx-Frontend bei 320 und 1280 Pixeln mit normalen Bewegungseinstellungen geprüft: keine axe-Verstöße, kein horizontaler Überlauf, keine JavaScript-Fehler. API und Weboberfläche antworten mit HTTP 200.
- SQLite sowie MySQL 8/PostgreSQL 16: Bildmetadaten, Uploads, API und Migrations-Smoke-Tests erfolgreich. Die Legacy-Bildmigration wurde auf beiden SQL-Servern zweimal ausgeführt, ohne Datenverlust oder zweite Änderung.
- Neue Tests: `backend/tests/ImageMetadataTest.php`, ergänzte HTTP-/SQL-Smoke-Tests und `frontend/tests/accessibility.spec.ts` mit `@axe-core/playwright`.
- Für einen wiederholten vollständigen Browserlauf den Wegwerf-Testcontainer neu starten. Die Login-Rate-Limits bleiben aktiv und werden nicht für Tests abgeschwächt. Keine zusätzliche manuelle Demo-Anmeldung während des vollständigen Laufs.
- Die Legacy-SQL-Prüfung `backend/tests/image-migration-smoke.php` mit `FFP_SQL_SMOKE=1` **vor dem ersten API-Aufruf** ausschließlich in einer leeren Wegwerf-SQL-Datenbank ausführen. Sie legt absichtlich eine alte Bildtabelle an und prüft deren Migration. Die üblichen SQL-Smoke-Tests danach ausführen.
- NVDA/Firefox, VoiceOver/Safari, reale mobile Bildschirmtastaturen und die unabhängige BITV-/WCAG-Prüfung sind noch offen. Details und redaktionelle Freigabevoraussetzungen: [Prüfbericht](docs/barrierefreiheit-pruefbericht.md).
