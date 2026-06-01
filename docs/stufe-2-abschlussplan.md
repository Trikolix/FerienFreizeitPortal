# Abschlussplan Stufe 2: Buchungssystem ohne Zahlungsabwicklung

## Ziel

Stufe 2 erweitert das Portal um verbindliche oder vorlaeufige Buchungen/Anmeldungen. Vereine koennen freie Plaetze und Vergabeverfahren pro Freizeit verwalten. Besucherinnen und Besucher koennen Plaetze ueber das Portal buchen oder anfragen. Die Zahlung und weitere Vertragsabwicklung erfolgen weiterhin direkt zwischen Teilnehmenden und Veranstalter.

Nicht Bestandteil von Stufe 2:

- Zahlungsabwicklung im Portal.
- Rechnungsstellung im Portal.
- automatisierte Auszahlung an Vereine.

## Fachliches Zielbild

Jede Freizeit kann eines von mehreren Verfahren nutzen:

- `first_come_first_served`: Plaetze werden in Eingangsreihenfolge vergeben.
- `collect_until_deadline`: Anmeldungen werden bis zu einem Stichtag gesammelt und danach manuell entschieden.
- `lottery`: Anmeldungen werden bis zu einem Stichtag gesammelt und anschliessend per dokumentiertem Losverfahren vergeben.

Das Portal verwaltet dabei:

- Kapazitaet.
- gebuchte/bestaetigte Plaetze.
- Warteliste.
- Status jeder Buchung.
- Kommunikation und Benachrichtigung.
- datensparsame Protokollierung.

## Datenmodell

Neue Tabellen:

- `camp_booking_settings`
  - `camp_id`
  - `booking_enabled`
  - `capacity`
  - `method`
  - `booking_starts_at`
  - `booking_ends_at`
  - `waitlist_enabled`
  - `requires_manual_confirmation`
  - `participant_min_age`
  - `participant_max_age`
  - `notes_for_applicants`

- `bookings`
  - `id`
  - `camp_id`
  - `status`
  - `booking_number`
  - `contact_name`
  - `contact_email`
  - `contact_phone`
  - `participant_count`
  - `privacy_accepted_at`
  - `created_at`
  - `updated_at`

- `booking_participants`
  - `booking_id`
  - `first_name`
  - `last_name`
  - `birth_date`
  - optionale Pflichtangaben je nach finaler Datenschutzfreigabe

- `booking_status_history`
  - `booking_id`
  - `old_status`
  - `new_status`
  - `changed_by_user_id`
  - `reason`
  - `created_at`

- `booking_events`
  - metadata-only Protokoll fuer Buchungsversuche, Rate-Limits, Statuswechsel und Benachrichtigungen.

Moegliche Buchungsstatus:

- `pending`
- `confirmed`
- `waitlisted`
- `rejected`
- `cancelled_by_applicant`
- `cancelled_by_provider`

## Backend-Schnittstellen

Oeffentlich:

- `GET /api/camps/:id/booking-settings`
  - liefert oeffentlich relevante Buchungsinformationen.
- `POST /api/camps/:id/bookings`
  - legt eine Buchung oder Anfrage an.
  - validiert Alter, Kapazitaet, Fristen, Pflichtfelder und Missbrauchsschutz.

Verein/Admin:

- `GET /api/camps/:id/bookings`
  - Liste aller Buchungen einer Freizeit.
- `PUT /api/bookings/:id/status`
  - Statuswechsel mit Grund und Audit-Log.
- `POST /api/camps/:id/booking-settings`
  - Buchungseinstellungen speichern.
- `POST /api/camps/:id/lottery/run`
  - dokumentierten Loslauf ausfuehren.
- `GET /api/camps/:id/bookings/export`
  - CSV-Export fuer den Veranstalter.

Admin:

- `GET /api/admin/bookings/overview`
  - Buchungsvolumen, offene Faelle, Missbrauchsmuster.

## Vergabelogik

### First come first served

- Wenn Buchung aktiv und Kapazitaet frei ist, wird Status `confirmed`.
- Wenn Kapazitaet voll und Warteliste aktiv ist, wird Status `waitlisted`.
- Wenn Kapazitaet voll und keine Warteliste aktiv ist, wird Buchung abgelehnt.
- Kapazitaetspruefung muss transaktionssicher sein, damit zwei gleichzeitige Buchungen nicht denselben letzten Platz erhalten.

### Sammeln bis Stichtag

- Alle gueltigen Buchungen erhalten zunaechst `pending`.
- Nach Stichtag kann der Verein manuell bestaetigen, ablehnen oder auf Warteliste setzen.
- System zeigt Anzahl Bewerbungen, Plaetze und Ueberbuchung deutlich an.

### Losverfahren

- Alle gueltigen `pending`-Buchungen werden in einen Loslauf aufgenommen.
- System waehlt zufaellig bis zur Kapazitaet Gewinner aus.
- Gewinner erhalten `confirmed`.
- Rest erhaelt `waitlisted` oder `rejected`, je nach Einstellung.
- Loslauf wird mit Zeit, Anzahl, Ergebnis und ausloesendem Nutzer protokolliert.
- Ein Loslauf darf nicht versehentlich mehrfach fuer dieselbe Runde ausgefuehrt werden.

## Frontend

Oeffentliche Detailseite:

- Buchungsstatus sichtbar:
  - Buchung moeglich.
  - Buchung ab Datum moeglich.
  - Anmeldefrist abgelaufen.
  - ausgebucht.
  - Warteliste moeglich.
- Button `Anmelden` oder `Platz anfragen`.
- Buchungsformular mit:
  - Kontaktdaten.
  - Teilnehmerdaten.
  - Datenschutzbestaetigung.
  - Hinweis, dass Zahlung/weitere Abwicklung direkt ueber den Veranstalter erfolgt.
- Erfolgsseite mit neutraler Bestaetigung und Buchungsnummer.

Vereinsdashboard:

- Buchungseinstellungen pro Freizeit.
- Buchungsliste pro Freizeit.
- Statusfilter.
- Detailansicht pro Buchung.
- Statusaktionen:
  - bestaetigen.
  - auf Warteliste.
  - ablehnen.
  - stornieren.
- CSV-Export.
- Losverfahren starten, falls Verfahren `lottery`.

Adminbereich:

- Uebersicht ueber Buchungsvolumen.
- Problem-/Missbrauchsfaelle.
- Einsicht in Audit-Logs.
- Zugriff auf personenbezogene Teilnehmerdaten nur soweit notwendig.

## Datenschutz und Sicherheit

- Datenschutzseite um Buchungsverarbeitung erweitern.
- Buchungsformular mit expliziter Datenschutzhinweis-Bestaetigung.
- Datenminimierung: nur notwendige Teilnehmerdaten erfassen.
- Keine Teilnehmerdaten in allgemeinen Logs.
- Buchungsdaten nur fuer berechtigte Vereine/Admins sichtbar.
- Exportfunktionen protokollieren.
- Loesch-/Anonymisierungsfristen nach Freizeitende definieren.
- Rate-Limit und Honeypot fuer oeffentliche Buchungsformulare.
- Serverseitige Validierung aller Fristen, Kapazitaeten und Statuswechsel.
- Transaktionen fuer Kapazitaetsaenderungen.

## Benachrichtigungen

E-Mail an Buchende:

- Eingangsbestaetigung.
- Bestaetigung.
- Warteliste.
- Ablehnung.
- Stornierung.

E-Mail an Verein:

- neue Buchung oder Anfrage.
- Kapazitaet erreicht.
- Warteliste aktiv.
- Losverfahren abgeschlossen.

Alle E-Mails:

- keine unnoetigen sensiblen Daten.
- Buchungsnummer enthalten.
- Kontakt zum Veranstalter klar nennen.

## Abnahmekriterien

- Vereine koennen Buchungen pro Freizeit aktivieren/deaktivieren.
- Kapazitaeten werden korrekt und transaktionssicher verwaltet.
- Alle drei Verfahren funktionieren:
  - first come first served.
  - Sammeln bis Stichtag.
  - Losverfahren.
- Besucher koennen eine Buchung mobil und am Desktop abschicken.
- Buchende erhalten nachvollziehbare Rueckmeldung.
- Vereine koennen Buchungen verwalten und exportieren.
- Zahlung findet nicht im Portal statt; entsprechende Hinweise sind klar sichtbar.
- Datenschutz und Loeschfristen fuer Buchungsdaten sind dokumentiert.
- Accessibility der Buchungsformulare ist geprueft.

## Empfohlene Tests

- Buchung erfolgreich bei freier Kapazitaet.
- Buchung landet auf Warteliste, wenn Kapazitaet voll ist.
- Buchung wird abgelehnt, wenn Frist abgelaufen ist.
- Buchung wird abgelehnt, wenn Pflichtdaten fehlen.
- Zwei gleichzeitige Buchungen auf den letzten Platz erzeugen keine Ueberbuchung.
- Sammelverfahren erzeugt `pending`.
- Manuelle Statuswechsel werden protokolliert.
- Losverfahren verteilt Plaetze korrekt und auditierbar.
- Losverfahren kann nicht versehentlich doppelt ausgefuehrt werden.
- CSV-Export ist nur fuer berechtigte Nutzer moeglich.
- Teilnehmerdaten erscheinen nicht in Abuse- oder Fehlerlogs.
- Rate-Limit und Honeypot greifen bei Missbrauch.

## Reihenfolge der Umsetzung

1. Datenmodell und Migrationen.
2. Backend-Validierung und Buchungslogik.
3. Vereins-Buchungseinstellungen.
4. Oeffentliches Buchungsformular.
5. Vereins-Buchungsverwaltung.
6. Benachrichtigungen.
7. Losverfahren.
8. Export, Audit und DSGVO-Loeschprozesse.
9. Accessibility- und Abnahmetests.

## Ergebnis

Nach Abschluss von Stufe 2 ist das Portal nicht mehr nur Informationsplattform, sondern verwaltet Buchungen und Kontingente. Die Zahlungsabwicklung und weitere Vertragsabwicklung bleiben weiterhin bei den jeweiligen Veranstaltern.
