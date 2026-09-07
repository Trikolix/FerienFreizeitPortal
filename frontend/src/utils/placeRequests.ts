export type AvailabilityState =
  | 'available'
  | 'few_places'
  | 'waitlist'
  | 'sold_out'
  | 'application_open'
  | 'not_open'
  | 'closed'
  | 'contact_only';

export interface PlaceRequestCampFields {
  place_requests_enabled?: boolean;
  allocation_method?: 'request' | 'lottery';
  request_opens_at?: string | null;
  availability_state?: AvailabilityState;
}

const formatShortDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export function availabilityLabel(camp: PlaceRequestCampFields): string | null {
  switch (camp.availability_state) {
    case 'available': return 'Plätze verfügbar';
    case 'few_places': return 'Nur noch wenige Plätze';
    case 'waitlist': return 'Warteliste möglich';
    case 'sold_out': return 'Ausgebucht';
    case 'application_open': return 'Bewerbung möglich';
    case 'not_open': return `${camp.allocation_method === 'lottery' ? 'Bewerbung' : 'Anfragen'} ab ${formatShortDate(camp.request_opens_at)}`;
    case 'closed': return camp.allocation_method === 'lottery' ? 'Bewerbungsfrist beendet' : 'Anfragefrist beendet';
    default: return null;
  }
}

export function availabilityTone(state?: AvailabilityState): string {
  if (state === 'available' || state === 'application_open') return 'is-live';
  if (state === 'few_places' || state === 'waitlist' || state === 'not_open') return 'is-warning';
  return 'is-muted';
}

export function placeRequestActionLabel(state?: AvailabilityState): string | null {
  if (state === 'available' || state === 'few_places') return 'Platz anfragen';
  if (state === 'waitlist') return 'Für Warteliste anfragen';
  if (state === 'application_open') return 'Für einen Platz bewerben';
  return null;
}

export function previewAvailabilityState(camp: PlaceRequestCampFields & {
  status?: string;
  capacity_total?: number;
  places_remaining?: number;
  registration_deadline?: string;
  waitlist_enabled?: boolean;
}): AvailabilityState {
  if (!camp.place_requests_enabled) return camp.status === 'fully_booked' ? 'sold_out' : 'contact_only';
  if (camp.capacity_total == null || camp.places_remaining == null) return 'contact_only';
  const now = Date.now();
  const opens = camp.request_opens_at ? new Date(camp.request_opens_at.replace(' ', 'T')).getTime() : null;
  const deadline = camp.registration_deadline ? new Date(camp.registration_deadline.replace(' ', 'T')).getTime() : null;
  if (opens && now < opens) return 'not_open';
  if (deadline && now >= deadline) return 'closed';
  if (camp.allocation_method === 'lottery') return 'application_open';
  if (camp.places_remaining >= 4) return 'available';
  if (camp.places_remaining >= 1) return 'few_places';
  return camp.waitlist_enabled ? 'waitlist' : 'sold_out';
}
