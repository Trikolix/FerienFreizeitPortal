import { apiFetch } from './api';

export interface PublicProvider { id: number; name: string; contact_info: string; public_email: string; website: string; links: { label: string; url: string }[] }
export interface ProviderProfile {
  public_name: string; legal_name: string; legal_form: string; street: string; postal_code: string; city: string; country: string;
  contact_info: string; public_email: string; website: string; vat_id: string; register_type: string; register_number: string;
  missing_register_reason: string; missing_tax_reason: string; financial_account: string; account_holder: string; account_holder_details: string;
  links: { label: string; url: string }[]; tax_ids: { country: string; number: string }[];
  establishments: { country: string; address: string }[]; residence_countries: string[];
}
export interface ProviderRecord { id: number; status: string; version: string; email_verified: boolean; profile: ProviderProfile; review_reason?: string; email?: string; history: { action: string; status: string; actor_id?: number; reason?: string; created_at: string }[] }
export const emptyProfile: ProviderProfile = {
  public_name: '', legal_name: '', legal_form: '', street: '', postal_code: '', city: '', country: 'DE', contact_info: '', public_email: '', website: '', vat_id: '', register_type: '', register_number: '', missing_register_reason: '', missing_tax_reason: '', financial_account: '', account_holder: '', account_holder_details: '', links: [], tax_ids: [], establishments: [], residence_countries: ['DE'],
};
export const euCountries = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ');
export const providerStatus: Record<string, string> = { draft: 'In Bearbeitung', submitted: 'Zur Prüfung eingereicht', approved: 'Freigegeben', changes_requested: 'Überarbeitung erforderlich', suspended: 'Gesperrt' };
export const bookingStatus: Record<string, string> = { reserved: 'Reserviert', waitlist: 'Warteliste', confirmed: 'Bestätigt', rejected: 'Abgelehnt', cancelled: 'Storniert' };
export async function portalApi<T>(path: string, data?: unknown, method?: string): Promise<T> {
  const response = await apiFetch(path, data === undefined ? {} : { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  return response.json() as Promise<T>;
}
export function fragmentToken(): string { return new URLSearchParams(window.location.hash.slice(1)).get('token') || ''; }
export function portalDate(value: string): string { return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value.replace(' ', 'T'))); }
export function portalPrice(value: number): string { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value); }
