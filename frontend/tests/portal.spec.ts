import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function login(page: Page, user = 'testverein') {
  await page.goto('/login');
  await page.getByLabel('E-Mail oder Nutzername').fill(user);
  await page.getByLabel(/^Passwort(?:\s+\(erforderlich\))?$/).fill(user);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL(user === 'admin' ? /\/admin$/ : /\/dashboard$/);
}

test.beforeEach(async ({ page }) => {
  await page.route('https://*.tile.openstreetmap.org/**', (route) => route.abort());
});

test('HttpOnly session survives reload and logout invalidates it', async ({ page, context }) => {
  await login(page);
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
  const cookie = (await context.cookies()).find((value) => value.name === 'ffp_session');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Meine Freizeiten' })).toBeVisible();
  await page.getByRole('button', { name: 'Menü öffnen' }).click();
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).some((value) => value.name === 'ffp_session')).toBe(false);
});

test('unfinished draft saves, hidden required fields block publication and focus title', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Freizeit anlegen', exact: true }).first().click();
  await page.getByRole('button', { name: /5\. Bilder/ }).click();
  await page.getByRole('button', { name: 'Veröffentlichen', exact: true }).click();
  await expect(page.getByLabel(/^Titel(?:\s+\(erforderlich\))?$/)).toBeFocused();
  await expect(page.getByRole('alert').filter({ hasText: 'markierten Angaben' })).toBeVisible();
  const title = `Draft ${Date.now()}`;
  await page.getByLabel(/^Titel(?:\s+\(erforderlich\))?$/).fill(title);
  await page.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('Freizeit erfolgreich gespeichert.')).toBeVisible();
});

test('full publishing flow, preview modal and search', async ({ page }) => {
  await login(page);
  const title = `Published ${Date.now()}`;
  await page.getByRole('button', { name: 'Freizeit anlegen', exact: true }).first().click();
  await page.getByLabel(/^Titel(?:\s+\(erforderlich\))?$/).fill(title);
  await page.getByRole('button', { name: 'Kategorien wählen' }).click();
  await page.getByLabel(/^Natur(?:\s+\(erforderlich\))?$/).check();
  await page.getByLabel('Mindestalter').fill('8');
  await page.getByLabel('Höchstalter').fill('16');
  await page.getByRole('textbox', { name: 'Beschreibung' }).fill('Ein Angebot zum Testen der Veröffentlichung.');
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByLabel(/^Beginn(?:\s+\(erforderlich\))?$/).fill('2030-08-01T10:00');
  await page.getByLabel(/^Ende(?:\s+\(erforderlich\))?$/).fill('2030-08-08T12:00');
  await page.getByLabel('Teilnahmebeitrag in €').fill('0');
  await page.getByLabel(/^Anmeldeschluss(?:\s+\(erforderlich\))?$/).fill('2030-07-01T12:00');
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByLabel('Unverbindliche Platzanfragen über das Portal ermöglichen').check();
  await page.getByLabel('Plätze insgesamt').fill('20');
  await page.getByLabel('Bei null freien Plätzen Wartelistenanfragen erlauben').check();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByLabel(/^Ort(?:\s+\(erforderlich\))?$/).fill('Zwickau');
  await page.getByRole('button', { name: 'Vorschau', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Freizeitvorschau' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Veröffentlichen', exact: true }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByLabel('Freizeiten suchen').fill(title);
  await expect(page.locator('.management-item')).toHaveCount(1);
  const campItem = page.locator('.management-item').first();
  await expect(campItem).toContainText('20 von 20 Plätzen frei');
  await campItem.getByLabel('Freie Plätze').fill('0');
  await campItem.getByRole('button', { name: 'Bestand speichern' }).click();
  await expect(campItem).toContainText('0 von 20 Plätzen frei');
  await expect(campItem).toContainText('Ausgebucht');
  await page.getByLabel('Freizeiten suchen').fill('does-not-exist');
  await expect(page.getByRole('heading', { name: 'Keine passenden Freizeiten' })).toBeVisible();
});

test('failed save preserves data and double submit is locked', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Freizeit anlegen', exact: true }).first().click();
  await page.getByLabel(/^Titel(?:\s+\(erforderlich\))?$/).fill('Unsaved work');
  let requests = 0;
  await page.route('**/api/camps', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Test: Speichern fehlgeschlagen.' }) });
  });
  await page.getByRole('button', { name: 'Als Entwurf speichern' }).click();
  await expect(page.getByRole('button', { name: 'Als Entwurf speichern' })).toBeDisabled();
  await expect(page.getByRole('alert').filter({ hasText: 'Test: Speichern fehlgeschlagen.' }).first()).toBeVisible();
  await expect(page.getByLabel(/^Titel(?:\s+\(erforderlich\))?$/)).toHaveValue('Unsaved work');
  expect(requests).toBe(1);
});

test('session expiry allows reauthentication without losing editor input', async ({ page, context }) => {
  await login(page);
  await page.getByRole('button', { name: 'Freizeit anlegen', exact: true }).first().click();
  await page.getByLabel(/^Titel(?:\s+\(erforderlich\))?$/).fill('Keep this draft');
  await context.clearCookies();
  await page.getByRole('button', { name: 'Als Entwurf speichern' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bitte erneut anmelden' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('E-Mail oder Nutzername').fill('testverein');
  await dialog.getByLabel(/^Passwort(?:\s+\(erforderlich\))?$/).fill('testverein');
  await dialog.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel(/^Titel(?:\s+\(erforderlich\))?$/)).toHaveValue('Keep this draft');
});

test('admin filters and resend invitation error are visible', async ({ page }) => {
  await login(page, 'admin');
  await page.getByLabel('Vereine suchen').fill('testverein');
  await expect(page.locator('.club-card')).toHaveCount(1);
  await page.getByLabel('E-Mail').fill(`invite-${Date.now()}@example.test`);
  await page.getByLabel('Name / Verein').fill('Test invitation');
  await page.getByRole('button', { name: 'Einladung senden', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'E-Mail-Versand fehlgeschlagen' })).toBeVisible();
  await page.getByLabel('Vereine suchen').fill('Test invitation');
  await expect(page.getByText('Einladung konnte nicht versendet werden.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Einladung erneut senden' }).first().click();
  await expect(page.getByRole('alert')).toContainText('Versand fehlgeschlagen');
});

test('selected images load before upload and appear in the full preview', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Freizeit anlegen', exact: true }).first().click();
  await page.getByLabel(/^Titel(?:\s+\(erforderlich\))?$/).fill('Image preview test');
  await page.getByRole('button', { name: /5\. Bilder/ }).click();
  await page.getByLabel('Bilder hinzufügen').setInputFiles({
    name: 'preview.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByLabel('Bildbeschreibung für preview.png').fill('Ein Testbild für die Vorschau');
  await expect(page.getByAltText('Vorschau: preview.png')).toBeVisible();
  await expect.poll(() => page.getByAltText('Vorschau: preview.png').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  await page.getByRole('button', { name: 'Vorschau', exact: true }).click();
  const preview = page.getByRole('dialog').getByAltText('Ein Testbild für die Vorschau');
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
});

test('public search retains filters after opening details and displays network errors', async ({ page }) => {
  await page.goto('/?age=10&types=Natur');
  await expect(page.getByRole('spinbutton', { name: 'Alter', exact: true })).toHaveValue('10');
  await expect(page.locator('.camp-body').first()).toBeVisible();
  await page.locator('.camp-body').first().click();
  await page.getByRole('link', { name: 'Zur Suche', exact: true }).click();
  await expect(page).toHaveURL(/age=10&types=Natur/);
  await expect(page.getByRole('spinbutton', { name: 'Alter', exact: true })).toHaveValue('10');
  await page.route('**/api/camps?**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Suche vorübergehend nicht verfügbar.' }) }));
  await page.getByRole('spinbutton', { name: 'Alter', exact: true }).fill('11');
  await expect(page.getByRole('alert')).toContainText('Suche vorübergehend nicht verfügbar.');
  await expect(page.getByRole('heading', { name: 'Keine passenden Freizeiten gefunden' })).toHaveCount(0);
  await page.unroute('**/api/camps?**');
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('family can send a place request for multiple participants without seeing exact capacity', async ({ page }) => {
  await page.route('**/api/camps/999', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 999,
      title: 'Testfreizeit mit Plätzen',
      club_name: 'Testverein',
      min_age: 8,
      max_age: 16,
      description: '<p>Eine Freizeit zum Testen.</p>',
      type: 'Natur',
      categories: ['Natur'],
      location_text: 'Zwickau',
      location_lat: 50.7,
      location_lng: 12.5,
      starts_at: '2030-08-01 10:00:00',
      ends_at: '2030-08-08 12:00:00',
      registration_deadline: '2030-07-01 12:00:00',
      price_eur: 0,
      status: 'published',
      contact_info: 'kontakt@example.test',
      allocation_method: 'request',
      request_opens_at: null,
      availability_state: 'few_places',
    }),
  }));
  let requestBody: Record<string, unknown> | undefined;
  let submissionAttempts = 0;
  await page.route('**/api/camps/999/place-requests', async (route) => {
    requestBody = route.request().postDataJSON();
    submissionAttempts++;
    if (submissionAttempts === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Mailversand vorübergehend fehlgeschlagen.' }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Anfrage übermittelt.', request_id: 'test-request-id', request_kind: 'request', confirmation_email_sent: false }),
    });
  });

  await page.goto('/freizeiten/999');
  await expect(page.getByText('Nur noch wenige Plätze')).toBeVisible();
  await expect(page.getByText(/von 20 Plätzen/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Platz anfragen', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Platz anfragen' });
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  await dialog.getByLabel(/^Name(?:\s+\(erforderlich\))?$/).fill('Maria Muster');
  await dialog.getByLabel('E-Mail-Adresse').fill('maria@example.test');
  await dialog.getByLabel('Telefonnummer').fill('+49 123 456');
  await dialog.getByLabel('Vorname').fill('Lina');
  await dialog.getByLabel('Nachname').fill('Muster');
  await dialog.getByLabel('Geburtsdatum').fill('2020-05-10');
  await dialog.getByRole('button', { name: 'Weitere Person hinzufügen' }).click();
  await dialog.getByLabel('Vorname').nth(1).fill('Tom');
  await dialog.getByLabel('Nachname').nth(1).fill('Muster');
  await dialog.getByLabel('Geburtsdatum').nth(1).fill('2018-04-03');
  await dialog.getByLabel(/Datenschutzhinweise/).check();
  await dialog.getByRole('button', { name: 'Platz anfragen', exact: true }).click();

  await expect(dialog.getByRole('alert')).toContainText('Mailversand vorübergehend fehlgeschlagen.');
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  await expect(dialog.getByLabel(/^Name(?:\s+\(erforderlich\))?$/)).toHaveValue('Maria Muster');
  await dialog.getByRole('button', { name: 'Platz anfragen', exact: true }).click();

  await expect(dialog.getByText('test-request-id')).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('Bestätigungsmail');
  expect((requestBody?.participants as unknown[]).length).toBe(2);
  expect(submissionAttempts).toBe(2);
});

test('mobile editor and dialogs stay within viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await page.getByRole('button', { name: 'Freizeit anlegen', exact: true }).first().click();
  await page.getByLabel(/^Titel(?:\s+\(erforderlich\))?$/).fill('Mobile test');
  await page.getByRole('button', { name: 'Vorschau', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Freizeitvorschau' });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-preview.png' });
  await page.keyboard.press('Escape');
});

test('image descriptions persist on upload and editing without breaking the image URL API', async ({ page }) => {
  await login(page);
  const title = `Bildpflege ${Date.now()}`;
  const png = await page.getByRole('heading', { name: 'Meine Freizeiten', exact: true }).screenshot();
  await page.getByRole('button', { name: 'Freizeit anlegen', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Titel', exact: true }).fill(title);
  await page.getByRole('button', { name: /5\. Bilder/ }).click();
  await page.getByLabel('Bilder hinzufügen').setInputFiles({ name: 'bildpflege.png', mimeType: 'image/png', buffer: png });
  await page.getByLabel('Bildbeschreibung für bildpflege.png').fill('Screenshot der Überschrift Meine Freizeiten');
  await page.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByLabel('Freizeiten suchen').fill(title);
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.getByRole('button', { name: /5\. Bilder/ }).click();
  await expect(page.getByLabel('Bildbeschreibung 1')).toHaveValue('Screenshot der Überschrift Meine Freizeiten');
  await page.getByLabel('Bildbeschreibung 1').fill('Geänderte Beschreibung der Testüberschrift');
  await page.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click();
  await expect(page.locator('.camp-editor')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.getByRole('button', { name: /5\. Bilder/ }).click();
  await expect(page.getByLabel('Bildbeschreibung 1')).toHaveValue('Geänderte Beschreibung der Testüberschrift');
  await page.getByRole('button', { name: 'Vorschau', exact: true }).click();
  await expect(page.getByRole('dialog').getByAltText('Geänderte Beschreibung der Testüberschrift')).toBeVisible();
});
