# Sicherheits- und UX-Maßnahmen

Stand: 6. September 2026. Umsetzung im vorhandenen React-/PHP-/PDO-Aufbau, ohne Architekturwechsel. Entwicklungsdaten und Git-Historie bleiben erhalten.

## Sicherheitsupdate vom 23. Oktober 2026

Die [Node.js-Sicherheitsveröffentlichung vom 21. Oktober](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) behebt unter anderem einen Brotli-Speicherfehler mit möglicher Codeausführung (CVE-2026-111497) sowie DNS-/TLS-Schwachstellen. Node.js stuft die höchste Schwere dieser Veröffentlichung als **High** ein. [24.22.1](https://nodejs.org/en/blog/release/v24.22.1) enthält die Korrekturen für die hier verwendete LTS-Linie.

Die lokale Node.js-Version war bei der Prüfung bereits 24.22.1. Zuvor gab das Repository im Docker-Build nur `node:24-alpine` und lokal Node 24 vor; damit war ein älteres, verwundbares Buildimage möglich. Docker-Build und `.nvmrc` verwenden jetzt ausdrücklich 24.22.1; beide npm-Manifeste verlangen mindestens diesen Patch innerhalb der 24er-Linie. Node.js wird ausschließlich für Entwicklung/Build benötigt: Das ausgelieferte Frontend ist statisch unter Nginx, das Backend läuft unter PHP. Ein laufendes Zielsystem wurde nicht untersucht oder deployt. Vorhandene Images/Installationen werden durch einen Git-Push nicht aktualisiert; Neubau mit `docker compose build --pull` und anschließender Containerwechsel sind nötig.

Alle npm-Abhängigkeiten wurden auf aktuelle stabile, kompatible Versionen aktualisiert, einschließlich transitiver Pakete. Unter anderem: DOMPurify 3.4.17, React/React DOM 19.3.1, Vite 8.3.5, Framer Motion 14.6.0, concurrently 10.0.6 und Playwright 1.64.1. Die zuvor gemeldeten kritischen Befunde bei DOMPurify und shell-quote sowie die hohen Befunde bei Vite, brace-expansion und source-map-js sind im aktualisierten Abhängigkeitsbaum behoben. Ein betroffener Paketstand allein beweist keine Ausnutzbarkeit im konkreten Anwendungspfad.

Kompatibilitätsgrenzen: TypeScript bleibt auf 6.0.3, da `typescript-eslint` 8.72.0 laut Peer-Abhängigkeit TypeScript `<6.1.0` benötigt ([Maintainer-Hinweis](https://github.com/typescript-eslint/typescript-eslint/issues/12518)). `@types/node` bleibt auf der aktuellen 24er-Version 24.19.2 passend zur Laufzeit. Composer aktualisiert alle PHP-8.3-kompatiblen Pakete, darunter HTMLPurifier 4.19.1 und PHPUnit 12.5.40; die Mindestversionen sind angehoben. Höhere Hauptversionen mit höheren PHP-Anforderungen werden nicht erzwungen.

**Verbleibender Editor-Befund:** React Quill 3.8.3 benötigt Quill 2.0.3. Für dessen [CVE-2025-15056](https://github.com/advisories/GHSA-v3m3-f69x-jf25) gibt es weiterhin keinen Herstellerpatch. Das bisherige Festhalten an 2.0.2 ersetzt keinen Patchnachweis; jetzt wird die aktuelle Version mit einer expliziten Formatfreigabe verwendet. Formel-, Video- und andere Einbettungen sind deaktiviert, exportiertes HTML wird sofort mit DOMPurify bereinigt. Die bestehende serverseitige HTMLPurifier-Bereinigung sowie DOMPurify bei der Ausgabe bleiben zusätzliche Schutzschichten. Der Browser-Regressionsfall prüft eingefügte Video-/Formel-/Bild-Payloads und den Erhalt normaler Textformatierung. Das ist eine Anwendungsmitigation, kein Patch der Quill-Bibliothek. `npm audit` meldet deshalb weiterhin **zwei Low-Einträge** für Quill und dessen React-Wrapper. Diese Meldungen werden nicht ausgeblendet; ein Herstellerfix muss nachgezogen werden.

Priorität: P0 = Sicherheits-/Datenverlustrisiko, P1 = zentrale Alltagsabläufe, P2 = Komfort/Wartbarkeit. Komplexität: S = eng begrenzte Änderung, M = mehrere zusammenhängende Stellen. Die Angaben beschreiben den Umfang, keine feste Stundenplanung.

## Umgesetzt

| Priorität | Maßnahme | Komplexität | Umsetzung / Nachweis |
| --- | --- | --- | --- |
| P0 | Entwürfe und interne Kontodaten schützen | S | Detailansicht prüft Eigentümer/Admin; öffentliche Antworten enthalten nur benötigte Felder. Inaktive Anbieter werden öffentlich ausgeblendet. HTTP-Tests. |
| P0 | Gespeichertes HTML gegen XSS absichern | M | HTMLPurifier auf dem Server, DOMPurify bei Detail-/Vorschauausgabe; beschränkte Formate/Links, keine eingebetteten Bilder/Skripte. Vorhandene Beschreibungen werden einmal bereinigt. |
| P0 | Sessions und CSRF absichern | M | HttpOnly-/SameSite-Cookies, Secure-/__Host-Cookies in Produktion; nur Hashes in der DB, Origin- und CSRF-Prüfung. Logout und Passwortwechsel widerrufen Sessions. Keine Bearer-Session mehr im localStorage. |
| P0 | Login/Reset vor wiederholten Versuchen schützen | M | Datenbankgestützte IP-/Kontolimits, keine ungeprüften Forwarded-IPs; Resetantwort verrät keine Konten. Passworttokens sind einmalig und zeitlich begrenzt. |
| P0 | Sichere Veröffentlichung und Uploads | M | Strenge serverseitige Typ-/Längen-/Status-/Datums-/Werteprüfung; Entwürfe dürfen unvollständig sein. MIME/Inhalt/Dimensionen/Anzahl/Größe von Bildern geprüft, Bilder neu kodiert und EXIF entfernt. Fehlerhafte Auswahl wird vollständig abgewiesen. |
| P0 | Lokale Entwicklung vom Deployment trennen | M | Demo-Seeding nur im Entwicklungsmodus; Produktionsprüfung und erster Admin ohne Standardpasswort. Apache schützt private Dateien, Dockerimages schließen lokale DB/Logs/Config aus. |
| P0 | Vertrauliche Links nicht protokollieren | S | Kein Mail-Fallback mit Nachrichtentext oder Resetlink; neue Anwendungslogs standardmäßig außerhalb des Webroots. Bestehende Entwicklungslogs bleiben unverändert. |
| P0 | Platzanfragen datensparsam weiterleiten | M | Teilnehmer- und Kontaktdaten werden nur per Mail an den Anbieter übertragen; die Datenbank hält ausschließlich begrenzte technische Metadaten. Empfängeradresse und Kapazitätszahlen bleiben intern. |
| P1 | Datenverlust und Doppelklicks vermeiden | M | Gesperrte laufende Aktionen, sichtbare Fehler/Erfolgsmeldungen, Eingaben bei Fehlern erhalten, Inline-Wiederanmeldung. Seitenwechsel lädt Formulare nicht mehr doppelt. Warnung beim Verwerfen/Verlassen geänderter Freizeitformulare. |
| P1 | Schrittweise Freizeiterstellung verbessern | M | Vollständigkeitsanzeige, gezielter Fokus auf fehlende Felder, Weiter/Zurück, unvollständige Entwürfe speicherbar; optionale Koordinaten. |
| P1 | Bildauswahl verständlicher machen | M | Limits vor Upload sichtbar, einzelne Dateien aus Auswahl entfernen, lokale Miniaturen und Bilder in der Gesamtvorschau. Bereits kopierte Bilder werden erst nach der letzten Referenz gelöscht. |
| P1 | Verwaltung übersichtlicher machen | S | Suche, Statusfilter und Sortierung für Freizeiten, Vereinssuche, Einladungsstatus und erneuter Versand; Ferienüberschneidungen werden abgewiesen. |
| P1 | Öffentliche Suche verlässlich halten | M | Suchfilter in der URL, Rückkehr aus Details mit Filtern; überholte Anfragen werden abgebrochen, Ladezustand und Serverfehler statt irreführender Leermeldung. Anmeldung direkt beim Anbieter deutlicher. |
| P1 | SQL- und Serverbetrieb prüfen | M | MySQL-Default-/Syntaxprobleme und PostgreSQL-Typen korrigiert; SQL-/Apache-Smoke-Tests und Produktions-Bootstrap-Test ergänzt. |
| P2 | Tastatur, Dialoge und mobile Bedienung | S–M | Native modale Dialoge mit Fokusbindung, Escape und Fokusrückgabe; fokussierbare Kategorieauswahl, benannte Textbearbeitung, mobile Ansicht geprüft. Keine Behauptung vollständiger WCAG-Konformität. |
| P2 | Öffentliche Seite schlanker laden | S | Verwaltung, Texteditor und Karte nach Bedarf geladen; lokale Karten-Icons und keine externen Google-Fonts. Haupt-JS-Bundle ca. 385 kB statt ca. 815 kB vor der Aufteilung (unkomprimiert). |
| P2 | Regressionen und Abhängigkeiten prüfen | M | PHP-/HTTP-Tests, Playwright-Abläufe, Build/Lint, npm-/Composer-Audit und Dockerbuilds. Aktuelle Quill-Version mit Formatfreigabe und HTML-Bereinigung; verbleibendes Advisory siehe Sicherheitsupdate oben. |

## Bewusst erst beim Deployment

| Wichtigkeit | Aufgabe | Komplexität | Voraussetzung |
| --- | --- | --- | --- |
| Vor Freigabe | HTTPS, reale Domain, SQL-/Admin-Zugang, APP_KEY und Dateirechte konfigurieren | S–M | Zielserver steht fest; siehe README. |
| Vor Freigabe | Mailtransport und tatsächlichen Empfang testen | M | Absenderdomain/Transport stehen fest. Ein positiver mail()-Rückgabewert beweist keine Zustellung. |
| Vor Freigabe | Proxy-IP-Vertrauen, Backups, Wiederherstellung und Log-/DB-Aufbewahrung einrichten | M | Betriebsumgebung und Aufbewahrungsfristen stehen fest. |
| Vor Freigabe | Fachliche Inhalte und Datenschutzinformationen einschließlich externer OSM-Karten prüfen | S–M | Tatsächliches Angebot und Datenverarbeitung stehen fest. Keine rechtliche Prüfung durch dieses Code-Review. |
| Danach | Mit Vereinsverantwortlichen und Familien testen, ergänzend Screenreader-/Browsermatrix | M | Echte Testpersonen; automatisierte Chromium-Tests ersetzen keinen Nutzertest. |

## Grenzen und Hinweise

- Keine vollständige Penetrationstest- oder Sicherheitsgarantie. Automatische Dependency-Audits zeigen nur bekannte Einträge ihrer Datenbanken.
- Keine produktiven Dienste angesprochen oder deployt. SQL-/Browserprüfungen nutzen getrennte Wegwerf-Datenbanken.
- Beim Bearbeiten werden Freizeitdaten und zusätzliche Bilder über zwei bestehende API-Aufrufe gespeichert. Ein fehlgeschlagener Bild-Upload kann daher bereits gespeicherte Textdaten hinterlassen; die Oberfläche weist darauf hin und erhält die Bildauswahl für einen neuen Versuch.
- Gleichzeitiges Bearbeiten derselben Freizeit durch zwei Personen hat weiterhin keine Versionskonflikterkennung. Die Transaktionen schützen Konsistenz und Bildreferenzen, nicht vor dem Überschreiben einer inzwischen geänderten Version.
- Warnungen schützen die üblichen Verlassen-/Schließen-Aktionen. Ein Browserabsturz oder erzwungenes Schließen ist ohne vorheriges Speichern weiterhin nicht wiederherstellbar; es wurde bewusst kein Autosave-System eingeführt.
- Bilder selbst sind öffentlich abrufbare, zufällig benannte Dateien. Keine vertraulichen personenbezogenen Dokumente hochladen. Die Privatheitsprüfung schützt Freizeitdaten/Entwürfe, nicht ein separates geschütztes Dateiarchiv.
- Das globale Migrations-/Schreib-Lock ist für dieses kleine Portal bewusst einfach gehalten. Einrichtung/Migrationen beim Deployment ohne parallele Requests ausführen; kein neues Migrationsframework.
- Platzanfragen sind ausdrücklich keine Reservierung. Da Anbieter freie Plätze manuell pflegen, verhindert das Portal keine zeitgleichen externen Zusagen und garantiert keine Echtzeit-Verfügbarkeit.

Ausführbare Prüfungen und Testumgebung: [TESTING.md](TESTING.md).
