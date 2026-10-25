import { useCallback, useEffect, useState } from 'react';
import { portalApi, portalDate } from '../utils/portal';
interface Delivery { id: number; kind: string; status: string; attempts: number; created_at: string }
export function MailDeliveryStatus() {
  const [items, setItems] = useState<Delivery[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setItems(await portalApi<Delivery[]>('/api/mail-outbox')); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Versandstatus nicht verfügbar.'); } }, []);
  useEffect(() => { let active = true; portalApi<Delivery[]>('/api/mail-outbox').then(value => { if (active) setItems(value); }).catch(reason => { if (active) setError(reason.message); }); return () => { active = false; }; }, []);
  const labels: Record<string, string> = { pending: 'Vorgemerkt', sending: 'Wird versendet', failed: 'Versand fehlgeschlagen' };
  return <details className="portal-panel"><summary>Offene E-Mails ({items.length})</summary><p>Gespeicherte Anmeldungen bleiben auch bei Versandfehlern erhalten.</p>{error && <p className="alert" role="alert">{error}</p>}<ul className="portal-list">{items.map(item => <li key={item.id}>{portalDate(item.created_at)} · {labels[item.status]} · {item.attempts} Versandversuche {item.status === 'failed' && <button className="secondary-action" type="button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await portalApi(`/api/mail-outbox/${item.id}/retry`, {}); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Erneuter Versand fehlgeschlagen.'); } finally { setBusy(false); } }}>Erneut versenden</button>}</li>)}</ul><button className="text-button" type="button" onClick={() => void load()}>Versandstatus aktualisieren</button></details>;
}
