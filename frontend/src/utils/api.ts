let csrfToken = '';
export const setCsrfToken = (value: string) => { csrfToken = value; };

export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message); this.status = status; this.fields = fields;
  }
}

export async function apiFetch(url: string, init: RequestInit = {}, notifyExpiry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.delete('Authorization');
  if (!['GET', 'HEAD'].includes((init.method || 'GET').toUpperCase())) {
    headers.set('X-Requested-With', 'FerienFreizeitPortal');
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  }
  let response: Response;
  try { response = await fetch(url, { ...init, headers, credentials: 'same-origin' }); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Der Server ist nicht erreichbar. Deine Eingaben bleiben erhalten. Bitte versuche es erneut.', 0);
  }
  if (!response.ok) {
    const data = await response.clone().json().catch(() => null);
    if ((response.status === 401 || data?.code === 'csrf_mismatch') && notifyExpiry && url !== '/api/login') window.dispatchEvent(new Event('session-expired'));
    const files = data?.files?.map((file: { name?: string; error: string }) => `${file.name ? file.name + ': ' : ''}${file.error}`).join(' ');
    throw new ApiError(files || data?.error || data?.message || `Die Anfrage ist fehlgeschlagen (${response.status}).`, response.status, data?.fields || {});
  }
  return response;
}
