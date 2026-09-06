export const editorSections = ['basics', 'schedule', 'location', 'images'] as const;
export type EditorSection = typeof editorSections[number];
export const fieldSection: Record<string, EditorSection> = {
  title: 'basics', categories: 'basics', min_age: 'basics', max_age: 'basics', description: 'basics',
  starts_at: 'schedule', ends_at: 'schedule', price_eur: 'schedule', registration_deadline: 'schedule',
  location_text: 'location', location_lat: 'location', location_lng: 'location', contact_info: 'location',
};
type CampInput = { title?: string; categories?: string[]; description?: string; min_age?: number; max_age?: number; starts_at?: string; ends_at?: string; registration_deadline?: string; price_eur?: number; location_text?: string };
export function publicationIssues(camp: CampInput, contactInfo?: string): Record<string, string> {
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
  return errors;
}
