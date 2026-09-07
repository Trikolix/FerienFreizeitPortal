import { defineConfig } from '@playwright/test';

const externalBase = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 30000,
  use: { baseURL: externalBase || 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  webServer: externalBase ? undefined : {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    env: { API_PROXY_TARGET: 'http://127.0.0.1:18080' },
  },
});
