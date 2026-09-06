import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function login(page: Page, user = 'testverein') {
  await page.goto('/login');
  await page.getByLabel('E-Mail oder Nutzername').fill(user);
  await page.getByLabel('Passwort', { exact: true }).fill(user);
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
  await page.getByRole('button', { name: /4\. Bilder/ }).click();
  await page.getByRole('button', { name: 'Veröffentlichen', exact: true }).click();
  await expect(page.getByLabel('Titel', { exact: true })).toBeFocused();
  await expect(page.getByRole('alert').filter({ hasText: 'markierten Angaben' })).toBeVisible();
  const title = `Draft ${Date.now()}`;
  await page.getByLabel('Titel', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Als Entwurf speichern', exact: true }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('Freizeit erfolgreich gespeichert.')).toBeVisible();
});

test('full publishing flow, preview modal and search', async ({ page }) => {
  await login(page);
  const title = `Published ${Date.now()}`;
  await page.getByRole('button', { name: 'Freizeit anlegen', exact: true }).first().click();
  await page.getByLabel('Titel', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Kategorien wählen' }).click();
  await page.getByLabel('Natur', { exact: true }).check();
  await page.getByLabel('Mindestalter').fill('8');
  await page.getByLabel('Höchstalter').fill('16');
  await page.getByRole('textbox', { name: 'Beschreibung' }).fill('Ein Angebot zum Testen der Veröffentlichung.');
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByLabel('Beginn', { exact: true }).fill('2030-08-01T10:00');
  await page.getByLabel('Ende', { exact: true }).fill('2030-08-08T12:00');
  await page.getByLabel('Teilnahmebeitrag in €').fill('0');
  await page.getByLabel('Anmeldeschluss', { exact: true }).fill('2030-07-01T12:00');
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByLabel('Ort', { exact: true }).fill('Zwickau');
  await page.getByRole('button', { name: 'Vorschau', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Freizeitvorschau' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Veröffentlichen', exact: true }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByLabel('Freizeiten suchen').fill(title);
  await expect(page.locator('.management-item')).toHaveCount(1);
  await page.getByLabel('Freizeiten suchen').fill('does-not-exist');
  await expect(page.getByRole('heading', { name: 'Keine passenden Freizeiten' })).toBeVisible();
});

test('failed save preserves data and double submit is locked', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Freizeit anlegen', exact: true }).first().click();
  await page.getByLabel('Titel', { exact: true }).fill('Unsaved work');
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
  await expect(page.getByLabel('Titel', { exact: true })).toHaveValue('Unsaved work');
  expect(requests).toBe(1);
});

test('session expiry allows reauthentication without losing editor input', async ({ page, context }) => {
  await login(page);
  await page.getByRole('button', { name: 'Freizeit anlegen', exact: true }).first().click();
  await page.getByLabel('Titel', { exact: true }).fill('Keep this draft');
  await context.clearCookies();
  await page.getByRole('button', { name: 'Als Entwurf speichern' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bitte erneut anmelden' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('E-Mail oder Nutzername').fill('testverein');
  await dialog.getByLabel('Passwort', { exact: true }).fill('testverein');
  await dialog.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Titel', { exact: true })).toHaveValue('Keep this draft');
});

test('admin filters and resend invitation error are visible', async ({ page }) => {
  await login(page, 'admin');
  await page.getByLabel('Vereine suchen').fill('testverein');
  await expect(page.locator('.club-card')).toHaveCount(1);
  await page.getByLabel('E-Mail', { exact: true }).fill(`invite-${Date.now()}@example.test`);
  await page.getByLabel('Name / Verein', { exact: true }).fill('Test invitation');
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
  await page.getByLabel('Titel', { exact: true }).fill('Image preview test');
  await page.getByRole('button', { name: /4\. Bilder/ }).click();
  await page.getByLabel('Bilder hinzufügen').setInputFiles({
    name: 'preview.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.getByAltText('Vorschau: preview.png')).toBeVisible();
  await expect.poll(() => page.getByAltText('Vorschau: preview.png').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  await page.getByRole('button', { name: 'Vorschau', exact: true }).click();
  const preview = page.getByRole('dialog').getByAltText('Image preview test - Bild 1');
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

test('mobile editor and dialogs stay within viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page);
  await page.getByRole('button', { name: 'Freizeit anlegen', exact: true }).first().click();
  await page.getByLabel('Titel', { exact: true }).fill('Mobile test');
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
