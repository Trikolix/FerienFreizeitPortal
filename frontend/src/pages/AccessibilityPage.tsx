import { Link } from 'react-router-dom';

export function AccessibilityPage() {
  return <article className="imprint-page">
    <span className="eyebrow">Für alle zugänglich</span>
    <h1>Barrierefreiheit</h1>
    <p>Alle Menschen sollen passende Ferienfreizeiten finden und dieses Portal selbstständig bedienen können. Wir arbeiten daran, Barrieren zu erkennen und abzubauen.</p>
    <h2>Unser Ziel und der aktuelle Stand</h2>
    <p>Wir orientieren uns an WCAG 2.2 auf Stufe AA und berücksichtigen die Anforderungen der BITV 2.0. Dies ist eine Information zum Arbeitsstand, noch keine abschließend geprüfte Erklärung zur Barrierefreiheit.</p>
    <p>Die Oberfläche wird mit automatisierten Tests und Tastaturprüfungen überprüft. Diese Prüfungen ersetzen keine unabhängige Bewertung oder Tests mit Menschen, die assistive Technik nutzen. Ergebnisse und offene Prüfschritte werden im technischen Prüfbericht dokumentiert.</p>
    <h2>So kannst du das Portal bedienen</h2>
    <ul><li>Mit der Tabulatortaste erreichst du Links und Schaltflächen. Der erste Link führt direkt zum Inhalt.</li>
      <li>Du kannst die Darstellung mit den Einstellungen deines Browsers vergrößern. Die Seite berücksichtigt reduzierte Bewegung und System-Kontrastfarben.</li>
      <li>Die Freizeitliste funktioniert ohne Karte. Auch Anbieter können Orte und Koordinaten ohne Kartenbedienung eingeben.</li>
      <li>Dialoge lassen sich mit Escape schließen. Bei ungespeicherten Änderungen kann eine Rückfrage erscheinen.</li></ul>
    <h2>Bekannte Einschränkungen</h2>
    <p>Bei älteren Freizeitbildern können aussagekräftige Bildbeschreibungen fehlen. Anbieter müssen diese nachpflegen. Die Qualität der bereitgestellten Beschreibungen und Freizeittexte ist zusätzlich redaktionell zu prüfen.</p>
    <p>Eine vollständige Prüfung mit NVDA und VoiceOver sowie eine unabhängige WCAG-/BITV-Prüfung stehen noch aus. Geprüfte Erläuterungen in Leichter Sprache und Deutscher Gebärdensprache liegen derzeit nicht vor.</p>
    <h2>Eine Barriere melden</h2>
    <p>Bitte beschreibe, auf welcher Seite und bei welchem Schritt du ein Problem bemerkst. Angaben zu Browser oder Hilfsmitteln sind freiwillig. Teile keine Gesundheitsdaten mit.</p>
    <p><Link className="primary-action" to="/kontakt?anliegen=barrierefreiheit">Barriere melden</Link></p>
    <h2>Noch vor dem Livegang zu ergänzen</h2>
    <p>Die realen Betreiberangaben, das anwendbare Durchsetzungsverfahren und die zuständige Stelle müssen verbindlich geklärt werden. Prüfdatum und Konformitätsbewertung werden erst nach der entsprechenden Prüfung veröffentlicht.</p>
  </article>;
}
