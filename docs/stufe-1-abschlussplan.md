# Abschlussplan Stufe 1: Informationsportal mit Vereinsverwaltung

## Ziel

Stufe 1 ist abgeschlossen, wenn das Portal als produktionsreifes Informationsportal betrieben werden kann:

- Vereine koennen Freizeiten anlegen, bearbeiten, als Entwurf speichern und veroeffentlichen.
- Besucherinnen und Besucher finden Freizeiten ueber Suche, Filter, Liste, Karte und Detailseiten.
- Buchung/Anmeldung erfolgt noch direkt beim jeweiligen Anbieter, nicht ueber das Portal.
- Kontaktformular, Impressum, Datenschutz, Sicherheit und Barrierefreiheit sind abnahmefaehig.

## Aktueller Stand

Bereits umgesetzt:

- Oeffentliche Suche mit Listen- und Kartenansicht.
- Detailseiten fuer Freizeiten.
- Filter nach Alter, Kategorie, Zeitraum/Ferien und Kartenbereich.
- Vereinslogin mit Rollenmodell `master_admin`, `admin`, `user`.
- Adminbereich fuer Vereins-/Nutzerverwaltung.
- Vereinsdashboard fuer Freizeitenverwaltung.
- Status fuer Freizeiten: Entwurf, veroeffentlicht, ausgebucht, Archiv.
- Bilderupload und Bildverwaltung.
- Kontaktformular mit Honeypot, Mindestzeit, Rate Limit und metadata-only Abuse-Logging.
- Impressum-Seite, Footer-Links und responsives Grunddesign.
- Backend-Tests fuer zentrale Auth-, Rollen-, Camp- und Kontaktfunktionen.

Noch nicht abnahmefaehig:

- Auftrag nennt WordPress, das aktuelle Projekt ist aber eine Custom-App mit React/Vite und PHP-API.
- Impressum enthaelt Platzhalterdaten.
- Datenschutzseite und Datenschutzhinweise fehlen.
- DSGVO-Prozesse sind noch nicht dokumentiert oder technisch vollstaendig abgebildet.
- Produktionshaertung ist unvollstaendig.
- Accessibility wurde verbessert, aber noch nicht systematisch nach WCAG/BITV geprueft.

## Arbeitspakete

### 1. Architektur- und Auftragsklaerung

- Klaeren, ob die Custom-App statt WordPress akzeptiert ist.
- Falls WordPress zwingend bleibt: WordPress als redaktionelle Hauptwebseite aufsetzen und das Portal als separate App verlinken oder einbetten.
- Falls Custom-App akzeptiert ist: Abweichung schriftlich festhalten und begruenden.
- Zustandsziel dokumentieren: Stufe 1 ist ein Informationsportal ohne Portalbuchung.

### 2. Rechtliches und DSGVO

- Echte Impressumsdaten einpflegen.
- Neue Seite `/datenschutz` erstellen und im Footer verlinken.
- Datenschutzinformationen fuer folgende Verarbeitungen dokumentieren:
  - Kontaktformular.
  - Login und Nutzerverwaltung.
  - Vereinsprofile und Freizeiteintraege.
  - Bilderupload.
  - Serverlogs, Abuse-Logs und Mail-Fallback-Logs.
- Datenschutzhinweise an Kontaktformular und Login/Einladungsprozess ergaenzen.
- Aufbewahrungsfristen definieren:
  - Kontakt-/Abuse-Events.
  - Sessions.
  - Passwort-Tokens.
  - geloeschte Freizeiten/Bilder.
- Technische Loeschjobs oder Admin-Prozesse fuer abgelaufene Daten ergaenzen.
- Datenexport-/Loeschprozess fuer Vereinskonten beschreiben.

### 3. Produktionshaertung

- CORS auf die echte Frontend-Domain begrenzen.
- Default-Testnutzer und einfache Seed-Passwoerter fuer Produktion deaktivieren.
- Pflichtkonfiguration fuer Produktion dokumentieren:
  - `APP_BASE_URL`
  - `APP_KEY`
  - `MAIL_FROM`
  - `CONTACT_TO`
  - `CONTACT_LOG_SALT`
  - Datenbankzugang
- Session- und Token-Sicherheit pruefen; mittelfristig HttpOnly-Cookies statt `localStorage` bewerten.
- Upload-Sicherheit erhoehen:
  - maximale Dateigroesse.
  - maximale Bilddimensionen.
  - serverseitige Bildnormalisierung.
  - EXIF-Metadaten entfernen.
  - eindeutige Fehlermeldungen bei abgelehnten Dateien.
- Admin-/Vereinsaktionen auditieren:
  - Login-Fehler.
  - Nutzer einladen/aendern/loeschen.
  - Freizeit erstellen/aendern/veroeffentlichen/archivieren/loeschen.
  - Bilder hochladen/loeschen.
- Fehlerlogging datensparsam halten und keine kompletten Kontakt- oder Freitextinhalte speichern.

### 4. Funktionale Abrundung Stufe 1

- Serverseitige Validierung fuer Freizeiten vervollstaendigen:
  - Titel erforderlich.
  - Altersgrenzen plausibel.
  - Start/Ende plausibel.
  - Anmeldeschluss vor Beginn.
  - Veroeffentlichung nur mit ausreichenden Pflichtdaten.
- Oeffentliche Detailseite um klare Info ergaenzen:
  - Anmeldung/Buchung erfolgt direkt beim Anbieter.
  - Kontakt-/Anmeldeinformationen des Vereins prominent anzeigen.
- Adminbereich verbessern:
  - Suche/Filter fuer Vereine.
  - Suche/Filter fuer Freizeiten.
  - deutlichere Statusuebersicht.
- Vereinsbereich verbessern:
  - sichere Loeschbestaetigung fuer eigene Freizeiten.
  - klare Hinweise bei Entwurf vs. Veroeffentlichung.
  - Vorschau vor Veroeffentlichung weiter nutzbar halten.

### 5. Barrierefreiheit nach WCAG/BITV

- Tastaturbedienung pruefen:
  - Header/Burger-Menue.
  - Filter.
  - Mehrfachauswahl.
  - Galerie.
  - Modal.
  - Formulare.
- Fokus-Reihenfolge und Fokus-Sichtbarkeit sicherstellen.
- Farbkontraste gegen WCAG AA pruefen.
- Formularfehler mit `aria-describedby` und klaren Texten verbinden.
- Kartenansicht mit gleichwertiger Listenalternative absichern.
- Bilder mit sinnvollen Alternativtexten ausstatten oder dekorative Bilder korrekt verstecken.
- Manuelles Pruefprotokoll fuer WCAG/BITV erstellen.

### 6. Inhalte und Startbefuellung

- Startinhalte einpflegen:
  - reale Vereinsdaten.
  - reale Freizeitangebote.
  - Bilder.
  - Kontaktinformationen.
- Bildrechte und Einwilligungen dokumentieren.
- Platzhalterdaten entfernen.
- Texte der Hauptwebseite/Jugendring-Identitaet final abstimmen.

## Abnahmekriterien

- Besucher koennen Freizeiten mobil und am Desktop intuitiv finden.
- Vereinsnutzer koennen Freizeiten erstellen, als Entwurf speichern, bearbeiten und veroeffentlichen.
- Admins koennen Vereine sicher verwalten.
- Es gibt keine Platzhalterdaten in Impressum, Datenschutz oder Startinhalten.
- Kontaktformular funktioniert und protokolliert Missbrauch metadata-only.
- Produktionskonfiguration ist dokumentiert und ohne Default-Passwoerter.
- Build, Lint und Backend-Tests laufen erfolgreich.
- Accessibility-Pruefung ist dokumentiert; kritische WCAG/BITV-Probleme sind behoben.

## Empfohlene Tests

- Frontend:
  - `npm run lint`
  - `npm run build`
  - manuelle Tests bei 375px, 430px, 768px, 1024px und 1440px.
- Backend:
  - PHPUnit-Tests fuer Auth, Rollen, Camps, Kontakt.
  - neue Tests fuer Veroeffentlichungsvalidierung.
  - neue Tests fuer Upload-Limits und Loeschprozesse.
- Sicherheit:
  - Login-Fehler.
  - abgelaufene Passwort-Tokens.
  - unberechtigte Zugriffe auf fremde Freizeiten.
  - Upload falscher Dateitypen.
  - Kontaktformular-Rate-Limit.

## Ergebnis

Nach Abschluss dieser Punkte ist Stufe 1 ein produktionsreifes Informationsportal mit Vereinsverwaltung. Buchungen bleiben bewusst ausserhalb des Portals und laufen direkt ueber die jeweiligen Anbieter.
