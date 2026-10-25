import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AccessibleForm } from '../components/AccessibleForm';
import { useAuthStore } from '../store/authStore';
import { ApiError } from '../utils/api';
import { emptyProfile, euCountries, portalApi, portalDate, providerStatus, type ProviderProfile, type ProviderRecord } from '../utils/portal';

const profileLabels: Partial<Record<keyof ProviderProfile, string>> = {
  public_name: 'Öffentlicher Anbietername', legal_name: 'Eingetragener Name', legal_form: 'Rechtsform', street: 'Straße und Hausnummer', postal_code: 'Postleitzahl', city: 'Ort', country: 'Sitzland (Ländercode)', contact_info: 'Öffentliche Kontaktinformationen', public_email: 'Öffentliche E-Mail-Adresse', website: 'Website', vat_id: 'Umsatzsteuer-ID (falls vorhanden)', register_type: 'Registerart (z. B. Vereinsregister)', register_number: 'Registernummer', missing_register_reason: 'Begründung, falls keine Registerangabe vorhanden', missing_tax_reason: 'Begründung, falls keine Steuerkennung vorhanden', financial_account: 'Finanzkontokennung (optional, falls bekannt)', account_holder: 'Abweichender Kontoinhaber (optional)', account_holder_details: 'Weitere Angaben zum Kontoinhaber (optional)',
};
export function ProviderDetails({ profile }: { profile: ProviderProfile }) {
  return <div className="provider-details"><dl>{Object.entries(profileLabels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd className="preserve-lines">{String(profile[key as keyof ProviderProfile] || 'Nicht angegeben')}</dd></div>)}</dl>
    <p><strong>EU-Ansässigkeiten:</strong> {profile.residence_countries?.join(', ') || 'Nicht angegeben'}</p>
    <p><strong>Steuerkennungen:</strong> {profile.tax_ids?.map(entry => `${entry.country}: ${entry.number}`).join('; ') || 'Nicht angegeben'}</p>
    <p><strong>EU-Betriebsstätten:</strong> {profile.establishments?.map(entry => `${entry.country}: ${entry.address}`).join('; ') || 'Keine angegeben'}</p>
    <p><strong>Weitere Links:</strong> {profile.links?.map(entry => `${entry.label}: ${entry.url}`).join('; ') || 'Keine angegeben'}</p>
  </div>;
}

export function ProviderProfilePage() {
  const { user, updateUser } = useAuthStore();
  const [record, setRecord] = useState<ProviderRecord | null>(null); const [profile, setProfile] = useState<ProviderProfile>({ ...emptyProfile });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => { if (user?.role === 'user') portalApi<ProviderRecord>('/api/provider-profile').then(value => { setRecord(value); setProfile({ ...emptyProfile, ...value.profile }); }).catch(reason => setError(reason.message)); }, [user?.id, user?.role]);
  const set = (key: keyof ProviderProfile, value: string) => setProfile(current => ({ ...current, [key]: value }));
  async function save(event?: FormEvent, submit = false) {
    event?.preventDefault(); if (busy) return; setBusy(true); setError(''); setFields({}); setMessage('');
    try {
      let result = await portalApi<ProviderRecord>('/api/provider-profile', profile, 'PUT');
      if (submit) result = await portalApi<ProviderRecord>('/api/provider-profile/submit', {});
      setRecord(result); setProfile({ ...emptyProfile, ...result.profile });
      if (user) updateUser({ ...user, provider_status: result.status });
      setMessage(submit ? 'Trägerprofil zur Prüfung eingereicht.' : 'Stammdaten gespeichert. Bitte anschließend zur Prüfung einreichen.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Speichern fehlgeschlagen.'); if (reason instanceof ApiError) setFields(reason.fields); }
    finally { setBusy(false); }
  }
  if (!user) return <p>Bitte <Link to="/login">anmelden</Link>.</p>;
  if (user.role !== 'user') return <p>Trägerprofile findest du in der <Link to="/pruefung">Prüfverwaltung</Link>.</p>;
  return <section className="portal-panel"><h1>Trägerprofil und Stammdaten</h1>
    <p>Prüfstatus: <strong>{providerStatus[record?.status || 'draft']}</strong></p>
    {record?.review_reason && <p className="alert">Rückmeldung des Jugendrings: {record.review_reason}</p>}
    {record?.status === 'approved' && <p>Änderungen am Trägerprofil erfordern eine erneute Freigabe. Bis dahin sind eure Angebote vorübergehend nicht öffentlich sichtbar.</p>}
    {error && <p className="alert" role="alert">{error}</p>}{message && <p className="success-alert" role="status">{message}</p>}
    {!record && !error ? <p role="status">Stammdaten werden geladen …</p> : <AccessibleForm onSubmit={event => void save(event)}>
      <fieldset disabled={busy}><legend>Öffentliches Profil</legend><div className="portal-form-grid">
        {(['public_name', 'contact_info', 'public_email', 'website'] as const).map(key => <label className="field" key={key}><span>{profileLabels[key]}</span>{key === 'contact_info' ? <textarea value={profile[key]} maxLength={2000} onChange={event => set(key, event.target.value)} /> : <input type={key === 'website' ? 'url' : key === 'public_email' ? 'email' : 'text'} value={profile[key]} maxLength={key === 'website' ? 500 : 254} onChange={event => set(key, event.target.value)} />}</label>)}
      </div><h3>Einrichtungen und Veranstaltungsorte verlinken</h3>
        {profile.links.map((entry, index) => <div className="repeat-row" key={index}><label className="field"><span>Linktitel {index + 1}</span><input value={entry.label} maxLength={120} onChange={event => setProfile({ ...profile, links: profile.links.map((value, i) => i === index ? { ...value, label: event.target.value } : value) })} /></label><label className="field"><span>Adresse {index + 1}</span><input type="url" value={entry.url} maxLength={500} onChange={event => setProfile({ ...profile, links: profile.links.map((value, i) => i === index ? { ...value, url: event.target.value } : value) })} /></label><button type="button" className="text-button" onClick={() => setProfile({ ...profile, links: profile.links.filter((_, i) => i !== index) })}>Link {index + 1} entfernen</button></div>)}
        <button type="button" className="secondary-action" disabled={profile.links.length >= 20} onClick={() => setProfile({ ...profile, links: [...profile.links, { label: '', url: '' }] })}>Link ergänzen</button>
      </fieldset>
      <fieldset disabled={busy}><legend>Geschützte Organisationsdaten</legend><p>Diese Angaben sehen ausschließlich dein Trägerkonto und die zuständigen Jugendring-Administratoren. Es werden noch keine Zahlungen verarbeitet.</p><div className="portal-form-grid">
        {(['legal_name', 'legal_form', 'street', 'postal_code', 'city', 'country', 'vat_id', 'register_type', 'register_number', 'missing_register_reason', 'missing_tax_reason', 'financial_account', 'account_holder', 'account_holder_details'] as const).map(key => <label className="field" key={key}><span>{profileLabels[key]}</span><input value={profile[key]} maxLength={['missing_register_reason', 'missing_tax_reason', 'account_holder_details'].includes(key) ? 500 : key === 'country' ? 2 : key === 'postal_code' ? 20 : 200} onChange={event => set(key, event.target.value)} aria-invalid={Boolean(fields[key])} aria-describedby={fields[key] ? `profile-${key}` : undefined} />{fields[key] && <small id={`profile-${key}`}>{fields[key]}</small>}</label>)}
      </div><p>Eine Handelsregisternummer ist für einen Verein nicht pauschal erforderlich. Bitte das zutreffende Register angeben oder das Fehlen begründen.</p></fieldset>
      <fieldset disabled={busy}><legend>Steuerkennungen mit ausstellendem EU-Staat</legend>
        {profile.tax_ids.map((entry, index) => <div className="repeat-row" key={index}><label className="field"><span>EU-Staat der Steuerkennung {index + 1}</span><select value={entry.country} onChange={event => setProfile({ ...profile, tax_ids: profile.tax_ids.map((value, i) => i === index ? { ...value, country: event.target.value } : value) })}>{euCountries.map(country => <option key={country}>{country}</option>)}</select></label><label className="field"><span>Steuerkennung {index + 1}</span><input value={entry.number} maxLength={100} onChange={event => setProfile({ ...profile, tax_ids: profile.tax_ids.map((value, i) => i === index ? { ...value, number: event.target.value } : value) })} /></label><button type="button" className="text-button" onClick={() => setProfile({ ...profile, tax_ids: profile.tax_ids.filter((_, i) => i !== index) })}>Steuerkennung {index + 1} entfernen</button></div>)}
        <button type="button" className="secondary-action" disabled={profile.tax_ids.length >= 40} onClick={() => setProfile({ ...profile, tax_ids: [...profile.tax_ids, { country: 'DE', number: '' }] })}>Steuerkennung ergänzen</button>
      </fieldset>
      <fieldset disabled={busy}><legend>Steuerliche Ansässigkeit in der EU</legend><div className="country-options">{euCountries.map(country => <label key={country}><input type="checkbox" checked={profile.residence_countries.includes(country)} onChange={event => setProfile({ ...profile, residence_countries: event.target.checked ? [...profile.residence_countries, country] : profile.residence_countries.filter(value => value !== country) })} />{country}</label>)}</div>{fields.residence_countries && <p className="alert">{fields.residence_countries}</p>}</fieldset>
      <fieldset disabled={busy}><legend>EU-Betriebsstätten, über die relevante Tätigkeiten ausgeübt werden</legend>
        {profile.establishments.map((entry, index) => <div className="repeat-row" key={index}><label className="field"><span>EU-Staat der Betriebsstätte {index + 1}</span><select value={entry.country} onChange={event => setProfile({ ...profile, establishments: profile.establishments.map((value, i) => i === index ? { ...value, country: event.target.value } : value) })}>{euCountries.map(country => <option key={country}>{country}</option>)}</select></label><label className="field"><span>Anschrift der Betriebsstätte {index + 1}</span><input value={entry.address} maxLength={500} onChange={event => setProfile({ ...profile, establishments: profile.establishments.map((value, i) => i === index ? { ...value, address: event.target.value } : value) })} /></label><button type="button" className="text-button" onClick={() => setProfile({ ...profile, establishments: profile.establishments.filter((_, i) => i !== index) })}>Betriebsstätte {index + 1} entfernen</button></div>)}
        <button type="button" className="secondary-action" disabled={profile.establishments.length >= 40} onClick={() => setProfile({ ...profile, establishments: [...profile.establishments, { country: 'DE', address: '' }] })}>Betriebsstätte ergänzen</button>
      </fieldset>
      <div className="portal-actions"><button className="secondary-action" disabled={busy}>Stammdaten speichern</button><button type="button" className="primary-action" disabled={busy || record?.status === 'suspended'} onClick={() => void save(undefined, true)}>Speichern und zur Prüfung einreichen</button></div>
    </AccessibleForm>}
    {record && <details><summary>Prüfhistorie</summary><ul>{record.history.map((entry, index) => <li key={index}>{portalDate(entry.created_at)}: {providerStatus[entry.status] || entry.status}{entry.reason ? `: ${entry.reason}` : ''}</li>)}</ul></details>}
    {record?.status === 'approved' && <p><Link to="/dashboard">Freizeiten verwalten</Link></p>}
  </section>;
}
