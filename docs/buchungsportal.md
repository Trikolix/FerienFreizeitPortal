# Buchungsportal: erste Ausbaustufe nach Lastenheft

Die bisherigen Stufen 1 und 2 beschreiben den historischen Stand des Informationsportals und der E-Mail-Anfragen. Diese Erweiterung führt gespeicherte Anmeldungen ein. Zahlungen, Umsätze und Auszahlungen werden weiterhin nicht verarbeitet.

## Träger und Freigaben

Organisationen registrieren sich unter `/registrieren`, bestätigen ihre E-Mail und melden sich an. Unter `/traegerprofil` ergänzen sie öffentliche Angaben, Sitzanschrift, Rechtsform, Registerangaben, Steuerkennungen mit EU-Ausstellerstaat, EU-Ansässigkeiten und gegebenenfalls Betriebsstätten und bekannte Kontodaten. Fehlende Steuer-/Registerkennungen benötigen eine Begründung. Ein Vereinsregistereintrag ist möglich; eine Handelsregisternummer wird nicht pauschal verlangt. Zunächst ist genau ein Konto pro Organisation vorgesehen.

Der Jugendring prüft Träger unter `/pruefung`. Nicht freigegebene Träger können ausschließlich ihre eigenen Registrierungsdaten und Kontoeinstellungen bearbeiten. Änderungen eines freigegebenen Trägerprofils setzen dessen Freigabe zurück; die Oberfläche weist vor dem Speichern darauf hin. Gesperrte Träger können sich weiter an den Jugendring wenden, sich aber nicht selbst entsperren. Prüfungen erfassen Verantwortliche, Zeitpunkte und Rückmeldungen; Änderungen werden historisiert. Die Administrationsansicht verhindert die Freigabe einer inzwischen geänderten Profilfassung.

Angebote werden als Arbeitsfassung gespeichert und anschließend eingereicht. Nur Administratoren können die eingereichte Fassung freigeben. Bereits veröffentlichte Inhalte bleiben während der Prüfung einer Änderung unverändert sichtbar. Bilder und Beschreibungen werden in der freigegebenen Fassung festgehalten; weiterhin referenzierte Bilddateien werden nicht gelöscht. Kapazität und externe Belegung sind betriebliche Angaben und werden ohne erneute redaktionelle Freigabe aktualisiert.

Der zentrale Hinweistext ist über `PROVIDER_NOTICE_TEMPLATE` mit dem Platzhalter `{provider}` konfigurierbar. Er erscheint im Anmeldeablauf, auf dessen Status-/Erfolgsseiten und in Familienmails. Suche und Detailseite zeigen den Anbieternamen und Kontaktdaten ohne zusätzlichen Rollenhinweis. Öffentliche Anbieterantworten enthalten keine Steuer-, Konto- oder internen Kapazitätsdaten. Ferien/Anlässe können sich überschneiden; ihre Namen und Daten werden jahresbezogen angezeigt. Ein Ortsfilter ergänzt die bestehende Suche.

## Anmeldung und Bearbeitung

1. „Anmelden“ öffnet direkt das Formular mit E-Mail-Adresse, Kontaktperson und bis zu zehn Teilnehmenden. Ein Familienkonto oder eine vorgeschaltete E-Mail-Verifikation ist nicht erforderlich. Das Öffnen belegt keine Plätze.
2. Das Formular erhält einen 24 Stunden gültigen, angebotsgebundenen Schlüssel zur Erkennung wiederholter Absendeversuche. Bisher ausgestellte E-Mail-Formularlinks bleiben nutzbar.
3. Die Familie prüft Zeitraum, Anbieter, Teilnehmende und Teilnahmebeitrag. Eine Wartelistenanmeldung benötigt ausdrückliche Zustimmung.
4. Beim abschließenden Absenden werden Freizeitbeginn/-ende, Alter, Fristen, aktive Duplikate und Kapazität innerhalb einer Schreibtransaktion erneut geprüft. Bereits begonnene oder beendete Freizeiten sind auch ohne Anmeldeschluss oder mit einem zuvor geöffneten Formular gesperrt. Die gesamte Gruppe wird reserviert oder auf die Warteliste gesetzt. Eine Reservierung verfällt nicht automatisch.
5. Unter `/buchungen` bestätigt oder verwirft der zuständige Träger die Anmeldung, lässt eine ganze Gruppe nachrücken oder dokumentiert eine Stornierung. Der Jugendring erhält Statistiken, aber keine Teilnehmerlisten und keine Buchungsaktionen.

Zustände: `reserved`, `waitlist`, `confirmed`, `rejected`, `cancelled`. Wartelisten belegen keine Plätze. Stornierung oder Ablehnung einer Reservierung/Zusage gibt deren Plätze frei. Nachrücken prüft die Kapazität erneut. Dieselbe Person darf anhand normalisierter Namen und Geburtsdatum pro Freizeit nur eine aktive Anmeldung haben. Eine erneute Anmeldung nach Ablehnung/Stornierung ist möglich. Wiederholtes Absenden desselben Formularlinks ist idempotent.

Nach dem Absenden erhält die Familie eine Bestätigung mit Zusammenfassung und Statuslink. Der Anbieter erhält die vollständigen Anmeldedaten an die interne Anfrageadresse oder ersatzweise die Konto-E-Mail. Die Zusammenfassung enthält Freizeit, Zeitraum, Ort, Teilnahmebeitrag, Kontaktangaben, Teilnehmende und die optionale Nachricht. Diese Eingangsbestätigung ersetzt die verbindliche Zusage des Anbieters nicht.

Im Angebotseditor unter „Plätze & Reservierung“ können Anbieter bis zu 5.000 Zeichen wichtige Informationen für Bestätigungsmails hinterlegen, etwa Treffpunkt und Packliste. Diese Angaben werden als Klartext in der Arbeitsfassung und freigegebenen Angebotsfassung gespeichert. Sie sind Teil der Prüfung und werden im Buchungssnapshot festgehalten; bestehende Datenbanken benötigen dafür keine neue Spalte. Alle Familienbestätigungen einschließlich späterer Statusänderungen enthalten die Hinweise der gebuchten Fassung. Benutzereingaben werden in HTML-Mails maskiert.

Jede Anmeldung speichert die damalige Angebotsfassung einschließlich Anbieter, Teilnahmebeitrag und Mailhinweisen. Spätere Freigaben überschreiben diese Angaben nicht. Persönliche Statuslinks werden nur per E-Mail versendet; Familien kontaktieren für Änderungen und Stornierungen ihren Anbieter. Token in E-Mail-Links stehen in URL-Fragmenten statt in Server-URLs und werden in der Token-Tabelle ausschließlich gehasht gespeichert.

## Migration 4 und Bestandsdaten

Vor einem Update eine Sicherung erstellen und Migrationen zuerst auf einer Wegwerf-Datenbank prüfen. Das bestehende Migrationssystem ergänzt die Portal-Tabellen einmalig. Neue Trägerprofile müssen vervollständigt und freigegeben werden. Aktuelle bisher veröffentlichte Angebote werden einmalig zur Erstprüfung übernommen; vergangene Angebote werden archiviert. Bestehende IDs, Konten und Bilder bleiben erhalten.

Extern belegte Plätze werden als `Gesamtkapazität − bisher freie Plätze` übernommen. Danach gilt: freie Plätze = Gesamtkapazität − externe Belegung − reservierte/bestätigte Teilnehmende. Kapazitätsänderungen dürfen vorhandene Belegungen nicht unterschreiten. Bestehende E-Mail-Anfragen werden nicht in Buchungen umgewandelt, weil ihre Inhalte bisher nicht gespeichert waren. Neue Portalbuchungen unterstützen kein Losverfahren.

Angebote mit Prüf- oder Buchungshistorie werden archiviert statt endgültig gelöscht. Träger mit Stammdatenhistorie werden gesperrt statt gelöscht. Dadurch bleiben Referenzen und Jahresstände erhalten.

## Mailversand und Löschung

Alle neuen Benachrichtigungen werden in einer Outbox in derselben Transaktion wie die fachliche Änderung vorgemerkt. Eine fehlgeschlagene Mail macht eine gespeicherte Anmeldung nicht rückgängig. Wiederholungen versenden Mails, erzeugen aber keine zusätzlichen Buchungen. Offene/fehlgeschlagene Aufträge sind in den zuständigen Oberflächen sichtbar und erneut freigebbar.

In Entwicklung erfolgt standardmäßig zusätzlich ein kleiner Versandlauf nach geeigneten API-Aktionen. Produktion verwendet `PORTAL_MAIL_INLINE=false` und einen regelmäßigen CLI-Aufruf unter derselben Konfiguration wie die API:

```cron
* * * * * cd /pfad/zum/backend && php maintenance.php mail
15 3 * * * cd /pfad/zum/backend && php maintenance.php cleanup
```

Ein echter Mailtransport bleibt erforderlich. Aufträge werden mit einer zeitlich begrenzten Verarbeitungssperre beansprucht; Versandfehler werden bis zu fünfmal mit Wartezeit erneut versucht. Wie bei SMTP üblich kann ein Absturz unmittelbar nach Zustellung zu einer wiederholten Mail führen. Fachliche Buchungsaktionen bleiben unabhängig davon idempotent.

`BOOKING_RETENTION_DAYS` muss vor produktiven Buchungen nach fachlicher Prüfung gesetzt werden. In Entwicklung beträgt die Testvorgabe 180 Tage. Die Frist beginnt am Freizeitende. Der Löschlauf entfernt Kontakt- und Teilnehmerdaten sowie zugehörige Zugriffstoken und Versandaufträge; anonyme Buchungszahlen und fachliche Statusereignisse bleiben erhalten. Die produktive Frist muss auch in den Datenschutzhinweisen veröffentlicht werden. Die Aufbewahrung der Träger-/Prüfhistorie ist im gesonderten fachlichen Aufbewahrungskonzept festzulegen.

## Anbieterexport und PStTG

Unter `/pruefung` lässt sich ein Kalenderjahr als echte `.xlsx`-Datei herunterladen. Tabellenblätter: Anbieter, Steuerkennungen, EU-Betriebsstätten und Hinweise. Daten werden über stabile Träger-IDs verknüpft. Für abgeschlossene Jahre gilt der letzte bekannte Jahresendstand, für das laufende Jahr der Exportzeitpunkt. Organisationen ohne bekannte historische Stammdaten werden entsprechend gekennzeichnet; heutige Daten werden nicht in frühere Jahre zurückprojiziert. Inaktive und gesperrte Träger bleiben enthalten. Kennnummern und Benutzereingaben werden als Textzellen ausgegeben.

Die Datei enthält keine Zahlungen, Umsätze oder vermeintlichen Nullumsätze und ersetzt keine vollständige elektronische PStTG-Meldung. Vor Produktivstart sind Anwendbarkeit, erforderliche zusätzliche Meldedaten, Meldeweg und Aufbewahrung fachlich festzulegen. Fehlende Zahlungsabwicklung im Portal allein begründet keine Befreiung. Eine spätere Zahlungs-/Treuhandstufe einschließlich Auszahlungen und Erstattungen ist ausdrücklich ein eigenes Vorhaben.

## Schnittstellen

- Registrierung: `POST /api/providers/register`, `POST /api/providers/verify-email`.
- Eigenes Profil: `GET/PUT /api/provider-profile`, `POST /api/provider-profile/submit`.
- Trägerprüfung/Export: `GET /api/admin/providers`, `POST /api/admin/providers/:id/review`, `GET /api/admin/providers/export?year=…`.
- Angebotsfreigabe: `POST /api/camps/:id/submit`, `GET /api/admin/reviews`, `POST /api/admin/camps/:id/review`.
- Familien: `POST /api/camps/:id/booking-form` (Formularschlüssel, keine Platzbelegung), `POST /api/camps/:id/bookings` (mit `contact_email`), `POST /api/bookings/status`. Bestehende E-Mail-Formularlinks funktionieren weiter über `POST /api/booking-access`; `POST /api/camps/:id/booking-link` bleibt für ältere Clients erhalten.
- Bearbeitung: `GET /api/bookings`, `POST /api/bookings/:id/actions`, `GET /api/booking-statistics`.
- Versandstatus: `GET /api/mail-outbox`, `POST /api/mail-outbox/:id/retry`.

Der alte Endpunkt `/api/camps/:id/place-requests` antwortet mit HTTP 410. Direkte Veröffentlichung über das Statusfeld ist nicht mehr möglich: Speichern ändert eine Arbeitsfassung, Einreichen und Freigeben sind eigene Aktionen.

## Verifikation am 25. Oktober 2026

Erfolgreich geprüft: 62 PHPUnit-Tests sowie die gezielte erneute Prüfung der Buchungsdomäne, 21 Playwright-Szenarien einschließlich mobiler Ansichten und Axe-Prüfungen, ESLint und Produktionsbuild. Der Frontend-Lauf verwendet die Sperrdatei-Versionen einschließlich React 19.3.1, Vite 8.3.5 und Playwright 1.64.1 unter Node.js 24.22.1. Die grundlegende Portalstufe wurde zusätzlich mit Domain- und HTTP-Smoke-Tests gegen isolierte MySQL-8- und PostgreSQL-16-Datenbanken geprüft. Die vorhandene Entwicklungsdatenbank wurde nicht verändert. Die Zustellung über einen produktiven Mailtransport und die fachliche PStTG-Einordnung bleiben Betriebsvoraussetzungen.
