import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { AccessibleForm } from '../components/AccessibleForm';
import { ProviderWorkspaceShell } from '../components/WorkspaceShell';
import { useAuthStore } from '../store/authStore';
import { ApiError } from '../utils/api';
import { emptyProfile, euCountries, portalApi, portalDate, providerStatus, type ProviderProfile, type ProviderRecord } from '../utils/portal';

function normalizeLoadedProfile(raw?: Partial<ProviderProfile>): ProviderProfile {
  const merged = { ...emptyProfile, ...raw };
  return {
    ...merged,
    country: merged.country?.trim() || 'DE',
    residence_countries: merged.residence_countries?.length ? merged.residence_countries : ['DE'],
  };
}

const profileLabels: Partial<Record<keyof ProviderProfile, string>> = {
  public_name: 'Öffentlicher Anbietername',
  legal_name: 'Eingetragener Name',
  legal_form: 'Rechtsform',
  street: 'Straße und Hausnummer',
  postal_code: 'Postleitzahl',
  city: 'Ort',
  country: 'Sitzland (Ländercode)',
  contact_info: 'Öffentliche Kontaktinformationen',
  public_email: 'Öffentliche E-Mail-Adresse',
  website: 'Website',
  vat_id: 'Umsatzsteuer-ID (falls vorhanden)',
  register_type: 'Registerart (z. B. Vereinsregister)',
  register_number: 'Registernummer',
  missing_register_reason: 'Begründung, falls keine Registerangabe vorhanden',
  missing_tax_reason: 'Begründung, falls keine Steuerkennung vorhanden',
  financial_account: 'Finanzkontokennung (optional, falls bekannt)',
  account_holder: 'Abweichender Kontoinhaber (optional)',
  account_holder_details: 'Weitere Angaben zum Kontoinhaber (optional)',
};

function statusBannerClass(status?: string) {
  if (status === 'approved') return 'is-approved';
  if (status === 'submitted') return 'is-submitted';
  if (status === 'changes_requested') return 'is-warning';
  if (status === 'suspended') return 'is-danger';
  return '';
}

function statusGuidance(status?: string) {
  switch (status) {
    case 'approved':
      return 'Dein Trägerprofil ist freigegeben. Du kannst Freizeiten anlegen, einreichen und Anmeldungen verwalten.';
    case 'submitted':
      return 'Dein Profil liegt dem Jugendring zur Prüfung vor. Sobald es freigegeben wurde, kannst du Angebote einstellen.';
    case 'changes_requested':
      return 'Bitte überarbeite die unten genannten Punkte und reiche das Trägerprofil erneut zur Prüfung ein.';
    case 'suspended':
      return 'Dieses Trägerkonto ist derzeit gesperrt. Bitte wende dich direkt an den Jugendring Westsachsen.';
    default:
      return 'Bitte vervollständige alle Pflichtangaben und reiche dein Profil zur Freigabe durch den Jugendring ein.';
  }
}

export function ProviderDetails({ profile }: { profile: ProviderProfile }) {
  return (
    <div className="provider-details">
      <dl>
        {Object.entries(profileLabels).map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd className="preserve-lines">{String(profile[key as keyof ProviderProfile] || 'Nicht angegeben')}</dd>
          </div>
        ))}
      </dl>
      <p><strong>EU-Ansässigkeiten:</strong> {profile.residence_countries?.join(', ') || 'Nicht angegeben'}</p>
      <p><strong>Steuerkennungen:</strong> {profile.tax_ids?.map(entry => `${entry.country}: ${entry.number}`).join('; ') || 'Nicht angegeben'}</p>
      <p><strong>EU-Betriebsstätten:</strong> {profile.establishments?.map(entry => `${entry.country}: ${entry.address}`).join('; ') || 'Keine angegeben'}</p>
      <p><strong>Weitere Links:</strong> {profile.links?.map(entry => `${entry.label}: ${entry.url}`).join('; ') || 'Keine angegeben'}</p>
    </div>
  );
}

export function ProviderProfilePage() {
  const { user, updateUser } = useAuthStore();
  const [record, setRecord] = useState<ProviderRecord | null>(null);
  const [profile, setProfile] = useState<ProviderProfile>({ ...emptyProfile });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user?.role === 'user') {
      portalApi<ProviderRecord>('/api/provider-profile')
        .then(value => { setRecord(value); setProfile(normalizeLoadedProfile(value.profile)); })
        .catch(reason => setError(reason.message));
    }
  }, [user?.id, user?.role]);

  const set = (key: keyof ProviderProfile, value: string) => setProfile(current => ({ ...current, [key]: value }));

  async function save(event?: FormEvent, submit = false) {
    event?.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setFields({}); setMessage('');
    try {
      let result = await portalApi<ProviderRecord>('/api/provider-profile', profile, 'PUT');
      if (submit) result = await portalApi<ProviderRecord>('/api/provider-profile/submit', {});
      setRecord(result);
      setProfile(normalizeLoadedProfile(result.profile));
      if (user) updateUser({ ...user, provider_status: result.status });
      setMessage(submit ? 'Trägerprofil zur Prüfung eingereicht.' : 'Stammdaten gespeichert. Bitte anschließend zur Prüfung einreichen.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Speichern fehlgeschlagen.');
      if (reason instanceof ApiError) setFields(reason.fields);
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <p>Bitte <Link to="/login">anmelden</Link>.</p>;
  if (user.role !== 'user') return <p>Trägerprofile findest du in der <Link to="/pruefung">Prüfverwaltung</Link>.</p>;

  const currentStatus = record?.status || 'draft';
  const showEuDetails =
    (profile.country || 'DE') !== 'DE'
    || profile.residence_countries.length !== 1
    || profile.residence_countries[0] !== 'DE'
    || profile.establishments.length > 0
    || Boolean(fields.country || fields.residence_countries);

  const renderProfileField = (key: keyof ProviderProfile, options: { wide?: boolean; rows?: number } = {}) => {
    const isTextarea = key === 'contact_info';
    const maxLength = ['missing_register_reason', 'missing_tax_reason', 'account_holder_details', 'website'].includes(key)
      ? 500
      : key === 'country'
        ? 2
        : key === 'postal_code'
          ? 20
          : key === 'public_email'
            ? 254
            : 200;
    return (
      <label className={`field ${options.wide ? 'field-wide' : ''}`} key={key} style={key === 'country' ? { maxWidth: '14rem' } : undefined}>
        <span>{profileLabels[key]}</span>
        {isTextarea ? (
          <textarea
            rows={options.rows ?? 4}
            value={String(profile[key] || '')}
            maxLength={2000}
            onChange={event => set(key, event.target.value)}
            aria-invalid={Boolean(fields[key])}
            aria-describedby={fields[key] ? `profile-${key}` : undefined}
          />
        ) : (
          <input
            type={key === 'website' ? 'url' : key === 'public_email' ? 'email' : 'text'}
            value={String(profile[key] || '')}
            maxLength={maxLength}
            onChange={event => set(key, event.target.value)}
            aria-invalid={Boolean(fields[key])}
            aria-describedby={fields[key] ? `profile-${key}` : undefined}
          />
        )}
        {fields[key] && <small id={`profile-${key}`}>{fields[key]}</small>}
      </label>
    );
  };

  return (
    <ProviderWorkspaceShell>
    <section className="portal-panel" style={{ marginBlock: 0 }}>
      <div className="dashboard-hero">
        <div className="page-heading">
          <span className="eyebrow">Trägerkonto</span>
          <h1>Trägerprofil und Stammdaten</h1>
          <p>Pflege hier die öffentlichen Kontaktinformationen sowie geschützte Organisationsdaten für die Prüfung durch den Jugendring.</p>
        </div>
        {currentStatus === 'approved' && (
          <Link className="primary-action" to="/dashboard">
            Freizeiten verwalten
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        )}
      </div>

      <div className={`status-banner ${statusBannerClass(currentStatus)}`}>
        <p style={{ margin: 0 }}>Prüfstatus: <strong>{providerStatus[currentStatus]}</strong></p>
        <p style={{ margin: 0 }}>{statusGuidance(currentStatus)}</p>
      </div>

      {record?.review_reason && <p className="alert">Rückmeldung des Jugendrings: {record.review_reason}</p>}
      {record?.status === 'approved' && <p className="info-hint">Hinweis: Änderungen am Trägerprofil erfordern eine erneute Freigabe. Bis dahin sind eure Angebote vorübergehend nicht öffentlich sichtbar.</p>}
      {error && <p className="alert" role="alert">{error}</p>}
      {message && <p className="success-alert" role="status">{message}</p>}

      {!record && !error ? (
        <p role="status">Stammdaten werden geladen …</p>
      ) : (
        <AccessibleForm onSubmit={event => void save(event)}>
          <fieldset disabled={busy}>
            <legend>Öffentliches Profil (für Familien sichtbar)</legend>
            <div className="portal-form-grid is-two-col">
              {renderProfileField('public_name', { wide: true })}
              {renderProfileField('public_email')}
              {renderProfileField('website')}
              {renderProfileField('contact_info', { wide: true, rows: 4 })}
            </div>

            <p className="form-subgroup-title">Einrichtungen und Veranstaltungsorte verlinken</p>
            {profile.links.map((entry, index) => (
              <div className="repeat-row" key={index}>
                <label className="field">
                  <span>Linktitel {index + 1}</span>
                  <input value={entry.label} maxLength={120} onChange={event => setProfile({ ...profile, links: profile.links.map((value, i) => i === index ? { ...value, label: event.target.value } : value) })} />
                </label>
                <label className="field">
                  <span>Adresse {index + 1}</span>
                  <input type="url" value={entry.url} maxLength={500} onChange={event => setProfile({ ...profile, links: profile.links.map((value, i) => i === index ? { ...value, url: event.target.value } : value) })} />
                </label>
                <button type="button" className="text-button" onClick={() => setProfile({ ...profile, links: profile.links.filter((_, i) => i !== index) })}>
                  <Trash2 size={16} aria-hidden="true" />
                  Link {index + 1} entfernen
                </button>
              </div>
            ))}
            <button type="button" className="secondary-action" disabled={profile.links.length >= 20} onClick={() => setProfile({ ...profile, links: [...profile.links, { label: '', url: '' }] })}>
              <Plus size={16} aria-hidden="true" />
              Link ergänzen
            </button>
          </fieldset>

          <fieldset disabled={busy}>
            <legend>Geschützte Organisationsdaten (nur für den Jugendring)</legend>
            <p className="editor-help" style={{ margin: 0 }}>Diese Angaben sehen ausschließlich dein Trägerkonto und die zuständigen Jugendring-Administratoren. Es werden noch keine Zahlungen verarbeitet.</p>

            <p className="form-subgroup-title">Organisation &amp; Anschrift</p>
            <div className="portal-form-grid is-two-col">
              {renderProfileField('legal_name')}
              {renderProfileField('legal_form')}
              {renderProfileField('street', { wide: true })}
              {renderProfileField('postal_code')}
              {renderProfileField('city')}
            </div>

            <p className="form-subgroup-title">Register &amp; Steuern</p>
            <div className="portal-form-grid is-two-col">
              {renderProfileField('register_type')}
              {renderProfileField('register_number')}
              {renderProfileField('missing_register_reason', { wide: true })}
              {renderProfileField('vat_id')}
              {renderProfileField('missing_tax_reason')}
            </div>
            <p className="editor-help" style={{ margin: 0 }}>Eine Handelsregisternummer ist für einen Verein nicht pauschal erforderlich. Bitte das zutreffende Register angeben oder das Fehlen begründen.</p>

            <p className="form-subgroup-title">Bankverbindung (optional)</p>
            <div className="portal-form-grid is-two-col">
              {renderProfileField('financial_account')}
              {renderProfileField('account_holder')}
              {renderProfileField('account_holder_details', { wide: true })}
            </div>
          </fieldset>

          <fieldset disabled={busy}>
            <legend>Steuerkennungen</legend>
            {profile.tax_ids.map((entry, index) => (
              <div className="repeat-row" key={index}>
                <label className="field field-compact">
                  <span>EU-Staat der Steuerkennung {index + 1}</span>
                  <select value={entry.country} onChange={event => setProfile({ ...profile, tax_ids: profile.tax_ids.map((value, i) => i === index ? { ...value, country: event.target.value } : value) })}>
                    {euCountries.map(country => <option key={country}>{country}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Steuerkennung {index + 1}</span>
                  <input value={entry.number} maxLength={100} onChange={event => setProfile({ ...profile, tax_ids: profile.tax_ids.map((value, i) => i === index ? { ...value, number: event.target.value } : value) })} />
                </label>
                <button type="button" className="text-button" onClick={() => setProfile({ ...profile, tax_ids: profile.tax_ids.filter((_, i) => i !== index) })}>
                  <Trash2 size={16} aria-hidden="true" />
                  Steuerkennung {index + 1} entfernen
                </button>
              </div>
            ))}
            <button type="button" className="secondary-action" disabled={profile.tax_ids.length >= 40} onClick={() => setProfile({ ...profile, tax_ids: [...profile.tax_ids, { country: 'DE', number: '' }] })}>
              <Plus size={16} aria-hidden="true" />
              Steuerkennung ergänzen
            </button>
          </fieldset>

          <details className="portal-disclosure" open={showEuDetails || undefined}>
            <summary>Auslands- &amp; EU-Angaben anpassen (Standard: Sitz &amp; steuerliche Ansässigkeit in Deutschland)</summary>
            <div className="portal-disclosure-body">
              <p className="editor-help" style={{ margin: 0 }}>Für deutsche Vereine und Träger ist „DE“ bereits automatisch vorbelegt. Nur bei Sitz oder Betriebsstätten im EU-Ausland anpassen.</p>

              <fieldset disabled={busy}>
                <legend>Sitzland &amp; steuerliche Ansässigkeit in der EU</legend>
                {renderProfileField('country')}
                <div className="country-options" role="group" aria-label="Steuerliche Ansässigkeit in der EU">
                  {euCountries.map(country => (
                    <label key={country}>
                      <input type="checkbox" checked={profile.residence_countries.includes(country)} onChange={event => setProfile({ ...profile, residence_countries: event.target.checked ? [...profile.residence_countries, country] : profile.residence_countries.filter(value => value !== country) })} />
                      {country}
                    </label>
                  ))}
                </div>
                {fields.residence_countries && <p className="alert">{fields.residence_countries}</p>}
              </fieldset>

              <fieldset disabled={busy}>
                <legend>EU-Betriebsstätten (optional)</legend>
                {profile.establishments.map((entry, index) => (
                  <div className="repeat-row" key={index}>
                    <label className="field field-compact">
                      <span>EU-Staat der Betriebsstätte {index + 1}</span>
                      <select value={entry.country} onChange={event => setProfile({ ...profile, establishments: profile.establishments.map((value, i) => i === index ? { ...value, country: event.target.value } : value) })}>
                        {euCountries.map(country => <option key={country}>{country}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span>Anschrift der Betriebsstätte {index + 1}</span>
                      <input value={entry.address} maxLength={500} onChange={event => setProfile({ ...profile, establishments: profile.establishments.map((value, i) => i === index ? { ...value, address: event.target.value } : value) })} />
                    </label>
                    <button type="button" className="text-button" onClick={() => setProfile({ ...profile, establishments: profile.establishments.filter((_, i) => i !== index) })}>
                      <Trash2 size={16} aria-hidden="true" />
                      Betriebsstätte {index + 1} entfernen
                    </button>
                  </div>
                ))}
                <button type="button" className="secondary-action" disabled={profile.establishments.length >= 40} onClick={() => setProfile({ ...profile, establishments: [...profile.establishments, { country: 'DE', address: '' }] })}>
                  <Plus size={16} aria-hidden="true" />
                  Betriebsstätte ergänzen
                </button>
              </fieldset>
            </div>
          </details>

          <div className="portal-actions">
            <button className="secondary-action" disabled={busy}>Stammdaten speichern</button>
            <button type="button" className="primary-action" disabled={busy || record?.status === 'suspended'} onClick={() => void save(undefined, true)}>Speichern und zur Prüfung einreichen</button>
          </div>
        </AccessibleForm>
      )}

      {record && (
        <details>
          <summary>Prüfhistorie</summary>
          <ul className="status-timeline">
            {record.history.map((entry, index) => (
              <li key={index}>{portalDate(entry.created_at)}: {providerStatus[entry.status] || entry.status}{entry.reason ? `: ${entry.reason}` : ''}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
    </ProviderWorkspaceShell>
  );
}
