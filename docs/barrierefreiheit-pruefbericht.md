# Design und Barrierefreiheit – Prüfbericht

Stand: 7. September 2026. Ziel ist WCAG 2.2 AA mit zusätzlichen Verbesserungen bei Bedienflächen und Kontrasten. Dies ist kein Zertifikat und keine abschließende BITV-Konformitätserklärung.

## Umsetzung

- Gemeinsames helles Designsystem für öffentliche Seiten, Anbieter- und Adminbereich. Logo und grüner Markenakzent bleiben erhalten; dunkles Grün kennzeichnet Aktionen. Die mehrfach überschreibende globale CSS-Kaskade wurde ersetzt.
- Responsive Navigation, Suchfilter, Freizeitkarten, Details/Vorschau, Verwaltungslisten, Formularabschnitte und Kontoseiten. Layouts bleiben bei 320 CSS-Pixeln nutzbar. Fließtext und Eingaben verwenden eine Grundgröße von 16 Pixeln.
- Semantische Seitenbereiche, Hauptüberschriften, dynamische Seitentitel, Sprunglink und Fokus auf den Hauptbereich bei Routenwechseln. Filteränderungen verschieben den Fokus nicht.
- Native Dialoge mit Escape, Fokusrückgabe und Tab-Zyklus. Keine versehentliche Schließung durch Klick auf Dialogabstände. Passwortmanager und Einfügen bleiben möglich.
- Gemeinsame Pflichtfeldhinweise und verknüpfte native Validierungsfehler. Bestehende fachliche Veröffentlichungsprüfungen bleiben aktiv; unvollständige Entwürfe bleiben möglich.
- Beschriftete Texteditor-Steuerelemente und eigener Linkdialog; Bildgalerie ohne automatische Wechsel. Karten sind optional, Koordinaten lassen sich ohne Karte bearbeiten.
- Rücksicht auf reduzierte Bewegung und erzwungene Systemfarben. Kontrastreiche Statusanzeigen mit Text statt alleiniger Farbcodierung.
- Suchkarten und Kategorien erscheinen ohne Transparenzanimation, damit auch während des Öffnens voller Textkontrast erhalten bleibt. Die automatisierte Prüfung berücksichtigt zusätzlich normale Bewegungseinstellungen.
- `/barrierefreiheit` beschreibt den Arbeitsstand und offene Punkte. Der Rückmeldeweg verwendet das bestehende Kontaktformular mit einem editierbaren Nachrichtenvorschlag.

## Bildbeschreibungen und Kompatibilität

Migration 3 ergänzt `camp_images.alt_text` (maximal 500 Zeichen) und `is_decorative`. Bestehende Bilder bleiben erhalten und gelten ohne Beschreibung als nachzupflegen. Bestehende Veröffentlichungen werden nicht automatisch zurückgezogen.

`images: string[]` bleibt unverändert nutzbar. `image_metadata` enthält ergänzend `id`, `image_url`, `alt_text` und `is_decorative`. Multipart-Uploads übermitteln Beschreibungen als JSON-Liste `upload_metadata` in der Reihenfolge der Dateien. `PUT /api/camps/{campId}/images/{imageId}` aktualisiert eine Beschreibung; Eigentümer-/Adminprüfung und CSRF gelten wie bei anderen Änderungen.

Nicht dekorative Bilder benötigen beim Veröffentlichen eine Beschreibung. Leere Beschreibungen dürfen auch nicht nachträglich über den Bild-Endpunkt auf einer veröffentlichten Freizeit gespeichert werden. Kopien übernehmen die Bildmetadaten und bleiben Entwürfe. Formulare speichern Bildtexte mit dem Speichern der Freizeit; bei einem Teilfehler bleiben die Eingaben erhalten, bereits gespeicherte Änderungen werden nicht automatisch zurückgerollt.

## Prüfverfahren

- PHP-Unit- und echte HTTP-Tests mit Wegwerf-SQLite-Datenbanken: Migration, Altbestände, Upload-Metadaten, Längen-/Typprüfung, fehlende Beschreibung, öffentliche/private Daten, Rollen, CSRF und Kopieren.
- MySQL 8 und PostgreSQL 16: Legacy-Bildtabelle zweimal migrieren, anschließend API-/Apache-Smoke-Test einschließlich Upload und Bildbeschreibung ausführen.
- Playwright/Chromium mit axe-core: WCAG-A/AA-Regeln bis 2.2 und zusätzliche Best-Practice-Regeln auf öffentlichen Seitentypen in 320, 390, 768, 1280 und 1536 Pixel Breite. Zusätzlich Kontomenü, mobile Filter, Kontaktfehler, Anbieter-Editor/Abschnitte/Linkdialog/Vorschau, Admin- und Kontoseiten.
- Funktionstests: Veröffentlichung, Bestandsänderung, Mehrpersonen-Platzanfrage, Mailfehler, Eingabeerhalt, Doppelklickschutz, erneute Anmeldung, Bildpflege und mobile Dialogbedienung.
- Zusätzliche Reflow-Prüfungen mit 200 % Textgrundgröße, vergrößerten Textabständen, Querformat, reduzierter Bewegung und erzwungenen Farben. 320 CSS-Pixel entsprechen der für den Reflow-Test maßgeblichen Breite bei 400 % Zoom eines 1280-Pixel-Fensters; dies ersetzt keine manuelle Browserzoom-Prüfung.

Die konkreten Ergebnisse des Abschlusslaufs werden in `TESTING.md` festgehalten. Automatisierte Prüfungen erfassen nicht alle WCAG-Erfolgskriterien.

## Offene Prüfungen und Freigabevoraussetzungen

- Manuelle vollständige Nutzung mit NVDA/Firefox sowie VoiceOver/Safari auf Desktop und Mobilgerät wurde hier **nicht durchgeführt**. Ein unabhängiger WCAG-/BITV-Test und Nutzertests mit assistiver Technik bleiben erforderlich.
- Redaktionelle Qualität von Bildbeschreibungen und Anbietertexten prüfen; alte fehlende Beschreibungen nachpflegen. Der Platzhalter „Bildbeschreibung noch nicht hinterlegt“ ist keine gleichwertige Textalternative.
- Echte mobile Bildschirmtastaturen, Browserzoom sowie komplexe Karten- und Rich-Text-Bedienung mit Screenreadern vor Freigabe manuell prüfen.
- Geprüfte Leichte Sprache und Deutsche Gebärdensprache fehlen. Geltende Betreiberpflichten, reale Betreiberangaben, Rückmeldezuständigkeit und anwendbares Durchsetzungsverfahren müssen geklärt werden. Das vorhandene Impressum enthält weiterhin Musterangaben; es wurde nicht juristisch neu verfasst.
- Mailzustellung und Rückmeldeprozess auf dem späteren Zielsystem testen. Der lokale Testcontainer simuliert Mailfehler und versendet keine echten Nachrichten.

Ohne diese Prüfungen wird weder vollständige WCAG-AA-Erfüllung noch BITV-Konformität zugesichert.
