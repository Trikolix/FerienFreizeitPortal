export const editorSections = ['basics', 'schedule', 'places', 'location', 'images'] as const;
export type EditorSection = typeof editorSections[number];
export const fieldSection: Record<string, EditorSection> = {
  images: 'images',
  title: 'basics', categories: 'basics', min_age: 'basics', max_age: 'basics', description: 'basics',
  starts_at: 'schedule', ends_at: 'schedule', price_eur: 'schedule', registration_deadline: 'schedule',
  place_requests_enabled: 'places', allocation_method: 'places', capacity_total: 'places', places_remaining: 'places',
  request_opens_at: 'places', waitlist_enabled: 'places', place_request_email: 'places',
  location_text: 'location', location_lat: 'location', location_lng: 'location', contact_info: 'location',
};
type CampInput = { title?: string; categories?: string[]; description?: string; min_age?: number; max_age?: number; starts_at?: string; ends_at?: string; registration_deadline?: string; price_eur?: number; location_text?: string; place_requests_enabled?: boolean; allocation_method?: 'request' | 'lottery'; capacity_total?: number; places_remaining?: number; request_opens_at?: string; place_request_email?: string };
export function publicationIssues(camp: CampInput, contactInfo?: string, accountEmail?: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!camp.title?.trim()) errors.title = 'Bitte einen Titel eingeben.';
  if (!camp.categories?.length) errors.categories = 'Bitte mindestens eine Kategorie wählen.';
  if (camp.min_age == null) errors.min_age = 'Bitte das Mindestalter angeben.';
  if (camp.max_age == null) errors.max_age = 'Bitte das Höchstalter angeben.';
  if (camp.min_age != null && camp.max_age != null && camp.max_age < camp.min_age) errors.max_age = 'Das Höchstalter muss mindestens dem Mindestalter entsprechen.';
  if (!camp.description?.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()) errors.description = 'Bitte eine Beschreibung ergänzen.';
  if (!camp.starts_at) errors.starts_at = 'Bitte den Beginn angeben.';
  if (!camp.ends_at) errors.ends_at = 'Bitte das Ende angeben.';
  if (!camp.registration_deadline) errors.registration_deadline = 'Bitte den Anmeldeschluss angeben.';
  if (camp.price_eur == null) errors.price_eur = 'Bitte den Teilnahmebeitrag angeben (0 für kostenlos).';
  if (!camp.location_text?.trim()) errors.location_text = 'Bitte einen Ort angeben.';
  if (!contactInfo?.trim()) errors.contact_info = 'Bitte öffentliche Kontaktinformationen in den Kontoeinstellungen ergänzen.';
  if (camp.place_requests_enabled) {
    if (camp.capacity_total == null || camp.capacity_total < 1 || camp.capacity_total > 10000) errors.capacity_total = 'Bitte eine Gesamtkapazität zwischen 1 und 10.000 angeben.';
    if (camp.places_remaining == null || camp.places_remaining < 0 || (camp.capacity_total != null && camp.places_remaining > camp.capacity_total)) errors.places_remaining = 'Bitte gültige freie Plätze innerhalb der Gesamtkapazität angeben.';
    if (!camp.allocation_method) errors.allocation_method = 'Bitte ein Vergabeverfahren wählen.';
    if (camp.allocation_method === 'lottery' && !camp.request_opens_at) errors.request_opens_at = 'Bitte den Beginn des Bewerbungszeitraums angeben.';
    const recipient = camp.place_request_email?.trim() || accountEmail?.trim();
    if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient)) errors.place_request_email = 'Bitte eine gültige Anfrageadresse oder Konto-E-Mail hinterlegen.';
  }
  return errors;
}
