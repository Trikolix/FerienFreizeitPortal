import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import { portalApi, portalDate, portalPrice, providerStatus, type ProviderRecord } from '../utils/portal';
import { safeHtml } from '../utils/safeHtml';
import { useAuthStore } from '../store/authStore';
import { ProviderDetails } from './ProviderProfilePage';
import { BookingStatistics, type BookingStatistic } from '../components/BookingStatistics';
import { MailDeliveryStatus } from '../components/MailDeliveryStatus';
import { ImageGallery } from '../components/ImageGallery';
interface ReviewCamp { id: number; revision_id: number; title: string; club_name: string; description: string; confirmation_information?: string; starts_at: string; ends_at: string; min_age: number; max_age: number; location_text: string; price_eur: number; categories: string[]; image_metadata: import('../utils/imageMetadata').ImageMetadata[] }
export function PortalAdminPage() {
  const user = useAuthStore(state => state.user); const [providers, setProviders] = useState<ProviderRecord[]>([]); const [reviews, setReviews] = useState<ReviewCamp[]>([]); const [statistics, setStatistics] = useState<BookingStatistic[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [reload, setReload] = useState(0);
  const [year, setYear] = useState(new Date().getFullYear()); const [status, setStatus] = useState('submitted'); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  useEffect(() => {
    if (!user || user.role === 'user') return;
    let active = true; const query = new URLSearchParams(); if (from) query.set('from', from); if (to) query.set('to', to);
    Promise.all([portalApi<ProviderRecord[]>('/api/admin/providers'), portalApi<ReviewCamp[]>('/api/admin/reviews'), portalApi<BookingStatistic[]>(`/api/booking-statistics?${query}`)]).then(([providerRows, campRows, stats]) => { if (active) { setProviders(providerRows); setReviews(campRows); setStatistics(stats); } }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, reload, from, to]);
  if (!user || user.role === 'user') return <p>Die Prüfverwaltung ist dem Jugendring vorbehalten. <Link to="/login">Anmelden</Link></p>;
  async function review(kind: 'provider' | 'camp', id: number, decision: string, revision?: number, profileVersion?: string) {
    if (busy) return; setBusy(true); setError(''); setMessage('');
    try { await portalApi(kind === 'provider' ? `/api/admin/providers/${id}/review` : `/api/admin/camps/${id}/review`, { decision, reason: reason[`${kind}-${id}`] || '', revision_id: revision, profile_version: profileVersion }); setMessage('Prüfergebnis gespeichert.'); setReload(value => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Prüfung fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  async function download() {
    setBusy(true); setError('');
    try { const response = await apiFetch(`/api/admin/providers/export?year=${year}`); const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `Anbieter-${year}.xlsx`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Export fehlgeschlagen.'); }
    finally { setBusy(false); }
  }
  return <section className="portal-panel"><h1>Trägerprüfung und Angebotsfreigabe</h1><p><Link to="/admin">Zur allgemeinen Verwaltung</Link></p>
    {error && <p role="alert" className="alert">{error}</p>}{message && <p role="status" className="success-alert">{message}</p>}{loading && <p role="status">Prüfungen werden geladen …</p>}
    <h2>Trägerprofile</h2><label className="field"><span>Prüfstatus filtern</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="">Alle Träger</option>{Object.entries(providerStatus).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <ul className="portal-list">{providers.filter(provider => !status || provider.status === status).map(provider => <li className="portal-card" key={provider.id}><h3>{provider.profile.public_name || provider.profile.legal_name || 'Neuer Träger'}</h3><p>{provider.email} · <strong>{providerStatus[provider.status]}</strong> · E-Mail {provider.email_verified ? 'bestätigt' : 'noch nicht bestätigt'}</p>
      <details><summary>Geschützte Stammdaten und Prüfhistorie ansehen</summary><ProviderDetails profile={provider.profile} /><ul>{provider.history.map((entry, index) => <li key={index}>{portalDate(entry.created_at)}: {providerStatus[entry.status]}{entry.reason ? `: ${entry.reason}` : ''}</li>)}</ul></details>
      {provider.review_reason && <p>Bisherige Rückmeldung: {provider.review_reason}</p>}
      <label className="field"><span>Rückmeldung für {provider.profile.public_name || 'diesen Träger'}</span><textarea maxLength={2000} value={reason[`provider-${provider.id}`] || ''} onChange={event => setReason({ ...reason, [`provider-${provider.id}`]: event.target.value })} /></label>
      <div className="portal-actions"><button type="button" className="primary-action" disabled={busy || !provider.email_verified} onClick={() => void review('provider', provider.id, 'approved', undefined, provider.version)}>Träger freigeben</button><button type="button" className="secondary-action" disabled={busy} onClick={() => void review('provider', provider.id, 'changes_requested', undefined, provider.version)}>Zur Überarbeitung zurückgeben</button><button type="button" className="secondary-action" disabled={busy} onClick={() => void review('provider', provider.id, 'suspended', undefined, provider.version)}>Träger sperren</button></div>
    </li>)}</ul>
    <h2>Eingereichte Angebote ({reviews.length})</h2><ul className="portal-list">{reviews.map(camp => <li className="portal-card" key={camp.id}><h3>{camp.title}</h3><p>Anbieter: <strong>{camp.club_name}</strong></p><p>{portalDate(camp.starts_at)} – {portalDate(camp.ends_at)} · {camp.min_age}–{camp.max_age} Jahre · {portalPrice(Number(camp.price_eur))}</p><p>{camp.location_text} · {camp.categories?.join(', ')}</p><details><summary>Inhalt und Bilder prüfen</summary><div dangerouslySetInnerHTML={{ __html: safeHtml(camp.description) }} />{camp.confirmation_information && <><h4>Informationen für Bestätigungsmails</h4><p className="preserve-lines">{camp.confirmation_information}</p></>}<ImageGallery title={camp.title} images={camp.image_metadata.map(image => image.image_url)} metadata={camp.image_metadata} /></details><label className="field"><span>Rückmeldung zu {camp.title}</span><textarea maxLength={2000} value={reason[`camp-${camp.id}`] || ''} onChange={event => setReason({ ...reason, [`camp-${camp.id}`]: event.target.value })} /></label><div className="portal-actions"><button type="button" className="primary-action" disabled={busy} onClick={() => void review('camp', camp.id, 'approved', camp.revision_id)}>Angebot freigeben</button><button type="button" className="secondary-action" disabled={busy} onClick={() => void review('camp', camp.id, 'changes_requested', camp.revision_id)}>Zur Überarbeitung zurückgeben</button></div></li>)}</ul>
    <section className="portal-panel"><h2>Jährliche Anbieterübersicht</h2><p>Enthält die Anbieterstammdaten des gewählten Jahres einschließlich inaktiver oder gesperrter Träger. Zahlungen und Umsätze werden noch nicht erfasst. Die Datei ersetzt keine vollständige PStTG-Meldung.</p><div className="portal-actions"><label className="field"><span>Berichtsjahr</span><input type="number" min={2000} max={new Date().getFullYear()} value={year} onChange={event => setYear(Number(event.target.value))} /></label><button className="primary-action" type="button" disabled={busy} onClick={() => void download()}>Anbieter als Excel herunterladen</button></div></section>
    <div className="portal-form-grid"><label className="field"><span>Anmeldungen ab</span><input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label className="field"><span>Anmeldungen bis</span><input type="date" min={from} value={to} onChange={event => setTo(event.target.value)} /></label></div><BookingStatistics rows={statistics} /><MailDeliveryStatus key={reload} />
  </section>;
}
