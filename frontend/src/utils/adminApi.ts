import { apiFetch } from './api';

export interface HolidayRecord {
  id: number;
  name: string;
  starts_at: string;
  ends_at: string;
}

export interface ClubUser {
  id: number;
  email: string;
  username: string;
  role: 'master_admin' | 'admin' | 'user';
  display_name: string;
  club_name: string;
  contact_info: string;
  is_active: number;
  camp_count?: number;
  delivery_status?: 'sent' | 'failed' | null;
  sent_at?: string;
}

export async function parseJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function fetchJsonArray<T>(url: string): Promise<T[]> {
  const response = await apiFetch(url);
  const data = await parseJson(response);
  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }
  if (!Array.isArray(data)) {
    throw new Error('Unerwartete Antwort vom Server');
  }
  return data;
}
