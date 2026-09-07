import React from 'react';
import { Link } from 'react-router-dom';

export const DatenschutzPage: React.FC = () => (
  <div className="imprint-page privacy-page">
    <span className="eyebrow">Rechtliches</span>
    <h1>Datenschutzhinweise</h1>

    <h2>Verantwortlicher</h2>
    <p>Verantwortlich für den Betrieb dieses Portals ist die im <Link className="text-link" to="/impressum">Impressum</Link> genannte Stelle.</p>

    <h2>Aufruf des Portals</h2>
    <p>Beim Aufruf können technisch notwendige Verbindungsdaten wie IP-Adresse, Zeitpunkt, aufgerufene Adresse und Browserinformationen durch den Webserver verarbeitet werden. Sie dienen dem sicheren und zuverlässigen Betrieb des Angebots.</p>

    <h2>Kontaktformular</h2>
    <p>Name, E-Mail-Adresse und Nachricht werden zur Bearbeitung an das Betreiberteam übermittelt. Das Portal speichert dabei nur datensparsame technische Metadaten zur Missbrauchserkennung, nicht den Nachrichtentext.</p>

    <h2>Platzanfragen und Bewerbungen</h2>
    <p>Wenn du für eine Freizeit eine Platzanfrage, Wartelistenanfrage oder Bewerbung sendest, verarbeitet das Portal die Kontaktdaten der Kontaktperson sowie Namen und Geburtsdaten der angegebenen Teilnehmenden. Diese Angaben werden unmittelbar per E-Mail an den jeweiligen Anbieter der Freizeit übermittelt.</p>
    <p>Die Anfrageinhalte werden nicht in der Portal-Datenbank gespeichert. Für Missbrauchsschutz und Fehleranalyse werden eine zufällige Request-ID, Freizeit-ID, Versandstatus beziehungsweise Fehlergrund, eine gehashte IP-Adresse, gekürzte Browserinformation, E-Mail-Domain, Nachrichtenlänge, Teilnehmerzahl und Zeitpunkt höchstens 90 Tage gespeichert.</p>
    <p>Eine Bestätigung an die angegebene E-Mail-Adresse enthält keine Namen oder Geburtsdaten der Teilnehmenden. Für die anschließende Buchung, Kommunikation, Aufbewahrung und Bezahlung ist der jeweilige Anbieter verantwortlich.</p>
    <p>Bitte trage in das optionale Nachrichtenfeld keine Gesundheitsdaten oder andere besonders vertrauliche Informationen ein.</p>

    <h2>Anbieterkonten</h2>
    <p>Für freigeschaltete Anbieter verarbeitet das Portal Konto-, Profil- und Sitzungsdaten, damit Freizeiten verwaltet und vor unberechtigtem Zugriff geschützt werden können.</p>

    <h2>Karten</h2>
    <p>In der Kartenansicht werden Kartendaten von OpenStreetMap geladen. Dabei kann die IP-Adresse technisch an den jeweiligen Kartenserver übertragen werden. Alle Angebote sind auch ohne Kartenansicht über die Liste erreichbar.</p>

    <h2>Deine Rechte</h2>
    <p>Für Auskunft, Berichtigung, Löschung, Einschränkung oder Widerspruch wende dich an die im Impressum genannte Kontaktadresse. Bei Fragen zu einer bereits übermittelten Platzanfrage kann zusätzlich der jeweilige Anbieter kontaktiert werden.</p>
  </div>
);
