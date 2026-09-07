import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, message: node.failureSummary })) }))).toEqual([]);
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
}
async function login(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('E-Mail oder Nutzername').fill(username);
  await page.getByLabel(/^Passwort(?:\s+\(erforderlich\))?$/).fill(username);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL(username === 'admin' ? /\/admin$/ : /\/dashboard$/);
}
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://*.tile.openstreetmap.org/**', route => route.abort());
});

test('public page types pass accessibility and responsive checks', async ({ page }) => {
  test.setTimeout(180000);
  for (const width of [320, 390, 768, 1280, 1536]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/freizeiten/3', '/login', '/passwort-vergessen', '/passwort-setzen', '/kontakt', '/impressum', '/datenschutz', '/barrierefreiheit', '/unbekannte-seite']) {
      await page.goto(route);
      await expect(page.locator('main h1')).toHaveCount(1);
      await accessible(page);
      await fits(page);
      if (route === '/' && [390, 1280].includes(width)) await page.screenshot({ path: `test-results/redesign-public-${width}.png`, fullPage: true });
    }
  }
});

test('mobile filters, errors, feedback and focus are accessible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await page.getByRole('button', { name: /^Filter/ }).click();
  await expect(page.getByRole('dialog', { name: 'Weitere Filter' })).toBeVisible();
  await accessible(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Filter/ })).toBeFocused();
  await page.getByRole('link', { name: 'Barrierefreiheit', exact: true }).click();
  await expect(page.getByRole('main')).toBeFocused();
  await page.getByRole('link', { name: 'Barriere melden' }).click();
  await expect(page.getByLabel('Nachricht')).toContainText('Ich möchte eine Barriere melden.');
  await page.getByRole('button', { name: 'Nachricht senden' }).click();
  await expect(page.getByLabel(/^Name(?:\s+\(erforderlich\))?$/)).toBeFocused();
  await accessible(page);
  await page.emulateMedia({ forcedColors: 'active' });
  await fits(page);
  await page.emulateMedia({ forcedColors: 'none' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await accessible(page); await fits(page);
  await page.goto('/');
  await page.setViewportSize({ width: 844, height: 390 });
  await fits(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await accessible(page);
  await page.getByRole('button', { name: 'Kategorien wählen' }).click();
  await accessible(page);
});

test('provider editor, rich text, preview and account settings are accessible', async ({ page }) => {
  test.setTimeout(90000);
  await login(page, 'testverein');
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await accessible(page); await fits(page);
    await page.screenshot({ path: `test-results/redesign-provider-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByRole('button', { name: 'Menü öffnen' }).click();
  await accessible(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Menü öffnen' })).toBeFocused();
  await page.getByRole('button', { name: 'Freizeit anlegen', exact: true }).first().click();
  await accessible(page); await fits(page);
  await page.getByRole('textbox', { name: 'Beschreibung' }).fill('Eine gut zugängliche Freizeit.');
  await page.getByRole('button', { name: 'Link bearbeiten', exact: true }).click();
  await accessible(page);
  await page.keyboard.press('Escape');
  for (const name of [/2\. Termin/, /3\. Plätze/, /4\. Ort/, /5\. Bilder/]) {
    await page.getByRole('button', { name }).click(); await accessible(page); await fits(page);
  }
  await page.getByRole('button', { name: 'Vorschau', exact: true }).click();
  await accessible(page); await fits(page);
  await page.keyboard.press('Escape');
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/einstellungen');
  await accessible(page); await fits(page);
});

test('admin and reflow with increased text spacing are accessible', async ({ page }) => {
  test.setTimeout(90000);
  await login(page, 'admin');
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await accessible(page); await fits(page);
    await page.screenshot({ path: `test-results/redesign-admin-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addStyleTag({ content: 'body { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }' });
  await fits(page);
  await page.getByRole('button', { name: 'Demo: Waldcamp – demnächst bearbeiten' }).click();
  const editor = page.locator('form').filter({ has: page.getByRole('textbox', { name: 'Beschreibung' }) });
  await editor.getByRole('textbox', { name: 'Titel', exact: true }).fill('');
  await editor.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toBeFocused();
  await expect(editor.getByRole('textbox', { name: 'Titel', exact: true })).toHaveAttribute('aria-describedby', 'admin-error-title');
  await accessible(page); await fits(page);
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/einstellungen'); await accessible(page); await fits(page);
});
