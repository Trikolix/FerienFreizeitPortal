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

    <h2>Anmeldungen und Wartelisten</h2>
    <p>Das Anmeldeformular kann direkt ohne Familienkonto ausgefüllt werden. Erst das abschließende Absenden speichert die Anmeldung und reserviert bei ausreichender Kapazität vorläufig Plätze. Der Anbieter erhält die Anmeldedaten per E-Mail; du erhältst eine Bestätigung mit Zusammenfassung und einem geschützten Statuslink an die angegebene E-Mail-Adresse.</p>
    <p>Das Portal speichert Name, E-Mail-Adresse und Telefonnummer der Kontaktperson, Namen und Geburtsdaten der Teilnehmenden, eine optionale Nachricht, Buchungsstatus und Bearbeitungszeitpunkte. Die Anmeldung enthält außerdem die zum Zeitpunkt der Anmeldung geltende Angebotsfassung und den Teilnahmebeitrag. Der jeweilige Anbieter bearbeitet Zusagen, Wartelisten und Stornierungen.</p>
    <p>Die Duplikatprüfung vergleicht Namen und Geburtsdaten ausschließlich innerhalb derselben Freizeit. Buchungsdaten eines Trägers sind für andere Träger nicht zugänglich. Der Jugendring erhält statistische Auswertungen ohne Teilnehmerlisten.</p>
    <p>Den persönlichen Statuslink erhältst du per E-Mail. Behandle ihn vertraulich. Für Änderungen oder Stornierungen kontaktiere den Anbieter der Freizeit. Bitte trage keine Gesundheitsdaten oder andere besonders vertrauliche Informationen in das Nachrichtenfeld ein.</p>
    <p>Personenbezogene Buchungsdaten werden nach der für den Betrieb festgelegten Frist nach Freizeitende automatisch gelöscht. Anonyme Buchungszahlen bleiben für Auswertungen erhalten. Die produktive Aufbewahrungsfrist wird vor Freischaltung des Buchungsbetriebs verbindlich festgelegt und hier veröffentlicht. Fehlgeschlagene E-Mails bleiben zur erneuten Zustellung vorgemerkt.</p>
    <h2>Trägerkonten und Stammdaten</h2>
    <p>Träger registrieren ein verantwortliches Konto und erfassen Organisations-, Kontakt-, Register- und Steuerangaben. Öffentliche Profilangaben werden erst nach Prüfung veröffentlicht. Geschützte Steuer- und gegebenenfalls Kontodaten sind nur für das Trägerkonto und berechtigte Jugendring-Administratoren zugänglich.</p>
    <p>Stammdatenänderungen und Prüfergebnisse werden historisiert, damit jährliche Anbieterübersichten nachvollziehbar bleiben. Die PStTG-Anwendbarkeit und die dafür erforderlichen Aufbewahrungs- und Meldeprozesse werden vor Produktivstart fachlich festgelegt. Die erste Ausbaustufe erfasst keine Zahlungen oder Umsätze.</p>

    <h2>Karten</h2>
    <p>In der Kartenansicht werden Kartendaten von OpenStreetMap geladen. Dabei kann die IP-Adresse technisch an den jeweiligen Kartenserver übertragen werden. Alle Angebote sind auch ohne Kartenansicht über die Liste erreichbar.</p>

    <h2>Deine Rechte</h2>
    <p>Für Auskunft, Berichtigung, Löschung, Einschränkung oder Widerspruch wende dich an die im Impressum genannte Kontaktadresse. Bei Fragen zu einer bereits übermittelten Platzanfrage kann zusätzlich der jeweilige Anbieter kontaktiert werden.</p>
  </div>
);
