import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// Reset only the disposable database, never application limits or real data.
export function resetPortalTestLimits() {
  execFileSync('php', [resolve('../backend/tests/portal-fixtures.php'), 'limits'], {
    env: { ...process.env, APP_ENV: 'development', DB_CONNECTION: 'sqlite', DB_SQLITE_PATH: process.env.PLAYWRIGHT_DB_SQLITE_PATH || '/tmp/ffp-portal-browser.sqlite', PORTAL_MAIL_INLINE: '0', SEED_DEMO_DATA: '1' },
  });
}
