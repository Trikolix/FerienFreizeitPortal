import { create } from 'zustand';
import { apiFetch, setCsrfToken, ApiError } from '../utils/api';

interface User {
  id: number; email: string; username: string;
  role: 'master_admin' | 'admin' | 'user';
  display_name: string; club_name?: string; contact_info?: string;
}
interface AuthState {
  user: User | null; csrfToken: string | null; initialized: boolean; error: string;
  initialize: () => Promise<void>;
  login: (user: User, csrfToken: string) => void;
  updateUser: (user: User) => void;
  logout: () => Promise<void>;
}
// Remove legacy bearer credentials; the new session cookie is not readable by JS.
try {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
} catch { /* Cookie-based authentication also works when localStorage is blocked. */ }
let initialization: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null, csrfToken: null, initialized: false, error: '',
  initialize: () => {
    if (!initialization) initialization = (async () => {
      try {
        const response = await apiFetch('/api/me', {}, false);
        const { csrf_token, ...user } = await response.json();
        setCsrfToken(csrf_token);
        set({ user, csrfToken: csrf_token, error: '' });
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) set({ error: error instanceof Error ? error.message : 'Anmeldung konnte nicht geprüft werden.' });
      } finally {
        set({ initialized: true });
        initialization = null;
      }
    })();
    return initialization;
  },
  login: (user, csrfToken) => {
    setCsrfToken(csrfToken);
    set({ user, csrfToken, initialized: true, error: '' });
  },
  updateUser: (user) => set({ user }),
  logout: async () => {
    await apiFetch('/api/logout', { method: 'POST' }, false);
    setCsrfToken('');
    set({ user: null, csrfToken: null, error: '' });
  },
}));
