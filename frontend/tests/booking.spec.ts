import { resetPortalTestLimits } from './portalSupport';
import { test, expect, request as requestFactory } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';

const origin = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5174';
const baseHeaders = { Origin: origin, 'X-Requested-With': 'FerienFreizeitPortal' };
function fixture(...args: string[]): string {
  return execFileSync('php', [resolve('../backend/tests/portal-fixtures.php'), ...args], {
    env: { ...process.env, APP_ENV: 'development', DB_CONNECTION: 'sqlite', DB_SQLITE_PATH: process.env.PLAYWRIGHT_DB_SQLITE_PATH || '/tmp/ffp-portal-browser.sqlite', APP_BASE_URL: origin, PORTAL_MAIL_INLINE: '0', SEED_DEMO_DATA: '1' }, encoding: 'utf8',
  }).trim();
}
function mailToken(purpose: string, email: string): string { return fixture('token', purpose, email); }
async function apiLogin(context: APIRequestContext, username: string) {
  const response = await context.post('/api/login', { data: { username, password: username }, headers: baseHeaders });
  expect(response.ok()).toBeTruthy(); return { ...baseHeaders, 'X-CSRF-Token': (await response.json()).csrf_token };
}
async function offer(provider: APIRequestContext, admin: APIRequestContext, capacity = 2) {
  const providerHeaders = await apiLogin(provider, 'testverein'); const adminHeaders = await apiLogin(admin, 'admin');
  const title = `Buchungstest ${Date.now()}`;
  const create = await provider.post('/api/camps', { headers: providerHeaders, data: { title, min_age: 8, max_age: 16, description: '<p>Eine gemeinsame Ferienwoche.</p>', categories: ['Natur'], location_text: 'Zwickau', starts_at: '2035-08-01T10:00', ends_at: '2035-08-08T12:00', registration_deadline: '2035-07-01T12:00', price_eur: 25, status: 'draft', place_requests_enabled: true, allocation_method: 'request', capacity_total: capacity, places_remaining: capacity, waitlist_enabled: true } });
  expect(create.ok()).toBeTruthy(); const id = (await create.json()).id;
  const submitted = await provider.post(`/api/camps/${id}/submit`, { headers: providerHeaders }); expect(submitted.ok()).toBeTruthy();
  const review = await admin.post(`/api/admin/camps/${id}/review`, { headers: adminHeaders, data: { decision: 'approved', revision_id: (await submitted.json()).revision_id } }); expect(review.ok()).toBeTruthy();
  return { id, title, providerHeaders, adminHeaders };
}
async function beginFamily(page: Page, id: number, email: string) {
  await page.goto(`/freizeiten/${id}`); await expect(page.getByText(/Anbieter dieser Freizeit ist/)).toHaveCount(0);
  await page.getByRole('link', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/anmelden/${id}$`));
  await expect(page.getByText(/Anbieter dieser Freizeit ist/)).toBeVisible();
  await expect(page.getByText('Schritt 1 von 2')).toBeVisible();
  await page.getByLabel('Deine E-Mail-Adresse').fill(email);
  await page.getByLabel('Name der Kontaktperson').fill('Maria Muster'); await page.getByLabel('Telefonnummer').fill('+49 12345678');
  await page.getByLabel('Vorname', { exact: false }).fill('Lina'); await page.getByLabel('Nachname', { exact: false }).fill(email.split('@')[0]); await page.getByLabel('Geburtsdatum').fill('2023-05-10');
}
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
}
test.beforeEach(async ({ page }) => {
  resetPortalTestLimits(); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.route('https://*.tile.openstreetmap.org/**', route => route.abort()); });

test('mobile family booking, provider confirmation, status and immutable offer revision', async ({ page, request }) => {
  test.setTimeout(90000); const admin = await requestFactory.newContext({ baseURL: origin });
  try {
    const { id, title, providerHeaders, adminHeaders } = await offer(request, admin);
    await page.setViewportSize({ width: 375, height: 812 }); const email = `mobile-${Date.now()}@example.test`;
    await beginFamily(page, id, email); await accessible(page);
    await page.getByRole('button', { name: 'Weiter zur Zusammenfassung' }).click();
    await expect(page.getByText('Schritt 2 von 2')).toBeVisible(); await expect(page.getByText(/Anbieter dieser Freizeit ist/)).toBeVisible(); await accessible(page);
    await page.getByRole('checkbox', { name: /Ich habe die/ }).check(); await page.getByRole('button', { name: 'Anmeldung an den Anbieter senden' }).click();
    await expect(page.getByRole('status')).toContainText('Reserviert');
    const bookings = await (await request.get(`/api/bookings?camp_id=${id}`)).json(); expect(bookings.items).toHaveLength(1); const booking = bookings.items[0];
    const confirm = await request.post(`/api/bookings/${booking.id}/actions`, { headers: providerHeaders, data: { action: 'confirm' } }); expect(confirm.ok()).toBeTruthy();
    await page.goto(`/buchung#token=${mailToken('booking_status', email)}`); await expect(page.getByText('Bestätigt', { exact: true }).first()).toBeVisible(); await accessible(page);
    const current = await (await request.get(`/api/camps/${id}`)).json();
    const edit = await request.put(`/api/camps/${id}`, { headers: providerHeaders, data: { ...current, title: `${title} geändert`, price_eur: 99 } }); expect(edit.ok()).toBeTruthy();
    const beforeReview = await (await page.request.get(`/api/camps/${id}?public=1`)).json(); expect(beforeReview.title).toBe(title);
    const submitted = await request.post(`/api/camps/${id}/submit`, { headers: providerHeaders }); expect(submitted.ok()).toBeTruthy();
    const approved = await admin.post(`/api/admin/camps/${id}/review`, { headers: adminHeaders, data: { decision: 'approved', revision_id: (await submitted.json()).revision_id } }); expect(approved.ok()).toBeTruthy();
    await page.reload(); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible(); await expect(page.getByText('Teilnahmebeitrag laut Anmeldung: 25,00 €')).toBeVisible();
  } finally { await admin.dispose(); }
});

test('group waitlist requires consent and provider promotes the whole group', async ({ page, request }) => {
  test.setTimeout(90000); const admin = await requestFactory.newContext({ baseURL: origin });
  try {
    const { id, providerHeaders } = await offer(request, admin, 2);
    expect((await request.put(`/api/camps/${id}/availability`, { headers: providerHeaders, data: { places_remaining: 1 } })).ok()).toBeTruthy();
    const email = `group-${Date.now()}@example.test`; await beginFamily(page, id, email);
    await page.getByRole('button', { name: 'Weitere Person hinzufügen' }).click(); const second = page.getByRole('group', { name: 'Person 2', exact: true });
    await second.getByLabel('Vorname').fill('Max'); await second.getByLabel('Nachname').fill('Gruppe'); await second.getByLabel('Geburtsdatum').fill('2022-02-10');
    await page.getByRole('button', { name: 'Weiter zur Zusammenfassung' }).click(); await page.getByRole('checkbox', { name: /Ich habe die/ }).check();
    await page.getByRole('button', { name: 'Anmeldung an den Anbieter senden' }).click(); await expect(page.getByRole('alert')).toContainText('Wartelistenanmeldung');
    await page.getByRole('checkbox', { name: /Falls nicht genügend Plätze/ }).check(); await page.getByRole('button', { name: 'Anmeldung an den Anbieter senden' }).click();
    await expect(page.getByRole('status')).toContainText('Warteliste');
    const { items } = await (await request.get(`/api/bookings?camp_id=${id}`)).json(); expect(items[0].participant_count).toBe(2);
    expect((await request.post(`/api/bookings/${items[0].id}/actions`, { headers: providerHeaders, data: { action: 'promote' } })).status()).toBe(409);
    expect((await request.put(`/api/camps/${id}/availability`, { headers: providerHeaders, data: { places_remaining: 2 } })).ok()).toBeTruthy();
    expect((await request.post(`/api/bookings/${items[0].id}/actions`, { headers: providerHeaders, data: { action: 'promote' } })).ok()).toBeTruthy();
    expect((await request.post(`/api/bookings/${items[0].id}/actions`, { headers: providerHeaders, data: { action: 'confirm' } })).ok()).toBeTruthy();
    await page.goto(`/buchung#token=${mailToken('booking_status', email)}`); await expect(page.getByText('Bestätigt', { exact: true }).first()).toBeVisible();
  } finally { await admin.dispose(); }
});

test('organisation registers, verifies email, supplies missing-number reasons and receives approval', async ({ page, request }) => {
  test.setTimeout(90000); const email = `organisation-${Date.now()}@example.test`; const password = 'Organisation-Test-123'; const name = `Neuer Träger ${Date.now()}`;
  await page.goto('/registrieren'); await page.getByLabel('E-Mail-Adresse des verantwortlichen Kontos').fill(email); await page.getByLabel(/^Passwort/).fill(password); await page.getByRole('button', { name: 'Bestätigungslink anfordern' }).click(); await expect(page.getByRole('status')).toContainText('Bestätigungslink');
  await page.goto(`/registrierung-bestaetigen#token=${mailToken('provider_verify', email)}`); await expect(page.getByRole('status')).toContainText(/E-Mail (bereits )?bestätigt/);
  await page.getByRole('link', { name: 'Anmelden und Stammdaten ergänzen' }).click(); await page.getByLabel('E-Mail oder Nutzername').fill(email); await page.getByLabel(/^Passwort/).fill(password); await page.getByRole('button', { name: 'Anmelden', exact: true }).click(); await expect(page).toHaveURL(/traegerprofil$/);
  await page.getByLabel('Öffentlicher Anbietername').fill(name); await page.getByLabel('Öffentliche Kontaktinformationen').fill('Kontakt zum Verein'); await page.getByLabel('Eingetragener Name').fill(`${name} e. V.`); await page.getByLabel('Rechtsform').fill('Verein'); await page.getByLabel('Straße und Hausnummer').fill('Testweg 1'); await page.getByLabel('Postleitzahl').fill('08056'); await page.getByLabel('Ort', { exact: true }).fill('Zwickau'); await page.getByLabel('Begründung, falls keine Registerangabe vorhanden').fill('Nicht im Handelsregister eingetragen'); await page.getByLabel('Begründung, falls keine Steuerkennung vorhanden').fill('Noch keine Kennung erteilt');
  await page.getByRole('checkbox', { name: 'DE', exact: true }).check();
  await page.getByRole('button', { name: 'Speichern und zur Prüfung einreichen' }).click(); await expect(page.getByRole('status')).toContainText('zur Prüfung eingereicht'); await accessible(page);
  const headers = await apiLogin(request, 'admin'); const providers = await (await request.get('/api/admin/providers')).json(); const provider = providers.find((entry: { email: string }) => entry.email === email);
  expect((await request.post(`/api/admin/providers/${provider.id}/review`, { headers, data: { decision: 'approved', profile_version: provider.version } })).ok()).toBeTruthy();
  await page.reload(); await expect(page.getByText('Freigegeben', { exact: true }).first()).toBeVisible();
});

test('administrator downloads real provider workbook and views anonymous statistics', async ({ page }) => {
  test.setTimeout(60000); await page.goto('/login'); await page.getByLabel('E-Mail oder Nutzername').fill('admin'); await page.getByLabel(/^Passwort/).fill('admin'); await page.getByRole('button', { name: 'Anmelden', exact: true }).click(); await expect(page).toHaveURL(/admin$/);
  await page.goto('/pruefung'); await page.setViewportSize({ width: 768, height: 1024 }); await expect(page.getByRole('heading', { name: 'Trägerprüfung und Angebotsfreigabe' })).toBeVisible(); await accessible(page);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Anbieter als Excel herunterladen' }).click(); expect((await download).suggestedFilename()).toMatch(/^Anbieter-\d{4}\.xlsx$/);
});


test('past offers block direct forms and submissions from an already open form', async ({ page, request }) => {
  test.setTimeout(90000); const admin = await requestFactory.newContext({ baseURL: origin });
  try {
    const { id } = await offer(request, admin);
    await beginFamily(page, id, `past-${Date.now()}@example.test`);
    fixture('past-camp', String(id));
    await page.getByRole('button', { name: 'Weiter zur Zusammenfassung' }).click();
    await page.getByRole('checkbox', { name: /Ich habe die/ }).check();
    await page.getByRole('button', { name: 'Anmeldung an den Anbieter senden' }).click();
    await expect(page.getByRole('alert')).toContainText('bereits begonnen oder ist beendet');
    expect((await (await request.get(`/api/bookings?camp_id=${id}`)).json()).items).toHaveLength(0);
    const form = await page.request.post(`/api/camps/${id}/booking-form`, { headers: baseHeaders, data: {} });
    expect(form.status()).toBe(409);
    await page.goto(`/freizeiten/${id}`);
    await expect(page.getByRole('link', { name: 'Anmelden', exact: true })).toHaveCount(0);
    await page.goto(`/anmelden/${id}`);
    await expect(page.getByRole('alert')).toContainText('bereits begonnen oder ist beendet');
    await expect(page.getByLabel('Deine E-Mail-Adresse')).toHaveCount(0);
  } finally { await admin.dispose(); }
});

test('provider saves per-offer mail information and both recipients receive the registration summary', async ({ page, request }) => {
  test.setTimeout(90000); const admin = await requestFactory.newContext({ baseURL: origin });
  try {
    const { id, title, adminHeaders } = await offer(request, admin);
    await page.goto('/login'); await page.getByLabel('E-Mail oder Nutzername').fill('testverein');
    await page.getByLabel(/^Passwort/).fill('testverein'); await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).getByRole('button', { name: 'Bearbeiten', exact: true }).click();
    await page.getByRole('button', { name: /3\. Plätze/ }).click();
    const information = 'Treffpunkt: Vereinshaus um 9 Uhr.\nBitte Regenjacke mitbringen.';
    await page.getByLabel('Wichtige Informationen für Bestätigungsmails (optional)').fill(information);
    await page.getByRole('button', { name: 'Änderungen zur Prüfung einreichen', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'zur Prüfung eingereicht' })).toBeVisible();
    const updated = await (await request.get(`/api/camps/${id}`)).json();
    expect(updated.confirmation_information).toBe(information); expect(updated.review_status).toBe('submitted');
    expect((await admin.post(`/api/admin/camps/${id}/review`, { headers: adminHeaders, data: { decision: 'approved', revision_id: updated.revision_id } })).ok()).toBeTruthy();
    const email = `summary-${Date.now()}@example.test`; await beginFamily(page, id, email);
    await page.getByRole('button', { name: 'Weiter zur Zusammenfassung' }).click();
    await page.getByRole('checkbox', { name: /Ich habe die/ }).check();
    await page.getByRole('button', { name: 'Anmeldung an den Anbieter senden' }).click();
    await expect(page.getByRole('status')).toContainText('Reserviert');
    for (const [kind, recipient] of [['booking_status', email], ['provider_booking', 'testverein@example.test']]) {
      const mail = JSON.parse(fixture('mail', kind, recipient));
      for (const text of ['Zusammenfassung der Anmeldung', 'Maria Muster', email, 'Vereinshaus um 9 Uhr', 'Bitte Regenjacke mitbringen.', '25,00 €']) expect(mail.html).toContain(text);
    }
  } finally { await admin.dispose(); }
});
