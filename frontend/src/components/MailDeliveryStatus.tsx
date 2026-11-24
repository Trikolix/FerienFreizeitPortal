import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { portalApi, portalDate } from '../utils/portal';

interface Delivery {
  id: number;
  kind: string;
  status: string;
  attempts: number;
  created_at: string;
}

export function MailDeliveryStatus() {
  const [items, setItems] = useState<Delivery[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await portalApi<Delivery[]>('/api/mail-outbox'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Versandstatus nicht verfügbar.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    portalApi<Delivery[]>('/api/mail-outbox')
      .then(value => { if (active) setItems(value); })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);

  const labels: Record<string, string> = {
    pending: 'Vorgemerkt',
    sending: 'Wird versendet',
    failed: 'Versand fehlgeschlagen',
  };
  const failedCount = items.filter(item => item.status === 'failed').length;

  return (
    <details className="portal-panel">
      <summary>
        Offene E-Mails ({items.length})
        {failedCount > 0 && <span className="status-pill is-danger"> · {failedCount} fehlgeschlagen</span>}
      </summary>
      <p className="editor-help">Gespeicherte Anmeldungen bleiben auch bei Versandfehlern erhalten.</p>
      {error && <p className="alert" role="alert">{error}</p>}
      <ul className="portal-list">
        {items.map(item => (
          <li key={item.id} className="portal-card">
            <div className="booking-card-header">
              <span>{portalDate(item.created_at)} · {item.attempts} Versandversuche</span>
              <span className={`status-pill ${item.status === 'failed' ? 'is-danger' : 'is-warning'}`}>{labels[item.status]}</span>
            </div>
            {item.status === 'failed' && (
              <button
                className="secondary-action"
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true); setError('');
                  try {
                    await portalApi(`/api/mail-outbox/${item.id}/retry`, {});
                    await load();
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : 'Erneuter Versand fehlgeschlagen.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Erneut versenden
              </button>
            )}
          </li>
        ))}
      </ul>
      <button className="text-button" type="button" onClick={() => void load()}>
        <RefreshCw size={15} aria-hidden="true" />
        Versandstatus aktualisieren
      </button>
    </details>
  );
}
