# Offene Fragen und Klärungsbedarf – Ferienplattform Westsachsen

Dieses Dokument sammelt alle fachlichen, organisatorischen, rechtlichen und UX-bezogenen Fragen, die sich aus der bisherigen Umsetzung, der Projektkonzeption (`docs/Projektkonzeption Ferienplattform_22_10_2026_Neu.pdf`) und den Anforderungen des Jugendrings Westsachsen ergeben.

---

## 1. Anbieter-Onboarding, Rollen & Berechtigungen

1. **Selbstregistrierung vs. reine Einladung durch den Jugendring:**
   - Aktuell existieren zwei Wege parallel: Einladung durch Mitarbeiter unter `/admin` (`POST /api/admin/users`) **und** offene Selbstregistrierung unter `/registrieren` (`POST /api/providers/register`).
   - *Zu klären:* Soll die öffentliche Selbstregistrierung für alle Vereine offen bleiben (mit anschließender Prüfung unter `/pruefung`), oder sollen ausschließlich Mitarbeiter des Jugendrings neue Vereinskonten anlegen dürfen?
2. **Schnell-Freigabe bei persönlich eingeladenen Mitgliedsvereinen:**
   - Derzeit muss ein vom Jugendring eingeladener Verein nach dem Passwort-Setzen erst sein vollständiges Trägerprofil (inkl. Rechtsform, Anschrift, Register-/Steuerdaten) ausfüllen und erneut unter `/pruefung` freigegeben werden, bevor er Freizeiten anlegen darf.
   - *Zu klären:* Soll dieser mehrstufige Prüfprozess für alle Vereine verpflichtend bleiben, oder können bekannte Mitgliedsvereine durch Jugendring-Mitarbeiter direkt mit Anlegen der Einladung als „geprüfter Träger“ freigeschaltet werden?
3. **Mehrere Benutzerkonten pro Verein / Einrichtung:**
   - Aktuell gilt technisch: genau **1 Benutzerkonto = 1 Trägerprofil**.
   - *Zu klären:* Benötigen größere Vereine, Jugendclubs oder Kommunen perspektivisch mehrere Zugänge (z. B. eine Person für die Freizeiterstellung, eine andere für Anmeldungen/Wartelisten), oder bleibt es pro Verein bei einem gemeinsamen Konto?
4. **Rechteabgrenzung zwischen `admin` (Mitarbeiter) und `master_admin`:**
   - Derzeit können nur `master_admin`-Konten neue `admin`-Mitarbeiter anlegen oder bestehende Mitarbeiterkonten verwalten; normale `admin`-Konten verwalten Vereine, Ferien, Trägerprüfungen und Angebotsfreigaben.
   - *Zu klären:* Passt diese Aufteilung für die vorgesehene 30h-Projektstelle und etwaige Vertretungen?

---

## 2. Buchungsverwaltung & Zahlungsabwicklung (Übergangsphase vs. Endausbau)

5. **Kommunikation zur Zahlungsabwicklung in der aktuellen Ausbaustufe:**
   - Aktuell laufen Zahlungen noch nicht über das Portal; Mitarbeiter empfangen Zahlungen im Hintergrund und leiten sie an die durchführenden Vereine weiter.
   - *Zu klären:* Welcher exakte Hinweistext soll Familien nach der Anmeldung bzw. in der Bestätigungs-E-Mail angezeigt werden? (z. B. „Der Jugendring Westsachsen meldet sich mit den Zahlungsinformationen“ vs. „Zahlungshinweise folgen durch den Anbieter / die Geschäftsstelle“, konkrete Bankverbindung/Treuhandkonto oder Barzahlungsregelung für bestimmte Zielgruppen wie auf dem Flipchart der Mitgliederversammlung gewünscht?)
6. **Interner Zahlungsstatus (ohne Online-Payment) als Übergangshilfe:**
   - *Zu klären:* Wäre in `/buchungen` bzw. `/pruefung` ein rein internes Vermerkfeld („Zahlung eingegangen am …“ / „Rechnung verschickt“) für Mitarbeiter und/oder Vereine hilfreich, solange noch keine automatische Zahlungsabwicklung im Portal stattfindet?
7. **Verfallsfrist für vorläufige Reservierungen (`reserved`):**
   - Aktuell verfallen unbestätigte Reservierungen nicht automatisch und blockieren den Platz dauerhaft, bis der Verein sie bestätigt, ablehnt oder storniert.
   - *Zu klären:* Soll es eine automatische Erinnerung an den Verein (z. B. nach 3 oder 5 Tagen) oder eine automatische Freigabe bei Nichtbearbeitung geben?
8. **Stornierungen durch Familien:**
   - Derzeit können Familien über den Statuslink (`/buchung`) ihren Status einsehen, aber nicht selbst online stornieren; sie müssen den Anbieter kontaktieren.
   - *Zu klären:* Soll perspektivisch ein „Stornierung anfragen“-Button für Familien ergänzt werden, oder bleibt die telefonische/schriftliche Kontaktaufnahme beim Anbieter bzw. Jugendring gewünscht?
9. **Individuelle Zusatzfelder & Einverständniserklärungen pro Freizeit:**
   - Auf dem Flipchart der Mitgliederversammlung (*Anmerkung zur technischen Umsetzung*) wurden „Anmeldeformular mit indiv. Anforderg. d. Anbieters (+ AGB)“ sowie „Genehmigung durch Eltern (besser durch Ankreuzen als Download)“ genannt.
   - *Zu klären:* Welche Standard-Checkboxen (z. B. Fotoerlaubnis, Schwimmerlaubnis, Badeerlaubnis, AGB des Anbieters, Allergien/Unverträglichkeiten als Hinweis außerhalb der Datenbank) sollen im Portal ergänzt werden, und wie wird dabei der Datenschutz (keine unnötigen Gesundheitsdaten im System) gewahrt?
10. **Abgrenzung der Einsicht in Buchungsdaten (Jugendring vs. Verein):**
    - Gemäß `docs/buchungsportal.md` sieht der Jugendring unter `/pruefung` aktuell nur anonyme Statistiken, aber keine Teilnehmerlisten oder Einzelbuchungen (`GET /api/bookings` liefert für Admins `403`).
    - *Zu klären:* Wenn Mitarbeiter des Jugendrings im Hintergrund Zahlungen zuordnen und weiterleiten oder Eltern beraten sollen, benötigen Mitarbeiter dafür Zugriff auf Buchungsnummern/Kontaktpersonen oder eine eigene Zahlungs-Zuordnungsliste – oder übermittelt der Verein diese Daten außerhalb des Portals?

---

## 3. Angebots-Moderation & Redaktionsprozess

11. **Abgestufte Angebots-Moderation (Festlegung umgesetzt):**
    - *Entschieden & umgesetzt:* Die Erstveröffentlichung einer Freizeit sowie Änderungen an Eckdaten (Titel, Termin, Preis, Alter, Ort, Anmeldeschluss), den Mailhinweisen und dem neuen Bereich **„Rechtliches & Teilnahmebedingungen“** (Regeln, Voraussetzungen, Mitbringliste) müssen weiterhin von Jugendring-Mitarbeitern unter `/pruefung` freigegeben werden. Einfache Pflegearbeiten an bereits freigegebenen Freizeiten (Beschreibung erweitern, Kategorien anpassen, Bilder hinzufügen/beschreiben/löschen, Kartenposition oder freie Plätze aktualisieren) werden ohne erneute Mitarbeiter-Prüfung direkt veröffentlicht.
    - *Noch offen:* Falls ein Jugendring-Mitarbeiter unter `/admin` eine Freizeit editiert, gilt dort noch das Einreichen zur Freigabe unter `/pruefung` – soll eine Admin-Bearbeitung künftig direkt freigeben dürfen?
12. **Qualitäts- und Demokratieprüfung:**
    - Auf der Mitgliederversammlung wurde festgehalten: „Keine Plattform für Nicht-Demokraten & Extremisten – wer prüft das?“ sowie in der Konzeption: „ausschließlich gemeinwohlorientierte bzw. nicht-kommerzielle Angebote“.
    - *Zu klären:* Welche verbindlichen Prüfkriterien / Checkliste sollen für die Mitarbeiter bei der Freigabe eines Trägers bzw. einer Freizeit hinterlegt werden (ggf. als sichtbare Prüf-Checkliste im Moderationsbereich)?
13. **Feste Kategorien vs. freie Themenbereiche:**
    - Aktuell stehen fest `Sport`, `Lager`, `Kreativ`, `Bildung`, `Natur` zur Auswahl (ergänzt durch bereits verwendete Kategorien).
    - *Zu klären:* Sollen weitere Standardkategorien aus der Konzeption ergänzt werden (z. B. `Kultur`, `Ausflug`, `Workshop`, `Inklusiv / Barrierefrei`)?
14. **Export für Anbieter (Teilnehmerlisten):**
    - Vereine können Anmeldungen unter `/buchungen` einsehen, haben dort aber noch keinen CSV-/Excel-/PDF-Export für ihre eigenen Teilnehmerlisten (Check-in vor Ort, Notfallkontakte).
    - *Zu klären:* Soll für freigegebene Anbieter ein Teilnehmerlisten-Export je Freizeit (unter Beachtung der DSGVO) ergänzt werden?

---

## 4. Suche, Entdecken & Niedrigschwelliger Zugang

15. **Weitere Suchfilter für Familien:**
    - *Zu klären:* Welche zusätzlichen Filter helfen Familien am meisten bei der Entdeckung?
      - Maximalpreis / „Kostenlose Angebote“
      - Angebotsart (Tagesangebot vs. Freizeit mit Übernachtung)
      - Barrierefreiheit / Inklusion vor Ort (z. B. rollstuhlgerecht, mit Gebärdensprachbegleitung)
      - Gemeinde-/Stadtfilter oder Umkreissuche in km (insb. für die 18 LEADER-Kommunen und perspektivisch das Schönburger Land)
16. **Teilen & Öffentlichkeitsarbeit (Social Media / Messenger):**
    - *Zu klären:* Soll jede Freizeit-Detailseite eine einfache „Angebot teilen“-Funktion (Link kopieren, WhatsApp/E-Mail, ggf. QR-Code für Flyer/Plakate) erhalten?
17. **Analoger / nicht-digitaler Zugang („nicht nur digitaler Zugang, sonst Ausschluss von best. Randgruppen“):**
    - *Zu klären:* Benötigt das Portal eine saubere **Druckansicht** der Angebotsübersicht bzw. einzelner Freizeiten für Aushänge in Schulen, Jugendclubs und Rathäusern, und soll in den Hinweistexten prominent eine Telefonnummer des Jugendrings für analoge Anmeldungen stehen?

---

## 5. Rechtliches, Datenschutz, PStTG & Betrieb vor Livegang

18. **Echte Betreiberdaten im Impressum und in der Barrierefreiheitserklärung:**
    - In `frontend/src/pages/Impressum.tsx` stehen aktuell noch Platzhalter (`Max Mustermann`, `Musterstraße 1`, `kontakt@westsachsen-camps.de`).
    - *Zu klären:* Bitte die finalen Pflichtangaben des Jugendring Westsachsen e.V. (Vorstand/Vertretungsberechtigte, Vereinsregister, Steuernummer, Telefon, E-Mail) sowie die zuständige Durchsetzungsstelle für `/barrierefreiheit` freigeben.
19. **Verbindliche Löschfrist für Buchungsdaten (`BOOKING_RETENTION_DAYS`):**
    - In Entwicklung gilt aktuell der Testwert `180` Tage nach Freizeitende; vor Produktivstart muss eine verbindliche Frist festgelegt und in `frontend/src/pages/DatenschutzPage.tsx` ergänzt werden.
20. **PStTG-Pflicht & Umfang der Träger-Stammdaten:**
    - Das Trägerprofil fragt derzeit umfangreiche EU-Steuerkennungen, EU-Ansässigkeiten, EU-Betriebsstätten und Finanzkonten ab. Für kleine regionale Jugendvereine kann das abschreckend wirken. *(Erste Vereinfachung umgesetzt: Sitzland und steuerliche Ansässigkeit sind standardmäßig auf Deutschland `DE` vorbelegt, die 27 EU-Auswahlfelder sowie EU-Betriebsstätten sind dezent in einem optionalen Aufklappbereich untergebracht.)*
    - *Zu klären:* Nach juristischer/steuerlicher Prüfung (im Kostenplan unter „Honorare für Datenschutz und rechtliche Beratung, u.ä.“ vorgesehen): Falls das Portal in der aktuellen Ausbaustufe ohne Zahlungsabwicklung nicht unter die PStTG-Meldepflicht fällt oder nur eine vereinfachte Abfrage nötig ist, sollten die übrigen Pflichtfelder im Trägerprofil entsprechend weiter verschlankt werden?
21. **Technischer Produktivbetrieb:**
    - Produktiver SMTP-/Mailserver (`MAIL_FROM`, Zustelltest), Cronjobs (`php maintenance.php mail` und `cleanup`), HTTPS/Domain-Konfiguration, Backup-Strategie sowie eine finale Prüfung mit echten Screenreadern (NVDA/VoiceOver) stehen vor dem Livegang noch aus.
22. **PHP-Version und Datenbank auf dem Ziel-Webspace des Jugendrings:**
    - Das Backend verlangt aktuell mindestens PHP 8.3 (inkl. `PDO`, `GD` mit JPEG/PNG/WebP, `Mbstring`, `Zip`, `Fileinfo`, `DOM`) sowie MySQL/MariaDB oder PostgreSQL (SQLite wird im Produktionsmodus abgelehnt).
    - *Zu klären:* Welche genaue PHP-Version (inkl. verfügbarer Erweiterungen, Cronjob-Möglichkeit und Apache `mod_rewrite`/Nginx) sowie welches Datenbanksystem inkl. Version stehen auf dem Webspace/Hosting-Paket des Jugendrings zur Verfügung?
