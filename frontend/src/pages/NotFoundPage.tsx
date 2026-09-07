import { Link } from 'react-router-dom';
export function NotFoundPage() {
  return <section className="empty-state"><span className="eyebrow">Seite nicht gefunden</span><h1>Hier geht es leider nicht weiter.</h1><p>Die Adresse ist möglicherweise nicht mehr aktuell. Über die Suche findest du alle verfügbaren Freizeiten.</p><Link className="primary-action" to="/">Freizeiten entdecken</Link></section>;
}
