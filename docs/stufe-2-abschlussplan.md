# Stufe 2: Platzverwaltung und unverbindliche Anfragen

## Umgesetztes Zielbild

Anbieter können die Platzverwaltung je Freizeit aktivieren, Gesamtkapazität und freie Plätze pflegen und zwischen laufender Platzanfrage und Bewerbungszeitraum mit externer Verlosung wählen. Familien senden unverbindliche Platz-, Wartelisten- oder Bewerbungsanfragen über das Portal.

Das Portal reserviert keine Plätze, zählt Anfragen nicht automatisch vom Bestand ab und nimmt keine Zahlungen entgegen. Verbindliche Zusage, Verlosung, Wartelistenpflege, Vertragsabwicklung und Zahlung erfolgen beim Anbieter.

## Ablauf

- Anbieter sehen die exakte Kapazität intern und aktualisieren freie Plätze im Dashboard.
- Öffentlich erscheinen nur Statusstufen: Plätze verfügbar, wenige Plätze, Warteliste, ausgebucht, Bewerbung offen, noch nicht offen oder Frist beendet.
- Laufende Anfragen können bei zu großer Gruppe vollständig als Wartelistenanfrage übermittelt werden.
- Bewerbungen sind ausschließlich im gepflegten Bewerbungszeitraum möglich; anschließend bearbeitet der Anbieter alle eingegangenen E-Mails extern.
- Anfrageinhalte gehen per E-Mail an eine optionale Freizeit-Adresse oder ersatzweise an die Konto-E-Mail des Anbieters.
- Familien erhalten eine inhaltsarme Bestätigung ohne Namen und Geburtsdaten der Teilnehmenden.

## Datenschutz und Sicherheit

- Namen, Geburtsdaten, Kontaktdaten und Nachricht werden nicht in der Portal-Datenbank gespeichert.
- Technische Ereignisse enthalten nur eine Request-ID, Freizeit-ID, gehashte IP, gekürzte Browserinformation, E-Mail-Domain, Nachrichtenlänge, Teilnehmerzahl, Ergebnis und Zeitpunkt; die Standardaufbewahrung beträgt 90 Tage.
- Serverseitige Validierung prüft Altersgrenzen am Freizeitbeginn, Zeiträume, Kapazität, Gruppengröße und Empfängeradresse.
- Honeypot, Mindest-Ausfüllzeit, Rate-Limit, HTML-Escaping und geschützte interne Empfängeradressen begrenzen Missbrauch und Datenabfluss.

## Bewusst nicht Bestandteil

- gespeicherte Buchungen oder ein Anbieter-Postfach im Portal
- automatische Reservierung, Zuteilung oder Bestandsreduzierung
- Durchführung oder Protokollierung einer Verlosung
- Buchungsstatus, Stornierungen, CSV-Export oder Teilnehmerverwaltung
- Rechnungsstellung, Zahlungsabwicklung oder Auszahlung

## Freigabe

Vor dem produktiven Einsatz müssen echter Mailtransport, Anbieter- und Bestätigungsmails sowie die realen Betreiberangaben und Datenschutzhinweise geprüft werden. Migrationen sind zuerst gegen eine Sicherung beziehungsweise Wegwerf-Datenbank für den eingesetzten SQL-Treiber zu testen.
