# Westsachsen Ferienfreizeiten

Regionales Portal für Ferienfreizeiten: Vereine pflegen ihre Angebote und optional Kapazitäten, Familien suchen nach Alter, Kategorie, Termin und auf der Karte und können unverbindliche Platzanfragen senden.

Die Oberfläche verwendet ein gemeinsames responsives Designsystem mit WCAG-2.2-AA als Ziel. Anbieter können Bildbeschreibungen pflegen oder Bilder ausdrücklich als dekorativ kennzeichnen. Bestehende Bilder bleiben erhalten und müssen gegebenenfalls vor einer erneuten Veröffentlichung beschrieben werden. Die Bild-URL-API bleibt kompatibel; Migration 3 ergänzt die Bildmetadaten automatisch.

Unter `/barrierefreiheit` stehen Informationen zum Arbeitsstand und ein Rückmeldeweg bereit. Prüfungen und noch offene Freigabevoraussetzungen sind im [Barrierefreiheits-Prüfbericht](docs/barrierefreiheit-pruefbericht.md) dokumentiert; eine vollständige BITV-Konformität ist damit nicht zugesichert.

## Lokal entwickeln

Voraussetzungen: Node.js 24, Composer, PHP 8.3+ mit PDO/SQLite, DOM, Fileinfo, Mbstring und GD (JPEG/PNG/WebP).

```sh
npm ci
cd frontend
npm ci
cd ../backend
composer install
cd ..
npm run dev
```

Frontend: http://localhost:5173 · Backend: http://localhost:8000

SQLite bleibt der lokale Standard (`backend/database.sqlite`). Die Entwicklungszugänge bleiben bestehen:

| Konto | Benutzername | Passwort |
| --- | --- | --- |
| Master-Admin | admin | admin |
| Verein | testverein | testverein |

Demo-Freizeiten werden bei der Einrichtung angelegt. Lokale SQLite-Dateien, Testnutzer und vorhandene Entwicklungslogs müssen nicht aus dem Repository oder der Git-Historie entfernt werden. Produktionsimages nehmen diese Dateien nicht mit.

Die Anmeldung verwendet jetzt HttpOnly-Cookies. Nach dem Update einmal neu anmelden. Für HTML-Bereinigung ist `composer install` auch bei der lokalen Entwicklung erforderlich.

## Platzanfragen

Anbieter können die Platzverwaltung pro Freizeit aktivieren, freie Plätze intern pflegen und laufende Anfragen oder einen Bewerbungszeitraum mit externer Verlosung anbieten. Öffentlich werden nur Statusstufen, keine Kapazitätszahlen oder internen Anfrageadressen ausgegeben. Anfrageinhalte werden direkt per E-Mail versendet und nicht in der Portal-Datenbank gespeichert; Buchung, Zusage, Verlosung und Bezahlung bleiben beim Anbieter.

Ohne eigene Konfiguration gelten `APP_ENV=development`, SQLite und `APP_BASE_URL=http://localhost:5173`. Zum Ändern der Adresse muss `APP_BASE_URL` zur tatsächlich verwendeten Frontend-Adresse passen (auch Port und localhost/127.0.0.1 beachten). Echte Konfigurationswerte gehören in Umgebungsvariablen oder die ignorierte Datei `backend/config.local.php`; Umgebungsvariablen haben Vorrang. `config.example.php` ist eine **Produktionsvorlage**, keine notwendige lokale Konfiguration.

## Docker-Entwicklungsstack

```sh
docker compose up -d --build
```

Frontend: http://localhost:8080 · Backend: http://localhost:8000

Der Stack verwendet MySQL, Entwicklungszugänge und Demo-Daten. Die Ports sind ausschließlich an den lokalen Rechner gebunden. Er ist keine fertige Produktionskonfiguration.

PHP-Pakete liegen im separaten `backend_vendor`-Volume, damit der Quellcode-Mount die installierten Pakete nicht verdeckt. Nach Änderungen an `composer.lock`:

```sh
docker compose exec backend composer install --no-dev
```

## Prüfen

```sh
cd backend
composer test
composer audit
cd ../frontend
npm run lint
npm run build
npm audit
npx playwright install chromium
```

Die PHP-Tests verwenden ausschließlich temporäre Datenbanken; die HTTP-Tests starten einen eigenen PHP-Testserver. Sie sind unter Linux/Docker geprüft. Die Browser-Tests benötigen ebenfalls ein separates Test-Backend, nicht deine lokale Entwicklungsdatenbank. Einrichtung und SQL-/Server-Tests stehen in [TESTING.md](TESTING.md).

## Späteres Deployment

Frontend und PHP/PDO-Backend bleiben bestehen; ein Framework- oder Architekturwechsel ist nicht nötig.

1. `frontend` mit `npm ci` und `npm run build` bauen.
2. `frontend/dist/` in den Webroot kopieren, den Backend-Code in dessen Unterordner `backend/`. **Keine** lokale SQLite-Datenbank, Entwicklungslogs, Tests oder lokale Konfiguration mit deployen. `composer install --no-dev --prefer-dist --no-interaction` im Backend ausführen.
3. Apache mit `mod_rewrite`, `mod_headers` und wirksamen `.htaccess`-Regeln einrichten (`AllowOverride All` für diese Verzeichnisse). Die mitgelieferten Regeln schützen Backend-Dateien und leiten API/Bilder weiter. Bei Nginx sind entsprechende Serverregeln nötig; `frontend/nginx.conf` zeigt die getrennte Docker-Variante.
4. HTTPS auf der gesamten Website erzwingen. Frontend, `/api/` und `/uploads/` müssen unter **derselben Origin** erreichbar sein.
5. `backend/config.example.php` als Vorlage verwenden: `APP_ENV=production`, `APP_BASE_URL=https://…`, zufälliger `APP_KEY` mit mindestens 32 Zeichen, gültiger `MAIL_FROM`, MySQL-/PostgreSQL-Zugang und ein beschreibbares `APP_LOG_DIR` **außerhalb** des Webroots. SQLite wird im Produktionsmodus abgelehnt. Einen Schlüssel erzeugt `php -r "echo bin2hex(random_bytes(32));"`.
6. Für eine leere Produktionsdatenbank einmal `BOOTSTRAP_ADMIN_EMAIL` und `BOOTSTRAP_ADMIN_PASSWORD` setzen (mindestens 16, höchstens 72 Bytes), Anwendung initialisieren, Anmeldung prüfen und beide Werte wieder entfernen. In Produktion werden auch bei `SEED_DEMO_DATA=1` **keine Demo-Konten** angelegt. Dafür eine frische SQL-Datenbank nutzen; vorhandene lokale Testkonten werden bewusst nicht automatisch gelöscht.
7. Nur das Upload-Verzeichnis beschreibbar machen; PHP-Code und Konfiguration nicht durch den Webprozess beschreiben lassen. Upload-Grenzen aus `backend/php.ini` auch im Webserver/PHP-FPM übernehmen. Das Dockerfile übernimmt sie bereits.
8. PHP-`mail()` mit einem echten Mailtransport konfigurieren und Einladung, Passwort-Reset, Kontaktformular sowie Anbieter- und Bestätigungsmails für Platzanfragen bis zum tatsächlichen Empfang testen. Das mitgelieferte Dockerimage enthält noch keinen Mailtransport. Es gibt keinen Fallback, der Nachrichteninhalte oder Resetlinks in Logdateien schreibt.
9. Bei einem Reverse Proxy `TRUSTED_PROXIES` ausschließlich auf dessen konkrete IP-Adressen setzen und weitergeleitete Client-IP-Header am äußeren Proxy kontrollieren. Ohne diese Konfiguration werden Forwarded-Header ignoriert; dadurch teilen sich Nutzer hinter einem Proxy dessen Rate-Limit.
10. Vor Freigabe Backups/Wiederherstellung, Rechte, HTTPS, Versand, Logrotation und regelmäßige Löschung abgelaufener Sessions/Passworttokens/Rate-Limit-Einträge festlegen. Platzanfrage-Ereignisse werden höchstens 90 Tage gehalten; über `PLACE_REQUEST_EVENT_RETENTION_DAYS` kann eine kürzere Frist konfiguriert werden.

Die Einrichtung ergänzt Tabellen automatisch über `app_migrations`. Beim ersten Start nach diesem Sicherheitsupdate werden bisherige Sessions widerrufen und gespeicherte Beschreibungen bereinigt. Vor Aktualisierung einer wichtigen Datenbank deshalb ein Backup anlegen und den ersten Start ohne parallelen öffentlichen Verkehr durchführen.

Prioritäten, umgesetzte Maßnahmen und verbleibende Deployment-Aufgaben: [SECURITY_AND_UX.md](SECURITY_AND_UX.md).
